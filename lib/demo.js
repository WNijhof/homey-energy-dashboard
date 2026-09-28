'use strict';

const { TAX_REDUCTION, ENERGY_TAX } = require('./tariffs');
const { PERIODS, makeBuckets, summarize, allocateFlows, buildPowerCurve, showerMinutes, boilerStatus, assumptions, resolveLayout, buildSankey, liveTotals } = require('./energy');

// Fake but plausible data, so the dashboard can be tried without a Homey connection

const SOLAR_PEAK_W = 4200;
const BATTERY_KWH = 2.88;
const BATTERY_MAX_W = 2400;

function solarPower(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  const daylight = Math.sin(Math.PI * (hour - 7) / 13);
  const clouds = 0.75 + 0.25 * Math.sin(date.getTime() / 900000);
  return daylight > 0 ? SOLAR_PEAK_W * daylight ** 1.5 * clouds : 0;
}

function housePower(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  let watts = 280;
  if (hour >= 7 && hour < 8.5) watts += 900;
  if (hour >= 17.5 && hour < 19.5) watts += 1600;
  if (hour >= 19.5 && hour < 23) watts += 450;
  return watts + 120 * Math.sin(date.getTime() / 170000);
}

function boilerTemperature(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  // Heats up in the afternoon on solar, cools down after the evening shower
  if (hour < 7) return 55 - hour * 0.3;
  if (hour < 7.5) return 53 - (hour - 7) * 28;
  if (hour < 12) return 39 + (hour - 7.5) * 0.4;
  if (hour < 15) return 41 + (hour - 12) * 5.5;
  if (hour < 20) return 57.5 - (hour - 15) * 0.2;
  if (hour < 20.5) return 56.5 - (hour - 20) * 20;
  return 46.5 + (hour - 20.5) * 2.5;
}

// The demo has every kind of device, so every block has something to show
const DEMO_FOUND = {
  p1: { capabilities: ['meter_gas', 'measure_current.l1', 'measure_current.l2', 'measure_current.l3'] },
  water: {},
  solar: [{}],
  batteries: [{}],
  boiler: {},
  heating: [{}],
  thermostat: {},
  evChargers: [{}],
};

// Hybrid heat pump: runs most in the morning and evening
function heatPumpPower(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 6 && hour < 9) return 900;
  if (hour >= 16 && hour < 22) return 650;
  return 180;
}

// EV charges on solar around noon and in the evening
function evPower(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 11 && hour < 14) return 3700;
  if (hour >= 21 && hour < 23) return 7400;
  return 0;
}

// Water use in liters per minute: showers in the morning, cooking and dishes in the evening
function waterFlow(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 7 && hour < 7.3) return 8;
  if (hour >= 7.5 && hour < 7.7) return 8;
  if (hour >= 18 && hour < 18.5) return 2;
  if (hour >= 20 && hour < 20.2) return 9;
  return hour >= 7 && hour < 23 ? 0.15 : 0;
}

// Simulates a day in 10-minute steps: the battery stores solar surplus and covers the evening
function simulateDay(dayStart, until, dayFactor = 1) {
  const steps = [];
  let soc = 0.15;
  for (let m = 0; m < 24 * 60; m += 10) {
    const t = new Date(dayStart.getTime() + m * 60000);
    if (t > until) break;
    const sun = solarPower(t) * dayFactor;
    const heating = heatPumpPower(t);
    const ev = evPower(t);
    const house = housePower(t) + heating + ev;
    const surplus = sun - house;
    const hours = 10 / 60;
    let battery = 0; // positive = charging
    if (surplus > 0 && soc < 1) {
      battery = Math.min(surplus, BATTERY_MAX_W, (1 - soc) * BATTERY_KWH * 1000 / hours);
    } else if (surplus < 0 && soc > 0.1) {
      battery = -Math.min(-surplus, 800, (soc - 0.1) * BATTERY_KWH * 1000 / hours);
    }
    soc += battery * hours / 1000 / BATTERY_KWH;
    steps.push({ t, sun, house, heating, ev, battery, grid: house - sun + battery, soc });
  }
  return steps;
}

function live(cfg) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const current = simulateDay(dayStart, now).pop();
  const temperature = Math.round(boilerTemperature(now) * 10) / 10;
  const hour = now.getHours();
  const gridW = Math.round(current.grid);
  const solarW = Math.round(current.sun);
  const batteryW = Math.round(current.battery);

  const homeW = Math.round(current.house);
  const flows = allocateFlows({
    solar: solarW,
    imported: Math.max(0, gridW),
    exported: Math.max(0, -gridW),
    charge: Math.max(0, batteryW),
    discharge: Math.max(0, -batteryW),
  });
  const consumers = [
    { id: 'd1', name: 'Wasmachine', watts: hour >= 10 && hour < 12 ? 1850 : 0 },
    { id: 'd2', name: 'Koelkast', watts: 85 },
    { id: 'd3', name: 'TV woonkamer', watts: hour >= 19 ? 95 : 0 },
    { id: 'd4', name: 'Netwerkkast', watts: 42 },
    { id: 'd5', name: 'Vaatwasser', watts: hour >= 20 && hour < 22 ? 1200 : 0 },
    { id: 'd6', name: 'Hybride warmtepomp', watts: Math.round(current.heating) },
    { id: 'd7', name: 'Laadpaal oprit', watts: Math.round(current.ev) },
  ].filter(d => d.watts > 0).sort((a, b) => b.watts - a.watts);

  return {
    demo: true,
    gridW,
    solarW,
    homeW,
    battery: { names: ['Zendure SolarFlow 2400 AC'], watts: batteryW, soc: Math.round(current.soc * 100) },
    flows,
    gasM3: 4821.337,
    consumers,
    sankey: buildSankey(
      liveTotals({ solarW, gridW, batteryW, homeW, flows }),
      consumers.map(d => ({ id: d.id, name: d.name, value: d.watts })),
    ),
    devices: {
      p1: 'Slimme meter (demo)',
      solar: ['Omvormer (demo)'],
      batteries: ['Zendure SolarFlow 2400 AC (demo)'],
      boiler: 'Lydos Hybrid (demo)',
      heating: ['Hybride warmtepomp (demo)'],
      thermostat: 'Thermostaat woonkamer (demo)',
      evChargers: ['Laadpaal oprit (demo)'],
    },
    heating: {
      devices: [{ name: 'Hybride warmtepomp', watts: Math.round(current.heating), mode: 'Warmtepomp', on: true, temperature: 38 }],
      thermostat: { name: 'Thermostaat woonkamer', temperature: 20.4, target: 20.5, mode: 'Verwarmen' },
    },
    ev: {
      chargers: [{
        name: 'Laadpaal oprit',
        watts: Math.round(current.ev),
        state: current.ev > 0 ? 'Laden' : 'Aangesloten',
        charging: current.ev > 0,
        soc: null,
      }],
      car: { name: 'Auto', soc: 64 },
    },
    layout: resolveLayout(cfg.layout, DEMO_FOUND, cfg),
    water: { name: 'Watermeter', flow: waterFlow(now), total: 612.384 },
    phases: {
      fuseAmps: cfg.grid?.fuseAmps || 25,
      phases: [
        { phase: 1, amps: Math.max(0.4, current.grid) / 230 / 3 + 1.8, watts: null, volts: 231 },
        { phase: 2, amps: Math.max(0.3, current.grid) / 230 / 3 + 0.6, watts: null, volts: 229 },
        { phase: 3, amps: Math.max(0.2, current.grid) / 230 / 3 + current.heating / 230, watts: null, volts: 232 },
      ].map(p => ({ ...p, amps: Math.round(p.amps * 10) / 10 })),
    },
    baseload: {
      watts: 186,
      yearKWh: 186 * 24 * 365 / 1000,
      yearCost: 186 * 24 * 365 / 1000 * 0.27,
    },
    boiler: {
      name: 'Lydos Hybrid',
      available: true,
      temperature,
      target: 55,
      heating: temperature < 53,
      on: true,
      mode: 'i-Memory',
      showers: Math.max(0, Math.round((temperature - 40) / 4)),
      minutes: showerMinutes(temperature, cfg.boiler),
      status: boilerStatus(temperature, cfg.boiler),
      assumptions: assumptions(cfg.boiler),
    },
    updated: now.toISOString(),
  };
}

// Share of the house consumption per demo device
const DEMO_DEVICES = [
  { id: 'ev', name: 'Laadpaal oprit', share: 0.3 },
  { id: 'hp', name: 'Hybride warmtepomp', share: 0.14 },
  { id: 'wp', name: 'Lydos Hybrid', share: 0.09 },
  { id: 'wm', name: 'Wasmachine', share: 0.04 },
  { id: 'dr', name: 'Droger', share: 0.05 },
  { id: 'kk', name: 'Koelkast', share: 0.05 },
  { id: 'vw', name: 'Vaatwasser', share: 0.04 },
  { id: 'ov', name: 'Oven', share: 0.03 },
  { id: 'tv', name: 'TV', share: 0.03 },
  { id: 'nw', name: 'Netwerkkast', share: 0.02 },
  { id: 'pc', name: 'Computer', share: 0.03 },
];

// Demo market price per kWh incl. VAT: cheap at night and around noon, expensive in the evening
function demoMarketPrice(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  return 0.11 + 0.06 * Math.sin(Math.PI * (hour - 12) / 12) ** 2 - 0.05 * Math.max(0, Math.sin(Math.PI * (hour - 9) / 8));
}
const demoAllIn = date => demoMarketPrice(date) + 0.018 + ENERGY_TAX.electricity;

function history(period, cfg) {
  const now = new Date();
  const buckets = makeBuckets(period, now);
  const series = { import: [], export: [], solar: [], charge: [], discharge: [], gas: [], water: [], heating: [], ev: [] };
  const costs = {
    import: [], export: [], gas: [],
    known: { import: true, export: true, gas: true },
    water: 1.1,
    fixedPerDay: (95 * 12 - TAX_REDUCTION) / 365,
  };
  const kind = PERIODS[period].bucket;

  // Simulate each day once, then add its steps to the buckets they fall in
  const days = new Map();
  const dayOf = date => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const key = start.getTime();
    if (!days.has(key)) {
      // Deterministic per day, so a reload does not change the past
      const dayFactor = 0.55 + 0.45 * Math.abs(Math.sin(start.getDate() * 1.7));
      days.set(key, simulateDay(start, now, dayFactor));
    }
    return days.get(key);
  };

  for (const bucket of buckets) {
    const end = new Date(bucket.start);
    if (kind === 'hour') end.setHours(end.getHours() + 1);
    else if (kind === 'day') end.setDate(end.getDate() + 1);
    else end.setMonth(end.getMonth() + 1);
    const totals = { import: 0, export: 0, solar: 0, charge: 0, discharge: 0, gas: 0, water: 0, heating: 0, ev: 0 };
    const cost = { import: 0, export: 0, gas: 0 };
    const kWh = 10 / 60 / 1000;
    const steps = [];
    for (let day = new Date(bucket.start); day < end && day <= now; day.setDate(day.getDate() + 1)) steps.push(...dayOf(day));
    for (const step of steps) {
      if (step.t < bucket.start || step.t >= end) continue;
      const price = demoAllIn(step.t);
      if (step.grid > 0) cost.import += step.grid * kWh * price;
      else cost.export -= -step.grid * kWh * price;
      totals.solar += step.sun * kWh;
      totals.heating += step.heating * kWh;
      totals.water += waterFlow(step.t) * 10 / 1000; // m³ in 10 minutes
      totals.ev += step.ev * kWh;
      if (step.grid > 0) totals.import += step.grid * kWh;
      else totals.export += -step.grid * kWh;
      if (step.battery > 0) totals.charge += step.battery * kWh;
      else totals.discharge += -step.battery * kWh;
      const hour = step.t.getHours();
      const gas = (hour >= 6 && hour < 9) || (hour >= 17 && hour < 22) ? 0.035 / 6 : 0.008 / 6;
      totals.gas += gas;
      cost.gas += gas * 1.35;
    }
    for (const key of Object.keys(series)) series[key].push(totals[key]);
    for (const key of Object.keys(cost)) costs[key].push(cost[key]);
  }

  const boilerTemperatureSeries = [];
  if (kind === 'hour') {
    const start = buckets[0].start.getTime();
    for (let m = 0; m < 24 * 60; m += 15) {
      const t = new Date(start + m * 60000);
      if (t > now) break;
      boilerTemperatureSeries.push({ t: t.toISOString(), v: Math.round(boilerTemperature(t) * 10) / 10 });
    }
  }

  // Power through the day for the line chart, from the same simulation in steps of 5 minutes
  let power = null;
  if (kind === 'hour') {
    const steps = dayOf(buckets[0].start);
    const at = key => Array.from({ length: steps.length * 2 }, (_, i) => steps[Math.floor(i / 2)][key]);
    const end = new Date(buckets[0].start);
    end.setDate(end.getDate() + 1);
    power = buildPowerCurve(buckets[0].start, end, now, {
      grid: at('grid'), solar: [at('sun')], battery: [at('battery')],
    });
  }

  const consumption = series.import.reduce((a, b) => a + b, 0) + series.solar.reduce((a, b) => a + b, 0)
    - series.export.reduce((a, b) => a + b, 0) - series.charge.reduce((a, b) => a + b, 0)
    + series.discharge.reduce((a, b) => a + b, 0);
  const deviceEnergy = DEMO_DEVICES.map(d => ({ ...d, kWh: consumption * d.share }));

  return summarize(period, buckets, series, costs, {
    demo: true,
    boilerTemperature: boilerTemperatureSeries,
    power,
    deviceEnergy,
    hasBattery: true,
    available: { solar: true, gas: true, heating: true, ev: true, water: true },
  });
}

// A forecast like Forecast.Solar gives: a clear-sky version of the demo's solar power
function forecast() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const watts = [];
  const days = {};
  for (let d = 0; d < 2; d++) {
    const day = new Date(start);
    day.setDate(day.getDate() + d);
    let wh = 0;
    for (let m = 0; m < 24 * 60; m += 15) {
      const t = new Date(day.getTime() + m * 60000);
      const hour = t.getHours() + t.getMinutes() / 60;
      const daylight = Math.sin(Math.PI * (hour - 7) / 13);
      const w = daylight > 0 ? Math.round(SOLAR_PEAK_W * 0.92 * daylight ** 1.5) : 0;
      watts.push({ t: t.getTime(), w });
      wh += w / 4;
    }
    days[`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`] = wh / 1000;
  }
  return { watts, days };
}

module.exports = { live, history, forecast };
