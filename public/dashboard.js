'use strict';

// Renderer for the dashboard page. The page is built from blocks (see the <template>s in
// index.html) in the order and sizes of the layout the server sends along with the live data.
// Every renderer is optional: it only draws when its elements are part of the layout.
// Edit this file in /shared and run `npm run sync` to copy it to all places that use it.

(function () {

  const LIVE_INTERVAL = 10 * 1000;
  const HISTORY_INTERVAL = 60 * 1000;
  const PERIOD_KEY = 'energy-dashboard-period';
  const LAYOUT_KEY = 'energy-dashboard-layout';
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

  // Numbers and dates follow the language chosen on the page (see i18n.js)
  const LOCALE = window.EnergyI18n?.locale || 'nl-NL';

  const $ = id => document.getElementById(id);
  const nf = (digits = 0) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
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

  const PERIOD_LABELS = { today: 'Vandaag', yesterday: 'Gisteren', week: 'Deze week', month: 'Deze maand', year: 'Dit jaar' };
  const PREVIOUS_LABELS = {
    today: 'gisteren tot hetzelfde uur',
    week: 'vorige week tot dezelfde dag',
    month: 'vorige maand tot dezelfde dag',
    year: 'vorig jaar tot dezelfde maand',
  };

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

  // The diagrams are drawn again on every update. One animation loop moves the particles along
  // the lines and remembers where each flow was, so particles keep going instead of jumping back
  // to the start, and a change in power speeds them up or slows them down gradually.

  // Less motion when the system asks for it, unless the screen menu (screen.js) says otherwise
  const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = {
    get matches() { return window.EnergyScreen?.reducedMotion ? window.EnergyScreen.reducedMotion() : systemReduced.matches; },
  };
  // The flows themselves keep moving (as in the first version), unless motion is turned off
  const flowsStill = () => (window.EnergyScreen?.flowsStill ? window.EnergyScreen.flowsStill() : false);
  const flowMemory = new Map();
  const TAIL = 4;
  let flowItems = [];
  let flowFrame = 0;
  let flowTime = 0;

  // SVG units per second: faster with more power
  const flowSpeed = watts => 190 / Math.max(0.9, 4.2 - Math.log10(watts) * 0.9);

  // Thicker lines for more power
  const flowWidth = watts => 2.5 + Math.min(3, Math.max(0, Math.log10(watts) - 1.5));

  // A negative delay that keeps a CSS animation in step when its element is drawn again
  const syncDelay = seconds => `-${((performance.now() / 1000) % seconds).toFixed(2)}s`;

  function flowDots(pathId, watts, color, radius = 4.5, key = pathId) {
    if (!(watts > 5)) return '';
    return `<g class="flow-particles" data-path="${pathId}" data-key="${escapeHtml(key)}" data-watts="${watts}" data-color="${color}" data-r="${radius}"></g>`;
  }

  function syncFlows() {
    const seen = new Set();
    flowItems = [...document.querySelectorAll('.flow-particles')].map(g => {
      const path = document.getElementById(g.dataset.path);
      const length = path ? path.getTotalLength() : 0;
      if (!(length > 0)) return null;
      const watts = Number(g.dataset.watts);
      const r = Number(g.dataset.r);
      const color = g.dataset.color;
      const key = g.dataset.key;
      seen.add(key);
      const target = flowSpeed(watts);
      const memory = flowMemory.get(key) || { offset: Math.random() * length, speed: target };
      flowMemory.set(key, memory);

      // Each particle is a glowing head with a fading tail behind it
      const spacing = watts > 2000 ? 48 : watts > 500 ? 62 : 90;
      const count = Math.max(1, Math.round(length / spacing));
      let html = '';
      for (let i = 0; i < count; i++) {
        let tail = '';
        for (let k = 1; k <= TAIL; k++) {
          tail += `<circle class="flow-tail" r="${(r * (1 - k / (TAIL + 1.5))).toFixed(2)}" fill="${color}" opacity="${(0.55 * (1 - k / (TAIL + 1))).toFixed(2)}"/>`;
        }
        html += `<g class="flow-particle">${tail}<g class="flow-head">
          <circle r="${(r * 2.4).toFixed(2)}" fill="${color}" opacity="0.16"/>
          <circle r="${r}" fill="${color}"/>
          <circle r="${(r * 0.42).toFixed(2)}" fill="#fff" opacity="0.85"/>
        </g></g>`;
      }
      g.innerHTML = html;
      const parts = [...g.querySelectorAll('.flow-particle')].map(el => ({
        el, head: el.querySelector('.flow-head'), tail: [...el.querySelectorAll('.flow-tail')],
      }));
      return { path, length, count, r, target, memory, parts };
    }).filter(Boolean);

    for (const key of flowMemory.keys()) if (!seen.has(key)) flowMemory.delete(key);

    flowItems.forEach(placeParticles);
    if (flowItems.length && !flowFrame && !flowsStill()) {
      flowTime = 0;
      flowFrame = requestAnimationFrame(flowStep);
    }
  }

  function placeParticles(item) {
    const { path, length, count, r, memory, parts } = item;
    const gap = r * (0.8 + memory.speed / 220);
    parts.forEach((p, i) => {
      const d = (memory.offset + i * length / count) % length;
      // Fade in when leaving a node and out when arriving at the next
      p.el.setAttribute('opacity', Math.max(0, Math.min(1, d / 16, (length - d) / 16)).toFixed(2));
      const head = path.getPointAtLength(d);
      p.head.setAttribute('transform', `translate(${head.x.toFixed(1)} ${head.y.toFixed(1)})`);
      p.tail.forEach((c, k) => {
        const td = d - (k + 1) * gap;
        if (td < 0) { c.setAttribute('visibility', 'hidden'); return; }
        const point = path.getPointAtLength(td);
        c.setAttribute('visibility', 'visible');
        c.setAttribute('cx', point.x.toFixed(1));
        c.setAttribute('cy', point.y.toFixed(1));
      });
    });
  }

  function flowStep(now) {
    const dt = flowTime ? Math.min(0.1, (now - flowTime) / 1000) : 0;
    flowTime = now;
    for (const item of flowItems) {
      const m = item.memory;
      m.speed += (item.target - m.speed) * Math.min(1, dt * 1.5);
      m.offset = (m.offset + m.speed * dt) % item.length;
      placeParticles(item);
    }
    flowFrame = flowItems.length && !flowsStill() ? requestAnimationFrame(flowStep) : 0;
  }

  window.addEventListener('energy-motion', syncFlows);
  if (!window.EnergyScreen) systemReduced.addEventListener?.('change', syncFlows);

  // Numbers count smoothly to their new value instead of jumping
  const shownValues = new Map();
  function tweenValues(root) {
    root.querySelectorAll('[data-tween]').forEach(el => {
      const key = el.dataset.tween;
      const to = Number(el.dataset.watts);
      const shown = shownValues.get(key) || { value: to };
      shownValues.set(key, shown);
      const from = shown.value;
      const token = (shown.token || 0) + 1;
      shown.token = token;
      if (reducedMotion.matches || from === to || Math.abs(from - to) < 1) {
        shown.value = to;
        return;
      }
      el.textContent = formatPower(from);
      const started = performance.now();
      const step = now => {
        if (shown.token !== token) return;
        const t = Math.min(1, (now - started) / 900);
        shown.value = from + (to - from) * (1 - Math.pow(1 - t, 3));
        el.textContent = formatPower(t < 1 ? shown.value : to);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // A circle in the live diagram; `total` is an extra line with today's energy under the label
  // `watts` makes the value count to its new number; `active` gives the circle a soft pulse
  function node({ x, y, color, iconName, label, labelAbove, value, watts, sub, ring, total, active, spin }) {
    const r = 44;
    const labelY = labelAbove ? -(r + (total ? 22 : 8)) : r + 18;
    const totalY = labelAbove ? -(r + 8) : r + 32;
    const tween = typeof watts === 'number' ? ` data-tween="${iconName}" data-watts="${watts}"` : '';
    return `
      <g transform="translate(${x} ${y})">
        ${active ? `<circle r="${r}" class="node-pulse" stroke="${color}" style="animation-delay:${syncDelay(2.8)}"/>` : ''}
        <circle r="${r}" class="node-ring" stroke="${ring ? 'transparent' : color}"/>
        ${ring || ''}
        <g transform="translate(-11 -30)" style="color:${color}"><g class="${spin ? 'node-spin' : ''}" style="${spin ? `animation-delay:${syncDelay(24)}` : ''}">${icon(iconName, 22)}</g></g>
        <text class="node-value" y="11"${tween}>${value}</text>
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
    // An active line gets its color, a width that grows with the power and a soft glow
    const line = (id, d, watts, color, hidden) => {
      if (hidden) return `<path id="${id}" class="flow-line" style="stroke:none" d="${d}"/>`;
      if (!(watts > 5)) return `<path id="${id}" class="flow-line" d="${d}"/>`;
      const width = flowWidth(watts);
      return `<path class="flow-glow" stroke="${color}" stroke-width="${(width + 8).toFixed(1)}" d="${d}"/>` +
        `<path id="${id}" class="flow-line" stroke="${color}" stroke-opacity="0.4" stroke-width="${width.toFixed(1)}" d="${d}"/>`;
    };

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
        ${line('p-grid-home', `M 116 ${y} L 304 ${y}`, f.gridToHome, colors.grid)}
        ${hasSolar ? `
          ${line('p-solar-home', `M 238 ${92 + top} C 262 ${140 + top} 280 ${160 + top} 306 ${186 + top}`, f.solarToHome, colors.solar)}
          ${line('p-solar-grid', `M 182 ${92 + top} C 158 ${140 + top} 140 ${160 + top} 114 ${186 + top}`, f.solarToGrid, colors.export)}
        ` : ''}
        ${hasBattery ? `
          ${line('p-battery-home', `M 238 ${by - 34} C 262 ${by - 82} 280 ${by - 102} 306 ${y + 34}`, f.batteryToHome, colors.battery)}
          ${line('p-grid-battery', `M 114 ${y + 34} C 140 ${by - 102} 158 ${by - 82} 182 ${by - 34}`, Math.max(f.gridToBattery || 0, f.batteryToGrid || 0), f.gridToBattery > 5 ? colors.grid : colors.export)}
          ${line('p-battery-grid', `M 182 ${by - 34} C 158 ${by - 82} 140 ${by - 102} 114 ${y + 34}`, 0, '', true)}
          ${hasSolar ? line('p-solar-battery', `M 210 ${100 + top} L 210 ${by - 44}`, f.solarToBattery, colors.battery) : ''}
        ` : ''}
        ${flowDots('p-grid-home', f.gridToHome, colors.grid)}
        ${hasSolar ? flowDots('p-solar-home', f.solarToHome, colors.solar) : ''}
        ${hasSolar ? flowDots('p-solar-grid', f.solarToGrid, colors.export) : ''}
        ${hasBattery ? flowDots('p-battery-home', f.batteryToHome, colors.battery) : ''}
        ${hasBattery ? flowDots('p-grid-battery', f.gridToBattery, colors.grid) : ''}
        ${hasBattery ? flowDots('p-battery-grid', f.batteryToGrid, colors.export) : ''}
        ${hasBattery && hasSolar ? flowDots('p-solar-battery', f.solarToBattery, colors.solar) : ''}
        ${hasSolar ? node({ x: 210, y: 56 + top, color: colors.solar, iconName: 'sun', label: 'Zon', labelAbove: true, value: formatPower(solar), watts: solar, total: totals.solar, active: solar > 5, spin: solar > 5 }) : ''}
        ${node({ x: 70, y, color: grid < -5 ? colors.export : colors.grid, iconName: 'grid', label: 'Net', value: formatPower(grid), watts: grid, sub: gridSub, total: totals.grid, active: Math.abs(grid) > 5 })}
        ${node({
          x: 350, y, color: colors.home, iconName: 'home', label: 'Huis', value: formatPower(home), watts: home, total: totals.home,
          ring: homeRing([
            { value: f.solarToHome || 0, color: colors.solar },
            { value: f.batteryToHome || 0, color: colors.battery },
            { value: f.gridToHome || 0, color: colors.grid },
          ]),
        })}
        ${hasBattery ? node({ x: 210, y: by, color: colors.battery, iconName: 'battery', label: `Batterij${soc}`, value: formatPower(batteryW), watts: batteryW, sub: batterySub, total: totals.battery, active: Math.abs(batteryW) > 5 }) : ''}
      </svg>`;
    syncFlows();
    tweenValues(el);

    const updated = $('live-updated');
    if (updated) {
      const time = new Date(live.updated).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
      const perDay = gasPerDegreeDay(history, true);
      if (perDay) facts.push(`<li><span>Gas per graaddag</span><strong>${perDay}</strong></li>`);
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

  // ---------- Gas per degree day ----------

  // Gas per degree day, with the change from the previous period: a fair comparison whatever
  // the weather was. Null without enough cold (summer) or without temperatures.
  function gasPerDegreeDay(history, withDelta = false) {
    const t = history?.totals;
    if (!t || !(t.degreeDays >= 3) || !(t.gas > 0)) return null;
    const value = t.gas / t.degreeDays;
    const text = `${nf(3).format(value)} m³ per graaddag`;
    const p = history.previous;
    if (!withDelta || !p || !(p.degreeDays >= 3) || !(p.gas > 0)) return text;
    return `${text}${deltaBadge(value, p.gas / p.degreeDays, true)}`;
  }

  // ---------- Solar performance ----------

  function renderSolarPerf(history) {
    if (!$('solar-chart')) return;
    const t = history.totals;
    const rows = history.rows;
    const expected = history.expectedSolar;

    const facts = [];
    // Compare only the buckets that have both a forecast and a measurement
    let actual = 0;
    let wanted = 0;
    if (expected?.perBucket) {
      expected.perBucket.forEach((v, i) => {
        if (typeof v === 'number' && v > 0) { wanted += v; actual += rows[i].solar || 0; }
      });
    }
    // Today: against what the forecast expected up to now; yesterday: the whole day
    let label = 'Verwacht';
    if (state.period === 'today' && history.forecast?.watts?.length) {
      const now = Date.now();
      const dayStart = new Date().setHours(0, 0, 0, 0);
      wanted = history.forecast.watts.filter(p => p.t >= dayStart && p.t < now).reduce((sum, p) => sum + p.w * 0.25 / 1000, 0);
      actual = t.solar;
      label = 'Verwacht tot nu';
      if (expected?.day) facts.push(`<li><span>Verwacht vandaag</span><strong>${formatEnergy(expected.day)} kWh</strong></li>`);
    } else if (expected?.day && ['today', 'yesterday'].includes(state.period)) {
      wanted = expected.day;
      actual = t.solar;
    }
    if (wanted > 0.05) {
      facts.push(`<li><span>${label}</span><strong>${formatEnergy(wanted)} kWh</strong></li>`);
      facts.push(`<li><span>Prestatie t.o.v. verwachting</span><strong>${nf(0).format(actual / wanted * 100)}%</strong></li>`);
    }
    if (history.kwp > 0) {
      facts.push(`<li><span>Per kWp</span><strong>${formatEnergy(t.solar / history.kwp)} kWh</strong></li>`);
    }
    if (history.bucket !== 'hour') {
      const best = rows.reduce((a, b) => ((b.solar || 0) > (a?.solar || 0) ? b : a), null);
      if (best?.solar > 0) facts.push(`<li><span>Beste ${history.bucket === 'month' ? 'maand' : 'dag'}</span><strong>${bucketTitle(best, history.bucket)} · ${formatEnergy(best.solar)} kWh</strong></li>`);
    }
    const devices = history.solarDevices || [];
    if (devices.length > 1) {
      devices.forEach(d => facts.push(`<li><span>${escapeHtml(d.name)}</span><strong>${formatEnergy(d.kWh)} kWh</strong></li>`));
    }
    const factsEl = $('solar-facts');
    if (factsEl) factsEl.innerHTML = facts.join('');
    renderSolarPerfChart(rows, history.bucket, expected?.perBucket);
  }

  // Bars for what was produced, with a line marking what was expected in each bucket
  function renderSolarPerfChart(rows, bucket, expected) {
    const el = $('solar-chart');
    if (!el) return;
    charts.set('solar-chart', () => renderSolarPerfChart(rows, bucket, expected));
    const values = rows.map(r => r.solar || 0);
    const max = Math.max(0.1, ...values, ...(expected || []).filter(v => typeof v === 'number'));
    if (!values.some(v => v > 0)) {
      el.innerHTML = '<div class="empty">Nog geen gegevens voor deze periode</div>';
      return;
    }
    const width = el.clientWidth || 300;
    const height = chartHeight(el, Number(el.dataset.height) || 160);
    const pad = { left: 30, right: 4, top: 6, bottom: 18 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const step = niceStep(max, 3);
    const top = Math.ceil(max / step) * step;
    const y = v => pad.top + plotH - v / top * plotH;
    const band = plotW / rows.length;
    const barW = Math.max(2, Math.min(24, band * 0.64));
    const solar = css('--solar');
    const labelEvery = Math.ceil(rows.length * 26 / plotW);
    let axis = '';
    for (let v = 0; v <= top + 1e-9; v += step) {
      axis += `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'zero' : ''}"/>`;
      axis += `<text x="${pad.left - 6}" y="${y(v) + 4}" text-anchor="end">${nf(step < 1 ? 1 : 0).format(v)}</text>`;
    }
    let bars = '';
    rows.forEach((r, i) => {
      const x = pad.left + band * i + (band - barW) / 2;
      const v = r.solar || 0;
      const e = expected?.[i];
      const good = typeof e === 'number' && e > 0 ? v / e : null;
      bars += `<rect x="${x}" y="${y(v)}" width="${barW}" height="${Math.max(0, y(0) - y(v))}" rx="${Math.min(3, barW / 3)}" fill="${solar}" fill-opacity="${good === null || good >= 0.9 ? 1 : 0.55}"><title>${bucketTitle(r, bucket)}: ${formatEnergy(v)} kWh${typeof e === 'number' ? ` / ${formatEnergy(e)} kWh` : ''}</title></rect>`;
      if (typeof e === 'number') bars += `<line x1="${x - 2}" x2="${x + barW + 2}" y1="${y(e)}" y2="${y(e)}" stroke="${css('--text')}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>`;
      if (i % labelEvery === 0) axis += `<text x="${pad.left + band * i + band / 2}" y="${height - 4}" text-anchor="middle">${axisLabel(r, bucket)}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g class="axis">${axis}</g>${bars}</svg>`;
  }

  // ---------- Warnings ----------

  function renderAlerts(alerts) {
    const el = $('alerts');
    if (!el) return;
    // A block just added in the editor: the server only fills it once the layout is saved
    if (alerts === undefined) {
      el.innerHTML = '<li class="alert ok"><i></i><span>Verschijnt na het opslaan van de indeling</span></li>';
      return;
    }
    const list = alerts || [];
    el.innerHTML = list.length
      ? list.map(a => `<li class="alert ${a.level === 'warning' ? 'warning' : ''}"><i></i><span>${escapeHtml(a.text)}</span></li>`).join('')
      : '<li class="alert ok"><i></i><span>Geen meldingen</span></li>';
  }

  // In the header while there are warnings, so they are seen without scrolling; a tap goes to the block
  function renderAlertPill(alerts) {
    const status = $('status');
    if (!status) return;
    let pill = $('alert-pill');
    const warnings = (alerts || []).filter(a => a.level === 'warning' && a.text);
    if (!warnings.length) {
      if (pill) pill.remove();
      return;
    }
    if (!pill) {
      pill = document.createElement('button');
      pill.type = 'button';
      pill.id = 'alert-pill';
      pill.className = 'alert-pill';
      pill.addEventListener('click', () => $('alerts')?.closest('.block, .card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      status.after(pill);
    }
    const text = warnings.length === 1 ? warnings[0].text : `${warnings.length} meldingen`;
    if (pill.dataset.text !== text) {
      pill.dataset.text = text;
      pill.innerHTML = `<i></i><span>${escapeHtml(text)}</span>`;
    }
  }

  // ---------- House mood ----------

  // The color behind the blocks: the sun while it covers the home or sends power back, the
  // battery while it charges or supplies the home, the grid while the home runs on the grid,
  // red without a connection, and nothing while little is going on
  function setMood(live) {
    let mood = '';
    if (!live) mood = 'error';
    else {
      const f = live.flows || {};
      const solarHome = f.solarToHome || 0;
      const gridHome = f.gridToHome || 0;
      const batteryHome = f.batteryToHome || 0;
      const charging = (f.solarToBattery || 0) + (f.gridToBattery || 0);
      if ((f.solarToGrid || 0) > 100) mood = 'solar';
      else if (charging > 100) mood = 'battery';
      else if (solarHome > 100 && solarHome >= gridHome + batteryHome) mood = 'solar';
      else if (batteryHome > 100 && batteryHome >= gridHome) mood = 'battery';
      else if (gridHome > 100) mood = 'grid';
    }
    const root = document.documentElement;
    if ((root.dataset.mood || '') === mood) return;
    if (mood) root.dataset.mood = mood;
    else delete root.dataset.mood;
  }

  // ---------- End of net metering ----------

  function renderNetting(netting) {
    if (!$('netting-extra')) return;
    const empty = $('netting-empty');
    const ok = Boolean(netting && netting.extra !== null && netting.export > 0);
    toggleEmpty('netting', ok);
    if (!ok) {
      if (empty) {
        empty.textContent = netting === undefined ? 'Verschijnt na het opslaan van de indeling'
          : !netting ? 'Laden…'
          : !(netting.export > 0) ? 'Nog geen teruglevering gemeten.'
            : 'Vul je stroomcontract in bij de instellingen om dit te berekenen.';
      }
      return;
    }
    const basis = netting.basis === 'lastYear' ? 'op basis van vorig jaar' : 'op basis van dit jaar tot nu';
    setText('netting-basis', basis);
    setText('netting-extra', `± ${euro(netting.extra, 0)}`);
    const facts = [
      `<li><span>Teruggeleverd</span><strong>${nf(0).format(netting.export)} kWh</strong></li>`,
      `<li><span>Daarvan gesaldeerd</span><strong>${nf(0).format(netting.netted)} kWh</strong></li>`,
    ];
    if (typeof netting.perKWh === 'number') {
      facts.push(`<li><span>Elke kWh die je zelf gebruikt in plaats van teruglevert, bespaart</span><strong>${euro(netting.perKWh, 2)}</strong></li>`);
    }
    $('netting-facts').innerHTML = facts.join('');
    setText('netting-note', 'Salderen stopt op 1 januari 2027. Daarna betaal je voor alles wat je van het net haalt, en krijg je voor teruglevering alleen de terugleververgoeding. Meer zelf gebruiken op zonnige uren of een thuisbatterij verkleint dit bedrag. Berekend met je contract uit de instellingen.');
  }

  // ---------- Home battery ----------

  function renderBattery(battery, history) {
    if (!$('battery-soc')) return;
    toggleEmpty('battery', Boolean(battery));
    if (!battery) return;
    const color = css('--battery');
    const soc = typeof battery.soc === 'number' ? battery.soc : null;
    const watts = battery.watts || 0;

    setText('battery-name', battery.names?.length === 1 ? battery.names[0] : 'Thuisbatterij');
    setText('battery-state', watts > 5 ? 'Laden' : watts < -5 ? 'Ontladen' : 'Rust');
    setText('battery-soc', soc === null ? '–' : `${nf(0).format(soc)}%`);
    setText('battery-power', Math.abs(watts) > 5 ? `${watts > 0 ? 'laadt' : 'levert'} ${formatPower(watts)}` : 'laadniveau');

    // A battery that fills up with its charge level; it glows softly while charging
    const gauge = $('battery-gauge');
    if (gauge) {
      const level = Math.max(0, Math.min(100, soc ?? 0));
      const inner = 60 * level / 100;
      gauge.innerHTML = `
        <svg viewBox="0 0 44 72" role="img" aria-label="Laadniveau">
          <rect x="15" y="1" width="14" height="5" rx="2" fill="${css('--track')}"/>
          <rect x="3" y="6" width="38" height="64" rx="8" fill="none" stroke="${css('--track')}" stroke-width="3"/>
          <rect class="${watts > 5 ? 'battery-charging' : ''}" x="8" y="${(66 - inner).toFixed(1)}" width="28" height="${Math.max(0, inner).toFixed(1)}" rx="4" fill="${level < 15 ? css('--hot') : color}"/>
        </svg>`;
    }

    const period = (PERIOD_LABELS[state.period] || '').toLowerCase();
    const t = history?.totals;
    const facts = [];
    if (t) {
      facts.push(`<li><span>Geladen ${period}</span><strong>${formatEnergy(t.charge)} kWh</strong></li>`);
      facts.push(`<li><span>Ontladen ${period}</span><strong>${formatEnergy(t.discharge)} kWh</strong></li>`);
      // Within a day the charged energy is mostly still in the battery, so only over a longer period
      if (['month', 'year'].includes(state.period) && t.charge > 5 && t.discharge > 0) {
        facts.push(`<li><span>Rendement</span><strong>${formatPercent(Math.min(1, t.discharge / t.charge))}%</strong></li>`);
      }
      if (t.charge > 0.05) {
        facts.push(`<li><span>Geladen met zon</span><strong>${formatPercent(Math.min(1, (t.solarToBattery || 0) / t.charge))}%</strong></li>`);
      }
    }
    // What the battery earned: saved import minus what charging cost (or the export it missed)
    const earnings = history?.batteryEarnings;
    if (earnings) {
      facts.push(`<li><span>Opbrengst ${period}</span><strong>${euro(earnings.withNetting)}</strong></li>`);
      if (Math.abs(earnings.withoutNetting - earnings.withNetting) >= 0.01) {
        facts.push(`<li><span>Zonder salderen (vanaf 2027)</span><strong>${euro(earnings.withoutNetting)}</strong></li>`);
      }
    }
    if ((battery.devices || []).length > 1) {
      battery.devices.forEach(d => facts.push(`<li><span>${escapeHtml(d.name)}</span><strong>${typeof d.soc === 'number' ? `${nf(0).format(d.soc)}% · ` : ''}${formatPower(d.watts)}</strong></li>`));
    }
    $('battery-facts').innerHTML = facts.join('');
    renderBatteryChart(['today', 'yesterday'].includes(state.period) ? history?.batterySoc : null);
  }

  // Charge level through the day, 0–100%
  function renderBatteryChart(series) {
    const el = $('battery-chart');
    if (!el) return;
    charts.set('battery-chart', () => renderBatteryChart(series));
    const points = series ? series.values.map((v, i) => (typeof v === 'number' ? { t: Date.parse(series.start) + (i + 0.5) * series.step * 1000, v } : null)) : [];
    const known = points.filter(Boolean);
    if (known.length < 2) {
      el.innerHTML = '';
      return;
    }
    const width = el.clientWidth || 300;
    const height = chartHeight(el, 90);
    const start = Date.parse(series.start);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const x = time => (time - start) / (end - start) * width;
    const y = v => 4 + (1 - v / 100) * (height - 18);
    const color = css('--battery');
    const line = smoothPath(known.map(p => [x(p.t), y(p.v)]));
    const last = known[known.length - 1];
    const area = `${line} L${x(last.t).toFixed(1)} ${y(0).toFixed(1)} L${x(known[0].t).toFixed(1)} ${y(0).toFixed(1)} Z`;
    el.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Laadniveau vandaag">
        <defs>
          <linearGradient id="soc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${color}" stop-opacity="0.35"/>
            <stop offset="1" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="0" x2="${width}" y1="${y(100)}" y2="${y(100)}" stroke="${css('--line')}"/>
        <line x1="0" x2="${width}" y1="${y(0)}" y2="${y(0)}" stroke="${css('--line')}"/>
        <path d="${area}" fill="url(#soc-fill)"/>
        <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        <text x="${width - 2}" y="${y(100) + 10}" text-anchor="end" font-size="10" fill="${css('--muted')}">100%</text>
        ${[0, 6, 12, 18].map(h => `<text x="${Math.max(0, x(new Date(start).setHours(h)))}" y="${height - 2}" font-size="10" fill="${css('--muted')}">${String(h).padStart(2, '0')}</text>`).join('')}
      </svg>`;
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
        tiles.push({ iconName: 'euro', color: 'var(--accent)', label: 'Kosten', value: euro(t.cost), unit: '', delta: deltaBadge(t.cost, p.cost, true) });
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
      const hm = d => d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
      return `${hm(start)} – ${hm(end)}`;
    }
    if (bucket === 'month') return start.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
    return start.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // Month and weekday names in the language of the page; hours and days of the month as sent
  function axisLabel(row, bucket) {
    const date = new Date(row.start);
    if (bucket === 'month') return date.toLocaleDateString(LOCALE, { month: 'short' });
    if (bucket === 'day' && Number.isNaN(Number(row.label))) return date.toLocaleDateString(LOCALE, { weekday: 'short' });
    return row.label;
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
        axis += `<text x="${pad.left + band * i + band / 2}" y="${height - 4}" text-anchor="middle">${axisLabel(row, bucket)}</text>`;
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
    renderBars('gas-chart', rows, {
      positive: [{ key: 'gas', label: 'Gas', color: css('--gas') }],
      unit: 'm³',
      digits: 3,
      bucket,
    });
    const heatingChart = $('heating-chart');
    if (heatingChart) heatingChart.hidden = !history.available?.heating;
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
    setText('gas-total', `${nf(2).format(totals.gas)} m³${gasPerDegreeDay(history) ? ` · ${gasPerDegreeDay(history)}` : ''}`);
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
  let sankeyShape = '';
  function renderSankey(data, live = false) {
    const el = $('sankey');
    if (!el) return;
    setText('sankey-period', live ? 'nu · W' : `${PERIOD_LABELS[state.period] || ''} · kWh`);
    charts.set('sankey', renderSankeyBlock);
    if (!data?.links?.length) {
      el.style.removeProperty('--basis');
      el.innerHTML = `<div class="empty">${live ? 'Nu geen energiestroom gemeten' : 'Nog geen gegevens voor deze periode'}</div>`;
      sankeyShape = '';
      syncFlows();
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
      if (live) dots += flowDots(`sankey-link-${i}`, l.value, color, Math.min(4.5, Math.max(2, thickness / 2)), `sankey:${l.source}>${l.target}`);
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

    // The links grow from left to right when the chart shows something new, not on every update
    const shape = `${live}|${state.period}|${links.map(l => `${l.source}>${l.target}`).sort().join(',')}`;
    if (shape !== sankeyShape && !reducedMotion.matches) {
      el.querySelectorAll('.sankey-link').forEach(path => {
        path.style.setProperty('--len', Math.ceil(path.getTotalLength() + 2));
        path.style.animationDelay = `${byId.get(links[Number(path.id.slice(12))].source).column * 0.25}s`;
        path.classList.add('grow');
      });
    }
    sankeyShape = shape;
    syncFlows();
  }

  // ---------- Power through the day ----------

  // Like the HomeWizard app: above zero where the house got its power (solar used directly,
  // battery, grid), below zero what went back to the grid or into the battery, and a dashed
  // line for everything the panels produced. The day comes from Insights in steps of
  // 5 minutes; after the last step the line continues with the live readings of this page.
  const POWER_DAYS = { today: 'vandaag', yesterday: 'gisteren' };
  const POWER_FLOW_KEYS = ['solarToHome', 'solarToGrid', 'solarToBattery', 'gridToHome', 'gridToBattery', 'batteryToHome', 'batteryToGrid'];
  let powerShape = '';
  let powerPointer = null;

  function powerSource() {
    if (POWER_DAYS[state.period]) return { day: state.period, history: state.history };
    return { day: 'today', history: state.powerToday };
  }

  // Remembers today's live readings, to continue the line after the last Insights step
  function addLivePower(live) {
    if (!live || typeof live.homeW !== 'number') return;
    const f = live.flows || {};
    const point = { t: Date.parse(live.updated) || Date.now(), home: live.homeW, solar: Math.max(0, live.solarW || 0) };
    for (const key of POWER_FLOW_KEYS) point[key] = f[key] || 0;
    const midnight = new Date(point.t).setHours(0, 0, 0, 0);
    state.liveTrail = (state.liveTrail || []).filter(p => p.t >= midnight && p.t < point.t);
    state.liveTrail.push(point);
  }

  function powerSamples(power, day) {
    const start = Date.parse(power.start);
    const stepMs = power.step * 1000;
    const samples = power.points.map((p, i) => (p ? { t: start + (i + 0.5) * stepMs, ...p } : null));
    if (day === 'today') {
      const lastT = start + (power.points.length - 0.5) * stepMs;
      // Live readings come every 10 seconds; averaged per minute they follow the line calmly
      const minutes = new Map();
      for (const p of (state.liveTrail || []).filter(q => q.t > lastT)) {
        const key = Math.floor(p.t / 60000);
        if (!minutes.has(key)) minutes.set(key, []);
        minutes.get(key).push(p);
      }
      for (const list of minutes.values()) {
        const avg = { t: list.reduce((sum, p) => sum + p.t, 0) / list.length };
        for (const key of ['home', 'solar', ...POWER_FLOW_KEYS]) avg[key] = list.reduce((sum, p) => sum + p[key], 0) / list.length;
        samples.push(avg);
      }
    }
    return { start, samples };
  }

  // A smooth line through the points that never overshoots them (monotone cubic)
  function smoothPath(points, command = 'M') {
    const f = n => n.toFixed(1);
    const n = points.length;
    if (!n) return '';
    let d = `${command}${f(points[0][0])} ${f(points[0][1])}`;
    if (n === 1) return d;
    const slopes = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = points[i + 1][0] - points[i][0];
      slopes.push(dx ? (points[i + 1][1] - points[i][1]) / dx : 0);
    }
    const tangents = points.map((_, i) => {
      if (i === 0) return slopes[0];
      if (i === n - 1) return slopes[n - 2];
      return slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
    });
    for (let i = 0; i < n - 1; i++) {
      if (!slopes[i]) { tangents[i] = 0; tangents[i + 1] = 0; continue; }
      const a = tangents[i] / slopes[i];
      const b = tangents[i + 1] / slopes[i];
      const h = a * a + b * b;
      if (h > 9) {
        tangents[i] = 3 / Math.sqrt(h) * a * slopes[i];
        tangents[i + 1] = 3 / Math.sqrt(h) * b * slopes[i];
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const third = (x1 - x0) / 3;
      d += ` C${f(x0 + third)} ${f(y0 + tangents[i] * third)} ${f(x1 - third)} ${f(y1 - tangents[i + 1] * third)} ${f(x1)} ${f(y1)}`;
    }
    return d;
  }

  function renderPower() {
    const el = $('power-chart');
    if (!el) return;
    charts.set('power-chart', renderPower);
    const { day, history } = powerSource();
    setText('power-title', `Vermogen ${POWER_DAYS[day]}`);
    const summaryEl = $('power-summary');
    const power = history?.power;
    if (!power?.points?.length) {
      el.innerHTML = `<div class="empty">${history ? 'Geen vermogensgegevens van de P1-meter' : 'Laden…'}</div>`;
      if (summaryEl) summaryEl.innerHTML = '';
      return;
    }

    const hasBattery = Boolean(history.hasBattery);
    const hasSolar = history.available?.solar !== false;
    const colors = {
      solar: css('--solar'), grid: css('--grid'), export: css('--export'), battery: css('--battery'),
      batteryIn: css('--battery-in'), card: css('--card'),
    };

    // Two stacks on the same zero line, like the HomeWizard app. Both start with the solar power
    // used in the house; on top of that comes where the rest of the use came from (its top is the
    // use of the house) and where the rest of the solar power went (its top is all solar power).
    // Import and export rarely happen at the same moment, so the stacks hardly overlap.
    const self = { id: 'self', label: 'Zelfverbruik', arrow: '⇕', color: colors.solar, value: p => p.solarToHome || 0, total: t => t.solarToHome };
    const use = [
      hasBattery && { id: 'discharge', label: 'Uit batterij', arrow: '↗', color: colors.battery, value: p => p.batteryToHome || 0, total: t => t.batteryToHome },
      { id: 'import', label: 'Van het net', arrow: '↓', color: colors.grid, value: p => (p.gridToHome || 0) + (p.gridToBattery || 0), total: t => t.import },
    ].filter(Boolean);
    const sun = [
      hasBattery && { id: 'charge', label: 'Zon in batterij', arrow: '↘', color: colors.batteryIn, value: p => p.solarToBattery || 0, total: t => t.solarToBattery },
      { id: 'export', label: 'Teruggeleverd', arrow: '↑', color: colors.export, value: p => (p.solarToGrid || 0) + (p.batteryToGrid || 0), total: t => t.export },
    ].filter(Boolean);
    const layers = hasSolar ? [self, ...use, ...sun] : use;
    const stacks = hasSolar ? [[self, ...use], [self, ...sun]] : [use];

    const legendEl = $('power-legend');
    // Today: the expected solar power as a dashed line, when a forecast is set up
    const forecast = day === 'today' ? history.forecast : null;
    if (legendEl) {
      legendEl.innerHTML = layers.map(x => `<span><i style="background:${x.color}"></i>${x.label}</span>`).join('')
        + (forecast ? `<span><i class="legend-dash" style="border-color:${colors.solar}"></i>Verwachte zon</span>` : '');
    }

    // The header shows the day's totals, and the values at the pointer while hovering
    const readout = (title, values, unit = '') => `
      <div class="power-values">${values.map(({ layer, text }) =>
        `<span class="power-value" style="color:${layer.color}" title="${layer.label}"><b>${layer.arrow}</b>${text}</span>`).join('')}${unit ? `<span class="power-unit">${unit}</span>` : ''}</div>
      <div class="power-when">${title}</div>`;
    const t = history.totals || {};
    const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expected = forecast ? [forecast.days?.[dayKey(new Date())], forecast.days?.[dayKey(tomorrow)]] : [];
    const forecastText = typeof expected[0] === 'number'
      ? `<span> · verwacht vandaag ${formatEnergy(expected[0])} kWh${typeof expected[1] === 'number' ? ` · morgen ${formatEnergy(expected[1])} kWh` : ''}</span>`
      : '';
    const totalsHtml = readout(
      (hasSolar ? `${POWER_DAYS[day]} · verbruik ${formatEnergy(t.consumption)} kWh · zon ${formatEnergy(t.solar)} kWh` : `${POWER_DAYS[day]} · verbruik ${formatEnergy(t.consumption)} kWh`) + forecastText,
      layers.map(layer => ({ layer, text: formatEnergy(layer.total(t) || 0) })), 'kWh');
    if (summaryEl) summaryEl.innerHTML = totalsHtml;

    const { start, samples } = powerSamples(power, day);
    const valid = samples.filter(Boolean);
    const stackTop = (stack, p) => stack.reduce((sum, layer) => sum + layer.value(p), 0);
    const end0 = power.end ? Date.parse(power.end) : start + 86400000;
    const expectedLine = forecast ? forecast.watts.filter(p => p.t >= start && p.t <= end0) : [];
    const max = Math.max(100, ...valid.map(p => Math.max(...stacks.map(stack => stackTop(stack, p)))), ...expectedLine.map(p => p.w));

    const width = el.clientWidth || 600;
    const height = chartHeight(el, Number(el.dataset.height) || 240);
    const pad = { left: 4, right: 44, top: 10, bottom: 20 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const step = niceStep(max, height < 200 ? 3 : 4);
    const top = Math.ceil(max / step) * step;
    const scale = plotH / top;
    const end = power.end ? Date.parse(power.end) : start + 86400000;
    const dayMs = end - start;
    const X = time => pad.left + Math.min(1, Math.max(0, (time - start) / dayMs)) * plotW;
    const Y = watts => pad.top + plotH - watts * scale;
    const f = n => n.toFixed(1);
    const kW = step >= 1000;
    const tickLabel = v => (kW ? nf(step % 1000 ? 1 : 0).format(v / 1000) : nf(0).format(v));

    let axis = '';
    for (let v = 0; v <= top + 1e-9; v += step) {
      const yPos = f(Y(v));
      axis += `<line x1="${pad.left}" x2="${pad.left + plotW}" y1="${yPos}" y2="${yPos}" class="${v === 0 ? 'zero' : ''}"/>`;
      axis += `<text x="${width - pad.right + 6}" y="${Number(yPos) + 4}">${tickLabel(v)}${v === top ? (kW ? ' kW' : ' W') : ''}</text>`;
    }
    const hourEvery = plotW < 360 ? 6 : 3;
    for (let h = hourEvery; h < 24; h += hourEvery) {
      const x = X(new Date(start).setHours(h, 0, 0, 0));
      axis += `<text x="${f(x)}" y="${height - 4}" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`;
    }

    // Runs of samples without gaps, each drawn as its own areas
    const runs = [];
    let run = [];
    samples.forEach(p => {
      if (p) run.push(p);
      else if (run.length) { runs.push(run); run = []; }
    });
    if (run.length) runs.push(run);

    const gradients = layers.map(layer => `
      <linearGradient id="power-fill-${layer.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${layer.color}" stop-opacity="0.95"/>
        <stop offset="1" stop-color="${layer.color}" stop-opacity="0.45"/>
      </linearGradient>`).join('');

    // Upper layers first, so the zelfverbruik lies on top where the stacks meet
    let shapes = '';
    for (const list of runs) {
      const drawn = new Set();
      const pieces = [];
      for (const stack of stacks) {
        let below = () => 0;
        stack.forEach(layer => {
          const lower = below;
          const upper = p => lower(p) + layer.value(p);
          below = upper;
          if (drawn.has(layer.id)) return;
          drawn.add(layer.id);
          if (!list.some(p => layer.value(p) > 0)) return;
          const upperPts = list.map(p => [X(p.t), Y(upper(p))]);
          const lowerPts = list.map(p => [X(p.t), Y(lower(p))]).reverse();
          pieces.unshift(`<path class="power-area" d="${smoothPath(upperPts)} ${smoothPath(lowerPts, 'L')} Z" fill="url(#power-fill-${layer.id})"/>` +
            `<path class="power-edge" d="${smoothPath(upperPts)}" stroke="${layer.color}"/>`);
        });
      }
      shapes += pieces.join('');
    }
    if (expectedLine.length > 1) {
      shapes += `<path class="power-forecast" d="${smoothPath(expectedLine.map(p => [X(p.t), Y(p.w)]))}" stroke="${colors.solar}"/>`;
    }

    // Today the end of the chart pulses: that is now
    const last = valid[valid.length - 1];
    const nowDot = day === 'today' && last ? (() => {
      const x = f(X(last.t));
      const y = f(Y(Math.max(...stacks.map(stack => stackTop(stack, last)))));
      return `
        <line class="power-now-line" x1="${x}" x2="${x}" y1="${pad.top}" y2="${pad.top + plotH}"/>
        <circle class="power-now" cx="${x}" cy="${y}" r="5" fill="${colors.solar}" style="animation-delay:${syncDelay(2.8)}"/>
        <circle cx="${x}" cy="${y}" r="3.5" fill="${colors.solar}" stroke="${colors.card}" stroke-width="1.5"/>`;
    })() : '';

    // The chart draws itself from left to right when another day is shown
    const shape = `${day}|${power.start}`;
    const reveal = shape !== powerShape && !reducedMotion.matches;
    powerShape = shape;

    el.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
        <defs>${gradients}<clipPath id="power-clip"><rect class="${reveal ? 'power-reveal' : ''}" x="${pad.left}" y="0" width="${plotW}" height="${height}"/></clipPath></defs>
        <g class="axis">${axis}</g>
        <g clip-path="url(#power-clip)">${shapes}</g>
        ${nowDot}
        <g class="power-hover" visibility="hidden">
          <line class="power-cursor" y1="${pad.top}" y2="${pad.top + plotH}"/>
          ${stacks.map((_, i) => `<circle class="power-dot" data-stack="${i}" r="3.5" stroke="${colors.card}" stroke-width="1.5"/>`).join('')}
        </g>
      </svg>`;

    // A vertical line at the pointer; the header then shows the power at that moment
    const hover = el.querySelector('.power-hover');
    const hide = () => {
      hover.setAttribute('visibility', 'hidden');
      if (summaryEl) summaryEl.innerHTML = totalsHtml;
    };
    el.onpointerleave = () => {
      powerPointer = null;
      hide();
    };
    el.onpointermove = event => {
      powerPointer = { clientX: event.clientX, clientY: event.clientY };
      const box = el.querySelector('svg').getBoundingClientRect();
      const x = (event.clientX - box.left) * width / box.width;
      if (x < pad.left || x > pad.left + plotW || !valid.length) { hide(); return; }
      const time = start + (x - pad.left) / plotW * dayMs;
      let p = valid[0];
      for (const q of valid) if (Math.abs(q.t - time) < Math.abs(p.t - time)) p = q;
      if (Math.abs(p.t - time) > 30 * 60000) { hide(); return; }
      const px = f(X(p.t));
      hover.setAttribute('visibility', 'visible');
      const cursor = hover.querySelector('line');
      cursor.setAttribute('x1', px);
      cursor.setAttribute('x2', px);
      hover.querySelectorAll('.power-dot').forEach(dot => {
        const stack = stacks[Number(dot.dataset.stack)];
        const topLayer = [...stack].reverse().find(layer => layer.value(p) > 0) || stack[0];
        dot.setAttribute('cx', px);
        dot.setAttribute('cy', f(Y(stackTop(stack, p))));
        dot.setAttribute('fill', topLayer.color);
      });
      if (!summaryEl) return;
      const when = new Date(p.t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
      summaryEl.innerHTML = readout(
        `${when} · verbruik ${formatPower(stackTop(stacks[0], p))}${hasSolar ? ` · zon ${formatPower(p.solar)}` : ''}`,
        layers.map(layer => ({ layer, text: formatPower(layer.value(p)) })));
    };
    if (powerPointer) el.onpointermove(powerPointer);
  }

  // With week or month chosen, the chart (and the phases) still show today, which then needs its own history
  async function loadPowerToday() {
    if ((!$('power-chart') && !$('phases-chart')) || POWER_DAYS[state.period]) return;
    try {
      state.powerToday = await state.options.get('/history?period=today');
    } catch { /* keep what was shown */ }
    renderPower();
    renderPhaseChart();
  }

  // ---------- Prices ----------

  // Amounts in euro, or in the currency Homey Energy uses (kroner, pounds, francs)
  const euro = (value, digits = 2) => {
    const currency = state.live?.currency || 'EUR';
    if (currency === 'EUR') return `${value < 0 ? '−' : ''}€ ${nf(digits).format(Math.abs(value))}`;
    try {
      return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
    } catch {
      return `${currency} ${nf(digits).format(value)}`;
    }
  };
  const hm = iso => new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

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
    // Where the price comes from: Homey Energy (with the costs entered in Homey) or EnergyZero
    const fromHomey = prices.source === 'Homey';
    setText('prices-source', prices.homeyCosts ? 'all-in volgens Homey'
      : prices.allIn ? 'all-in: markt + belasting + opslag'
        : fromHomey ? 'marktprijs van Homey' : 'marktprijs incl. btw');
    setText('price-now', typeof prices.current === 'number' ? euro(prices.current, 3) : '–');

    const facts = [
      `<li><span>Laagste vandaag</span><strong>${euro(prices.min, 3)}</strong></li>`,
      `<li><span>Hoogste vandaag</span><strong>${euro(prices.max, 3)}</strong></li>`,
      `<li><span>Gemiddeld vandaag</span><strong>${euro(prices.avg, 3)}</strong></li>`,
    ];
    // What the power of this moment costs (or earns) per hour
    const gridW = state.live?.gridW;
    if (prices.allIn && typeof prices.current === 'number' && typeof gridW === 'number' && Math.abs(gridW) > 5) {
      facts.unshift(`<li><span>${gridW > 0 ? 'Afname kost nu' : 'Teruglevering levert nu'}</span><strong>${euro(Math.abs(gridW) / 1000 * prices.current)} per uur</strong></li>`);
    }
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
    const barW = Math.max(1, band * (list.length > 48 ? 0.8 : 0.7));
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
      // Prices per quarter hour or per hour
      const end = start + (p.minutes || 60) * 60000;
      const isNow = start <= now && now < end;
      const past = end <= now;
      const x = pad.left + band * i + (band - barW) / 2;
      const y0 = y(Math.max(0, p.price));
      const h = Math.max(1, Math.abs(y(p.price) - y(0)));
      bars += `<rect x="${x}" y="${y0}" width="${barW}" height="${h}" rx="${Math.min(3, barW / 3)}" fill="${priceColor(p.price, lo, hi)}" fill-opacity="${past ? 0.35 : 1}" ${isNow ? `stroke="${css('--text')}" stroke-width="1.5"` : ''}><title>${hm(p.t)}: ${euro(p.price, 3)}</title></rect>`;
      const hour = new Date(p.t).getHours();
      if (hour % 6 === 0 && new Date(p.t).getMinutes() === 0) {
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

  // A device without a meter of its own, whose use Homey estimates
  const estimateTag = d => (d.estimated ? ' <small class="muted estimate">geschat</small>' : '');

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
            <div class="consumer-row"><span>${escapeHtml(d.name)}${estimateTag(d)}</span><strong>${formatEnergy(d.kWh)}${total > 0 ? ` <small class="muted">${nf(0).format(d.kWh / total * 100)}%</small>` : ''}</strong></div>
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
      ['Vaste kosten', 'min vermindering energiebelasting', t.costs.fixed],
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
      // Meters report the current negative while the phase sends power back; the load on the
      // fuse is the same either way, and the bar turns the color of export
      const amps = typeof p.amps === 'number' ? Math.abs(p.amps) : (typeof p.watts === 'number' ? Math.abs(p.watts) / (p.volts || 230) : null);
      const exporting = (typeof p.amps === 'number' ? p.amps : p.watts) < 0;
      const load = amps === null ? 0 : amps / data.fuseAmps;
      const color = load > 0.9 ? 'var(--hot)' : load > 0.7 ? 'var(--warm)' : exporting ? 'var(--export)' : 'var(--home)';
      const main = typeof p.amps === 'number' ? `${nf(1).format(p.amps)} A` : formatPower(p.watts);
      const volts = typeof p.volts === 'number' ? ` <small class="muted">${nf(0).format(p.volts)} V</small>` : '';
      return `
        <li>
          <div class="consumer-row"><span${$('phases-chart') ? ` style="color:${PHASE_COLORS[(p.phase - 1) % 3]}"` : ''}>L${p.phase}</span><strong>${main}${volts}</strong></div>
          <div class="bar"><i style="width:${Math.min(100, Math.max(2, load * 100))}%;background:${color}"></i></div>
        </li>`;
    }).join('');
    renderPhaseChart();
  }

  // The phases through the day, one line each; with currents the main fuse as a dashed line.
  // With week or month chosen it shows today, like the power chart.
  const PHASE_COLORS = ['#5e8cff', '#ff9f0a', '#a55eea'];

  function renderPhaseChart() {
    const el = $('phases-chart');
    if (!el) return;
    charts.set('phases-chart', renderPhaseChart);
    const history = POWER_DAYS[state.period] ? state.history : state.powerToday;
    const data = history?.phaseHistory;
    const fuse = state.live?.phases?.fuseAmps;
    if (!data?.phases?.length) {
      el.innerHTML = '';
      return;
    }
    const width = el.clientWidth || 300;
    const height = chartHeight(el, Number(el.dataset.height) || 110);
    const pad = { left: 4, right: 34, top: 8, bottom: 16 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const start = Date.parse(data.start);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const amps = data.unit === 'A';
    const values = data.phases.flatMap(p => p.values.filter(v => typeof v === 'number'));
    const max = Math.max(amps && fuse ? fuse : 0, ...values.map(Math.abs), amps ? 1 : 100);
    const min = Math.min(0, ...values);
    const step = niceStep(max - min, 3);
    const top = Math.ceil(max / step) * step;
    const bottom = Math.floor(min / step) * step;
    const X = t => pad.left + (t - start) / (end - start) * plotW;
    const Y = v => pad.top + (top - v) / (top - bottom) * plotH;
    // Amperes, or watts (kW above 1000) for meters that only report power per phase
    const kw = !amps && top >= 1000;
    const tick = v => nf(kw && step % 1000 ? 1 : 0).format(kw ? v / 1000 : v);
    const unit = amps ? ' A' : kw ? ' kW' : ' W';
    let axis = '';
    for (let v = bottom; v <= top + 1e-9; v += step) {
      axis += `<line x1="${pad.left}" x2="${pad.left + plotW}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="${Math.abs(v) < 1e-9 ? 'zero' : ''}"/>`;
      axis += `<text x="${width - pad.right + 4}" y="${(Y(v) + 4).toFixed(1)}">${tick(v)}${v === top ? unit : ''}</text>`;
    }
    for (const h of [6, 12, 18]) axis += `<text x="${X(new Date(start).setHours(h)).toFixed(1)}" y="${height - 3}" text-anchor="middle">${String(h).padStart(2, '0')}</text>`;
    const fuseLine = amps && fuse
      ? `<line x1="${pad.left}" x2="${pad.left + plotW}" y1="${Y(fuse).toFixed(1)}" y2="${Y(fuse).toFixed(1)}" stroke="${css('--hot')}" stroke-dasharray="4 4" stroke-opacity="0.7"/>`
      : '';
    const lines = data.phases.map(p => {
      // Runs without gaps, each its own line
      const runs = [];
      let run = [];
      p.values.forEach((v, k) => {
        if (typeof v === 'number') run.push([X(start + (k + 0.5) * data.step * 1000), Y(v)]);
        else if (run.length) { runs.push(run); run = []; }
      });
      if (run.length) runs.push(run);
      return runs.map(points => `<path d="${smoothPath(points)}" fill="none" stroke="${PHASE_COLORS[(p.phase - 1) % 3]}" stroke-width="1.6" stroke-linejoin="round"/>`).join('');
    }).join('');
    const legend = data.phases.map((p, i) => `<text x="${pad.left + 4 + i * 30}" y="${pad.top + 9}" style="fill:${PHASE_COLORS[(p.phase - 1) % 3]};font-size:11px;font-weight:600">L${p.phase}</text>`).join('');
    el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Fasebelasting vandaag"><g class="axis">${axis}</g>${fuseLine}${lines}${legend}</svg>`;
  }

  // ---------- Monthly peak (Belgian capacity tariff) ----------

  function renderPeak(peak) {
    if (!$('peak-kw')) return;
    const ok = Boolean(peak && typeof peak.peakW === 'number');
    toggleEmpty('peak', ok);
    if (!ok) {
      setText('peak-empty', peak === undefined ? 'Verschijnt na het opslaan van de indeling'
        : 'Nog geen piek gemeten. Het dashboard meet elk kwartier je gemiddelde afname.');
      return;
    }
    const kw = w => `${nf(w >= 10000 ? 1 : 2).format(w / 1000)} kW`;
    setText('peak-kw', kw(peak.peakW));
    setText('peak-source', peak.source === 'meter' ? 'volgens je meter'
      : peak.since ? `gemeten sinds ${new Date(peak.since).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}` : 'gemeten');
    setText('peak-at', peak.at
      ? new Date(peak.at).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'hoogste kwartier deze maand');

    const facts = [];
    if (typeof peak.quarterW === 'number') {
      const limit = Math.max(peak.peakW, (peak.minKw || 0) * 1000);
      facts.push(`<li class="${peak.quarterW > limit ? 'over' : ''}"><span>Dit kwartier tot nu</span><strong>${kw(peak.quarterW)}</strong></li>`);
    }
    if (peak.peakW < (peak.minKw || 0) * 1000) {
      facts.push(`<li><span>Telt mee als het minimum</span><strong>${nf(1).format(peak.minKw)} kW</strong></li>`);
    }
    if (typeof peak.monthCost === 'number') facts.push(`<li><span>Kost deze maand</span><strong>${euro(peak.monthCost)}</strong></li>`);
    if (typeof peak.yearKw === 'number' && peak.months.length > 1) {
      facts.push(`<li><span>Gemiddelde 12 maanden</span><strong>${nf(2).format(peak.yearKw)} kW</strong></li>`);
    }
    if (typeof peak.yearCost === 'number') facts.push(`<li><span>Per jaar</span><strong>${euro(peak.yearCost, 0)}</strong></li>`);
    $('peak-facts').innerHTML = facts.join('');
    renderPeakChart(peak);
  }

  // The peak of each of the last 12 months, the minimum that counts as a dashed line
  function renderPeakChart(peak) {
    const el = $('peak-chart');
    if (!el) return;
    charts.set('peak-chart', () => renderPeakChart(peak));
    const months = peak.months || [];
    if (months.length < 2) {
      el.innerHTML = '';
      return;
    }
    const width = el.clientWidth || 300;
    const height = chartHeight(el, Number(el.dataset.height) || 110);
    const pad = { left: 26, right: 4, top: 6, bottom: 16 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = Math.max(...months.map(m => m.w / 1000), peak.minKw || 0, 1);
    const step = niceStep(max, 3);
    const top = Math.ceil(max / step) * step;
    const y = v => pad.top + plotH - v / top * plotH;
    const band = plotW / months.length;
    const barW = Math.max(2, Math.min(22, band * 0.64));
    let axis = '';
    for (let v = 0; v <= top + 1e-9; v += step) {
      axis += `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'zero' : ''}"/>`;
      axis += `<text x="${pad.left - 5}" y="${y(v) + 4}" text-anchor="end">${nf(step < 1 ? 1 : 0).format(v)}</text>`;
    }
    const color = css('--grid');
    let bars = '';
    months.forEach((m, i) => {
      const x = pad.left + band * i + (band - barW) / 2;
      const v = m.w / 1000;
      const current = i === months.length - 1;
      const date = new Date(`${m.month}-01T00:00:00`);
      bars += `<rect x="${x}" y="${y(v)}" width="${barW}" height="${Math.max(1, y(0) - y(v))}" rx="${Math.min(3, barW / 3)}" fill="${color}" fill-opacity="${current ? 1 : 0.55}"><title>${date.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })}: ${nf(2).format(v)} kW</title></rect>`;
      if (i % Math.ceil(months.length * 22 / plotW) === 0) axis += `<text x="${pad.left + band * i + band / 2}" y="${height - 3}" text-anchor="middle">${date.toLocaleDateString(LOCALE, { month: 'narrow' })}</text>`;
    });
    const floor = peak.minKw ? `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(peak.minKw)}" y2="${y(peak.minKw)}" stroke="${css('--muted')}" stroke-dasharray="3 4"/>` : '';
    el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Maandpiek"><g class="axis">${axis}</g>${floor}${bars}</svg>`;
  }

  // ---------- Battery use over time ----------

  // What the battery stored and delivered per hour, day or month, what that was worth on
  // average, and for a day the sessions: when it charged or delivered, from where, and at what price
  function renderBatteryHistory(history) {
    if (!$('batteryhistory-chart')) return;
    const ok = Boolean(history?.hasBattery);
    toggleEmpty('batteryhistory', ok);
    if (!ok) return;
    setText('batteryhistory-period', PERIOD_LABELS[state.period] || '');
    const t = history.totals;
    const info = history.batteryHistory || {};
    const period = (PERIOD_LABELS[state.period] || '').toLowerCase();
    const facts = [
      `<li><span>Geladen ${period}</span><strong>${formatEnergy(t.charge)} kWh</strong></li>`,
      `<li><span>Ontladen ${period}</span><strong>${formatEnergy(t.discharge)} kWh</strong></li>`,
    ];
    if (typeof info.chargePrice === 'number') facts.push(`<li><span>Laden kostte gemiddeld</span><strong>${euro(info.chargePrice, 3)} per kWh</strong></li>`);
    if (typeof info.dischargePrice === 'number') facts.push(`<li><span>Ontladen bespaarde gemiddeld</span><strong>${euro(info.dischargePrice, 3)} per kWh</strong></li>`);
    if (typeof info.chargePrice === 'number' && typeof info.dischargePrice === 'number') {
      facts.push(`<li><span>Verschil per kWh</span><strong>${euro(info.dischargePrice - info.chargePrice, 3)}</strong></li>`);
    }
    if (history.batteryEarnings) facts.push(`<li><span>Opbrengst ${period}</span><strong>${euro(history.batteryEarnings.withNetting)}</strong></li>`);
    $('batteryhistory-facts').innerHTML = facts.join('');

    const positive = [
      { key: 'batteryToHome', label: 'Naar huis', color: css('--battery') },
      { key: 'batteryToGrid', label: 'Naar het net', color: css('--export') },
    ];
    const negative = [
      { key: 'solarToBattery', label: 'Van de zon', color: css('--solar') },
      { key: 'gridToBattery', label: 'Van het net', color: css('--grid') },
    ];
    const legend = $('batteryhistory-legend');
    if (legend) legend.innerHTML = [...positive, ...negative].map(x => `<span><i style="background:${x.color}"></i>${x.label}</span>`).join('');
    renderBars('batteryhistory-chart', history.rows, { positive, negative, unit: 'kWh', bucket: history.bucket });

    // The sessions of a day, the latest first
    const list = $('batteryhistory-sessions');
    const sessions = info.sessions || [];
    list.hidden = !sessions.length;
    list.innerHTML = sessions.slice().reverse().slice(0, fixedHeight(list) ? 30 : 8).map(s => {
      const what = s.kind === 'charge'
        ? (s.share >= 0.5 ? 'Geladen van de zon' : 'Geladen van het net')
        : (s.share >= 0.5 ? 'Ontladen naar het net' : 'Ontladen naar huis');
      const price = typeof s.price === 'number' ? ` · ${euro(s.price, 3)}` : '';
      return `<li><span><b>${hm(s.start)}–${hm(s.end)}</b> <em>${what}</em></span><strong>${formatEnergy(s.kWh)} kWh${price}</strong></li>`;
    }).join('');
    setText('batteryhistory-note', 'Laden van de zon kost de teruglevering die je daardoor misloopt; ontladen bespaart de prijs van stroom van het net.');
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
      renderBattery(state.live.battery, state.history);
      renderNetting(state.live.netting);
      renderAlerts(state.live.alerts);
      renderConsumers(state.live);
      renderPrices(state.live.prices);
      renderBaseload(state.live.baseload);
      renderPhases(state.live.phases);
      renderPeak(state.live.peak);
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
      edit.info = await state.options.get(`/layout${layoutQuery()}`);
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
    fillLayoutChoice();
    [...$('blocks').children].forEach(decorate);
    renderHiddenBlocks();
  }

  // ---------- Named layouts ----------

  // The layout of this screen: from the address (?indeling=keuken or ?layout=keuken), else the
  // one chosen before on this screen, else the default
  const layoutQuery = () => (state.layoutName ? `?layout=${encodeURIComponent(state.layoutName)}` : '');

  function chooseLayout(name) {
    state.layoutName = name || '';
    try {
      if (state.layoutName) localStorage.setItem(LAYOUT_KEY, state.layoutName);
      else localStorage.removeItem(LAYOUT_KEY);
    } catch { /* storage unavailable */ }
  }

  function fillLayoutChoice() {
    const select = $('edit-layout');
    const names = edit.info.names || [];
    select.innerHTML = [['', 'Standaard indeling'], ...names.map(n => [n, n]), ['__new', 'Nieuwe indeling…']]
      .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
    select.value = state.layoutName && names.includes(state.layoutName) ? state.layoutName : '';
    edit.newLayout = false;
    $('edit-layout-name').hidden = true;
    $('edit-layout-name').value = '';
    $('edit-layout-remove').hidden = !state.layoutName;
  }

  // Another layout: show it and edit that one; a new one starts from what is on screen now
  async function switchLayout(value) {
    if (value === '__new') {
      edit.newLayout = true;
      $('edit-layout-name').hidden = false;
      $('edit-layout-name').focus();
      $('edit-layout-remove').hidden = true;
      return;
    }
    chooseLayout(value);
    stopEdit();
    state.layoutKey = null;
    await loadLive();
    startEdit();
  }

  function stopEdit() {
    state.editing = false;
    document.body.classList.remove('editing');
    $('edit-bar').hidden = true;
    [...$('blocks').children].forEach(undecorate);
  }

  async function saveEdit(layout, remove = false) {
    const pin = $('edit-pin').value;
    // A new layout needs a name of letters, digits or dashes
    let name = state.layoutName;
    if (edit.newLayout) {
      name = $('edit-layout-name').value.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(name)) {
        editStatus('Geef de indeling een naam van letters, cijfers of streepjes', true);
        $('edit-layout-name').focus();
        return;
      }
    }
    editStatus('Opslaan…');
    try {
      const info = await state.options.post('/layout', { layout, pin, name, remove });
      try { if (pin) localStorage.setItem(PIN_KEY, pin); } catch { /* storage unavailable */ }
      chooseLayout(info.name || '');
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
    $('edit-layout').addEventListener('change', e => switchLayout(e.target.value));
    $('edit-layout-remove').addEventListener('click', () => saveEdit(null, true));
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

  // ---------- Help and diagnosis ----------

  // Two buttons next to the pencil: "!" for "Share diagnosis" like in the app settings, and "?"
  // for the manual. Sharing makes the report, copies it, and opens an e-mail to the maker or a
  // GitHub issue with the report in it when it fits; nothing is sent until the user sends it there.
  const MANUAL = 'https://github.com/WNijhof/homey-energy-dashboard/blob/main/homey-app/README.md';
  const ISSUES = 'https://github.com/WNijhof/homey-energy-dashboard/issues/new';
  const MAIL_LIMIT = 1800;
  const GITHUB_LIMIT = 7000;

  function copyText(text) {
    // The dashboard runs on http in the home network, where navigator.clipboard is often missing
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(() => copyFallback(text));
    copyFallback(text);
    return Promise.resolve();
  }

  function copyFallback(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch { /* the report is shown, it can be selected */ }
    area.remove();
  }

  function subjectOf(report) {
    const apps = [...new Set([...(report.found?.batteries || []), ...(report.found?.solar || []), ...(report.batteryLike || []), report.found?.p1]
      .map(d => /^homey:app:([^:]+)/.exec(d?.app || '')?.[1]).filter(Boolean))];
    return `Diagnose: ${apps.join(', ') || report.version || ''}`;
  }

  function initHelpMenu() {
    const actions = document.querySelector('.header-actions');
    if (!actions || !state.options.get) return;
    const wrap = document.createElement('div');
    wrap.className = 'screen-menu help-menu';
    wrap.innerHTML = `
      <button class="icon-button" type="button" title="Probleem melden" aria-label="Probleem melden" aria-expanded="false">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/></svg>
      </button>
      <div class="screen-panel" hidden>
        <p class="screen-note">Wordt een apparaat niet gevonden of klopt er iets niet? Stuur de maker een rapport: welke apps en metingen je apparaten hebben, zonder namen, ruimtes of locatie.</p>
        <label class="screen-row"><span>Mijn dashboard meesturen</span><input type="checkbox" data-help="snapshot"></label>
        <button type="button" class="screen-row" data-help="mail"><span>Diagnose mailen</span><b>✉</b></button>
        <button type="button" class="screen-row" data-help="github"><span>Delen op GitHub</span><b>↗</b></button>
        <p class="screen-note" data-help="status"></p>
        <textarea class="help-report" readonly hidden></textarea>
      </div>`;
    const button = wrap.querySelector('button');
    const panel = wrap.querySelector('.screen-panel');
    const status = panel.querySelector('[data-help="status"]');
    const box = panel.querySelector('.help-report');
    const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (!panel.hidden) return close();
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    });
    document.addEventListener('click', event => { if (!wrap.contains(event.target)) close(); });

    panel.addEventListener('click', async event => {
      const kind = event.target.closest('[data-help="mail"], [data-help="github"]')?.dataset.help;
      if (!kind) return;
      // A window opened right away is not blocked; it gets its address once the report is made
      const tab = kind === 'github' ? window.open('about:blank', '_blank') : null;
      status.textContent = 'Rapport maken…';
      let shared;
      try {
        const snapshot = panel.querySelector('[data-help="snapshot"]').checked;
        shared = await state.options.get(`/diagnosis-report${snapshot ? '?snapshot=1' : ''}`);
      } catch (err) {
        if (tab) tab.close();
        status.textContent = `Rapport maken mislukt: ${err.message || err}`;
        return;
      }
      const pretty = JSON.stringify(shared.report, null, 2);
      box.value = pretty;
      box.hidden = false;
      await copyText(pretty);
      // The e-mail and issue in the language of the page
      const tr = text => window.EnergyI18n?.translate(text) ?? text;
      const intro = tr('Wat werkt er niet goed? (bijvoorbeeld: mijn batterij wordt niet gevonden)');
      const paste = tr('(Plak hier het rapport; het staat op je klembord.)');
      const subject = subjectOf(shared.report);
      if (kind === 'mail' && shared.email) {
        const compact = JSON.stringify(shared.report);
        const full = `${intro}\n\n\n${compact}\n`;
        const body = encodeURIComponent(full).length < MAIL_LIMIT ? full : `${intro}\n\n\n${paste}\n`;
        location.href = `mailto:${shared.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      } else {
        const full = `${intro}\n\n\n\`\`\`json\n${pretty}\n\`\`\`\n`;
        const body = encodeURIComponent(full).length < GITHUB_LIMIT ? full : `${intro}\n\n\n${paste}\n`;
        const url = `${ISSUES}?title=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
      }
      status.textContent = 'Het rapport staat op je klembord. Staat het nog niet in de mail of het issue, plak het er dan in.';
    });
    // "?" opens the manual
    const manual = document.createElement('a');
    manual.className = 'icon-button';
    manual.href = MANUAL;
    manual.target = '_blank';
    manual.rel = 'noopener';
    manual.title = 'Handleiding';
    manual.setAttribute('aria-label', 'Handleiding');
    manual.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.8"/><path d="M12 17h.01"/></svg>';
    const pencil = actions.querySelector('#edit-toggle');
    actions.insertBefore(wrap, pencil);
    actions.insertBefore(manual, pencil);
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
            <div class="consumer-row"><span>${escapeHtml(d.name)}${estimateTag(d)}</span><strong>${formatPower(d.watts)}</strong></div>
            <div class="bar"><i style="width:${Math.max(2, d.watts / max * 100)}%;background:var(--home)"></i></div>
          </li>`).join('')
      : '<li class="muted">Geen apparaten met stroommeting actief</li>';
  }

  // ---------- Data loading ----------

  async function loadLive() {
    if (state.liveBusy) return;
    state.liveBusy = true;
    try {
      const live = await state.options.get(`/live${layoutQuery()}`);
      // A new version of the app loads the new page, but not while the layout is being edited:
      // that would throw the changes away. It follows once editing stops.
      if (live.version && state.version && live.version !== state.version) {
        if (!state.editing) {
          location.reload();
          return;
        }
      } else {
        state.version = live.version || state.version;
      }
      state.live = live;
      // A screen that stays on past midnight shows the new day
      setText('today-label', new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }));
      const rebuilt = applyLayout(live.layout);
      renderFlow(live);
      renderBoiler(live.boiler);
      renderHeating(live.heating);
      renderEv(live.ev);
      renderBattery(live.battery, state.history);
      renderNetting(live.netting);
      renderAlerts(live.alerts);
      renderAlertPill(live.alerts);
      setMood(live);
      window.EnergyScreen?.setPlace?.(live.place);
      renderConsumers(live);
      renderPrices(live.prices);
      renderBaseload(live.baseload);
      renderPhases(live.phases);
      renderPeak(live.peak);
      renderWater(live, state.history);
      if (state.sankeyMode === 'live') renderSankeyBlock();
      addLivePower(live);
      renderPower();
      if (rebuilt && state.history) renderHistory(state.history);
      if (rebuilt && !state.history) loadHistory();
      relayout();

      if (live.snapshot) {
        // A snapshot from a user's diagnosis, played back in the pc version
        setStatus('demo', 'Momentopname');
        setBanner('', `<strong>Momentopname van ${escapeHtml(new Date(live.snapshot).toLocaleString(LOCALE))}.</strong>`);
      } else if (live.demo) {
        setStatus('demo', 'Demo');
        setBanner('', state.options.demoMessage || '');
      } else {
        setStatus('live', 'Live');
        setBanner('', !live.devices.p1 && state.options.missingHint
          ? `<span>Niet gevonden: P1-meter.</span> ${state.options.missingHint}`
          : '');
      }
    } catch (err) {
      setStatus('error', 'Geen verbinding');
      setMood(null);
      setBanner('error', `<strong>Kan geen gegevens ophalen.</strong> ${escapeHtml(err.message || err)}`);
    } finally {
      state.liveBusy = false;
    }
    changed();
  }

  async function loadHistory() {
    const period = state.period;
    // A slow Homey should not get a pile of requests; a new period does start a new one
    if (state.historyBusy === period) return;
    state.historyBusy = period;
    try {
      const history = await state.options.get(`/history?period=${period}`);
      if (period !== state.period) return;
      state.history = history;
      renderHistory(history);
      loadPowerToday();
    } catch (err) {
      if (period === state.period) {
        ['electricity-chart', 'solar-chart', 'gas-chart', 'power-chart'].forEach(id => {
          const el = $(id);
          if (el) el.innerHTML = `<div class="empty">${escapeHtml(err.message || err)}</div>`;
        });
      }
    } finally {
      if (state.historyBusy === period) state.historyBusy = null;
    }
    changed();
  }

  function renderHistory(history) {
    renderTiles(history);
    renderCharts(history);
    renderSolarPerf(history);
    renderPower();
    renderGauges(history);
    renderDeviceEnergy(history);
    renderCosts(history);
    renderBatteryHistory(history);
    renderPhaseChart();
    renderWater(state.live, history);
    if (state.live) {
      renderBoiler(state.live.boiler);
      renderHeating(state.live.heating);
      renderEv(state.live.ev);
      renderBattery(state.live.battery, history);
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
    return Boolean($('blocks')) || ['tiles', 'electricity-chart', 'solar-chart', 'gas-chart', 'boiler-history', 'sankey', 'power-chart'].some(id => $(id));
  }

  function redraw() {
    renderAll();
    changed();
  }

  // options.get(path) returns a promise with the JSON for '/live' or '/history?period=…'
  function start(options) {
    state.options = options;
    const params = new URLSearchParams(location.search);
    const fromAddress = params.get('indeling') ?? params.get('layout');
    let remembered = '';
    try { remembered = localStorage.getItem(LAYOUT_KEY) || ''; } catch { /* storage unavailable */ }
    chooseLayout(fromAddress !== null ? fromAddress.toLowerCase() : remembered);
    window.EnergyI18n?.start();
    setText('today-label', new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }));

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

    // Colors come from CSS, so redraw when the theme switches between light and dark, by the
    // system or by the screen menu
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
    window.addEventListener('energy-theme', redraw);

    initEditMode();
    // While the night screen is black the page rests; it catches up when woken
    const resting = () => document.hidden || window.EnergyScreen?.sleeping();
    window.EnergyScreen?.start({
      wake: () => {
        loadLive();
        if (needsHistory()) loadHistory();
      },
    });
    // After the screen menu, so the help button sits right next to the pencil
    initHelpMenu();
    loadLive();
    setInterval(() => { if (!resting()) loadLive(); }, LIVE_INTERVAL);
    if (needsHistory()) {
      selectPeriod(state.period);
      setInterval(() => { if (!resting()) loadHistory(); }, HISTORY_INTERVAL);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      loadLive();
      if (needsHistory()) loadHistory();
    });
  }

  // The CSV of the period on screen, in the language of the page
  const exportUrl = () => `api/export?period=${state.period}&lang=${window.EnergyI18n?.lang || 'nl'}`;

  window.EnergyDashboard = { start, redraw, exportUrl };

})();
