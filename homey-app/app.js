'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');
const {
  PERIODS, PREVIOUS, discover, buildLive, buildHistory, buildBaseload, comparableTotals, todayTotals,
  blockCatalog, resolveLayout, defaultLayout, validateLayout, PinGuard, buildZoneFlow, consumptionDevices,
} = require('./lib/energy');
const { PriceService } = require('./lib/prices');
const { ForecastService } = require('./lib/forecast');
const { contractFrom, allInElectricity, SUPPLIERS } = require('./lib/tariffs');
const { WebServer } = require('./lib/webserver');

const DEVICES_CACHE_TTL = 5 * 1000;
const HISTORY_CACHE_TTL = 60 * 1000;
const LOGS_CACHE_TTL = 10 * 60 * 1000;
const BASELOAD_CACHE_TTL = 60 * 60 * 1000;
const ZONES_CACHE_TTL = 10 * 60 * 1000;

const DEFAULTS = {
  port: 8080,
  devices: { p1: '', solar: [], batteries: [], boiler: '', heating: [], thermostat: '', evChargers: [], water: '' },
  boiler: { liters: 80, coldWaterTemp: 10, showerTemp: 40, showerFlow: 8, warmFrom: 50 },
  battery: { invertPower: false },
  grid: { fuseAmps: 25 },
  prices: { source: 'energyzero' },
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
    zone: d.zone,
    available: d.available,
    capabilities: d.capabilities || [],
    capabilitiesObj,
    energyObj: d.energyObj || null,
  };
}

class EnergyDashboardApp extends Homey.App {

  async onInit() {
    // Apps run in UTC; days, hours and "last night" must follow the time zone of the Homey
    process.env.TZ = this.homey.clock.getTimezone();
    this.devicesCache = { at: 0, devices: null };
    this.logsCache = { at: 0, ids: null };
    this.baseloadCache = { at: 0, data: null };
    this.historyCache = new Map();
    this.zonesCache = { at: 0, names: null };
    this.prices = new PriceService({ log: this.log.bind(this) });
    this.forecast = new ForecastService({ log: this.log.bind(this) });
    this.pinGuard = new PinGuard();

    this.webServer = new WebServer({ app: this, log: this.log.bind(this), error: this.error.bind(this) });
    await this.webServer.start(this.getConfig().port);

    // New settings can change the port, the devices and the prices
    this.homey.settings.on('set', () => {
      this.historyCache.clear();
      this.baseloadCache = { at: 0, data: null };
      this.webServer.start(this.getConfig().port).catch(this.error);
    });
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
    return {
      port: Number(saved.port) || DEFAULTS.port,
      devices: { ...DEFAULTS.devices, ...saved.devices },
      boiler: { ...DEFAULTS.boiler, ...saved.boiler },
      battery: { ...DEFAULTS.battery, ...saved.battery },
      grid: { ...DEFAULTS.grid, ...saved.grid },
      prices: { ...DEFAULTS.prices, ...saved.prices },
      tariffs: { ...DEFAULTS.tariffs, ...saved.tariffs },
      contract: saved.contract || null,
      forecast: { enabled: false, planes: [], ...saved.forecast },
      layout: Array.isArray(saved.layout) && saved.layout.length ? saved.layout : null,
      editPin: saved.editPin || '',
      accessCode: saved.accessCode || '',
    };
  }

  // ---------- Layout editing from the dashboard ----------

  async getLayoutInfo() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    return {
      blocks: blockCatalog(),
      layout: resolveLayout(cfg.layout, found, cfg),
      defaultLayout: defaultLayout(found, cfg),
      customLayout: Boolean(cfg.layout),
      pinRequired: Boolean(cfg.editPin),
    };
  }

  async saveLayout({ layout, pin }) {
    this.pinGuard.check(this.getConfig().editPin, pin);
    const saved = this.homey.settings.get('config') || {};
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

  // Insights entries of a device capability as [{ t: Date, v: number }], or [] without a log
  async getEntries(deviceId, capability, resolution) {
    const id = `homey:device:${deviceId}:${capability}`;
    if (!(await this.getLogIds()).has(id)) return [];
    const api = await this.getApi();
    const result = await api.insights.getLogEntries({ id, resolution });
    return (result?.values || [])
      .filter(entry => typeof entry.v === 'number')
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

  // The live flow from sources through rooms to devices, for the Energy flows widget
  async getWidgetFlow({ perZone = 3 } = {}) {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const live = buildLive(devices, found, cfg);
    if (live.homeW === null) return { nodes: [], links: [], homeW: null, error: 'noP1' };
    const powered = consumptionDevices(devices, found, 'measure_power')
      .map(d => ({ id: d.id, name: d.name, zone: d.zone, value: d.capabilitiesObj.measure_power?.value }))
      .filter(d => typeof d.value === 'number' && d.value > 0);
    const flow = buildZoneFlow({
      solarW: live.solarW || 0,
      gridW: live.gridW || 0,
      batteryW: live.battery ? live.battery.watts : 0,
      homeW: live.homeW,
      flows: live.flows,
    }, powered, await this.getZoneNames(), { perZone: Math.max(0, Math.min(8, Number(perZone) || 0)) });
    return { ...flow, solarW: live.solarW, gridW: live.gridW, updated: live.updated };
  }

  async getLive() {
    const cfg = this.getConfig();
    const devices = await this.getDevices();
    const found = discover(devices, cfg.devices);
    const live = buildLive(devices, found, cfg);
    live.version = this.homey.manifest.version;
    const shown = new Set(live.layout.map(b => b.id));

    // Today's totals for the live diagram. The history is cached; while it is being built
    // (the first time, which can take a while) the diagram shows without them.
    const today = await Promise.race([this.getHistory('today').catch(() => null), new Promise(r => setTimeout(r, 1500))]);
    live.today = todayTotals(today?.totals);
    if (shown.has('baseload')) live.baseload = await this.getBaseload(found, cfg).catch(() => null);
    if (shown.has('prices')) {
      const contract = contractFrom(cfg);
      const allIn = contract.electricity.type === 'dynamic' ? p => allInElectricity(contract, p) : null;
      live.prices = await this.prices.get(cfg.prices, { allIn }).catch(err => ({ error: err.message }));
    }
    return live;
  }

  async getBaseload(found, cfg) {
    if (Date.now() - this.baseloadCache.at > BASELOAD_CACHE_TTL) {
      const market = await this.prices.get({}).catch(() => null);
      this.baseloadCache = { at: Date.now(), data: await buildBaseload(this, found, cfg, market?.avg) };
    }
    return this.baseloadCache.data;
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
    const data = await buildHistory(this, devices, discover(devices, cfg.devices), period, cfg, { light, prices: this.prices });
    if (period === 'today' && !light && cfg.forecast.enabled) {
      const location = { lat: this.homey.geolocation.getLatitude(), lon: this.homey.geolocation.getLongitude() };
      data.forecast = await this.forecast.get({ ...location, planes: cfg.forecast.planes }).catch(() => null);
    }
    if (!light && PREVIOUS[period]) {
      const previous = await this.getHistory(PREVIOUS[period], { light: true }).catch(() => null);
      data.previous = comparableTotals(previous, data);
    }
    return data;
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
