'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');
const {
  PERIODS, PREVIOUS, discover, buildLive, buildHistory, buildBaseload, comparableTotals, todayTotals,
  blockCatalog, resolveLayout, defaultLayout, validateLayout, PinGuard, layoutName, savedLayout, historyCsv, buildZoneFlow, consumptionDevices, nettingSummary,
  expectedSolar, estimatedDevices, gridPower, timelineDay, recordTimeline, buildLiveAt,
} = require('./lib/energy');
const { PriceService } = require('./lib/prices');
const { ForecastService, recordForecast, totalKwp } = require('./lib/forecast');
const { WeatherService } = require('./lib/weather');
const { AlertMonitor, buildAlerts, recordBaseload } = require('./lib/alerts');
const { contractFrom, allInFunction, describeTariff, SUPPLIERS } = require('./lib/tariffs');
const { PeakTracker, peakSummary } = require('./lib/peak');
const { WebServer } = require('./lib/webserver');

const DEVICES_CACHE_TTL = 5 * 1000;
const HISTORY_CACHE_TTL = 60 * 1000;
const LOGS_CACHE_TTL = 10 * 60 * 1000;
const BASELOAD_CACHE_TTL = 60 * 60 * 1000;
const ZONES_CACHE_TTL = 10 * 60 * 1000;
const NETTING_CACHE_TTL = 60 * 60 * 1000;
const ENERGY_LIVE_TTL = 5 * 1000;
const ENERGY_LIVE_WAIT = 2 * 1000;
// A day of Insights for looking back: today gets a new step every 5 minutes, yesterday is done
const TIMELINE_TTL = { today: 2 * 60 * 1000, yesterday: 30 * 60 * 1000 };
const TIMELINE_FRESH = 30 * 1000;

// Prices can come from the app Power by the Hour (see lib/prices.js). Its earlier prices are read
// from Insights, in the finest resolution that reaches back far enough.
const POWERHOUR_APP = 'com.gruijter.powerhour';
const HOUR = 3600 * 1000;
const POWERHOUR_RESOLUTIONS = [
  [24 * HOUR, 'last24Hours'], [7 * 24 * HOUR, 'last7Days'], [31 * 24 * HOUR, 'last31Days'],
  [92 * 24 * HOUR, 'last3Months'], [183 * 24 * HOUR, 'last6Months'],
];

// 8080 is used by much other software; installs from before 0.2.4 keep it, see keepOldPort()
const OLD_PORT = 8080;

const DEFAULTS = {
  port: 8686,
  devices: { p1: '', solar: [], batteries: [], boiler: '', heating: [], thermostat: '', evChargers: [], water: '' },
  boiler: { liters: 80, coldWaterTemp: 10, showerTemp: 40, showerFlow: 8, warmFrom: 50 },
  battery: { invertPower: false },
  grid: { fuseAmps: 25, capacityTariff: null, capacityMin: 2.5 },
  prices: { source: 'auto' },
  tariffs: {},
};

function slimDevice(d) {
  const capabilitiesObj = {};
  for (const [id, cap] of Object.entries(d.capabilitiesObj || {})) capabilitiesObj[id] = { value: cap?.value ?? null };
  return {
    id: d.id,
    name: d.name,
    class: d.class,
    virtualClass: d.virtualClass,
    // The app and driver, e.g. homey:app:com.tweakers.zendure:zendure, for the diagnosis
    driverId: d.driverId || d.driverUri || null,
    zone: d.zone,
    available: d.available,
    capabilities: d.capabilities || [],
    capabilitiesObj,
    energyObj: d.energyObj || null,
    // What the user set for Energy in Homey (such as excluding the device), for the diagnosis:
    // it is not in energyObj
    energy: d.energy || null,
    energySettings: Object.fromEntries(Object.entries(d.settings || {}).filter(([key]) => /energy/i.test(key))),
    flags: d.flags || [],
  };
}

// A named layout set back to "default" keeps its own copy of the automatic layout
function defaultLayoutFor(saved) {
  return Array.isArray(saved.layout) && saved.layout.length ? saved.layout : null;
}

class EnergyDashboardApp extends Homey.App {

  async onInit() {
    // Apps run in UTC; days, hours and "last night" must follow the time zone of the Homey
    process.env.TZ = this.homey.clock.getTimezone();
    this.devicesCache = { at: 0, devices: null };
    this.logsCache = { at: 0, ids: null };
    this.baseloadCache = { at: 0, data: null };
    this.historyCache = new Map();
    this.timelineCache = new Map();
    this.zonesCache = { at: 0, names: null };
    this.energyLiveCache = { at: 0, report: null };
    // Prices from Homey Energy, or EnergyZero; see lib/prices.js
    this.prices = new PriceService({
      log: this.log.bind(this),
      source: () => this.getConfig().prices.source,
      homey: {
        prices: async date => (await this.getApi()).energy.fetchDynamicElectricityPrices({ date }),
        userCosts: async () => (await this.getApi()).energy.getDynamicElectricityPriceUserCosts(),
        priceType: async () => (await this.getApi()).energy.getElectricityPriceType(),
        fixedPrice: async () => (await this.getApi()).energy.getOptionElectricityPriceFixed(),
        currency: async () => (await this.getApi()).energy.getCurrency(),
      },
      powerhour: {
        installed: () => this.homey.api.getApiApp(POWERHOUR_APP).getInstalled(),
        prices: () => this.homey.api.getApiApp(POWERHOUR_APP).get('/dap-prices'),
        history: (device, from, now) => this.powerhourHistory(device, from, now),
      },
    });
    // The monthly peak for the Belgian capacity tariff, measured once a minute
    this.peakTracker = new PeakTracker(this.homey.settings.get('peakLog') || {});
    this.homey.setTimeout(() => this.seedPeak().catch(err => this.error(`Peak: ${err.message}`)), 30 * 1000);
    this.forecast = new ForecastService({ log: this.log.bind(this) });
    this.weather = new WeatherService({ log: this.log.bind(this) });
    this.pinGuard = new PinGuard();

    this.keepOldPort();
    this.webServer = new WebServer({ app: this, log: this.log.bind(this), error: this.error.bind(this) });
    await this.webServer.start(this.getConfig().port);

    // Once a minute: which devices are on, for the warnings (and their notifications)
    this.alertMonitor = new AlertMonitor();
    this.notified = new Map();
    this.homey.setInterval(() => this.checkAlerts().catch(err => this.error(`Alerts: ${err.message}`)), 60 * 1000);

    // New settings can change the port, the devices and the prices
    // Only the settings themselves; the app's own logs are kept in other keys
    this.homey.settings.on('set', key => {
      if (key !== 'config') return;
      this.historyCache.clear();
      this.timelineCache.clear();
      this.prices.homeyInfo = null;
      this.baseloadCache = { at: 0, data: null };
      this.nettingCache = null;
      this.webServer.start(this.getConfig().port).catch(this.error);
    });
  }

  // The default port was 8080 until 0.2.4. An install that ran before has settings of its own
  // (at least the peak log), and keeps that port so its bookmarks and tablets keep working
  keepOldPort() {
    const saved = this.homey.settings.get('config');
    if (saved?.port || !this.homey.settings.getKeys().length) return;
    this.homey.settings.set('config', { ...saved, port: OLD_PORT });
  }

  async onUninit() {
    await this.webServer?.stop();
  }

  // Access to the Homey Web API, to read devices and Insights of other apps
  async getApi() {
    if (!this.apiPromise) {
      this.apiPromise = HomeyAPI.createAppAPI({ homey: this.homey }).catch(err => {
        this.apiPromise = null;
        throw err;
      });
    }
    return this.apiPromise;
  }

  getConfig() {
    const saved = this.homey.settings.get('config') || {};
    // Before the choice of source, the settings saved "energyzero" for every price block that was
    // on; only a source chosen in the new list counts as a choice, else Homey or EnergyZero follows
    const prices = { ...DEFAULTS.prices, ...saved.prices };
    if (prices.source === 'energyzero' && !prices.chosen) prices.source = 'auto';
    return {
      port: Number(saved.port) || DEFAULTS.port,
      devices: { ...DEFAULTS.devices, ...saved.devices },
      boiler: { ...DEFAULTS.boiler, ...saved.boiler },
      battery: { ...DEFAULTS.battery, ...saved.battery },
      grid: { ...DEFAULTS.grid, ...saved.grid },
      prices,
      // Homey has prices that fill in an empty contract, as far as known (for the default layout)
      homeyPrices: Boolean(this.prices?.homeyInfo?.data?.allIn || this.prices?.homeyInfo?.data?.fixed),
      tariffs: { ...DEFAULTS.tariffs, ...saved.tariffs },
      contract: saved.contract || null,
      forecast: { enabled: false, planes: [], ...saved.forecast },
      layout: Array.isArray(saved.layout) && saved.layout.length ? saved.layout : null,
      layouts: saved.layouts && typeof saved.layouts === 'object' ? saved.layouts : {},
      editPin: saved.editPin || '',
      accessCode: saved.accessCode || '',
      alerts: { hours: 4, notify: false, ...saved.alerts },
    };
  }

  // ---------- Layout editing from the dashboard ----------

  async getLayoutInfo(name = '') {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const layout = layoutName(name);
    return {
      blocks: blockCatalog(),
      name: layout,
      names: Object.keys(cfg.layouts),
      layout: resolveLayout(savedLayout(cfg, layout), found, cfg),
      defaultLayout: defaultLayout(found, cfg),
      customLayout: Boolean(savedLayout(cfg, layout)),
      pinRequired: Boolean(cfg.editPin),
    };
  }

  // Saves the default layout, or a named one; `remove` deletes a named layout
  async saveLayout({ layout, pin, name, remove }) {
    this.pinGuard.check(this.getConfig().editPin, pin);
    const saved = this.homey.settings.get('config') || {};
    const target = layoutName(name);
    if (target) {
      const layouts = { ...(saved.layouts || {}) };
      if (remove) delete layouts[target];
      else layouts[target] = validateLayout(layout) || defaultLayoutFor(saved);
      this.homey.settings.set('config', { ...saved, layouts });
      return this.getLayoutInfo(remove ? '' : target);
    }
    this.homey.settings.set('config', { ...saved, layout: validateLayout(layout) });
    return this.getLayoutInfo();
  }

  // All devices, as small copies with only what the dashboard reads: the full device objects of
  // homey-api carry titles, units and options of every capability, which would stay in memory.
  // Screens asking at the same moment share one request.
  async getDevices() {
    if (this.devicesCache.devices && Date.now() - this.devicesCache.at <= DEVICES_CACHE_TTL) return this.devicesCache.devices;
    if (!this.devicesPending) {
      this.devicesPending = (async () => {
        const api = await this.getApi();
        const devices = Object.values(await api.devices.getDevices()).map(slimDevice);
        this.devicesCache = { at: Date.now(), devices };
        return devices;
      })().finally(() => { this.devicesPending = null; });
    }
    return this.devicesPending;
  }

  async getLogIds() {
    if (!this.logsCache.ids || Date.now() - this.logsCache.at > LOGS_CACHE_TTL) {
      const api = await this.getApi();
      const logs = await api.insights.getLogs();
      this.logsCache = { at: Date.now(), ids: new Set(Object.values(logs).map(log => log.id)) };
    }
    return this.logsCache.ids;
  }

  // A Homey Energy report for the devices per period; `request` comes from reportRequest()
  async energyReport(request) {
    const energy = (await this.getApi()).energy;
    if (request.kind === 'day') return energy.getReportDay({ date: request.date });
    if (request.kind === 'week') return energy.getReportWeek({ isoWeek: request.isoWeek });
    if (request.kind === 'month') return energy.getReportMonth({ yearMonth: request.yearMonth });
    return energy.getReportYear({ year: request.year });
  }

  // Homey Energy's live report, for devices with an estimated use; shared by screens asking at once.
  // The page waits for it at most 2 seconds and otherwise uses the last one: a slow Energy
  // manager should not hold up the whole dashboard (homey-api itself only gives up after 10 s).
  async getEnergyLive() {
    if (Date.now() - this.energyLiveCache.at <= ENERGY_LIVE_TTL) return this.energyLiveCache.report;
    if (!this.energyLivePending) {
      this.energyLivePending = (async () => {
        const report = await (await this.getApi()).energy.getLiveReport({}).catch(() => null);
        this.energyLiveCache = { at: Date.now(), report };
        return report;
      })().finally(() => { this.energyLivePending = null; });
    }
    return Promise.race([this.energyLivePending, new Promise(r => setTimeout(() => r(this.energyLiveCache.report), ENERGY_LIVE_WAIT))]);
  }

  async getEstimated(devices, found) {
    return estimatedDevices(await this.getEnergyLive(), devices, found);
  }

  // ---------- Monthly peak ----------

  // A new installation starts with the quarter hours of yesterday and today from Insights
  async seedPeak() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    if (!found.p1) return;
    const read = resolution => (device, capability) => this.getEntries(device.id, capability, resolution).catch(() => []);
    const entries = [...await gridPower(found.p1, read('yesterday')), ...await gridPower(found.p1, read('today'))];
    if (this.peakTracker.seed(entries)) this.homey.settings.set('peakLog', this.peakTracker.log);
  }

  getPeak(found, cfg) {
    return peakSummary({ tracker: this.peakTracker, p1: found.p1, grid: cfg.grid });
  }

  // The grid power of this minute for the monthly peak, and the meter's own peak when it has one
  trackPeak(found) {
    const p1 = found.p1;
    if (!p1) return;
    const meter = peakSummary({ tracker: null, p1, grid: {} });
    let changed = this.peakTracker.add(p1.capabilitiesObj?.measure_power?.value);
    if (meter?.source === 'meter' && this.peakTracker.recordMeter(meter.peakW)) changed = true;
    if (changed) this.homey.settings.set('peakLog', this.peakTracker.log);
  }

  // Insights entries of a device capability as [{ t: Date, v: number }] (true or false for
  // on/off), or [] without a log
  // Earlier prices of a Power by the Hour price device, from its Insights: its current price
  // (meter_price_h0) and export price, in the finest resolution that still reaches back to `from`
  async powerhourHistory(device, from, now) {
    const own = (await this.getDevices()).filter(d => String(d.driverId || '').startsWith(`homey:app:${POWERHOUR_APP}:${device.driverType}`));
    const homeyDevice = own.find(d => d.name === device.name) || own[0];
    if (!homeyDevice) return [];
    const age = now - from;
    const resolution = POWERHOUR_RESOLUTIONS.find(([span]) => age <= span)?.[1] || 'last2Years';
    const [prices, exports] = await Promise.all([
      this.getEntries(homeyDevice.id, 'meter_price_h0', resolution).catch(() => []),
      this.getEntries(homeyDevice.id, 'meter_price_h0_export', resolution).catch(() => []),
    ]);
    const exportAt = new Map(exports.map(e => [e.t.getTime(), e.v]));
    return prices
      .filter(e => typeof e.v === 'number' && e.t.getTime() < now)
      .map(e => ({ t: e.t.getTime(), price: e.v, exportPrice: typeof exportAt.get(e.t.getTime()) === 'number' ? exportAt.get(e.t.getTime()) : null }));
  }

  async getEntries(deviceId, capability, resolution) {
    const id = `homey:device:${deviceId}:${capability}`;
    if (!(await this.getLogIds()).has(id)) return [];
    const api = await this.getApi();
    const result = await api.insights.getLogEntries({ id, resolution });
    return (result?.values || [])
      .filter(entry => typeof entry.v === 'number' || typeof entry.v === 'boolean')
      .map(entry => ({ t: new Date(entry.t), v: entry.v }));
  }

  // ---------- Widget ----------

  // Room names by zone id; rooms rarely change, so they are read every ten minutes
  async getZoneNames() {
    if (!this.zonesCache.names || Date.now() - this.zonesCache.at > ZONES_CACHE_TTL) {
      const api = await this.getApi();
      const names = {};
      for (const zone of Object.values(await api.zones.getZones())) names[zone.id] = zone.name;
      this.zonesCache = { at: Date.now(), names };
    }
    return this.zonesCache.names;
  }

  // The power of this moment, for the Energy now widget: a few numbers, drawn by the widget
  // With today's totals, for the widget's "today" view (null while the history is being built)
  async getWidgetNow() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const live = buildLive(devices, discover(devices, cfg.devices), cfg);
    const today = await Promise.race([this.getHistory('today').catch(() => null), new Promise(r => setTimeout(r, 1500))]);
    return {
      solarW: live.solarW,
      gridW: live.gridW,
      homeW: live.homeW,
      batteryW: live.battery ? live.battery.watts : null,
      soc: live.battery?.soc ?? null,
      flows: live.flows,
      today: todayTotals(today?.totals),
    };
  }

  // The live flow from sources through rooms to devices, for the Energy flows widget
  async getWidgetFlow({ perZone = 3 } = {}) {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const live = buildLive(devices, found, cfg);
    if (live.homeW === null) return { nodes: [], links: [], homeW: null, error: 'noP1' };
    const zoneOf = new Map(devices.map(d => [d.id, d.zone]));
    const powered = consumptionDevices(devices, found, 'measure_power')
      .map(d => ({ id: d.id, name: d.name, zone: d.zone, value: d.capabilitiesObj.measure_power?.value }))
      .filter(d => typeof d.value === 'number' && d.value > 0)
      .concat((await this.getEstimated(devices, found).catch(() => []))
        .map(d => ({ id: d.id, name: `≈ ${d.name}`, zone: zoneOf.get(d.id), value: d.watts })));
    const flow = buildZoneFlow({
      solarW: live.solarW || 0,
      gridW: live.gridW || 0,
      batteryW: live.battery ? live.battery.watts : 0,
      homeW: live.homeW,
      flows: live.flows,
    }, powered, await this.getZoneNames(), { perZone: Math.max(0, Math.min(8, Number(perZone) || 0)) });
    return { ...flow, solarW: live.solarW, gridW: live.gridW, updated: live.updated };
  }

  // A day of Insights of every device, for looking back (see recordTimeline). Several screens
  // share one reading; at midnight today's becomes yesterday's, so the date is part of the key.
  getTimeline(day, devices, found, cfg, { fresh = false } = {}) {
    const key = `${day}:${new Date().toDateString()}`;
    const cached = this.timelineCache.get(key);
    // A fresh reading (for a moment after the last one) is shared too, and made at most every 30 s
    if (cached && Date.now() - cached.at < (fresh ? TIMELINE_FRESH : TIMELINE_TTL[day])) return cached.data;
    for (const k of this.timelineCache.keys()) if (!k.endsWith(new Date().toDateString())) this.timelineCache.delete(k);
    const read = (device, capability) => this.getEntries(device.id, capability, day).catch(() => []);
    const data = recordTimeline(read, devices, found, cfg, day);
    this.timelineCache.set(key, { at: Date.now(), data });
    data.catch(() => {
      if (this.timelineCache.get(key)?.data === data) this.timelineCache.delete(key);
    });
    return data;
  }

  // The live dashboard at an earlier moment `at` (milliseconds) of today or yesterday
  async getLiveAt(devices, found, cfg, at) {
    const day = timelineDay(Number(at));
    if (!day) throw Object.assign(new Error('Alleen vandaag en gisteren kun je terugkijken'), { status: 400 });
    const [history, recording] = await Promise.all([this.getHistory(day).catch(() => null), this.getTimeline(day, devices, found, cfg)]);
    const power = history?.power;
    let live = buildLiveAt(recording, devices, found, cfg, Number(at), power);
    // A moment after the last reading of today: read again
    if (!live && day === 'today') live = buildLiveAt(await this.getTimeline(day, devices, found, cfg, { fresh: true }), devices, found, cfg, Number(at), power);
    if (!live) throw Object.assign(new Error('Geen gegevens van dat moment'), { status: 404 });
    return live;
  }

  async getLive(name = '', at = null) {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const view = { ...cfg, layout: savedLayout(cfg, layoutName(name)) };
    const live = at
      ? await this.getLiveAt(devices, found, view, at)
      : buildLive(devices, found, view, { estimated: await this.getEstimated(devices, found).catch(() => []) });
    live.version = this.homey.manifest.version;
    live.currency = await this.prices.currency().catch(() => null);
    // Roughly where the Homey is, for a screen that turns dark from sunset to sunrise
    const lat = this.homey.geolocation.getLatitude();
    const lon = this.homey.geolocation.getLongitude();
    if (typeof lat === 'number' && typeof lon === 'number') live.place = { lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 };
    const shown = new Set(live.layout.map(b => b.id));

    // Today's totals for the live diagram. The history is cached; while it is being built
    // (the first time, which can take a while) the diagram shows without them. Looking back,
    // buildLiveAt() gave the totals up to that moment.
    if (!at) {
      const today = await Promise.race([this.getHistory('today').catch(() => null), new Promise(r => setTimeout(r, 1500))]);
      live.today = todayTotals(today?.totals);
    }
    if (shown.has('baseload')) live.baseload = await this.getBaseload(found, cfg).catch(() => null);
    if (shown.has('netting')) live.netting = await this.getNetting().catch(() => null);
    if (shown.has('peak')) live.peak = this.getPeak(found, cfg);
    // The contract, for the explanation of the amounts in the cost blocks
    live.tariff = describeTariff(contractFrom(cfg), await this.prices.homeyTariff().catch(() => null));
    // Warnings are about now; looking back leaves them out
    if (shown.has('alerts') && !at) live.alerts = await this.getAlerts(found, cfg, 'nl').catch(() => []);
    if (shown.has('prices')) {
      const allIn = allInFunction(contractFrom(cfg), await this.prices.homeyTariff().catch(() => null));
      live.prices = await this.prices.get(cfg.prices, { allIn }).catch(err => ({ error: err.message }));
    }
    return live;
  }

  // The end of net metering, from last year (or this year while last year has too little data).
  // Calculated at most once an hour; the first time reads a year of Insights and prices.
  async getNetting() {
    if (this.nettingCache && Date.now() - this.nettingCache.at < NETTING_CACHE_TTL) return this.nettingCache.data;
    if (!this.nettingPending) {
      this.nettingPending = (async () => {
        const last = await this.getHistory('lastYear', { light: true }).catch(() => null);
        const lastSummary = nettingSummary(last, 'lastYear');
        const data = lastSummary.months >= 10 && lastSummary.extra !== null
          ? lastSummary
          : nettingSummary(await this.getHistory('year', { light: true }).catch(() => null), 'year');
        this.nettingCache = { at: Date.now(), data };
        return data;
      })().finally(() => { this.nettingPending = null; });
    }
    return this.nettingPending;
  }

  async getBaseload(found, cfg) {
    if (Date.now() - this.baseloadCache.at > BASELOAD_CACHE_TTL) {
      const market = await this.prices.get({}).catch(() => null);
      const homey = await this.prices.homeyTariff().catch(() => null);
      this.baseloadCache = { at: Date.now(), data: await buildBaseload(this, found, cfg, market?.avg, homey) };
      // Kept per day, to notice when standby use rises
      const log = this.homey.settings.get('baseloadLog') || {};
      this.homey.settings.set('baseloadLog', recordBaseload(log, this.baseloadCache.data?.watts));
    }
    return this.baseloadCache.data;
  }

  // ---------- Warnings ----------

  async getAlerts(found, cfg, lang) {
    const baseload = await this.getBaseload(found, cfg).catch(() => null);
    const market = cfg.prices.source === 'off' ? null : await this.prices.get({}).catch(() => null);
    return buildAlerts({
      price: market ? { market: market.current, currency: market.currency } : null,
      gridW: found.p1?.capabilitiesObj?.measure_power?.value ?? null,
      peak: this.getPeak(found, cfg),
      monitor: this.alertMonitor,
      found,
      baseload,
      baseloadLog: this.homey.settings.get('baseloadLog') || {},
      hours: Number(cfg.alerts.hours) || 4,
      lang,
    });
  }

  // Tracks the devices, and sends new warnings to the Homey timeline when that is turned on
  async checkAlerts() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    this.alertMonitor.track(devices, found);
    this.trackPeak(found);
    if (!cfg.alerts.notify) return;
    const lang = this.homey.i18n.getLanguage() === 'nl' ? 'nl' : 'en';
    const today = new Date().toDateString();
    for (const [id, day] of this.notified) if (day !== today) this.notified.delete(id);
    for (const alert of await this.getAlerts(found, cfg, lang)) {
      if (this.notified.has(alert.id)) continue;
      this.notified.set(alert.id, today);
      await this.homey.notifications.createNotification({ excerpt: alert.text }).catch(this.error);
    }
  }

  // ---------- Export ----------

  async getExport(period, lang) {
    if (!PERIODS[period]) throw Object.assign(new Error(`Onbekende periode: ${period}`), { status: 400 });
    return historyCsv(await this.getHistory(period), lang);
  }

  // ---------- Diagnosis ----------

  // What the app finds and reads, for when something does not show: /api/diagnose
  // `anonymous` is for the report a user shares from the settings: no device names, ids, rooms,
  // location or warning texts, only which apps and capabilities the devices have and their values
  async getDiagnosis({ anonymous = false } = {}) {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const logs = await this.getLogIds().catch(() => new Set());
    const counters = {};
    const label = (d, role) => {
      counters[role] = (counters[role] || 0) + 1;
      return anonymous ? `${role} ${counters[role]}` : d.name;
    };
    const describeAs = role => d => (d ? {
      name: label(d, role),
      app: d.driverId,
      class: d.virtualClass || d.class,
      available: d.available !== false,
      capabilities: d.capabilities,
      // The values of now, to see which capability holds what (for a hybrid inverter: PV, battery)
      values: Object.fromEntries(Object.entries(d.capabilitiesObj || {}).map(([id, cap]) => [id, cap.value])),
      energy: d.energyObj,
      energyUser: d.energy,
      energySettings: d.energySettings,
      flags: d.flags,
      insights: d.capabilities.filter(c => logs.has(`homey:device:${d.id}:${c}`)),
    } : null);
    const today = await this.getHistory('today').catch(err => ({ error: err.message }));
    const count = async (d, cap) => (d ? (await this.getEntries(d.id, cap, 'today').catch(() => [])).length : null);
    // Devices that look like a battery (or an inverter with one) but were not taken as a battery,
    // to learn how other apps report them
    const taken = new Set(found.batteries.map(d => d.id));
    const batteryLike = devices.filter(d => !taken.has(d.id)
      && (d.capabilities || []).some(c => /batt|battery_charging_state|^measure_battery$|soc/i.test(c))
      && (d.capabilities || []).some(c => /^(measure_power|meter_power)/.test(c)));
    const estimated = await this.getEstimated(devices, found).catch(err => [{ error: err.message }]);
    const alerts = await this.getAlerts(found, cfg, 'nl').catch(err => [{ error: err.message }]);
    return {
      version: this.homey.manifest.version,
      homey: { language: this.homey.i18n.getLanguage(), timezone: this.homey.clock.getTimezone() },
      layout: resolveLayout(cfg.layout, found, cfg).map(b => b.id),
      found: {
        p1: describeAs('p1')(found.p1),
        solar: found.solar.map(describeAs('solar')),
        batteries: found.batteries.map(describeAs('battery')),
        boiler: describeAs('boiler')(found.boiler),
        heating: found.heating.map(describeAs('heating')),
        evChargers: found.evChargers.map(describeAs('evcharger')),
        water: describeAs('water')(found.water),
      },
      batteryLike: batteryLike.slice(0, 10).map(describeAs('battery-like')),
      // Where Homey keeps "Exclude from Energy" is not known yet: the energy settings of every
      // metered device, to find it
      metered: devices.filter(d => (d.capabilities || []).some(c => /^(measure_power|meter_power)/.test(c))).slice(0, 60)
        .map(d => ({ name: label(d, 'device'), app: d.driverId, class: d.virtualClass || d.class, energyUser: d.energy, energySettings: d.energySettings })),
      today: {
        error: today.error || null,
        p1PowerReadings: await count(found.p1, 'measure_power'),
        powerPoints: today.power ? today.power.points.filter(Boolean).length : null,
        totals: today.totals ? { import: today.totals.import, export: today.totals.export, solar: today.totals.solar } : null,
      },
      contract: contractFrom(cfg),
      prices: await this.getPriceInfo(),
      peak: this.getPeak(found, cfg),
      estimated: estimated.slice(0, 10).map(d => (anonymous ? { watts: d.watts, estimated: d.estimated, error: d.error } : d)),
      // Warning texts hold device names; the anonymous report keeps only which warnings there are
      alerts: anonymous ? alerts.map(a => ({ id: a.id?.replace(/-[\w-]{8,}$/, ''), level: a.level })) : alerts,
    };
  }

  // The report for "Share diagnosis" in the settings: anonymous, with the date it was made, and
  // the address to mail it to: the contact address of the app in the App Store
  // With `snapshot` the report also holds the dashboard itself: what the page shows now and
  // today's history, with device names, so the developer can open it in the pc version
  // (node server.js --snapshot=<file>) and see exactly this dashboard. Only when the user chose it.
  async getDiagnosisReport({ snapshot = false } = {}) {
    const report = { made: new Date().toISOString().slice(0, 10), ...(await this.getDiagnosis({ anonymous: true })) };
    if (snapshot) {
      const [live, today] = await Promise.all([this.getLive(''), this.getHistory('today').catch(err => ({ error: err.message }))]);
      delete live.place;
      report.snapshot = { made: new Date().toISOString(), live, history: { today } };
    }
    return { email: this.homey.manifest.author?.email || null, report };
  }

  async getHistory(period = 'today', { light = false } = {}) {
    if (!PERIODS[period]) throw new Error(`Unknown period: ${period}`);
    const key = `${period}${light ? ':light' : ''}`;
    const cached = this.historyCache.get(key);
    if (cached && Date.now() - cached.at < HISTORY_CACHE_TTL) return cached.data;

    // Several screens ask at the same moment; they share one calculation instead of each reading Insights
    const data = this.buildHistory(period, light);
    // Expired periods are dropped, so a period viewed once does not stay in memory
    for (const [k, entry] of this.historyCache) {
      if (Date.now() - entry.at >= HISTORY_CACHE_TTL) this.historyCache.delete(k);
    }
    this.historyCache.set(key, { at: Date.now(), data });
    data.catch(() => {
      if (this.historyCache.get(key)?.data === data) this.historyCache.delete(key);
    });
    return data;
  }

  async buildHistory(period, light) {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const location = { lat: this.homey.geolocation.getLatitude(), lon: this.homey.geolocation.getLongitude() };
    const data = await buildHistory(this, devices, discover(devices, cfg.devices), period, cfg, { light, prices: this.prices, weather: this.weather, location });
    if (period === 'today' && !light && cfg.forecast.enabled) {
      data.forecast = await this.forecast.get({ ...location, planes: cfg.forecast.planes }).catch(() => null);
      if (data.forecast) this.homey.settings.set('forecastLog', recordForecast(this.homey.settings.get('forecastLog') || {}, data.forecast));
    }
    if (!light && cfg.forecast.enabled) {
      data.expectedSolar = expectedSolar(period, data.rows.map(r => ({ start: new Date(r.start) })), this.homey.settings.get('forecastLog'));
      data.kwp = totalKwp(cfg.forecast.planes) || null;
    }
    if (!light && PREVIOUS[period]) {
      const previous = await this.getHistory(PREVIOUS[period], { light: true }).catch(() => null);
      data.previous = comparableTotals(previous, data);
    }
    return data;
  }

  // Where prices come from now, and what Homey Energy has, for the explanation in the settings
  async getPriceInfo() {
    const state = await this.prices.homeyState().catch(() => null);
    return {
      source: await this.prices.source().catch(() => 'energyzero'),
      homey: state ? { type: state.type, formula: state.formula, usable: Boolean(state.allIn), fixed: state.fixed, currency: state.currency } : null,
    };
  }

  async getDashboardUrl() {
    const address = await this.homey.cloud.getLocalAddress().catch(() => null);
    const host = address ? address.split(':')[0] : '<ip-van-je-homey>';
    return `http://${host}:${this.getConfig().port}`;
  }

  // Everything the settings page needs: devices to choose from, what was found and the dashboard address
  async getSettingsInfo() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const hasCapability = (d, pattern) => (d.capabilities || []).some(c => pattern.test(c));
    return {
      dashboardUrl: await this.getDashboardUrl(),
      server: this.webServer.status,
      blocks: blockCatalog(),
      layout: resolveLayout(cfg.layout, found, cfg),
      defaultLayout: defaultLayout(found, cfg),
      customLayout: Boolean(cfg.layout),
      contract: contractFrom(cfg),
      suppliers: SUPPLIERS,
      prices: await this.getPriceInfo(),
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
      devices: devices
        .filter(d => hasCapability(d, /^(measure_power|meter_power|meter_gas|meter_water|measure_temperature|measure_battery)/))
        .map(d => ({ id: d.id, name: d.name, class: d.virtualClass || d.class }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

}

module.exports = EnergyDashboardApp;
