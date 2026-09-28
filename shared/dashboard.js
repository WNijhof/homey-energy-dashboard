'use strict';

// Renderer for the dashboard page. The page is built from blocks (see the <template>s in
// index.html) in the order and sizes of the layout the server sends along with the live data.
// Every renderer is optional: it only draws when its elements are part of the layout.
// Edit this file in /shared and run `npm run sync` to copy it to all places that use it.

(function () {

  const LIVE_INTERVAL = 10 * 1000;
  const HISTORY_INTERVAL = 60 * 1000;
  const PERIOD_KEY = 'energy-dashboard-period';
  const SANKEY_MODE_KEY = 'energy-dashboard-sankey';

  const state = {
    period: 'today',
    live: null,
    history: null,
    options: {},
    layoutKey: null,
    editing: false,
    sankeyMode: 'live',
  };

  const $ = id => document.getElementById(id);
  const nf = (digits = 0) => new Intl.NumberFormat('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    grid: '<path d="M8 22 12 3l4 19"/><path d="M5 8h14M6.5 13h11M9.2 17h5.6"/>',
    export: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    import: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    flame: '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.8-2.6-6-4.2-8.7-.6 2-1.6 3-2.8 3.6.3-3.2-1.2-6.3-3.8-8.1.3 3.8-3.2 6.2-3.2 10.9C5 19.2 8 22 12 22z"/>',
    leaf: '<path d="M5 21c0-9 6-15 16-16-1 10-7 16-16 16z"/><path d="M5 21 14 12"/>',
    cycle: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    euro: '<path d="M18 7a6.5 6.5 0 1 0 0 10"/><path d="M4 10h9M4 14h9"/>',
    battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><path d="M11 9l-2 3h3l-2 3"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  };

  const icon = (name, size = 24) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

  const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const PERIOD_LABELS = { today: 'Vandaag', yesterday: 'Gisteren', week: 'Deze week', month: 'Deze maand' };
  const PREVIOUS_LABELS = { today: 'gisteren tot hetzelfde uur', week: 'vorige week tot dezelfde dag', month: 'vorige maand tot dezelfde dag' };

  function formatPower(watts) {
    if (typeof watts !== 'number') return '–';
    const abs = Math.abs(watts);
    return abs >= 1000 ? `${nf(abs >= 10000 ? 1 : 2).format(abs / 1000)} kW` : `${nf(0).format(abs)} W`;
  }

  function formatEnergy(kWh) {
    if (typeof kWh !== 'number') return '–';
    const digits = kWh >= 100 ? 0 : kWh >= 10 ? 1 : 2;
    return nf(digits).format(kWh);
  }

  function formatPercent(fraction) {
    return typeof fraction === 'number' ? nf(0).format(fraction * 100) : '–';
  }

  function fmtTemp(value) {
    return typeof value === 'number' ? `${nf(value % 1 ? 1 : 0).format(value)}°` : '–';
  }

  // Shows the "not found" text of a block, or its content
  function toggleEmpty(prefix, hasData) {
    const empty = $(`${prefix}-empty`);
    if (!empty) return;
    empty.hidden = hasData;
    empty.closest('section').querySelectorAll(`[data-${prefix}]`).forEach(el => { el.hidden = !hasData; });
  }

  // ---------- Layout ----------

  function applyLayout(layout) {
    const container = $('blocks');
    // While editing, the page shows the layout being edited, not the saved one
    if (!container || !Array.isArray(layout) || state.editing) return false;
    const key = JSON.stringify(layout);
    if (key === state.layoutKey) return false;
    state.layoutKey = key;

    charts.clear();
    container.innerHTML = '';
    for (const block of layout) {
      const element = createBlock(block);
      if (element) container.appendChild(element);
    }
    relayout();
    watchSizes();
    return true;
  }

  function createBlock({ id, size, rows }) {
    const template = $(`block-${id}`);
    if (!template) return null;
    const element = template.content.firstElementChild.cloneNode(true);
    element.classList.add('block', `size-${size}`);
    element.dataset.block = id;
    if (rows) element.dataset.rows = rows;
    // Charts keep their usual height when the block takes the height of its content
    element.querySelectorAll('[data-height]').forEach(chart => chart.style.setProperty('--basis', `${chart.dataset.height}px`));
    initSankeyMode(element);
    return element;
  }

  // ---------- Block heights ----------

  // The grid has rows of 8 px with a gap of 16 px, so each row a block spans adds 24 px
  const ROW = 24;
  const GAP = 16;
  const MIN_ROWS = 4;
  const MAX_ROWS = 80;
  const rowsFor = height => Math.ceil((height + GAP) / ROW);
  const heightOf = rows => rows * ROW - GAP;
  // On a phone the blocks are stacked, so they simply take the height of their content
  const wideScreen = () => matchMedia('(min-width: 640px)').matches;
  const fixedHeight = el => Boolean(el?.closest('.block')?.dataset.rows) && wideScreen();

  // Gives every block its number of rows: the chosen height, or the height of its content.
  // A block is never made smaller than its content can shrink to.
  function relayout() {
    const container = $('blocks');
    if (!container) return;
    container.classList.add('rows');
    const blocks = [...container.children].filter(el => el.classList.contains('block'));
    if (!blocks.length) return;

    container.classList.add('measuring');
    const natural = blocks.map(el => el.offsetHeight);
    container.classList.add('measuring-min');
    const smallest = blocks.map(el => el.offsetHeight);
    container.classList.remove('measuring', 'measuring-min');

    const wide = wideScreen();
    blocks.forEach((el, i) => {
      el.dataset.minRows = Math.max(MIN_ROWS, rowsFor(smallest[i]));
      const chosen = wide ? Number(el.dataset.rows) || 0 : 0;
      const rows = chosen ? Math.max(chosen, Number(el.dataset.minRows)) : rowsFor(natural[i]);
      const span = `span ${el.hidden ? 1 : rows}`;
      if (el.style.gridRowEnd !== span) el.style.gridRowEnd = span;
    });
  }

  // Charts are drawn for the size they get, so draw them again when a block changes size
  let redrawTimer;
  function redrawSoon() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(() => {
      charts.forEach(render => render());
      if (state.live) {
        renderFlow(state.live);
        renderBoiler(state.live.boiler);
      }
      relayout();
      changed();
    }, 120);
  }

  const sizeWatcher = typeof ResizeObserver === 'function' ? new ResizeObserver(redrawSoon) : null;
  function watchSizes() {
    if (!sizeWatcher) return;
    sizeWatcher.disconnect();
    document.querySelectorAll('#blocks .fill').forEach(el => sizeWatcher.observe(el));
  }

  function changed() {
    if (state.options.onRender) state.options.onRender();
  }

  // ---------- Status ----------

  function setStatus(kind, text) {
    const el = $('status');
    if (!el) return;
    el.className = `status ${kind}`;
    el.querySelector('span').textContent = text;
  }

  function setBanner(kind, html) {
    const el = $('banner');
    if (!el) return;
    el.hidden = !html;
    el.className = `banner ${kind}`;
    el.innerHTML = html || '';
  }

  // ---------- Live flow ----------

  function flowDots(pathId, watts, color, radius = 4.5) {
    if (!(watts > 5)) return '';
    const duration = Math.max(0.9, 4.2 - Math.log10(watts) * 0.9);
    const dots = watts > 2000 ? 4 : watts > 500 ? 3 : 2;
    let out = '';
    for (let i = 0; i < dots; i++) {
      out += `<circle r="${radius}" fill="${color}"><animateMotion dur="${duration.toFixed(2)}s" begin="-${(duration / dots * i).toFixed(2)}s" repeatCount="indefinite"><mpath href="#${pathId}"/></animateMotion></circle>`;
    }
    return out;
  }

  // A circle in the live diagram; `total` is an extra line with today's energy under the label
  function node({ x, y, color, iconName, label, labelAbove, value, sub, ring, total }) {
    const r = 44;
    const labelY = labelAbove ? -(r + (total ? 22 : 8)) : r + 18;
    const totalY = labelAbove ? -(r + 8) : r + 32;
    return `
      <g transform="translate(${x} ${y})">
        <circle r="${r}" class="node-ring" stroke="${ring ? 'transparent' : color}"/>
        ${ring || ''}
        <g transform="translate(-11 -30)" style="color:${color}">${icon(iconName, 22)}</g>
        <text class="node-value" y="11">${value}</text>
        ${sub ? `<text class="node-sub" y="27">${sub}</text>` : ''}
        <text class="node-label" y="${labelY}">${label}</text>
        ${total ? `<text class="node-total" y="${totalY}">${total}</text>` : ''}
      </g>`;
  }

  // Ring around the home node, split into the share of each source
  function homeRing(parts) {
    const r = 44;
    const c = 2 * Math.PI * r;
    const total = parts.reduce((sum, p) => sum + p.value, 0);
    if (total <= 0) return `<circle r="${r}" fill="none" stroke="${css('--home')}" stroke-width="3"/>`;
    let offset = 0;
    return parts.filter(p => p.value > 0).map(p => {
      const length = c * p.value / total;
      const arc = `<circle r="${r}" fill="none" stroke="${p.color}" stroke-width="3" stroke-dasharray="${length} ${c}" stroke-dashoffset="${-offset}" transform="rotate(-90)"/>`;
      offset += length;
      return arc;
    }).join('');
  }

  function renderFlow(live) {
    const el = $('flow');
    if (!el) return;
    const hasSolar = typeof live.solarW === 'number';
    const hasBattery = Boolean(live.battery);
    const grid = live.gridW ?? 0;
    const solar = live.solarW ?? 0;
    const home = live.homeW ?? 0;
    const f = live.flows || {};

    const colors = {
      solar: css('--solar'), grid: css('--grid'), home: css('--home'), export: css('--export'), battery: css('--battery'),
    };
    const line = (id, d, on, color, hidden) =>
      `<path id="${id}" class="flow-line" ${hidden ? 'style="stroke:none"' : ''} ${on ? `stroke="${color}" stroke-opacity="0.35"` : ''} d="${d}"/>`;

    // Today's totals take one extra line of text under (or above) each circle
    const today = live.today;
    const extra = today ? 14 : 0;
    const top = hasSolar ? 24 + extra : 0;
    const y = hasSolar ? 244 + extra : 60;
    const H = (hasSolar ? 314 : 170) + extra * (hasSolar ? 2 : 1) + (hasBattery ? 150 : 0);
    const by = y + 150;

    const kWh = v => `${formatEnergy(v || 0)} kWh`;
    const totals = today ? {
      solar: kWh(today.solar),
      grid: hasSolar || today.export > 0
        ? `af ${formatEnergy(today.import)} · terug ${formatEnergy(today.export)} kWh`
        : kWh(today.import),
      home: kWh(today.consumption),
      battery: `in ${formatEnergy(today.charge)} · uit ${formatEnergy(today.discharge)} kWh`,
    } : {};

    const gridSub = grid < -5 ? 'terug' : grid > 5 ? 'afname' : '';
    const batteryW = hasBattery ? live.battery.watts : 0;
    const batterySub = batteryW > 5 ? 'laden' : batteryW < -5 ? 'ontladen' : '';
    const soc = hasBattery && typeof live.battery.soc === 'number' ? ` ${nf(0).format(live.battery.soc)}%` : '';

    // Height of the diagram when the block takes the height of its content
    el.style.setProperty('--basis', `${Math.round(Math.min(480, (el.clientWidth || 420) * H / 420))}px`);
    el.innerHTML = `
      <svg viewBox="0 0 420 ${H}" role="img" aria-label="Actuele energiestroom">
        ${line('p-grid-home', `M 116 ${y} L 304 ${y}`, f.gridToHome > 5, colors.grid)}
        ${hasSolar ? `
          ${line('p-solar-home', `M 238 ${92 + top} C 262 ${140 + top} 280 ${160 + top} 306 ${186 + top}`, f.solarToHome > 5, colors.solar)}
          ${line('p-solar-grid', `M 182 ${92 + top} C 158 ${140 + top} 140 ${160 + top} 114 ${186 + top}`, f.solarToGrid > 5, colors.export)}
        ` : ''}
        ${hasBattery ? `
          ${line('p-battery-home', `M 238 ${by - 34} C 262 ${by - 82} 280 ${by - 102} 306 ${y + 34}`, f.batteryToHome > 5, colors.battery)}
          ${line('p-grid-battery', `M 114 ${y + 34} C 140 ${by - 102} 158 ${by - 82} 182 ${by - 34}`, f.gridToBattery > 5 || f.batteryToGrid > 5, f.gridToBattery > 5 ? colors.grid : colors.export)}
          ${line('p-battery-grid', `M 182 ${by - 34} C 158 ${by - 82} 140 ${by - 102} 114 ${y + 34}`, false, '', true)}
          ${hasSolar ? line('p-solar-battery', `M 210 ${100 + top} L 210 ${by - 44}`, f.solarToBattery > 5, colors.battery) : ''}
        ` : ''}
        ${flowDots('p-grid-home', f.gridToHome, colors.grid)}
        ${hasSolar ? flowDots('p-solar-home', f.solarToHome, colors.solar) : ''}
        ${hasSolar ? flowDots('p-solar-grid', f.solarToGrid, colors.export) : ''}
        ${hasBattery ? flowDots('p-battery-home', f.batteryToHome, colors.battery) : ''}
        ${hasBattery ? flowDots('p-grid-battery', f.gridToBattery, colors.grid) : ''}
        ${hasBattery ? flowDots('p-battery-grid', f.batteryToGrid, colors.export) : ''}
        ${hasBattery && hasSolar ? flowDots('p-solar-battery', f.solarToBattery, colors.solar) : ''}
        ${hasSolar ? node({ x: 210, y: 56 + top, color: colors.solar, iconName: 'sun', label: 'Zon', labelAbove: true, value: formatPower(solar), total: totals.solar }) : ''}
        ${node({ x: 70, y, color: grid < -5 ? colors.export : colors.grid, iconName: 'grid', label: 'Net', value: formatPower(grid), sub: gridSub, total: totals.grid })}
        ${node({
          x: 350, y, color: colors.home, iconName: 'home', label: 'Huis', value: formatPower(home), total: totals.home,
          ring: homeRing([
            { value: f.solarToHome || 0, color: colors.solar },
            { value: f.batteryToHome || 0, color: colors.battery },
            { value: f.gridToHome || 0, color: colors.grid },
          ]),
        })}
        ${hasBattery ? node({ x: 210, y: by, color: colors.battery, iconName: 'battery', label: `Batterij${soc}`, value: formatPower(batteryW), sub: batterySub, total: totals.battery }) : ''}
      </svg>`;

    const updated = $('live-updated');
    if (updated) {
      const time = new Date(live.updated).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      updated.textContent = today ? `kWh = vandaag · ${time}` : `bijgewerkt ${time}`;
    }
  }

  // ---------- Boiler ----------

  const BOILER_STATES = {
    warm: { label: 'Warm', color: '--hot' },
    lukewarm: { label: 'Lauw', color: '--warm' },
    cold: { label: 'Koud', color: '--cold' },
    unknown: { label: 'Onbekend', color: '--muted' },
  };

  function renderGauge(temperature, status) {
    const el = $('boiler-gauge');
    if (!el) return;
    const min = 20;
    const max = 75;
    const r = 62;
    const c = 2 * Math.PI * r;
    const arc = c * 270 / 360;
    const fraction = typeof temperature === 'number' ? Math.min(1, Math.max(0, (temperature - min) / (max - min))) : 0;
    const info = BOILER_STATES[status] || BOILER_STATES.unknown;

    el.innerHTML = `
      <svg viewBox="0 0 150 150" role="img" aria-label="Watertemperatuur">
        <defs>
          <linearGradient id="temp-gradient" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="${css('--cold')}"/>
            <stop offset="0.55" stop-color="${css('--warm')}"/>
            <stop offset="1" stop-color="${css('--hot')}"/>
          </linearGradient>
        </defs>
        <g transform="translate(75 75) rotate(135)">
          <circle r="${r}" fill="none" stroke="${css('--track')}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${arc} ${c}"/>
          <circle r="${r}" fill="none" stroke="url(#temp-gradient)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${Math.max(0.01, arc * fraction)} ${c}"/>
        </g>
        <text class="temp" x="75" y="80">${typeof temperature === 'number' ? `${nf(temperature % 1 ? 1 : 0).format(temperature)}°` : '–'}</text>
        <text class="state" x="75" y="102" fill="${css(info.color)}">${info.label}</text>
      </svg>`;
  }

  function renderBoilerHistory(points, assumptions) {
    const el = $('boiler-history');
    if (!el) return;
    if (!points?.length || !['today', 'yesterday'].includes(state.period)) {
      el.innerHTML = '';
      return;
    }
    const width = el.clientWidth || 300;
    const height = chartHeight(el, 70);
    const start = new Date(points[0].t);
    start.setHours(0, 0, 0, 0);
    const span = 24 * 3600 * 1000;
    const values = points.map(p => p.v);
    const lo = Math.min(assumptions.showerTemp - 5, ...values);
    const hi = Math.max(assumptions.warmFrom + 5, ...values);
    const x = t => (new Date(t) - start) / span * width;
    const y = v => 6 + (1 - (v - lo) / (hi - lo)) * (height - 20);

    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points[points.length - 1].t).toFixed(1)} ${height - 14} L${x(points[0].t).toFixed(1)} ${height - 14} Z`;
    const showerY = y(assumptions.showerTemp);

    el.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Boilertemperatuur">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${css('--hot')}" stop-opacity="0.28"/>
            <stop offset="1" stop-color="${css('--hot')}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="0" x2="${width}" y1="${showerY}" y2="${showerY}" stroke="${css('--cold')}" stroke-dasharray="3 4" stroke-opacity="0.6"/>
        <text x="${width - 2}" y="${showerY - 4}" text-anchor="end" font-size="10" fill="${css('--muted')}">${assumptions.showerTemp}°</text>
        <path d="${area}" fill="url(#spark-fill)"/>
        <path d="${line}" fill="none" stroke="${css('--hot')}" stroke-width="2" stroke-linejoin="round"/>
        ${[0, 6, 12, 18, 24].map(h => `<text x="${Math.min(width - 12, Math.max(0, h / 24 * width))}" y="${height - 2}" font-size="10" fill="${css('--muted')}">${String(h).padStart(2, '0')}</text>`).join('')}
      </svg>`;
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function renderBoiler(boiler) {
    const card = $('boiler-card');
    if (!card) return;
    const empty = $('boiler-empty');
    card.hidden = !boiler && !empty;
    if (empty) {
      empty.hidden = !!boiler;
      card.querySelectorAll('[data-boiler]').forEach(el => { el.hidden = !boiler; });
    }
    if (!boiler) return;

    setText('boiler-name', boiler.name || 'Boiler');
    setText('boiler-mode', boiler.available ? (boiler.on === false ? 'Uit' : boiler.mode || '') : 'Niet beschikbaar');
    renderGauge(boiler.temperature, boiler.status);

    setText('shower-minutes', typeof boiler.minutes === 'number' ? `± ${boiler.minutes}` : '–');
    setText('boiler-showers', typeof boiler.showers === 'number' ? boiler.showers : '–');
    const showersRow = $('boiler-showers-row');
    if (showersRow) showersRow.hidden = typeof boiler.showers !== 'number';
    const heatingRow = $('boiler-heating-row');
    if (heatingRow) heatingRow.hidden = typeof boiler.heating !== 'boolean';
    setText('boiler-target', typeof boiler.target === 'number' ? `${boiler.target} °C` : '–');
    const heating = $('boiler-heating');
    if (heating) heating.innerHTML = boiler.heating ? '<span class="heating-dot"></span>Ja' : 'Nee';

    const a = boiler.assumptions;
    setText('boiler-note', `Doucheminuten zijn een schatting: ${a.liters} L boiler, douchen op ${a.showerTemp} °C met ${a.showerFlow} L/min.`);
    renderBoilerHistory(state.history?.boilerTemperature, a);
  }

  // ---------- Heating ----------

  function renderHeating(heating) {
    if (!$('room-temp')) return;
    toggleEmpty('heating', Boolean(heating));
    if (!heating) return;

    const t = heating.thermostat;
    $('room-temp').innerHTML = t
      ? `<span class="big-number">${fmtTemp(t.temperature)}</span>
         <span class="big-unit">${escapeHtml(t.name)}${typeof t.target === 'number' ? ` · ingesteld ${fmtTemp(t.target)}` : ''}</span>`
      : '';

    const mode = heating.devices.find(d => d.mode)?.mode || t?.mode || '';
    setText('heating-mode', mode);

    const history = state.history;
    const period = (PERIOD_LABELS[state.period] || '').toLowerCase();
    const facts = heating.devices.map(d => `
      <li><span>${escapeHtml(d.name)}</span><strong>${formatPower(d.watts)}</strong></li>`);
    if (history?.available?.heating) {
      facts.push(`<li><span>Stroom ${period}</span><strong>${formatEnergy(history.totals.heating)} kWh</strong></li>`);
    }
    if (history?.available?.gas) {
      facts.push(`<li><span>Gas ${period} (hele huis)</span><strong>${nf(2).format(history.totals.gas)} m³</strong></li>`);
    }
    $('heating-facts').innerHTML = facts.join('');
  }

  // ---------- EV charger ----------

  function renderEv(ev) {
    if (!$('ev-power')) return;
    toggleEmpty('ev', Boolean(ev));
    if (!ev) return;

    const chargers = ev.chargers;
    const watts = chargers.reduce((sum, c) => sum + (c.watts || 0), 0);
    const charging = chargers.some(c => c.charging);
    setText('ev-name', chargers.length === 1 ? chargers[0].name : 'Laadpalen');
    setText('ev-state', chargers.length === 1 ? chargers[0].state || '' : (charging ? 'Laden' : ''));
    setText('ev-power', formatPower(watts));
    setText('ev-power-label', charging ? 'aan het laden' : 'vermogen');

    const history = state.history;
    const period = (PERIOD_LABELS[state.period] || '').toLowerCase();
    const facts = [];
    if (history?.available?.ev) {
      facts.push(`<li><span>Geladen ${period}</span><strong>${formatEnergy(history.totals.ev)} kWh</strong></li>`);
    }
    const soc = ev.car?.soc ?? chargers.find(c => typeof c.soc === 'number')?.soc;
    if (typeof soc === 'number') {
      facts.push(`<li><span>Accu ${escapeHtml(ev.car?.name || 'auto')}</span><strong>${nf(0).format(soc)}%</strong></li>`);
    }
    if (chargers.length > 1) {
      chargers.forEach(c => facts.push(`<li><span>${escapeHtml(c.name)}</span><strong>${formatPower(c.watts)}</strong></li>`));
    }
    $('ev-facts').innerHTML = facts.join('');
  }

  // ---------- Tiles ----------

  // Arrow with the change compared to the previous period; green when the change is good
  function deltaBadge(current, previous, lowerIsBetter) {
    if (typeof previous !== 'number' || typeof current !== 'number' || previous <= 0.01) return '';
    const change = (current - previous) / previous;
    if (Math.abs(change) < 0.005) return '<span class="delta">= gelijk</span>';
    const good = lowerIsBetter ? change < 0 : change > 0;
    return `<span class="delta ${good ? 'good' : 'bad'}" title="t.o.v. ${escapeHtml(PREVIOUS_LABELS[state.period] || 'vorige periode')}">${change > 0 ? '▲' : '▼'} ${nf(0).format(Math.abs(change) * 100)}%</span>`;
  }

  function tile({ iconName, color, label, value, unit, bar, delta = '' }) {
    return `
      <div class="tile">
        <div class="tile-head"><span class="tile-icon" style="background:${color}">${icon(iconName, 16)}</span><span class="tile-label">${label}</span></div>
        <div class="tile-value">${value}<small>${unit}</small>${delta}</div>
        ${typeof bar === 'number' ? `<div class="bar"><i style="width:${Math.round(bar * 100)}%;background:${color}"></i></div>` : ''}
      </div>`;
  }

  function renderTiles(history) {
    const el = $('tiles');
    if (!el) return;
    const t = history.totals;
    const compact = el.dataset.compact !== undefined;
    const available = history.available || {};
    const hasSolar = available.solar !== false;
    const p = history.previous || {};
    const tiles = [
      { iconName: 'home', color: 'var(--home)', label: 'Verbruik', value: formatEnergy(t.consumption), unit: 'kWh', delta: deltaBadge(t.consumption, p.consumption, true) },
      { iconName: 'import', color: 'var(--grid)', label: compact ? 'Net' : 'Van het net', value: formatEnergy(t.import), unit: 'kWh', delta: deltaBadge(t.import, p.import, true) },
    ];
    if (hasSolar) {
      tiles.push(
        { iconName: 'sun', color: 'var(--solar)', label: compact ? 'Zon' : 'Zon opgewekt', value: formatEnergy(t.solar), unit: 'kWh', delta: deltaBadge(t.solar, p.solar, false) },
        { iconName: 'export', color: 'var(--export)', label: compact ? 'Terug' : 'Teruggeleverd', value: formatEnergy(t.export), unit: 'kWh' },
      );
    }
    if (available.gas !== false) {
      tiles.push({ iconName: 'flame', color: 'var(--gas)', label: 'Gas', value: nf(t.gas >= 10 ? 1 : 2).format(t.gas), unit: 'm³', delta: deltaBadge(t.gas, p.gas, true) });
    }
    if (available.water) {
      tiles.push({ iconName: 'drop', color: 'var(--water)', label: 'Water', value: nf(0).format(t.water), unit: 'L', delta: deltaBadge(t.water, p.water, true) });
    }
    if (hasSolar || history.hasBattery) {
      tiles.push({ iconName: 'leaf', color: 'var(--home)', label: compact ? 'Zelf' : 'Zelfvoorzienend', value: formatPercent(t.selfSufficiency), unit: '%', bar: t.selfSufficiency ?? 0 });
    }
    if (history.hasBattery) {
      tiles.push(
        { iconName: 'battery', color: 'var(--battery)', label: compact ? 'Geladen' : 'Batterij geladen', value: formatEnergy(t.charge), unit: 'kWh' },
        { iconName: 'battery', color: 'var(--battery)', label: compact ? 'Ontladen' : 'Batterij ontladen', value: formatEnergy(t.discharge), unit: 'kWh' },
      );
    }
    if (!compact && hasSolar) {
      tiles.push({ iconName: 'cycle', color: 'var(--solar)', label: 'Eigen zon gebruikt', value: formatPercent(t.selfConsumption), unit: '%', bar: t.selfConsumption ?? 0 });
    }
    if (!compact) {
      if (typeof t.cost === 'number') {
        tiles.push({ iconName: 'euro', color: 'var(--accent)', label: 'Kosten', value: `€ ${nf(2).format(t.cost)}`, unit: '', delta: deltaBadge(t.cost, p.cost, true) });
      }
    }
    el.innerHTML = tiles.map(tile).join('');
  }

  // ---------- Bar charts ----------

  function niceStep(range, ticks) {
    const raw = range / ticks;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const normalized = raw / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }

  function bucketTitle(row, bucket) {
    const start = new Date(row.start);
    if (bucket === 'hour') {
      const end = new Date(start.getTime() + 3600000);
      const hm = d => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      return `${hm(start)} – ${hm(end)}`;
    }
    return start.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  const charts = new Map();

  // A chart fills the height its block gives it; outside the block grid it has a fixed height
  function chartHeight(el, fallback) {
    return el.closest('#blocks.rows') && el.clientHeight >= 40 ? el.clientHeight : fallback;
  }

  function renderBars(elId, rows, opts) {
    const el = $(elId);
    if (!el) return;
    const { positive, negative = [], unit, digits = 2, bucket } = opts;
    charts.set(elId, () => renderBars(elId, rows, opts));

    const sumOf = (row, series) => series.reduce((s, x) => s + (row[x.key] || 0), 0);
    const maxPos = Math.max(0, ...rows.map(r => sumOf(r, positive)));
    const maxNeg = Math.max(0, ...rows.map(r => sumOf(r, negative)));
    if (maxPos === 0 && maxNeg === 0) {
      el.innerHTML = '<div class="empty">Nog geen gegevens voor deze periode</div>';
      return;
    }

    const width = el.clientWidth || 600;
    const height = chartHeight(el, Number(el.dataset.height) || 220);
    const pad = { left: 34, right: 4, top: 8, bottom: 20 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const step = niceStep(maxPos + maxNeg, height < 180 ? 3 : 4);
    const top = Math.ceil(maxPos / step) * step;
    const bottom = Math.ceil(maxNeg / step) * step;
    const scale = plotH / (top + bottom);
    const zeroY = pad.top + top * scale;

    const band = plotW / rows.length;
    const barW = Math.max(2, Math.min(28, band * 0.64));
    const labelEvery = Math.ceil(rows.length * 26 / plotW);
    const tickDigits = step < 0.1 ? 2 : step < 1 ? 1 : 0;

    let axis = '';
    for (let v = -bottom; v <= top + 1e-9; v += step) {
      const yPos = zeroY - v * scale;
      axis += `<line x1="${pad.left}" x2="${width - pad.right}" y1="${yPos}" y2="${yPos}" class="${Math.abs(v) < 1e-9 ? 'zero' : ''}"/>`;
      axis += `<text x="${pad.left - 6}" y="${yPos + 4}" text-anchor="end">${nf(tickDigits).format(Math.abs(v))}</text>`;
    }

    let bars = '';
    rows.forEach((row, i) => {
      const x = pad.left + band * i + (band - barW) / 2;
      let yUp = zeroY;
      positive.forEach((series, s) => {
        const h = (row[series.key] || 0) * scale;
        if (h <= 0) return;
        const isTop = positive.slice(s + 1).every(next => !(row[next.key] > 0));
        yUp -= h;
        bars += `<rect x="${x}" y="${yUp}" width="${barW}" height="${h}" rx="${isTop ? Math.min(4, barW / 3) : 0}" fill="${series.color}"/>`;
      });
      let yDown = zeroY;
      negative.forEach(series => {
        const h = (row[series.key] || 0) * scale;
        if (h <= 0) return;
        bars += `<rect x="${x}" y="${yDown}" width="${barW}" height="${h}" rx="${Math.min(4, barW / 3)}" fill="${series.color}" fill-opacity="0.85"/>`;
        yDown += h;
      });
      if (i % labelEvery === 0) {
        axis += `<text x="${pad.left + band * i + band / 2}" y="${height - 4}" text-anchor="middle">${row.label}</text>`;
      }
      bars += `<rect class="hit" data-i="${i}" x="${pad.left + band * i}" y="${pad.top}" width="${band}" height="${plotH}" rx="4"/>`;
    });

    el.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
        <g class="axis">${axis}</g>
        ${bars}
      </svg>`;

    const tooltip = $('tooltip');
    if (!tooltip) return;
    el.onpointermove = event => {
      const hit = event.target.closest('.hit');
      if (!hit) { tooltip.hidden = true; return; }
      const row = rows[Number(hit.dataset.i)];
      const lines = [...positive, ...negative]
        .map(s => `<div><span><i style="background:${s.color}"></i>${s.label}</span><strong>${nf(digits).format(row[s.key] || 0)} ${unit}</strong></div>`)
        .join('');
      tooltip.innerHTML = `<b>${bucketTitle(row, bucket)}</b>${lines}`;
      tooltip.hidden = false;
      const box = tooltip.getBoundingClientRect();
      const left = Math.min(window.innerWidth - box.width - 8, event.clientX + 14);
      const topPos = event.clientY - box.height - 12 < 8 ? event.clientY + 16 : event.clientY - box.height - 12;
      tooltip.style.left = `${Math.max(8, left)}px`;
      tooltip.style.top = `${topPos}px`;
    };
    el.onpointerleave = () => { tooltip.hidden = true; };
  }

  function renderLegend(series) {
    const el = $('electricity-legend');
    if (!el) return;
    el.innerHTML = series.map(x => `<span><i style="background:${x.color}"></i>${x.label}</span>`).join('');
  }

  function renderCharts(history) {
    const { rows, bucket, totals, hasBattery } = history;
    // Above zero: where the house got its energy. Below zero: where solar or battery energy went.
    const positive = [
      { key: 'gridToHome', label: 'Van het net', color: css('--grid') },
      { key: 'solarToHome', label: 'Zon direct', color: css('--solar') },
    ];
    const negative = [{ key: 'export', label: 'Teruggeleverd', color: css('--export') }];
    if (hasBattery) {
      positive.push({ key: 'batteryToHome', label: 'Uit batterij', color: css('--battery') });
      negative.push({ key: 'charge', label: 'Batterij geladen', color: css('--battery-in') });
    }
    renderLegend([...positive, ...negative]);
    renderBars('electricity-chart', rows, { positive, negative, unit: 'kWh', bucket });
    renderBars('solar-chart', rows, {
      positive: [{ key: 'solar', label: 'Opgewekt', color: css('--solar') }],
      unit: 'kWh',
      bucket,
    });
    renderBars('gas-chart', rows, {
      positive: [{ key: 'gas', label: 'Gas', color: css('--gas') }],
      unit: 'm³',
      digits: 3,
      bucket,
    });
    renderBars('heating-chart', rows, {
      positive: [{ key: 'heating', label: 'Stroom verwarming', color: css('--heating') }],
      unit: 'kWh',
      bucket,
    });
    renderBars('ev-chart', rows, {
      positive: [{ key: 'ev', label: 'Geladen', color: css('--ev') }],
      unit: 'kWh',
      bucket,
    });
    renderBars('water-chart', rows, {
      positive: [{ key: 'water', label: 'Water', color: css('--water') }],
      unit: 'L',
      digits: 0,
      bucket,
    });
    renderSankeyBlock();
    setText('solar-total', `${formatEnergy(totals.solar)} kWh`);
    setText('gas-total', `${nf(2).format(totals.gas)} m³`);
    setText('period-label', PERIOD_LABELS[state.period] || '');
  }

  // ---------- Sankey ----------

  const DEVICE_COLORS = ['#5e8cff', '#ff9f0a', '#30b0c7', '#ff6482', '#a55eea', '#34c759', '#e6b800', '#64d2ff', '#bf5af2', '#ff453a', '#ac8e68', '#8e8e93'];

  function sankeyColor(node, deviceIndex) {
    switch (node.kind) {
      case 'solar': return css('--solar');
      case 'grid': return css('--grid');
      case 'battery': return css('--battery');
      case 'home': return css('--home');
      case 'export': return css('--export');
      case 'untracked': return css('--muted');
      default: return DEVICE_COLORS[deviceIndex % DEVICE_COLORS.length];
    }
  }

  function shorten(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  // Live shows the power right now, Periode the energy of the chosen period
  function initSankeyMode(block) {
    const nav = block.querySelector('#sankey-mode');
    if (!nav) return;
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.sankeyMode));
    nav.addEventListener('click', event => {
      const mode = event.target.closest('button[data-mode]')?.dataset.mode;
      if (!mode || mode === state.sankeyMode) return;
      state.sankeyMode = mode;
      try { localStorage.setItem(SANKEY_MODE_KEY, mode); } catch { /* storage unavailable */ }
      nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      renderSankeyBlock();
      relayout();
    });
  }

  function renderSankeyBlock() {
    if (!$('sankey')) return;
    const live = state.sankeyMode === 'live';
    renderSankey(live ? state.live?.sankey : state.history?.sankey, live);
  }

  // Positions of the nodes, for a height budget of the fullest column
  function layoutSankey(data, width, narrow, baseHeight) {
    const nodeW = 12;
    const gap = narrow ? 8 : 10;
    const minSlot = narrow ? 15 : 17;
    const labelLeft = narrow ? 78 : 120;
    const labelRight = narrow ? 118 : 190;

    const nodes = data.nodes.map(n => ({ ...n, in: 0, out: 0 }));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const links = data.links.filter(l => byId.has(l.source) && byId.has(l.target)).map(l => ({ ...l }));
    for (const l of links) {
      byId.get(l.source).out += l.value;
      byId.get(l.target).in += l.value;
    }
    nodes.forEach(n => { n.value = Math.max(n.in, n.out); });

    let deviceIndex = 0;
    nodes.forEach(n => { n.color = sankeyColor(n, n.kind === 'device' ? deviceIndex++ : 0); });

    const columns = [0, 1, 2].map(c => nodes.filter(n => n.column === c));
    const columnX = [labelLeft, Math.round((labelLeft + width - labelRight - nodeW) / 2), width - labelRight - nodeW];

    // One scale for all columns, so a kWh is equally thick everywhere
    const scale = Math.min(...columns.filter(c => c.length).map(col => {
      const total = col.reduce((sum, n) => sum + n.value, 0);
      return Math.max(1, baseHeight - gap * (col.length - 1)) / total;
    }));

    let height = 0;
    columns.forEach((col, c) => {
      let y = 0;
      col.forEach(n => {
        n.x = columnX[c];
        n.h = Math.max(2, n.value * scale);
        n.y = y;
        y += Math.max(n.h, minSlot) + gap;
      });
      height = Math.max(height, y - gap);
    });
    // Center shorter columns
    columns.forEach(col => {
      if (!col.length) return;
      const last = col[col.length - 1];
      const used = last.y + Math.max(last.h, minSlot);
      const shift = (height - used) / 2;
      col.forEach(n => { n.y += shift; });
    });
    return { nodes, byId, links, scale, height, nodeW };
  }

  // Three columns like Home Assistant's energy Sankey: sources → house (and export/battery) → consumers.
  // Live, the values are watts and dots run along the links like in the "Nu" diagram.
  function renderSankey(data, live = false) {
    const el = $('sankey');
    if (!el) return;
    setText('sankey-period', live ? 'nu · W' : `${PERIOD_LABELS[state.period] || ''} · kWh`);
    charts.set('sankey', renderSankeyBlock);
    if (!data?.links?.length) {
      el.style.removeProperty('--basis');
      el.innerHTML = `<div class="empty">${live ? 'Nu geen energiestroom gemeten' : 'Nog geen gegevens voor deze periode'}</div>`;
      return;
    }
    const format = live ? formatPower : v => `${formatEnergy(v)} kWh`;
    const formatShort = live ? formatPower : formatEnergy;

    // Below this width the labels collide, so the chart scrolls sideways within its card instead
    const width = Math.max(el.clientWidth || 600, 600);
    const narrow = width < 700;
    const defaultBase = narrow ? 260 : 320;

    // Its usual height when the block takes the height of its content, otherwise it fills the block
    let layout = layoutSankey(data, width, narrow, defaultBase);
    el.style.setProperty('--basis', `${Math.ceil(layout.height + 8)}px`);
    const scrollbar = el.scrollWidth > el.clientWidth ? 14 : 0;
    const target = el.closest('#blocks.rows') && el.clientHeight >= 60 ? el.clientHeight - 8 - scrollbar : 0;
    if (target) {
      let base = defaultBase;
      for (let i = 0; i < 5 && Math.abs(layout.height - target) > 1; i++) {
        base = Math.max(20, base + target - layout.height);
        layout = layoutSankey(data, width, narrow, base);
      }
    }
    const { nodes, byId, links, scale, height, nodeW } = layout;

    // Stack links on each node in the order of the nodes they connect to, to avoid crossings
    const outOffset = new Map(nodes.map(n => [n.id, 0]));
    const inOffset = new Map(nodes.map(n => [n.id, 0]));
    links.sort((a, b) => byId.get(a.source).y - byId.get(b.source).y || byId.get(a.target).y - byId.get(b.target).y);

    let paths = '';
    let dots = '';
    links.forEach((l, i) => {
      const s = byId.get(l.source);
      const t = byId.get(l.target);
      const thickness = Math.max(1, l.value * scale);
      const sy = s.y + outOffset.get(s.id) + thickness / 2;
      const ty = t.y + inOffset.get(t.id) + thickness / 2;
      outOffset.set(s.id, outOffset.get(s.id) + l.value * scale);
      inOffset.set(t.id, inOffset.get(t.id) + l.value * scale);
      const x0 = s.x + nodeW;
      const x1 = t.x;
      const xm = (x0 + x1) / 2;
      const color = s.kind === 'home' ? t.color : s.color;
      const title = `${s.label} → ${t.label}: ${format(l.value)}`;
      paths += `<path id="sankey-link-${i}" class="sankey-link" d="M${x0} ${sy} C${xm} ${sy} ${xm} ${ty} ${x1} ${ty}" stroke="${color}" stroke-width="${thickness}"><title>${escapeHtml(title)}</title></path>`;
      if (live) dots += flowDots(`sankey-link-${i}`, l.value, color, Math.min(4.5, Math.max(2, thickness / 2)));
    });

    let boxes = '';
    for (const n of nodes) {
      const labelY = n.y + n.h / 2 + 4;
      const left = n.column === 0;
      const tx = left ? n.x - 6 : n.x + nodeW + 6;
      const name = escapeHtml(shorten(n.label, narrow ? 13 : 24));
      boxes += `
        <g>
          <title>${escapeHtml(`${n.label}: ${format(n.value)}`)}</title>
          <rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="3" fill="${n.color}"/>
          <text class="sankey-label" x="${tx}" y="${labelY}" text-anchor="${left ? 'end' : 'start'}"><tspan class="sankey-name">${name}</tspan> <tspan class="sankey-value">${formatShort(n.value)}</tspan></text>
        </g>`;
    }

    el.innerHTML = `
      <svg viewBox="0 -4 ${width} ${height + 8}" width="${width}" height="${height + 8}" role="img" aria-label="Energiestromen van bron naar verbruiker">
        ${paths}
        <g class="sankey-dots">${dots}</g>
        ${boxes}
      </svg>`;
  }

  // ---------- Prices ----------

  const euro = (value, digits = 2) => `€ ${nf(digits).format(value)}`;
  const hm = iso => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  function priceColor(price, min, max) {
    const f = max > min ? (price - min) / (max - min) : 0.5;
    if (f < 0.34) return css('--home');
    if (f < 0.67) return css('--solar');
    return css('--hot');
  }

  function renderPrices(prices) {
    if (!$('price-now')) return;
    const ok = Boolean(prices && !prices.error && prices.today?.length);
    toggleEmpty('prices', ok);
    if (!ok) {
      setText('prices-empty', prices?.error ? `Geen prijzen: ${prices.error}` : 'Geen prijzen beschikbaar.');
      return;
    }
    setText('prices-source', `${prices.source} · incl. btw${prices.surcharge ? ' + opslag' : ''}`);
    setText('price-now', typeof prices.current === 'number' ? euro(prices.current, 3) : '–');

    const facts = [
      `<li><span>Laagste vandaag</span><strong>${euro(prices.min, 3)}</strong></li>`,
      `<li><span>Hoogste vandaag</span><strong>${euro(prices.max, 3)}</strong></li>`,
      `<li><span>Gemiddeld vandaag</span><strong>${euro(prices.avg, 3)}</strong></li>`,
    ];
    if (prices.cheapest) {
      const end = new Date(new Date(prices.cheapest.start).getTime() + prices.cheapest.hours * 3600000).toISOString();
      const day = new Date(prices.cheapest.start).getDate() !== new Date().getDate() ? 'morgen ' : '';
      facts.unshift(`<li><span>Goedkoopste ${prices.cheapest.hours} uur</span><strong>${day}${hm(prices.cheapest.start)}–${hm(end)} · ${euro(prices.cheapest.avg, 3)}</strong></li>`);
    }
    $('price-facts').innerHTML = facts.join('');
    renderPriceChart([...prices.today, ...prices.tomorrow]);
  }

  function renderPriceChart(list) {
    const el = $('prices-chart');
    if (!el) return;
    charts.set('prices-chart', () => renderPriceChart(list));
    const width = el.clientWidth || 600;
    const height = chartHeight(el, 150);
    const pad = { left: 34, right: 4, top: 8, bottom: 20 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const values = list.map(p => p.price);
    const min = Math.min(0, ...values);
    const max = Math.max(...values, 0.01);
    const step = niceStep(max - min, 3);
    const top = Math.ceil(max / step) * step;
    const bottom = Math.floor(min / step) * step;
    const y = v => pad.top + (top - v) / (top - bottom) * plotH;
    const band = plotW / list.length;
    const barW = Math.max(2, band * 0.7);
    const now = Date.now();
    const lo = Math.min(...values);
    const hi = Math.max(...values);

    let axis = '';
    for (let v = bottom; v <= top + 1e-9; v += step) {
      axis += `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}" class="${Math.abs(v) < 1e-9 ? 'zero' : ''}"/>`;
      axis += `<text x="${pad.left - 6}" y="${y(v) + 4}" text-anchor="end">${nf(2).format(v)}</text>`;
    }
    let bars = '';
    list.forEach((p, i) => {
      const start = new Date(p.t).getTime();
      const isNow = start <= now && now < start + 3600000;
      const past = start + 3600000 <= now;
      const x = pad.left + band * i + (band - barW) / 2;
      const y0 = y(Math.max(0, p.price));
      const h = Math.max(1, Math.abs(y(p.price) - y(0)));
      bars += `<rect x="${x}" y="${y0}" width="${barW}" height="${h}" rx="${Math.min(3, barW / 3)}" fill="${priceColor(p.price, lo, hi)}" fill-opacity="${past ? 0.35 : 1}" ${isNow ? `stroke="${css('--text')}" stroke-width="1.5"` : ''}><title>${hm(p.t)}: ${euro(p.price, 3)}</title></rect>`;
      const hour = new Date(p.t).getHours();
      if (hour % 6 === 0) {
        axis += `<text x="${pad.left + band * i + band / 2}" y="${height - 4}" text-anchor="middle">${hour === 0 && i > 0 ? 'morgen' : String(hour).padStart(2, '0')}</text>`;
      }
    });
    el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g class="axis">${axis}</g>${bars}</svg>`;
  }

  // ---------- Gauges ----------

  function gauge({ fraction, color, value, label }) {
    const r = 42;
    const c = Math.PI * r;
    const f = Math.min(1, Math.max(0, fraction ?? 0));
    return `
      <div class="gauge-item">
        <svg viewBox="0 0 100 60" role="img" aria-label="${escapeHtml(label)}">
          <path d="M8 54 A42 42 0 0 1 92 54" fill="none" stroke="${css('--track')}" stroke-width="9" stroke-linecap="round"/>
          <path d="M8 54 A42 42 0 0 1 92 54" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${Math.max(0.01, c * f)} ${c}"/>
          <text x="50" y="50" text-anchor="middle" class="gauge-value">${value}</text>
        </svg>
        <span class="gauge-label">${label}</span>
      </div>`;
  }

  function renderGauges(history) {
    const el = $('gauges');
    if (!el) return;
    const t = history.totals;
    setText('gauges-period', PERIOD_LABELS[state.period] || '');
    const exchanged = t.import + t.export;
    const producer = t.netGrid < 0;
    el.innerHTML = `<div class="gauges-inner">${[
      gauge({ fraction: t.selfSufficiency, color: css('--home'), value: `${formatPercent(t.selfSufficiency)}%`, label: 'Zelfvoorzienend' }),
      gauge({ fraction: t.selfConsumption, color: css('--solar'), value: `${formatPercent(t.selfConsumption)}%`, label: 'Eigen zon gebruikt' }),
      gauge({
        fraction: exchanged > 0 ? t.export / exchanged : 0,
        color: producer ? css('--export') : css('--grid'),
        value: `${formatEnergy(Math.abs(t.netGrid))}`,
        label: producer ? 'kWh netto geleverd' : 'kWh netto afgenomen',
      }),
    ].join('')}</div>`;
  }

  // ---------- Energy per device ----------

  function renderDeviceEnergy(history) {
    const el = $('device-energy');
    if (!el) return;
    setText('devices-period', `${PERIOD_LABELS[state.period] || ''} · kWh`);
    const list = history.devices || [];
    const max = Math.max(0.001, ...list.map(d => d.kWh));
    const total = history.totals.consumption;
    el.innerHTML = list.length
      ? list.map(d => `
          <li>
            <div class="consumer-row"><span>${escapeHtml(d.name)}</span><strong>${formatEnergy(d.kWh)}${total > 0 ? ` <small class="muted">${nf(0).format(d.kWh / total * 100)}%</small>` : ''}</strong></div>
            <div class="bar"><i style="width:${Math.max(2, d.kWh / max * 100)}%;background:var(--ev)"></i></div>
          </li>`).join('')
      : '<li class="muted">Geen apparaten met een kWh-meter gevonden</li>';
  }

  // ---------- Costs ----------

  function renderCosts(history) {
    const el = $('costs');
    if (!el) return;
    setText('costs-period', PERIOD_LABELS[state.period] || '');
    const t = history.totals;
    if (!t.costs) {
      el.innerHTML = '<tr><td class="muted">Vul je tarieven in bij de instellingen om de kosten te zien.</td></tr>';
      return;
    }
    const rows = [
      ['Stroom afname', `${formatEnergy(t.import)} kWh`, t.costs.import],
      ['Teruglevering', `${formatEnergy(t.export)} kWh`, t.costs.export],
      ['Gas', `${nf(2).format(t.gas)} m³`, t.costs.gas],
      ['Water', `${nf(0).format(t.water)} L`, t.costs.water],
    ].filter(([, , cost]) => typeof cost === 'number');
    const previous = history.previous?.cost;
    el.innerHTML = rows.map(([label, amount, cost]) => `
        <tr><td>${label}</td><td class="muted">${amount}</td><td>${euro(cost)}</td></tr>`).join('')
      + `<tr class="total"><td>Totaal</td><td class="muted">${typeof previous === 'number' ? `vorige periode ${euro(previous)}` : ''}</td><td>${euro(t.cost)}</td></tr>`;
  }

  // ---------- Water ----------

  function renderWater(live, history) {
    if (!$('water-chart')) return;
    const hasWater = Boolean(live?.water || history?.available?.water);
    toggleEmpty('water', hasWater);
    if (!hasWater) return;
    const parts = [];
    if (history) parts.push(`${nf(0).format(history.totals.water)} L`);
    if (typeof live?.water?.flow === 'number') parts.push(`nu ${nf(1).format(live.water.flow)} L/min`);
    setText('water-total', parts.join(' · '));
  }

  // ---------- Standby use ----------

  function renderBaseload(baseload) {
    if (!$('baseload-watts')) return;
    toggleEmpty('baseload', Boolean(baseload));
    if (!baseload) return;
    setText('baseload-watts', formatPower(baseload.watts));
    const facts = [`<li><span>Per jaar</span><strong>± ${nf(0).format(baseload.yearKWh)} kWh</strong></li>`];
    if (typeof baseload.yearCost === 'number') {
      facts.push(`<li><span>Kost per jaar</span><strong>± ${euro(baseload.yearCost, 0)}</strong></li>`);
    }
    facts.push('<li><span>Gemeten</span><strong>vannacht 1:00–5:00</strong></li>');
    $('baseload-facts').innerHTML = facts.join('');
  }

  // ---------- Phases ----------

  function renderPhases(data) {
    const el = $('phases');
    if (!el) return;
    toggleEmpty('phases', Boolean(data?.phases?.length));
    if (!data?.phases?.length) return;
    setText('phases-fuse', `hoofdzekering ${data.fuseAmps} A`);
    el.innerHTML = data.phases.map(p => {
      const amps = typeof p.amps === 'number' ? p.amps : (typeof p.watts === 'number' ? Math.abs(p.watts) / (p.volts || 230) : null);
      const load = amps === null ? 0 : amps / data.fuseAmps;
      const color = load > 0.9 ? 'var(--hot)' : load > 0.7 ? 'var(--warm)' : 'var(--home)';
      const main = typeof p.amps === 'number' ? `${nf(1).format(p.amps)} A` : formatPower(p.watts);
      const volts = typeof p.volts === 'number' ? ` <small class="muted">${nf(0).format(p.volts)} V</small>` : '';
      return `
        <li>
          <div class="consumer-row"><span>L${p.phase}</span><strong>${main}${volts}</strong></div>
          <div class="bar"><i style="width:${Math.min(100, Math.max(2, load * 100))}%;background:${color}"></i></div>
        </li>`;
    }).join('');
  }

  // ---------- Edit mode ----------

  const SIZE_ORDER = ['small', 'half', 'large', 'full'];
  const SIZE_SPANS = { small: 4, half: 6, large: 8, full: 12 };
  const SIZE_NAMES = { small: '1/3', half: '1/2', large: '2/3', full: 'hele breedte' };
  const PIN_KEY = 'energy-dashboard-pin';

  const edit = { info: null, pin: '' };

  const sizeOf = el => SIZE_ORDER.find(size => el.classList.contains(`size-${size}`)) || 'half';

  function setSize(el, size) {
    SIZE_ORDER.forEach(s => el.classList.remove(`size-${s}`));
    el.classList.add(`size-${size}`);
  }

  function currentLayout() {
    return [...$('blocks').children].map(el => {
      const rows = Number(el.dataset.rows);
      return rows ? { id: el.dataset.block, size: sizeOf(el), rows } : { id: el.dataset.block, size: sizeOf(el) };
    });
  }

  function editStatus(text, isError = false) {
    const el = $('edit-status');
    el.textContent = text;
    el.classList.toggle('error', isError);
  }

  function renderAll() {
    if (state.live) {
      renderFlow(state.live);
      renderBoiler(state.live.boiler);
      renderHeating(state.live.heating);
      renderEv(state.live.ev);
      renderConsumers(state.live);
      renderPrices(state.live.prices);
      renderBaseload(state.live.baseload);
      renderPhases(state.live.phases);
      renderWater(state.live, state.history);
      renderSankeyBlock();
    }
    if (state.history) renderHistory(state.history);
    relayout();
  }

  function decorate(el) {
    const tools = document.createElement('div');
    tools.className = 'block-tools';
    tools.innerHTML = `
      <span class="block-name">${escapeHtml(blockTitle(el.dataset.block))}</span>
      <button type="button" class="auto-height" title="Hoogte weer laten bepalen door de inhoud"${el.dataset.rows ? '' : ' hidden'}>Hoogte auto</button>
      <button type="button" class="tool drag-handle" title="Verplaatsen" aria-label="Verplaatsen">⠿</button>
      <button type="button" class="tool hide-block" title="Verbergen" aria-label="Verbergen">✕</button>`;
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.title = 'Sleep om de breedte te veranderen';
    handle.innerHTML = '<i></i><span class="size-badge"></span>';
    const heightHandle = document.createElement('div');
    heightHandle.className = 'height-handle';
    heightHandle.title = 'Sleep om de hoogte te veranderen';
    heightHandle.innerHTML = '<i></i><span class="size-badge"></span>';
    el.append(tools, handle, heightHandle);
  }

  function undecorate(el) {
    el.querySelectorAll('.block-tools, .resize-handle, .height-handle').forEach(x => x.remove());
  }

  function blockTitle(id) {
    return edit.info?.blocks.find(b => b.id === id)?.title || id;
  }

  function renderHiddenBlocks() {
    const shown = new Set(currentLayout().map(b => b.id));
    const hidden = edit.info.blocks.filter(b => !shown.has(b.id));
    $('edit-hidden').innerHTML = hidden.length
      ? `<span class="muted">Toevoegen:</span> ${hidden.map(b => `<button type="button" class="chip-button" data-add="${b.id}">+ ${escapeHtml(b.title)}</button>`).join('')}`
      : '';
  }

  function addBlock(id) {
    const block = edit.info.blocks.find(b => b.id === id);
    const el = block && createBlock(block);
    if (!el) return;
    decorate(el);
    $('blocks').appendChild(el);
    renderAll();
    relayout();
    watchSizes();
    renderHiddenBlocks();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function startEdit() {
    try {
      edit.info = await state.options.get('/layout');
    } catch (err) {
      setBanner('error', `Bewerken lukt niet: ${escapeHtml(err.message || err)}`);
      return;
    }
    state.editing = true;
    document.body.classList.add('editing');
    $('edit-bar').hidden = false;
    try { edit.pin = localStorage.getItem(PIN_KEY) || ''; } catch { edit.pin = ''; }
    const pinInput = $('edit-pin');
    pinInput.hidden = !edit.info.pinRequired;
    pinInput.value = edit.pin;
    editStatus('');
    [...$('blocks').children].forEach(decorate);
    renderHiddenBlocks();
  }

  function stopEdit() {
    state.editing = false;
    document.body.classList.remove('editing');
    $('edit-bar').hidden = true;
    [...$('blocks').children].forEach(undecorate);
  }

  async function saveEdit(layout) {
    const pin = $('edit-pin').value;
    editStatus('Opslaan…');
    try {
      const info = await state.options.post('/layout', { layout, pin });
      try { if (pin) localStorage.setItem(PIN_KEY, pin); } catch { /* storage unavailable */ }
      stopEdit();
      state.layoutKey = null;
      applyLayout(info.layout);
      renderAll();
    } catch (err) {
      if (err.status === 403) {
        $('edit-pin').hidden = false;
        $('edit-pin').focus();
      }
      editStatus(err.message || String(err), true);
    }
  }

  function cancelEdit() {
    stopEdit();
    state.layoutKey = null;
    if (state.live) applyLayout(state.live.layout);
    renderAll();
  }

  // Dragging a block by its handle: the block moves in the grid while dragging
  function startDrag(event, el) {
    event.preventDefault();
    el.classList.add('dragging');
    const handle = event.target.closest('.drag-handle');
    try { handle.setPointerCapture(event.pointerId); } catch { /* not a real pointer */ }
    let scrollSpeed = 0;
    const scroller = setInterval(() => { if (scrollSpeed) window.scrollBy(0, scrollSpeed); }, 16);

    const move = e => {
      scrollSpeed = e.clientY < 80 ? -12 : e.clientY > window.innerHeight - 80 ? 12 : 0;
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('#blocks > .block');
      if (!target || target === el) return;
      const rect = target.getBoundingClientRect();
      const before = sizeOf(target) === 'full' || rect.width > window.innerWidth * 0.8
        ? e.clientY < rect.top + rect.height / 2
        : e.clientX < rect.left + rect.width / 2;
      target.parentNode.insertBefore(el, before ? target : target.nextSibling);
    };
    const end = () => {
      clearInterval(scroller);
      el.classList.remove('dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      redrawSoon();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  // Dragging the right edge: the width snaps to 1/3, 1/2, 2/3 or the full row
  function startResize(event, el, handle) {
    event.preventDefault();
    try { handle.setPointerCapture(event.pointerId); } catch { /* not a real pointer */ }
    const grid = $('blocks').getBoundingClientRect();
    const badge = handle.querySelector('.size-badge');
    el.classList.add('resizing');

    const move = e => {
      const left = el.getBoundingClientRect().left;
      const columns = (e.clientX - left) / grid.width * 12;
      const size = SIZE_ORDER.reduce((best, s) =>
        Math.abs(SIZE_SPANS[s] - columns) < Math.abs(SIZE_SPANS[best] - columns) ? s : best, 'small');
      if (size !== sizeOf(el)) {
        setSize(el, size);
        redrawSoon();
      }
      badge.textContent = SIZE_NAMES[size];
    };
    const end = () => {
      el.classList.remove('resizing');
      badge.textContent = '';
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      redrawSoon();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    move(event);
  }

  // Dragging the bottom edge: the height snaps to the rows of the grid.
  // The block cannot get smaller than its content allows.
  function startHeightResize(event, el, handle) {
    event.preventDefault();
    try { handle.setPointerCapture(event.pointerId); } catch { /* not a real pointer */ }
    const badge = handle.querySelector('.size-badge');
    el.classList.add('resizing');
    let scrollSpeed = 0;
    let lastY = event.clientY;
    const scroller = setInterval(() => {
      if (!scrollSpeed) return;
      window.scrollBy(0, scrollSpeed);
      update(lastY);
    }, 16);

    const update = clientY => {
      const top = el.getBoundingClientRect().top;
      const min = Number(el.dataset.minRows) || MIN_ROWS;
      const rows = Math.min(MAX_ROWS, Math.max(min, Math.round((clientY - top + GAP) / ROW)));
      if (String(rows) !== el.dataset.rows) {
        el.dataset.rows = rows;
        el.style.gridRowEnd = `span ${rows}`;
      }
      badge.textContent = `${heightOf(rows)} px`;
    };
    const move = e => {
      lastY = e.clientY;
      scrollSpeed = e.clientY > window.innerHeight - 60 ? 10 : e.clientY < 80 ? -10 : 0;
      update(e.clientY);
    };
    const end = () => {
      clearInterval(scroller);
      el.classList.remove('resizing');
      badge.textContent = '';
      const auto = el.querySelector('.auto-height');
      if (auto) auto.hidden = !el.dataset.rows;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      redrawSoon();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    update(event.clientY);
  }

  function initEditMode() {
    const toggle = $('edit-toggle');
    if (!toggle || !state.options.post) {
      if (toggle) toggle.hidden = true;
      return;
    }
    toggle.addEventListener('click', () => (state.editing ? cancelEdit() : startEdit()));
    $('edit-cancel').addEventListener('click', cancelEdit);
    $('edit-save').addEventListener('click', () => saveEdit(currentLayout()));
    $('edit-default').addEventListener('click', () => saveEdit(null));
    $('edit-hidden').addEventListener('click', e => {
      const id = e.target.closest('[data-add]')?.dataset.add;
      if (id) addBlock(id);
    });

    const blocks = $('blocks');
    blocks.addEventListener('pointerdown', e => {
      if (!state.editing) return;
      const el = e.target.closest('#blocks > .block');
      if (!el) return;
      if (e.target.closest('.drag-handle')) startDrag(e, el);
      else if (e.target.closest('.resize-handle')) startResize(e, el, e.target.closest('.resize-handle'));
      else if (e.target.closest('.height-handle')) startHeightResize(e, el, e.target.closest('.height-handle'));
    });
    blocks.addEventListener('click', e => {
      if (!state.editing) return;
      const auto = e.target.closest('.auto-height');
      if (auto) {
        const block = auto.closest('#blocks > .block');
        delete block.dataset.rows;
        auto.hidden = true;
        relayout();
        redrawSoon();
        return;
      }
      if (!e.target.closest('.hide-block')) return;
      e.target.closest('#blocks > .block').remove();
      renderHiddenBlocks();
      redrawSoon();
    });
  }

  // ---------- Consumers ----------

  function renderConsumers(live) {
    const el = $('consumers');
    if (!el) return;
    // A block with a chosen height shows every device and scrolls, otherwise the top 8
    const list = (live.consumers || []).slice(0, fixedHeight(el) ? 20 : 8);
    const max = Math.max(1, ...list.map(d => d.watts));
    el.innerHTML = list.length
      ? list.map(d => `
          <li>
            <div class="consumer-row"><span>${escapeHtml(d.name)}</span><strong>${formatPower(d.watts)}</strong></div>
            <div class="bar"><i style="width:${Math.max(2, d.watts / max * 100)}%;background:var(--home)"></i></div>
          </li>`).join('')
      : '<li class="muted">Geen apparaten met stroommeting actief</li>';
  }

  // ---------- Data loading ----------

  async function loadLive() {
    try {
      const live = await state.options.get('/live');
      state.live = live;
      const rebuilt = applyLayout(live.layout);
      renderFlow(live);
      renderBoiler(live.boiler);
      renderHeating(live.heating);
      renderEv(live.ev);
      renderConsumers(live);
      renderPrices(live.prices);
      renderBaseload(live.baseload);
      renderPhases(live.phases);
      renderWater(live, state.history);
      if (state.sankeyMode === 'live') renderSankeyBlock();
      if (rebuilt && state.history) renderHistory(state.history);
      if (rebuilt && !state.history) loadHistory();
      relayout();

      if (live.demo) {
        setStatus('demo', 'Demo');
        setBanner('', state.options.demoMessage || '');
      } else {
        setStatus('live', 'Live');
        const missing = [];
        if (!live.devices.p1) missing.push('P1-meter');
        if (!live.devices.solar.length) missing.push('zonnepanelen');
        if (!live.devices.boiler) missing.push('boiler');
        setBanner('', missing.length && state.options.missingHint
          ? `Niet gevonden: ${missing.join(', ')}. ${state.options.missingHint}`
          : '');
      }
    } catch (err) {
      setStatus('error', 'Geen verbinding');
      setBanner('error', `<strong>Kan geen gegevens ophalen.</strong> ${escapeHtml(err.message || err)}`);
    }
    changed();
  }

  async function loadHistory() {
    const period = state.period;
    try {
      const history = await state.options.get(`/history?period=${period}`);
      if (period !== state.period) return;
      state.history = history;
      renderHistory(history);
    } catch (err) {
      ['electricity-chart', 'solar-chart', 'gas-chart'].forEach(id => {
        const el = $(id);
        if (el) el.innerHTML = `<div class="empty">${escapeHtml(err.message || err)}</div>`;
      });
    }
    changed();
  }

  function renderHistory(history) {
    renderTiles(history);
    renderCharts(history);
    renderGauges(history);
    renderDeviceEnergy(history);
    renderCosts(history);
    renderWater(state.live, history);
    if (state.live) {
      renderBoiler(state.live.boiler);
      renderHeating(state.live.heating);
      renderEv(state.live.ev);
    }
    relayout();
  }

  function selectPeriod(period) {
    state.period = period;
    if ($('periods')) {
      try { localStorage.setItem(PERIOD_KEY, period); } catch { /* storage unavailable */ }
      document.querySelectorAll('#periods button').forEach(b => b.classList.toggle('active', b.dataset.period === period));
    }
    loadHistory();
  }

  function needsHistory() {
    return Boolean($('blocks')) || ['tiles', 'electricity-chart', 'solar-chart', 'gas-chart', 'boiler-history', 'sankey'].some(id => $(id));
  }

  function redraw() {
    if (state.live) { renderFlow(state.live); renderBoiler(state.live.boiler); }
    if (state.history) renderCharts(state.history);
    changed();
  }

  // options.get(path) returns a promise with the JSON for '/live' or '/history?period=…'
  function start(options) {
    state.options = options;
    setText('today-label', new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }));

    let period = options.period;
    const periods = $('periods');
    if (periods) {
      try { period = period || localStorage.getItem(PERIOD_KEY); } catch { /* storage unavailable */ }
      periods.addEventListener('click', event => {
        const button = event.target.closest('button[data-period]');
        if (button) selectPeriod(button.dataset.period);
      });
    }
    state.period = PERIOD_LABELS[period] ? period : 'today';
    try { state.sankeyMode = localStorage.getItem(SANKEY_MODE_KEY) === 'period' ? 'period' : 'live'; } catch { /* storage unavailable */ }

    // Shrink the sticky header once the page scrolls
    const header = document.querySelector('.top');
    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    window.addEventListener('resize', redrawSoon);

    // Colors come from CSS, so redraw when the theme switches between light and dark
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);

    initEditMode();
    loadLive();
    setInterval(loadLive, LIVE_INTERVAL);
    if (needsHistory()) {
      selectPeriod(state.period);
      setInterval(loadHistory, HISTORY_INTERVAL);
    }
  }

  window.EnergyDashboard = { start, redraw };

})();
