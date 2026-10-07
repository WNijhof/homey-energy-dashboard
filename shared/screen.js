'use strict';

// Screen options for a tablet on the wall, per screen (kept in the browser): full screen,
// keeping the screen on, light or dark (or dark from sunset to sunrise), the house mood color
// behind the blocks, and a night mode that dims the page or turns it black (a tap wakes it
// for a minute). While the page is black it does not ask Homey for data. Pages that stay on
// for days move a pixel now and then, against burn-in.
// Edit this file in /shared and run `npm run sync`.

(function () {

  const KEY = 'energy-dashboard-screen';
  const WAKE_FOR = 60 * 1000;
  const defaults = { night: 'off', from: '23:00', to: '07:00', keepOn: false, motion: 'auto', pace: 'normal', theme: 'auto', mood: true };
  const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');

  let settings = { ...defaults };
  try { settings = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* storage unavailable */ }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
  };

  let overlay = null;
  let wokenUntil = 0;
  let wakeLock = null;
  let onWake = null;
  let place = null;

  const minutes = text => {
    const [h, m] = String(text).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  function isNight(now = new Date()) {
    if (settings.night === 'off') return false;
    const t = now.getHours() * 60 + now.getMinutes();
    const from = minutes(settings.from);
    const to = minutes(settings.to);
    return from > to ? t >= from || t < to : t >= from && t < to;
  }

  // True while the screen is black: the page then skips its updates
  const sleeping = () => settings.night === 'black' && isNight() && Date.now() > wokenUntil;

  // The moving flows show where power goes, so they move unless this screen turns motion off.
  // Decorative effects follow the system (Windows reports less motion when "Animation effects"
  // is off), unless this screen is set to always move.
  const flowsStill = () => settings.motion === 'off';
  const reducedMotion = () => settings.motion === 'off' || (settings.motion !== 'on' && systemReduced.matches);

  // How fast the flows move compared to normal; "crawl" is ten times slower
  const PACES = { fast: 2, normal: 1, slow: 0.4, crawl: 0.1 };
  const flowPace = () => PACES[settings.pace] || 1;

  function applyMotion() {
    document.documentElement.classList.toggle('motion-on', settings.motion === 'on');
    document.documentElement.classList.toggle('motion-off', settings.motion === 'off');
    window.dispatchEvent(new Event('energy-motion'));
  }

  // Height of the sun in degrees (a common approximation, good to a fraction of a degree)
  function sunHeight(lat, lon, date = new Date()) {
    const rad = Math.PI / 180;
    const d = (date.getTime() - 946728000000) / 86400000; // days since 1 January 2000, 12:00 UTC
    const g = (357.529 + 0.98560028 * d) * rad;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    const e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const hourAngle = (18.697374558 + 24.06570982441908 * d) * 15 * rad + lon * rad - ra;
    return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(hourAngle)) / rad;
  }

  // 'light', 'dark' or null to follow the system. "Follows the sun" is dark from sunset to
  // sunrise; without a known location it follows the system.
  function chosenTheme() {
    if (settings.theme === 'light' || settings.theme === 'dark') return settings.theme;
    if (settings.theme === 'sun' && place) return sunHeight(place.lat, place.lon) > -0.833 ? 'light' : 'dark';
    return null;
  }

  const themeColors = { light: '#f2f2f7', dark: '#000000' };
  function applyTheme() {
    const root = document.documentElement;
    const theme = chosenTheme();
    if ((root.dataset.theme || null) === theme) return;
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    // The browser bar on a phone takes the color of the page
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      if (!meta.dataset.system) meta.dataset.system = meta.content;
      meta.content = theme ? themeColors[theme] : meta.dataset.system;
    }
    window.dispatchEvent(new Event('energy-theme'));
  }

  function applyMood() {
    document.documentElement.classList.toggle('no-mood', !settings.mood);
  }

  // Where the Homey is, for "follows the sun"; sent along with the live data
  function setPlace(value) {
    const ok = value && typeof value.lat === 'number' && typeof value.lon === 'number';
    const next = ok ? { lat: value.lat, lon: value.lon } : null;
    if (JSON.stringify(next) === JSON.stringify(place)) return;
    place = next;
    applyTheme();
  }

  function update() {
    if (!overlay) return;
    const night = isNight() && Date.now() > wokenUntil;
    overlay.className = `night-overlay ${night ? settings.night : ''}`;
  }

  // Keeps the screen on, where the browser supports it; the lock is lost when the page hides
  async function applyKeepOn() {
    if (!settings.keepOn || !('wakeLock' in navigator) || document.hidden) {
      if (wakeLock && !settings.keepOn) { wakeLock.release().catch(() => {}); wakeLock = null; }
      return;
    }
    if (wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* not allowed right now */ }
  }

  // A pixel or two every few minutes, so static parts do not burn into the screen
  function shiftPixels() {
    const long = settings.keepOn || settings.night !== 'off';
    const x = long ? Math.round(Math.random() * 4 - 2) : 0;
    const y = long ? Math.round(Math.random() * 4 - 2) : 0;
    // Not the body itself: that would move the fixed tooltip and night overlay along
    for (const el of document.querySelectorAll('#blocks, .top > div:first-child')) {
      el.style.transform = x || y ? `translate(${x}px, ${y}px)` : '';
    }
  }

  function panelHtml() {
    const fullscreen = document.fullscreenEnabled
      ? '<button type="button" class="screen-row" data-action="fullscreen"><span>Volledig scherm</span><b>⛶</b></button>'
      : '';
    const keepOn = 'wakeLock' in navigator
      ? `<label class="screen-row"><span>Scherm aan houden</span><input type="checkbox" data-action="keepOn" ${settings.keepOn ? 'checked' : ''}></label>`
      : '';
    const option = (value, label) => `<option value="${value}" ${settings.night === value ? 'selected' : ''}>${label}</option>`;
    const themeOption = (value, label) => `<option value="${value}" ${settings.theme === value ? 'selected' : ''}>${label}</option>`;
    const exportLink = window.EnergyDashboard?.exportUrl
      ? `<a class="screen-row" href="${window.EnergyDashboard.exportUrl()}" download><span>Periode exporteren (CSV)</span><b>⤓</b></a>`
      : '';
    return `
      ${fullscreen}
      ${keepOn}
      ${exportLink}
      <label class="screen-row"><span>Licht of donker</span>
        <select data-action="theme">${themeOption('auto', 'Automatisch')}${themeOption('light', 'Licht')}${themeOption('dark', 'Donker')}${themeOption('sun', 'Volgt de zon')}</select>
      </label>
      <label class="screen-row"><span>Sfeerkleur achtergrond</span><input type="checkbox" data-action="mood" ${settings.mood ? 'checked' : ''}></label>
      <label class="screen-row"><span>Beweging</span>
        <select data-action="motion">
          <option value="auto" ${settings.motion === 'auto' ? 'selected' : ''}>Standaard</option>
          <option value="on" ${settings.motion === 'on' ? 'selected' : ''}>Alle effecten</option>
          <option value="off" ${settings.motion === 'off' ? 'selected' : ''}>Uit</option>
        </select>
      </label>
      <label class="screen-row" ${settings.motion === 'off' ? 'hidden' : ''}><span>Snelheid stromen</span>
        <select data-action="pace">
          <option value="fast" ${settings.pace === 'fast' ? 'selected' : ''}>Sneller</option>
          <option value="normal" ${settings.pace === 'normal' ? 'selected' : ''}>Standaard</option>
          <option value="slow" ${settings.pace === 'slow' ? 'selected' : ''}>Trager</option>
          <option value="crawl" ${settings.pace === 'crawl' ? 'selected' : ''}>Kruipend</option>
        </select>
      </label>
      <label class="screen-row"><span>Nachtstand</span>
        <select data-action="night">${option('off', 'Uit')}${option('dim', 'Dimmen')}${option('black', 'Zwart')}</select>
      </label>
      <label class="screen-row" ${settings.night === 'off' ? 'hidden' : ''}><span>Van – tot</span>
        <span class="screen-times"><input type="time" data-action="from" value="${settings.from}"> – <input type="time" data-action="to" value="${settings.to}"></span>
      </label>
      <p class="screen-note">Deze keuzes gelden alleen voor dit scherm.</p>`;
  }

  function addButton() {
    const actions = document.querySelector('.header-actions');
    if (!actions) return;
    const wrap = document.createElement('div');
    wrap.className = 'screen-menu';
    wrap.innerHTML = `
      <button class="icon-button" type="button" title="Scherm" aria-label="Scherm" aria-expanded="false">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>
      </button>
      <div class="screen-panel" hidden></div>`;
    const button = wrap.querySelector('button');
    const panel = wrap.querySelector('.screen-panel');
    const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (!panel.hidden) return close();
      panel.innerHTML = panelHtml();
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    });
    document.addEventListener('click', event => { if (!wrap.contains(event.target)) close(); });
    panel.addEventListener('click', event => {
      if (event.target.closest('[data-action="fullscreen"]')) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
        close();
      }
    });
    panel.addEventListener('change', event => {
      const action = event.target.dataset.action;
      if (action === 'keepOn') settings.keepOn = event.target.checked;
      if (action === 'night') settings.night = event.target.value;
      if (action === 'theme' || action === 'mood') {
        if (action === 'theme') settings.theme = event.target.value;
        else settings.mood = event.target.checked;
        save();
        applyTheme();
        applyMood();
        return;
      }
      if (action === 'motion' || action === 'pace') {
        settings[action] = event.target.value;
        save();
        if (action === 'motion') panel.innerHTML = panelHtml();
        applyMotion();
        return;
      }
      if (action === 'from' || action === 'to') settings[action] = event.target.value || defaults[action];
      save();
      if (action === 'night') panel.innerHTML = panelHtml();
      applyKeepOn();
      shiftPixels();
      update();
    });
    actions.insertBefore(wrap, actions.querySelector('#edit-toggle'));
  }

  function start({ wake } = {}) {
    onWake = wake;
    overlay = document.createElement('div');
    overlay.className = 'night-overlay';
    document.body.appendChild(overlay);
    // A tap on the black screen wakes it for a minute, and the page catches up
    overlay.addEventListener('click', () => {
      wokenUntil = Date.now() + WAKE_FOR;
      update();
      if (onWake) onWake();
    });
    addButton();
    applyMotion();
    applyTheme();
    applyMood();
    // Safari before 14 only knows addListener
    if (systemReduced.addEventListener) systemReduced.addEventListener('change', applyMotion);
    else if (systemReduced.addListener) systemReduced.addListener(applyMotion);
    update();
    applyKeepOn();
    shiftPixels();
    setInterval(() => {
      const wasSleeping = overlay.classList.contains('black');
      update();
      applyTheme();
      if (wasSleeping && !sleeping() && onWake) onWake();
    }, 30 * 1000);
    setInterval(shiftPixels, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', applyKeepOn);
  }

  window.EnergyScreen = { start, sleeping, reducedMotion, flowsStill, flowPace, setPlace };

})();
