'use strict';

const { priceLookup } = require('./prices');

// What energy costs the user: a fixed contract (normal and off-peak rate) or a dynamic one
// (market price per hour plus energy tax and the supplier's markup), gas and water prices,
// and the fixed costs per month minus the yearly energy tax reduction. All amounts include VAT.

// Dutch energy tax 2026, incl. VAT (first bracket); users can change it in the settings
const ENERGY_TAX = { electricity: 0.11085, gas: 0.7300 };
const TAX_REDUCTION = 628.96;

// Starting values for the markup of dynamic suppliers (€/kWh, and €/m³ for gas where known,
// incl. VAT), from the comparisons of keuze.nl and salderingswijzer.nl in September 2026.
// Suppliers change these now and then, so the settings say to check them.
const SUPPLIERS = [
  { id: 'anwb', name: 'ANWB Energie', markup: 0.0200, gasMarkup: 0.0591 },
  { id: 'budget', name: 'Budget Energie', markup: 0.0168, gasMarkup: 0.0641 },
  { id: 'easyenergy', name: 'easyEnergy', markup: 0.0180 },
  { id: 'eneco', name: 'Eneco', markup: 0.0314, gasMarkup: 0.0929 },
  { id: 'energiedirect', name: 'Energiedirect', markup: 0.0169 },
  { id: 'energiek', name: 'Energiek', markup: 0.0180, gasMarkup: 0.0600 },
  { id: 'essent', name: 'Essent', markup: 0.0253, gasMarkup: 0.0787 },
  { id: 'frank', name: 'Frank Energie', markup: 0.0182, gasMarkup: 0.0799 },
  { id: 'greenchoice', name: 'Greenchoice', markup: 0.0240 },
  { id: 'mega', name: 'Mega', markup: 0.0182, gasMarkup: 0.0945 },
  { id: 'nextenergy', name: 'NextEnergy', markup: 0.0219, gasMarkup: 0.0799 },
  { id: 'noord', name: 'Noord Energie', markup: 0.0194, gasMarkup: 0.0666 },
  { id: 'oxxio', name: 'Oxxio', markup: 0.0224, gasMarkup: 0.0129 },
  { id: 'powerpeers', name: 'Powerpeers', markup: 0.0100, gasMarkup: 0.0821 },
  { id: 'pure', name: 'Pure Energie', markup: 0.0180, gasMarkup: 0.0990 },
  { id: 'tibber', name: 'Tibber', markup: 0.0180, gasMarkup: 0.0749 },
  { id: 'vandebron', name: 'Vandebron', markup: 0.0221, gasMarkup: 0.0598 },
  { id: 'vattenfall', name: 'Vattenfall', markup: 0.0255, gasMarkup: 0.0750 },
  { id: 'zonneplan', name: 'Zonneplan', markup: 0.0199, gasMarkup: 0.0800 },
  { id: 'other', name: 'Anders', markup: 0 },
];

const num = v => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

// The contract from the settings; older settings with only `tariffs` still work
function contractFrom(cfg = {}) {
  const c = cfg.contract || {};
  const old = cfg.tariffs || {};
  const e = c.electricity || {};
  const g = c.gas || {};
  return {
    electricity: {
      type: e.type === 'dynamic' ? 'dynamic' : 'fixed',
      normal: num(e.normal) ?? num(old.electricityImport),
      low: num(e.low),
      export: num(e.export) ?? num(old.electricityExport),
      supplier: e.supplier || 'other',
      markup: num(e.markup) ?? 0,
      energyTax: num(e.energyTax) ?? ENERGY_TAX.electricity,
      exportFee: num(e.exportFee) ?? 0,
      netting: e.netting ?? Date.now() < new Date(2027, 0, 1).getTime(),
      lowFrom: num(e.lowFrom) ?? 23,
      lowTo: num(e.lowTo) ?? 7,
      lowWeekend: e.lowWeekend ?? true,
    },
    gas: {
      type: g.type === 'dynamic' ? 'dynamic' : 'fixed',
      price: num(g.price) ?? num(old.gas),
      markup: num(g.markup) ?? 0,
      energyTax: num(g.energyTax) ?? ENERGY_TAX.gas,
    },
    water: num(c.water) ?? num(old.water),
    monthly: num(c.monthly),
    taxReduction: num(c.taxReduction) ?? (num(c.monthly) !== null ? TAX_REDUCTION : null),
  };
}

// Off-peak (dal): at night and, by default, the whole weekend
function isLow(time, e) {
  const d = new Date(time);
  const day = d.getDay();
  if (e.lowWeekend && (day === 0 || day === 6)) return true;
  const h = d.getHours();
  return e.lowFrom > e.lowTo ? h >= e.lowFrom || h < e.lowTo : h >= e.lowFrom && h < e.lowTo;
}

// What a market price (incl. VAT) costs all in
const allInElectricity = (contract, market) => market + contract.electricity.markup + contract.electricity.energyTax;
const allInGas = (contract, market) => market + contract.gas.markup + contract.gas.energyTax;

// Prices per stretch of time for a period; market prices are fetched when the contract needs them.
// Every function returns null when the price is not known, so that cost is left out.
async function tariffFor(contract, priceService, from, till) {
  const e = contract.electricity;
  const g = contract.gas;
  let power = null;
  let gas = null;
  if (e.type === 'dynamic' && priceService) {
    power = priceLookup(await priceService.range('electricity', from, till).catch(() => []));
  }
  if (g.type === 'dynamic' && priceService) {
    gas = priceLookup(await priceService.range('gas', from, till).catch(() => []));
  }

  const importPrice = (t0, t1) => {
    if (e.type === 'dynamic') {
      const market = power?.between(t0, t1);
      return typeof market === 'number' ? allInElectricity(contract, market) : null;
    }
    if (e.normal === null) return null;
    if (e.low === null) return e.normal;
    // A long stretch (a meter that reports rarely) gets the share of off-peak hours in it
    if (t1 - t0 <= 3600000) return isLow(t0, e) ? e.low : e.normal;
    let low = 0;
    let all = 0;
    for (let t = t0; t < t1; t += 3600000) { all++; if (isLow(t, e)) low++; }
    return (e.low * low + e.normal * (all - low)) / all;
  };

  const exportPrice = (t0, t1) => {
    if (e.type === 'dynamic') {
      if (e.netting) return importPrice(t0, t1);
      const market = power?.between(t0, t1);
      return typeof market === 'number' ? market - e.exportFee : null;
    }
    return e.export;
  };

  const gasPrice = (t0, t1) => {
    if (g.type === 'dynamic') {
      const market = gas?.between(t0, t1);
      return typeof market === 'number' ? allInGas(contract, market) : null;
    }
    return g.price;
  };

  const fixedPerDay = contract.monthly === null && contract.taxReduction === null
    ? null
    : ((contract.monthly || 0) * 12 - (contract.taxReduction || 0)) / 365;

  return { importPrice, exportPrice, gasPrice, water: contract.water, fixedPerDay };
}

// Whether the contract has anything to calculate costs with
function hasPrices(contract) {
  return contract.electricity.type === 'dynamic' || contract.electricity.normal !== null
    || contract.gas.type === 'dynamic' || contract.gas.price !== null
    || contract.water !== null || contract.monthly !== null;
}

// A typical price per kWh, for yearly estimates such as the standby use
function typicalImportPrice(contract, marketAverage) {
  const e = contract.electricity;
  if (e.type === 'dynamic') return typeof marketAverage === 'number' ? allInElectricity(contract, marketAverage) : null;
  if (e.normal === null) return null;
  return e.low === null ? e.normal : (e.normal + e.low) / 2;
}

module.exports = {
  ENERGY_TAX, TAX_REDUCTION, SUPPLIERS, contractFrom, isLow, tariffFor, hasPrices,
  allInElectricity, typicalImportPrice,
};
