'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { HomeyClient } = require('./lib/homey');
const {
  PERIODS, nettingSummary, expectedSolar, layoutName, savedLayout, historyCsv, PREVIOUS, discover, buildLive, buildHistory, buildBaseload, comparableTotals, todayTotals,
  blockCatalog, resolveLayout, defaultLayout, validateLayout, PinGuard,
} = require('./lib/energy');
const { PriceService } = require('./lib/prices');
const { ForecastService, recordForecast, totalKwp } = require('./lib/forecast');
const { WeatherService } = require('./lib/weather');
const { AlertMonitor, buildAlerts, recordBaseload } = require('./lib/alerts');
const { contractFrom, allInElectricity } = require('./lib/tariffs');
const demo = require('./lib/demo');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEVICES_CACHE_TTL = 5 * 1000;
const HISTORY_CACHE_TTL = 60 * 1000;
const BASELOAD_CACHE_TTL = 60 * 60 * 1000;
// Open pages load again when this changes, e.g. after an update and a restart of the server
const VERSION = `${require('./package.json').version}-${Date.now()}`;

const DEFAULTS = {
  port: 8080,
  homey: { address: '', token: '' },
  devices: { p1: '', solar: [], batteries: [], boiler: '', heating: [], thermostat: '', evChargers: [], water: '' },
  boiler: { liters: 80, coldWaterTemp: 10, showerTemp: 40, showerFlow: 8, warmFrom: 50 },
  battery: { invertPower: false },
  grid: { fuseAmps: 25 },
  prices: { source: 'energyzero' },
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

const cfg = loadConfig();
const client = cfg.demo ? null : new HomeyClient(cfg.homey);

let devicesCache = { at: 0, devices: null };
let baseloadCache = { at: 0, data: null };
const historyCache = new Map();
const prices = new PriceService();
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

async function getLive(name = '') {
  const view = { ...cfg, layout: savedLayout(cfg, layoutName(name)) };
  let live;
  if (cfg.demo) {
    live = demo.live(view);
  } else {
    const devices = await getDevices();
    const found = discover(devices, cfg.devices);
    live = buildLive(devices, found, view);
    if (live.layout.some(b => b.id === 'baseload')) live.baseload = await getBaseload(found).catch(() => null);
  }
  if (live.layout.some(b => b.id === 'netting')) live.netting = await getNetting().catch(() => null);
  if (live.layout.some(b => b.id === 'alerts')) {
    if (cfg.demo) {
      live.alerts = [
        { id: 'on-demo', level: 'info', text: 'Wasmachine staat al 5 uur aan (12 W)' },
        { id: 'baseload', level: 'warning', text: 'Sluipverbruik is 246 W, normaal 186 W' },
      ];
    } else {
      const devices = await getDevices();
      const found = discover(devices, cfg.devices);
      live.alerts = buildAlerts({ monitor: alertMonitor, found, baseload: live.baseload, baseloadLog, hours: Number(cfg.alerts?.hours) || 4 });
    }
  }
  live.version = VERSION;
  // Today's totals for the live diagram; the history is cached, so this is cheap
  live.today = todayTotals((await getHistory('today').catch(() => null))?.totals);
  if (live.layout.some(b => b.id === 'prices')) {
    const contract = contractFrom(cfg);
    const allIn = contract.electricity.type === 'dynamic' ? p => allInElectricity(contract, p) : null;
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
    baseloadCache = { at: Date.now(), data: await buildBaseload(client, found, cfg, market?.avg) };
    baseloadLog = recordBaseload(baseloadLog, baseloadCache.data?.watts);
  }
  return baseloadCache.data;
}

async function getHistory(period, { light = false } = {}) {
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
    data = await buildHistory(client, devices, discover(devices, cfg.devices), period, cfg, { light, prices, weather, location });
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
      if (body.length > 16 * 1024) req.destroy();
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
      ],
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
    devices: devices.map(d => ({
      id: d.id,
      name: d.name,
      class: d.virtualClass || d.class,
      capabilities: d.capabilities,
    })),
  };
}

// Development preview of the Homey app settings page, with a stand-in for the Homey object
const HOMEY_APP_DIR = path.join(__dirname, 'homey-app');

const FAKE_SETTINGS_HOMEY = `
  const store = {};
  window.addEventListener('load', () => onHomeyReady({
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
    if (url.pathname === '/api/live') return sendJson(res, 200, await getLive(url.searchParams.get('layout') || ''));
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
    if (servePreview(res, url.pathname)) return;
    return serveStatic(res, decodeURIComponent(url.pathname));
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString('nl-NL')}] ${url.pathname}: ${err.message}`);
    if (url.pathname === '/api/layout' && err.status) return sendJson(res, err.status, { error: err.message });
    const hint = err.status === 401 || err.status === 403
      ? 'Homey weigert de API-key. Controleer de key en of die "Apparaten bekijken" en "Insights bekijken" mag.'
      : err.name === 'TimeoutError' || err.cause
        ? `Homey is niet bereikbaar op ${cfg.homey.address}.`
        : err.message;
    return sendJson(res, 502, { error: hint });
  }
});

// Once a minute: which devices are on, for the warnings
if (!cfg.demo) {
  setInterval(() => {
    getDevices().then(devices => alertMonitor.track(devices, discover(devices, cfg.devices))).catch(() => {});
  }, 60 * 1000);
}

server.listen(cfg.port, () => {
  console.log(`Energie dashboard draait op http://localhost:${cfg.port}`);
  if (cfg.demo) {
    console.log('Demo-modus: vul config.json in om je eigen Homey te koppelen.');
  } else {
    console.log(`Gekoppeld met Homey op ${client.base}`);
  }
});
