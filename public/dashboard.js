"use strict";
(function() {
  var _a, _b;
  const LIVE_INTERVAL = 10 * 1e3;
  const HISTORY_INTERVAL = 60 * 1e3;
  const PERIOD_KEY = "energy-dashboard-period";
  const LAYOUT_KEY = "energy-dashboard-layout";
  const SANKEY_MODE_KEY = "energy-dashboard-sankey";
  const state = {
    period: "today",
    live: null,
    history: null,
    options: {},
    layoutKey: null,
    editing: false,
    sankeyMode: "live",
    // An earlier moment of the chosen day (ms) that the blocks of now show, or null for now
    at: null
  };
  const LOCALE = ((_a = window.EnergyI18n) == null ? void 0 : _a.locale) || "nl-NL";
  const $ = (id) => document.getElementById(id);
  const nf = (digits = 0) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'
  };
  const icon = (name, size = 24) => '<svg viewBox="0 0 24 24" width="'.concat(size, '" height="').concat(size, '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">').concat(ICONS[name], "</svg>");
  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const PERIOD_LABELS = { today: "Vandaag", yesterday: "Gisteren", week: "Deze week", month: "Deze maand", year: "Dit jaar" };
  const PREVIOUS_LABELS = {
    today: "gisteren tot hetzelfde uur",
    week: "vorige week tot dezelfde dag",
    month: "vorige maand tot dezelfde dag",
    year: "vorig jaar tot dezelfde maand"
  };
  function formatPower(watts) {
    if (typeof watts !== "number") return "–";
    const abs = Math.abs(watts);
    return abs >= 1e3 ? "".concat(nf(abs >= 1e4 ? 1 : 2).format(abs / 1e3), " kW") : "".concat(nf(0).format(abs), " W");
  }
  function formatEnergy(kWh) {
    if (typeof kWh !== "number") return "–";
    const digits = kWh >= 100 ? 0 : kWh >= 10 ? 1 : 2;
    return nf(digits).format(kWh);
  }
  function formatPercent(fraction) {
    return typeof fraction === "number" ? nf(0).format(fraction * 100) : "–";
  }
  function fmtTemp(value) {
    return typeof value === "number" ? "".concat(nf(value % 1 ? 1 : 0).format(value), "°") : "–";
  }
  function toggleEmpty(prefix, hasData) {
    const empty = $("".concat(prefix, "-empty"));
    if (!empty) return;
    empty.hidden = hasData;
    empty.closest("section").querySelectorAll("[data-".concat(prefix, "]")).forEach((el) => {
      el.hidden = !hasData;
    });
  }
  function applyLayout(layout) {
    const container = $("blocks");
    if (!container || !Array.isArray(layout) || state.editing) return false;
    const key = JSON.stringify(layout);
    if (key === state.layoutKey) return false;
    state.layoutKey = key;
    charts.clear();
    container.innerHTML = "";
    for (const block of layout) {
      const element = createBlock(block);
      if (element) container.appendChild(element);
    }
    relayout();
    watchSizes();
    return true;
  }
  function createBlock({ id, size, rows }) {
    const template = $("block-".concat(id));
    if (!template) return null;
    const element = template.content.firstElementChild.cloneNode(true);
    element.classList.add("block", "size-".concat(size));
    element.dataset.block = id;
    if (rows) element.dataset.rows = rows;
    element.querySelectorAll("[data-height]").forEach((chart) => chart.style.setProperty("--basis", "".concat(chart.dataset.height, "px")));
    initSankeyMode(element);
    addInfo(element, id);
    return element;
  }
  const ROW = 24;
  const GAP = 16;
  const MIN_ROWS = 4;
  const MAX_ROWS = 80;
  const rowsFor = (height) => Math.ceil((height + GAP) / ROW);
  const heightOf = (rows) => rows * ROW - GAP;
  const wideScreen = () => matchMedia("(min-width: 640px)").matches;
  const fixedHeight = (el) => {
    var _a2;
    return Boolean((_a2 = el == null ? void 0 : el.closest(".block")) == null ? void 0 : _a2.dataset.rows) && wideScreen();
  };
  function relayout() {
    const container = $("blocks");
    if (!container) return;
    container.classList.add("rows");
    const blocks = [...container.children].filter((el) => el.classList.contains("block"));
    if (!blocks.length) return;
    container.classList.add("measuring");
    const natural = blocks.map((el) => el.offsetHeight);
    container.classList.add("measuring-min");
    const smallest = blocks.map((el) => el.offsetHeight);
    container.classList.remove("measuring", "measuring-min");
    const wide = wideScreen();
    blocks.forEach((el, i) => {
      el.dataset.minRows = Math.max(MIN_ROWS, rowsFor(smallest[i]));
      const chosen = wide ? Number(el.dataset.rows) || 0 : 0;
      const rows = chosen ? Math.max(chosen, Number(el.dataset.minRows)) : rowsFor(natural[i]);
      const span = "span ".concat(el.hidden ? 1 : rows);
      if (el.style.gridRowEnd !== span) el.style.gridRowEnd = span;
    });
  }
  let redrawTimer;
  function redrawSoon() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(() => {
      charts.forEach((render) => render());
      if (state.live) {
        renderFlow(state.live);
        renderBoiler(state.live.boiler);
      }
      relayout();
      changed();
    }, 120);
  }
  const lastSizes = /* @__PURE__ */ new WeakMap();
  const sizeWatcher = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
    let changedSize = false;
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      const last = lastSizes.get(entry.target);
      if (!last || Math.abs(last.width - width) > 2 || Math.abs(last.height - height) > 2) {
        changedSize = true;
        lastSizes.set(entry.target, { width, height });
      }
    }
    if (changedSize) redrawSoon();
  }) : null;
  function watchSizes() {
    if (!sizeWatcher) return;
    sizeWatcher.disconnect();
    document.querySelectorAll("#blocks .fill").forEach((el) => sizeWatcher.observe(el));
  }
  function changed() {
    if (state.options.onRender) state.options.onRender();
  }
  function setStatus(kind, text) {
    const el = $("status");
    if (!el) return;
    el.className = "status ".concat(kind);
    el.querySelector("span").textContent = text;
  }
  function setBanner(kind, html) {
    const el = $("banner");
    if (!el) return;
    el.hidden = !html;
    el.className = "banner ".concat(kind);
    el.innerHTML = html || "";
  }
  const systemReduced = matchMedia("(prefers-reduced-motion: reduce)");
  const reducedMotion = {
    get matches() {
      var _a2;
      return ((_a2 = window.EnergyScreen) == null ? void 0 : _a2.reducedMotion) ? window.EnergyScreen.reducedMotion() : systemReduced.matches;
    }
  };
  const flowsStill = () => {
    var _a2;
    return ((_a2 = window.EnergyScreen) == null ? void 0 : _a2.flowsStill) ? window.EnergyScreen.flowsStill() : false;
  };
  const flowMemory = /* @__PURE__ */ new Map();
  const TAIL = 4;
  let flowItems = [];
  let flowFrame = 0;
  let flowTime = 0;
  const flowPace = () => {
    var _a2;
    return ((_a2 = window.EnergyScreen) == null ? void 0 : _a2.flowPace) ? window.EnergyScreen.flowPace() : 1;
  };
  const flowSpeed = (watts) => flowPace() * 190 / Math.max(0.9, 4.2 - Math.log10(watts) * 0.9);
  const flowWidth = (watts) => 2.5 + Math.min(3, Math.max(0, Math.log10(watts) - 1.5));
  const syncDelay = (seconds) => "-".concat((performance.now() / 1e3 % seconds).toFixed(2), "s");
  function flowDots(pathId, watts, color, radius = 4.5, key = pathId) {
    if (!(watts > 5)) return "";
    return '<g class="flow-particles" data-path="'.concat(pathId, '" data-key="').concat(escapeHtml(key), '" data-watts="').concat(watts, '" data-color="').concat(color, '" data-r="').concat(radius, '"></g>');
  }
  function syncFlows() {
    const seen = /* @__PURE__ */ new Set();
    flowItems = [...document.querySelectorAll(".flow-particles")].map((g) => {
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
      const spacing = watts > 2e3 ? 48 : watts > 500 ? 62 : 90;
      const count = Math.max(1, Math.round(length / spacing));
      let html = "";
      for (let i = 0; i < count; i++) {
        let tail = "";
        for (let k = 1; k <= TAIL; k++) {
          tail += '<circle class="flow-tail" r="'.concat((r * (1 - k / (TAIL + 1.5))).toFixed(2), '" fill="').concat(color, '" opacity="').concat((0.55 * (1 - k / (TAIL + 1))).toFixed(2), '"/>');
        }
        html += '<g class="flow-particle">'.concat(tail, '<g class="flow-head">\n          <circle r="').concat((r * 2.4).toFixed(2), '" fill="').concat(color, '" opacity="0.16"/>\n          <circle r="').concat(r, '" fill="').concat(color, '"/>\n          <circle r="').concat((r * 0.42).toFixed(2), '" fill="#fff" opacity="0.85"/>\n        </g></g>');
      }
      g.innerHTML = html;
      const parts = [...g.querySelectorAll(".flow-particle")].map((el) => ({
        el,
        head: el.querySelector(".flow-head"),
        tail: [...el.querySelectorAll(".flow-tail")]
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
      p.el.setAttribute("opacity", Math.max(0, Math.min(1, d / 16, (length - d) / 16)).toFixed(2));
      const head = path.getPointAtLength(d);
      p.head.setAttribute("transform", "translate(".concat(head.x.toFixed(1), " ").concat(head.y.toFixed(1), ")"));
      p.tail.forEach((c, k) => {
        const td = d - (k + 1) * gap;
        if (td < 0) {
          c.setAttribute("visibility", "hidden");
          return;
        }
        const point = path.getPointAtLength(td);
        c.setAttribute("visibility", "visible");
        c.setAttribute("cx", point.x.toFixed(1));
        c.setAttribute("cy", point.y.toFixed(1));
      });
    });
  }
  function flowStep(now) {
    const dt = flowTime ? Math.min(0.1, (now - flowTime) / 1e3) : 0;
    flowTime = now;
    for (const item of flowItems) {
      const m = item.memory;
      m.speed += (item.target - m.speed) * Math.min(1, dt * 1.5);
      m.offset = (m.offset + m.speed * dt) % item.length;
      placeParticles(item);
    }
    flowFrame = flowItems.length && !flowsStill() ? requestAnimationFrame(flowStep) : 0;
  }
  window.addEventListener("energy-motion", syncFlows);
  if (!window.EnergyScreen) (_b = systemReduced.addEventListener) == null ? void 0 : _b.call(systemReduced, "change", syncFlows);
  const shownValues = /* @__PURE__ */ new Map();
  function tweenValues(root) {
    root.querySelectorAll("[data-tween]").forEach((el) => {
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
      const step = (now) => {
        if (shown.token !== token) return;
        const t = Math.min(1, (now - started) / 900);
        shown.value = from + (to - from) * (1 - Math.pow(1 - t, 3));
        el.textContent = formatPower(t < 1 ? shown.value : to);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  function node({ x, y, color, iconName, label, labelAbove, value, watts, sub, ring, total, active, spin }) {
    const r = 44;
    const labelY = labelAbove ? -(r + (total ? 24 : 8)) : r + 18;
    const totalY = labelAbove ? -(r + 8) : r + 34;
    const tween = typeof watts === "number" ? ' data-tween="'.concat(iconName, '" data-watts="').concat(watts, '"') : "";
    return '\n      <g transform="translate('.concat(x, " ").concat(y, ')">\n        ').concat(active ? '<circle r="'.concat(r, '" class="node-pulse" stroke="').concat(color, '" style="animation-delay:').concat(syncDelay(2.8), '"/>') : "", '\n        <circle r="').concat(r, '" class="node-ring" stroke="').concat(ring ? "transparent" : color, '"/>\n        ').concat(ring || "", '\n        <g transform="translate(-11 -30)" style="color:').concat(color, '"><g class="').concat(spin ? "node-spin" : "", '" style="').concat(spin ? "animation-delay:".concat(syncDelay(24)) : "", '">').concat(icon(iconName, 22), '</g></g>\n        <text class="node-value" y="11"').concat(tween, ">").concat(value, "</text>\n        ").concat(sub ? '<text class="node-sub" y="27">'.concat(sub, "</text>") : "", '\n        <text class="node-label" y="').concat(labelY, '">').concat(label, "</text>\n        ").concat(total ? '<text class="node-total" y="'.concat(totalY, '">').concat(total, "</text>") : "", "\n      </g>");
  }
  function homeRing(parts) {
    const r = 44;
    const c = 2 * Math.PI * r;
    const total = parts.reduce((sum, p) => sum + p.value, 0);
    if (total <= 0) return '<circle r="'.concat(r, '" fill="none" stroke="').concat(css("--home"), '" stroke-width="3"/>');
    let offset = 0;
    return parts.filter((p) => p.value > 0).map((p) => {
      const length = c * p.value / total;
      const arc = '<circle r="'.concat(r, '" fill="none" stroke="').concat(p.color, '" stroke-width="3" stroke-dasharray="').concat(length, " ").concat(c, '" stroke-dashoffset="').concat(-offset, '" transform="rotate(-90)"/>');
      offset += length;
      return arc;
    }).join("");
  }
  function renderFlow(live) {
    var _a2, _b2, _c;
    const el = $("flow");
    if (!el) return;
    const hasSolar = typeof live.solarW === "number";
    const hasBattery = Boolean(live.battery);
    const grid = (_a2 = live.gridW) != null ? _a2 : 0;
    const solar = (_b2 = live.solarW) != null ? _b2 : 0;
    const home = (_c = live.homeW) != null ? _c : 0;
    const f = live.flows || {};
    const colors = {
      solar: css("--solar"),
      grid: css("--grid"),
      home: css("--home"),
      export: css("--export"),
      battery: css("--battery")
    };
    const line = (id, d, watts, color, hidden) => {
      if (hidden) return '<path id="'.concat(id, '" class="flow-line" style="stroke:none" d="').concat(d, '"/>');
      if (!(watts > 5)) return '<path id="'.concat(id, '" class="flow-line" d="').concat(d, '"/>');
      const width = flowWidth(watts);
      return '<path class="flow-glow" stroke="'.concat(color, '" stroke-width="').concat((width + 8).toFixed(1), '" d="').concat(d, '"/>') + '<path id="'.concat(id, '" class="flow-line" stroke="').concat(color, '" stroke-opacity="0.4" stroke-width="').concat(width.toFixed(1), '" d="').concat(d, '"/>');
    };
    const today = live.today;
    const extra = today ? 16 : 0;
    const top = hasSolar ? 24 + extra : 0;
    const y = hasSolar ? 244 + extra : 60;
    const H = (hasSolar ? 314 : 170) + extra * (hasSolar ? 2 : 1) + (hasBattery ? 150 : 0);
    const by = y + 150;
    const kWh = (v) => "".concat(formatEnergy(v || 0), " kWh");
    const totals = today ? {
      solar: kWh(today.solar),
      grid: hasSolar || today.export > 0 ? "af ".concat(formatEnergy(today.import), " · terug ").concat(formatEnergy(today.export), " kWh") : kWh(today.import),
      home: kWh(today.consumption),
      battery: "in ".concat(formatEnergy(today.charge), " · uit ").concat(formatEnergy(today.discharge), " kWh")
    } : {};
    const gridSub = grid < -5 ? "terug" : grid > 5 ? "afname" : "";
    const batteryW = hasBattery ? live.battery.watts : 0;
    const batterySub = batteryW > 5 ? "laden" : batteryW < -5 ? "ontladen" : "";
    const soc = hasBattery && typeof live.battery.soc === "number" ? " ".concat(nf(0).format(live.battery.soc), "%") : "";
    el.style.setProperty("--basis", "".concat(Math.round(Math.min(480, (el.clientWidth || 420) * H / 420)), "px"));
    el.innerHTML = '\n      <svg viewBox="0 0 420 '.concat(H, '" role="img" aria-label="Actuele energiestroom">\n        ').concat(line("p-grid-home", "M 116 ".concat(y, " L 304 ").concat(y), f.gridToHome, colors.grid), "\n        ").concat(hasSolar ? "\n          ".concat(line("p-solar-home", "M 238 ".concat(92 + top, " C 262 ").concat(140 + top, " 280 ").concat(160 + top, " 306 ").concat(186 + top), f.solarToHome, colors.solar), "\n          ").concat(line("p-solar-grid", "M 182 ".concat(92 + top, " C 158 ").concat(140 + top, " 140 ").concat(160 + top, " 114 ").concat(186 + top), f.solarToGrid, colors.export), "\n        ") : "", "\n        ").concat(hasBattery ? "\n          ".concat(line("p-battery-home", "M 238 ".concat(by - 34, " C 262 ").concat(by - 82, " 280 ").concat(by - 102, " 306 ").concat(y + 34), f.batteryToHome, colors.battery), "\n          ").concat(line("p-grid-battery", "M 114 ".concat(y + 34, " C 140 ").concat(by - 102, " 158 ").concat(by - 82, " 182 ").concat(by - 34), Math.max(f.gridToBattery || 0, f.batteryToGrid || 0), f.gridToBattery > 5 ? colors.grid : colors.export), "\n          ").concat(line("p-battery-grid", "M 182 ".concat(by - 34, " C 158 ").concat(by - 82, " 140 ").concat(by - 102, " 114 ").concat(y + 34), 0, "", true), "\n          ").concat(hasSolar ? line("p-solar-battery", "M 210 ".concat(100 + top, " L 210 ").concat(by - 44), f.solarToBattery, colors.battery) : "", "\n        ") : "", "\n        ").concat(flowDots("p-grid-home", f.gridToHome, colors.grid), "\n        ").concat(hasSolar ? flowDots("p-solar-home", f.solarToHome, colors.solar) : "", "\n        ").concat(hasSolar ? flowDots("p-solar-grid", f.solarToGrid, colors.export) : "", "\n        ").concat(hasBattery ? flowDots("p-battery-home", f.batteryToHome, colors.battery) : "", "\n        ").concat(hasBattery ? flowDots("p-grid-battery", f.gridToBattery, colors.grid) : "", "\n        ").concat(hasBattery ? flowDots("p-battery-grid", f.batteryToGrid, colors.export) : "", "\n        ").concat(hasBattery && hasSolar ? flowDots("p-solar-battery", f.solarToBattery, colors.solar) : "", "\n        ").concat(hasSolar ? node({ x: 210, y: 56 + top, color: colors.solar, iconName: "sun", label: "Zon", labelAbove: true, value: formatPower(solar), watts: solar, total: totals.solar, active: solar > 5, spin: solar > 5 }) : "", "\n        ").concat(node({ x: 70, y, color: grid < -5 ? colors.export : colors.grid, iconName: "grid", label: "Net", value: formatPower(grid), watts: grid, sub: gridSub, total: totals.grid, active: Math.abs(grid) > 5 }), "\n        ").concat(node({
      x: 350,
      y,
      color: colors.home,
      iconName: "home",
      label: "Huis",
      value: formatPower(home),
      watts: home,
      total: totals.home,
      ring: homeRing([
        { value: f.solarToHome || 0, color: colors.solar },
        { value: f.batteryToHome || 0, color: colors.battery },
        { value: f.gridToHome || 0, color: colors.grid }
      ])
    }), "\n        ").concat(hasBattery ? node({ x: 210, y: by, color: colors.battery, iconName: "battery", label: "Batterij".concat(soc), value: formatPower(batteryW), watts: batteryW, sub: batterySub, total: totals.battery, active: Math.abs(batteryW) > 5 }) : "", "\n      </svg>");
    syncFlows();
    tweenValues(el);
    const updated = $("live-updated");
    if (updated && live.at) {
      const day = new Date(live.at).toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? "vandaag" : "gisteren";
      updated.textContent = today ? "kWh = ".concat(day, " tot ").concat(hhmm(Date.parse(live.at) + TIMELINE_STEP)) : hhmm(live.at);
    } else if (updated) {
      const time = new Date(live.updated).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      updated.textContent = today ? "kWh = vandaag · ".concat(time) : "bijgewerkt ".concat(time);
    }
  }
  const BOILER_STATES = {
    warm: { label: "Warm", color: "--hot" },
    lukewarm: { label: "Lauw", color: "--warm" },
    cold: { label: "Koud", color: "--cold" },
    unknown: { label: "Onbekend", color: "--muted" }
  };
  function renderGauge(temperature, status) {
    const el = $("boiler-gauge");
    if (!el) return;
    const min = 20;
    const max = 75;
    const r = 62;
    const c = 2 * Math.PI * r;
    const arc = c * 270 / 360;
    const fraction = typeof temperature === "number" ? Math.min(1, Math.max(0, (temperature - min) / (max - min))) : 0;
    const info = BOILER_STATES[status] || BOILER_STATES.unknown;
    el.innerHTML = '\n      <svg viewBox="0 0 150 150" role="img" aria-label="Watertemperatuur">\n        <defs>\n          <linearGradient id="temp-gradient" x1="0" y1="1" x2="1" y2="0">\n            <stop offset="0" stop-color="'.concat(css("--cold"), '"/>\n            <stop offset="0.55" stop-color="').concat(css("--warm"), '"/>\n            <stop offset="1" stop-color="').concat(css("--hot"), '"/>\n          </linearGradient>\n        </defs>\n        <g transform="translate(75 75) rotate(135)">\n          <circle r="').concat(r, '" fill="none" stroke="').concat(css("--track"), '" stroke-width="12" stroke-linecap="round" stroke-dasharray="').concat(arc, " ").concat(c, '"/>\n          <circle r="').concat(r, '" fill="none" stroke="url(#temp-gradient)" stroke-width="12" stroke-linecap="round" stroke-dasharray="').concat(Math.max(0.01, arc * fraction), " ").concat(c, '"/>\n        </g>\n        <text class="temp" x="75" y="80">').concat(typeof temperature === "number" ? "".concat(nf(temperature % 1 ? 1 : 0).format(temperature), "°") : "–", '</text>\n        <text class="state" x="75" y="102" fill="').concat(css(info.color), '">').concat(info.label, "</text>\n      </svg>");
  }
  function renderBoilerHistory(points, assumptions) {
    const el = $("boiler-history");
    if (!el) return;
    if (!(points == null ? void 0 : points.length) || !["today", "yesterday"].includes(state.period)) {
      el.innerHTML = "";
      return;
    }
    const width = el.clientWidth || 300;
    const height = chartHeight(el, 70);
    const start2 = new Date(points[0].t);
    start2.setHours(0, 0, 0, 0);
    const span = 24 * 3600 * 1e3;
    const values = points.map((p) => p.v);
    const lo = Math.min(assumptions.showerTemp - 5, ...values);
    const hi = Math.max(assumptions.warmFrom + 5, ...values);
    const x = (t) => (new Date(t) - start2) / span * width;
    const y = (v) => 6 + (1 - (v - lo) / (hi - lo)) * (height - 20);
    const line = points.map((p, i) => "".concat(i ? "L" : "M").concat(x(p.t).toFixed(1), " ").concat(y(p.v).toFixed(1))).join(" ");
    const area = "".concat(line, " L").concat(x(points[points.length - 1].t).toFixed(1), " ").concat(height - 14, " L").concat(x(points[0].t).toFixed(1), " ").concat(height - 14, " Z");
    const showerY = y(assumptions.showerTemp);
    el.innerHTML = '\n      <svg viewBox="0 0 '.concat(width, " ").concat(height, '" preserveAspectRatio="none" role="img" aria-label="Boilertemperatuur">\n        <defs>\n          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">\n            <stop offset="0" stop-color="').concat(css("--hot"), '" stop-opacity="0.28"/>\n            <stop offset="1" stop-color="').concat(css("--hot"), '" stop-opacity="0"/>\n          </linearGradient>\n        </defs>\n        <line x1="0" x2="').concat(width, '" y1="').concat(showerY, '" y2="').concat(showerY, '" stroke="').concat(css("--cold"), '" stroke-dasharray="3 4" stroke-opacity="0.6"/>\n        <text x="').concat(width - 2, '" y="').concat(showerY - 4, '" text-anchor="end" font-size="10" fill="').concat(css("--muted"), '">').concat(assumptions.showerTemp, '°</text>\n        <path d="').concat(area, '" fill="url(#spark-fill)"/>\n        <path d="').concat(line, '" fill="none" stroke="').concat(css("--hot"), '" stroke-width="2" stroke-linejoin="round"/>\n        ').concat([0, 6, 12, 18, 24].map((h) => '<text x="'.concat(Math.min(width - 12, Math.max(0, h / 24 * width)), '" y="').concat(height - 2, '" font-size="10" fill="').concat(css("--muted"), '">').concat(String(h).padStart(2, "0"), "</text>")).join(""), "\n      </svg>");
  }
  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }
  function renderBoiler(boiler) {
    var _a2;
    const card = $("boiler-card");
    if (!card) return;
    const empty = $("boiler-empty");
    card.hidden = !boiler && !empty;
    if (empty) {
      empty.hidden = !!boiler;
      card.querySelectorAll("[data-boiler]").forEach((el) => {
        el.hidden = !boiler;
      });
    }
    if (!boiler) return;
    setText("boiler-name", boiler.name || "Boiler");
    setText("boiler-mode", boiler.available ? boiler.on === false ? "Uit" : boiler.mode || "" : "Niet beschikbaar");
    renderGauge(boiler.temperature, boiler.status);
    setText("shower-minutes", typeof boiler.minutes === "number" ? "± ".concat(boiler.minutes) : "–");
    setText("boiler-showers", typeof boiler.showers === "number" ? boiler.showers : "–");
    const showersRow = $("boiler-showers-row");
    if (showersRow) showersRow.hidden = typeof boiler.showers !== "number";
    const heatingRow = $("boiler-heating-row");
    if (heatingRow) heatingRow.hidden = typeof boiler.heating !== "boolean";
    setText("boiler-target", typeof boiler.target === "number" ? "".concat(boiler.target, " °C") : "–");
    const heating = $("boiler-heating");
    if (heating) heating.innerHTML = boiler.heating ? '<span class="heating-dot"></span>Ja' : "Nee";
    const a = boiler.assumptions;
    setText("boiler-note", "Doucheminuten zijn een schatting: ".concat(a.liters, " L boiler, douchen op ").concat(a.showerTemp, " °C met ").concat(a.showerFlow, " L/min."));
    renderBoilerHistory((_a2 = state.history) == null ? void 0 : _a2.boilerTemperature, a);
  }
  function renderHeating(heating) {
    var _a2, _b2, _c;
    if (!$("room-temp")) return;
    toggleEmpty("heating", Boolean(heating));
    if (!heating) return;
    const t = heating.thermostat;
    $("room-temp").innerHTML = t ? '<span class="big-number">'.concat(fmtTemp(t.temperature), '</span>\n         <span class="big-unit">').concat(escapeHtml(t.name)).concat(typeof t.target === "number" ? " · ingesteld ".concat(fmtTemp(t.target)) : "", "</span>") : "";
    const mode = ((_a2 = heating.devices.find((d) => d.mode)) == null ? void 0 : _a2.mode) || (t == null ? void 0 : t.mode) || "";
    setText("heating-mode", mode);
    const history = state.history;
    const period = (PERIOD_LABELS[state.period] || "").toLowerCase();
    const facts = heating.devices.map((d) => "\n      <li><span>".concat(escapeHtml(d.name), "</span><strong>").concat(formatPower(d.watts), "</strong></li>"));
    if ((_b2 = history == null ? void 0 : history.available) == null ? void 0 : _b2.heating) {
      facts.push("<li><span>Stroom ".concat(period, "</span><strong>").concat(formatEnergy(history.totals.heating), " kWh</strong></li>"));
    }
    if ((_c = history == null ? void 0 : history.available) == null ? void 0 : _c.gas) {
      facts.push("<li><span>Gas ".concat(period, " (hele huis)</span><strong>").concat(nf(2).format(history.totals.gas), " m³</strong></li>"));
      const perDay = gasPerDegreeDay(history, true);
      if (perDay) facts.push("<li><span>Gas per graaddag</span><strong>".concat(perDay, "</strong></li>"));
    }
    $("heating-facts").innerHTML = facts.join("");
  }
  function renderEv(ev) {
    var _a2, _b2, _c, _d, _e;
    if (!$("ev-power")) return;
    toggleEmpty("ev", Boolean(ev));
    if (!ev) return;
    const chargers = ev.chargers;
    const watts = chargers.reduce((sum, c) => sum + (c.watts || 0), 0);
    const charging = chargers.some((c) => c.charging);
    setText("ev-name", chargers.length === 1 ? chargers[0].name : "Laadpalen");
    setText("ev-state", chargers.length === 1 ? chargers[0].state || "" : charging ? "Laden" : "");
    setText("ev-power", formatPower(watts));
    setText("ev-power-label", charging ? "aan het laden" : "vermogen");
    const history = state.history;
    const period = (PERIOD_LABELS[state.period] || "").toLowerCase();
    const facts = [];
    if ((_a2 = history == null ? void 0 : history.available) == null ? void 0 : _a2.ev) {
      facts.push("<li><span>Geladen ".concat(period, "</span><strong>").concat(formatEnergy(history.totals.ev), " kWh</strong></li>"));
    }
    const soc = (_d = (_b2 = ev.car) == null ? void 0 : _b2.soc) != null ? _d : (_c = chargers.find((c) => typeof c.soc === "number")) == null ? void 0 : _c.soc;
    if (typeof soc === "number") {
      facts.push("<li><span>Accu ".concat(escapeHtml(((_e = ev.car) == null ? void 0 : _e.name) || "auto"), "</span><strong>").concat(nf(0).format(soc), "%</strong></li>"));
    }
    if (chargers.length > 1) {
      chargers.forEach((c) => facts.push("<li><span>".concat(escapeHtml(c.name), "</span><strong>").concat(formatPower(c.watts), "</strong></li>")));
    }
    $("ev-facts").innerHTML = facts.join("");
  }
  function gasPerDegreeDay(history, withDelta = false) {
    const t = history == null ? void 0 : history.totals;
    if (!t || !(t.degreeDays >= 3) || !(t.gas > 0)) return null;
    const value = t.gas / t.degreeDays;
    const text = "".concat(nf(3).format(value), " m³ per graaddag");
    const p = history.previous;
    if (!withDelta || !p || !(p.degreeDays >= 3) || !(p.gas > 0)) return text;
    return "".concat(text).concat(deltaBadge(value, p.gas / p.degreeDays, true));
  }
  function renderSolarPerf(history) {
    var _a2, _b2;
    if (!$("solar-chart")) return;
    const t = history.totals;
    const rows = history.rows;
    const expected = history.expectedSolar;
    const facts = [];
    let actual = 0;
    let wanted = 0;
    if (expected == null ? void 0 : expected.perBucket) {
      expected.perBucket.forEach((v, i) => {
        if (typeof v === "number" && v > 0) {
          wanted += v;
          actual += rows[i].solar || 0;
        }
      });
    }
    let label = "Verwacht";
    if (state.period === "today" && ((_b2 = (_a2 = history.forecast) == null ? void 0 : _a2.watts) == null ? void 0 : _b2.length)) {
      const now = Date.now();
      const dayStart = (/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0);
      wanted = history.forecast.watts.filter((p) => p.t >= dayStart && p.t < now).reduce((sum, p) => sum + p.w * 0.25 / 1e3, 0);
      actual = t.solar;
      label = "Verwacht tot nu";
      if (expected == null ? void 0 : expected.day) facts.push("<li><span>Verwacht vandaag</span><strong>".concat(formatEnergy(expected.day), " kWh</strong></li>"));
    } else if ((expected == null ? void 0 : expected.day) && ["today", "yesterday"].includes(state.period)) {
      wanted = expected.day;
      actual = t.solar;
    }
    if (wanted > 0.05) {
      facts.push("<li><span>".concat(label, "</span><strong>").concat(formatEnergy(wanted), " kWh</strong></li>"));
      facts.push("<li><span>Prestatie t.o.v. verwachting</span><strong>".concat(nf(0).format(actual / wanted * 100), "%</strong></li>"));
    }
    if (history.kwp > 0) {
      facts.push("<li><span>Per kWp</span><strong>".concat(formatEnergy(t.solar / history.kwp), " kWh</strong></li>"));
    }
    if (history.bucket !== "hour") {
      const best = rows.reduce((a, b) => (b.solar || 0) > ((a == null ? void 0 : a.solar) || 0) ? b : a, null);
      if ((best == null ? void 0 : best.solar) > 0) facts.push("<li><span>Beste ".concat(history.bucket === "month" ? "maand" : "dag", "</span><strong>").concat(bucketTitle(best, history.bucket), " · ").concat(formatEnergy(best.solar), " kWh</strong></li>"));
    }
    const devices = history.solarDevices || [];
    if (devices.length > 1) {
      devices.forEach((d) => facts.push("<li><span>".concat(escapeHtml(d.name), "</span><strong>").concat(formatEnergy(d.kWh), " kWh</strong></li>")));
    }
    const factsEl = $("solar-facts");
    if (factsEl) factsEl.innerHTML = facts.join("");
    renderSolarPerfChart(rows, history.bucket, expected == null ? void 0 : expected.perBucket);
  }
  function renderSolarPerfChart(rows, bucket, expected) {
    const el = $("solar-chart");
    if (!el) return;
    charts.set("solar-chart", () => renderSolarPerfChart(rows, bucket, expected));
    const values = rows.map((r) => r.solar || 0);
    const max = Math.max(0.1, ...values, ...(expected || []).filter((v) => typeof v === "number"));
    if (!values.some((v) => v > 0)) {
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
    const y = (v) => pad.top + plotH - v / top * plotH;
    const band = plotW / rows.length;
    const barW = Math.max(2, Math.min(24, band * 0.64));
    const solar = css("--solar");
    const labelEvery = Math.ceil(rows.length * 26 / plotW);
    let axis = "";
    for (let v = 0; v <= top + 1e-9; v += step) {
      axis += '<line x1="'.concat(pad.left, '" x2="').concat(width - pad.right, '" y1="').concat(y(v), '" y2="').concat(y(v), '" class="').concat(v === 0 ? "zero" : "", '"/>');
      axis += '<text x="'.concat(pad.left - 6, '" y="').concat(y(v) + 4, '" text-anchor="end">').concat(nf(step < 1 ? 1 : 0).format(v), "</text>");
    }
    let bars = "";
    rows.forEach((r, i) => {
      const x = pad.left + band * i + (band - barW) / 2;
      const v = r.solar || 0;
      const e = expected == null ? void 0 : expected[i];
      const good = typeof e === "number" && e > 0 ? v / e : null;
      bars += '<rect x="'.concat(x, '" y="').concat(y(v), '" width="').concat(barW, '" height="').concat(Math.max(0, y(0) - y(v)), '" rx="').concat(Math.min(3, barW / 3), '" fill="').concat(solar, '" fill-opacity="').concat(good === null || good >= 0.9 ? 1 : 0.55, '"><title>').concat(bucketTitle(r, bucket), ": ").concat(formatEnergy(v), " kWh").concat(typeof e === "number" ? " / ".concat(formatEnergy(e), " kWh") : "", "</title></rect>");
      if (typeof e === "number") bars += '<line x1="'.concat(x - 2, '" x2="').concat(x + barW + 2, '" y1="').concat(y(e), '" y2="').concat(y(e), '" stroke="').concat(css("--text"), '" stroke-width="2" stroke-linecap="round" opacity="0.6"/>');
      if (i % labelEvery === 0) axis += '<text x="'.concat(pad.left + band * i + band / 2, '" y="').concat(height - 4, '" text-anchor="middle">').concat(axisLabel(r, bucket), "</text>");
    });
    el.innerHTML = '<svg viewBox="0 0 '.concat(width, " ").concat(height, '" width="').concat(width, '" height="').concat(height, '"><g class="axis">').concat(axis, "</g>").concat(bars, "</svg>");
  }
  function renderAlerts(alerts) {
    const el = $("alerts");
    if (!el) return;
    if (alerts === void 0) {
      el.innerHTML = '<li class="alert ok"><i></i><span>Verschijnt na het opslaan van de indeling</span></li>';
      return;
    }
    const list = alerts || [];
    el.innerHTML = list.length ? list.map((a) => '<li class="alert '.concat(a.level === "warning" ? "warning" : "", '"><i></i><span>').concat(escapeHtml(a.text), "</span></li>")).join("") : '<li class="alert ok"><i></i><span>Geen meldingen</span></li>';
  }
  function renderAlertPill(alerts) {
    const status = $("status");
    if (!status) return;
    let pill = $("alert-pill");
    const warnings = (alerts || []).filter((a) => a.level === "warning" && a.text);
    if (!warnings.length) {
      if (pill) pill.remove();
      return;
    }
    if (!pill) {
      pill = document.createElement("button");
      pill.type = "button";
      pill.id = "alert-pill";
      pill.className = "alert-pill";
      pill.addEventListener("click", () => {
        var _a2, _b2;
        return (_b2 = (_a2 = $("alerts")) == null ? void 0 : _a2.closest(".block, .card")) == null ? void 0 : _b2.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      status.after(pill);
    }
    const text = warnings.length === 1 ? warnings[0].text : "".concat(warnings.length, " meldingen");
    if (pill.dataset.text !== text) {
      pill.dataset.text = text;
      pill.innerHTML = "<i></i><span>".concat(escapeHtml(text), "</span>");
    }
  }
  function setMood(live) {
    let mood = "";
    if (!live) mood = "error";
    else {
      const f = live.flows || {};
      const solarHome = f.solarToHome || 0;
      const gridHome = f.gridToHome || 0;
      const batteryHome = f.batteryToHome || 0;
      const charging = (f.solarToBattery || 0) + (f.gridToBattery || 0);
      if ((f.solarToGrid || 0) > 100) mood = "solar";
      else if (charging > 100) mood = "battery";
      else if (solarHome > 100 && solarHome >= gridHome + batteryHome) mood = "solar";
      else if (batteryHome > 100 && batteryHome >= gridHome) mood = "battery";
      else if (gridHome > 100) mood = "grid";
    }
    const root = document.documentElement;
    if ((root.dataset.mood || "") === mood) return;
    if (mood) root.dataset.mood = mood;
    else delete root.dataset.mood;
  }
  function renderNetting(netting) {
    if (!$("netting-extra")) return;
    const empty = $("netting-empty");
    const ok = Boolean(netting && netting.extra !== null && netting.export > 0);
    toggleEmpty("netting", ok);
    if (!ok) {
      if (empty) {
        empty.textContent = netting === void 0 ? "Verschijnt na het opslaan van de indeling" : !netting ? "Laden…" : !(netting.export > 0) ? "Nog geen teruglevering gemeten." : "Vul je stroomcontract in bij de instellingen om dit te berekenen.";
      }
      return;
    }
    const basis = netting.basis === "lastYear" ? "op basis van vorig jaar" : "op basis van dit jaar tot nu";
    setText("netting-basis", basis);
    setText("netting-extra", "± ".concat(euro(netting.extra, 0)));
    const facts = [
      "<li><span>Teruggeleverd</span><strong>".concat(nf(0).format(netting.export), " kWh</strong></li>"),
      "<li><span>Daarvan gesaldeerd</span><strong>".concat(nf(0).format(netting.netted), " kWh</strong></li>")
    ];
    if (typeof netting.perKWh === "number") {
      facts.push("<li><span>Elke kWh die je zelf gebruikt in plaats van teruglevert, bespaart</span><strong>".concat(euro(netting.perKWh, 2), "</strong></li>"));
    }
    $("netting-facts").innerHTML = facts.join("");
    setText("netting-note", "Salderen stopt op 1 januari 2027. Daarna betaal je voor alles wat je van het net haalt, en krijg je voor teruglevering alleen de terugleververgoeding. Meer zelf gebruiken op zonnige uren of een thuisbatterij verkleint dit bedrag. Berekend met je contract uit de instellingen.");
  }
  function renderBattery(battery, history) {
    var _a2;
    if (!$("battery-soc")) return;
    toggleEmpty("battery", Boolean(battery));
    if (!battery) return;
    const color = css("--battery");
    const soc = typeof battery.soc === "number" ? battery.soc : null;
    const watts = battery.watts || 0;
    setText("battery-name", ((_a2 = battery.names) == null ? void 0 : _a2.length) === 1 ? battery.names[0] : "Thuisbatterij");
    setText("battery-state", watts > 5 ? "Laden" : watts < -5 ? "Ontladen" : "Rust");
    setText("battery-soc", soc === null ? "–" : "".concat(nf(0).format(soc), "%"));
    setText("battery-power", Math.abs(watts) > 5 ? "".concat(watts > 0 ? "laadt" : "levert", " ").concat(formatPower(watts)) : "laadniveau");
    const gauge2 = $("battery-gauge");
    if (gauge2) {
      const level = Math.max(0, Math.min(100, soc != null ? soc : 0));
      const inner = 60 * level / 100;
      gauge2.innerHTML = '\n        <svg viewBox="0 0 44 72" role="img" aria-label="Laadniveau">\n          <rect x="15" y="1" width="14" height="5" rx="2" fill="'.concat(css("--track"), '"/>\n          <rect x="3" y="6" width="38" height="64" rx="8" fill="none" stroke="').concat(css("--track"), '" stroke-width="3"/>\n          <rect class="').concat(watts > 5 ? "battery-charging" : "", '" x="8" y="').concat((66 - inner).toFixed(1), '" width="28" height="').concat(Math.max(0, inner).toFixed(1), '" rx="4" fill="').concat(level < 15 ? css("--hot") : color, '"/>\n        </svg>');
    }
    const period = (PERIOD_LABELS[state.period] || "").toLowerCase();
    const t = history == null ? void 0 : history.totals;
    const facts = [];
    if (t) {
      facts.push("<li><span>Geladen ".concat(period, "</span><strong>").concat(formatEnergy(t.charge), " kWh</strong></li>"));
      facts.push("<li><span>Ontladen ".concat(period, "</span><strong>").concat(formatEnergy(t.discharge), " kWh</strong></li>"));
      if (["month", "year"].includes(state.period) && t.charge > 5 && t.discharge > 0) {
        facts.push("<li><span>Rendement</span><strong>".concat(formatPercent(Math.min(1, t.discharge / t.charge)), "%</strong></li>"));
      }
      if (t.charge > 0.05) {
        facts.push("<li><span>Geladen met zon</span><strong>".concat(formatPercent(Math.min(1, (t.solarToBattery || 0) / t.charge)), "%</strong></li>"));
      }
    }
    const earnings = history == null ? void 0 : history.batteryEarnings;
    if (earnings) {
      facts.push("<li><span>Opbrengst ".concat(period, "</span><strong>").concat(euro(earnings.withNetting), "</strong></li>"));
      if (Math.abs(earnings.withoutNetting - earnings.withNetting) >= 0.01) {
        facts.push("<li><span>Zonder salderen (vanaf 2027)</span><strong>".concat(euro(earnings.withoutNetting), "</strong></li>"));
      }
    }
    if ((battery.devices || []).length > 1) {
      battery.devices.forEach((d) => facts.push("<li><span>".concat(escapeHtml(d.name), "</span><strong>").concat(typeof d.soc === "number" ? "".concat(nf(0).format(d.soc), "% · ") : "").concat(formatPower(d.watts), "</strong></li>")));
    }
    $("battery-facts").innerHTML = facts.join("");
    renderBatteryChart(["today", "yesterday"].includes(state.period) ? history == null ? void 0 : history.batterySoc : null);
  }
  function renderBatteryChart(series) {
    const el = $("battery-chart");
    if (!el) return;
    charts.set("battery-chart", () => renderBatteryChart(series));
    const points = series ? series.values.map((v, i) => typeof v === "number" ? { t: Date.parse(series.start) + (i + 0.5) * series.step * 1e3, v } : null) : [];
    const known = points.filter(Boolean);
    if (known.length < 2) {
      el.innerHTML = "";
      return;
    }
    const width = el.clientWidth || 300;
    const height = chartHeight(el, 90);
    const start2 = Date.parse(series.start);
    const end = new Date(start2);
    end.setDate(end.getDate() + 1);
    const x = (time) => (time - start2) / (end - start2) * width;
    const y = (v) => 4 + (1 - v / 100) * (height - 18);
    const color = css("--battery");
    const line = smoothPath(known.map((p) => [x(p.t), y(p.v)]));
    const last = known[known.length - 1];
    const area = "".concat(line, " L").concat(x(last.t).toFixed(1), " ").concat(y(0).toFixed(1), " L").concat(x(known[0].t).toFixed(1), " ").concat(y(0).toFixed(1), " Z");
    el.innerHTML = '\n      <svg viewBox="0 0 '.concat(width, " ").concat(height, '" width="').concat(width, '" height="').concat(height, '" role="img" aria-label="Laadniveau vandaag">\n        <defs>\n          <linearGradient id="soc-fill" x1="0" y1="0" x2="0" y2="1">\n            <stop offset="0" stop-color="').concat(color, '" stop-opacity="0.35"/>\n            <stop offset="1" stop-color="').concat(color, '" stop-opacity="0"/>\n          </linearGradient>\n        </defs>\n        <line x1="0" x2="').concat(width, '" y1="').concat(y(100), '" y2="').concat(y(100), '" stroke="').concat(css("--line"), '"/>\n        <line x1="0" x2="').concat(width, '" y1="').concat(y(0), '" y2="').concat(y(0), '" stroke="').concat(css("--line"), '"/>\n        <path d="').concat(area, '" fill="url(#soc-fill)"/>\n        <path d="').concat(line, '" fill="none" stroke="').concat(color, '" stroke-width="2" stroke-linejoin="round"/>\n        <text x="').concat(width - 2, '" y="').concat(y(100) + 10, '" text-anchor="end" font-size="10" fill="').concat(css("--muted"), '">100%</text>\n        ').concat([0, 6, 12, 18].map((h) => '<text x="'.concat(Math.max(0, x(new Date(start2).setHours(h))), '" y="').concat(height - 2, '" font-size="10" fill="').concat(css("--muted"), '">').concat(String(h).padStart(2, "0"), "</text>")).join(""), "\n      </svg>");
  }
  function deltaBadge(current, previous, lowerIsBetter) {
    if (typeof previous !== "number" || typeof current !== "number" || previous <= 0.01) return "";
    const change = (current - previous) / previous;
    if (Math.abs(change) < 5e-3) return '<span class="delta">= gelijk</span>';
    const good = lowerIsBetter ? change < 0 : change > 0;
    return '<span class="delta '.concat(good ? "good" : "bad", '" title="t.o.v. ').concat(escapeHtml(PREVIOUS_LABELS[state.period] || "vorige periode"), '">').concat(change > 0 ? "▲" : "▼", " ").concat(nf(0).format(Math.abs(change) * 100), "%</span>");
  }
  function tile({ iconName, color, label, value, unit, bar, delta = "" }) {
    return '\n      <div class="tile">\n        <div class="tile-head"><span class="tile-icon" style="background:'.concat(color, '">').concat(icon(iconName, 16), '</span><span class="tile-label">').concat(label, '</span></div>\n        <div class="tile-value">').concat(value, "<small>").concat(unit, "</small>").concat(delta, "</div>\n        ").concat(typeof bar === "number" ? '<div class="bar"><i style="width:'.concat(Math.round(bar * 100), "%;background:").concat(color, '"></i></div>') : "", "\n      </div>");
  }
  function renderTiles(history) {
    var _a2, _b2;
    const el = $("tiles");
    if (!el) return;
    const t = history.totals;
    const compact = el.dataset.compact !== void 0;
    const available = history.available || {};
    const hasSolar = available.solar !== false;
    const p = history.previous || {};
    const tiles = [
      { iconName: "home", color: "var(--home)", label: "Verbruik", value: formatEnergy(t.consumption), unit: "kWh", delta: deltaBadge(t.consumption, p.consumption, true) },
      { iconName: "import", color: "var(--grid)", label: compact ? "Net" : "Van het net", value: formatEnergy(t.import), unit: "kWh", delta: deltaBadge(t.import, p.import, true) }
    ];
    if (hasSolar) {
      tiles.push(
        { iconName: "sun", color: "var(--solar)", label: compact ? "Zon" : "Zon opgewekt", value: formatEnergy(t.solar), unit: "kWh", delta: deltaBadge(t.solar, p.solar, false) },
        { iconName: "export", color: "var(--export)", label: compact ? "Terug" : "Teruggeleverd", value: formatEnergy(t.export), unit: "kWh" }
      );
    }
    if (available.gas !== false) {
      tiles.push({ iconName: "flame", color: "var(--gas)", label: "Gas", value: nf(t.gas >= 10 ? 1 : 2).format(t.gas), unit: "m³", delta: deltaBadge(t.gas, p.gas, true) });
    }
    if (available.water) {
      tiles.push({ iconName: "drop", color: "var(--water)", label: "Water", value: nf(0).format(t.water), unit: "L", delta: deltaBadge(t.water, p.water, true) });
    }
    if (hasSolar || history.hasBattery) {
      tiles.push({ iconName: "leaf", color: "var(--home)", label: compact ? "Zelf" : "Zelfvoorzienend", value: formatPercent(t.selfSufficiency), unit: "%", bar: (_a2 = t.selfSufficiency) != null ? _a2 : 0 });
    }
    if (history.hasBattery) {
      tiles.push(
        { iconName: "battery", color: "var(--battery)", label: compact ? "Geladen" : "Batterij geladen", value: formatEnergy(t.charge), unit: "kWh" },
        { iconName: "battery", color: "var(--battery)", label: compact ? "Ontladen" : "Batterij ontladen", value: formatEnergy(t.discharge), unit: "kWh" }
      );
    }
    if (!compact && hasSolar) {
      tiles.push({ iconName: "cycle", color: "var(--solar)", label: "Eigen zon gebruikt", value: formatPercent(t.selfConsumption), unit: "%", bar: (_b2 = t.selfConsumption) != null ? _b2 : 0 });
    }
    if (!compact) {
      if (typeof t.cost === "number") {
        tiles.push({ iconName: "euro", color: "var(--accent)", label: "Kosten", value: euro(t.cost), unit: "", delta: deltaBadge(t.cost, p.cost, true) });
      }
    }
    el.innerHTML = tiles.map(tile).join("");
  }
  function niceStep(range, ticks) {
    const raw = range / ticks;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const normalized = raw / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }
  function bucketTitle(row, bucket) {
    const start2 = new Date(row.start);
    if (bucket === "hour") {
      const end = new Date(start2.getTime() + 36e5);
      const hm2 = (d) => d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
      return "".concat(hm2(start2), " – ").concat(hm2(end));
    }
    if (bucket === "month") return start2.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
    return start2.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });
  }
  function axisLabel(row, bucket) {
    const date = new Date(row.start);
    if (bucket === "month") return date.toLocaleDateString(LOCALE, { month: "short" });
    if (bucket === "day" && Number.isNaN(Number(row.label))) return date.toLocaleDateString(LOCALE, { weekday: "short" });
    return row.label;
  }
  const charts = /* @__PURE__ */ new Map();
  function chartHeight(el, fallback) {
    return el.closest("#blocks.rows") && el.clientHeight >= 40 ? el.clientHeight : fallback;
  }
  function renderBars(elId, rows, opts) {
    const el = $(elId);
    if (!el) return;
    const { positive, negative = [], unit, digits = 2, bucket } = opts;
    charts.set(elId, () => renderBars(elId, rows, opts));
    const sumOf = (row, series) => series.reduce((s, x) => s + (row[x.key] || 0), 0);
    const maxPos = Math.max(0, ...rows.map((r) => sumOf(r, positive)));
    const maxNeg = Math.max(0, ...rows.map((r) => sumOf(r, negative)));
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
    let axis = "";
    for (let v = -bottom; v <= top + 1e-9; v += step) {
      const yPos = zeroY - v * scale;
      axis += '<line x1="'.concat(pad.left, '" x2="').concat(width - pad.right, '" y1="').concat(yPos, '" y2="').concat(yPos, '" class="').concat(Math.abs(v) < 1e-9 ? "zero" : "", '"/>');
      axis += '<text x="'.concat(pad.left - 6, '" y="').concat(yPos + 4, '" text-anchor="end">').concat(nf(tickDigits).format(Math.abs(v)), "</text>");
    }
    let bars = "";
    rows.forEach((row, i) => {
      const x = pad.left + band * i + (band - barW) / 2;
      let yUp = zeroY;
      positive.forEach((series, s) => {
        const h = (row[series.key] || 0) * scale;
        if (h <= 0) return;
        const isTop = positive.slice(s + 1).every((next) => !(row[next.key] > 0));
        yUp -= h;
        bars += '<rect x="'.concat(x, '" y="').concat(yUp, '" width="').concat(barW, '" height="').concat(h, '" rx="').concat(isTop ? Math.min(4, barW / 3) : 0, '" fill="').concat(series.color, '"/>');
      });
      let yDown = zeroY;
      negative.forEach((series) => {
        const h = (row[series.key] || 0) * scale;
        if (h <= 0) return;
        bars += '<rect x="'.concat(x, '" y="').concat(yDown, '" width="').concat(barW, '" height="').concat(h, '" rx="').concat(Math.min(4, barW / 3), '" fill="').concat(series.color, '" fill-opacity="0.85"/>');
        yDown += h;
      });
      if (i % labelEvery === 0) {
        axis += '<text x="'.concat(pad.left + band * i + band / 2, '" y="').concat(height - 4, '" text-anchor="middle">').concat(axisLabel(row, bucket), "</text>");
      }
      bars += '<rect class="hit" data-i="'.concat(i, '" x="').concat(pad.left + band * i, '" y="').concat(pad.top, '" width="').concat(band, '" height="').concat(plotH, '" rx="4"/>');
    });
    el.innerHTML = '\n      <svg viewBox="0 0 '.concat(width, " ").concat(height, '" width="').concat(width, '" height="').concat(height, '">\n        <g class="axis">').concat(axis, "</g>\n        ").concat(bars, "\n      </svg>");
    const tooltip = $("tooltip");
    if (!tooltip) return;
    el.onpointermove = (event) => {
      const hit = event.target.closest(".hit");
      if (!hit) {
        tooltip.hidden = true;
        return;
      }
      const row = rows[Number(hit.dataset.i)];
      const lines = [...positive, ...negative].map((s) => '<div><span><i style="background:'.concat(s.color, '"></i>').concat(s.label, "</span><strong>").concat(nf(digits).format(row[s.key] || 0), " ").concat(unit, "</strong></div>")).join("");
      tooltip.innerHTML = "<b>".concat(bucketTitle(row, bucket), "</b>").concat(lines);
      tooltip.hidden = false;
      const box = tooltip.getBoundingClientRect();
      const left = Math.min(window.innerWidth - box.width - 8, event.clientX + 14);
      const topPos = event.clientY - box.height - 12 < 8 ? event.clientY + 16 : event.clientY - box.height - 12;
      tooltip.style.left = "".concat(Math.max(8, left), "px");
      tooltip.style.top = "".concat(topPos, "px");
    };
    el.onpointerleave = () => {
      tooltip.hidden = true;
    };
  }
  function renderLegend(series) {
    const el = $("electricity-legend");
    if (!el) return;
    el.innerHTML = series.map((x) => '<span><i style="background:'.concat(x.color, '"></i>').concat(x.label, "</span>")).join("");
  }
  function renderCharts(history) {
    var _a2;
    const { rows, bucket, totals, hasBattery } = history;
    const positive = [
      { key: "gridToHome", label: "Van het net", color: css("--grid") },
      { key: "solarToHome", label: "Zon direct", color: css("--solar") }
    ];
    const negative = [{ key: "export", label: "Teruggeleverd", color: css("--export") }];
    if (hasBattery) {
      positive.push({ key: "batteryToHome", label: "Uit batterij", color: css("--battery") });
      negative.push({ key: "charge", label: "Batterij geladen", color: css("--battery-in") });
    }
    renderLegend([...positive, ...negative]);
    renderBars("electricity-chart", rows, { positive, negative, unit: "kWh", bucket });
    renderBars("gas-chart", rows, {
      positive: [{ key: "gas", label: "Gas", color: css("--gas") }],
      unit: "m³",
      digits: 3,
      bucket
    });
    const heatingChart = $("heating-chart");
    if (heatingChart) heatingChart.hidden = !((_a2 = history.available) == null ? void 0 : _a2.heating);
    renderBars("heating-chart", rows, {
      positive: [{ key: "heating", label: "Stroom verwarming", color: css("--heating") }],
      unit: "kWh",
      bucket
    });
    renderBars("ev-chart", rows, {
      positive: [{ key: "ev", label: "Geladen", color: css("--ev") }],
      unit: "kWh",
      bucket
    });
    renderBars("water-chart", rows, {
      positive: [{ key: "water", label: "Water", color: css("--water") }],
      unit: "L",
      digits: 0,
      bucket
    });
    renderSankeyBlock();
    setText("solar-total", "".concat(formatEnergy(totals.solar), " kWh"));
    setText("gas-total", "".concat(nf(2).format(totals.gas), " m³").concat(gasPerDegreeDay(history) ? " · ".concat(gasPerDegreeDay(history)) : ""));
    setText("period-label", PERIOD_LABELS[state.period] || "");
  }
  const DEVICE_COLORS = ["#5e8cff", "#ff9f0a", "#30b0c7", "#ff6482", "#a55eea", "#34c759", "#e6b800", "#64d2ff", "#bf5af2", "#ff453a", "#ac8e68", "#8e8e93"];
  function sankeyColor(node2, deviceIndex) {
    switch (node2.kind) {
      case "solar":
        return css("--solar");
      case "grid":
        return css("--grid");
      case "battery":
        return css("--battery");
      case "home":
        return css("--home");
      case "export":
        return css("--export");
      case "untracked":
        return css("--muted");
      default:
        return DEVICE_COLORS[deviceIndex % DEVICE_COLORS.length];
    }
  }
  function shorten(text, max) {
    return text.length > max ? "".concat(text.slice(0, max - 1), "…") : text;
  }
  function initSankeyMode(block) {
    const nav = block.querySelector("#sankey-mode");
    if (!nav) return;
    nav.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.mode === state.sankeyMode));
    nav.addEventListener("click", (event) => {
      var _a2;
      const mode = (_a2 = event.target.closest("button[data-mode]")) == null ? void 0 : _a2.dataset.mode;
      if (!mode || mode === state.sankeyMode) return;
      state.sankeyMode = mode;
      try {
        localStorage.setItem(SANKEY_MODE_KEY, mode);
      } catch {
      }
      nav.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
      renderSankeyBlock();
      relayout();
    });
  }
  function renderSankeyBlock() {
    var _a2, _b2;
    if (!$("sankey")) return;
    const live = state.sankeyMode === "live";
    renderSankey(live ? (_a2 = state.live) == null ? void 0 : _a2.sankey : (_b2 = state.history) == null ? void 0 : _b2.sankey, live);
  }
  function layoutSankey(data, width, narrow, baseHeight) {
    const nodeW = 12;
    const gap = narrow ? 8 : 10;
    const minSlot = narrow ? 15 : 17;
    const labelLeft = narrow ? 78 : 120;
    const labelRight = narrow ? 118 : 190;
    const nodes = data.nodes.map((n) => ({ ...n, in: 0, out: 0 }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = data.links.filter((l) => byId.has(l.source) && byId.has(l.target)).map((l) => ({ ...l }));
    for (const l of links) {
      byId.get(l.source).out += l.value;
      byId.get(l.target).in += l.value;
    }
    nodes.forEach((n) => {
      n.value = Math.max(n.in, n.out);
    });
    let deviceIndex = 0;
    nodes.forEach((n) => {
      n.color = sankeyColor(n, n.kind === "device" ? deviceIndex++ : 0);
    });
    const columns = [0, 1, 2].map((c) => nodes.filter((n) => n.column === c));
    const columnX = [labelLeft, Math.round((labelLeft + width - labelRight - nodeW) / 2), width - labelRight - nodeW];
    const scale = Math.min(...columns.filter((c) => c.length).map((col) => {
      const total = col.reduce((sum, n) => sum + n.value, 0);
      return Math.max(1, baseHeight - gap * (col.length - 1)) / total;
    }));
    let height = 0;
    columns.forEach((col, c) => {
      let y = 0;
      col.forEach((n) => {
        n.x = columnX[c];
        n.h = Math.max(2, n.value * scale);
        n.y = y;
        y += Math.max(n.h, minSlot) + gap;
      });
      height = Math.max(height, y - gap);
    });
    columns.forEach((col) => {
      if (!col.length) return;
      const last = col[col.length - 1];
      const used = last.y + Math.max(last.h, minSlot);
      const shift = (height - used) / 2;
      col.forEach((n) => {
        n.y += shift;
      });
    });
    return { nodes, byId, links, scale, height, nodeW };
  }
  let sankeyShape = "";
  function renderSankey(data, live = false) {
    var _a2;
    const el = $("sankey");
    if (!el) return;
    setText("sankey-period", live ? "nu · W" : "".concat(PERIOD_LABELS[state.period] || "", " · kWh"));
    charts.set("sankey", renderSankeyBlock);
    if (!((_a2 = data == null ? void 0 : data.links) == null ? void 0 : _a2.length)) {
      el.style.removeProperty("--basis");
      el.innerHTML = '<div class="empty">'.concat(live ? "Nu geen energiestroom gemeten" : "Nog geen gegevens voor deze periode", "</div>");
      sankeyShape = "";
      syncFlows();
      return;
    }
    const format = live ? formatPower : (v) => "".concat(formatEnergy(v), " kWh");
    const formatShort = live ? formatPower : formatEnergy;
    const width = Math.max(el.clientWidth || 600, 600);
    const narrow = width < 700;
    const defaultBase = narrow ? 260 : 320;
    let layout = layoutSankey(data, width, narrow, defaultBase);
    el.style.setProperty("--basis", "".concat(Math.ceil(layout.height + 8), "px"));
    const scrollbar = el.scrollWidth > el.clientWidth ? 14 : 0;
    const target = el.closest("#blocks.rows") && el.clientHeight >= 60 ? el.clientHeight - 8 - scrollbar : 0;
    if (target) {
      let base = defaultBase;
      for (let i = 0; i < 5 && Math.abs(layout.height - target) > 1; i++) {
        base = Math.max(20, base + target - layout.height);
        layout = layoutSankey(data, width, narrow, base);
      }
    }
    const { nodes, byId, links, scale, height, nodeW } = layout;
    const outOffset = new Map(nodes.map((n) => [n.id, 0]));
    const inOffset = new Map(nodes.map((n) => [n.id, 0]));
    links.sort((a, b) => byId.get(a.source).y - byId.get(b.source).y || byId.get(a.target).y - byId.get(b.target).y);
    let paths = "";
    let dots = "";
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
      const color = s.kind === "home" ? t.color : s.color;
      const title = "".concat(s.label, " → ").concat(t.label, ": ").concat(format(l.value));
      paths += '<path id="sankey-link-'.concat(i, '" class="sankey-link" d="M').concat(x0, " ").concat(sy, " C").concat(xm, " ").concat(sy, " ").concat(xm, " ").concat(ty, " ").concat(x1, " ").concat(ty, '" stroke="').concat(color, '" stroke-width="').concat(thickness, '"><title>').concat(escapeHtml(title), "</title></path>");
      if (live) dots += flowDots("sankey-link-".concat(i), l.value, color, Math.min(4.5, Math.max(2, thickness / 2)), "sankey:".concat(l.source, ">").concat(l.target));
    });
    let boxes = "";
    for (const n of nodes) {
      const labelY = n.y + n.h / 2 + 4;
      const left = n.column === 0;
      const tx = left ? n.x - 6 : n.x + nodeW + 6;
      const name = escapeHtml(shorten(n.label, narrow ? 13 : 24));
      boxes += "\n        <g>\n          <title>".concat(escapeHtml("".concat(n.label, ": ").concat(format(n.value))), '</title>\n          <rect x="').concat(n.x, '" y="').concat(n.y, '" width="').concat(nodeW, '" height="').concat(n.h, '" rx="3" fill="').concat(n.color, '"/>\n          <text class="sankey-label" x="').concat(tx, '" y="').concat(labelY, '" text-anchor="').concat(left ? "end" : "start", '"><tspan class="sankey-name">').concat(name, '</tspan> <tspan class="sankey-value">').concat(formatShort(n.value), "</tspan></text>\n        </g>");
    }
    el.innerHTML = '\n      <svg viewBox="0 -4 '.concat(width, " ").concat(height + 8, '" width="').concat(width, '" height="').concat(height + 8, '" role="img" aria-label="Energiestromen van bron naar verbruiker">\n        ').concat(paths, '\n        <g class="sankey-dots">').concat(dots, "</g>\n        ").concat(boxes, "\n      </svg>");
    const shape = "".concat(live, "|").concat(state.period, "|").concat(links.map((l) => "".concat(l.source, ">").concat(l.target)).sort().join(","));
    if (shape !== sankeyShape && !reducedMotion.matches) {
      el.querySelectorAll(".sankey-link").forEach((path) => {
        path.style.setProperty("--len", Math.ceil(path.getTotalLength() + 2));
        path.style.animationDelay = "".concat(byId.get(links[Number(path.id.slice(12))].source).column * 0.25, "s");
        path.classList.add("grow");
      });
    }
    sankeyShape = shape;
    syncFlows();
  }
  const POWER_DAYS = { today: "vandaag", yesterday: "gisteren" };
  const POWER_FLOW_KEYS = ["solarToHome", "solarToGrid", "solarToBattery", "gridToHome", "gridToBattery", "batteryToHome", "batteryToGrid"];
  let powerShape = "";
  let powerPointer = null;
  function powerSource() {
    if (POWER_DAYS[state.period]) return { day: state.period, history: state.history };
    return { day: "today", history: state.powerToday };
  }
  function addLivePower(live) {
    if (!live || typeof live.homeW !== "number") return;
    const f = live.flows || {};
    const point = { t: Date.parse(live.updated) || Date.now(), home: live.homeW, solar: Math.max(0, live.solarW || 0) };
    for (const key of POWER_FLOW_KEYS) point[key] = f[key] || 0;
    const midnight = new Date(point.t).setHours(0, 0, 0, 0);
    state.liveTrail = (state.liveTrail || []).filter((p) => p.t >= midnight && p.t < point.t);
    state.liveTrail.push(point);
  }
  function powerSamples(power, day) {
    const start2 = Date.parse(power.start);
    const stepMs = power.step * 1e3;
    const samples = power.points.map((p, i) => p ? { t: start2 + (i + 0.5) * stepMs, ...p } : null);
    if (day === "today") {
      const lastT = start2 + (power.points.length - 0.5) * stepMs;
      const minutes = /* @__PURE__ */ new Map();
      for (const p of (state.liveTrail || []).filter((q) => q.t > lastT)) {
        const key = Math.floor(p.t / 6e4);
        if (!minutes.has(key)) minutes.set(key, []);
        minutes.get(key).push(p);
      }
      for (const list of minutes.values()) {
        const avg = { t: list.reduce((sum, p) => sum + p.t, 0) / list.length };
        for (const key of ["home", "solar", ...POWER_FLOW_KEYS]) avg[key] = list.reduce((sum, p) => sum + p[key], 0) / list.length;
        samples.push(avg);
      }
    }
    return { start: start2, samples };
  }
  function smoothPath(points, command = "M") {
    const f = (n2) => n2.toFixed(1);
    const n = points.length;
    if (!n) return "";
    let d = "".concat(command).concat(f(points[0][0]), " ").concat(f(points[0][1]));
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
      if (!slopes[i]) {
        tangents[i] = 0;
        tangents[i + 1] = 0;
        continue;
      }
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
      d += " C".concat(f(x0 + third), " ").concat(f(y0 + tangents[i] * third), " ").concat(f(x1 - third), " ").concat(f(y1 - tangents[i + 1] * third), " ").concat(f(x1), " ").concat(f(y1));
    }
    return d;
  }
  function renderPower() {
    var _a2, _b2, _c, _d;
    const el = $("power-chart");
    if (!el) return;
    charts.set("power-chart", renderPower);
    const { day, history } = powerSource();
    setText("power-title", "Vermogen ".concat(POWER_DAYS[day]));
    const summaryEl = $("power-summary");
    const power = history == null ? void 0 : history.power;
    if (!((_a2 = power == null ? void 0 : power.points) == null ? void 0 : _a2.length)) {
      el.innerHTML = '<div class="empty">'.concat(history ? "Geen vermogensgegevens van de P1-meter" : "Laden…", "</div>");
      if (summaryEl) summaryEl.innerHTML = "";
      return;
    }
    const hasBattery = Boolean(history.hasBattery);
    const hasSolar = ((_b2 = history.available) == null ? void 0 : _b2.solar) !== false;
    const colors = {
      solar: css("--solar"),
      grid: css("--grid"),
      export: css("--export"),
      battery: css("--battery"),
      batteryIn: css("--battery-in"),
      card: css("--card")
    };
    const self = { id: "self", label: "Zelfverbruik", arrow: "⇕", color: colors.solar, value: (p) => p.solarToHome || 0, total: (t2) => t2.solarToHome };
    const use = [
      hasBattery && { id: "discharge", label: "Uit batterij", arrow: "↗", color: colors.battery, value: (p) => p.batteryToHome || 0, total: (t2) => t2.batteryToHome },
      { id: "import", label: "Van het net", arrow: "↓", color: colors.grid, value: (p) => (p.gridToHome || 0) + (p.gridToBattery || 0), total: (t2) => t2.import }
    ].filter(Boolean);
    const sun = [
      hasBattery && { id: "charge", label: "Zon in batterij", arrow: "↘", color: colors.batteryIn, value: (p) => p.solarToBattery || 0, total: (t2) => t2.solarToBattery },
      { id: "export", label: "Teruggeleverd", arrow: "↑", color: colors.export, value: (p) => (p.solarToGrid || 0) + (p.batteryToGrid || 0), total: (t2) => t2.export }
    ].filter(Boolean);
    const layers = hasSolar ? [self, ...use, ...sun] : use;
    const stacks = hasSolar ? [[self, ...use], [self, ...sun]] : [use];
    const legendEl = $("power-legend");
    const forecast = day === "today" ? history.forecast : null;
    if (legendEl) {
      legendEl.innerHTML = layers.map((x) => '<span><i style="background:'.concat(x.color, '"></i>').concat(x.label, "</span>")).join("") + (forecast ? '<span><i class="legend-dash" style="border-color:'.concat(colors.solar, '"></i>Verwachte zon</span>') : "");
    }
    const readout = (title, values, unit = "") => '\n      <div class="power-values">'.concat(values.map(({ layer, text }) => '<span class="power-value" style="color:'.concat(layer.color, '" title="').concat(layer.label, '"><b>').concat(layer.arrow, "</b>").concat(text, "</span>")).join("")).concat(unit ? '<span class="power-unit">'.concat(unit, "</span>") : "", '</div>\n      <div class="power-when">').concat(title, "</div>");
    const t = history.totals || {};
    const dayKey = (date) => "".concat(date.getFullYear(), "-").concat(String(date.getMonth() + 1).padStart(2, "0"), "-").concat(String(date.getDate()).padStart(2, "0"));
    const tomorrow = /* @__PURE__ */ new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expected = forecast ? [(_c = forecast.days) == null ? void 0 : _c[dayKey(/* @__PURE__ */ new Date())], (_d = forecast.days) == null ? void 0 : _d[dayKey(tomorrow)]] : [];
    const forecastText = typeof expected[0] === "number" ? "<span> · verwacht vandaag ".concat(formatEnergy(expected[0]), " kWh").concat(typeof expected[1] === "number" ? " · morgen ".concat(formatEnergy(expected[1]), " kWh") : "", "</span>") : "";
    const totalsHtml = readout(
      (hasSolar ? "".concat(POWER_DAYS[day], " · verbruik ").concat(formatEnergy(t.consumption), " kWh · zon ").concat(formatEnergy(t.solar), " kWh") : "".concat(POWER_DAYS[day], " · verbruik ").concat(formatEnergy(t.consumption), " kWh")) + forecastText,
      layers.map((layer) => ({ layer, text: formatEnergy(layer.total(t) || 0) })),
      "kWh"
    );
    if (summaryEl) summaryEl.innerHTML = totalsHtml;
    const { start: start2, samples } = powerSamples(power, day);
    const valid = samples.filter(Boolean);
    const stackTop = (stack, p) => stack.reduce((sum, layer) => sum + layer.value(p), 0);
    const end0 = power.end ? Date.parse(power.end) : start2 + 864e5;
    const expectedLine = forecast ? forecast.watts.filter((p) => p.t >= start2 && p.t <= end0) : [];
    const max = Math.max(100, ...valid.map((p) => Math.max(...stacks.map((stack) => stackTop(stack, p)))), ...expectedLine.map((p) => p.w));
    const width = el.clientWidth || 600;
    const height = chartHeight(el, Number(el.dataset.height) || 240);
    const pad = { left: 4, right: 44, top: 10, bottom: 20 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const step = niceStep(max, height < 200 ? 3 : 4);
    const top = Math.ceil(max / step) * step;
    const scale = plotH / top;
    const end = power.end ? Date.parse(power.end) : start2 + 864e5;
    const dayMs = end - start2;
    const X = (time) => pad.left + Math.min(1, Math.max(0, (time - start2) / dayMs)) * plotW;
    const Y = (watts) => pad.top + plotH - watts * scale;
    const f = (n) => n.toFixed(1);
    const kW = step >= 1e3;
    const tickLabel = (v) => kW ? nf(step % 1e3 ? 1 : 0).format(v / 1e3) : nf(0).format(v);
    let axis = "";
    for (let v = 0; v <= top + 1e-9; v += step) {
      const yPos = f(Y(v));
      axis += '<line x1="'.concat(pad.left, '" x2="').concat(pad.left + plotW, '" y1="').concat(yPos, '" y2="').concat(yPos, '" class="').concat(v === 0 ? "zero" : "", '"/>');
      axis += '<text x="'.concat(width - pad.right + 6, '" y="').concat(Number(yPos) + 4, '">').concat(tickLabel(v)).concat(v === top ? kW ? " kW" : " W" : "", "</text>");
    }
    const hourEvery = plotW < 360 ? 6 : 3;
    for (let h = hourEvery; h < 24; h += hourEvery) {
      const x = X(new Date(start2).setHours(h, 0, 0, 0));
      axis += '<text x="'.concat(f(x), '" y="').concat(height - 4, '" text-anchor="middle">').concat(String(h).padStart(2, "0"), ":00</text>");
    }
    const runs = [];
    let run = [];
    samples.forEach((p) => {
      if (p) run.push(p);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    });
    if (run.length) runs.push(run);
    const gradients = layers.map((layer) => '\n      <linearGradient id="power-fill-'.concat(layer.id, '" x1="0" y1="0" x2="0" y2="1">\n        <stop offset="0" stop-color="').concat(layer.color, '" stop-opacity="0.95"/>\n        <stop offset="1" stop-color="').concat(layer.color, '" stop-opacity="0.45"/>\n      </linearGradient>')).join("");
    let shapes = "";
    for (const list of runs) {
      const drawn = /* @__PURE__ */ new Set();
      const pieces = [];
      for (const stack of stacks) {
        let below = () => 0;
        stack.forEach((layer) => {
          const lower = below;
          const upper = (p) => lower(p) + layer.value(p);
          below = upper;
          if (drawn.has(layer.id)) return;
          drawn.add(layer.id);
          if (!list.some((p) => layer.value(p) > 0)) return;
          const upperPts = list.map((p) => [X(p.t), Y(upper(p))]);
          const lowerPts = list.map((p) => [X(p.t), Y(lower(p))]).reverse();
          pieces.unshift('<path class="power-area" d="'.concat(smoothPath(upperPts), " ").concat(smoothPath(lowerPts, "L"), ' Z" fill="url(#power-fill-').concat(layer.id, ')"/>') + '<path class="power-edge" d="'.concat(smoothPath(upperPts), '" stroke="').concat(layer.color, '"/>'));
        });
      }
      shapes += pieces.join("");
    }
    if (expectedLine.length > 1) {
      shapes += '<path class="power-forecast" d="'.concat(smoothPath(expectedLine.map((p) => [X(p.t), Y(p.w)])), '" stroke="').concat(colors.solar, '"/>');
    }
    const last = valid[valid.length - 1];
    const nowDot = day === "today" && last ? (() => {
      const x = f(X(last.t));
      const y = f(Y(Math.max(...stacks.map((stack) => stackTop(stack, last)))));
      return '\n        <line class="power-now-line" x1="'.concat(x, '" x2="').concat(x, '" y1="').concat(pad.top, '" y2="').concat(pad.top + plotH, '"/>\n        <circle class="power-now" cx="').concat(x, '" cy="').concat(y, '" r="5" fill="').concat(colors.solar, '" style="animation-delay:').concat(syncDelay(2.8), '"/>\n        <circle cx="').concat(x, '" cy="').concat(y, '" r="3.5" fill="').concat(colors.solar, '" stroke="').concat(colors.card, '" stroke-width="1.5"/>');
    })() : "";
    const atMark = state.at !== null && day === state.period && state.at >= start2 && state.at < end ? (() => {
      const x = X(state.at + TIMELINE_STEP / 2);
      const anchor = x > pad.left + plotW - 40 ? "end" : "start";
      return '\n        <line class="power-at-line" x1="'.concat(f(x), '" x2="').concat(f(x), '" y1="').concat(pad.top, '" y2="').concat(pad.top + plotH, '"/>\n        <text class="power-at-label" x="').concat(f(x + (anchor === "end" ? -4 : 4)), '" y="').concat(pad.top + 10, '" text-anchor="').concat(anchor, '">').concat(hhmm(state.at), "</text>");
    })() : "";
    const shape = "".concat(day, "|").concat(power.start);
    const reveal = shape !== powerShape && !reducedMotion.matches;
    powerShape = shape;
    el.innerHTML = '\n      <svg viewBox="0 0 '.concat(width, " ").concat(height, '" width="').concat(width, '" height="').concat(height, '">\n        <defs>').concat(gradients, '<clipPath id="power-clip"><rect class="').concat(reveal ? "power-reveal" : "", '" x="').concat(pad.left, '" y="0" width="').concat(plotW, '" height="').concat(height, '"/></clipPath></defs>\n        <g class="axis">').concat(axis, '</g>\n        <g clip-path="url(#power-clip)">').concat(shapes, "</g>\n        ").concat(nowDot, "\n        ").concat(atMark, '\n        <g class="power-hover" visibility="hidden">\n          <line class="power-cursor" y1="').concat(pad.top, '" y2="').concat(pad.top + plotH, '"/>\n          ').concat(stacks.map((_, i) => '<circle class="power-dot" data-stack="'.concat(i, '" r="3.5" stroke="').concat(colors.card, '" stroke-width="1.5"/>')).join(""), "\n        </g>\n      </svg>");
    const hover = el.querySelector(".power-hover");
    const hide = () => {
      hover.setAttribute("visibility", "hidden");
      if (summaryEl) summaryEl.innerHTML = totalsHtml;
    };
    el.onpointerleave = () => {
      powerPointer = null;
      hide();
    };
    el.onpointermove = (event) => {
      powerPointer = { clientX: event.clientX, clientY: event.clientY };
      const box = el.querySelector("svg").getBoundingClientRect();
      const x = (event.clientX - box.left) * width / box.width;
      if (x < pad.left || x > pad.left + plotW || !valid.length) {
        hide();
        return;
      }
      const time = start2 + (x - pad.left) / plotW * dayMs;
      let p = valid[0];
      for (const q of valid) if (Math.abs(q.t - time) < Math.abs(p.t - time)) p = q;
      if (Math.abs(p.t - time) > 30 * 6e4) {
        hide();
        return;
      }
      const px = f(X(p.t));
      hover.setAttribute("visibility", "visible");
      const cursor = hover.querySelector("line");
      cursor.setAttribute("x1", px);
      cursor.setAttribute("x2", px);
      hover.querySelectorAll(".power-dot").forEach((dot) => {
        const stack = stacks[Number(dot.dataset.stack)];
        const topLayer = [...stack].reverse().find((layer) => layer.value(p) > 0) || stack[0];
        dot.setAttribute("cx", px);
        dot.setAttribute("cy", f(Y(stackTop(stack, p))));
        dot.setAttribute("fill", topLayer.color);
      });
      if (!summaryEl) return;
      const when = new Date(p.t).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
      summaryEl.innerHTML = readout(
        "".concat(when, " · verbruik ").concat(formatPower(stackTop(stacks[0], p))).concat(hasSolar ? " · zon ".concat(formatPower(p.solar)) : ""),
        layers.map((layer) => ({ layer, text: formatPower(layer.value(p)) }))
      );
    };
    if (powerPointer) el.onpointermove(powerPointer);
    el.onclick = (event) => {
      if (!timelineShown() || day !== state.period) return;
      const box = el.querySelector("svg").getBoundingClientRect();
      const x = (event.clientX - box.left) * width / box.width;
      if (x < pad.left || x > pad.left + plotW) return;
      setMoment(start2 + (x - pad.left) / plotW * dayMs);
    };
    el.classList.toggle("pickable", timelineShown() && day === state.period);
  }
  async function loadPowerToday() {
    if (!$("power-chart") && !$("phases-chart") && !$("groups-chart") || POWER_DAYS[state.period]) return;
    try {
      state.powerToday = await state.options.get("/history?period=today");
    } catch {
    }
    renderPower();
    renderPhaseChart();
    renderGroupChart();
  }
  const euro = (value, digits = 2) => {
    var _a2;
    const currency = ((_a2 = state.live) == null ? void 0 : _a2.currency) || "EUR";
    if (currency === "EUR") return "".concat(value < 0 ? "−" : "", "€ ").concat(nf(digits).format(Math.abs(value)));
    try {
      return new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
    } catch {
      return "".concat(currency, " ").concat(nf(digits).format(value));
    }
  };
  const hm = (iso) => new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
  function priceColor(price, min, max) {
    const f = max > min ? (price - min) / (max - min) : 0.5;
    if (f < 0.34) return css("--home");
    if (f < 0.67) return css("--solar");
    return css("--hot");
  }
  function renderPrices(prices) {
    var _a2, _b2;
    if (!$("price-now")) return;
    const ok = Boolean(prices && !prices.error && ((_a2 = prices.today) == null ? void 0 : _a2.length));
    toggleEmpty("prices", ok);
    if (!ok) {
      setText("prices-empty", (prices == null ? void 0 : prices.error) ? "Geen prijzen: ".concat(prices.error) : "Geen prijzen beschikbaar.");
      return;
    }
    const fromHomey = prices.source === "Homey";
    setText("prices-source", prices.homeyCosts ? "all-in volgens Homey" : prices.powerhourCosts ? "all-in volgens Power by the Hour" : prices.allIn ? "all-in: markt + belasting + opslag" : fromHomey ? "marktprijs van Homey" : "marktprijs incl. btw");
    setText("price-now", typeof prices.current === "number" ? euro(prices.current, 3) : "–");
    const facts = [
      "<li><span>Laagste vandaag</span><strong>".concat(euro(prices.min, 3), "</strong></li>"),
      "<li><span>Hoogste vandaag</span><strong>".concat(euro(prices.max, 3), "</strong></li>"),
      "<li><span>Gemiddeld vandaag</span><strong>".concat(euro(prices.avg, 3), "</strong></li>")
    ];
    const gridW = (_b2 = state.live) == null ? void 0 : _b2.gridW;
    if (prices.allIn && typeof prices.current === "number" && typeof gridW === "number" && Math.abs(gridW) > 5) {
      facts.unshift("<li><span>".concat(gridW > 0 ? "Afname kost nu" : "Teruglevering levert nu", "</span><strong>").concat(euro(Math.abs(gridW) / 1e3 * prices.current), " per uur</strong></li>"));
    }
    if (prices.cheapest) {
      const end = new Date(new Date(prices.cheapest.start).getTime() + prices.cheapest.hours * 36e5).toISOString();
      const day = new Date(prices.cheapest.start).getDate() !== (/* @__PURE__ */ new Date()).getDate() ? "morgen " : "";
      facts.unshift("<li><span>Goedkoopste ".concat(prices.cheapest.hours, " uur</span><strong>").concat(day).concat(hm(prices.cheapest.start), "–").concat(hm(end), " · ").concat(euro(prices.cheapest.avg, 3), "</strong></li>"));
    }
    $("price-facts").innerHTML = facts.join("");
    renderPriceChart([...prices.today, ...prices.tomorrow]);
  }
  function renderPriceChart(list) {
    var _a2;
    const el = $("prices-chart");
    if (!el) return;
    charts.set("prices-chart", () => renderPriceChart(list));
    const width = el.clientWidth || 600;
    const height = chartHeight(el, 150);
    const pad = { left: 34, right: 4, top: 8, bottom: 20 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const values = list.map((p) => p.price);
    const min = Math.min(0, ...values);
    const max = Math.max(...values, 0.01);
    const step = niceStep(max - min, 3);
    const top = Math.ceil(max / step) * step;
    const bottom = Math.floor(min / step) * step;
    const y = (v) => pad.top + (top - v) / (top - bottom) * plotH;
    const band = plotW / list.length;
    const barW = Math.max(1, band * (list.length > 48 ? 0.8 : 0.7));
    const now = (_a2 = state.at) != null ? _a2 : Date.now();
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    let axis = "";
    for (let v = bottom; v <= top + 1e-9; v += step) {
      axis += '<line x1="'.concat(pad.left, '" x2="').concat(width - pad.right, '" y1="').concat(y(v), '" y2="').concat(y(v), '" class="').concat(Math.abs(v) < 1e-9 ? "zero" : "", '"/>');
      axis += '<text x="'.concat(pad.left - 6, '" y="').concat(y(v) + 4, '" text-anchor="end">').concat(nf(2).format(v), "</text>");
    }
    let bars = "";
    list.forEach((p, i) => {
      const start2 = new Date(p.t).getTime();
      const end = start2 + (p.minutes || 60) * 6e4;
      const isNow = start2 <= now && now < end;
      const past = end <= now;
      const x = pad.left + band * i + (band - barW) / 2;
      const y0 = y(Math.max(0, p.price));
      const h = Math.max(1, Math.abs(y(p.price) - y(0)));
      bars += '<rect x="'.concat(x, '" y="').concat(y0, '" width="').concat(barW, '" height="').concat(h, '" rx="').concat(Math.min(3, barW / 3), '" fill="').concat(priceColor(p.price, lo, hi), '" fill-opacity="').concat(past ? 0.35 : 1, '" ').concat(isNow ? 'stroke="'.concat(css("--text"), '" stroke-width="1.5"') : "", "><title>").concat(hm(p.t), ": ").concat(euro(p.price, 3), "</title></rect>");
      const hour = new Date(p.t).getHours();
      if (hour % 6 === 0 && new Date(p.t).getMinutes() === 0) {
        axis += '<text x="'.concat(pad.left + band * i + band / 2, '" y="').concat(height - 4, '" text-anchor="middle">').concat(hour === 0 && i > 0 ? "morgen" : String(hour).padStart(2, "0"), "</text>");
      }
    });
    el.innerHTML = '<svg viewBox="0 0 '.concat(width, " ").concat(height, '" width="').concat(width, '" height="').concat(height, '"><g class="axis">').concat(axis, "</g>").concat(bars, "</svg>");
  }
  function gauge({ fraction, color, value, label }) {
    const r = 42;
    const c = Math.PI * r;
    const f = Math.min(1, Math.max(0, fraction != null ? fraction : 0));
    return '\n      <div class="gauge-item">\n        <svg viewBox="0 0 100 60" role="img" aria-label="'.concat(escapeHtml(label), '">\n          <path d="M8 54 A42 42 0 0 1 92 54" fill="none" stroke="').concat(css("--track"), '" stroke-width="9" stroke-linecap="round"/>\n          <path d="M8 54 A42 42 0 0 1 92 54" fill="none" stroke="').concat(color, '" stroke-width="9" stroke-linecap="round" stroke-dasharray="').concat(Math.max(0.01, c * f), " ").concat(c, '"/>\n          <text x="50" y="50" text-anchor="middle" class="gauge-value">').concat(value, '</text>\n        </svg>\n        <span class="gauge-label">').concat(label, "</span>\n      </div>");
  }
  function renderGauges(history) {
    const el = $("gauges");
    if (!el) return;
    const t = history.totals;
    setText("gauges-period", PERIOD_LABELS[state.period] || "");
    const exchanged = t.import + t.export;
    const producer = t.netGrid < 0;
    el.innerHTML = '<div class="gauges-inner">'.concat([
      gauge({ fraction: t.selfSufficiency, color: css("--home"), value: "".concat(formatPercent(t.selfSufficiency), "%"), label: "Zelfvoorzienend" }),
      gauge({ fraction: t.selfConsumption, color: css("--solar"), value: "".concat(formatPercent(t.selfConsumption), "%"), label: "Eigen zon gebruikt" }),
      gauge({
        fraction: exchanged > 0 ? t.export / exchanged : 0,
        color: producer ? css("--export") : css("--grid"),
        value: "".concat(formatEnergy(Math.abs(t.netGrid))),
        label: producer ? "kWh netto geleverd" : "kWh netto afgenomen"
      })
    ].join(""), "</div>");
  }
  const estimateTag = (d) => d.estimated ? ' <small class="muted estimate">geschat</small>' : "";
  function renderDeviceEnergy(history) {
    const el = $("device-energy");
    if (!el) return;
    setText("devices-period", "".concat(PERIOD_LABELS[state.period] || "", " · kWh"));
    const list = history.devices || [];
    const max = Math.max(1e-3, ...list.map((d) => d.kWh));
    const total = history.totals.consumption;
    el.innerHTML = list.length ? list.map((d) => '\n          <li>\n            <div class="consumer-row"><span>'.concat(escapeHtml(d.name)).concat(estimateTag(d), "</span><strong>").concat(formatEnergy(d.kWh)).concat(total > 0 ? ' <small class="muted">'.concat(nf(0).format(d.kWh / total * 100), "%</small>") : "", '</strong></div>\n            <div class="bar"><i style="width:').concat(Math.max(2, d.kWh / max * 100), '%;background:var(--ev)"></i></div>\n          </li>')).join("") : '<li class="muted">Geen apparaten met een kWh-meter gevonden</li>';
  }
  function renderCosts(history) {
    var _a2;
    const el = $("costs");
    if (!el) return;
    setText("costs-period", PERIOD_LABELS[state.period] || "");
    const t = history.totals;
    if (!t.costs) {
      el.innerHTML = '<tr><td class="muted">Vul je tarieven in bij de instellingen om de kosten te zien.</td></tr>';
      return;
    }
    const rows = [
      ["Stroom afname", "".concat(formatEnergy(t.import), " kWh"), t.costs.import],
      ["Teruglevering", "".concat(formatEnergy(t.export), " kWh"), t.costs.export],
      ["Gas", "".concat(nf(2).format(t.gas), " m³"), t.costs.gas],
      ["Water", "".concat(nf(0).format(t.water), " L"), t.costs.water],
      ["Vaste kosten", "min vermindering energiebelasting", t.costs.fixed]
    ].filter(([, , cost]) => typeof cost === "number");
    const previous = (_a2 = history.previous) == null ? void 0 : _a2.cost;
    el.innerHTML = rows.map(([label, amount, cost]) => "\n        <tr><td>".concat(label, '</td><td class="muted">').concat(amount, "</td><td>").concat(euro(cost), "</td></tr>")).join("") + '<tr class="total"><td>Totaal</td><td class="muted">'.concat(typeof previous === "number" ? "vorige periode ".concat(euro(previous)) : "", "</td><td>").concat(euro(t.cost), "</td></tr>");
  }
  function renderWater(live, history) {
    var _a2, _b2;
    if (!$("water-chart")) return;
    const hasWater = Boolean((live == null ? void 0 : live.water) || ((_a2 = history == null ? void 0 : history.available) == null ? void 0 : _a2.water));
    toggleEmpty("water", hasWater);
    if (!hasWater) return;
    const parts = [];
    if (history) parts.push("".concat(nf(0).format(history.totals.water), " L"));
    if (typeof ((_b2 = live == null ? void 0 : live.water) == null ? void 0 : _b2.flow) === "number") parts.push("nu ".concat(nf(1).format(live.water.flow), " L/min"));
    setText("water-total", parts.join(" · "));
  }
  const BATTERY_VIEW_KEY = "energy-dashboard-battery-view";
  const BATTERY_VIEWS = ["measured", "export", "model"];
  function batteryView(data) {
    if (!data) return { key: null, view: null, views: {} };
    const views = data.views || { measured: data };
    let chosen = "model";
    try {
      chosen = localStorage.getItem(BATTERY_VIEW_KEY) || "model";
    } catch {
    }
    for (let i = Math.max(0, BATTERY_VIEWS.indexOf(chosen)); i >= 0; i--) {
      if (views[BATTERY_VIEWS[i]]) return { key: BATTERY_VIEWS[i], view: views[BATTERY_VIEWS[i]], views };
    }
    const first = BATTERY_VIEWS.find((k) => views[k]);
    return { key: first || null, view: first ? views[first] : null, views };
  }
  const lighter = (color) => /^#[0-9a-f]{6}$/i.test(color) ? "".concat(color, "66") : color;
  function renderBatterySize(input) {
    var _a2, _b2;
    if (!$("batterysize-dark")) return;
    const { key, view: data, views } = batteryView(input);
    const nav = $("batterysize-view");
    if (nav) {
      const available = BATTERY_VIEWS.filter((k) => views[k]);
      nav.hidden = available.length < 2;
      nav.querySelectorAll("button").forEach((b) => {
        b.hidden = !views[b.dataset.view];
        b.classList.toggle("active", b.dataset.view === key);
      });
      nav.onclick = (event) => {
        var _a3;
        const chosen = (_a3 = event.target.closest("button[data-view]")) == null ? void 0 : _a3.dataset.view;
        if (!chosen) return;
        try {
          localStorage.setItem(BATTERY_VIEW_KEY, chosen);
        } catch {
        }
        renderBatterySize(input);
        relayout();
      };
    }
    const ok = Boolean(data && data.nights > 0);
    toggleEmpty("batterysize", ok);
    if (!ok) {
      const empty = $("batterysize-empty");
      if (empty) {
        empty.textContent = input === void 0 ? "Verschijnt na het opslaan van de indeling" : !input || input.building ? "Wordt berekend uit de metingen in Homey…" : (data == null ? void 0 : data.skippedCount) ? "De nachten tot nu toe hadden ontbrekende of onlogische metingen. Elke nacht komt er een bij." : "Nog geen nachten gevonden met metingen per uur of fijner. Elke nacht komt er een bij.";
      }
      return;
    }
    data.building = input.building;
    setText("batterysize-basis", data.building ? "".concat(nf(0).format(data.nights), " nachten, wordt aangevuld") : "".concat(nf(0).format(data.nights), " nachten"));
    setText("batterysize-dark", "".concat(nf(1).format(data.avgDark), " kWh"));
    const fact2 = (label, value) => "<li><span>".concat(label, "</span><strong>").concat(value, "</strong></li>");
    const facts = [
      fact2("Uren in het donker per nacht", "".concat(nf(1).format(data.avgHours), " h")),
      fact2("Verbruik in het donker per jaar", "± ".concat(nf(0).format(data.yearDark), " kWh")),
      fact2("Hoogste vermogen in het donker", formatPower(data.peak))
    ];
    if (typeof ((_a2 = data.advice) == null ? void 0 : _a2.kWh) === "number") facts.push(fact2("Capaciteit voor 4 van de 5 nachten", "± ".concat(nf(1).format(data.advice.kWh), " kWh")));
    if (typeof ((_b2 = data.advice) == null ? void 0 : _b2.watts) === "number") facts.push(fact2("Vermogen voor 90% van dat verbruik", "± ".concat(formatPower(data.advice.watts))));
    if (data.skippedCount) facts.push(fact2("Overgeslagen nachten", nf(0).format(data.skippedCount)));
    if (data.estimated) facts.push(fact2("Geschat uit meterexport", nf(0).format(data.estimated)));
    if (data.modelled) facts.push(fact2("Gemodelleerd uit maandtotalen", nf(0).format(data.modelled)));
    $("batterysize-facts").innerHTML = facts.join("");
    const modelNote = $("batterysize-model");
    if (modelNote) modelNote.hidden = !data.modelled;
    const rows = data.months.map((m) => ({ ...m, darkMeasured: m.dark * (1 - (m.modelled || 0)), darkModel: m.dark * (m.modelled || 0) }));
    const positive = [{ key: "darkMeasured", label: "Verbruik in het donker", color: css("--grid") }];
    if (data.modelled) positive.push({ key: "darkModel", label: "Verbruik in het donker (model)", color: lighter(css("--grid")) });
    const negative = [{ key: "surplus", label: "Zonne-overschot", color: css("--solar") }];
    const legend = $("batterysize-legend");
    if (legend) legend.innerHTML = [...positive, ...negative].map((x) => '<span><i style="background:'.concat(x.color, '"></i>').concat(x.label, "</span>")).join("");
    renderBars("batterysize-chart", rows, { positive, negative, unit: "kWh", digits: 1, bucket: "month" });
    const share = (v) => typeof v === "number" ? "".concat(nf(0).format(v * 100), "%") : "–";
    $("batterysize-sizes").innerHTML = '<tr><td>Capaciteit</td><td class="muted">dekt</td><td>per jaar</td></tr>' + data.sizes.map((s) => "<tr><td>".concat(nf(1).format(s.kWh), ' kWh</td><td class="muted">').concat(share(s.share), "</td><td>").concat(typeof s.perYear === "number" ? "".concat(nf(0).format(s.perYear), " kWh") : "–", "</td></tr>")).join("");
    $("batterysize-powers").innerHTML = "<tr><td>Vermogen</td><td>dekt</td></tr>" + data.powers.map((p) => "<tr><td>".concat(formatPower(p.watts), "</td><td>").concat(share(p.share), "</td></tr>")).join("");
  }
  function renderBaseload(baseload) {
    if (!$("baseload-watts")) return;
    toggleEmpty("baseload", Boolean(baseload));
    if (!baseload) return;
    setText("baseload-watts", formatPower(baseload.watts));
    const facts = ["<li><span>Per jaar</span><strong>± ".concat(nf(0).format(baseload.yearKWh), " kWh</strong></li>")];
    if (typeof baseload.yearCost === "number") {
      facts.push("<li><span>Kost per jaar</span><strong>± ".concat(euro(baseload.yearCost, 0), "</strong></li>"));
    }
    facts.push("<li><span>Gemeten</span><strong>vannacht 1:00–5:00</strong></li>");
    $("baseload-facts").innerHTML = facts.join("");
  }
  function renderPhases(data) {
    var _a2, _b2;
    const el = $("phases");
    if (!el) return;
    toggleEmpty("phases", Boolean((_a2 = data == null ? void 0 : data.phases) == null ? void 0 : _a2.length));
    if (!((_b2 = data == null ? void 0 : data.phases) == null ? void 0 : _b2.length)) return;
    setText("phases-fuse", "hoofdzekering ".concat(data.fuseAmps, " A"));
    el.innerHTML = data.phases.map((p) => {
      const amps = typeof p.amps === "number" ? Math.abs(p.amps) : typeof p.watts === "number" ? Math.abs(p.watts) / (p.volts || 230) : null;
      const exporting = (typeof p.amps === "number" ? p.amps : p.watts) < 0;
      const load = amps === null ? 0 : amps / data.fuseAmps;
      const color = load > 0.9 ? "var(--hot)" : load > 0.7 ? "var(--warm)" : exporting ? "var(--export)" : "var(--home)";
      const main = typeof p.amps === "number" ? "".concat(nf(1).format(p.amps), " A") : formatPower(p.watts);
      const volts = typeof p.volts === "number" ? ' <small class="muted">'.concat(nf(0).format(p.volts), " V</small>") : "";
      return '\n        <li>\n          <div class="consumer-row"><span'.concat($("phases-chart") ? ' style="color:'.concat(PHASE_COLORS[(p.phase - 1) % 3], '"') : "", ">L").concat(p.phase, "</span><strong>").concat(main).concat(volts, '</strong></div>\n          <div class="bar"><i style="width:').concat(Math.min(100, Math.max(2, load * 100)), "%;background:").concat(color, '"></i></div>\n        </li>');
    }).join("");
    renderPhaseChart();
  }
  const loadColor = (share) => share > 0.9 ? "var(--hot)" : share > 0.7 ? "var(--warm)" : share > 0.5 ? "#ffd60a" : "var(--ok)";
  const phaseLabel = (phases) => phases.map((n) => "L".concat(n)).join("+");
  function renderGroups(data) {
    const el = $("groups");
    if (!el) return;
    const groups = (data == null ? void 0 : data.groups) || [];
    toggleEmpty("groups", groups.length > 0);
    if (!groups.length) return;
    const row = (g) => {
      const share = g.amps / g.fuseAmps;
      const on = [...g.on.map((d) => "".concat(escapeHtml(d.name), " ").concat(d.estimated ? "≈" : "").concat(formatPower(d.watts))), ...g.fixedWatts ? ["<span>vast ".concat(formatPower(g.fixedWatts), "</span>")] : []].join(" · ");
      const tag = g.phases.length > 1 ? ' <small class="muted">'.concat(phaseLabel(g.phases), "</small>") : "";
      return '\n        <li>\n          <div class="consumer-row"><span>'.concat(escapeHtml(g.name)).concat(tag, "</span><strong>").concat(nf(1).format(g.amps), ' A <small class="muted">/ ').concat(g.fuseAmps, ' A</small></strong></div>\n          <div class="bar"><i style="width:').concat(Math.min(100, Math.max(2, share * 100)), "%;background:").concat(loadColor(share), '"></i></div>\n          ').concat(on ? '<small class="muted">'.concat(on, "</small>") : "", "\n        </li>");
    };
    const phases = data.phases || [];
    if (!phases.length) {
      el.innerHTML = groups.map(row).join("");
    } else {
      const rough = phases.some((p) => p.rough);
      const about = rough ? "≈" : "";
      const sections = phases.map((p) => {
        const head = '<li class="group-phase"><span>L'.concat(p.phase, "</span>").concat(typeof p.watts === "number" ? "<strong>".concat(about).concat(formatPower(p.watts), "</strong>") : "", "</li>");
        const rest = typeof p.rest === "number" ? '<li class="group-rest"><div class="consumer-row"><span>Overig</span><strong>'.concat(about).concat(formatPower(p.rest), "</strong></div></li>") : "";
        return head + groups.filter((g) => g.phases.includes(p.phase)).map(row).join("") + rest;
      });
      const loose = groups.filter((g) => !g.phases.length);
      if (loose.length) sections.push('<li class="group-phase"><span>Zonder fase</span></li>'.concat(loose.map(row).join("")));
      if (rough) sections.push('<li class="group-rest"><small class="muted">Je slimme meter geeft per fase alleen hele ampères. Het totaal van de meter is daarom naar verhouding over de fasen verdeeld.</small></li>');
      el.innerHTML = sections.join("");
    }
    renderGroupChart();
  }
  function renderGroupChart() {
    var _a2;
    const el = $("groups-chart");
    if (!el) return;
    charts.set("groups-chart", renderGroupChart);
    const history = POWER_DAYS[state.period] ? state.history : state.powerToday;
    const data = history == null ? void 0 : history.groupLoad;
    if (!((_a2 = data == null ? void 0 : data.groups) == null ? void 0 : _a2.length)) {
      el.innerHTML = "";
      return;
    }
    const width = el.clientWidth || 300;
    const rowH = 12;
    const gap = 3;
    const pad = { left: Math.min(110, width * 0.3), right: 4, top: 2, bottom: 16 };
    const plotW = width - pad.left - pad.right;
    const height = pad.top + data.groups.length * (rowH + gap) + pad.bottom;
    const start2 = Date.parse(data.start);
    const day = 24 * 3600 * 1e3;
    const stepW = plotW * data.step * 1e3 / day;
    const X = (t) => pad.left + (t - start2) / day * plotW;
    const rows = data.groups.map((g, r) => {
      const y = pad.top + r * (rowH + gap);
      const cells = g.values.map((v, k) => v > 0 ? '<rect x="'.concat(X(start2 + k * data.step * 1e3).toFixed(1), '" y="').concat(y, '" width="').concat((stepW + 0.4).toFixed(2), '" height="').concat(rowH, '" fill="').concat(loadColor(v / 100), '"><title>').concat(escapeHtml(g.name), " ").concat(hm(new Date(start2 + k * data.step * 1e3).toISOString()), ": ").concat(v, "%</title></rect>") : "").join("");
      const label = '<text x="0" y="'.concat(y + rowH - 2, '" style="font-size:11px">').concat(escapeHtml(g.name), "</text>");
      return '<rect x="'.concat(pad.left, '" y="').concat(y, '" width="').concat(plotW, '" height="').concat(rowH, '" rx="3" fill="var(--track)"/>').concat(cells).concat(label);
    }).join("");
    let axis = "";
    for (const h of [6, 12, 18]) axis += '<text x="'.concat(X(new Date(start2).setHours(h)).toFixed(1), '" y="').concat(height - 3, '" text-anchor="middle">').concat(String(h).padStart(2, "0"), "</text>");
    el.innerHTML = '<svg viewBox="0 0 '.concat(width, " ").concat(height, '" width="').concat(width, '" height="').concat(height, '" role="img" aria-label="Groepen vandaag"><g class="axis">').concat(axis, "</g>").concat(rows, "</svg>");
  }
  const PHASE_COLORS = ["#5e8cff", "#ff9f0a", "#a55eea"];
  function renderPhaseChart() {
    var _a2, _b2, _c;
    const el = $("phases-chart");
    if (!el) return;
    charts.set("phases-chart", renderPhaseChart);
    const history = POWER_DAYS[state.period] ? state.history : state.powerToday;
    const data = history == null ? void 0 : history.phaseHistory;
    const fuse = (_b2 = (_a2 = state.live) == null ? void 0 : _a2.phases) == null ? void 0 : _b2.fuseAmps;
    if (!((_c = data == null ? void 0 : data.phases) == null ? void 0 : _c.length)) {
      el.innerHTML = "";
      return;
    }
    const width = el.clientWidth || 300;
    const height = chartHeight(el, Number(el.dataset.height) || 110);
    const pad = { left: 4, right: 34, top: 8, bottom: 16 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const start2 = Date.parse(data.start);
    const end = new Date(start2);
    end.setDate(end.getDate() + 1);
    const amps = data.unit === "A";
    const values = data.phases.flatMap((p) => p.values.filter((v) => typeof v === "number"));
    const max = Math.max(amps && fuse ? fuse : 0, ...values.map(Math.abs), amps ? 1 : 100);
    const min = Math.min(0, ...values);
    const step = niceStep(max - min, 3);
    const top = Math.ceil(max / step) * step;
    const bottom = Math.floor(min / step) * step;
    const X = (t) => pad.left + (t - start2) / (end - start2) * plotW;
    const Y = (v) => pad.top + (top - v) / (top - bottom) * plotH;
    const kw = !amps && top >= 1e3;
    const tick = (v) => nf(kw && step % 1e3 ? 1 : 0).format(kw ? v / 1e3 : v);
    const unit = amps ? " A" : kw ? " kW" : " W";
    let axis = "";
    for (let v = bottom; v <= top + 1e-9; v += step) {
      axis += '<line x1="'.concat(pad.left, '" x2="').concat(pad.left + plotW, '" y1="').concat(Y(v).toFixed(1), '" y2="').concat(Y(v).toFixed(1), '" class="').concat(Math.abs(v) < 1e-9 ? "zero" : "", '"/>');
      axis += '<text x="'.concat(width - pad.right + 4, '" y="').concat((Y(v) + 4).toFixed(1), '">').concat(tick(v)).concat(v === top ? unit : "", "</text>");
    }
    for (const h of [6, 12, 18]) axis += '<text x="'.concat(X(new Date(start2).setHours(h)).toFixed(1), '" y="').concat(height - 3, '" text-anchor="middle">').concat(String(h).padStart(2, "0"), "</text>");
    const fuseLine = amps && fuse ? '<line x1="'.concat(pad.left, '" x2="').concat(pad.left + plotW, '" y1="').concat(Y(fuse).toFixed(1), '" y2="').concat(Y(fuse).toFixed(1), '" stroke="').concat(css("--hot"), '" stroke-dasharray="4 4" stroke-opacity="0.7"/>') : "";
    const lines = data.phases.map((p) => {
      const runs = [];
      let run = [];
      p.values.forEach((v, k) => {
        if (typeof v === "number") run.push([X(start2 + (k + 0.5) * data.step * 1e3), Y(v)]);
        else if (run.length) {
          runs.push(run);
          run = [];
        }
      });
      if (run.length) runs.push(run);
      return runs.map((points) => '<path d="'.concat(smoothPath(points), '" fill="none" stroke="').concat(PHASE_COLORS[(p.phase - 1) % 3], '" stroke-width="1.6" stroke-linejoin="round"/>')).join("");
    }).join("");
    const legend = data.phases.map((p, i) => '<text x="'.concat(pad.left + 4 + i * 30, '" y="').concat(pad.top + 9, '" style="fill:').concat(PHASE_COLORS[(p.phase - 1) % 3], ';font-size:11px;font-weight:600">L').concat(p.phase, "</text>")).join("");
    el.innerHTML = '<svg viewBox="0 0 '.concat(width, " ").concat(height, '" width="').concat(width, '" height="').concat(height, '" role="img" aria-label="Fasebelasting vandaag"><g class="axis">').concat(axis, "</g>").concat(fuseLine).concat(lines).concat(legend, "</svg>");
  }
  function renderPeak(peak) {
    if (!$("peak-kw")) return;
    const ok = Boolean(peak && typeof peak.peakW === "number");
    toggleEmpty("peak", ok);
    if (!ok) {
      setText("peak-empty", peak === void 0 ? "Verschijnt na het opslaan van de indeling" : "Nog geen piek gemeten. Het dashboard meet elk kwartier je gemiddelde afname.");
      return;
    }
    const kw = (w) => "".concat(nf(w >= 1e4 ? 1 : 2).format(w / 1e3), " kW");
    setText("peak-kw", kw(peak.peakW));
    setText("peak-source", peak.source === "meter" ? "volgens je meter" : peak.since ? "gemeten sinds ".concat(new Date(peak.since).toLocaleDateString(LOCALE, { day: "numeric", month: "short" })) : "gemeten");
    setText("peak-at", peak.at ? new Date(peak.at).toLocaleString(LOCALE, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "hoogste kwartier deze maand");
    const facts = [];
    if (typeof peak.quarterW === "number") {
      const limit = Math.max(peak.peakW, (peak.minKw || 0) * 1e3);
      facts.push('<li class="'.concat(peak.quarterW > limit ? "over" : "", '"><span>Dit kwartier tot nu</span><strong>').concat(kw(peak.quarterW), "</strong></li>"));
    }
    if (peak.peakW < (peak.minKw || 0) * 1e3) {
      facts.push("<li><span>Telt mee als het minimum</span><strong>".concat(nf(1).format(peak.minKw), " kW</strong></li>"));
    }
    if (typeof peak.monthCost === "number") facts.push("<li><span>Kost deze maand</span><strong>".concat(euro(peak.monthCost), "</strong></li>"));
    if (typeof peak.yearKw === "number" && peak.months.length > 1) {
      facts.push("<li><span>Gemiddelde 12 maanden</span><strong>".concat(nf(2).format(peak.yearKw), " kW</strong></li>"));
    }
    if (typeof peak.yearCost === "number") facts.push("<li><span>Per jaar</span><strong>".concat(euro(peak.yearCost, 0), "</strong></li>"));
    $("peak-facts").innerHTML = facts.join("");
    renderPeakChart(peak);
  }
  function renderPeakChart(peak) {
    const el = $("peak-chart");
    if (!el) return;
    charts.set("peak-chart", () => renderPeakChart(peak));
    const months = peak.months || [];
    if (months.length < 2) {
      el.innerHTML = "";
      return;
    }
    const width = el.clientWidth || 300;
    const height = chartHeight(el, Number(el.dataset.height) || 110);
    const pad = { left: 26, right: 4, top: 6, bottom: 16 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = Math.max(...months.map((m) => m.w / 1e3), peak.minKw || 0, 1);
    const step = niceStep(max, 3);
    const top = Math.ceil(max / step) * step;
    const y = (v) => pad.top + plotH - v / top * plotH;
    const band = plotW / months.length;
    const barW = Math.max(2, Math.min(22, band * 0.64));
    let axis = "";
    for (let v = 0; v <= top + 1e-9; v += step) {
      axis += '<line x1="'.concat(pad.left, '" x2="').concat(width - pad.right, '" y1="').concat(y(v), '" y2="').concat(y(v), '" class="').concat(v === 0 ? "zero" : "", '"/>');
      axis += '<text x="'.concat(pad.left - 5, '" y="').concat(y(v) + 4, '" text-anchor="end">').concat(nf(step < 1 ? 1 : 0).format(v), "</text>");
    }
    const color = css("--grid");
    let bars = "";
    months.forEach((m, i) => {
      const x = pad.left + band * i + (band - barW) / 2;
      const v = m.w / 1e3;
      const current = i === months.length - 1;
      const date = new Date("".concat(m.month, "-01T00:00:00"));
      bars += '<rect x="'.concat(x, '" y="').concat(y(v), '" width="').concat(barW, '" height="').concat(Math.max(1, y(0) - y(v)), '" rx="').concat(Math.min(3, barW / 3), '" fill="').concat(color, '" fill-opacity="').concat(current ? 1 : 0.55, '"><title>').concat(date.toLocaleDateString(LOCALE, { month: "long", year: "numeric" }), ": ").concat(nf(2).format(v), " kW</title></rect>");
      if (i % Math.ceil(months.length * 22 / plotW) === 0) axis += '<text x="'.concat(pad.left + band * i + band / 2, '" y="').concat(height - 3, '" text-anchor="middle">').concat(date.toLocaleDateString(LOCALE, { month: "narrow" }), "</text>");
    });
    const floor = peak.minKw ? '<line x1="'.concat(pad.left, '" x2="').concat(width - pad.right, '" y1="').concat(y(peak.minKw), '" y2="').concat(y(peak.minKw), '" stroke="').concat(css("--muted"), '" stroke-dasharray="3 4"/>') : "";
    el.innerHTML = '<svg viewBox="0 0 '.concat(width, " ").concat(height, '" width="').concat(width, '" height="').concat(height, '" role="img" aria-label="Maandpiek"><g class="axis">').concat(axis, "</g>").concat(floor).concat(bars, "</svg>");
  }
  function renderBatteryHistory(history) {
    if (!$("batteryhistory-chart")) return;
    const ok = Boolean(history == null ? void 0 : history.hasBattery);
    toggleEmpty("batteryhistory", ok);
    if (!ok) return;
    setText("batteryhistory-period", PERIOD_LABELS[state.period] || "");
    const t = history.totals;
    const info = history.batteryHistory || {};
    const period = (PERIOD_LABELS[state.period] || "").toLowerCase();
    const facts = [
      "<li><span>Geladen ".concat(period, "</span><strong>").concat(formatEnergy(t.charge), " kWh</strong></li>"),
      "<li><span>Ontladen ".concat(period, "</span><strong>").concat(formatEnergy(t.discharge), " kWh</strong></li>")
    ];
    if (typeof info.chargePrice === "number") facts.push("<li><span>Laden kostte gemiddeld</span><strong>".concat(euro(info.chargePrice, 3), " per kWh</strong></li>"));
    if (typeof info.dischargePrice === "number") facts.push("<li><span>Ontladen bespaarde gemiddeld</span><strong>".concat(euro(info.dischargePrice, 3), " per kWh</strong></li>"));
    if (typeof info.chargePrice === "number" && typeof info.dischargePrice === "number") {
      facts.push("<li><span>Verschil per kWh</span><strong>".concat(euro(info.dischargePrice - info.chargePrice, 3), "</strong></li>"));
    }
    if (history.batteryEarnings) facts.push("<li><span>Opbrengst ".concat(period, "</span><strong>").concat(euro(history.batteryEarnings.withNetting), "</strong></li>"));
    $("batteryhistory-facts").innerHTML = facts.join("");
    const positive = [
      { key: "batteryToHome", label: "Naar huis", color: css("--battery") },
      { key: "batteryToGrid", label: "Naar het net", color: css("--export") }
    ];
    const negative = [
      { key: "solarToBattery", label: "Van de zon", color: css("--solar") },
      { key: "gridToBattery", label: "Van het net", color: css("--grid") }
    ];
    const legend = $("batteryhistory-legend");
    if (legend) legend.innerHTML = [...positive, ...negative].map((x) => '<span><i style="background:'.concat(x.color, '"></i>').concat(x.label, "</span>")).join("");
    renderBars("batteryhistory-chart", history.rows, { positive, negative, unit: "kWh", bucket: history.bucket });
    const list = $("batteryhistory-sessions");
    const sessions = info.sessions || [];
    list.hidden = !sessions.length;
    list.innerHTML = sessions.slice().reverse().slice(0, fixedHeight(list) ? 30 : 8).map((s) => {
      const what = s.kind === "charge" ? s.share >= 0.5 ? "Geladen van de zon" : "Geladen van het net" : s.share >= 0.5 ? "Ontladen naar het net" : "Ontladen naar huis";
      const price = typeof s.price === "number" ? " · ".concat(euro(s.price, 3)) : "";
      return "<li><span><b>".concat(hm(s.start), "–").concat(hm(s.end), "</b> <em>").concat(what, "</em></span><strong>").concat(formatEnergy(s.kWh), " kWh").concat(price, "</strong></li>");
    }).join("");
    setText("batteryhistory-note", "Laden van de zon kost de teruglevering die je daardoor misloopt; ontladen bespaart de prijs van stroom van het net.");
  }
  const SIZE_ORDER = ["small", "half", "large", "full"];
  const SIZE_SPANS = { small: 4, half: 6, large: 8, full: 12 };
  const SIZE_NAMES = { small: "1/3", half: "1/2", large: "2/3", full: "hele breedte" };
  const PIN_KEY = "energy-dashboard-pin";
  const edit = { info: null, pin: "" };
  const sizeOf = (el) => SIZE_ORDER.find((size) => el.classList.contains("size-".concat(size))) || "half";
  function setSize(el, size) {
    SIZE_ORDER.forEach((s) => el.classList.remove("size-".concat(s)));
    el.classList.add("size-".concat(size));
  }
  function currentLayout() {
    return [...$("blocks").children].map((el) => {
      const rows = Number(el.dataset.rows);
      return rows ? { id: el.dataset.block, size: sizeOf(el), rows } : { id: el.dataset.block, size: sizeOf(el) };
    });
  }
  function editStatus(text, isError = false) {
    const el = $("edit-status");
    el.textContent = text;
    el.classList.toggle("error", isError);
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
      renderBatterySize(state.live.batterysize);
      renderPhases(state.live.phases);
      renderGroups(state.live.groups);
      renderPeak(state.live.peak);
      renderWater(state.live, state.history);
      renderSankeyBlock();
    }
    if (state.history) renderHistory(state.history);
    relayout();
  }
  function decorate(el) {
    const tools = document.createElement("div");
    tools.className = "block-tools";
    tools.innerHTML = '\n      <span class="block-name">'.concat(escapeHtml(blockTitle(el.dataset.block)), '</span>\n      <button type="button" class="auto-height" title="Hoogte weer laten bepalen door de inhoud"').concat(el.dataset.rows ? "" : " hidden", '>Hoogte auto</button>\n      <button type="button" class="tool drag-handle" title="Verplaatsen" aria-label="Verplaatsen">⠿</button>\n      <button type="button" class="tool hide-block" title="Verbergen" aria-label="Verbergen">✕</button>');
    const handle = document.createElement("div");
    handle.className = "resize-handle";
    handle.title = "Sleep om de breedte te veranderen";
    handle.innerHTML = '<i></i><span class="size-badge"></span>';
    const heightHandle = document.createElement("div");
    heightHandle.className = "height-handle";
    heightHandle.title = "Sleep om de hoogte te veranderen";
    heightHandle.innerHTML = '<i></i><span class="size-badge"></span>';
    el.append(tools, handle, heightHandle);
  }
  function undecorate(el) {
    el.querySelectorAll(".block-tools, .resize-handle, .height-handle").forEach((x) => x.remove());
  }
  function blockTitle(id) {
    var _a2, _b2;
    return ((_b2 = (_a2 = edit.info) == null ? void 0 : _a2.blocks.find((b) => b.id === id)) == null ? void 0 : _b2.title) || id;
  }
  function renderHiddenBlocks() {
    const shown = new Set(currentLayout().map((b) => b.id));
    const hidden = edit.info.blocks.filter((b) => !shown.has(b.id));
    $("edit-hidden").innerHTML = hidden.length ? '<span class="muted">Toevoegen:</span> '.concat(hidden.map((b) => '<button type="button" class="chip-button" data-add="'.concat(b.id, '">+ ').concat(escapeHtml(b.title), "</button>")).join("")) : "";
  }
  function addBlock(id) {
    const block = edit.info.blocks.find((b) => b.id === id);
    const el = block && createBlock(block);
    if (!el) return;
    decorate(el);
    $("blocks").appendChild(el);
    renderAll();
    relayout();
    watchSizes();
    renderHiddenBlocks();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  async function startEdit() {
    try {
      edit.info = await state.options.get("/layout".concat(layoutQuery()));
    } catch (err) {
      setBanner("error", "Bewerken lukt niet: ".concat(escapeHtml(err.message || err)));
      return;
    }
    state.editing = true;
    document.body.classList.add("editing");
    $("edit-bar").hidden = false;
    try {
      edit.pin = localStorage.getItem(PIN_KEY) || "";
    } catch {
      edit.pin = "";
    }
    const pinInput = $("edit-pin");
    pinInput.hidden = !edit.info.pinRequired;
    pinInput.value = edit.pin;
    editStatus("");
    fillLayoutChoice();
    [...$("blocks").children].forEach(decorate);
    renderHiddenBlocks();
  }
  const layoutQuery = () => state.layoutName ? "?layout=".concat(encodeURIComponent(state.layoutName)) : "";
  function chooseLayout(name) {
    state.layoutName = name || "";
    try {
      if (state.layoutName) localStorage.setItem(LAYOUT_KEY, state.layoutName);
      else localStorage.removeItem(LAYOUT_KEY);
    } catch {
    }
  }
  function fillLayoutChoice() {
    const select = $("edit-layout");
    const names = edit.info.names || [];
    select.innerHTML = [["", "Standaard indeling"], ...names.map((n) => [n, n]), ["__new", "Nieuwe indeling…"]].map(([value, label]) => '<option value="'.concat(escapeHtml(value), '">').concat(escapeHtml(label), "</option>")).join("");
    select.value = state.layoutName && names.includes(state.layoutName) ? state.layoutName : "";
    edit.newLayout = false;
    $("edit-layout-name").hidden = true;
    $("edit-layout-name").value = "";
    $("edit-layout-remove").hidden = !state.layoutName;
  }
  async function switchLayout(value) {
    if (value === "__new") {
      edit.newLayout = true;
      $("edit-layout-name").hidden = false;
      $("edit-layout-name").focus();
      $("edit-layout-remove").hidden = true;
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
    document.body.classList.remove("editing");
    $("edit-bar").hidden = true;
    [...$("blocks").children].forEach(undecorate);
  }
  async function saveEdit(layout, remove = false) {
    const pin = $("edit-pin").value;
    let name = state.layoutName;
    if (edit.newLayout) {
      name = $("edit-layout-name").value.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(name)) {
        editStatus("Geef de indeling een naam van letters, cijfers of streepjes", true);
        $("edit-layout-name").focus();
        return;
      }
    }
    editStatus("Opslaan…");
    try {
      const info = await state.options.post("/layout", { layout, pin, name, remove });
      try {
        if (pin) localStorage.setItem(PIN_KEY, pin);
      } catch {
      }
      chooseLayout(info.name || "");
      stopEdit();
      state.layoutKey = null;
      applyLayout(info.layout);
      renderAll();
    } catch (err) {
      if (err.status === 403) {
        $("edit-pin").hidden = false;
        $("edit-pin").focus();
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
  function startDrag(event, el) {
    event.preventDefault();
    el.classList.add("dragging");
    const handle = event.target.closest(".drag-handle");
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
    }
    let scrollSpeed = 0;
    const scroller = setInterval(() => {
      if (scrollSpeed) window.scrollBy(0, scrollSpeed);
    }, 16);
    const move = (e) => {
      var _a2;
      scrollSpeed = e.clientY < 80 ? -12 : e.clientY > window.innerHeight - 80 ? 12 : 0;
      const target = (_a2 = document.elementFromPoint(e.clientX, e.clientY)) == null ? void 0 : _a2.closest("#blocks > .block");
      if (!target || target === el) return;
      const rect = target.getBoundingClientRect();
      const before = sizeOf(target) === "full" || rect.width > window.innerWidth * 0.8 ? e.clientY < rect.top + rect.height / 2 : e.clientX < rect.left + rect.width / 2;
      target.parentNode.insertBefore(el, before ? target : target.nextSibling);
    };
    const end = () => {
      clearInterval(scroller);
      el.classList.remove("dragging");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      redrawSoon();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  function startResize(event, el, handle) {
    event.preventDefault();
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
    }
    const grid = $("blocks").getBoundingClientRect();
    const badge = handle.querySelector(".size-badge");
    el.classList.add("resizing");
    const move = (e) => {
      const left = el.getBoundingClientRect().left;
      const columns = (e.clientX - left) / grid.width * 12;
      const size = SIZE_ORDER.reduce((best, s) => Math.abs(SIZE_SPANS[s] - columns) < Math.abs(SIZE_SPANS[best] - columns) ? s : best, "small");
      if (size !== sizeOf(el)) {
        setSize(el, size);
        redrawSoon();
      }
      badge.textContent = SIZE_NAMES[size];
    };
    const end = () => {
      el.classList.remove("resizing");
      badge.textContent = "";
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      redrawSoon();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    move(event);
  }
  function startHeightResize(event, el, handle) {
    event.preventDefault();
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
    }
    const badge = handle.querySelector(".size-badge");
    el.classList.add("resizing");
    let scrollSpeed = 0;
    let lastY = event.clientY;
    const scroller = setInterval(() => {
      if (!scrollSpeed) return;
      window.scrollBy(0, scrollSpeed);
      update(lastY);
    }, 16);
    const update = (clientY) => {
      const top = el.getBoundingClientRect().top;
      const min = Number(el.dataset.minRows) || MIN_ROWS;
      const rows = Math.min(MAX_ROWS, Math.max(min, Math.round((clientY - top + GAP) / ROW)));
      if (String(rows) !== el.dataset.rows) {
        el.dataset.rows = rows;
        el.style.gridRowEnd = "span ".concat(rows);
      }
      badge.textContent = "".concat(heightOf(rows), " px");
    };
    const move = (e) => {
      lastY = e.clientY;
      scrollSpeed = e.clientY > window.innerHeight - 60 ? 10 : e.clientY < 80 ? -10 : 0;
      update(e.clientY);
    };
    const end = () => {
      clearInterval(scroller);
      el.classList.remove("resizing");
      badge.textContent = "";
      const auto = el.querySelector(".auto-height");
      if (auto) auto.hidden = !el.dataset.rows;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      redrawSoon();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    update(event.clientY);
  }
  function initEditMode() {
    const toggle = $("edit-toggle");
    if (!toggle || !state.options.post) {
      if (toggle) toggle.hidden = true;
      return;
    }
    toggle.addEventListener("click", () => state.editing ? cancelEdit() : startEdit());
    $("edit-cancel").addEventListener("click", cancelEdit);
    $("edit-save").addEventListener("click", () => saveEdit(currentLayout()));
    $("edit-default").addEventListener("click", () => saveEdit(null));
    $("edit-layout").addEventListener("change", (e) => switchLayout(e.target.value));
    $("edit-layout-remove").addEventListener("click", () => saveEdit(null, true));
    $("edit-hidden").addEventListener("click", (e) => {
      var _a2;
      const id = (_a2 = e.target.closest("[data-add]")) == null ? void 0 : _a2.dataset.add;
      if (id) addBlock(id);
    });
    const blocks = $("blocks");
    blocks.addEventListener("pointerdown", (e) => {
      if (!state.editing) return;
      const el = e.target.closest("#blocks > .block");
      if (!el) return;
      if (e.target.closest(".drag-handle")) startDrag(e, el);
      else if (e.target.closest(".resize-handle")) startResize(e, el, e.target.closest(".resize-handle"));
      else if (e.target.closest(".height-handle")) startHeightResize(e, el, e.target.closest(".height-handle"));
    });
    blocks.addEventListener("click", (e) => {
      if (!state.editing) return;
      const auto = e.target.closest(".auto-height");
      if (auto) {
        const block = auto.closest("#blocks > .block");
        delete block.dataset.rows;
        auto.hidden = true;
        relayout();
        redrawSoon();
        return;
      }
      if (!e.target.closest(".hide-block")) return;
      e.target.closest("#blocks > .block").remove();
      renderHiddenBlocks();
      redrawSoon();
    });
  }
  const INFO = {
    flow: "Het vermogen van dit moment tussen zon, net, huis en batterij, elke 10 seconden gelezen. Huis = net + zon − batterij. Onder de cirkels staan de kWh van vandaag.",
    waterheater: "De temperatuur van je boiler. De doucheminuten zijn een schatting uit de inhoud, de temperatuur van het koude water, je douchetemperatuur en je douchekop (bij de instellingen).",
    heating: "Kamertemperatuur van je thermostaat, en wat je warmtepomp of cv-ketel doet. Stroom komt van de meting van het toestel, gas van je slimme meter (het hele huis). Gas per graaddag corrigeert voor het weer.",
    ev: "Vermogen en status van je laadpaal, en de geladen kWh in de gekozen periode uit Homey Insights.",
    battery: "Laadniveau en vermogen van je thuisbatterij en wat hij laadde en leverde. De opbrengst is wat ontladen bespaarde min wat laden kostte; laden met zonnestroom kost de teruglevering die je misliep.",
    batteryhistory: "Wat de batterij laadde (van zon of net) en leverde (aan huis of net). Waar de energie vandaan kwam, volgt uit de energiestromen van dat uur. Bij Vandaag en Gisteren elke sessie met de gemiddelde prijs.",
    tiles: "De totalen van de gekozen periode uit de meterstanden in Homey Insights, vergeleken met de vorige periode tot hetzelfde moment. Zelfvoorzienend is het deel van je verbruik uit zon en batterij.",
    prices: "De dynamische stroomprijzen van vandaag en morgen, per kwartier of uur, van Homey Energie of EnergyZero. Het goedkoopste blok is het goedkoopste aaneengesloten blok van 3 uur.",
    gauges: "Zelfvoorzienend: deel van je verbruik uit zon en batterij. Eigen zon gebruikt: deel van je zonnestroom dat je zelf gebruikte. Netto: afname min teruglevering.",
    consumers: 'Apparaten die nu stroom gebruiken, volgens hun eigen vermogensmeting. "geschat" betekent dat Homey het verbruik schat.',
    electricity: "Boven de nul waar je stroom vandaan kwam (net, zon, batterij), eronder waar overschot heen ging (teruglevering, batterij). Uit de meterstanden van je P1-meter, zonnepanelen en batterij.",
    power: "Het vermogen door de dag in stappen van 5 minuten uit Homey Insights; het laatste stuk loopt live mee. De stippellijn is de verwachting van Forecast.Solar.",
    sankey: 'Waar je energie vandaan kwam, via je huis naar elk apparaat met een meting; de dikte is de hoeveelheid. "Niet gemeten" is wat de apparaten samen niet verklaren.',
    devices: "kWh per apparaat in de gekozen periode, uit hun energiemeters in Homey Insights en het rapport van Homey Energie. Het percentage is het deel van je totale verbruik.",
    costs: "Elke meterstand is gerekend met de prijs van dat moment. Per regel: de hoeveelheid × de gemiddelde prijs in deze periode.",
    netting: "Wat het einde van salderen op 1 januari 2027 kost, over vorig jaar (of dit jaar tot nu): per gesaldeerde kWh het verschil tussen de prijs die je nu vermijdt en wat teruglevering zonder salderen oplevert. Teruglevering boven je afname werd nooit gesaldeerd.",
    solar: "Opbrengst van je zonnepanelen met een streepje voor de verwachting van Forecast.Solar. Prestatie = opbrengst ÷ verwachting; per kWp gebruikt het vermogen van je dakvlakken.",
    gas: "Gasverbruik van het hele huis uit je slimme meter. Per graaddag deelt het verbruik door de graaddagen (buitentemperatuur van Open-Meteo), zodat perioden met ander weer te vergelijken zijn.",
    water: "Waterverbruik in liters uit je watermeter, en het huidige verbruik per minuut.",
    batterysize: "Hoe groot een thuisbatterij moet zijn: per nacht wat het huis verbruikt terwijl de zon minder dan 200 W geeft, van de middag tot de middag erna, over de afgelopen 365 dagen. Het verbruik is wat de slimme meter afneemt plus wat de zonnepanelen leveren. Onder nul staat het zonne-overschot van een dag: wat je teruglevert en dus in een batterij kunt laden. Een batterij van een bepaalde grootte levert per nacht hooguit zijn capaciteit, hooguit wat die nacht gebruikt wordt en hooguit wat de zon die dag over had. Het vermogen is gemiddeld per meetstap van Homey (vaak een uur), dus korte pieken zoals een waterkoker vallen weg. De eerste keer haalt de app de nachten uit de dagrapporten van Homey Energy (vermogen per 5 minuten, zo ver terug als die gaan) en uit Insights, en daarna elke dag de afgelopen nacht. Elk dagrapport wordt gecontroleerd tegen zijn eigen kWh-totalen. Nachten met ontbrekende of onlogische metingen tellen niet mee: een koppeling die uit lag, een meter die bleef hangen, teruglevering terwijl de panelen niets gaven, of veel minder verbruik dan normaal. Een kort gat in het donker wordt aangevuld met het gemiddelde van die nacht. Wat een laadpaal gebruikt telt niet mee.",
    baseload: "Het laagste verbruik van het huis afgelopen nacht tussen 1:00 en 5:00, als alleen apparaten draaien die altijd aan staan.",
    alerts: "Apparaten die langer aan staan dan normaal, hoger sluipverbruik dan de afgelopen twee weken, meters die niet reageren, een negatieve prijs terwijl je teruglevert en een kwartier boven je maandpiek.",
    phases: "Stroom per fase van je slimme meter ten opzichte van je hoofdzekering; negatief is teruglevering. De grafiek toont de fasen door de dag.",
    groups: "De belasting per groep in je meterkast: het gemeten vermogen van de apparaten die je in de instellingen van de app aan de groep gaf (zonder meter: het verbruik dat in Homey is ingesteld), plus het vaste verbruik dat je invulde, als stroom (vermogen ÷ 230 V, gedeeld over de fasen van de groep) ten opzichte van de zekering. Overig is per fase wat je slimme meter meet (plus de zonnestroom op die fase, min wat de thuisbatterij er laadt) en wat de groepen niet verklaren. De balken onderaan tonen per groep hoe zwaar die door de dag belast was.",
    peak: "Voor het Belgische capaciteitstarief: je hoogste gemiddelde afname over een kwartier deze maand, van je meter of elke minuut gemeten door de app."
  };
  const fact = (label, value) => "<li><span>".concat(label, "</span><strong>").concat(value, "</strong></li>");
  const money = (value, digits = 2) => typeof value === "number" ? euro(value, digits) : "–";
  const times = (amount, unit, price, result) => "".concat(amount, " ").concat(unit, " × ").concat(money(price, 3), " = ").concat(money(result));
  function tariffFacts() {
    var _a2;
    const tf = (_a2 = state.live) == null ? void 0 : _a2.tariff;
    if (!tf) return [];
    const e = tf.electricity;
    const out = [];
    if (e.type === "dynamic" && e.source === "powerhour") {
      out.push("<p>De all-in prijs komt van Power by the Hour, met de opslagen die je daar invulde.</p>");
    } else if (e.type === "dynamic" && e.source === "homey") {
      out.push("<p>De all-in prijs komt uit de formule die je in Homey invulde.</p>");
      if (e.formula) out.push('<ul class="facts">'.concat(fact("Formule in Homey", "<code>".concat(escapeHtml(e.formula), "</code>")), "</ul>"));
    } else if (e.type === "dynamic") {
      out.push("<p>Prijs per kwartier = marktprijs + energiebelasting + opslag leverancier.</p>");
      const vat = e.marketVat ? fact("Btw over de marktprijs van Homey", "".concat(nf(0).format(e.marketVat * 100), "%")) : "";
      out.push('<ul class="facts">'.concat(vat).concat(fact("Energiebelasting", "".concat(money(e.energyTax, 5), " per kWh"))).concat(fact("Opslag leverancier", "".concat(money(e.markup, 4), " per kWh")), "</ul>"));
    } else if (typeof e.normal === "number") {
      const low = typeof e.low === "number" ? fact("Daltarief", "".concat(money(e.low, 4), " per kWh · ").concat(e.lowFrom, ":00–").concat(e.lowTo, ":00").concat(e.lowWeekend ? " + weekend" : "")) : "";
      out.push('<ul class="facts">'.concat(fact("Normaaltarief", "".concat(money(e.normal, 4), " per kWh"))).concat(low, "</ul>"));
    }
    if (e.netting) {
      out.push(typeof e.export === "number" && e.type === "fixed" ? '<ul class="facts">'.concat(fact("Terugleververgoeding", "".concat(money(e.export, 4), " per kWh")), "</ul>") : "<p>Met salderen levert teruglevering de prijs van dat moment op.</p>");
    } else {
      out.push(e.type === "dynamic" && e.source === "powerhour" ? "<p>Zonder salderen levert teruglevering de terugleverprijs van Power by the Hour op.</p>" : e.type === "dynamic" ? "<p>Zonder salderen levert teruglevering de marktprijs op, min de terugleverkosten.</p>" : "<p>Zonder salderen levert teruglevering de terugleververgoeding op, min de terugleverkosten.</p>");
      if (e.exportFee) out.push('<ul class="facts">'.concat(fact("Terugleverkosten", "".concat(money(e.exportFee, 4), " per kWh")), "</ul>"));
    }
    return out;
  }
  function infoDetails(id) {
    var _a2, _b2, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    const t = (_a2 = state.history) == null ? void 0 : _a2.totals;
    const tf = (_b2 = state.live) == null ? void 0 : _b2.tariff;
    if (id === "costs" && (t == null ? void 0 : t.costs)) {
      const rows = [];
      const line = (label, qty, unit, cost, digits = 2) => {
        if (typeof cost !== "number") return;
        rows.push(fact(label, qty > 0 ? times(nf(digits).format(qty), unit, Math.abs(cost) / qty, cost) : money(cost)));
      };
      line("Stroom afname", t.import, "kWh", t.costs.import);
      line("Teruglevering", t.export, "kWh", t.costs.export);
      line("Gas", t.gas, "m³", t.costs.gas, 3);
      line("Water", t.water / 1e3, "m³", t.costs.water, 3);
      if (typeof t.costs.fixed === "number" && tf && typeof tf.monthly === "number") {
        const perDay = (tf.monthly * 12 - (tf.taxReduction || 0)) / 365;
        rows.push(fact("Vaste kosten per dag", "(".concat(money(tf.monthly), " × 12 − ").concat(money(tf.taxReduction || 0), ") ÷ 365 = ").concat(money(perDay))));
        if (perDay) rows.push(fact("Vaste kosten", "".concat(nf(1).format(t.costs.fixed / perDay), " d × ").concat(money(perDay), " = ").concat(money(t.costs.fixed))));
      }
      rows.push(fact("Totaal", money(t.cost)));
      return ['<ul class="facts">'.concat(rows.join(""), "</ul>"), ...tariffFacts()].join("");
    }
    if (id === "prices") {
      const p = (_c = state.live) == null ? void 0 : _c.prices;
      if (!p || p.error) return "";
      const rows = [];
      if (typeof p.market === "number") rows.push(fact("Marktprijs nu", "".concat(money(p.market, 3), " per kWh")));
      if (p.allIn && typeof p.current === "number") rows.push(fact("All-in nu", "".concat(money(p.current, 3), " per kWh")));
      return [rows.length ? '<ul class="facts">'.concat(rows.join(""), "</ul>") : "", ...p.allIn ? tariffFacts().slice(0, 2) : []].join("");
    }
    if (id === "netting") {
      const n = (_d = state.live) == null ? void 0 : _d.netting;
      if (!n || typeof n.perKWh !== "number") return "";
      return '<ul class="facts">'.concat(fact("Teruggeleverd", "".concat(nf(0).format(n.export), " kWh"))).concat(fact("Daarvan gesaldeerd", "".concat(nf(0).format(n.netted), " kWh"))) + "".concat(fact("Besparing per kWh", money(n.perKWh, 3))).concat(fact("Extra per jaar", times(nf(0).format(n.netted), "kWh", n.perKWh, n.extra)), "</ul>").concat(tariffFacts().join(""));
    }
    if (id === "battery") {
      const b = (_e = state.history) == null ? void 0 : _e.batteryEarnings;
      if (!b) return "";
      return '<ul class="facts">'.concat(fact("Ontladen", "".concat(formatEnergy(b.discharged), " kWh"))).concat(fact("Geladen", "".concat(formatEnergy(b.charged), " kWh"))).concat(fact("Opbrengst", money(b.withNetting)), "</ul>");
    }
    if (id === "batteryhistory") {
      const h = (_f = state.history) == null ? void 0 : _f.batteryHistory;
      if (!h || !t) return "";
      const rows = [];
      const out = typeof h.dischargePrice === "number" ? t.discharge * h.dischargePrice : null;
      const inn = typeof h.chargePrice === "number" ? t.charge * h.chargePrice : null;
      if (out !== null) rows.push(fact("Ontladen", times(formatEnergy(t.discharge), "kWh", h.dischargePrice, out)));
      if (inn !== null) rows.push(fact("Geladen", times(formatEnergy(t.charge), "kWh", h.chargePrice, inn)));
      if (out !== null && inn !== null) rows.push(fact("Opbrengst", "".concat(money(out), " − ").concat(money(inn), " ≈ ").concat(money(out - inn))));
      return rows.length ? '<ul class="facts">'.concat(rows.join(""), "</ul>") : "";
    }
    if (id === "batterysize") {
      const all = (_g = state.live) == null ? void 0 : _g.batterysize;
      const b = batteryView(all).view;
      if (!b || !b.nights) return "";
      b.imported = all.imported;
      b.check = all.check;
      const rows = [
        fact("Nachten", "".concat(nf(0).format(b.nights), " (").concat(b.from, " – ").concat(b.to, ")")),
        fact("Per jaar", "".concat(nf(2).format(b.avgDark), " kWh × 365 = ").concat(nf(0).format(b.yearDark), " kWh")),
        fact("Meetstap", "".concat(nf(0).format(b.step), " min"))
      ];
      if (typeof b.unlimited === "number") rows.push(fact("Hoogst haalbaar met zon", "".concat(nf(0).format(b.unlimited * 100), "%")));
      if (b.imported) rows.push(fact("Import", "".concat(b.imported.from, " – ").concat(b.imported.to, ", donker onder ").concat(nf(1).format(b.imported.darkHeight), "° zon")));
      if (b.check) rows.push(fact("Schatting t.o.v. gemeten", "".concat(nf(0).format(b.check.nights), " nachten: ").concat(nf(1).format(b.check.estimated / b.check.nights), " / ").concat(nf(1).format(b.check.measured / b.check.nights), " kWh").concat(b.check.factor !== 1 ? ", ×".concat(nf(2).format(b.check.factor)) : "")));
      if (!b.modelled && ((_h = all.fit) == null ? void 0 : _h.rejected)) rows.push(fact("Model", "niet gebruikt, afwijking ± ".concat(nf(0).format(all.fit.error * 100), "%")));
      if (!b.modelled && ((_j = (_i = all.fit) == null ? void 0 : _i.missingTotals) == null ? void 0 : _j.length)) rows.push(fact("Geen maandtotalen", all.fit.missingTotals.join(", ")));
      if (b.modelled && all.fit) {
        rows.push(fact("Model", "".concat(nf(0).format(all.fit.modelled.length), " maanden uit maandtotalen, gefit op ").concat(nf(0).format(all.fit.months.length)).concat(typeof all.fit.error === "number" ? ", afwijking ± ".concat(nf(0).format(all.fit.error * 100), "%") : "")));
      }
      const reasons = { gaps: "Ontbrekende metingen", stuck: "Meter bleef hangen", solar: "Teruglevering zonder zon", zero: "Bijna geen verbruik", low: "Veel lager dan normaal", mismatch: "Vermogen klopt niet met kWh-totaal" };
      for (const [reason, count] of Object.entries(b.skipped || {})) rows.push(fact(reasons[reason] || reason, "".concat(nf(0).format(count))));
      return '<ul class="facts">'.concat(rows.join(""), "</ul>");
    }
    if (id === "baseload") {
      const b = (_k = state.live) == null ? void 0 : _k.baseload;
      if (!b) return "";
      const rows = [fact("Per jaar", "".concat(formatPower(b.watts), " × 8.760 h = ").concat(nf(0).format(b.yearKWh), " kWh"))];
      if (typeof b.yearCost === "number" && b.yearKWh > 0) rows.push(fact("Kost per jaar", times(nf(0).format(b.yearKWh), "kWh", b.yearCost / b.yearKWh, b.yearCost)));
      return '<ul class="facts">'.concat(rows.join(""), "</ul>");
    }
    if (id === "peak") {
      const p = (_l = state.live) == null ? void 0 : _l.peak;
      if (!p || typeof p.peakW !== "number") return "";
      const counted = Math.max(p.peakW / 1e3, p.minKw || 0);
      const rows = [fact("Telt deze maand", "max(".concat(nf(2).format(p.peakW / 1e3), "; ").concat(nf(1).format(p.minKw || 0), ") = ").concat(nf(2).format(counted), " kW"))];
      if (p.tariff) {
        rows.push(fact("Kost deze maand", "".concat(nf(2).format(counted), " kW × ").concat(money(p.tariff), " ÷ 12 = ").concat(money(p.monthCost))));
        if (typeof p.yearKw === "number") rows.push(fact("Per jaar", "".concat(nf(2).format(p.yearKw), " kW × ").concat(money(p.tariff), " = ").concat(money(p.yearCost, 0))));
      }
      return '<ul class="facts">'.concat(rows.join(""), "</ul>");
    }
    return "";
  }
  function infoHtml(id) {
    return "<p>".concat(escapeHtml(INFO[id] || ""), "</p>").concat(infoDetails(id));
  }
  function addInfo(element, id) {
    if (!INFO[id]) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "info-button";
    button.title = "Uitleg";
    button.setAttribute("aria-label", "Uitleg");
    button.setAttribute("aria-expanded", "false");
    button.textContent = "i";
    const title = element.querySelector(".card-head h2");
    if (title) title.after(button);
    else {
      button.classList.add("corner");
      element.appendChild(button);
    }
    const pop = document.createElement("div");
    pop.className = "info-pop";
    pop.hidden = true;
    element.appendChild(pop);
  }
  function closeInfo(except = null) {
    document.querySelectorAll(".info-pop").forEach((pop) => {
      var _a2;
      if (pop === except) return;
      pop.hidden = true;
      (_a2 = pop.parentElement.querySelector(".info-button")) == null ? void 0 : _a2.setAttribute("aria-expanded", "false");
    });
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".info-button");
    if (!button) {
      if (!event.target.closest(".info-pop")) closeInfo();
      return;
    }
    event.stopPropagation();
    const block = button.closest(".block");
    const pop = block == null ? void 0 : block.querySelector(".info-pop");
    if (!pop) return;
    closeInfo(pop);
    if (!pop.hidden) {
      pop.hidden = true;
      button.setAttribute("aria-expanded", "false");
      return;
    }
    pop.innerHTML = infoHtml(block.dataset.block);
    pop.hidden = false;
    button.setAttribute("aria-expanded", "true");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeInfo();
  });
  const MANUAL = "https://github.com/WNijhof/homey-energy-dashboard/blob/main/homey-app/README.md";
  const ISSUES = "https://github.com/WNijhof/homey-energy-dashboard/issues/new";
  const MAIL_LIMIT = 1800;
  const GITHUB_LIMIT = 7e3;
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(() => copyFallback(text));
    copyFallback(text);
    return Promise.resolve();
  }
  function copyFallback(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;left:0;top:0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } catch {
    }
    area.remove();
  }
  function subjectOf(report) {
    var _a2, _b2, _c;
    const apps = [...new Set([...((_a2 = report.found) == null ? void 0 : _a2.batteries) || [], ...((_b2 = report.found) == null ? void 0 : _b2.solar) || [], ...report.batteryLike || [], (_c = report.found) == null ? void 0 : _c.p1].map((d) => {
      var _a3;
      return (_a3 = /^homey:app:([^:]+)/.exec((d == null ? void 0 : d.app) || "")) == null ? void 0 : _a3[1];
    }).filter(Boolean))];
    return "Diagnose: ".concat(apps.join(", ") || report.version || "");
  }
  function initSettingsLink() {
    const actions = document.querySelector(".header-actions");
    if (!actions || !state.options.settingsUrl) return;
    const link = document.createElement("a");
    link.className = "icon-button";
    link.href = state.options.settingsUrl;
    link.title = "Instellingen";
    link.setAttribute("aria-label", "Instellingen");
    link.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
    actions.appendChild(link);
  }
  function initHelpMenu() {
    const actions = document.querySelector(".header-actions");
    if (!actions || !state.options.get) return;
    const wrap = document.createElement("div");
    wrap.className = "screen-menu help-menu";
    wrap.innerHTML = '\n      <button class="icon-button" type="button" title="Probleem melden" aria-label="Probleem melden" aria-expanded="false">\n        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/></svg>\n      </button>\n      <div class="screen-panel" hidden>\n        <p class="screen-note">Wordt een apparaat niet gevonden of klopt er iets niet? Stuur de maker een rapport: welke apps en metingen je apparaten hebben, zonder namen, ruimtes of locatie.</p>\n        <label class="screen-row"><span>Mijn dashboard meesturen</span><input type="checkbox" data-help="snapshot"></label>\n        <button type="button" class="screen-row" data-help="mail"><span>Diagnose mailen</span><b>✉</b></button>\n        <button type="button" class="screen-row" data-help="github"><span>Delen op GitHub</span><b>↗</b></button>\n        <p class="screen-note" data-help="status"></p>\n        <textarea class="help-report" readonly hidden></textarea>\n      </div>';
    const button = wrap.querySelector("button");
    const panel = wrap.querySelector(".screen-panel");
    const status = panel.querySelector('[data-help="status"]');
    const box = panel.querySelector(".help-report");
    const close = () => {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    };
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!panel.hidden) return close();
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
    });
    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target)) close();
    });
    panel.addEventListener("click", async (event) => {
      var _a2;
      const kind = (_a2 = event.target.closest('[data-help="mail"], [data-help="github"]')) == null ? void 0 : _a2.dataset.help;
      if (!kind) return;
      const tab = kind === "github" ? window.open("about:blank", "_blank") : null;
      status.textContent = "Rapport maken…";
      let shared;
      try {
        const snapshot = panel.querySelector('[data-help="snapshot"]').checked;
        shared = await state.options.get("/diagnosis-report".concat(snapshot ? "?snapshot=1" : ""));
      } catch (err) {
        if (tab) tab.close();
        status.textContent = "Rapport maken mislukt: ".concat(err.message || err);
        return;
      }
      const pretty = JSON.stringify(shared.report, null, 2);
      box.value = pretty;
      box.hidden = false;
      await copyText(pretty);
      const tr = (text) => {
        var _a3, _b2;
        return (_b2 = (_a3 = window.EnergyI18n) == null ? void 0 : _a3.translate(text)) != null ? _b2 : text;
      };
      const intro = tr("Wat werkt er niet goed? (bijvoorbeeld: mijn batterij wordt niet gevonden)");
      const paste = tr("(Plak hier het rapport; het staat op je klembord.)");
      const subject = subjectOf(shared.report);
      if (kind === "mail" && shared.email) {
        const compact = JSON.stringify(shared.report);
        const full = "".concat(intro, "\n\n\n").concat(compact, "\n");
        const body = encodeURIComponent(full).length < MAIL_LIMIT ? full : "".concat(intro, "\n\n\n").concat(paste, "\n");
        location.href = "mailto:".concat(shared.email, "?subject=").concat(encodeURIComponent(subject), "&body=").concat(encodeURIComponent(body));
      } else {
        const full = "".concat(intro, "\n\n\n```json\n").concat(pretty, "\n```\n");
        const body = encodeURIComponent(full).length < GITHUB_LIMIT ? full : "".concat(intro, "\n\n\n").concat(paste, "\n");
        const url = "".concat(ISSUES, "?title=").concat(encodeURIComponent(subject), "&body=").concat(encodeURIComponent(body));
        if (tab) tab.location.href = url;
        else window.open(url, "_blank");
      }
      status.textContent = "Het rapport staat op je klembord. Staat het nog niet in de mail of het issue, plak het er dan in.";
    });
    const manual = document.createElement("a");
    manual.className = "icon-button";
    manual.href = MANUAL;
    manual.target = "_blank";
    manual.rel = "noopener";
    manual.title = "Handleiding";
    manual.setAttribute("aria-label", "Handleiding");
    manual.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.8"/><path d="M12 17h.01"/></svg>';
    const pencil = actions.querySelector("#edit-toggle");
    actions.insertBefore(wrap, pencil);
    actions.insertBefore(manual, pencil);
  }
  function renderConsumers(live) {
    const el = $("consumers");
    if (!el) return;
    const list = (live.consumers || []).slice(0, fixedHeight(el) ? 20 : 8);
    const max = Math.max(1, ...list.map((d) => d.watts));
    el.innerHTML = list.length ? list.map((d) => '\n          <li>\n            <div class="consumer-row"><span>'.concat(escapeHtml(d.name)).concat(estimateTag(d), "</span><strong>").concat(formatPower(d.watts), '</strong></div>\n            <div class="bar"><i style="width:').concat(Math.max(2, d.watts / max * 100), '%;background:var(--home)"></i></div>\n          </li>')).join("") : '<li class="muted">Geen apparaten met stroommeting actief</li>';
  }
  const TIMELINE_STEP = 5 * 60 * 1e3;
  const LOOK_BACK_IDLE = 10 * 60 * 1e3;
  let lookBackTimer = null;
  let timelineTimer = null;
  const hhmm = (ms) => new Date(ms).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
  function timelineDay() {
    const start2 = /* @__PURE__ */ new Date();
    start2.setHours(0, 0, 0, 0);
    if (state.period === "yesterday") start2.setDate(start2.getDate() - 1);
    const end = new Date(start2);
    end.setDate(end.getDate() + 1);
    const until = state.period === "today" ? Date.now() : end.getTime();
    return { start: start2.getTime(), steps: Math.max(1, Math.ceil((until - start2) / TIMELINE_STEP)), today: state.period === "today" };
  }
  function timelineShown() {
    var _a2;
    return Boolean($("timeline") && $("blocks") && POWER_DAYS[state.period] && !((_a2 = state.live) == null ? void 0 : _a2.snapshot));
  }
  function setMoment(at) {
    const day = timelineDay();
    if (at !== null) {
      at = day.start + Math.max(0, Math.floor((at - day.start) / TIMELINE_STEP)) * TIMELINE_STEP;
      if (day.today && at >= day.start + (day.steps - 1) * TIMELINE_STEP) at = null;
      else at = Math.min(at, day.start + (day.steps - 1) * TIMELINE_STEP);
    }
    if (at === state.at) return;
    state.at = at;
    clearTimeout(lookBackTimer);
    if (at !== null) lookBackTimer = setTimeout(() => setMoment(null), LOOK_BACK_IDLE);
    renderTimeline();
    renderPower();
    clearTimeout(timelineTimer);
    timelineTimer = setTimeout(loadLive, at === null ? 0 : 150);
  }
  function renderTimeline() {
    var _a2;
    const bar = $("timeline");
    if (!bar) return;
    const shown = timelineShown();
    bar.hidden = !shown;
    if (!shown) return;
    const { start: start2, steps, today } = timelineDay();
    const range = $("timeline-range");
    range.max = String(steps - 1);
    const step = state.at === null ? steps - 1 : Math.round((state.at - start2) / TIMELINE_STEP);
    if (document.activeElement !== range || state.at === null) range.value = String(step);
    const past = state.at !== null;
    bar.classList.toggle("past", past);
    bar.classList.toggle("idle", !past && !today);
    bar.querySelector(".timeline-track").style.setProperty("--pos", "".concat((step + 0.5) / steps * 100, "%"));
    range.setAttribute("aria-valuetext", past ? hhmm(state.at) : "Nu");
    const time = $("timeline-time");
    time.textContent = past ? hhmm(state.at) : "Nu";
    time.classList.toggle("loading", past && ((_a2 = state.live) == null ? void 0 : _a2.at) !== new Date(state.at).toISOString());
    $("timeline-now").hidden = !past;
    renderTimelineSpark(start2, today);
  }
  function renderTimelineSpark(start2, today) {
    var _a2, _b2;
    const el = $("timeline-spark");
    const power = (_a2 = state.history) == null ? void 0 : _a2.power;
    const key = "".concat(power == null ? void 0 : power.start, "|").concat((_b2 = power == null ? void 0 : power.points) == null ? void 0 : _b2.length, "|").concat(css("--muted"));
    if (!el || el.dataset.key === key) return;
    el.dataset.key = key;
    const points = Date.parse(power == null ? void 0 : power.start) === start2 ? power.points : [];
    const end = new Date(start2);
    end.setDate(end.getDate() + 1);
    const span = (today ? Date.now() : end.getTime()) - start2;
    const W = 1e3;
    const H = 100;
    const x = (t) => (t - start2) / span * W;
    const max = Math.max(500, ...points.map((p) => (p == null ? void 0 : p.home) || 0));
    const y = (w) => H - 4 - w / max * (H - 22);
    let area = "";
    let line = "";
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const d = run.map(([px, py], i) => "".concat(i ? "L" : "M").concat(px.toFixed(1), " ").concat(py.toFixed(1))).join(" ");
        line += '<path class="spark-line" d="'.concat(d, '"/>');
        area += '<path class="spark-area" d="'.concat(d, " L").concat(run[run.length - 1][0].toFixed(1), " ").concat(H, " L").concat(run[0][0].toFixed(1), " ").concat(H, ' Z"/>');
      }
      run = [];
    };
    points.forEach((p, i) => {
      if (p) run.push([x(start2 + (i + 0.5) * power.step * 1e3), y(p.home)]);
      else flush();
    });
    flush();
    const hours = [];
    for (let h = 0; h < 24; h += 3) {
      const t = new Date(start2).setHours(h, 0, 0, 0);
      if (t - start2 > span) break;
      hours.push('<text x="'.concat((x(t) / W * 100 + 0.6).toFixed(2), '%" y="11">').concat(String(h).padStart(2, "0"), "</text>"));
    }
    el.innerHTML = '\n      <svg viewBox="0 0 '.concat(W, " ").concat(H, '" preserveAspectRatio="none" style="position:absolute;inset:0">').concat(area).concat(line, '</svg>\n      <svg style="position:absolute;inset:0">').concat(hours.join(""), "</svg>");
  }
  function initTimeline() {
    const range = $("timeline-range");
    if (!range) return;
    const day = () => timelineDay();
    range.addEventListener("input", () => {
      const { start: start2 } = day();
      setMoment(start2 + Number(range.value) * TIMELINE_STEP);
    });
    range.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setMoment(null);
    });
    $("timeline-now").addEventListener("click", () => setMoment(null));
  }
  async function loadLive() {
    var _a2, _b2;
    if (state.liveBusy) return;
    state.liveBusy = true;
    const at = state.at;
    try {
      const query = [layoutQuery().slice(1), at !== null ? "at=".concat(at) : ""].filter(Boolean).join("&");
      const live = await state.options.get("/live".concat(query ? "?".concat(query) : ""));
      if (at !== state.at && state.live) return;
      if (live.version && state.version && live.version !== state.version) {
        if (!state.editing) {
          location.reload();
          return;
        }
      } else {
        state.version = live.version || state.version;
      }
      state.live = live;
      setText("today-label", (/* @__PURE__ */ new Date()).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }));
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
      (_b2 = (_a2 = window.EnergyScreen) == null ? void 0 : _a2.setPlace) == null ? void 0 : _b2.call(_a2, live.place);
      renderConsumers(live);
      renderPrices(live.prices);
      renderBaseload(live.baseload);
      renderBatterySize(live.batterysize);
      renderPhases(live.phases);
      renderGroups(live.groups);
      renderPeak(live.peak);
      renderWater(live, state.history);
      if (state.sankeyMode === "live") renderSankeyBlock();
      if (!live.at) addLivePower(live);
      renderPower();
      renderTimeline();
      if (rebuilt && state.history) renderHistory(state.history);
      if (rebuilt && !state.history) loadHistory();
      relayout();
      if (live.snapshot) {
        setStatus("demo", "Momentopname");
        setBanner("", "<strong>Momentopname van ".concat(escapeHtml(new Date(live.snapshot).toLocaleString(LOCALE)), ".</strong>"));
      } else if (live.demo) {
        setStatus("demo", "Demo");
        setBanner("", state.options.demoMessage || "");
      } else {
        setStatus("live", "Live");
        setBanner("", !live.devices.p1 && state.options.missingHint ? "<span>Niet gevonden: P1-meter.</span> ".concat(state.options.missingHint) : "");
      }
      if (live.at) setStatus("past", "Terugkijken · ".concat(hhmm(live.at)));
    } catch (err) {
      setStatus("error", "Geen verbinding");
      setMood(null);
      setBanner("error", "<strong>Kan geen gegevens ophalen.</strong> ".concat(escapeHtml(err.message || err)));
    } finally {
      state.liveBusy = false;
      if (at !== state.at) loadLive();
    }
    changed();
  }
  async function loadHistory() {
    const period = state.period;
    if (state.historyBusy === period) return;
    state.historyBusy = period;
    try {
      const history = await state.options.get("/history?period=".concat(period));
      if (period !== state.period) return;
      state.history = history;
      renderHistory(history);
      loadPowerToday();
    } catch (err) {
      if (period === state.period) {
        ["electricity-chart", "solar-chart", "gas-chart", "power-chart"].forEach((id) => {
          const el = $(id);
          if (el) el.innerHTML = '<div class="empty">'.concat(escapeHtml(err.message || err), "</div>");
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
    renderGroupChart();
    renderTimeline();
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
    if (state.at !== null) setMoment(null);
    renderTimeline();
    if ($("periods")) {
      try {
        localStorage.setItem(PERIOD_KEY, period);
      } catch {
      }
      document.querySelectorAll("#periods button").forEach((b) => b.classList.toggle("active", b.dataset.period === period));
    }
    loadHistory();
  }
  function needsHistory() {
    return Boolean($("blocks")) || ["tiles", "electricity-chart", "solar-chart", "gas-chart", "boiler-history", "sankey", "power-chart"].some((id) => $(id));
  }
  function redraw() {
    renderAll();
    changed();
  }
  function start(options) {
    var _a2, _b2, _c;
    state.options = options;
    const params = new URLSearchParams(location.search);
    const fromAddress = (_a2 = params.get("indeling")) != null ? _a2 : params.get("layout");
    let remembered = "";
    try {
      remembered = localStorage.getItem(LAYOUT_KEY) || "";
    } catch {
    }
    chooseLayout(fromAddress !== null ? fromAddress.toLowerCase() : remembered);
    (_b2 = window.EnergyI18n) == null ? void 0 : _b2.start();
    setText("today-label", (/* @__PURE__ */ new Date()).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }));
    let period = options.period;
    const periods = $("periods");
    if (periods) {
      try {
        period = period || localStorage.getItem(PERIOD_KEY);
      } catch {
      }
      periods.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-period]");
        if (button) selectPeriod(button.dataset.period);
      });
    }
    state.period = PERIOD_LABELS[period] ? period : "today";
    try {
      state.sankeyMode = localStorage.getItem(SANKEY_MODE_KEY) === "period" ? "period" : "live";
    } catch {
    }
    const header = document.querySelector(".top");
    if (header) {
      const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    window.addEventListener("resize", redrawSoon);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
    window.addEventListener("energy-theme", redraw);
    initEditMode();
    initTimeline();
    const resting = () => {
      var _a3;
      return document.hidden || ((_a3 = window.EnergyScreen) == null ? void 0 : _a3.sleeping());
    };
    (_c = window.EnergyScreen) == null ? void 0 : _c.start({
      wake: () => {
        loadLive();
        if (needsHistory()) loadHistory();
      }
    });
    initHelpMenu();
    initSettingsLink();
    loadLive();
    setInterval(() => {
      if (!resting()) loadLive();
    }, LIVE_INTERVAL);
    if (needsHistory()) {
      selectPeriod(state.period);
      setInterval(() => {
        if (!resting()) loadHistory();
      }, HISTORY_INTERVAL);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      loadLive();
      if (needsHistory()) loadHistory();
    });
  }
  const exportUrl = () => {
    var _a2;
    return "api/export?period=".concat(state.period, "&lang=").concat(((_a2 = window.EnergyI18n) == null ? void 0 : _a2.lang) || "nl");
  };
  window.EnergyDashboard = { start, redraw, exportUrl };
})();
