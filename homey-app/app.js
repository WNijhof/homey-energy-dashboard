'use strict';

const crypto = require('crypto');

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');
const {
  PERIODS, PREVIOUS, discover, buildLive, buildHistory, buildBaseload, comparableTotals, todayTotals,
  blockCatalog, resolveLayout, defaultLayout, validateLayout, PinGuard, layoutName, savedLayout, historyCsv, buildZoneFlow, consumptionDevices, nettingSummary,
  expectedSolar, estimatedDevices, gridPower, timelineDay, recordTimeline, buildLiveAt, buildGroups, buildPhases, hasUsageEstimate, isCopy,
  collectNights, pruneNights, batteryAdvice, nightSource, lastNight, meterCapabilities,
  mergeNights, connectionMaxW, importMeterExport, UploadParts, batteryViews, lastYearMonths, monthTotals,
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
// The settings page on the web: how long a right PIN lasts, and what it can never change
const SETTINGS_TOKEN_TTL = 12 * 3600 * 1000;
const WEB_HIDDEN_SETTINGS = ['port', 'accessCode', 'editPin'];
// How often the log of nights is read again while last night is still missing
const NIGHTS_RETRY = 60 * 60 * 1000;
// A log of an older version is filled in once more: version 2 reads Homey Energy's day reports
const NIGHT_LOG_VERSION = 2;
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

    // A tag per group in the fuse box (load in % of its fuse, and watts), for Flows
    this.groupTokens = new Map();
    this.homey.setInterval(() => this.updateGroupTokens().catch(err => this.error(`Group tags: ${err.message}`)), 30 * 1000);
    this.homey.setTimeout(() => this.updateGroupTokens().catch(err => this.error(`Group tags: ${err.message}`)), 10 * 1000);

    // The log of nights for the battery size block grows also when no screen is open: Homey
    // Energy keeps the day reports it is read from for only a month
    this.homey.setInterval(() => this.keepNights().catch(err => this.error(`Nights: ${err.message}`)), 6 * 3600 * 1000);
    this.homey.setTimeout(() => this.keepNights().catch(err => this.error(`Nights: ${err.message}`)), 2 * 60 * 1000);

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
      groups: Array.isArray(saved.groups) ? saved.groups : [],
      groupsSolarPhases: Array.isArray(saved.groupsSolarPhases) ? saved.groupsSolarPhases : [],
      groupsBatteryPhases: Array.isArray(saved.groupsBatteryPhases) ? saved.groupsBatteryPhases : [],
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
    if (shown.has('batterysize')) live.batterysize = this.getBatterySize(found, cfg);
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

  // Battery size: the use while dark per night, kept in the settings for a year. Nights that are
  // missing are read in the background (the first time from as far back as Homey has readings per
  // hour); the block shows what the log holds so far.
  getBatterySize(found, cfg) {
    const source = nightSource(found);
    const stored = this.homey.settings.get('nightLog');
    const log = stored?.source === source ? stored.nights || {} : {};
    const due = !log[lastNight()] || stored?.version !== NIGHT_LOG_VERSION;
    if (found.p1 && due && !this.nightsPending && Date.now() - (this.nightsTried || 0) > NIGHTS_RETRY) {
      this.nightsTried = Date.now();
      const read = (device, capability, resolution) => this.getEntries(device.id, capability, resolution).catch(() => []);
      // Where the Homey is, to know when the sun is down (inverters log nothing at night)
      const place = this.getPlace();
      // Saved after every batch of day reports too, so a restart halfway loses little
      const save = (fresh, version) => this.homey.settings.set('nightLog', { source, version, nights: pruneNights({ ...log, ...fresh }) });
      this.nightsPending = collectNights(read, found, cfg, log, new Date(), {
        place,
        dayReport: date => this.energyReport({ kind: 'day', date }),
        progress: fresh => save(fresh, stored?.version || 1),
      })
        .then(fresh => save(fresh, NIGHT_LOG_VERSION))
        .catch(err => this.error(`Nights: ${err.message}`))
        .finally(() => { this.nightsPending = null; });
    }
    // Homey Energy's month totals for the model, read once a day for months not kept yet
    const months = this.homey.settings.get('monthTotals') || {};
    if (lastYearMonths().some(key => !(key in months)) && !this.monthsPending && Date.now() - (this.monthsTried || 0) > NIGHTS_RETRY) {
      this.monthsTried = Date.now();
      this.monthsPending = this.readMonthTotals(months)
        .catch(err => this.error(`Month totals: ${err.message}`))
        .finally(() => { this.monthsPending = null; });
    }
    const imported = this.homey.settings.get('nightImport');
    const { views, check, fit } = batteryViews(log, imported?.nights, months, { place: this.getPlace() });
    return {
      views,
      building: Boolean(this.nightsPending || this.monthsPending),
      check,
      fit,
      imported: imported ? { from: imported.from, to: imported.to, darkHeight: imported.darkHeight } : null,
    };
  }

  // The totals of the completed months of the last year from Homey Energy's month reports; a
  // month without a report is kept as null, so it is not asked for again
  async readMonthTotals(known) {
    const months = { ...known };
    const wanted = lastYearMonths();
    for (const key of wanted) {
      if (key in months) continue;
      months[key] = monthTotals(await this.energyReport({ kind: 'month', yearMonth: key }).catch(() => null));
    }
    for (const key of Object.keys(months)) if (!wanted.includes(key)) delete months[key];
    this.homey.settings.set('monthTotals', months);
  }

  // Where the Homey is, to know when the sun is down
  getPlace() {
    const lat = this.homey.geolocation.getLatitude();
    const lon = this.homey.geolocation.getLongitude();
    return typeof lat === 'number' && typeof lon === 'number' ? { lat, lon } : null;
  }

  // A meter export from the settings page, in parts of text: kept until the last part is in,
  // then turned into nights (dark by the height of the sun, matched to the measured nights) and
  // saved as `nightImport`. Returns what was found, or the reason it could not be read.
  async importNightsPart(body) {
    this.nightUpload = this.nightUpload || new UploadParts();
    const csv = this.nightUpload.add(body);
    if (csv === null) return { received: Number(body.part) + 1, parts: Number(body.parts) };
    const cfg = this.getConfig();
    const found = discover(await this.getDevices(), cfg.devices);
    const stored = this.homey.settings.get('nightLog');
    const { record, summary } = importMeterExport(csv, {
      log: stored?.source === nightSource(found) ? stored.nights : {},
      place: this.getPlace(),
      maxW: connectionMaxW(cfg),
    });
    this.homey.settings.set('nightImport', record);
    return summary;
  }

  async clearNightImport() {
    this.homey.settings.unset('nightImport');
    return { cleared: true };
  }

  // Fills in the log of nights when the battery size block is in any layout
  async keepNights() {
    const cfg = this.getConfig();
    const layouts = [cfg.layout, ...Object.values(cfg.layouts || {})].filter(Array.isArray);
    if (!layouts.some(layout => layout.some(b => b && b.id === 'batterysize'))) return;
    const devices = await this.getDevices();
    this.getBatterySize(discover(devices, cfg.devices), cfg);
  }

  // ---------- Settings on the web page ----------

  // The settings page also works on the dashboard's own web page (/instellingen), which can be
  // reachable from the internet. It always needs the edit PIN: a right PIN gives a token for 12
  // hours. Wrong PINs lock it for a minute, doubling each time up to a day. The port, access code
  // and PIN can only be changed in Homey, so no one can open up or lock out the dashboard from
  // the web page.
  unlockSettings(pin) {
    const cfg = this.getConfig();
    if (!cfg.editPin) {
      throw Object.assign(new Error('Stel eerst een bewerkpincode in bij de instellingen van de app in Homey.'), { status: 403 });
    }
    const guard = this.settingsGuard || (this.settingsGuard = { failures: 0, lockedUntil: 0, locks: 0 });
    if (Date.now() < guard.lockedUntil) {
      const minutes = Math.ceil((guard.lockedUntil - Date.now()) / 60000);
      throw Object.assign(new Error(`Te veel verkeerde pincodes. Probeer het over ${minutes} min opnieuw.`), { status: 429 });
    }
    if (String(pin ?? '') !== String(cfg.editPin)) {
      guard.failures++;
      if (guard.failures >= 5) {
        guard.failures = 0;
        guard.lockedUntil = Date.now() + Math.min(24 * 60, 2 ** guard.locks) * 60 * 1000;
        guard.locks++;
      }
      throw Object.assign(new Error('Verkeerde pincode'), { status: 403 });
    }
    guard.failures = 0;
    guard.locks = 0;
    const token = crypto.randomBytes(24).toString('hex');
    this.settingsTokens = this.settingsTokens || new Map();
    this.settingsTokens.set(token, Date.now() + SETTINGS_TOKEN_TTL);
    return { token };
  }

  checkSettingsToken(token) {
    const tokens = this.settingsTokens || new Map();
    for (const [key, until] of tokens) if (until < Date.now()) tokens.delete(key);
    // A new PIN in Homey ends every session on the web page
    if (!this.getConfig().editPin) tokens.clear();
    if (!token || !tokens.has(String(token))) throw Object.assign(new Error('Pincode nodig'), { status: 401 });
  }

  webSettingValue(key) {
    if (key === 'config') {
      const config = { ...(this.homey.settings.get('config') || {}) };
      for (const hidden of WEB_HIDDEN_SETTINGS) delete config[hidden];
      return config;
    }
    if (key === 'nightImport') return this.homey.settings.get('nightImport') || null;
    throw Object.assign(new Error('Onbekende instelling'), { status: 404 });
  }

  async setWebSetting(key, value) {
    if (key !== 'config' || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw Object.assign(new Error('Onbekende instelling'), { status: 400 });
    }
    const saved = this.homey.settings.get('config') || {};
    const next = { ...value };
    for (const hidden of WEB_HIDDEN_SETTINGS) {
      if (hidden in saved) next[hidden] = saved[hidden];
      else delete next[hidden];
    }
    this.homey.settings.set('config', next);
    return { saved: true };
  }

  // The calls of the settings page, as its Homey.api would make them
  async webSettingsCall({ method, path, body } = {}) {
    const [route, query = ''] = String(path || '').split('?');
    if (method === 'GET' && route === '/settings-info') return this.getSettingsInfo();
    if (method === 'GET' && route === '/diagnosis-report') return this.getDiagnosisReport({ snapshot: /(^|&)snapshot=1(&|$)/.test(query) });
    if (method === 'POST' && route === '/night-import') return this.importNightsPart(body || {});
    if (method === 'POST' && route === '/night-import/clear') return this.clearNightImport();
    throw Object.assign(new Error('Onbekend'), { status: 404 });
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
  // Keeps one pair of tags per group: made for a new group, renamed with it, removed with it
  async updateGroupTokens() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const solarW = found.solar.reduce((sum, d) => sum + Math.abs(Number(d.capabilitiesObj?.measure_power?.value) || 0), 0);
    const estimated = await this.getEstimated(devices, found).catch(() => []);
    const groups = buildGroups(devices, cfg, { phases: buildPhases(found.p1, cfg), solarW, estimated })?.groups || [];
    const wanted = new Map();
    for (const g of groups) {
      wanted.set(`group-${g.id}-load`, { title: this.homey.__('tokens.groupLoad', { name: g.name }), value: Math.round(g.amps / g.fuseAmps * 100) });
      wanted.set(`group-${g.id}-watts`, { title: this.homey.__('tokens.groupWatts', { name: g.name }), value: g.watts });
    }
    for (const [id, token] of this.groupTokens) {
      if (wanted.get(id)?.title === token.title) continue;
      this.groupTokens.delete(id);
      await token.flowToken.unregister().catch(() => {});
    }
    for (const [id, { title, value }] of wanted) {
      let token = this.groupTokens.get(id);
      if (!token) {
        token = { title, flowToken: await this.homey.flow.createToken(id, { type: 'number', title, value }) };
        this.groupTokens.set(id, token);
      }
      await token.flowToken.setValue(value);
    }
  }

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
    const history = await this.describeHistory(found).catch(err => ({ error: err.message }));
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
        .map(d => ({ name: label(d, 'device'), app: d.driverId, class: d.virtualClass || d.class, capabilities: d.capabilities, energyUser: d.energy, energySettings: d.energySettings })),
      // The groups in the fuse box as saved, without names
      groups: (Array.isArray(cfg.groups) ? cfg.groups : []).map(g => ({ phases: g.phases, fuseAmps: g.fuseAmps, fixedWatts: g.fixedWatts, devices: (g.devices || []).length })),
      groupsSolarPhases: cfg.groupsSolarPhases,
      groupsBatteryPhases: cfg.groupsBatteryPhases,
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
      history,
    };
  }

  // How far back Homey keeps readings, for the battery size block: per Insights resolution the
  // readings of the P1 meter (its power, or else the kWh counter) with their usual step, and the
  // first and last day of Homey Energy's day reports (the only ones with power per 5 minutes; on
  // the owner's Homey a month). Week and month reports only hold totals.
  async describeHistory(found) {
    const insights = {};
    const logs = await this.getLogIds().catch(() => new Set());
    const logged = cap => found.p1 && logs.has(`homey:device:${found.p1.id}:${cap}`);
    const capability = ['measure_power', ...meterCapabilities(found.p1, 'import')].find(logged) || 'measure_power';
    insights.capability = capability;
    if (found.p1) {
      for (const resolution of ['last24Hours', 'last7Days', 'last14Days', 'last31Days', 'last3Months']) {
        const entries = await this.getEntries(found.p1.id, capability, resolution).catch(err => ({ error: err.message }));
        if (!Array.isArray(entries)) { insights[resolution] = entries; continue; }
        const gaps = entries.slice(1).map((e, i) => e.t - entries[i].t).sort((a, b) => a - b);
        insights[resolution] = {
          entries: entries.length,
          stepMinutes: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)] / 60000) : null,
          from: entries[0]?.t?.toISOString() || null,
        };
      }
    }
    const available = await (await this.getApi()).energy.getReportsAvailable().catch(err => ({ failed: err.message }));
    const days = Array.isArray(available?.availableDays) ? available.availableDays : [];
    const nights = this.homey.settings.get('nightLog');
    const kinds = {};
    for (const n of Object.values(nights?.nights || {})) {
      const kind = n.missing ? 'missing' : n.skipped ? `skipped:${n.skipped}` : `step${n.step}`;
      kinds[kind] = (kinds[kind] || 0) + 1;
    }
    return {
      insights,
      dayReports: available?.failed ? available : { count: days.length, from: days[0] || null, to: days[days.length - 1] || null },
      nightLog: { version: nights?.version || null, kinds },
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
    const found = discover(devices, cfg.devices);
    const estimated = light ? [] : await this.getEstimated(devices, found).catch(() => []);
    const data = await buildHistory(this, devices, found, period, cfg, { light, prices: this.prices, weather: this.weather, location, estimated });
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
    const estimatedIds = new Set((await this.getEstimated(devices, found).catch(() => [])).map(d => d.id));
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
      // Devices without a meter but with an estimate from Homey can be put in a group as well
      devices: devices
        .filter(d => hasCapability(d, /^(measure_power|meter_power|meter_gas|meter_water|measure_temperature|measure_battery)/)
          || hasUsageEstimate(d) || estimatedIds.has(d.id))
        .map(d => ({
          id: d.id,
          name: d.name,
          class: d.virtualClass || d.class,
          power: (d.capabilities || []).includes('measure_power'),
          estimate: hasUsageEstimate(d) || estimatedIds.has(d.id),
          // A summary of Power by the Hour (Σ): it copies another meter, so it is no group device
          copy: isCopy(d),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

}

module.exports = EnergyDashboardApp;
