"use strict";
(function() {
  const KEY = "energy-dashboard-screen";
  const WAKE_FOR = 60 * 1e3;
  const defaults = { night: "off", from: "23:00", to: "07:00", keepOn: false, motion: "auto", pace: "normal", theme: "auto", mood: true };
  const systemReduced = matchMedia("(prefers-reduced-motion: reduce)");
  let settings = { ...defaults };
  try {
    settings = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
    }
  };
  let overlay = null;
  let wokenUntil = 0;
  let wakeLock = null;
  let onWake = null;
  let place = null;
  const minutes = (text) => {
    const [h, m] = String(text).split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  function isNight(now = /* @__PURE__ */ new Date()) {
    if (settings.night === "off") return false;
    const t = now.getHours() * 60 + now.getMinutes();
    const from = minutes(settings.from);
    const to = minutes(settings.to);
    return from > to ? t >= from || t < to : t >= from && t < to;
  }
  const sleeping = () => settings.night === "black" && isNight() && Date.now() > wokenUntil;
  const flowsStill = () => settings.motion === "off";
  const reducedMotion = () => settings.motion === "off" || settings.motion !== "on" && systemReduced.matches;
  const PACES = { fast: 2, normal: 1, slow: 0.4, crawl: 0.1 };
  const flowPace = () => PACES[settings.pace] || 1;
  function applyMotion() {
    document.documentElement.classList.toggle("motion-on", settings.motion === "on");
    document.documentElement.classList.toggle("motion-off", settings.motion === "off");
    window.dispatchEvent(new Event("energy-motion"));
  }
  function sunHeight(lat, lon, date = /* @__PURE__ */ new Date()) {
    const rad = Math.PI / 180;
    const d = (date.getTime() - 946728e6) / 864e5;
    const g = (357.529 + 0.98560028 * d) * rad;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
    const e = (23.439 - 36e-8 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const hourAngle = (18.697374558 + 24.06570982441908 * d) * 15 * rad + lon * rad - ra;
    return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(hourAngle)) / rad;
  }
  function chosenTheme() {
    if (settings.theme === "light" || settings.theme === "dark") return settings.theme;
    if (settings.theme === "sun" && place) return sunHeight(place.lat, place.lon) > -0.833 ? "light" : "dark";
    return null;
  }
  const themeColors = { light: "#f2f2f7", dark: "#000000" };
  function applyTheme() {
    const root = document.documentElement;
    const theme = chosenTheme();
    if ((root.dataset.theme || null) === theme) return;
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      if (!meta.dataset.system) meta.dataset.system = meta.content;
      meta.content = theme ? themeColors[theme] : meta.dataset.system;
    }
    window.dispatchEvent(new Event("energy-theme"));
  }
  function applyMood() {
    document.documentElement.classList.toggle("no-mood", !settings.mood);
  }
  function setPlace(value) {
    const ok = value && typeof value.lat === "number" && typeof value.lon === "number";
    const next = ok ? { lat: value.lat, lon: value.lon } : null;
    if (JSON.stringify(next) === JSON.stringify(place)) return;
    place = next;
    applyTheme();
  }
  function update() {
    if (!overlay) return;
    const night = isNight() && Date.now() > wokenUntil;
    overlay.className = "night-overlay ".concat(night ? settings.night : "");
  }
  async function applyKeepOn() {
    if (!settings.keepOn || !("wakeLock" in navigator) || document.hidden) {
      if (wakeLock && !settings.keepOn) {
        wakeLock.release().catch(() => {
        });
        wakeLock = null;
      }
      return;
    }
    if (wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch {
    }
  }
  function shiftPixels() {
    const long = settings.keepOn || settings.night !== "off";
    const x = long ? Math.round(Math.random() * 4 - 2) : 0;
    const y = long ? Math.round(Math.random() * 4 - 2) : 0;
    for (const el of document.querySelectorAll("#blocks, .top > div:first-child")) {
      el.style.transform = x || y ? "translate(".concat(x, "px, ").concat(y, "px)") : "";
    }
  }
  function panelHtml() {
    var _a;
    const fullscreen = document.fullscreenEnabled ? '<button type="button" class="screen-row" data-action="fullscreen"><span>Volledig scherm</span><b>⛶</b></button>' : "";
    const keepOn = "wakeLock" in navigator ? '<label class="screen-row"><span>Scherm aan houden</span><input type="checkbox" data-action="keepOn" '.concat(settings.keepOn ? "checked" : "", "></label>") : "";
    const option = (value, label) => '<option value="'.concat(value, '" ').concat(settings.night === value ? "selected" : "", ">").concat(label, "</option>");
    const themeOption = (value, label) => '<option value="'.concat(value, '" ').concat(settings.theme === value ? "selected" : "", ">").concat(label, "</option>");
    const exportLink = ((_a = window.EnergyDashboard) == null ? void 0 : _a.exportUrl) ? '<a class="screen-row" href="'.concat(window.EnergyDashboard.exportUrl(), '" download><span>Periode exporteren (CSV)</span><b>⤓</b></a>') : "";
    return "\n      ".concat(fullscreen, "\n      ").concat(keepOn, "\n      ").concat(exportLink, '\n      <label class="screen-row"><span>Licht of donker</span>\n        <select data-action="theme">').concat(themeOption("auto", "Automatisch")).concat(themeOption("light", "Licht")).concat(themeOption("dark", "Donker")).concat(themeOption("sun", "Volgt de zon"), '</select>\n      </label>\n      <label class="screen-row"><span>Sfeerkleur achtergrond</span><input type="checkbox" data-action="mood" ').concat(settings.mood ? "checked" : "", '></label>\n      <label class="screen-row"><span>Beweging</span>\n        <select data-action="motion">\n          <option value="auto" ').concat(settings.motion === "auto" ? "selected" : "", '>Standaard</option>\n          <option value="on" ').concat(settings.motion === "on" ? "selected" : "", '>Alle effecten</option>\n          <option value="off" ').concat(settings.motion === "off" ? "selected" : "", '>Uit</option>\n        </select>\n      </label>\n      <label class="screen-row" ').concat(settings.motion === "off" ? "hidden" : "", '><span>Snelheid stromen</span>\n        <select data-action="pace">\n          <option value="fast" ').concat(settings.pace === "fast" ? "selected" : "", '>Sneller</option>\n          <option value="normal" ').concat(settings.pace === "normal" ? "selected" : "", '>Standaard</option>\n          <option value="slow" ').concat(settings.pace === "slow" ? "selected" : "", '>Trager</option>\n          <option value="crawl" ').concat(settings.pace === "crawl" ? "selected" : "", '>Kruipend</option>\n        </select>\n      </label>\n      <label class="screen-row"><span>Nachtstand</span>\n        <select data-action="night">').concat(option("off", "Uit")).concat(option("dim", "Dimmen")).concat(option("black", "Zwart"), '</select>\n      </label>\n      <label class="screen-row" ').concat(settings.night === "off" ? "hidden" : "", '><span>Van – tot</span>\n        <span class="screen-times"><input type="time" data-action="from" value="').concat(settings.from, '"> – <input type="time" data-action="to" value="').concat(settings.to, '"></span>\n      </label>\n      <p class="screen-note">Deze keuzes gelden alleen voor dit scherm.</p>');
  }
  function addButton() {
    const actions = document.querySelector(".header-actions");
    if (!actions) return;
    const wrap = document.createElement("div");
    wrap.className = "screen-menu";
    wrap.innerHTML = '\n      <button class="icon-button" type="button" title="Scherm" aria-label="Scherm" aria-expanded="false">\n        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>\n      </button>\n      <div class="screen-panel" hidden></div>';
    const button = wrap.querySelector("button");
    const panel = wrap.querySelector(".screen-panel");
    const close = () => {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    };
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!panel.hidden) return close();
      panel.innerHTML = panelHtml();
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
    });
    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target)) close();
    });
    panel.addEventListener("click", (event) => {
      if (event.target.closest('[data-action="fullscreen"]')) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {
        });
        else document.documentElement.requestFullscreen().catch(() => {
        });
        close();
      }
    });
    panel.addEventListener("change", (event) => {
      const action = event.target.dataset.action;
      if (action === "keepOn") settings.keepOn = event.target.checked;
      if (action === "night") settings.night = event.target.value;
      if (action === "theme" || action === "mood") {
        if (action === "theme") settings.theme = event.target.value;
        else settings.mood = event.target.checked;
        save();
        applyTheme();
        applyMood();
        return;
      }
      if (action === "motion" || action === "pace") {
        settings[action] = event.target.value;
        save();
        if (action === "motion") panel.innerHTML = panelHtml();
        applyMotion();
        return;
      }
      if (action === "from" || action === "to") settings[action] = event.target.value || defaults[action];
      save();
      if (action === "night") panel.innerHTML = panelHtml();
      applyKeepOn();
      shiftPixels();
      update();
    });
    actions.insertBefore(wrap, actions.querySelector("#edit-toggle"));
  }
  function start({ wake } = {}) {
    var _a;
    onWake = wake;
    overlay = document.createElement("div");
    overlay.className = "night-overlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", () => {
      wokenUntil = Date.now() + WAKE_FOR;
      update();
      if (onWake) onWake();
    });
    addButton();
    applyMotion();
    applyTheme();
    applyMood();
    (_a = systemReduced.addEventListener) == null ? void 0 : _a.call(systemReduced, "change", applyMotion);
    update();
    applyKeepOn();
    shiftPixels();
    setInterval(() => {
      const wasSleeping = overlay.classList.contains("black");
      update();
      applyTheme();
      if (wasSleeping && !sleeping() && onWake) onWake();
    }, 30 * 1e3);
    setInterval(shiftPixels, 5 * 60 * 1e3);
    document.addEventListener("visibilitychange", applyKeepOn);
  }
  window.EnergyScreen = { start, sleeping, reducedMotion, flowsStill, flowPace, setPlace };
})();
