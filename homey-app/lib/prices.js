'use strict';

const https = require('https');

// Dynamic electricity prices for the Netherlands from EnergyZero's public API (no account needed).
// Prices include VAT; a fixed surcharge per kWh (supplier markup, energy tax) can be added.

const CACHE_TTL = 30 * 60 * 1000;
const REQUEST_TIMEOUT = 15 * 1000;
const CHEAPEST_HOURS = 3;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' }, timeout: REQUEST_TIMEOUT }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Prijzen niet beschikbaar (${res.statusCode})`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Prijzen ophalen duurde te lang')));
    req.on('error', reject);
  });
}

// Lowest average over `hours` consecutive hours, from now on
function cheapestWindow(prices, now, hours = CHEAPEST_HOURS) {
  const future = prices.filter(p => new Date(p.t).getTime() + 3600000 > now.getTime());
  let best = null;
  for (let i = 0; i + hours <= future.length; i++) {
    const slice = future.slice(i, i + hours);
    const avg = slice.reduce((sum, p) => sum + p.price, 0) / hours;
    if (!best || avg < best.avg) best = { start: slice[0].t, hours, avg };
  }
  return best;
}

class PriceService {

  constructor({ log = () => {} } = {}) {
    this.log = log;
    this.cache = null;
  }

  async fetchEnergyZero(from, till) {
    const url = 'https://api.energyzero.nl/v1/energyprices'
      + `?fromDate=${from.toISOString()}&tillDate=${till.toISOString()}&interval=4&usageType=1&inclBtw=true`;
    const data = await getJson(url);
    return (data.Prices || [])
      .filter(p => typeof p.price === 'number')
      .map(p => ({ t: new Date(p.readingDate).toISOString(), price: p.price }));
  }

  // Prices for today and, once published (early afternoon), tomorrow
  async get(cfg = {}, now = new Date()) {
    if (cfg.source === 'off') return null;
    const surcharge = Number(cfg.surcharge) || 0;
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const key = `${dayStart.toISOString()}|${surcharge}`;

    if (!this.cache || this.cache.key !== key || Date.now() - this.cache.at > CACHE_TTL) {
      const till = new Date(dayStart.getTime() + 48 * 3600000 - 1);
      const raw = await this.fetchEnergyZero(dayStart, till);
      this.cache = { key, at: Date.now(), raw };
    }

    const prices = this.cache.raw.map(p => ({ ...p, price: p.price + surcharge }));
    const tomorrowStart = dayStart.getTime() + 24 * 3600000;
    const today = prices.filter(p => new Date(p.t).getTime() < tomorrowStart);
    const tomorrow = prices.filter(p => new Date(p.t).getTime() >= tomorrowStart);
    const current = today.find(p => {
      const t = new Date(p.t).getTime();
      return t <= now.getTime() && now.getTime() < t + 3600000;
    });
    const values = today.map(p => p.price);

    return {
      source: 'EnergyZero',
      surcharge,
      today,
      tomorrow,
      current: current ? current.price : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      cheapest: cheapestWindow(prices, now),
    };
  }

}

module.exports = { PriceService, cheapestWindow };
