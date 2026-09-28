'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { HomeyClient } = require('./lib/homey');
const {
  PERIODS, PREVIOUS, discover, buildLive, buildHistory, buildBaseload, comparableTotals, todayTotals,
  blockCatalog, resolveLayout, defaultLayout, validateLayout, PinGuard,
} = require('./lib/energy');
const { PriceService } = require('./lib/prices');
const demo = require('./lib/demo');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEVICES_CACHE_TTL = 5 * 1000;
const HISTORY_CACHE_TTL = 60 * 1000;
const BASELOAD_CACHE_TTL = 60 * 60 * 1000;

const DEFAULTS = {
  port: 8080,
  homey: { address: '', token: '' },
  devices: { p1: '', solar: [], batteries: [], boiler: '', heating: [], thermostat: '', evChargers: [], water: '' },
  boiler: { liters: 80, coldWaterTemp: 10, showerTemp: 40, showerFlow: 8, warmFrom: 50 },
  battery: { invertPower: false },
  grid: { fuseAmps: 25 },
  prices: { source: 'energyzero', surcharge: 0 },
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
  return cfg;
}

const cfg = loadConfig();
const client = cfg.demo ? null : new HomeyClient(cfg.homey);

let devicesCache = { at: 0, devices: null };
let baseloadCache = { at: 0, data: null };
const historyCache = new Map();
const prices = new PriceService();
const pinGuard = new PinGuard();

async function getDevices() {
  if (!devicesCache.devices || Date.now() - devicesCache.at > DEVICES_CACHE_TTL) {
    devicesCache = { at: Date.now(), devices: await client.getDevices() };
  }
  return devicesCache.devices;
}

async function getLive() {
  let live;
  if (cfg.demo) {
    live = demo.live(cfg);
  } else {
    const devices = await getDevices();
    const found = discover(devices, cfg.devices);
    live = buildLive(devices, found, cfg);
    if (live.layout.some(b => b.id === 'baseload')) live.baseload = await getBaseload(found).catch(() => null);
  }
  // Today's totals for the live diagram; the history is cached, so this is cheap
  live.today = todayTotals((await getHistory('today').catch(() => null))?.totals);
  if (live.layout.some(b => b.id === 'prices')) {
    live.prices = await prices.get(cfg.prices).catch(err => ({ error: err.message }));
  }
  return live;
}

async function getBaseload(found) {
  if (Date.now() - baseloadCache.at > BASELOAD_CACHE_TTL) {
    baseloadCache = { at: Date.now(), data: await buildBaseload(client, found, cfg) };
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
  } else {
    const devices = await getDevices();
    data = await buildHistory(client, devices, discover(devices, cfg.devices), period, cfg, { light });
  }
  if (!light && PREVIOUS[period]) {
    const previous = await getHistory(PREVIOUS[period], { light: true }).catch(() => null);
    data.previous = comparableTotals(previous, data, cfg.tariffs);
  }
  historyCache.set(key, { at: Date.now(), data });
  return data;
}

// ---------- Layout editing from the dashboard ----------

async function getLayoutInfo() {
  if (cfg.demo) {
    return {
      blocks: blockCatalog(),
      layout: demo.live(cfg).layout,
      defaultLayout: demo.live({ ...cfg, layout: null }).layout,
      customLayout: Boolean(cfg.layout),
      pinRequired: Boolean(cfg.editPin),
    };
  }
  const devices = await getDevices();
  const found = discover(devices, cfg.devices);
  return {
    blocks: blockCatalog(),
    layout: resolveLayout(cfg.layout, found, cfg),
    defaultLayout: defaultLayout(found, cfg),
    customLayout: Boolean(cfg.layout),
    pinRequired: Boolean(cfg.editPin),
  };
}

// Saves the layout in config.json, keeping everything else in that file as it is
async function saveLayout({ layout, pin }) {
  pinGuard.check(cfg.editPin, pin);
  cfg.layout = validateLayout(layout);
  const user = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {};
  user.layout = cfg.layout;
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(user, null, 2)}\n`);
  return getLayoutInfo();
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
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/layout') {
      if (req.method === 'POST') return sendJson(res, 200, await saveLayout(await readJson(req)));
      return sendJson(res, 200, await getLayoutInfo());
    }
    if (url.pathname === '/api/live') return sendJson(res, 200, await getLive());
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

server.listen(cfg.port, () => {
  console.log(`Energie dashboard draait op http://localhost:${cfg.port}`);
  if (cfg.demo) {
    console.log('Demo-modus: vul config.json in om je eigen Homey te koppelen.');
  } else {
    console.log(`Gekoppeld met Homey op ${client.base}`);
  }
});
