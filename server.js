'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { HomeyClient } = require('./lib/homey');
const {
  PERIODS, nettingSummary, expectedSolar, layoutName, savedLayout, historyCsv, PREVIOUS, discover, buildLive, buildHistory, buildBaseload, comparableTotals, todayTotals,
  blockCatalog, resolveLayout, defaultLayout, validateLayout, PinGuard, estimatedDevices, gridPower, hasUsageEstimate,
  timelineDay, recordTimeline, buildLiveAt, totalsUntil, POWER_STEP,
} = require('./lib/energy');
const { PriceService } = require('./lib/prices');
const { ForecastService, recordForecast, totalKwp } = require('./lib/forecast');
const { WeatherService } = require('./lib/weather');
const { AlertMonitor, buildAlerts, recordBaseload } = require('./lib/alerts');
const { contractFrom, allInFunction, describeTariff, SUPPLIERS } = require('./lib/tariffs');
const { PeakTracker, peakSummary } = require('./lib/peak');
const demo = require('./lib/demo');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEVICES_CACHE_TTL = 5 * 1000;
const HISTORY_CACHE_TTL = 60 * 1000;
const BASELOAD_CACHE_TTL = 60 * 60 * 1000;
// A day of Insights for looking back: today gets a new step every 5 minutes, yesterday is done
const TIMELINE_TTL = { today: 2 * 60 * 1000, yesterday: 30 * 60 * 1000 };
const TIMELINE_FRESH = 30 * 1000;
// Open pages load again when this changes, e.g. after an update and a restart of the server
const VERSION = `${require('./package.json').version}-${Date.now()}`;

const DEFAULTS = {
  port: 8080,
  homey: { address: '', token: '' },
  devices: { p1: '', solar: [], batteries: [], boiler: '', heating: [], thermostat: '', evChargers: [], water: '' },
  boiler: { liters: 80, coldWaterTemp: 10, showerTemp: 40, showerFlow: 8, warmFrom: 50 },
  battery: { invertPower: false },
  grid: { fuseAmps: 25, capacityTariff: null, capacityMin: 2.5 },
  prices: { source: 'auto' },
  tariffs: {},
  demo: false,
};

function loadConfig() {
  let user = {};
  if (fs.existsSync(CONFIG_FILE)) {
    user = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  const cfg = {
    ...DEFAULTS,
    ...user,
    homey: { ...DEFAULTS.homey, ...user.homey },
    devices: { ...DEFAULTS.devices, ...user.devices },
    boiler: { ...DEFAULTS.boiler, ...user.boiler },
    battery: { ...DEFAULTS.battery, ...user.battery },
    grid: { ...DEFAULTS.grid, ...user.grid },
    prices: { ...DEFAULTS.prices, ...user.prices },
    tariffs: { ...DEFAULTS.tariffs, ...user.tariffs },
  };
  const unconfigured = !cfg.homey.address || !cfg.homey.token || cfg.homey.token.startsWith('PLAK');
  cfg.demo = cfg.demo || unconfigured;
  // The demo shows costs with a dynamic contract, unless config.json has one
  if (cfg.demo && !cfg.contract) {
    cfg.contract = {
      electricity: { type: 'dynamic', supplier: 'anwb', markup: 0.0200 },
      gas: { type: 'fixed', price: 1.35 },
      water: 1.1,
      monthly: 95,
    };
  }
  return cfg;
}

// A snapshot from "Share diagnosis" with "Include my dashboard", played back instead of a Homey:
// node server.js --snapshot=report.json. The file may hold the report as copied, or the full answer.
function loadSnapshot() {
  const arg = process.argv.find(a => a.startsWith('--snapshot='));
  if (!arg) return null;
  const file = arg.slice('--snapshot='.length);
  const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const snapshot = data.snapshot || data.report?.snapshot;
  if (!snapshot?.live) throw new Error(`Geen momentopname in ${file}: deel de diagnose met "Mijn dashboard meesturen" aan`);
  return snapshot;
}

const snapshot = loadSnapshot();
const cfg = loadConfig();
// Playing a snapshot back needs no Homey, like the demo
if (snapshot) cfg.demo = true;
const client = cfg.demo ? null : new HomeyClient(cfg.homey);

let devicesCache = { at: 0, devices: null };
let baseloadCache = { at: 0, data: null };
const historyCache = new Map();
// Prices from Homey Energy (when the API key may view energy) or EnergyZero; see lib/prices.js
const prices = new PriceService({
  source: () => cfg.prices.source,
  homey: client ? {
    prices: date => client.energy(`/price/electricity/dynamic?date=${date}`),
    userCosts: () => client.energy('/price/electricity/dynamic/user-costs'),
    priceType: () => client.energy('/price/electricity/type'),
    fixedPrice: () => client.energy('/option/electricityPriceFixed'),
    currency: () => client.energy('/currency'),
  } : null,
});
// The monthly peak for the Belgian capacity tariff; kept in memory while the server runs
const peakTracker = new PeakTracker();
let energyLiveCache = { at: 0, report: null };
const forecast = new ForecastService();
let forecastLog = {};
const weather = new WeatherService();
const alertMonitor = new AlertMonitor();
let baseloadLog = {};
const pinGuard = new PinGuard();

async function getDevices() {
  if (!devicesCache.devices || Date.now() - devicesCache.at > DEVICES_CACHE_TTL) {
    devicesCache = { at: Date.now(), devices: await client.getDevices() };
  }
  return devicesCache.devices;
}

// Homey Energy's live report, for devices with an estimated use. The page waits for it at most
// 2 seconds and otherwise uses the last one, so a slow Homey does not hold the dashboard up.
let energyLivePending = null;
async function getEstimated(devices, found) {
  if (Date.now() - energyLiveCache.at > 5000 && !energyLivePending) {
    energyLivePending = client.energy('/live').catch(() => null).then(report => {
      energyLiveCache = { at: Date.now(), report };
    }).finally(() => { energyLivePending = null; });
  }
  if (energyLivePending) await Promise.race([energyLivePending, new Promise(r => setTimeout(r, 2000))]);
  return estimatedDevices(energyLiveCache.report, devices, found);
}

// A day of Insights of every device, for looking back (see recordTimeline in lib/energy.js)
const timelineCache = new Map();
function getTimeline(day, devices, found, { fresh = false } = {}) {
  const key = `${day}:${new Date().toDateString()}`;
  const cached = timelineCache.get(key);
  // A fresh reading (for a moment after the last one) is shared too, and made at most every 30 s
  if (cached && Date.now() - cached.at < (fresh ? TIMELINE_FRESH : TIMELINE_TTL[day])) return cached.data;
  for (const k of timelineCache.keys()) if (!k.endsWith(new Date().toDateString())) timelineCache.delete(k);
  const read = (device, capability) => client.getEntries(device.id, capability, day).catch(() => []);
  const data = recordTimeline(read, devices, found, cfg, day);
  timelineCache.set(key, { at: Date.now(), data });
  data.catch(() => {
    if (timelineCache.get(key)?.data === data) timelineCache.delete(key);
  });
  return data;
}

// The live dashboard at an earlier moment `at` (milliseconds) of today or yesterday
async function getLiveAt(view, at) {
  const day = timelineDay(at);
  if (!day) throw Object.assign(new Error('Alleen vandaag en gisteren kun je terugkijken'), { status: 400 });
  const [history, recording] = await Promise.all([
    getHistory(day).catch(() => null),
    cfg.demo ? null : getDevices().then(devices => getTimeline(day, devices, discover(devices, cfg.devices))),
  ]);
  const power = history?.power;
  if (cfg.demo) {
    const step = Math.floor((at - Date.parse(power?.start || 0)) / POWER_STEP);
    const moment = Date.parse(power?.start || 0) + step * POWER_STEP;
    return { ...demo.live(view, moment), at: new Date(moment).toISOString(), today: power ? totalsUntil(power, step) : null };
  }
  const devices = await getDevices();
  const found = discover(devices, cfg.devices);
  let live = buildLiveAt(recording, devices, found, view, at, power);
  // A moment after the last reading of today: read again
  if (!live && day === 'today') live = buildLiveAt(await getTimeline(day, devices, found, { fresh: true }), devices, found, view, at, power);
  if (!live) throw Object.assign(new Error('Geen gegevens van dat moment'), { status: 404 });
  return live;
}

async function getLive(name = '', at = null) {
  if (snapshot) return { ...snapshot.live, demo: false, snapshot: snapshot.made, version: VERSION };
  const view = { ...cfg, layout: savedLayout(cfg, layoutName(name)) };
  let live;
  if (at !== null) {
    live = await getLiveAt(view, at);
  } else if (cfg.demo) {
    live = demo.live(view);
  } else {
    const devices = await getDevices();
    const found = discover(devices, cfg.devices);
    live = buildLive(devices, found, view, { estimated: await getEstimated(devices, found) });
    live.currency = await prices.currency().catch(() => null);
    if (live.layout.some(b => b.id === 'baseload')) live.baseload = await getBaseload(found).catch(() => null);
    if (live.layout.some(b => b.id === 'peak') || live.layout.some(b => b.id === 'alerts')) {
      live.peak = peakSummary({ tracker: peakTracker, p1: found.p1, grid: cfg.grid });
    }
  }
  if (live.layout.some(b => b.id === 'netting')) live.netting = await getNetting().catch(() => null);
  // Warnings are about now; looking back leaves them out
  if (live.layout.some(b => b.id === 'alerts') && at === null) {
    if (cfg.demo) {
      live.alerts = [
        { id: 'on-demo', level: 'info', text: 'Wasmachine staat al 5 uur aan (12 W)' },
        { id: 'baseload', level: 'warning', text: 'Sluipverbruik is 246 W, normaal 186 W' },
      ];
    } else {
      const devices = await getDevices();
      const found = discover(devices, cfg.devices);
      const market = cfg.prices.source === 'off' ? null : await prices.get({}).catch(() => null);
      live.alerts = buildAlerts({
        monitor: alertMonitor, found, baseload: live.baseload, baseloadLog, hours: Number(cfg.alerts?.hours) || 4,
        price: market ? { market: market.current, currency: market.currency } : null,
        gridW: live.gridW,
        peak: live.peak,
      });
    }
  }
  live.version = VERSION;
  // The contract, for the explanation of the amounts in the cost blocks
  live.tariff = describeTariff(contractFrom(cfg), cfg.demo ? null : await prices.homeyTariff().catch(() => null));
  // Roughly where the house is, for a screen that turns dark from sunset to sunrise
  const place = cfg.location || (cfg.forecast?.lat ? { lat: cfg.forecast.lat, lon: cfg.forecast.lon } : null)
    || (cfg.demo ? { lat: 52.1, lon: 5.1 } : null);
  if (typeof place?.lat === 'number' && typeof place?.lon === 'number') live.place = { lat: Math.round(place.lat * 10) / 10, lon: Math.round(place.lon * 10) / 10 };
  // Today's totals for the live diagram; the history is cached, so this is cheap. Looking back,
  // getLiveAt() gave the totals up to that moment.
  if (at === null) live.today = todayTotals((await getHistory('today').catch(() => null))?.totals);
  if (live.layout.some(b => b.id === 'prices')) {
    const allIn = allInFunction(contractFrom(cfg), await prices.homeyTariff().catch(() => null));
    live.prices = await prices.get(cfg.prices, { allIn }).catch(err => ({ error: err.message }));
  }
  return live;
}

// The end of net metering, from last year (or this year while last year has too little data)
let nettingCache = null;
async function getNetting() {
  if (nettingCache && Date.now() - nettingCache.at < 60 * 60 * 1000) return nettingCache.data;
  const last = nettingSummary(await getHistory('lastYear', { light: true }).catch(() => null), 'lastYear');
  const data = last.months >= 10 && last.extra !== null
    ? last
    : nettingSummary(await getHistory('year', { light: true }).catch(() => null), 'year');
  nettingCache = { at: Date.now(), data };
  return data;
}

async function getBaseload(found) {
  if (Date.now() - baseloadCache.at > BASELOAD_CACHE_TTL) {
    const market = await prices.get({}).catch(() => null);
    const homey = await prices.homeyTariff().catch(() => null);
    baseloadCache = { at: Date.now(), data: await buildBaseload(client, found, cfg, market?.avg, homey) };
    baseloadLog = recordBaseload(baseloadLog, baseloadCache.data?.watts);
  }
  return baseloadCache.data;
}

async function getHistory(period, { light = false } = {}) {
  if (snapshot) {
    const history = snapshot.history?.[period];
    if (!history) throw Object.assign(new Error('Deze periode zit niet in de momentopname'), { status: 404 });
    return history;
  }
  const key = `${period}${light ? ':light' : ''}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.at < HISTORY_CACHE_TTL) return cached.data;

  let data;
  if (cfg.demo) {
    data = demo.history(period, cfg);
    if (period === 'today' && !light) data.forecast = demo.forecast();
    if (!light) {
      data.expectedSolar = expectedSolar(period, data.rows.map(r => ({ start: new Date(r.start) })), demo.forecastLog());
      data.kwp = 4.2;
      data.solarDevices = [
        { name: 'Omvormer dak zuid (demo)', kWh: data.totals.solar * 0.62 },
        { name: 'Omvormer garage (demo)', kWh: data.totals.solar * 0.38 },
      ];
    }
  } else {
    const devices = await getDevices();
    // The location for the weather: `location` in config.json, or the one of the solar forecast
    const location = cfg.location || (cfg.forecast?.lat ? { lat: cfg.forecast.lat, lon: cfg.forecast.lon } : null);
    const found = discover(devices, cfg.devices);
    const estimated = light ? [] : await getEstimated(devices, found);
    data = await buildHistory(client, devices, found, period, cfg, { light, prices, weather, location, estimated });
    if (period === 'today' && !light && cfg.forecast?.enabled) {
      data.forecast = await forecast.get({ lat: cfg.forecast.lat, lon: cfg.forecast.lon, planes: cfg.forecast.planes }).catch(() => null);
      if (data.forecast) forecastLog = recordForecast(forecastLog, data.forecast);
    }
    if (!light && cfg.forecast?.enabled) {
      data.expectedSolar = expectedSolar(period, data.rows.map(r => ({ start: new Date(r.start) })), forecastLog);
      data.kwp = totalKwp(cfg.forecast.planes) || null;
    }
  }
  if (!light && PREVIOUS[period]) {
    const previous = await getHistory(PREVIOUS[period], { light: true }).catch(() => null);
    data.previous = comparableTotals(previous, data);
  }
  historyCache.set(key, { at: Date.now(), data });
  return data;
}

// ---------- Layout editing from the dashboard ----------

async function getLayoutInfo(name = '') {
  const layout = layoutName(name);
  const common = { blocks: blockCatalog(), name: layout, names: Object.keys(cfg.layouts || {}), customLayout: Boolean(savedLayout(cfg, layout)) };
  if (snapshot) return { ...common, layout: snapshot.live.layout, defaultLayout: snapshot.live.layout, pinRequired: false };
  if (cfg.demo) {
    return {
      ...common,
      layout: demo.live({ ...cfg, layout: savedLayout(cfg, layout) }).layout,
      defaultLayout: demo.live({ ...cfg, layout: null }).layout,
      pinRequired: Boolean(cfg.editPin),
    };
  }
  const devices = await getDevices();
  const found = discover(devices, cfg.devices);
  return {
    ...common,
    layout: resolveLayout(savedLayout(cfg, layout), found, cfg),
    defaultLayout: defaultLayout(found, cfg),
    pinRequired: Boolean(cfg.editPin),
  };
}

// Saves the layout in config.json, keeping everything else in that file as it is
// Saves the default layout, or a named one; `remove` deletes a named layout
async function saveLayout({ layout, pin, name, remove }) {
  pinGuard.check(cfg.editPin, pin);
  const target = layoutName(name);
  const user = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {};
  if (target) {
    cfg.layouts = { ...(cfg.layouts || {}) };
    if (remove) delete cfg.layouts[target];
    else cfg.layouts[target] = validateLayout(layout) || cfg.layout;
    user.layouts = cfg.layouts;
  } else {
    cfg.layout = validateLayout(layout);
    user.layout = cfg.layout;
  }
  // The demo keeps its layouts in memory only
  if (!cfg.demo || fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(user, null, 2)}\n`);
  return getLayoutInfo(remove ? '' : target);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 16 * 1024) {
        // Too much: answer 413, and let the rest arrive without keeping it
        reject(Object.assign(new Error('Te veel gegevens'), { status: 413 }));
        req.removeAllListeners('data');
        req.resume();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(Object.assign(new Error('Ongeldige gegevens'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// Lists all devices, to look up ids for pinning devices in config.json
async function getDeviceList() {
  if (cfg.demo) {
    return {
      dashboardUrl: `http://localhost:${cfg.port}`,
      server: { running: true, port: cfg.port, message: null },
      blocks: blockCatalog(),
      layout: demo.live(cfg).layout,
      defaultLayout: demo.live({ ...cfg, layout: null }).layout,
      customLayout: Boolean(cfg.layout),
      found: {
        p1: 'demo-p1', solar: ['demo-pv'], batteries: ['demo-battery'], boiler: 'demo-boiler',
        heating: ['demo-hp'], thermostat: 'demo-thermostat', evChargers: ['demo-ev'], water: 'demo-water',
      },
      devices: [
        { id: 'demo-boiler', name: 'Lydos Hybrid', class: 'waterheater' },
        { id: 'demo-pv', name: 'Omvormer', class: 'solarpanel' },
        { id: 'demo-p1', name: 'Slimme meter', class: 'sensor' },
        { id: 'demo-battery', name: 'Zendure SolarFlow 2400 AC', class: 'battery' },
        { id: 'demo-hp', name: 'Hybride warmtepomp', class: 'heatpump' },
        { id: 'demo-thermostat', name: 'Thermostaat woonkamer', class: 'thermostat' },
        { id: 'demo-ev', name: 'Laadpaal oprit', class: 'evcharger' },
        { id: 'demo-water', name: 'Watermeter', class: 'sensor' },
        { id: 'demo-dishwasher', name: 'Vaatwasser', class: 'socket', power: true },
        { id: 'demo-washer', name: 'Wasmachine', class: 'socket', power: true },
        { id: 'demo-fridge', name: 'Koelkast', class: 'socket', power: true },
      ],
      contract: contractFrom(cfg),
      suppliers: SUPPLIERS,
      prices: { source: cfg.prices?.source || 'auto' },
    };
  }
  const devices = await getDevices();
  const found = discover(devices, cfg.devices);
  return {
    blocks: blockCatalog(),
    layout: resolveLayout(cfg.layout, found, cfg),
    defaultLayout: defaultLayout(found, cfg),
    customLayout: Boolean(cfg.layout),
    found: {
      p1: found.p1?.id || null,
      solar: found.solar.map(d => d.id),
      batteries: found.batteries.map(d => d.id),
      boiler: found.boiler?.id || null,
      heating: found.heating.map(d => d.id),
      thermostat: found.thermostat?.id || null,
      evChargers: found.evChargers.map(d => d.id),
      water: found.water?.id || null,
    },
    contract: contractFrom(cfg),
    suppliers: SUPPLIERS,
    prices: { source: cfg.prices?.source || 'auto' },
    devices: devices.map(d => ({
      id: d.id,
      name: d.name,
      class: d.virtualClass || d.class,
      capabilities: d.capabilities,
      power: (d.capabilities || []).includes('measure_power'),
      estimate: hasUsageEstimate(d),
    })),
  };
}

// "Share diagnosis" from the help menu: the pc version has no anonymous device report of its own
// (see /api/devices), but can include the dashboard, like the Homey app. The address is the
// contact address of the Homey app.
async function getDiagnosisReport(withSnapshot) {
  let email = null;
  try {
    email = JSON.parse(fs.readFileSync(path.join(HOMEY_APP_DIR, '.homeycompose', 'app.json'), 'utf8')).author?.email || null;
  } catch { /* no Homey app next to this server */ }
  const report = { made: new Date().toISOString().slice(0, 10), version: VERSION, source: 'pc', demo: cfg.demo };
  if (withSnapshot) {
    const [live, today] = await Promise.all([getLive(''), getHistory('today').catch(err => ({ error: err.message }))]);
    delete live.place;
    report.snapshot = { made: new Date().toISOString(), live, history: { today } };
  }
  return { email, report };
}

// Development preview of the Homey app settings page, with a stand-in for the Homey object
const HOMEY_APP_DIR = path.join(__dirname, 'homey-app');

// Texts come from the Dutch locale, as Homey fills them in: data-i18n elements and Homey.__()
const FAKE_SETTINGS_HOMEY = `
  const store = {};
  const texts = ${JSON.stringify(JSON.parse(fs.readFileSync(path.join(HOMEY_APP_DIR, 'locales', 'nl.json'), 'utf8')))};
  const __ = (key, tokens = {}) => {
    const text = key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts);
    return typeof text === 'string' ? text.replace(/__(\\w+)__/g, (m, k) => (k in tokens ? tokens[k] : m)) : '';
  };
  window.addEventListener('load', () => document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = __(el.dataset.i18n); }));
  window.addEventListener('load', () => onHomeyReady({
    __,
    api: (method, path, body, cb) => fetch(path === '/settings-info' ? '/api/devices' : '/api' + path).then(r => r.json()).then(d => cb(null, d), cb),
    get: (key, cb) => cb(null, store[key]),
    set: (key, value, cb) => { store[key] = value; console.log('Homey.set', key, JSON.stringify(value)); cb(null); },
    ready: () => console.log('Homey.ready'),
  }));
`;

function servePreview(res, urlPath) {
  let match;
  let dir;
  let file;
  if ((match = urlPath.match(/^\/preview\/settings\/(.*)$/))) {
    dir = path.join(HOMEY_APP_DIR, 'settings');
    file = match[1] || 'index.html';
  } else if (urlPath === '/homey.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'] });
    res.end(FAKE_SETTINGS_HOMEY);
    return true;
  } else {
    return false;
  }

  const full = path.normalize(path.join(dir, file));
  if (!full.startsWith(dir) || !fs.existsSync(full)) {
    res.writeHead(404).end('Niet gevonden');
    return true;
  }
  const body = fs.readFileSync(full);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
  return true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function serveStatic(res, urlPath) {
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('Niet gevonden');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  // Scripts and styles with the version, so an update is always picked up
  if (path.extname(file) === '.html') {
    res.end(fs.readFileSync(file, 'utf8').replace(/(src|href)="((?:dashboard|i18n|screen|site)\.(?:js|css))"/g, (m, attr, name) => `${attr}="${name}?v=${VERSION}"`));
  } else {
    fs.createReadStream(file).pipe(res);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/layout') {
      if (req.method === 'POST') return sendJson(res, 200, await saveLayout(await readJson(req)));
      return sendJson(res, 200, await getLayoutInfo(url.searchParams.get('layout') || ''));
    }
    // With `at` (milliseconds) the dashboard of an earlier moment of today or yesterday
    if (url.pathname === '/api/live') {
      const at = url.searchParams.get('at');
      return sendJson(res, 200, await getLive(url.searchParams.get('layout') || '', at ? Number(at) : null));
    }
    if (url.pathname === '/api/export') {
      const period = url.searchParams.get('period') || 'today';
      if (!PERIODS[period]) return sendJson(res, 400, { error: `Onbekende periode: ${period}` });
      const csv = historyCsv(await getHistory(period), url.searchParams.get('lang') || 'nl');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="energie-${period}-${new Date().toISOString().slice(0, 10)}.csv"`,
      });
      return res.end(csv);
    }
    if (url.pathname === '/api/history') {
      const period = url.searchParams.get('period') || 'today';
      if (!PERIODS[period]) return sendJson(res, 400, { error: `Onbekende periode: ${period}` });
      return sendJson(res, 200, await getHistory(period));
    }
    if (url.pathname === '/api/devices') return sendJson(res, 200, await getDeviceList());
    if (url.pathname === '/api/diagnosis-report') return sendJson(res, 200, await getDiagnosisReport(url.searchParams.get('snapshot') === '1'));
    if (servePreview(res, url.pathname)) return;
    return serveStatic(res, decodeURIComponent(url.pathname));
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString('nl-NL')}] ${url.pathname}: ${err.message}`);
    if ((url.pathname === '/api/layout' || err.status === 413 || err.status === 400 || err.status === 404) && err.status) return sendJson(res, err.status, { error: err.message });
    const hint = err.status === 401 || err.status === 403
      ? 'Homey weigert de API-key. Controleer de key en of die "Apparaten bekijken" en "Insights bekijken" mag.'
      : err.name === 'TimeoutError' || err.cause
        ? `Homey is niet bereikbaar op ${cfg.homey.address}.`
        : err.message;
    return sendJson(res, 502, { error: hint });
  }
});

// Once a minute: which devices are on, for the warnings, and the grid power for the monthly peak
if (!cfg.demo) {
  setInterval(() => {
    getDevices().then(devices => {
      const found = discover(devices, cfg.devices);
      alertMonitor.track(devices, found);
      if (!found.p1) return;
      peakTracker.add(found.p1.capabilitiesObj?.measure_power?.value);
      const meter = peakSummary({ tracker: null, p1: found.p1, grid: {} });
      if (meter?.source === 'meter') peakTracker.recordMeter(meter.peakW);
    }).catch(() => {});
  }, 60 * 1000);
  // Starts with the quarter hours of yesterday and today from Insights
  getDevices().then(async devices => {
    const found = discover(devices, cfg.devices);
    if (!found.p1) return;
    const read = resolution => (device, capability) => client.getEntries(device.id, capability, resolution).catch(() => []);
    peakTracker.seed([...await gridPower(found.p1, read('yesterday')), ...await gridPower(found.p1, read('today'))]);
  }).catch(() => {});
}

server.listen(cfg.port, () => {
  console.log(`Energie dashboard draait op http://localhost:${cfg.port}`);
  if (snapshot) {
    console.log(`Momentopname van ${snapshot.made}: het dashboard van een gebruiker, zoals het toen was.`);
  } else if (cfg.demo) {
    console.log('Demo-modus: vul config.json in om je eigen Homey te koppelen.');
  } else {
    console.log(`Gekoppeld met Homey op ${client.base}`);
  }
});
