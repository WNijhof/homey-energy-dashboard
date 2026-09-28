'use strict';

const https = require('https');

// Market prices for the Netherlands from EnergyZero's public API (no account needed): the
// day-ahead price of electricity per hour and of gas per day, both including VAT. What the
// user pays on top (energy tax, supplier markup) is added in tariffs.js.

const TODAY_TTL = 30 * 60 * 1000;
const RETRY_AFTER = 5 * 60 * 1000;
const REQUEST_TIMEOUT = 15 * 1000;
const MAX_DAYS_PER_REQUEST = 31;
const KEEP_DAYS = 400;
const DAY = 24 * 3600000;
const USAGE = { electricity: 1, gas: 3 };

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

const dayStart = time => {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const nextDay = time => {
  const d = new Date(time);
  d.setDate(d.getDate() + 1);
  return d.getTime();
};

// Lowest average over `hours` consecutive hours, from now on
function cheapestWindow(prices, now, hours = 3) {
  const future = prices.filter(p => p.t + 3600000 > now.getTime());
  let best = null;
  for (let i = 0; i + hours <= future.length; i++) {
    const slice = future.slice(i, i + hours);
    const avg = slice.reduce((sum, p) => sum + p.price, 0) / hours;
    if (!best || avg < best.avg) best = { start: new Date(slice[0].t).toISOString(), hours, avg };
  }
  return best;
}

// Looks up the price at a moment, or the average over a stretch of time, in a sorted list
function priceLookup(list) {
  const times = list.map(p => p.t);
  const index = t => {
    let lo = 0;
    let hi = times.length - 1;
    if (hi < 0 || t < times[0]) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (times[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const at = t => {
    const i = index(t);
    return i < 0 ? null : list[i].price;
  };
  // Average over [from, till), weighted by time; for meters that report once an hour or less
  const between = (from, till) => {
    if (till - from <= 3600000) return at(from);
    let i = Math.max(0, index(from));
    let sum = 0;
    let weight = 0;
    for (; i < list.length && list[i].t < till; i++) {
      const start = Math.max(from, list[i].t);
      const end = Math.min(till, i + 1 < list.length ? list[i + 1].t : list[i].t + 3600000);
      if (end > start) { sum += list[i].price * (end - start); weight += end - start; }
    }
    return weight ? sum / weight : at(from);
  };
  return { at, between };
}

class PriceService {

  constructor({ log = () => {} } = {}) {
    this.log = log;
    // Per kind and day start: { at, prices: [{ t, price }] }. Past days never change;
    // today and tomorrow are fetched again after a while, as tomorrow is published at 13:00
    this.days = { electricity: new Map(), gas: new Map() };
    this.failure = null;
  }

  async fetchEnergyZero(kind, from, till) {
    const url = 'https://api.energyzero.nl/v1/energyprices'
      + `?fromDate=${new Date(from).toISOString()}&tillDate=${new Date(till - 1).toISOString()}&interval=4&usageType=${USAGE[kind]}&inclBtw=true`;
    const data = await getJson(url);
    return (data.Prices || [])
      .filter(p => typeof p.price === 'number')
      .map(p => ({ t: new Date(p.readingDate).getTime(), price: p.price }));
  }

  fresh(kind, day, now) {
    const cached = this.days[kind].get(day);
    if (!cached) return false;
    const final = nextDay(day) <= dayStart(now) && cached.prices.length >= (kind === 'gas' ? 1 : 23);
    return final || now - cached.at < TODAY_TTL;
  }

  // Market prices (incl. VAT) from `from` to `till`, sorted by time
  async range(kind, from, till, now = Date.now()) {
    const days = [];
    for (let d = dayStart(from); d < till; d = nextDay(d)) days.push(d);
    const missing = days.filter(d => !this.fresh(kind, d, now) && d <= nextDay(dayStart(now)));

    if (missing.length && !(this.failure && now - this.failure.at < RETRY_AFTER)) {
      try {
        for (let i = 0; i < missing.length; i += MAX_DAYS_PER_REQUEST) {
          const chunk = missing.slice(i, i + MAX_DAYS_PER_REQUEST);
          const end = nextDay(chunk[chunk.length - 1]);
          const prices = await this.fetchEnergyZero(kind, chunk[0], end);
          for (const d of chunk) {
            const next = nextDay(d);
            const own = prices.filter(p => p.t >= d && p.t < next);
            if (own.length) this.days[kind].set(d, { at: now, prices: own });
          }
        }
        this.failure = null;
      } catch (err) {
        this.failure = { at: now, error: err };
        this.log(`Prices: ${err.message}`);
      }
    }
    this.prune(now);

    const list = days.flatMap(d => this.days[kind].get(d)?.prices || []).filter(p => p.t < till);
    if (!list.length && this.failure) throw this.failure.error;
    return list;
  }

  prune(now) {
    const oldest = now - KEEP_DAYS * DAY;
    for (const map of Object.values(this.days)) {
      for (const day of map.keys()) if (day < oldest) map.delete(day);
    }
  }

  // Prices for today and, once published (early afternoon), tomorrow. `allIn` turns a market
  // price into what the user pays; without it the market price is shown.
  async get(cfg = {}, { allIn = null, now = new Date() } = {}) {
    if (cfg.source === 'off') return null;
    const start = dayStart(now);
    const raw = await this.range('electricity', start, nextDay(nextDay(start)), now.getTime());
    const prices = raw.map(p => ({ t: p.t, price: allIn ? allIn(p.price) : p.price }));
    const tomorrowStart = nextDay(start);
    const today = prices.filter(p => p.t < tomorrowStart);
    const tomorrow = prices.filter(p => p.t >= tomorrowStart);
    const current = today.find(p => p.t <= now.getTime() && now.getTime() < p.t + 3600000);
    const values = today.map(p => p.price);
    const iso = list => list.map(p => ({ t: new Date(p.t).toISOString(), price: p.price }));

    return {
      source: 'EnergyZero',
      allIn: Boolean(allIn),
      today: iso(today),
      tomorrow: iso(tomorrow),
      current: current ? current.price : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      cheapest: cheapestWindow(prices, now),
    };
  }

}

module.exports = { PriceService, cheapestWindow, priceLookup };
