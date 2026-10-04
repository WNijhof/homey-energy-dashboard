'use strict';

const { TAX_REDUCTION, ENERGY_TAX } = require('./tariffs');
const { dayKey } = require('./weather');

// A mild Dutch year: about 3 °C in January and 18 °C in July
function demoTemperature(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const day = (date - start) / 86400000;
  return 10.5 - 7.5 * Math.cos(2 * Math.PI * (day - 15) / 365);
}
const { PERIODS, degreeDayBuckets, makeBuckets, summarize, allocateFlows, buildPowerCurve, showerMinutes, boilerStatus, assumptions, resolveLayout, buildSankey, liveTotals } = require('./energy');

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
  p1: {
    capabilities: ['meter_gas', 'measure_current.l1', 'measure_current.l2', 'measure_current.l3', 'measure_power.montly_power_peak'],
    capabilitiesObj: { meter_gas: { value: 4821.337 }, 'measure_power.montly_power_peak': { value: 3350 } },
  },
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

// `at` is an earlier moment of today or yesterday, for looking back
function live(cfg, at = null) {
  const now = at ? new Date(at) : new Date();
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
    // Lamps without a meter: Homey estimates their use
    { id: 'd8', name: 'Lampen woonkamer', watts: hour >= 17 || hour < 1 ? 48 : 0, estimated: true },
  ].filter(d => d.watts > 0).sort((a, b) => b.watts - a.watts);

  return {
    demo: true,
    gridW,
    solarW,
    homeW,
    battery: {
      names: ['Zendure SolarFlow 2400 AC'],
      watts: batteryW,
      soc: Math.round(current.soc * 100),
      devices: [{ name: 'Zendure SolarFlow 2400 AC', soc: Math.round(current.soc * 100), watts: batteryW }],
    },
    flows,
    gasM3: 4821.337,
    consumers,
    sankey: buildSankey(
      liveTotals({ solarW, gridW, batteryW, homeW, flows }),
      consumers.map(d => ({ id: d.id, name: d.name, value: d.watts, estimated: d.estimated })),
    ),
    peak: demoPeak(now, current, cfg),
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
    // Circuits as an example, per phase with the rest the meter measures; with groups set in
    // the config those names are shown
    groups: (() => {
      const names = cfg.groups?.length ? cfg.groups.filter(g => g.name).map(g => g.name) : ['Keuken', 'Wasmachine en droger', 'Woonkamer', 'Kookplaat'];
      const on = [[{ name: 'Vaatwasser', watts: 1950 }, { name: 'Koelkast', watts: 85 }], [{ name: 'Wasmachine', watts: 420 }], [{ name: 'Tv', watts: 95 }], [{ name: 'Inductiekookplaat', watts: 2400 }]];
      const phases = [[1], [2], [3], [1, 2]];
      const groups = names.map((name, i) => {
        const list = on[i % 4];
        const fixedWatts = i % 4 === 2 ? 40 : 0;
        const watts = list.reduce((sum, d) => sum + d.watts, 0) + fixedWatts;
        const p = phases[i % 4];
        return { id: String(i), name, watts, amps: watts / 230 / p.length, fuseAmps: 16, phases: p, fixedWatts, devices: list.length, on: list };
      });
      return { groups, phases: [{ phase: 1, watts: 3380, rest: 145 }, { phase: 2, watts: 1710, rest: 90 }, { phase: 3, watts: 310, rest: 175 }] };
    })(),
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

// The monthly peak for the Belgian capacity tariff: a peak on a cold evening this month, the
// running quarter hour from the simulation, and a year of monthly peaks
function demoPeak(now, current, cfg) {
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const winter = Math.cos(2 * Math.PI * d.getMonth() / 12);
    months.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, w: Math.round(4100 + 1500 * winter) });
  }
  const peakW = months[months.length - 1].w;
  const tariff = Number(cfg.grid?.capacityTariff) > 0 ? Number(cfg.grid.capacityTariff) : 53.3;
  const minKw = 2.5;
  const counted = w => Math.max(minKw, w / 1000);
  const yearKw = months.reduce((sum, m) => sum + counted(m.w), 0) / months.length;
  const quarter = Math.floor(now.getTime() / 900000) * 900000;
  return {
    peakW,
    at: new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 3), 18, 15).toISOString(),
    source: 'meter',
    since: null,
    quarterW: Math.max(0, current.grid),
    quarterStart: new Date(quarter).toISOString(),
    months,
    minKw,
    tariff,
    monthCost: counted(peakW) * tariff / 12,
    yearKw,
    yearCost: yearKw * tariff,
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
  { id: 'lw', name: 'Lampen woonkamer', share: 0.02, estimated: true },
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
    import: [], export: [], gas: [], netting: [],
    known: { import: true, export: true, gas: true, netting: true },
    water: 1.1,
    fixedPerDay: (95 * 12 - TAX_REDUCTION) / 365,
  };
  const kind = PERIODS[period].bucket;
  // Battery earnings: it charges from solar surplus (missing that export) and saves import later
  const battery = { withNetting: 0, withoutNetting: 0, charged: 0, discharged: 0, known: true };

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
    const cost = { import: 0, export: 0, gas: 0, netting: 0 };
    const kWh = 10 / 60 / 1000;
    const steps = [];
    for (let day = new Date(bucket.start); day < end && day <= now; day.setDate(day.getDate() + 1)) steps.push(...dayOf(day));
    for (const step of steps) {
      if (step.t < bucket.start || step.t >= end) continue;
      const price = demoAllIn(step.t);
      if (step.grid > 0) cost.import += step.grid * kWh * price;
      else {
        cost.export -= -step.grid * kWh * price;
        // Without netting the export would earn the market price
        cost.netting += -step.grid * kWh * (price - demoMarketPrice(step.t));
      }
      totals.solar += step.sun * kWh;
      totals.heating += step.heating * kWh;
      totals.water += waterFlow(step.t) * 10 / 1000; // m³ in 10 minutes
      totals.ev += step.ev * kWh;
      if (step.grid > 0) totals.import += step.grid * kWh;
      else totals.export += -step.grid * kWh;
      if (step.battery > 0) totals.charge += step.battery * kWh;
      else totals.discharge += -step.battery * kWh;
      if (step.t >= bucket.start && step.t < end) {
        const energy = Math.abs(step.battery) * kWh;
        if (step.battery > 0) {
          battery.withNetting -= energy * price;
          battery.withoutNetting -= energy * demoMarketPrice(step.t);
          battery.charged += energy;
        } else if (step.battery < 0) {
          battery.withNetting += energy * price;
          battery.withoutNetting += energy * price;
          battery.discharged += energy;
        }
      }
      const hour = step.t.getHours();
      const cold = 0.3 + Math.max(0, 18 - demoTemperature(step.t)) / 10;
      const gas = ((hour >= 6 && hour < 9) || (hour >= 17 && hour < 22) ? 0.035 / 6 : 0.008 / 6) * cold;
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

  const temps = {};
  for (let d = new Date(buckets[0].start); d <= now && d < new Date(buckets[buckets.length - 1].start.getTime() + 32 * 86400000); d.setDate(d.getDate() + 1)) {
    temps[dayKey(d)] = demoTemperature(d);
  }
  series.degreeDays = degreeDayBuckets(period, buckets, temps, now);
  const summary = summarize(period, buckets, series, costs, {
    demo: true,
    boilerTemperature: boilerTemperatureSeries,
    batterySoc: kind === 'hour' ? {
      start: buckets[0].start.toISOString(),
      step: 300,
      values: dayOf(buckets[0].start).flatMap(s => [Math.round(s.soc * 1000) / 10, Math.round(s.soc * 1000) / 10]),
    } : null,
    power,
    deviceEnergy,
    hasBattery: true,
    available: { solar: true, gas: true, heating: true, ev: true, water: true },
  });
  summary.batteryEarnings = battery;
  summary.batteryHistory = demoBatteryHistory(kind === 'hour' ? dayOf(buckets[0].start) : null, battery);
  if (kind === 'hour') summary.phaseHistory = demoPhases(dayOf(buckets[0].start), buckets[0].start);
  if (kind === 'hour') summary.groupLoad = demoGroupLoad(cfg, buckets[0].start);
  return summary;
}

// The battery's sessions of a day from the simulation: charging on the midday sun, delivering
// in the evening; with the average price of both
function demoBatteryHistory(steps, battery) {
  const sessions = [];
  for (const step of steps || []) {
    const kind = step.battery > 20 ? 'charge' : step.battery < -20 ? 'discharge' : null;
    const last = sessions[sessions.length - 1];
    if (!kind) continue;
    const price = demoAllIn(step.t);
    const kWh = Math.abs(step.battery) * 10 / 60 / 1000;
    if (last && last.kind === kind && step.t - Date.parse(last.end) <= 20 * 60000) {
      last.end = new Date(step.t.getTime() + 600000).toISOString();
      last.value += kWh * (kind === 'charge' ? demoMarketPrice(step.t) : price);
      last.kWh += kWh;
    } else {
      sessions.push({ kind, start: step.t.toISOString(), end: new Date(step.t.getTime() + 600000).toISOString(), kWh, value: kWh * (kind === 'charge' ? demoMarketPrice(step.t) : price) });
    }
  }
  // A day: the averages of its sessions; a longer period: typical demo values
  const average = kind => {
    const list = sessions.filter(s => s.kind === kind);
    const kWh = list.reduce((sum, s) => sum + s.kWh, 0);
    return kWh > 0 ? list.reduce((sum, s) => sum + s.value, 0) / kWh : null;
  };
  return {
    chargePrice: steps ? average('charge') : battery.charged > 0 ? 0.09 : null,
    dischargePrice: steps ? average('discharge') : battery.discharged > 0 ? 0.31 : null,
    sessions: steps ? sessions.filter(s => s.kWh >= 0.05).map(s => ({
      kind: s.kind, start: s.start, end: s.end, kWh: s.kWh, share: s.kind === 'charge' ? 1 : 0, price: s.value / s.kWh,
    })) : null,
  };
}

// Current per phase through the day in steps of 5 minutes: the heat pump on L3
function demoPhases(steps, start) {
  const values = n => steps.flatMap(s => {
    const base = Math.max(0, s.grid) / 230 / 3;
    const amps = n === 1 ? base + 1.8 : n === 2 ? base + 0.6 + s.ev / 230 / 3 : base + s.heating / 230;
    return [Math.round(amps * 10) / 10, Math.round(amps * 10) / 10];
  });
  return { start: start.toISOString(), step: 300, unit: 'A', phases: [1, 2, 3].map(phase => ({ phase, values: values(phase) })) };
}

// The load of the demo circuits through the day (% of the fuse): cooking around dinner, the
// dishwasher after it, the washing machine in the morning and the living room in the evening
function demoGroupLoad(cfg, start) {
  const names = cfg.groups?.length ? cfg.groups.filter(g => g.name).map(g => g.name) : ['Keuken', 'Wasmachine en droger', 'Woonkamer', 'Kookplaat'];
  const steps = Math.min(288, Math.max(0, Math.ceil((Date.now() - start) / 300000)));
  const shape = [
    h => (h >= 20 && h < 21.5 ? 55 : 3),
    h => (h >= 9 && h < 10.5 ? 30 : h >= 10.5 && h < 11.5 ? 75 : 0),
    h => (h >= 18 && h < 23.5 ? 12 : h >= 7 && h < 8 ? 8 : 2),
    h => (h >= 17.75 && h < 18.5 ? 95 : h >= 18.5 && h < 19 ? 40 : 0),
  ];
  return {
    start: new Date(start).toISOString(),
    step: 300,
    groups: names.map((name, i) => ({ id: String(i), name, values: Array.from({ length: steps }, (_, k) => shape[i % 4](k / 12)) })),
  };
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

// Expected solar per day for the past year: the clear-sky demo day, a little above what the
// simulated days (with clouds) produce
function forecastLog() {
  const log = {};
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const clearDay = forecast().days;
  const perDay = Object.values(clearDay)[0];
  for (let i = 0; i < 400; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const season = 0.35 + 0.65 * Math.sin(Math.PI * (d.getMonth() + 0.5) / 12);
    log[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = Math.round(perDay * season * 0.8 * 100) / 100;
  }
  return log;
}

module.exports = { live, history, forecast, forecastLog };
