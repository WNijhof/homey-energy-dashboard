'use strict';

const { contractFrom, tariffFor, hasPrices, typicalImportPrice } = require('./tariffs');
const { degreeDays, dayKey } = require('./weather');
const { peakCapabilities } = require('./peak');

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
// The value of a capability; a number that is not a real number (NaN, Infinity) counts as unknown
const value = (device, capability) => {
  const v = device?.capabilitiesObj?.[capability]?.value ?? null;
  return typeof v === 'number' && !Number.isFinite(v) ? null : v;
};
// A measured amount, or null when the app sends something that is not a number
const amount = (device, capability) => {
  const v = value(device, capability);
  return typeof v === 'number' ? v : null;
};
const isClass = (d, cls) => d.class === cls || d.virtualClass === cls;

// Apps whose devices copy the readings of other devices, such as the summaries of Power by the
// Hour (Σ): counting them would count the same use twice
const COPY_APPS = ['com.gruijter.powerhour'];
function isCopy(d) {
  const app = String(d.driverId || d.driverUri || '').match(/^homey:app:([^:]+)/)?.[1];
  return COPY_APPS.includes(app);
}

// "Exclude from Energy" in the advanced settings of a device in Homey. The Homey app keeps only
// the energy settings of a device (energySettings), the pc version the whole settings object
function isExcluded(d) {
  return (d.energySettings || d.settings || {}).energy_exclude === true;
}

// Devices the dashboard leaves out unless they are chosen in the settings
const isLeftOut = d => isCopy(d) || isExcluded(d);

// Apps that make virtual devices, such as test devices for Homey Energy: they can carry the main
// meter flag without being the real meter
const VIRTUAL_APPS = ['nl.qluster-it.DeviceCapabilities', 'com.arjankranenburg.virtual'];
const appOf = d => String(d.driverId || d.driverUri || '').match(/^homey:app:([^:]+)/)?.[1];

// The device that most looks like the P1 meter. A meter without live power (such as a water
// meter with "P1" in its name) is never chosen, and a virtual device only when nothing else fits.
function likelyP1(devices) {
  const score = d => {
    if (!has(d, 'measure_power')) return 0;
    let s = 1;
    if (d.energyObj?.cumulative) s += 4;
    if (GRID_METER_CAPABILITIES.some(c => has(d, c))) s += 3;
    if (has(d, 'meter_gas')) s += 2;
    if (phaseCapabilities(d).length) s += 2;
    if (/\bp1\b|dongle|slimme meter|smart meter/i.test(d.name || '')) s += 1;
    if (has(d, 'meter_water')) s -= 2;
    if (VIRTUAL_APPS.includes(appOf(d)) || String(d.driverId || '').startsWith('homey:virtualdriver')) s -= 6;
    return s;
  };
  const best = devices
    .map(d => ({ d, s: score(d) }))
    // Live power alone makes any plug a candidate; it needs at least one sign of a whole-house meter
    .filter(x => x.s >= 2)
    .sort((a, b) => b.s - a.s)[0];
  return best?.d || devices.find(d => d.energyObj?.cumulative);
}

// Finds the P1 meter, solar panels, home batteries and boiler, unless they are pinned in the config
function discover(devices, pinned = {}) {
  const byId = id => id && devices.find(d => d.id === id);
  // A copy of another meter, or a device excluded from Homey Energy, is only used when it is
  // chosen in the settings
  const own = devices.filter(d => !isLeftOut(d));

  const p1 = byId(pinned.p1) || likelyP1(own);

  const solar = pinned.solar?.length
    ? pinned.solar.map(byId).filter(Boolean)
    : own.filter(d => isClass(d, 'solarpanel'));

  const batteries = pinned.batteries?.length
    ? pinned.batteries.map(byId).filter(Boolean)
    : own.filter(d => d.energyObj?.homeBattery
      || (isClass(d, 'battery') && (batteryPowerCapabilities(d) || batteryMeterCapability(d, 'charge'))));

  const boiler = byId(pinned.boiler)
    || own.find(d => has(d, 'lydos_showers'))
    || own.find(d => isClass(d, 'waterheater') && has(d, 'measure_temperature'));

  // Heat pumps and central heating boilers (hybrid or all-electric)
  const heating = pinned.heating?.length
    ? pinned.heating.map(byId).filter(Boolean)
    : own.filter(d => isClass(d, 'heatpump') || isClass(d, 'boiler'));

  const thermostats = own.filter(d => isClass(d, 'thermostat') && has(d, 'measure_temperature'));
  const thermostat = byId(pinned.thermostat)
    || thermostats.find(d => /thermostaat|thermostat|nest|tado|toon|anna|honeywell|ecobee/i.test(d.name))
    || thermostats[0]
    || null;

  const evChargers = pinned.evChargers?.length
    ? pinned.evChargers.map(byId).filter(Boolean)
    : own.filter(d => isClass(d, 'evcharger') || d.energyObj?.evCharger);

  const car = byId(pinned.car)
    || own.find(d => (isClass(d, 'car') || isClass(d, 'vehicle')) && has(d, 'measure_battery'))
    || null;

  const water = byId(pinned.water)
    || own.find(d => has(d, 'meter_water') && d.id !== p1?.id)
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
  { id: 'battery', title: 'Thuisbatterij', size: 'half', available: f => f.batteries.length > 0 },
  { id: 'batteryhistory', title: 'Batterijgebruik', size: 'half', available: f => f.batteries.length > 0 },
  { id: 'tiles', title: 'Totalen', size: 'full', available: () => true },
  { id: 'prices', title: 'Stroomprijs', size: 'large', available: (f, cfg) => cfg.prices?.source !== 'off' },
  { id: 'gauges', title: 'Kengetallen', size: 'small', available: f => f.solar.length > 0 || f.batteries.length > 0 },
  { id: 'consumers', title: 'Apparaten nu', size: 'small', available: () => true },
  { id: 'electricity', title: 'Elektriciteit', size: 'large', available: () => true },
  { id: 'power', title: 'Vermogen vandaag', size: 'full', available: f => Boolean(f.p1) },
  { id: 'sankey', title: 'Energiestromen', size: 'full', available: () => true },
  { id: 'devices', title: 'Verbruik per apparaat', size: 'half', available: () => true },
  { id: 'costs', title: 'Kosten', size: 'half', available: (f, cfg) => hasPrices(contractFrom(cfg), cfg.homeyPrices) },
  { id: 'netting', title: 'Einde salderen', size: 'half', available: f => f.solar.length > 0 },
  { id: 'solar', title: 'Zonne-energie', size: 'half', available: f => f.solar.length > 0 },
  { id: 'gas', title: 'Gas', size: 'half', available: (f, cfg) => usesGas(f.p1, cfg) },
  { id: 'water', title: 'Water', size: 'half', available: f => Boolean(f.water) },
  { id: 'baseload', title: 'Sluipverbruik', size: 'small', available: f => Boolean(f.p1) },
  { id: 'alerts', title: 'Meldingen', size: 'small', available: () => true },
  { id: 'phases', title: 'Fasebelasting', size: 'small', available: f => phaseCapabilities(f.p1).length > 0 },
  { id: 'groups', title: 'Groepen', size: 'small', available: (f, cfg) => savedGroups(cfg).length > 0 },
  // The Belgian capacity tariff: shown when the meter reports its monthly peak or a tariff is set.
  // HomeWizard gives every P1 meter the capability, but a Dutch meter leaves it empty.
  { id: 'peak', title: 'Maandpiek', size: 'small', available: (f, cfg) => typeof value(f.p1, peakCapabilities(f.p1).peak) === 'number' || Number(cfg.grid?.capacityTariff) > 0 },
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
// Blocks that were merged into another one: an older layout shows the new block instead
const MERGED = { solarperf: 'solar' };
const current = layout => layout.map(b => (b && MERGED[b.id] ? { ...b, id: MERGED[b.id] } : b));

function resolveLayout(saved, found, cfg = {}) {
  if (!Array.isArray(saved) || !saved.length) return defaultLayout(found, cfg);
  saved = current(saved);
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

// Named layouts, for screens that show something else (a tablet in the kitchen, the office):
// short names of lowercase letters, digits and dashes. An empty name is the default layout.
const LAYOUT_NAME = /^[a-z0-9][a-z0-9-]{0,23}$/;
const layoutName = name => {
  const clean = String(name || '').trim().toLowerCase();
  return LAYOUT_NAME.test(clean) ? clean : '';
};
const savedLayout = (cfg, name) => (name && Array.isArray(cfg.layouts?.[name]) ? cfg.layouts[name] : cfg.layout);

// The blocks shown in any layout, so the history reads what any screen needs
function shownBlocks(cfg, found) {
  const ids = new Set(resolveLayout(cfg.layout, found, cfg).map(b => b.id));
  for (const layout of Object.values(cfg.layouts || {})) {
    resolveLayout(layout, found, cfg).forEach(b => ids.add(b.id));
  }
  return ids;
}

// Checks a layout sent by the dashboard's edit mode; null means "back to the automatic layout".
// Its errors are the sender's fault (400), not the server's.
const layoutError = message => Object.assign(new Error(message), { status: 400 });

function validateLayout(input) {
  if (input === null) return null;
  if (!Array.isArray(input) || !input.length) throw layoutError('Kies minstens één blok');
  input = current(input).filter((b, i, all) => all.findIndex(x => x?.id === b?.id) === i);
  const known = new Set(BLOCKS.map(b => b.id));
  const seen = new Set();
  const layout = [];
  for (const item of input) {
    if (!item || !known.has(item.id) || seen.has(item.id)) throw layoutError(`Onbekend blok: ${item?.id}`);
    if (!SIZES.includes(item.size)) throw layoutError(`Onbekende breedte: ${item.size}`);
    if (item.rows !== undefined && item.rows !== null && !validRows(item.rows)) throw layoutError(`Onbekende hoogte: ${item.rows}`);
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
  const matches = (device.capabilities || []).filter(c => pattern.test(c));
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
  // Enphase IQ Battery has its own kWh counters, iqbattery_charge and iqbattery_discharge
  const pattern = direction === 'charge'
    ? /^(meter_power\.(charged|charge|imported|import|in)|iqbattery_charge)$/
    : /^(meter_power\.(discharged|discharge|exported|export|out)|iqbattery_discharge)$/;
  return (device.capabilities || []).find(c => pattern.test(c)) || null;
}

// For a battery that only has kWh counters (Enphase IQ Battery), the power follows from how
// fast they rise: the average over the last two changes of each counter, while those are recent
const counterReadings = new Map();
const COUNTER_FRESH = 30 * 60 * 1000;

function counterPower(device, now = Date.now()) {
  const read = direction => {
    const cap = batteryMeterCapability(device, direction);
    const kWh = cap ? amount(device, cap) : null;
    if (kWh === null) return 0;
    const key = `${device.id}:${cap}`;
    const seen = counterReadings.get(key) || { last: null, before: null };
    if (!seen.last || seen.last.kWh !== kWh) {
      seen.before = seen.last;
      seen.last = { kWh, t: now };
      counterReadings.set(key, seen);
    }
    const { last, before } = seen;
    if (!before || now - last.t > COUNTER_FRESH || last.kWh < before.kWh) return 0;
    const hours = (last.t - before.t) / 3600000;
    return hours > 0 ? (last.kWh - before.kWh) * 1000 / hours : 0;
  };
  return read('charge') - read('discharge');
}

// Some apps report the battery power the other way round. With a charging state as well
// (Homey's battery_charging_state: charging, discharging or idle) the app learns which way
// each battery reports, and uses that before the "invert" setting. The power is read many times
// (every screen, widget and warning), so a battery gets at most one vote per 30 seconds, only
// with a clear power, and it takes a lead of 5 votes to decide: a charging state that follows the
// power a little late (some apps update it slowly) does not turn the battery round.
const powerDirection = new Map();
const VOTE_EVERY = 30 * 1000;
const VOTE_WATTS = 100;
const VOTE_MAX = 10;
const VOTE_LEAD = 5;

function learnDirection(device, watts, now = Date.now()) {
  const state = value(device, 'battery_charging_state');
  if (Math.abs(watts) < VOTE_WATTS || (state !== 'charging' && state !== 'discharging')) return;
  const seen = powerDirection.get(device.id) || { votes: 0, at: 0 };
  if (now - seen.at < VOTE_EVERY) return;
  const agrees = (watts > 0) === (state === 'charging');
  powerDirection.set(device.id, { votes: Math.max(-VOTE_MAX, Math.min(VOTE_MAX, seen.votes + (agrees ? -1 : 1))), at: now });
}

// Whether a battery's power is inverted: learned from its charging state, or the setting
function invertedPower(device, cfg = {}) {
  const votes = powerDirection.get(device.id)?.votes ?? 0;
  if (votes >= VOTE_LEAD) return true;
  if (votes <= -VOTE_LEAD) return false;
  return Boolean(cfg.invertPower);
}

// Where a battery reports its power: one measure_power (positive while charging), or, as some
// apps do (Indevolt), a separate power for charging and one for discharging, both positive
function batteryPowerCapabilities(device) {
  if (has(device, 'measure_power')) return { net: 'measure_power' };
  const find = pattern => (device.capabilities || []).find(c => pattern.test(c)) || null;
  const charge = find(/^measure_power\.(charge|charging|charged|in)$/);
  const discharge = find(/^measure_power\.(discharge|discharging|discharged|out)$/);
  return charge || discharge ? { charge, discharge } : null;
}

// Battery power in W, positive while charging and negative while discharging (Homey's convention)
function batteryPower(device, cfg) {
  const caps = batteryPowerCapabilities(device);
  let watts;
  if (!caps) {
    // Only kWh counters: the power follows from how fast they rise, always the right way round
    return batteryMeterCapability(device, 'charge') ? counterPower(device) : 0;
  }
  if (caps.net) {
    watts = amount(device, caps.net);
    if (watts === null) return 0;
  } else {
    const read = cap => (cap ? Math.abs(amount(device, cap) || 0) : 0);
    watts = read(caps.charge) - read(caps.discharge);
  }
  learnDirection(device, watts);
  return invertedPower(device, cfg) ? -watts : watts;
}

// The battery power (W, positive while charging) from Insights. With separate charge and
// discharge readings, each moment gets the last value of both.
async function batteryPowerEntries(device, read, cfg = {}) {
  const caps = batteryPowerCapabilities(device);
  if (!caps) return [];
  const sign = invertedPower(device, cfg) ? -1 : 1;
  if (caps.net) return (await read(device, caps.net)).map(e => ({ t: e.t, v: e.v * sign }));
  const [charge, discharge] = await Promise.all([caps.charge, caps.discharge].map(cap => (cap ? read(device, cap) : [])));
  const events = [
    ...charge.map(e => ({ t: e.t, charge: Math.abs(e.v) })),
    ...discharge.map(e => ({ t: e.t, discharge: Math.abs(e.v) })),
  ].sort((a, b) => a.t - b.t);
  let lastCharge = 0;
  let lastDischarge = 0;
  const out = [];
  for (const e of events) {
    if (e.charge !== undefined) lastCharge = e.charge;
    if (e.discharge !== undefined) lastDischarge = e.discharge;
    const point = { t: e.t, v: (lastCharge - lastDischarge) * sign };
    if (out.length && out[out.length - 1].t.getTime() === e.t.getTime()) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
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

// `watts` (by device id) holds the power of an earlier moment; that then replaces batteryPower(),
// which learns the direction and counter speed from the readings of now
function buildBattery(devices, cfg, watts = null) {
  if (!devices.length) return null;
  const socs = devices.map(d => amount(d, 'measure_battery')).filter(v => v !== null);
  const power = d => (watts ? watts[d.id] ?? 0 : batteryPower(d, cfg));
  return {
    names: devices.map(d => d.name),
    watts: devices.reduce((sum, d) => sum + power(d), 0),
    soc: socs.length ? socs.reduce((a, b) => a + b, 0) / socs.length : null,
    devices: devices.map(d => ({ name: d.name, soc: value(d, 'measure_battery'), watts: power(d) })),
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

// Whether the house uses gas: the P1 meter has a gas counter with a reading, and the contract
// does not say "no gas" (all-electric). Some meters pass on a gas counter that stays empty or at
// 0 in a house without gas; that does not count.
function usesGas(p1, cfg = {}) {
  if (!p1 || !has(p1, 'meter_gas')) return false;
  if (cfg.contract?.gas?.type === 'none') return false;
  const reading = value(p1, 'meter_gas');
  return typeof reading === 'number' && reading > 0;
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

// Groups in the fuse box, set in the app settings:
// [{ id, name, fuseAmps, phases: [1..3], fixedWatts, devices: [ids] }]. `phases` are the phases
// the group is on (empty when unknown; a cooking group can be on two). Groups without a name are
// left out. Older settings saved `phases` as a count (1 or 3).
const phaseList = list => [...new Set((Array.isArray(list) ? list : []).map(Number).filter(n => n >= 1 && n <= 3))].sort();

function savedGroups(cfg = {}) {
  return (Array.isArray(cfg.groups) ? cfg.groups : [])
    .filter(g => g && String(g.name || '').trim())
    .map(g => ({
      id: String(g.id || g.name),
      name: String(g.name).trim(),
      fuseAmps: Number(g.fuseAmps) > 0 ? Number(g.fuseAmps) : 16,
      phases: Number(g.phases) === 3 ? [1, 2, 3] : phaseList(g.phases),
      fixedWatts: Number(g.fixedWatts) > 0 ? Number(g.fixedWatts) : 0,
      devices: Array.isArray(g.devices) ? g.devices.map(String) : [],
    }));
}

// The phases the solar panels feed in on, for what each phase uses: all three unless set
function solarPhases(cfg = {}) {
  const list = phaseList(cfg.groupsSolarPhases);
  return list.length ? list : [1, 2, 3];
}

// The power of each group: its measured devices plus the fixed use entered for it
function groupWatts(group, byId) {
  const powered = group.devices
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(d => ({ name: d.name, watts: Math.max(0, amount(d, 'measure_power') || 0) }))
    .filter(d => d.watts > 0)
    .sort((a, b) => b.watts - a.watts);
  return { powered, watts: powered.reduce((sum, d) => sum + d.watts, 0) + group.fixedWatts };
}

// What each phase of the house uses: the meter's power on that phase (negative while exporting)
// plus the solar power fed in on it. Null for a phase the meter says nothing about.
function phaseUse(phases, solarW, cfg) {
  if (!phases?.phases?.length) return {};
  const onSolar = solarPhases(cfg);
  const out = {};
  for (const p of phases.phases) {
    const net = typeof p.watts === 'number' ? p.watts
      : typeof p.amps === 'number' ? p.amps * (p.volts || 230) : null;
    if (net === null) continue;
    out[p.phase] = Math.max(0, net + (onSolar.includes(p.phase) ? (solarW || 0) / onSolar.length : 0));
  }
  return out;
}

// The load per group as a current against its fuse, with the devices that use the most, and per
// phase what the groups on it do not explain ("Overig"): the meter measures every phase, so the
// rest is what has no measurement of its own. A group on more phases counts evenly on each.
function buildGroups(devices, cfg, { phases = null, solarW = 0 } = {}) {
  const groups = savedGroups(cfg);
  if (!groups.length) return null;
  const byId = new Map(devices.map(d => [d.id, d]));
  const list = groups.map(g => {
    const { powered, watts } = groupWatts(g, byId);
    return {
      id: g.id,
      name: g.name,
      watts: Math.round(watts),
      amps: watts / (230 * Math.max(1, g.phases.length)),
      fuseAmps: g.fuseAmps,
      phases: g.phases,
      fixedWatts: g.fixedWatts,
      devices: g.devices.length,
      on: powered.slice(0, 3),
    };
  });
  const use = phaseUse(phases, solarW, cfg);
  const perPhase = [1, 2, 3]
    .filter(n => list.some(g => g.phases.includes(n)))
    .map(n => {
      const groupsW = list.filter(g => g.phases.includes(n)).reduce((sum, g) => sum + g.watts / g.phases.length, 0);
      const total = typeof use[n] === 'number' ? use[n] : null;
      return { phase: n, watts: total === null ? null : Math.round(total), rest: total === null ? null : Math.round(Math.max(0, total - groupsW)) };
    });
  return { groups: list, phases: perPhase };
}

// The load of each group through the day in steps of 5 minutes, as a share of its fuse, from the
// Insights of its devices. Devices without readings count as 0, the fixed use always.
async function groupHistory(groups, devices, entries, start, steps) {
  const byId = new Map(devices.map(d => [d.id, d]));
  const series = new Map();
  const ids = [...new Set(groups.flatMap(g => g.devices))].filter(id => has(byId.get(id), 'measure_power'));
  await mapLimited(ids, INSIGHTS_PARALLEL, async id => {
    const list = await entries(byId.get(id), 'measure_power').catch(() => []);
    if (list.length) series.set(id, averageInSteps(list.map(e => ({ t: e.t, v: Math.max(0, e.v) })), start, steps, { idleZero: true, hold: HOLD_STEPS }));
  });
  return groups.map(g => {
    const values = [];
    for (let i = 0; i < steps; i++) {
      const watts = g.devices.reduce((sum, id) => sum + (series.get(id)?.[i] || 0), 0) + g.fixedWatts;
      values.push(Math.round(watts / (230 * Math.max(1, g.phases.length)) / g.fuseAmps * 100));
    }
    return { id: g.id, name: g.name, values };
  });
}

function buildWater(device) {
  if (!device) return null;
  return {
    name: device.name,
    flow: value(device, 'measure_water'),
    total: value(device, 'meter_water'),
  };
}

// Devices that Homey Energy counts without a power meter of their own (an estimate set on the
// device, such as lights), from its live report: [{ id, name, watts, estimated: true }].
// Meters, panels, batteries and devices that do measure are left out; those are read directly.
function estimatedDevices(report, devices, found) {
  const items = Array.isArray(report?.items) ? report.items : [];
  const byId = new Map(devices.map(d => [d.id, d]));
  const skip = new Set([found.p1?.id, ...found.solar.map(d => d.id), ...found.batteries.map(d => d.id)]);
  return items
    .filter(item => item?.type === 'device' && typeof item.values?.W === 'number' && item.values.W > 0)
    .filter(item => {
      const d = byId.get(item.id);
      return d && !skip.has(d.id) && !has(d, 'measure_power') && !isGridMeter(d)
        && !isSourceOrStore(d) && !isLeftOut(d);
    })
    .map(item => ({ id: item.id, name: byId.get(item.id).name || item.name || '?', watts: item.values.W, estimated: true }));
}

function buildLive(devices, found, cfg, { estimated = [], batteryWatts = null } = {}) {
  const gridW = found.p1 ? amount(found.p1, 'measure_power') : null;
  const solarW = found.solar.reduce((sum, d) => sum + Math.abs(amount(d, 'measure_power') || 0), 0);
  const battery = buildBattery(found.batteries, cfg.battery, batteryWatts);
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
    .filter(d => !skip.has(d.id) && !isGridMeter(d) && !isSourceOrStore(d) && !isLeftOut(d) && typeof value(d, 'measure_power') === 'number' && value(d, 'measure_power') > 0)
    .map(d => ({ id: d.id, name: d.name, watts: value(d, 'measure_power') }))
    .concat(estimated)
    .sort((a, b) => b.watts - a.watts);
  const consumers = powered.slice(0, 20);

  // The same Sankey as for a period, but with the power right now
  const liveDevices = new Set(consumptionDevices(devices, found, 'measure_power').map(d => d.id));
  const sankey = homeW === null ? null : buildSankey(
    liveTotals({ solarW, gridW, batteryW, homeW, flows }),
    powered.filter(d => d.estimated || liveDevices.has(d.id)).map(d => ({ id: d.id, name: d.name, value: d.watts, estimated: d.estimated })),
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
    groups: buildGroups(devices, cfg, { phases: buildPhases(found.p1, cfg), solarW }),
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

// Stretches of time with the energy that went into (charge) or out of (discharge) a battery,
// from its kWh counter or from its power
function meterStretches(entries, kind) {
  const out = [];
  for (let i = 1; i < entries.length; i++) {
    const kWh = entries[i].v - entries[i - 1].v;
    if (kWh > 0) out.push({ t0: entries[i - 1].t.getTime(), t1: entries[i].t.getTime(), kWh, kind });
  }
  return out;
}

function powerStretches(entries, sign) {
  const out = [];
  for (let i = 1; i < entries.length; i++) {
    const hours = (entries[i].t - entries[i - 1].t) / 3600000;
    const watts = entries[i - 1].v * sign;
    if (hours <= 0 || hours > 2 || Math.abs(watts) < 1) continue;
    out.push({ t0: entries[i - 1].t.getTime(), t1: entries[i].t.getTime(), kWh: Math.abs(watts) * hours / 1000, kind: watts > 0 ? 'charge' : 'discharge' });
  }
  return out;
}

// What the battery earned: energy it delivered is worth the price it saved (or, when it went to
// the grid, what export earned); energy it stored cost the import price, or, when it came from
// the sun, what that solar power would have earned as export. Where the energy came from or
// went to follows the flows of the bucket it falls in. Calculated with today's rules and as if
// net metering had already ended.
function batteryEarnings(stretches, buckets, rows, tariff) {
  const result = { withNetting: 0, withoutNetting: 0, charged: 0, discharged: 0, known: false };
  for (const s of stretches) {
    const idx = bucketIndex(buckets, new Date(s.t0));
    if (idx < 0) continue;
    const row = rows[idx];
    const buy = tariff.importPrice(s.t0, s.t1);
    const sellNow = tariff.exportPrice(s.t0, s.t1);
    const sellLater = tariff.exportNoNetting(s.t0, s.t1);
    if (typeof buy !== 'number' || typeof sellNow !== 'number' || typeof sellLater !== 'number') continue;
    result.known = true;
    if (s.kind === 'discharge') {
      const toGrid = row.discharge > 0 ? Math.min(1, (row.batteryToGrid || 0) / row.discharge) : 0;
      result.withNetting += s.kWh * ((1 - toGrid) * buy + toGrid * sellNow);
      result.withoutNetting += s.kWh * ((1 - toGrid) * buy + toGrid * sellLater);
      result.discharged += s.kWh;
    } else {
      const fromSun = row.charge > 0 ? Math.min(1, (row.solarToBattery || 0) / row.charge) : 0;
      result.withNetting -= s.kWh * (fromSun * sellNow + (1 - fromSun) * buy);
      result.withoutNetting -= s.kWh * (fromSun * sellLater + (1 - fromSun) * buy);
      result.charged += s.kWh;
    }
  }
  return result.known ? result : null;
}

// The use of the battery over a period: the average price of what it stored (the import price,
// or for solar power the export it did not get) and of what it delivered (the import it saved,
// or what export earned). For a day also the sessions in which it charged or discharged, so it
// shows what the battery did and why: stored the sun or cheap power, delivered at dear hours.
// Stretches only count their last 15 minutes: a meter that reports only when it changes starts
// a charge right after a long quiet stretch, not at the start of it.
const SESSION_GAP = 20 * 60000;
const STRETCH_MAX = 15 * 60000;

function batteryHistory(stretches, buckets, rows, tariff, withSessions) {
  const totals = { charge: { kWh: 0, priced: 0, value: 0 }, discharge: { kWh: 0, priced: 0, value: 0 } };
  const sessions = [];
  const sorted = stretches.map(s => ({ ...s, t0: Math.max(s.t0, s.t1 - STRETCH_MAX) })).sort((a, b) => a.t0 - b.t0);
  for (const s of sorted) {
    const idx = bucketIndex(buckets, new Date(s.t0));
    if (idx < 0) continue;
    const row = rows[idx];
    const buy = tariff.importPrice(s.t0, s.t1);
    const sell = tariff.exportPrice(s.t0, s.t1);
    // Charging: the share that came from the sun; discharging: the share that went to the grid
    const share = s.kind === 'charge'
      ? (row.charge > 0 ? Math.min(1, (row.solarToBattery || 0) / row.charge) : 0)
      : (row.discharge > 0 ? Math.min(1, (row.batteryToGrid || 0) / row.discharge) : 0);
    const price = typeof buy === 'number' && typeof sell === 'number' ? share * sell + (1 - share) * buy : null;
    const total = totals[s.kind];
    total.kWh += s.kWh;
    if (price !== null) { total.priced += s.kWh; total.value += s.kWh * price; }
    if (!withSessions) continue;
    let session = sessions[sessions.length - 1];
    if (!session || session.kind !== s.kind || s.t0 - session.end > SESSION_GAP) {
      session = { kind: s.kind, start: s.t0, end: s.t1, kWh: 0, shared: 0, priced: 0, value: 0 };
      sessions.push(session);
    }
    session.end = Math.max(session.end, s.t1);
    session.kWh += s.kWh;
    session.shared += s.kWh * share;
    if (price !== null) { session.priced += s.kWh; session.value += s.kWh * price; }
  }
  const average = t => (t.priced > 0 ? t.value / t.priced : null);
  return {
    chargePrice: average(totals.charge),
    dischargePrice: average(totals.discharge),
    sessions: withSessions ? sessions.filter(s => s.kWh >= 0.05).map(s => ({
      kind: s.kind,
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
      kWh: s.kWh,
      // From the sun (charging) or to the grid (discharging), as a fraction
      share: s.kWh > 0 ? s.shared / s.kWh : 0,
      price: s.priced > 0 ? s.value / s.priced : null,
    })) : null,
  };
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
      degreeDays: series.degreeDays ? series.degreeDays[i] : 0,
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
      row.nettingValue = costs.known.netting ? costs.netting[i] : null;
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
      .map(({ id, name, kWh, estimated }) => (estimated ? { id, name, kWh, estimated } : { id, name, kWh })),
    sankey: buildSankey(totals, deviceEnergy.map(d => ({ id: d.id, name: d.name, value: d.kWh, estimated: d.estimated }))),
  };
}

const TOTAL_KEYS = ['import', 'export', 'solar', 'charge', 'discharge', 'gas', 'water', 'heating', 'ev', 'solarUsed', 'consumption', 'degreeDays', ...FLOW_KEYS];
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
  const netted = rows.filter(r => typeof r.nettingValue === 'number');
  totals.nettingValue = netted.length ? netted.reduce((sum, r) => sum + r.nettingValue, 0) : null;
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
    // An estimate by Homey (no meter of its own) gets a ≈ before its name
    node(`device-${d.id}`, d.estimated ? `≈ ${d.name}` : d.name, 'device', 2);
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
  // Not rounded: the widget adds up the links of a node, and rounding each one first made the
  // grid there a watt off from the Energy now widget
  const link = (source, target, value) => {
    if (value >= 1) links.push({ source, target, value: Math.round(value * 1000) / 1000 });
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

// A meter for the whole house, such as a second P1 meter next to the chosen one: it measures
// everything, so it is no consumer of its own. Recognised by Homey's "main meter" flag, by gas
// and power in one device, by the separate import/export or tariff meters of a P1 meter, or by name.
const GRID_METER_CAPABILITIES = [
  'meter_power.imported', 'meter_power.exported', 'meter_power.import', 'meter_power.export',
  'meter_power.delivered', 'meter_power.returned', 'meter_power.t1', 'meter_power.t2',
  'meter_power.consumed.t1', 'meter_power.consumed.t2', 'meter_power.produced.t1', 'meter_power.produced.t2',
];
function isGridMeter(d) {
  return Boolean(d.energyObj?.cumulative)
    || (has(d, 'meter_gas') && has(d, 'measure_power'))
    || GRID_METER_CAPABILITIES.some(c => has(d, c))
    || /\bp1\b|dongle|slimme meter|smart meter/i.test(d.name || '');
}

// Solar panels and batteries are never a consumer, also when they are not the ones chosen in the
// settings: a second app for the same inverter (one to control it, one for its readings) would
// otherwise show its solar power as use
function isSourceOrStore(d) {
  return isClass(d, 'solarpanel') || isClass(d, 'battery') || Boolean(d.energyObj?.homeBattery);
}

// Devices whose energy use is shown in the Sankey chart: everything with a kWh meter
// (or a power meter for the live view) that is not a meter, panel or battery itself
function consumptionDevices(devices, found, capability = 'meter_power') {
  const skip = new Set([found.p1?.id, ...found.solar.map(d => d.id), ...found.batteries.map(d => d.id)]);
  return devices.filter(d => !skip.has(d.id) && has(d, capability) && !isGridMeter(d) && !isSourceOrStore(d) && !isLeftOut(d));
}

// Runs `fn` over the items with at most `limit` running at a time: a house with hundreds of
// metered devices would otherwise send hundreds of Insights requests to Homey at once
async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const INSIGHTS_PARALLEL = 8;

async function buildDeviceEnergy(client, devices, found, resolution) {
  const candidates = consumptionDevices(devices, found);
  return mapLimited(candidates, INSIGHTS_PARALLEL, async d => {
    const entries = await client.getEntries(d.id, 'meter_power', resolution).catch(() => []);
    let kWh = 0;
    for (let i = 1; i < entries.length; i++) {
      const delta = entries[i].v - entries[i - 1].v;
      if (delta > 0) kWh += delta;
    }
    return { id: d.id, name: d.name, kWh };
  });
}

// Devices from a Homey Energy report that the kWh meters above do not cover: devices that only
// measure power (Homey adds that up itself) and devices with an estimate set in Homey.
// The report lists them under electricity.devices.consumed as { id: { name, period (kWh) } }.
function reportDevices(report, devices, found, known) {
  const consumed = report?.electricity?.devices?.consumed;
  if (!consumed || typeof consumed !== 'object') return [];
  const byId = new Map(devices.map(d => [d.id, d]));
  const skip = new Set([found.p1?.id, ...found.solar.map(d => d.id), ...found.batteries.map(d => d.id)]);
  return Object.entries(consumed)
    .map(([id, entry]) => ({ id, entry, device: byId.get(id) }))
    .filter(({ id, entry, device }) => device && !known.has(id) && !skip.has(id) && typeof entry?.period === 'number' && entry.period > 0
      && !isGridMeter(device) && !isSourceOrStore(device) && !isLeftOut(device))
    .map(({ id, entry, device }) => ({ id, name: device.name || entry.name || '?', kWh: entry.period, estimated: !has(device, 'measure_power') }));
}

// The Homey Energy report of a period, as its API asks for it: a day, an ISO week, a month or a year
function reportRequest(period, now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const day = new Date(now);
  if (period === 'yesterday') day.setDate(day.getDate() - 1);
  if (period === 'today' || period === 'yesterday') return { kind: 'day', date: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}` };
  if (period === 'week') {
    // ISO week: the week with the Thursday of this week in it
    const thursday = new Date(now);
    thursday.setHours(0, 0, 0, 0);
    thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
    const firstThursday = new Date(thursday.getFullYear(), 0, 4);
    const week = 1 + Math.round(((thursday - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
    return { kind: 'week', isoWeek: `${thursday.getFullYear()}-W${pad(week)}` };
  }
  if (period === 'month') return { kind: 'month', yearMonth: `${now.getFullYear()}-${pad(now.getMonth() + 1)}` };
  if (period === 'year') return { kind: 'year', year: String(now.getFullYear()) };
  return null;
}

// ---------- Power through the day ----------

const POWER_STEP = 5 * 60 * 1000;

// The average of a power series (W) in each step; a step without readings keeps the last value
// for a while, so a meter that only reports changes still gives a line. After that the step is
// unknown (null). With `idleZero`, a device that was (nearly) idle stays at 0 while it is quiet,
// also before its first reading, as panels at night or a resting battery often log nothing.
// `hold` is the number of steps a value is kept.
function averageInSteps(entries, start, steps, { idleZero = false, hold = 6 } = {}) {
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
    out.push(idle ? 0 : i - lastAt <= hold ? last : null);
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

// Grid power (W, positive when taking from the grid) of the P1 meter: its power readings, or,
// when those are not in Insights, the increase of its import minus export counters
async function gridPower(p1, read) {
  const measured = await read(p1, 'measure_power');
  if (measured.length) return measured;
  const byTime = new Map();
  const add = (list, sign) => {
    for (const e of powerFromMeter(list)) byTime.set(e.t.getTime(), (byTime.get(e.t.getTime()) || 0) + sign * e.v);
  };
  for (const cap of meterCapabilities(p1, 'import')) add(await read(p1, cap), 1);
  for (const cap of meterCapabilities(p1, 'export')) add(await read(p1, cap), -1);
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t: new Date(t), v }));
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

  const [grid, solar, battery] = await Promise.all([
    gridPower(found.p1, read),
    Promise.all(found.solar.map(async panel => {
      let entries = has(panel, 'measure_power') ? await read(panel, 'measure_power') : [];
      if (!entries.length && has(panel, 'meter_power')) entries = powerFromMeter(await read(panel, 'meter_power'));
      return entries.map(e => ({ t: e.t, v: Math.abs(e.v) }));
    })),
    Promise.all(found.batteries.map(b => batteryPowerEntries(b, read, cfg.battery))),
  ]);
  if (!grid.length) return null;
  return buildPowerCurve(start, end, until, {
    grid: averageInSteps(grid, start, steps),
    solar: solar.map(list => averageInSteps(list, start, steps, { idleZero: true })),
    battery: battery.map(list => averageInSteps(list, start, steps, { idleZero: true })),
  });
}

// ---------- Looking back ----------

// The dashboard can show an earlier moment of today or yesterday: every device as it was then,
// from Insights in the same steps of 5 minutes as the power chart. A power is the average over
// the step; other readings (temperature, charge level, counters, on/off) the last value before
// the end of the step. Many apps only log a change, so a power is kept for up to 6 hours and
// other readings for the rest of the day. Texts such as a mode are not kept in Insights; they
// are unknown then. Devices with only an estimate from Homey Energy have no history.
const TIMELINE_DAYS = ['today', 'yesterday'];
const HOLD_STEPS = 6 * 12;
const AVERAGED = /^measure_(power|current|water)\b/;

// The day of a moment that can be looked back at, or null
function timelineDay(at, now = new Date()) {
  const t = new Date(at);
  if (!Number.isFinite(t.getTime()) || t > now) return null;
  return TIMELINE_DAYS.find(day => t >= periodStart(day, now)) || null;
}

// The last reading before the end of each step, also on/off (true or false)
function lastInSteps(entries, start, steps) {
  const out = new Array(steps).fill(null);
  let j = 0;
  let last = null;
  for (let i = 0; i < steps; i++) {
    const end = start.getTime() + (i + 1) * POWER_STEP;
    while (j < entries.length && entries[j].t < end) last = entries[j++].v;
    out[i] = last;
  }
  return out;
}

// Battery power (W, positive while charging) from Insights, also for a battery with only kWh
// counters, from how fast they rise
async function batteryPowerHistory(device, read, cfg) {
  const entries = await batteryPowerEntries(device, read, cfg);
  if (entries.length || !batteryMeterCapability(device, 'charge')) return entries;
  const byTime = new Map();
  for (const [direction, sign] of [['charge', 1], ['discharge', -1]]) {
    const cap = batteryMeterCapability(device, direction);
    for (const e of cap ? powerFromMeter(await read(device, cap)) : []) {
      byTime.set(e.t.getTime(), (byTime.get(e.t.getTime()) || 0) + sign * e.v);
    }
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t: new Date(t), v }));
}

// Reads a day of Insights for every device the live dashboard reads: what the meter, panels,
// batteries, boiler, heating, charger and water meter logged, and the power of all other devices.
// `readInsights(device, capability)` gives the entries of the day ([] without a log).
async function recordTimeline(readInsights, devices, found, cfg, day, now = new Date()) {
  // Readings with a broken time or value are left out, and the rest put in order of time:
  // an app that logs something odd should not cost the whole day
  const usable = e => e && Number.isFinite(e.t?.getTime?.()) && (typeof e.v === 'boolean' || Number.isFinite(e.v));
  const read = async (device, capability) => (await readInsights(device, capability)).filter(usable).sort((a, b) => a.t - b.t);
  const start = periodStart(day, now);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const steps = Math.max(1, Math.ceil((Math.min(now.getTime(), end.getTime()) - start) / POWER_STEP));
  const values = {};
  const put = (device, capability, list) => { (values[device.id] ||= {})[capability] = list; };
  const record = (device, capability) => async () => {
    const entries = await read(device, capability);
    if (entries.length) put(device, capability, AVERAGED.test(capability) ? averageInSteps(entries, start, steps, { hold: HOLD_STEPS }) : lastInSteps(entries, start, steps));
  };

  const batteryWatts = {};
  const tasks = [];
  // The meter's power as in the power chart, also when it only logs its kWh counters
  if (found.p1) {
    tasks.push(async () => {
      const grid = await gridPower(found.p1, read);
      if (grid.length) put(found.p1, 'measure_power', averageInSteps(grid, start, steps));
    });
    tasks.push(...[...phaseCapabilities(found.p1), 'meter_gas'].filter(c => has(found.p1, c)).map(c => record(found.p1, c)));
  }
  for (const panel of found.solar) {
    tasks.push(async () => {
      let entries = has(panel, 'measure_power') ? await read(panel, 'measure_power') : [];
      if (!entries.length && has(panel, 'meter_power')) entries = powerFromMeter(await read(panel, 'meter_power'));
      if (entries.length) put(panel, 'measure_power', averageInSteps(entries.map(e => ({ t: e.t, v: Math.abs(e.v) })), start, steps, { idleZero: true, hold: HOLD_STEPS }));
    });
  }
  for (const battery of found.batteries) {
    tasks.push(record(battery, 'measure_battery'));
    tasks.push(async () => {
      batteryWatts[battery.id] = averageInSteps(await batteryPowerHistory(battery, read, cfg.battery), start, steps, { idleZero: true, hold: HOLD_STEPS });
    });
  }
  // Boiler, heating, charger, car and water meter: every reading, except texts such as a mode
  // (Insights keeps numbers and on/off only)
  const others = [found.boiler, ...found.heating, found.thermostat, ...found.evChargers, found.car, found.water].filter(Boolean);
  for (const d of new Map(others.map(x => [x.id, x])).values()) {
    tasks.push(...(d.capabilities || []).filter(c => typeof value(d, c) !== 'string').map(c => record(d, c)));
  }
  // The power of all other devices, for Devices now and the Sankey
  const done = new Set([found.p1, ...found.solar, ...found.batteries, ...others].filter(Boolean).map(d => d.id));
  tasks.push(...devices.filter(d => !done.has(d.id) && has(d, 'measure_power') && !isGridMeter(d) && !isSourceOrStore(d) && !isLeftOut(d)).map(d => record(d, 'measure_power')));

  // A device whose Insights fail is left out; the others still show
  await mapLimited(tasks, INSIGHTS_PARALLEL, task => task().catch(() => {}));
  return { day, start: start.toISOString(), steps, values, batteryWatts };
}

// The devices as they were in one step of a recording: copies with the values of then, and null
// for what was not recorded. On/off logged as 1 and 0 becomes true and false again.
function devicesAt(recording, devices, step) {
  return devices.map(d => {
    const recorded = recording.values[d.id] || {};
    const capabilitiesObj = {};
    for (const [capability, cap] of Object.entries(d.capabilitiesObj || {})) {
      let v = recorded[capability]?.[step] ?? null;
      if (typeof cap?.value === 'boolean' && typeof v === 'number') v = v > 0;
      capabilitiesObj[capability] = { ...cap, value: v };
    }
    return { ...d, capabilitiesObj };
  });
}

// The same devices found, but as the copies of devicesAt()
function foundAmong(found, copies) {
  const byId = new Map(copies.map(d => [d.id, d]));
  const swap = d => (d ? byId.get(d.id) || d : d);
  return Object.fromEntries(Object.entries(found).map(([key, v]) => [key, Array.isArray(v) ? v.map(swap) : swap(v)]));
}

// Energy (kWh) of the day up to and including a step, from the power chart, in the shape of todayTotals()
function totalsUntil(power, step) {
  const sum = { solar: 0, import: 0, export: 0, consumption: 0, charge: 0, discharge: 0 };
  const hours = (power?.step || POWER_STEP / 1000) / 3600;
  for (const p of (power?.points || []).slice(0, step + 1)) {
    if (!p) continue;
    sum.solar += p.solar * hours / 1000;
    sum.import += (p.gridToHome + p.gridToBattery) * hours / 1000;
    sum.export += (p.solarToGrid + p.batteryToGrid) * hours / 1000;
    sum.consumption += p.home * hours / 1000;
    sum.charge += (p.solarToBattery + p.gridToBattery) * hours / 1000;
    sum.discharge += (p.batteryToHome + p.batteryToGrid) * hours / 1000;
  }
  return sum;
}

// The live dashboard at moment `at`, from a recording of its day; null when that step is not in it.
// `power` is the day's power chart, for the kWh of the day up to then.
function buildLiveAt(recording, devices, found, cfg, at, power = null) {
  const step = Math.floor((new Date(at) - Date.parse(recording.start)) / POWER_STEP);
  if (!(step >= 0 && step < recording.steps)) return null;
  const copies = devicesAt(recording, devices, step);
  const batteryWatts = Object.fromEntries(Object.entries(recording.batteryWatts).map(([id, list]) => [id, list[step] ?? 0]));
  const live = buildLive(copies, foundAmong(found, copies), cfg, { batteryWatts });
  live.at = new Date(Date.parse(recording.start) + step * POWER_STEP).toISOString();
  live.updated = live.at;
  live.today = power?.points?.length ? totalsUntil(power, step) : null;
  return live;
}

// `light` is for the comparison with the previous period: totals and costs only.
// `prices` is the PriceService, for the costs of a dynamic contract.
// Degree days per bucket from the mean temperature per day; today only for the part that has
// passed, like its gas use
function degreeDayBuckets(period, buckets, temps, now = new Date()) {
  const out = buckets.map(() => 0);
  const hourly = PERIODS[period].bucket === 'hour';
  for (const [key, temp] of Object.entries(temps)) {
    const day = new Date(`${key}T00:00:00`);
    const dd = degreeDays(temp, day);
    if (!dd) continue;
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const passed = Math.max(0, Math.min(1, (Math.min(now, next) - day) / (next - day)));
    if (hourly) {
      buckets.forEach((b, i) => {
        if (b.start >= day && b.start < next && b.start < now) out[i] += dd / 24;
      });
    } else {
      const idx = bucketIndex(buckets, day);
      if (idx >= 0) out[idx] += dd * passed;
    }
  }
  return out;
}

async function buildHistory(client, devices, found, period, cfg, { light = false, prices = null, weather = null, location = null } = {}) {
  const { resolution } = PERIODS[period];
  const buckets = makeBuckets(period);
  const series = {};
  for (const key of ['import', 'export', 'solar', 'charge', 'discharge', 'gas', 'water', 'heating', 'ev']) {
    series[key] = buckets.map(() => 0);
  }
  const entries = (device, capability) => client.getEntries(device.id, capability, resolution);
  // Details are only read for the blocks on the dashboard, to spare Homey
  const shown = shownBlocks(cfg, found);

  const start = periodStart(period);
  const contract = contractFrom(cfg);
  const tariff = await tariffFor(contract, prices, start.getTime(), periodEnd(period, start).getTime());
  // Degree days, to compare gas use between periods regardless of the weather
  const gas = usesGas(found.p1, cfg);
  if (weather && location && gas) {
    const temps = await weather.temperatures(location, start, periodEnd(period, start)).catch(() => ({}));
    series.degreeDays = degreeDayBuckets(period, buckets, temps);
  }
  const costs = {
    import: buckets.map(() => 0),
    export: buckets.map(() => 0),
    gas: buckets.map(() => 0),
    netting: buckets.map(() => 0),
    known: { import: false, export: false, gas: false, netting: false },
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
      // What net metering is worth: the price you avoid minus what export earns without it
      const nettingValue = (t0, t1) => {
        const withNetting = tariff.importPrice(t0, t1);
        const without = tariff.exportNoNetting(t0, t1);
        return typeof withNetting === 'number' && typeof without === 'number' ? withNetting - without : null;
      };
      if (addMeterCost(costs.netting, buckets, e, nettingValue)) costs.known.netting = true;
    }));
  }
  if (gas) {
    jobs.push(entries(found.p1, 'meter_gas').then(e => {
      addMeterDeltas(series.gas, buckets, e);
      if (addMeterCost(costs.gas, buckets, e, tariff.gasPrice)) costs.known.gas = true;
    }));
  }
  // Solar per panel or inverter, summed; the kWh of each is kept for the solar performance block
  const solarDevices = [];
  for (const panel of found.solar) {
    const own = buckets.map(() => 0);
    const add = () => {
      own.forEach((v, i) => { series.solar[i] += v; });
      solarDevices.push({ name: panel.name, kWh: own.reduce((a, b) => a + b, 0) });
    };
    if (has(panel, 'meter_power')) {
      jobs.push(entries(panel, 'meter_power').then(e => { addMeterDeltas(own, buckets, e); add(); }));
    } else if (has(panel, 'measure_power')) {
      jobs.push(entries(panel, 'measure_power').then(e => { addPowerIntegral(own, buckets, e); add(); }));
    }
  }
  // Battery energy per stretch of time is kept for its earnings, when that block is shown
  const batteryStretches = !light && (shown.has('battery') || shown.has('batteryhistory')) ? [] : null;
  for (const battery of found.batteries) {
    const chargeCap = batteryMeterCapability(battery, 'charge');
    const dischargeCap = batteryMeterCapability(battery, 'discharge');
    if (chargeCap && dischargeCap) {
      jobs.push(entries(battery, chargeCap).then(e => {
        addMeterDeltas(series.charge, buckets, e);
        batteryStretches?.push(...meterStretches(e, 'charge'));
      }));
      jobs.push(entries(battery, dischargeCap).then(e => {
        addMeterDeltas(series.discharge, buckets, e);
        batteryStretches?.push(...meterStretches(e, 'discharge'));
      }));
    } else if (batteryPowerCapabilities(battery)) {
      jobs.push(batteryPowerEntries(battery, entries, cfg.battery).then(e => {
        addPowerIntegral(series.charge, buckets, e, 1);
        addPowerIntegral(series.discharge, buckets, e, -1);
        batteryStretches?.push(...powerStretches(e, 1));
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

  // Charge level of the home batteries through the day, in steps of 5 minutes (their average)
  let batterySoc = null;
  const withSoc = found.batteries.filter(b => has(b, 'measure_battery'));
  if (withSoc.length && !light && shown.has('battery') && PERIODS[period].bucket === 'hour') {
    const until = Math.min(Date.now(), periodEnd(period, start).getTime());
    const steps = Math.max(0, Math.ceil((until - start.getTime()) / POWER_STEP));
    jobs.push(Promise.all(withSoc.map(b => entries(b, 'measure_battery').catch(() => []))).then(lists => {
      const series = lists.filter(l => l.length).map(l => averageInSteps(l, start, steps));
      if (!series.length) return;
      const values = [];
      for (let i = 0; i < steps; i++) {
        const known = series.map(s => s[i]).filter(v => typeof v === 'number');
        values.push(known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length * 10) / 10 : null);
      }
      batterySoc = { start: start.toISOString(), step: POWER_STEP / 1000, values };
    }));
  }

  // Current (or else power) per phase through the day, in steps of 5 minutes
  let phaseHistory = null;
  const phaseCaps = phaseCapabilities(found.p1);
  if (phaseCaps.length && !light && shown.has('phases') && PERIODS[period].bucket === 'hour') {
    const kind = phaseCaps.some(c => c.startsWith('measure_current.')) ? 'current' : phaseCaps.some(c => c.startsWith('measure_power.')) ? 'power' : null;
    if (kind) {
      const until = Math.min(Date.now(), periodEnd(period, start).getTime());
      const steps = Math.max(0, Math.ceil((until - start.getTime()) / POWER_STEP));
      jobs.push(Promise.all([1, 2, 3].map(async n => {
        const cap = phaseCaps.find(c => c.startsWith(`measure_${kind}.`) && c.endsWith(String(n)));
        if (!cap) return null;
        const list = await entries(found.p1, cap).catch(() => []);
        if (!list.length) return null;
        const values = averageInSteps(list, start, steps).map(v => (typeof v === 'number' ? Math.round(v * 10) / 10 : null));
        return { phase: n, values };
      })).then(phases => {
        const known = phases.filter(Boolean);
        if (known.length) phaseHistory = { start: start.toISOString(), step: POWER_STEP / 1000, unit: kind === 'current' ? 'A' : 'W', phases: known };
      }));
    }
  }

  // The load of each group in the fuse box through the day
  let groupLoad = null;
  const groups = savedGroups(cfg);
  if (groups.length && !light && shown.has('groups') && PERIODS[period].bucket === 'hour') {
    const until = Math.min(Date.now(), periodEnd(period, start).getTime());
    const steps = Math.max(0, Math.ceil((until - start.getTime()) / POWER_STEP));
    jobs.push(groupHistory(groups, devices, entries, start, steps).then(list => {
      groupLoad = { start: start.toISOString(), step: POWER_STEP / 1000, groups: list };
    }).catch(() => {}));
  }

  let power = null;
  if (!light && shown.has('power') && PERIODS[period].bucket === 'hour') {
    jobs.push(buildPowerHistory(client, found, period, cfg).then(curve => { power = curve; }).catch(() => {}));
  }

  let deviceEnergy = [];
  if (!light && (shown.has('devices') || shown.has('sankey'))) {
    const request = client.energyReport ? reportRequest(period) : null;
    jobs.push(Promise.all([
      buildDeviceEnergy(client, devices, found, resolution),
      request ? client.energyReport(request).catch(() => null) : null,
    ]).then(([list, report]) => {
      const known = new Set(list.filter(d => d.kWh > 0).map(d => d.id));
      deviceEnergy = [...list.filter(d => d.kWh > 0), ...reportDevices(report, devices, found, known)];
    }));
  }

  await Promise.all(jobs);
  const summary = summarize(period, buckets, series, costs, {
    boilerTemperature,
    batterySoc,
    phaseHistory,
    groupLoad,
    power,
    deviceEnergy,
    hasBattery: found.batteries.length > 0,
    available: {
      solar: found.solar.length > 0,
      gas,
      heating: found.heating.length > 0,
      ev: found.evChargers.length > 0,
      water: Boolean(found.water),
    },
  });
  if (batteryStretches?.length) {
    summary.batteryEarnings = batteryEarnings(batteryStretches, buckets, summary.rows, tariff);
    if (shown.has('batteryhistory')) summary.batteryHistory = batteryHistory(batteryStretches, buckets, summary.rows, tariff, PERIODS[period].bucket === 'hour');
  }
  if (!light && shown.has('solar')) summary.solarDevices = solarDevices.sort((a, b) => b.kWh - a.kWh);
  return summary;
}

// Expected solar kWh per bucket from the forecast log, for the days of a period that are in it
function expectedSolar(period, buckets, log) {
  if (!log || !Object.keys(log).length) return null;
  const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const kind = PERIODS[period].bucket;
  const values = buckets.map(b => {
    if (kind === 'hour') return null;
    const end = new Date(b.start);
    if (kind === 'day') end.setDate(end.getDate() + 1);
    else end.setMonth(end.getMonth() + 1);
    let sum = 0;
    let known = false;
    for (let d = new Date(b.start); d < end && d <= new Date(); d.setDate(d.getDate() + 1)) {
      if (typeof log[key(d)] === 'number') { sum += log[key(d)]; known = true; }
    }
    return known ? sum : null;
  });
  const today = log[key(new Date(buckets[0].start))];
  return { perBucket: values, day: kind === 'hour' ? (today ?? null) : null };
}

// A period as CSV, for a spreadsheet: Dutch uses ; and a decimal comma, English , and a point
const CSV_COLUMNS = [
  ['start', 'Begin', 'Start'],
  ['consumption', 'Verbruik (kWh)', 'Consumption (kWh)'],
  ['import', 'Van het net (kWh)', 'From grid (kWh)'],
  ['export', 'Teruggeleverd (kWh)', 'Exported (kWh)'],
  ['solar', 'Zon opgewekt (kWh)', 'Solar produced (kWh)'],
  ['solarToHome', 'Zelfverbruik zon (kWh)', 'Solar self-consumption (kWh)'],
  ['charge', 'Batterij geladen (kWh)', 'Battery charged (kWh)'],
  ['discharge', 'Batterij ontladen (kWh)', 'Battery discharged (kWh)'],
  ['gas', 'Gas (m³)', 'Gas (m³)'],
  ['water', 'Water (L)', 'Water (L)'],
  ['degreeDays', 'Graaddagen', 'Degree days'],
  ['costImport', 'Kosten afname (€)', 'Import cost (€)'],
  ['costExport', 'Teruglevering (€)', 'Export (€)'],
  ['costGas', 'Kosten gas (€)', 'Gas cost (€)'],
  ['costWater', 'Kosten water (€)', 'Water cost (€)'],
  ['costFixed', 'Vaste kosten (€)', 'Fixed costs (€)'],
];

function historyCsv(history, lang = 'nl') {
  const dutch = lang === 'nl';
  const sep = dutch ? ';' : ',';
  const number = v => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '';
    const text = String(Math.round(v * 10000) / 10000);
    return dutch ? text.replace('.', ',') : text;
  };
  const date = iso => {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const header = CSV_COLUMNS.map(c => (dutch ? c[1] : c[2])).join(sep);
  const lines = history.rows.map(row => CSV_COLUMNS.map(([key]) => (key === 'start' ? date(row.start) : number(row[key]))).join(sep));
  // A byte order mark, so Excel reads € and ³ correctly
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

// What the end of net metering (1 January 2027) costs, from a year of history: the value of
// net metering over the exported energy, for the part that is netted against import (export
// beyond the year's import was never netted). `basis` says which year the numbers come from.
function nettingSummary(history, basis) {
  const t = history?.totals;
  if (!t || !(t.export > 0)) return { basis, export: t?.export || 0, extra: null };
  const nettedShare = Math.min(1, (t.import || 0) / t.export);
  const monthsMeasured = history.rows.filter(r => (r.import || 0) + (r.export || 0) > 0).length;
  return {
    basis,
    months: monthsMeasured,
    import: t.import,
    export: t.export,
    netted: t.export * nettedShare,
    extra: typeof t.nettingValue === 'number' ? t.nettingValue * nettedShare : null,
    // What each exported kWh used by the house itself instead saves once netting has ended
    perKWh: typeof t.nettingValue === 'number' ? t.nettingValue / t.export : null,
  };
}

// Standby use: the lowest power of the house last night (1:00 to 5:00), when nothing
// but always-on devices runs. Battery power is taken into account, solar is zero at night.
// `marketAverage` is today's average market price, for the yearly cost with a dynamic contract;
// `homey` the prices of Homey Energy, for a contract left open in the app
async function buildBaseload(client, found, cfg, marketAverage = null, homey = null) {
  if (!found.p1) return null;
  const read = (device, capability) => client.getEntries(device.id, capability, 'yesterday').catch(() => []);
  const grid = await gridPower(found.p1, read);
  const batteries = await Promise.all(found.batteries.map(b => batteryPowerEntries(b, read, cfg.battery)));
  const batteryAt = t => batteries.reduce((sum, list) => {
    let last = null;
    for (const e of list) {
      if (e.t > t) break;
      last = e;
    }
    return sum + (last ? last.v : 0);
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
  const tariff = typicalImportPrice(contractFrom(cfg), marketAverage, homey);
  return {
    watts,
    yearKWh,
    yearCost: typeof tariff === 'number' ? yearKWh * tariff : null,
  };
}

module.exports = {
  isCopy,
  isExcluded,
  isLeftOut,
  degreeDayBuckets,
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
  savedGroups,
  buildGroups,
  buildPhases,
  todayTotals,
  validateLayout,
  layoutName,
  savedLayout,
  shownBlocks,
  PinGuard,
  allocateFlows,
  liveTotals,
  buildSankey,
  buildZoneFlow,
  consumptionDevices,
  isGridMeter,
  estimatedDevices,
  reportRequest,
  batteryPowerEntries,
  batteryPower,
  gridPower,
  buildLive,
  timelineDay,
  recordTimeline,
  buildLiveAt,
  totalsUntil,
  POWER_STEP,
  buildHistory,
  nettingSummary,
  expectedSolar,
  historyCsv,
  buildPowerCurve,
  makeBuckets,
  periodStart,
  periodEnd,
  summarize,
  showerMinutes,
  boilerStatus,
  assumptions,
};
