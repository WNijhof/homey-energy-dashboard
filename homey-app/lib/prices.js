'use strict';

const https = require('https');

// Market prices for the Netherlands from EnergyZero's public API (no account needed): the
// day-ahead price of electricity and the daily price of gas, both including VAT. What the user
// pays on top (energy tax, supplier markup) is added in tariffs.js.
// Electricity comes per quarter hour for the last days, today and tomorrow (as most dynamic
// suppliers bill per quarter), and per hour for older periods, where one request covers a month.

const TODAY_TTL = 30 * 60 * 1000;
const MISSING_RETRY = 10 * 60 * 1000;
const RETRY_AFTER = 5 * 60 * 1000;
const REQUEST_TIMEOUT = 15 * 1000;
const MAX_DAYS_PER_REQUEST = 31;
const QUARTER_DAYS = 8;
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

// When a price stops: its own end, the next price, or an hour later
const endOf = (list, i) => list[i].end || (i + 1 < list.length ? list[i + 1].t : list[i].t + 3600000);

// Lowest average over `hours` hours in a row, from now on, whatever the length of each price
function cheapestWindow(prices, now, hours = 3) {
  const future = prices.filter((p, i) => endOf(prices, i) > now.getTime());
  const span = hours * 3600000;
  let best = null;
  for (let i = 0; i < future.length; i++) {
    let sum = 0;
    let covered = 0;
    let j = i;
    while (j < future.length && covered < span) {
      const length = Math.min(endOf(future, j) - future[j].t, span - covered);
      sum += future[j].price * length;
      covered += length;
      j++;
    }
    if (covered < span) break;
    const avg = sum / span;
    if (!best || avg < best.avg) best = { start: new Date(future[i].t).toISOString(), hours, avg };
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
    const first = index(from);
    if (first < 0) return null;
    if (till <= endOf(list, first)) return list[first].price;
    let sum = 0;
    let weight = 0;
    for (let i = first; i < list.length && list[i].t < till; i++) {
      const start = Math.max(from, list[i].t);
      const end = Math.min(till, endOf(list, i));
      if (end > start) { sum += list[i].price * (end - start); weight += end - start; }
    }
    return weight ? sum / weight : at(from);
  };
  return { at, between };
}

// "28-09-2026", the date format of EnergyZero's public API
const apiDate = time => {
  const d = new Date(time);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

class PriceService {

  constructor({ log = () => {} } = {}) {
    this.log = log;
    // Per kind and day start: { at, prices: [{ t, end?, price }] }. Past days never change;
    // today and tomorrow are fetched again after a while, as tomorrow is published at 13:00
    this.days = { electricity: new Map(), gas: new Map() };
    // Days asked for without an answer yet (tomorrow before 13:00): asked again after a while
    this.tried = { electricity: new Map(), gas: new Map() };
    this.failure = null;
  }

  // Hourly (electricity) or daily (gas) prices for a stretch of days, in one request
  async fetchEnergyZero(kind, from, till) {
    const url = 'https://api.energyzero.nl/v1/energyprices'
      + `?fromDate=${new Date(from).toISOString()}&tillDate=${new Date(till - 1).toISOString()}&interval=4&usageType=${USAGE[kind]}&inclBtw=true`;
    const data = await getJson(url);
    return (data.Prices || [])
      .filter(p => typeof p.price === 'number')
      .map(p => ({ t: new Date(p.readingDate).getTime(), price: p.price }));
  }

  // Electricity prices per quarter hour; one request returns the asked day and the day before
  async fetchQuarters(day) {
    const url = `https://public.api.energyzero.nl/public/v1/prices?date=${apiDate(day)}&interval=INTERVAL_QUARTER&energyType=ENERGY_TYPE_ELECTRICITY`;
    const data = await getJson(url);
    return (data.base_with_vat || [])
      .map(p => ({ t: Date.parse(p.start), end: Date.parse(p.end), price: Number(p.price?.value) }))
      .filter(p => Number.isFinite(p.t) && Number.isFinite(p.end) && Number.isFinite(p.price))
      .sort((a, b) => a.t - b.t);
  }

  // A day is complete when its prices cover it from start to end
  static complete(day, prices) {
    if (!prices.length) return false;
    const last = prices[prices.length - 1];
    return prices[0].t <= day && (last.end || last.t + 3600000) >= nextDay(day);
  }

  fresh(kind, day, now) {
    const cached = this.days[kind].get(day);
    if (!cached) return false;
    const final = nextDay(day) <= dayStart(now) && (kind === 'gas' ? cached.prices.length > 0 : PriceService.complete(day, cached.prices));
    return final || now - cached.at < TODAY_TTL;
  }

  store(kind, days, prices, now) {
    for (const d of days) {
      const next = nextDay(d);
      const own = prices.filter(p => p.t >= d && p.t < next);
      if (own.length) this.days[kind].set(d, { at: now, prices: own });
    }
  }

  // Market prices (incl. VAT) from `from` to `till`, sorted by time
  async range(kind, from, till, now = Date.now()) {
    const days = [];
    for (let d = dayStart(from); d < till; d = nextDay(d)) days.push(d);
    const tried = this.tried[kind];
    let missing = days.filter(d => !this.fresh(kind, d, now) && d <= nextDay(dayStart(now)) && !(now - (tried.get(d) || 0) < MISSING_RETRY));
    missing.forEach(d => tried.set(d, now));

    if (missing.length && !(this.failure && now - this.failure.at < RETRY_AFTER)) {
      try {
        // Recent days per quarter hour; a day that fails falls back to hourly prices
        if (kind === 'electricity') {
          const recent = missing.filter(d => d >= dayStart(now) - QUARTER_DAYS * DAY);
          for (const d of recent.slice().reverse()) {
            if (this.fresh(kind, d, now)) continue;
            try {
              const prices = await this.fetchQuarters(d);
              const covered = [d, dayStart(d - DAY / 2)].filter(x => PriceService.complete(x, prices.filter(p => p.t >= x && p.t < nextDay(x))));
              this.store(kind, covered.length ? covered : [d], prices, now);
            } catch (err) {
              this.log(`Quarter prices: ${err.message}`);
            }
          }
          missing = missing.filter(d => !this.fresh(kind, d, now));
        }
        for (let i = 0; i < missing.length; i += MAX_DAYS_PER_REQUEST) {
          const chunk = missing.slice(i, i + MAX_DAYS_PER_REQUEST);
          const prices = await this.fetchEnergyZero(kind, chunk[0], nextDay(chunk[chunk.length - 1]));
          this.store(kind, chunk, prices, now);
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
    for (const map of [...Object.values(this.days), ...Object.values(this.tried)]) {
      for (const day of map.keys()) if (day < oldest) map.delete(day);
    }
    for (const map of Object.values(this.tried)) {
      for (const [day, at] of map) if (now - at >= MISSING_RETRY) map.delete(day);
    }
  }

  // Prices for today and, once published (early afternoon), tomorrow. `allIn` turns a market
  // price into what the user pays; without it the market price is shown.
  async get(cfg = {}, { allIn = null, now = new Date() } = {}) {
    if (cfg.source === 'off') return null;
    const start = dayStart(now);
    const raw = await this.range('electricity', start, nextDay(nextDay(start)), now.getTime());
    const prices = raw.map((p, i) => ({ t: p.t, end: endOf(raw, i), price: allIn ? allIn(p.price) : p.price }));
    const tomorrowStart = nextDay(start);
    const today = prices.filter(p => p.t < tomorrowStart);
    const tomorrow = prices.filter(p => p.t >= tomorrowStart);
    const current = today.find(p => p.t <= now.getTime() && now.getTime() < p.end);
    const values = today.map(p => p.price);
    const iso = list => list.map(p => ({ t: new Date(p.t).toISOString(), minutes: Math.round((p.end - p.t) / 60000), price: p.price }));

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
