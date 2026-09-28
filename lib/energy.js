'use strict';

const { contractFrom, tariffFor, hasPrices, typicalImportPrice } = require('./tariffs');

const PERIODS = {
  today: { resolution: 'today', bucket: 'hour' },
  yesterday: { resolution: 'yesterday', bucket: 'hour' },
  week: { resolution: 'thisWeek', bucket: 'day' },
  month: { resolution: 'thisMonth', bucket: 'day' },
  year: { resolution: 'thisYear', bucket: 'month' },
  lastWeek: { resolution: 'lastWeek', bucket: 'day' },
  lastMonth: { resolution: 'lastMonth', bucket: 'day' },
  lastYear: { resolution: 'lastYear', bucket: 'month' },
};

// The period each period is compared with
const PREVIOUS = { today: 'yesterday', week: 'lastWeek', month: 'lastMonth', year: 'lastYear' };

const MONTH_NAMES = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const DAY_NAMES = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

const MODE_LABELS = {
  imemory: 'i-Memory',
  green: 'Green',
  program: 'Programma',
  boost: 'Boost',
  on: 'Aan',
  off: 'Uit',
  eco: 'Eco',
  electric: 'Elektrisch',
  performance: 'Prestatie',
  high_demand: 'Hoog verbruik',
  heat_pump: 'Warmtepomp',
  gas: 'Gas',
  auto: 'Automatisch',
  heat: 'Verwarmen',
  cool: 'Koelen',
};

const EV_STATES = {
  plugged_in_charging: 'Laden',
  plugged_in_discharging: 'Ontladen',
  plugged_in_paused: 'Gepauzeerd',
  plugged_in: 'Aangesloten',
  plugged_out: 'Niet aangesloten',
};

// Devices with less than this share of the consumption are left out of the Sankey chart
const SANKEY_MIN_SHARE = 0.015;
const SANKEY_MAX_DEVICES = 15;

const has = (device, capability) => (device.capabilities || []).includes(capability);
const value = (device, capability) => device?.capabilitiesObj?.[capability]?.value ?? null;
const isClass = (d, cls) => d.class === cls || d.virtualClass === cls;

// Finds the P1 meter, solar panels, home batteries and boiler, unless they are pinned in the config
function discover(devices, pinned = {}) {
  const byId = id => id && devices.find(d => d.id === id);

  const p1 = byId(pinned.p1)
    || devices.find(d => d.energyObj?.cumulative)
    || devices.find(d => has(d, 'meter_gas') && has(d, 'measure_power'))
    || devices.find(d => /p1|dongle|slimme meter|smart meter/i.test(d.name));

  const solar = pinned.solar?.length
    ? pinned.solar.map(byId).filter(Boolean)
    : devices.filter(d => isClass(d, 'solarpanel'));

  const batteries = pinned.batteries?.length
    ? pinned.batteries.map(byId).filter(Boolean)
    : devices.filter(d => d.energyObj?.homeBattery || (isClass(d, 'battery') && has(d, 'measure_power')));

  const boiler = byId(pinned.boiler)
    || devices.find(d => has(d, 'lydos_showers'))
    || devices.find(d => isClass(d, 'waterheater') && has(d, 'measure_temperature'));

  // Heat pumps and central heating boilers (hybrid or all-electric)
  const heating = pinned.heating?.length
    ? pinned.heating.map(byId).filter(Boolean)
    : devices.filter(d => isClass(d, 'heatpump') || isClass(d, 'boiler'));

  const thermostats = devices.filter(d => isClass(d, 'thermostat') && has(d, 'measure_temperature'));
  const thermostat = byId(pinned.thermostat)
    || thermostats.find(d => /thermostaat|thermostat|nest|tado|toon|anna|honeywell|ecobee/i.test(d.name))
    || thermostats[0]
    || null;

  const evChargers = pinned.evChargers?.length
    ? pinned.evChargers.map(byId).filter(Boolean)
    : devices.filter(d => isClass(d, 'evcharger') || d.energyObj?.evCharger);

  const car = byId(pinned.car)
    || devices.find(d => (isClass(d, 'car') || isClass(d, 'vehicle')) && has(d, 'measure_battery'))
    || null;

  const water = byId(pinned.water)
    || devices.find(d => has(d, 'meter_water') && d.id !== p1?.id)
    || (p1 && has(p1, 'meter_water') ? p1 : null)
    || null;

  return { p1, solar, batteries, boiler, heating, thermostat, evChargers, car, water };
}

// ---------- Blocks ----------

// Everything the dashboard can show. `available` decides whether a block is part of the
// default layout; a layout chosen by the user shows a block even without data.
const BLOCKS = [
  { id: 'flow', title: 'Energie nu', size: 'half', available: () => true },
  { id: 'waterheater', title: 'Warm water', size: 'half', available: f => Boolean(f.boiler) },
  { id: 'heating', title: 'Verwarming', size: 'half', available: f => f.heating.length > 0 || Boolean(f.thermostat) },
  { id: 'ev', title: 'Laadpaal', size: 'half', available: f => f.evChargers.length > 0 },
  { id: 'tiles', title: 'Totalen', size: 'full', available: () => true },
  { id: 'prices', title: 'Stroomprijs', size: 'large', available: (f, cfg) => cfg.prices?.source !== 'off' },
  { id: 'gauges', title: 'Kengetallen', size: 'small', available: f => f.solar.length > 0 || f.batteries.length > 0 },
  { id: 'electricity', title: 'Elektriciteit', size: 'large', available: () => true },
  { id: 'power', title: 'Vermogen vandaag', size: 'full', available: f => Boolean(f.p1) },
  { id: 'consumers', title: 'Apparaten nu', size: 'small', available: () => true },
  { id: 'sankey', title: 'Energiestromen', size: 'full', available: () => true },
  { id: 'devices', title: 'Verbruik per apparaat', size: 'half', available: () => true },
  { id: 'costs', title: 'Kosten', size: 'half', available: (f, cfg) => hasPrices(contractFrom(cfg)) },
  { id: 'solar', title: 'Zonne-energie', size: 'half', available: f => f.solar.length > 0 },
  { id: 'gas', title: 'Gas', size: 'half', available: f => Boolean(f.p1 && has(f.p1, 'meter_gas')) },
  { id: 'water', title: 'Water', size: 'half', available: f => Boolean(f.water) },
  { id: 'baseload', title: 'Sluipverbruik', size: 'small', available: f => Boolean(f.p1) },
  { id: 'phases', title: 'Fasebelasting', size: 'small', available: f => phaseCapabilities(f.p1).length > 0 },
];

const SIZES = ['small', 'half', 'large', 'full'];

// Block heights are counted in grid rows of the dashboard (24 px each, gap included).
// A block without `rows` takes the height of its content.
const MIN_ROWS = 4;
const MAX_ROWS = 80;
const validRows = rows => Number.isInteger(rows) && rows >= MIN_ROWS && rows <= MAX_ROWS;

function layoutItem(id, size, rows) {
  return validRows(rows) ? { id, size, rows } : { id, size };
}

function defaultLayout(found, cfg = {}) {
  return BLOCKS.filter(b => b.available(found, cfg)).map(b => ({ id: b.id, size: b.size }));
}

// The saved layout, cleaned up, or the default one when nothing was saved
function resolveLayout(saved, found, cfg = {}) {
  if (!Array.isArray(saved) || !saved.length) return defaultLayout(found, cfg);
  const known = new Set(BLOCKS.map(b => b.id));
  const seen = new Set();
  return saved
    .filter(b => known.has(b.id) && !seen.has(b.id) && seen.add(b.id))
    .map(b => layoutItem(b.id, SIZES.includes(b.size) ? b.size : BLOCKS.find(x => x.id === b.id).size, b.rows));
}

// Today's totals per source, shown in the live energy diagram
function todayTotals(totals) {
  if (!totals) return null;
  const { solar, import: imported, export: exported, consumption, charge, discharge } = totals;
  return { solar, import: imported, export: exported, consumption, charge, discharge };
}

// Checks a layout sent by the dashboard's edit mode; null means "back to the automatic layout"
function validateLayout(input) {
  if (input === null) return null;
  if (!Array.isArray(input) || !input.length) throw new Error('Kies minstens één blok');
  const known = new Set(BLOCKS.map(b => b.id));
  const seen = new Set();
  const layout = [];
  for (const item of input) {
    if (!item || !known.has(item.id) || seen.has(item.id)) throw new Error(`Onbekend blok: ${item?.id}`);
    if (!SIZES.includes(item.size)) throw new Error(`Onbekende breedte: ${item.size}`);
    if (item.rows !== undefined && item.rows !== null && !validRows(item.rows)) throw new Error(`Onbekende hoogte: ${item.rows}`);
    seen.add(item.id);
    layout.push(layoutItem(item.id, item.size, item.rows));
  }
  return layout;
}

// Guards the edit mode with an optional PIN, and slows down guessing
class PinGuard {

  constructor() {
    this.failures = 0;
    this.lockedUntil = 0;
  }

  check(expected, given) {
    if (!expected) return;
    if (Date.now() < this.lockedUntil) {
      const err = new Error('Te veel verkeerde pincodes. Probeer het over een minuut opnieuw.');
      err.status = 429;
      throw err;
    }
    if (String(given ?? '') !== String(expected)) {
      this.failures++;
      if (this.failures >= 5) {
        this.failures = 0;
        this.lockedUntil = Date.now() + 60 * 1000;
      }
      const err = new Error('Verkeerde pincode');
      err.status = 403;
      throw err;
    }
    this.failures = 0;
  }

}

function blockCatalog() {
  return BLOCKS.map(({ id, title, size }) => ({ id, title, size }));
}

// Cumulative kWh capabilities of the P1 meter; tariff splits (t1/t2) are summed
function meterCapabilities(device, direction) {
  if (!device) return [];
  const explicit = direction === 'import'
    ? device.energyObj?.cumulativeImportedCapability
    : device.energyObj?.cumulativeExportedCapability;
  if (explicit && has(device, explicit)) return [explicit];

  const pattern = direction === 'import'
    ? /^meter_power\.(imported|consumed|delivered|import)/
    : /^meter_power\.(exported|produced|returned|export)/;
  const matches = device.capabilities.filter(c => pattern.test(c));
  const totals = matches.filter(c => !/\.t\d$/.test(c));
  if (totals.length) return totals.slice(0, 1);
  if (matches.length) return matches;

  // A meter with a single kWh counter only knows import
  return direction === 'import' && has(device, 'meter_power') ? ['meter_power'] : [];
}

// kWh counter of a home battery for energy going in (charge) or out (discharge)
function batteryMeterCapability(device, direction) {
  const explicit = direction === 'charge'
    ? device.energyObj?.meterPowerImportedCapability
    : device.energyObj?.meterPowerExportedCapability;
  if (explicit && has(device, explicit)) return explicit;
  const pattern = direction === 'charge'
    ? /^meter_power\.(charged|charge|imported|import|in)$/
    : /^meter_power\.(discharged|discharge|exported|export|out)$/;
  return device.capabilities.find(c => pattern.test(c)) || null;
}

// Battery power in W, positive while charging and negative while discharging (Homey's convention)
function batteryPower(device, cfg) {
  const watts = value(device, 'measure_power');
  if (typeof watts !== 'number') return 0;
  return cfg.invertPower ? -watts : watts;
}

// Splits the energy of one period (or the power of one moment) into flows between
// sources and destinations, the way Home Assistant does: solar is used for export first,
// then for charging the battery, and what is left goes to the house.
function allocateFlows({ solar = 0, imported = 0, exported = 0, charge = 0, discharge = 0 }) {
  const solarToGrid = Math.min(solar, exported);
  const batteryToGrid = Math.min(discharge, exported - solarToGrid);
  const solarToBattery = Math.min(solar - solarToGrid, charge);
  const gridToBattery = Math.max(0, Math.min(imported, charge - solarToBattery));
  const solarToHome = Math.max(0, solar - solarToGrid - solarToBattery);
  const gridToHome = Math.max(0, imported - gridToBattery);
  const batteryToHome = Math.max(0, discharge - batteryToGrid);
  return { solarToHome, solarToGrid, solarToBattery, gridToHome, gridToBattery, batteryToHome, batteryToGrid };
}

// Power right now in the shape of a period's totals, for the live Sankey chart
function liveTotals({ solarW, gridW, batteryW, homeW, flows }) {
  return {
    solar: solarW || 0,
    import: Math.max(0, gridW || 0),
    export: Math.max(0, -(gridW || 0)),
    charge: Math.max(0, batteryW || 0),
    discharge: Math.max(0, -(batteryW || 0)),
    consumption: homeW || 0,
    ...flows,
  };
}

function showerMinutes(temperature, cfg) {
  if (typeof temperature !== 'number') return null;
  const { liters, coldWaterTemp, showerTemp, showerFlow } = cfg;
  if (temperature <= showerTemp) return 0;
  const mixedLiters = liters * (temperature - coldWaterTemp) / (showerTemp - coldWaterTemp);
  return Math.round(mixedLiters / showerFlow);
}

function boilerStatus(temperature, cfg) {
  if (typeof temperature !== 'number') return 'unknown';
  if (temperature >= cfg.warmFrom) return 'warm';
  if (temperature > cfg.showerTemp + 2) return 'lukewarm';
  return 'cold';
}

function assumptions({ liters, showerTemp, showerFlow, warmFrom }) {
  return { liters, showerTemp, showerFlow, warmFrom };
}

function buildBoiler(device, cfg) {
  if (!device) return null;
  const temperature = value(device, 'measure_temperature');
  const mode = value(device, 'lydos_mode') ?? value(device, 'hot_water_mode') ?? value(device, 'heater_operation_mode');
  return {
    name: device.name,
    available: device.available !== false,
    temperature,
    target: value(device, 'target_temperature'),
    heating: value(device, 'lydos_heating'),
    on: value(device, 'onoff'),
    mode: MODE_LABELS[mode] || mode,
    showers: value(device, 'lydos_showers'),
    minutes: showerMinutes(temperature, cfg),
    status: boilerStatus(temperature, cfg),
    assumptions: assumptions(cfg),
  };
}

function buildBattery(devices, cfg) {
  if (!devices.length) return null;
  const socs = devices.map(d => value(d, 'measure_battery')).filter(v => typeof v === 'number');
  return {
    names: devices.map(d => d.name),
    watts: devices.reduce((sum, d) => sum + batteryPower(d, cfg), 0),
    soc: socs.length ? socs.reduce((a, b) => a + b, 0) / socs.length : null,
  };
}

function buildHeating(found) {
  if (!found.heating.length && !found.thermostat) return null;
  const t = found.thermostat;
  const thermostatMode = t ? value(t, 'thermostat_mode') : null;
  return {
    devices: found.heating.map(d => {
      const mode = value(d, 'heater_operation_mode');
      return {
        name: d.name,
        watts: value(d, 'measure_power'),
        mode: MODE_LABELS[mode] || mode,
        on: value(d, 'onoff'),
        temperature: value(d, 'measure_temperature'),
      };
    }),
    thermostat: t ? {
      name: t.name,
      temperature: value(t, 'measure_temperature'),
      target: value(t, 'target_temperature'),
      mode: MODE_LABELS[thermostatMode] || thermostatMode,
    } : null,
  };
}

function buildEv(found) {
  if (!found.evChargers.length) return null;
  const chargers = found.evChargers.map(d => {
    const state = value(d, 'evcharger_charging_state');
    const charging = value(d, 'evcharger_charging');
    return {
      name: d.name,
      watts: value(d, 'measure_power'),
      state: EV_STATES[state] || (charging === true ? 'Laden' : charging === false ? 'Niet aan het laden' : null),
      charging: state ? state === 'plugged_in_charging' : charging === true,
      soc: value(d, 'measure_battery'),
    };
  });
  return {
    chargers,
    car: found.car ? { name: found.car.name, soc: value(found.car, 'measure_battery') } : null,
  };
}

// Per-phase readings of the P1 meter, e.g. measure_current.l1 or measure_power.phase2
function phaseCapabilities(device) {
  if (!device) return [];
  return (device.capabilities || []).filter(c => /^measure_(current|power|voltage)\.(l|phase|L)?[123]$/.test(c));
}

function buildPhases(device, cfg) {
  const caps = phaseCapabilities(device);
  if (!caps.length) return null;
  const phases = [1, 2, 3].map(n => {
    const find = kind => caps.find(c => c.startsWith(`measure_${kind}.`) && c.endsWith(String(n)));
    const read = kind => (find(kind) ? value(device, find(kind)) : null);
    return { phase: n, amps: read('current'), watts: read('power'), volts: read('voltage') };
  }).filter(p => p.amps !== null || p.watts !== null || p.volts !== null);
  return { phases, fuseAmps: cfg.grid?.fuseAmps || 25 };
}

function buildWater(device) {
  if (!device) return null;
  return {
    name: device.name,
    flow: value(device, 'measure_water'),
    total: value(device, 'meter_water'),
  };
}

function buildLive(devices, found, cfg) {
  const gridW = found.p1 ? value(found.p1, 'measure_power') : null;
  const solarW = found.solar.reduce((sum, d) => sum + Math.abs(value(d, 'measure_power') || 0), 0);
  const battery = buildBattery(found.batteries, cfg.battery);
  const batteryW = battery ? battery.watts : 0;
  const homeW = gridW === null ? null : Math.max(0, gridW + solarW - batteryW);

  const flows = allocateFlows({
    solar: solarW,
    imported: Math.max(0, gridW || 0),
    exported: Math.max(0, -(gridW || 0)),
    charge: Math.max(0, batteryW),
    discharge: Math.max(0, -batteryW),
  });

  const skip = new Set([found.p1?.id, ...found.solar.map(d => d.id), ...found.batteries.map(d => d.id)]);
  const powered = devices
    .filter(d => !skip.has(d.id) && typeof value(d, 'measure_power') === 'number' && value(d, 'measure_power') > 0)
    .map(d => ({ id: d.id, name: d.name, watts: value(d, 'measure_power') }))
    .sort((a, b) => b.watts - a.watts);
  const consumers = powered.slice(0, 20);

  // The same Sankey as for a period, but with the power right now
  const liveDevices = new Set(consumptionDevices(devices, found, 'measure_power').map(d => d.id));
  const sankey = homeW === null ? null : buildSankey(
    liveTotals({ solarW, gridW, batteryW, homeW, flows }),
    powered.filter(d => liveDevices.has(d.id)).map(d => ({ id: d.id, name: d.name, value: d.watts })),
  );

  return {
    gridW,
    solarW: found.solar.length ? solarW : null,
    homeW,
    battery,
    flows,
    gasM3: found.p1 ? value(found.p1, 'meter_gas') : null,
    consumers,
    sankey,
    devices: {
      p1: found.p1?.name || null,
      solar: found.solar.map(d => d.name),
      batteries: found.batteries.map(d => d.name),
      boiler: found.boiler?.name || null,
      heating: found.heating.map(d => d.name),
      thermostat: found.thermostat?.name || null,
      evChargers: found.evChargers.map(d => d.name),
    },
    boiler: buildBoiler(found.boiler, cfg.boiler),
    heating: buildHeating(found),
    ev: buildEv(found),
    water: buildWater(found.water),
    phases: buildPhases(found.p1, cfg),
    layout: resolveLayout(cfg.layout, found, cfg),
    updated: new Date().toISOString(),
  };
}

function periodStart(period, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'yesterday') start.setDate(start.getDate() - 1);
  if (period === 'week' || period === 'lastWeek') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === 'lastWeek') start.setDate(start.getDate() - 7);
  if (period === 'month' || period === 'lastMonth') start.setDate(1);
  if (period === 'lastMonth') start.setMonth(start.getMonth() - 1);
  if (period === 'year' || period === 'lastYear') start.setMonth(0, 1);
  if (period === 'lastYear') start.setFullYear(start.getFullYear() - 1);
  return start;
}

// Where a period ends: the start of the next one
function periodEnd(period, start) {
  const end = new Date(start);
  const { bucket } = PERIODS[period];
  if (bucket === 'hour') end.setDate(end.getDate() + 1);
  else if (bucket === 'month') end.setFullYear(end.getFullYear() + 1);
  else if (period === 'week' || period === 'lastWeek') end.setDate(end.getDate() + 7);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

function makeBuckets(period, now = new Date()) {
  const start = periodStart(period, now);
  const buckets = [];
  if (PERIODS[period].bucket === 'hour') {
    for (let h = 0; h < 24; h++) {
      const s = new Date(start);
      s.setHours(h);
      buckets.push({ start: s, label: String(h).padStart(2, '0') });
    }
  } else if (PERIODS[period].bucket === 'month') {
    for (let m = 0; m < 12; m++) {
      const s = new Date(start);
      s.setMonth(m, 1);
      buckets.push({ start: s, label: MONTH_NAMES[m] });
    }
  } else {
    const weekly = period === 'week' || period === 'lastWeek';
    const days = weekly ? 7 : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    for (let i = 0; i < days; i++) {
      const s = new Date(start);
      s.setDate(start.getDate() + i);
      buckets.push({ start: s, label: weekly ? DAY_NAMES[s.getDay()] : String(s.getDate()) });
    }
  }
  return buckets;
}

function bucketIndex(buckets, t) {
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (t >= buckets[i].start) return i;
  }
  return -1;
}

// Spreads the increase of a cumulative meter over the buckets
function addMeterDeltas(target, buckets, entries) {
  for (let i = 1; i < entries.length; i++) {
    const delta = entries[i].v - entries[i - 1].v;
    if (!(delta > 0)) continue; // skip meter resets and gaps
    const idx = bucketIndex(buckets, entries[i - 1].t);
    if (idx >= 0) target[idx] += delta;
  }
}

// Adds the cost of the increase of a cumulative meter, with the price of that stretch of time.
// Returns whether any price was known.
function addMeterCost(target, buckets, entries, price, sign = 1) {
  let known = false;
  for (let i = 1; i < entries.length; i++) {
    const delta = entries[i].v - entries[i - 1].v;
    if (!(delta > 0)) continue;
    const idx = bucketIndex(buckets, entries[i - 1].t);
    if (idx < 0) continue;
    const p = price(entries[i - 1].t.getTime(), entries[i].t.getTime());
    if (typeof p !== 'number') continue;
    target[idx] += sign * delta * p;
    known = true;
  }
  return known;
}

// Converts a power (W) series to kWh per bucket, for devices without an energy meter.
// sign picks which part is counted: 1 for positive values, -1 for negative, 0 for both as absolute.
function addPowerIntegral(target, buckets, entries, sign = 0) {
  for (let i = 1; i < entries.length; i++) {
    const hours = (entries[i].t - entries[i - 1].t) / 3600000;
    if (hours <= 0 || hours > 2) continue;
    const watts = entries[i - 1].v;
    const counted = sign === 0 ? Math.abs(watts) : Math.max(0, watts * sign);
    const idx = bucketIndex(buckets, entries[i - 1].t);
    if (idx >= 0) target[idx] += counted * hours / 1000;
  }
}

const FLOW_KEYS = ['solarToHome', 'solarToGrid', 'solarToBattery', 'gridToHome', 'gridToBattery', 'batteryToHome', 'batteryToGrid'];

// Share of each bucket that has passed, for the fixed costs per day
function elapsedDays(period, bucket, now) {
  const start = bucket.start.getTime();
  const end = new Date(bucket.start);
  const kind = PERIODS[period].bucket;
  if (kind === 'hour') end.setHours(end.getHours() + 1);
  else if (kind === 'day') end.setDate(end.getDate() + 1);
  else end.setMonth(end.getMonth() + 1);
  const passed = Math.min(end.getTime(), now.getTime()) - start;
  return passed > 0 ? passed / 86400000 : 0;
}

function summarize(period, buckets, series, costs = null, extra = {}, now = new Date()) {
  const rows = buckets.map((b, i) => {
    const row = {
      label: b.label,
      start: b.start.toISOString(),
      import: series.import[i],
      export: series.export[i],
      solar: series.solar[i],
      charge: series.charge[i],
      discharge: series.discharge[i],
      gas: series.gas[i],
      heating: series.heating[i],
      ev: series.ev[i],
      water: series.water[i] * 1000, // liters
    };
    Object.assign(row, allocateFlows({
      solar: row.solar, imported: row.import, exported: row.export, charge: row.charge, discharge: row.discharge,
    }));
    row.solarUsed = row.solarToHome + row.solarToBattery;
    row.consumption = row.solarToHome + row.gridToHome + row.batteryToHome;
    if (costs) {
      row.costImport = costs.known.import ? costs.import[i] : null;
      row.costExport = costs.known.export ? costs.export[i] : null;
      row.costGas = costs.known.gas ? costs.gas[i] : null;
      row.costWater = typeof costs.water === 'number' ? series.water[i] * costs.water : null;
      row.costFixed = typeof costs.fixedPerDay === 'number' ? costs.fixedPerDay * elapsedDays(period, b, now) : null;
    }
    return row;
  });

  const totals = totalsOf(rows);
  const { deviceEnergy = [], hasBattery = false, available = {}, ...rest } = extra;
  return {
    period,
    bucket: PERIODS[period].bucket,
    hasBattery,
    available: { battery: hasBattery, ...available },
    rows,
    totals,
    ...rest,
    devices: deviceEnergy.filter(d => d.kWh > 0.0005).sort((a, b) => b.kWh - a.kWh).slice(0, 25)
      .map(({ id, name, kWh }) => ({ id, name, kWh })),
    sankey: buildSankey(totals, deviceEnergy.map(d => ({ id: d.id, name: d.name, value: d.kWh }))),
  };
}

const TOTAL_KEYS = ['import', 'export', 'solar', 'charge', 'discharge', 'gas', 'water', 'heating', 'ev', 'solarUsed', 'consumption', ...FLOW_KEYS];
const COST_KEYS = { import: 'costImport', export: 'costExport', gas: 'costGas', water: 'costWater', fixed: 'costFixed' };

function totalsOf(rows) {
  const totals = {};
  for (const key of TOTAL_KEYS) totals[key] = rows.reduce((sum, r) => sum + (r[key] || 0), 0);
  totals.selfSufficiency = totals.consumption > 0 ? (totals.solarToHome + totals.batteryToHome) / totals.consumption : null;
  totals.selfConsumption = totals.solar > 0 ? totals.solarUsed / totals.solar : null;
  // Positive: net energy taken from the grid; negative: net energy returned
  totals.netGrid = totals.import - totals.export;

  // A cost is known when at least one row has it; export is a credit (negative)
  const costs = {};
  for (const [key, field] of Object.entries(COST_KEYS)) {
    const known = rows.filter(r => typeof r[field] === 'number');
    costs[key] = known.length ? known.reduce((sum, r) => sum + r[field], 0) : null;
  }
  const priced = Object.values(costs).some(c => c !== null);
  totals.costs = priced ? costs : null;
  totals.cost = priced ? Object.values(costs).reduce((sum, c) => sum + (c || 0), 0) : null;
  return totals;
}

// Totals of the previous period up to the same point in time, so a day in progress
// is compared with the same hours of yesterday
function comparableTotals(previous, current, now = new Date()) {
  if (!previous || !current) return null;
  const elapsed = current.rows.filter(r => new Date(r.start) <= now).length;
  return totalsOf(previous.rows.slice(0, elapsed));
}

// Nodes and links for the Sankey chart: sources → house → individual consumers.
// Works on kWh for a period and on watts for the live view: `devices` holds { id, name, value }.
// Node values follow from the links; the client lays them out.
function buildSankey(totals, devices) {
  const nodes = [];
  const links = [];
  const node = (id, label, kind, column) => nodes.push({ id, label, kind, column });
  const link = (source, target, amount, kind) => {
    if (amount > 0.0005) links.push({ source, target, value: amount, kind });
  };

  if (totals.solar > 0) node('solar', 'Zon', 'solar', 0);
  if (totals.import > 0) node('grid', 'Net', 'grid', 0);
  if (totals.discharge > 0) node('battery-out', 'Batterij', 'battery', 0);

  node('home', 'Huis', 'home', 1);
  if (totals.export > 0) node('export', 'Teruggeleverd', 'export', 1);
  if (totals.charge > 0) node('battery-in', 'Batterij laden', 'battery', 1);

  link('solar', 'home', totals.solarToHome, 'solar');
  link('solar', 'export', totals.solarToGrid, 'solar');
  link('solar', 'battery-in', totals.solarToBattery, 'solar');
  link('grid', 'home', totals.gridToHome, 'grid');
  link('grid', 'battery-in', totals.gridToBattery, 'grid');
  link('battery-out', 'home', totals.batteryToHome, 'battery');
  link('battery-out', 'export', totals.batteryToGrid, 'battery');

  // Individual consumers, largest first; small ones are counted as not measured
  const consumption = totals.consumption;
  const shown = devices
    .filter(d => d.value > 0 && d.value >= consumption * SANKEY_MIN_SHARE)
    .sort((a, b) => b.value - a.value)
    .slice(0, SANKEY_MAX_DEVICES);
  for (const d of shown) {
    node(`device-${d.id}`, d.name, 'device', 2);
    link('home', `device-${d.id}`, d.value, 'device');
  }

  const measured = shown.reduce((s, d) => s + d.value, 0);
  if (consumption - measured > consumption * SANKEY_MIN_SHARE) {
    node('untracked', shown.length ? 'Niet gemeten' : 'Verbruik', 'untracked', 2);
    link('home', 'untracked', consumption - measured, 'untracked');
  }

  const used = new Set(links.flatMap(l => [l.source, l.target]));
  return { nodes: nodes.filter(n => used.has(n.id)), links };
}

// The live flow for the widget: sources → rooms (and export, battery) → the largest devices
// per room. The house's power from each source is shared over the rooms by their use, so the
// colors show where each room's power comes from. Kept small: few nodes, short names.
const ZONE_FLOW_MAX_ZONES = 8;

function buildZoneFlow({ solarW, gridW, batteryW, homeW, flows }, devices, zoneNames, { perZone = 3 } = {}) {
  const nodes = [];
  const links = [];
  const node = (id, label, kind, column) => nodes.push({ id, label, kind, column });
  const link = (source, target, value) => {
    if (value >= 1) links.push({ source, target, value: Math.round(value) });
  };
  const home = homeW || 0;

  if (solarW > 0) node('solar', 'solar', 'solar', 0);
  if (gridW > 0) node('grid', 'grid', 'grid', 0);
  if (batteryW < 0) node('battery-out', 'battery', 'battery', 0);
  if (gridW < 0) node('export', 'export', 'export', 1);
  if (batteryW > 0) node('battery-in', 'charge', 'battery', 1);

  // Rooms by measured use, largest first; the rest of the house is "other"
  const byZone = new Map();
  for (const d of devices) {
    if (!(d.value > 0)) continue;
    const zone = byZone.get(d.zone) || { id: d.zone, value: 0, devices: [] };
    zone.value += d.value;
    zone.devices.push(d);
    byZone.set(d.zone, zone);
  }
  const zones = [...byZone.values()].sort((a, b) => b.value - a.value);
  const shown = zones.slice(0, ZONE_FLOW_MAX_ZONES);
  const measured = shown.reduce((sum, z) => sum + z.value, 0);
  // A house use below what the devices report (timing between readings) is raised to it
  const total = Math.max(home, measured);
  const rest = total - measured;

  const zoneParts = shown.map(z => ({ id: `zone-${z.id}`, label: zoneNames[z.id] || '?', value: z.value, devices: z.devices }));
  if (rest >= Math.max(1, total * 0.02)) zoneParts.push({ id: 'zone-other', label: 'other', value: rest, devices: [] });

  const fromSources = [
    ['solar', flows.solarToHome],
    ['grid', flows.gridToHome],
    ['battery-out', flows.batteryToHome],
  ];
  for (const z of zoneParts) {
    node(z.id, z.label, z.id === 'zone-other' ? 'other' : 'zone', 1);
    // Scale the source shares to the rooms' total, so both sides of the room match
    const sourceSum = fromSources.reduce((sum, [, v]) => sum + (v || 0), 0) || 1;
    for (const [id, value] of fromSources) link(id, z.id, (value || 0) / sourceSum * z.value);
    const top = z.devices.sort((a, b) => b.value - a.value).slice(0, perZone);
    for (const d of top) {
      node(`device-${d.id}`, d.name, 'device', 2);
      link(z.id, `device-${d.id}`, d.value);
    }
    const others = z.devices.slice(perZone).reduce((sum, d) => sum + d.value, 0);
    if (perZone > 0 && others >= 1) {
      node(`${z.id}-more`, 'more', 'more', 2);
      link(z.id, `${z.id}-more`, others);
    }
  }

  link('solar', 'export', flows.solarToGrid);
  link('battery-out', 'export', flows.batteryToGrid);
  link('solar', 'battery-in', flows.solarToBattery);
  link('grid', 'battery-in', flows.gridToBattery);

  const used = new Set(links.flatMap(l => [l.source, l.target]));
  return { nodes: nodes.filter(n => used.has(n.id)), links, homeW: Math.round(total) };
}

// Devices whose energy use is shown in the Sankey chart: everything with a kWh meter
// (or a power meter for the live view) that is not a meter, panel or battery itself
function consumptionDevices(devices, found, capability = 'meter_power') {
  const skip = new Set([found.p1?.id, ...found.solar.map(d => d.id), ...found.batteries.map(d => d.id)]);
  return devices.filter(d => !skip.has(d.id)
    && has(d, capability)
    && !d.energyObj?.cumulative
    && !d.energyObj?.homeBattery
    && !isClass(d, 'solarpanel')
    && !isClass(d, 'battery'));
}

async function buildDeviceEnergy(client, devices, found, resolution) {
  const candidates = consumptionDevices(devices, found);
  return Promise.all(candidates.map(async d => {
    const entries = await client.getEntries(d.id, 'meter_power', resolution).catch(() => []);
    let kWh = 0;
    for (let i = 1; i < entries.length; i++) {
      const delta = entries[i].v - entries[i - 1].v;
      if (delta > 0) kWh += delta;
    }
    return { id: d.id, name: d.name, kWh };
  }));
}

// ---------- Power through the day ----------

const POWER_STEP = 5 * 60 * 1000;

// The average of a power series (W) in each step; a step without readings keeps the last value
// for a while, so a meter that only reports changes still gives a line. After that the step is
// unknown (null). With `idleZero`, a device that was (nearly) idle stays at 0 while it is quiet,
// also before its first reading, as panels at night or a resting battery often log nothing.
function averageInSteps(entries, start, steps, { idleZero = false } = {}) {
  const sums = new Array(steps).fill(0);
  const counts = new Array(steps).fill(0);
  for (const e of entries) {
    const i = Math.floor((e.t - start) / POWER_STEP);
    if (i >= 0 && i < steps) { sums[i] += e.v; counts[i]++; }
  }
  const out = [];
  let last = idleZero ? 0 : null;
  let lastAt = idleZero ? 0 : -Infinity;
  for (let i = 0; i < steps; i++) {
    if (counts[i]) {
      last = sums[i] / counts[i];
      lastAt = i;
    }
    const idle = idleZero && Math.abs(last) < 10;
    out.push(idle ? 0 : i - lastAt <= 6 ? last : null);
  }
  return out;
}

// Turns a cumulative kWh meter into power readings (W), for panels that log no power
function powerFromMeter(entries) {
  const out = [];
  for (let i = 1; i < entries.length; i++) {
    const hours = (entries[i].t - entries[i - 1].t) / 3600000;
    const delta = entries[i].v - entries[i - 1].v;
    if (hours > 0 && hours <= 2 && delta >= 0) out.push({ t: entries[i - 1].t, v: delta * 1000 / hours });
  }
  return out;
}

// Grid, solar and battery power (W, battery positive while charging) per step of the day,
// split into the same flows as the energy totals. A step where one of them is unknown is left
// empty (null), rather than guessing that device was at 0 W.
function buildPowerCurve(start, end, until, { grid, solar, battery }) {
  const steps = Math.max(0, Math.ceil((Math.min(until, end) - start) / POWER_STEP));
  const points = [];
  for (let i = 0; i < steps; i++) {
    const values = [grid, ...solar, ...battery].map(list => list[i]);
    if (!values.every(v => typeof v === 'number')) { points.push(null); continue; }
    const g = grid[i];
    const sun = Math.max(0, solar.reduce((sum, list) => sum + list[i], 0));
    const bat = battery.reduce((sum, list) => sum + list[i], 0);
    const flows = allocateFlows({
      solar: sun,
      imported: Math.max(0, g),
      exported: Math.max(0, -g),
      charge: Math.max(0, bat),
      discharge: Math.max(0, -bat),
    });
    const point = { solar: sun };
    for (const key of FLOW_KEYS) point[key] = flows[key];
    point.home = flows.solarToHome + flows.gridToHome + flows.batteryToHome;
    for (const key of Object.keys(point)) point[key] = Math.round(point[key]);
    points.push(point);
  }
  return { start: start.toISOString(), end: end.toISOString(), step: POWER_STEP / 1000, points };
}

async function buildPowerHistory(client, found, period, cfg) {
  if (!found.p1) return null;
  const { resolution } = PERIODS[period];
  const start = periodStart(period);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const until = new Date(Math.min(Date.now(), end.getTime()));
  const steps = Math.ceil((until - start) / POWER_STEP);
  const read = (device, capability) => client.getEntries(device.id, capability, resolution).catch(() => []);
  const sign = cfg.battery?.invertPower ? -1 : 1;

  const [grid, solar, battery] = await Promise.all([
    read(found.p1, 'measure_power'),
    Promise.all(found.solar.map(async panel => {
      let entries = has(panel, 'measure_power') ? await read(panel, 'measure_power') : [];
      if (!entries.length && has(panel, 'meter_power')) entries = powerFromMeter(await read(panel, 'meter_power'));
      return entries.map(e => ({ t: e.t, v: Math.abs(e.v) }));
    })),
    Promise.all(found.batteries.map(async b => (await read(b, 'measure_power')).map(e => ({ t: e.t, v: e.v * sign })))),
  ]);
  if (!grid.length) return null;
  return buildPowerCurve(start, end, until, {
    grid: averageInSteps(grid, start, steps),
    solar: solar.map(list => averageInSteps(list, start, steps, { idleZero: true })),
    battery: battery.map(list => averageInSteps(list, start, steps, { idleZero: true })),
  });
}

// `light` is for the comparison with the previous period: totals and costs only.
// `prices` is the PriceService, for the costs of a dynamic contract.
async function buildHistory(client, devices, found, period, cfg, { light = false, prices = null } = {}) {
  const { resolution } = PERIODS[period];
  const buckets = makeBuckets(period);
  const series = {};
  for (const key of ['import', 'export', 'solar', 'charge', 'discharge', 'gas', 'water', 'heating', 'ev']) {
    series[key] = buckets.map(() => 0);
  }
  const entries = (device, capability) => client.getEntries(device.id, capability, resolution);
  // Details are only read for the blocks on the dashboard, to spare Homey
  const shown = new Set(resolveLayout(cfg.layout, found, cfg).map(b => b.id));

  const start = periodStart(period);
  const contract = contractFrom(cfg);
  const tariff = await tariffFor(contract, prices, start.getTime(), periodEnd(period, start).getTime());
  const costs = {
    import: buckets.map(() => 0),
    export: buckets.map(() => 0),
    gas: buckets.map(() => 0),
    known: { import: false, export: false, gas: false },
    water: tariff.water,
    fixedPerDay: tariff.fixedPerDay,
  };

  const jobs = [];
  for (const cap of meterCapabilities(found.p1, 'import')) {
    jobs.push(entries(found.p1, cap).then(e => {
      addMeterDeltas(series.import, buckets, e);
      if (addMeterCost(costs.import, buckets, e, tariff.importPrice)) costs.known.import = true;
    }));
  }
  for (const cap of meterCapabilities(found.p1, 'export')) {
    jobs.push(entries(found.p1, cap).then(e => {
      addMeterDeltas(series.export, buckets, e);
      if (addMeterCost(costs.export, buckets, e, tariff.exportPrice, -1)) costs.known.export = true;
    }));
  }
  if (found.p1 && has(found.p1, 'meter_gas')) {
    jobs.push(entries(found.p1, 'meter_gas').then(e => {
      addMeterDeltas(series.gas, buckets, e);
      if (addMeterCost(costs.gas, buckets, e, tariff.gasPrice)) costs.known.gas = true;
    }));
  }
  for (const panel of found.solar) {
    if (has(panel, 'meter_power')) {
      jobs.push(entries(panel, 'meter_power').then(e => addMeterDeltas(series.solar, buckets, e)));
    } else if (has(panel, 'measure_power')) {
      jobs.push(entries(panel, 'measure_power').then(e => addPowerIntegral(series.solar, buckets, e)));
    }
  }
  for (const battery of found.batteries) {
    const chargeCap = batteryMeterCapability(battery, 'charge');
    const dischargeCap = batteryMeterCapability(battery, 'discharge');
    if (chargeCap && dischargeCap) {
      jobs.push(entries(battery, chargeCap).then(e => addMeterDeltas(series.charge, buckets, e)));
      jobs.push(entries(battery, dischargeCap).then(e => addMeterDeltas(series.discharge, buckets, e)));
    } else if (has(battery, 'measure_power')) {
      const sign = cfg.battery?.invertPower ? -1 : 1;
      jobs.push(entries(battery, 'measure_power').then(e => {
        addPowerIntegral(series.charge, buckets, e, sign);
        addPowerIntegral(series.discharge, buckets, e, -sign);
      }));
    }
  }

  // Electricity used by heating and EV charging: from their kWh meter, or from their power
  const addConsumer = (device, target) => {
    if (has(device, 'meter_power')) {
      jobs.push(entries(device, 'meter_power').then(e => addMeterDeltas(target, buckets, e)));
    } else if (has(device, 'measure_power')) {
      jobs.push(entries(device, 'measure_power').then(e => addPowerIntegral(target, buckets, e, 1)));
    }
  };
  found.heating.forEach(d => addConsumer(d, series.heating));
  found.evChargers.forEach(d => addConsumer(d, series.ev));
  if (found.water && has(found.water, 'meter_water')) {
    jobs.push(entries(found.water, 'meter_water').then(e => addMeterDeltas(series.water, buckets, e)));
  }

  let boilerTemperature = [];
  if (found.boiler && !light && shown.has('waterheater') && PERIODS[period].bucket === 'hour') {
    jobs.push(entries(found.boiler, 'measure_temperature')
      .then(e => { boilerTemperature = e.map(({ t, v }) => ({ t: t.toISOString(), v })); }));
  }

  let power = null;
  if (!light && shown.has('power') && PERIODS[period].bucket === 'hour') {
    jobs.push(buildPowerHistory(client, found, period, cfg).then(curve => { power = curve; }).catch(() => {}));
  }

  let deviceEnergy = [];
  if (!light && (shown.has('devices') || shown.has('sankey'))) {
    jobs.push(buildDeviceEnergy(client, devices, found, resolution).then(list => { deviceEnergy = list; }));
  }

  await Promise.all(jobs);
  return summarize(period, buckets, series, costs, {
    boilerTemperature,
    power,
    deviceEnergy,
    hasBattery: found.batteries.length > 0,
    available: {
      solar: found.solar.length > 0,
      gas: Boolean(found.p1 && has(found.p1, 'meter_gas')),
      heating: found.heating.length > 0,
      ev: found.evChargers.length > 0,
      water: Boolean(found.water),
    },
  });
}

// Standby use: the lowest power of the house last night (1:00 to 5:00), when nothing
// but always-on devices runs. Battery power is taken into account, solar is zero at night.
// `marketAverage` is today's average market price, for the yearly cost with a dynamic contract
async function buildBaseload(client, found, cfg, marketAverage = null) {
  if (!found.p1) return null;
  const grid = await client.getEntries(found.p1.id, 'measure_power', 'yesterday');
  const batteries = await Promise.all(found.batteries.map(b => client.getEntries(b.id, 'measure_power', 'yesterday')));
  const sign = cfg.battery?.invertPower ? -1 : 1;
  const batteryAt = t => batteries.reduce((sum, list) => {
    let last = null;
    for (const e of list) {
      if (e.t > t) break;
      last = e;
    }
    return sum + (last ? last.v * sign : 0);
  }, 0);

  const night = grid
    .filter(e => e.t.getHours() >= 1 && e.t.getHours() < 5)
    .map(e => e.v - batteryAt(e.t))
    .filter(v => v >= 0)
    .sort((a, b) => a - b);
  if (!night.length) return null;

  // A low percentile rather than the minimum, so one odd reading does not count
  const watts = night[Math.floor(night.length * 0.1)];
  const yearKWh = watts * 24 * 365 / 1000;
  const tariff = typicalImportPrice(contractFrom(cfg), marketAverage);
  return {
    watts,
    yearKWh,
    yearCost: typeof tariff === 'number' ? yearKWh * tariff : null,
  };
}

module.exports = {
  PERIODS,
  PREVIOUS,
  comparableTotals,
  buildBaseload,
  BLOCKS,
  SIZES,
  discover,
  defaultLayout,
  resolveLayout,
  blockCatalog,
  todayTotals,
  validateLayout,
  PinGuard,
  allocateFlows,
  liveTotals,
  buildSankey,
  buildZoneFlow,
  consumptionDevices,
  buildLive,
  buildHistory,
  buildPowerCurve,
  makeBuckets,
  periodStart,
  periodEnd,
  summarize,
  showerMinutes,
  boilerStatus,
  assumptions,
};
