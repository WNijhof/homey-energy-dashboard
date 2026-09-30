'use strict';

const https = require('https');

// Market prices of electricity, from one of two sources:
// - Homey Energy: the dynamic prices Homey itself fetches for the price zone set in Homey, for
//   any country Homey supports. Homey gives the market price; the costs the user entered in
//   Homey (a formula such as ([[price]] * 1.21) + 0.13) turn it into what they pay.
// - EnergyZero's public API (no account needed), for the Netherlands: the day-ahead price incl.
//   VAT; energy tax and the supplier's markup are added in tariffs.js.
// "auto" takes Homey when dynamic prices are set up there, and EnergyZero otherwise. Gas always
// comes from EnergyZero (daily prices, incl. VAT): Homey has no dynamic gas prices.
// EnergyZero gives electricity per quarter hour for the last days, today and tomorrow (as most
// dynamic suppliers bill per quarter), and per hour for older periods, one request per month.

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

// ---------- Homey Energy ----------

const HOMEY_TTL = 60 * 60 * 1000;
const HOMEY_CONCURRENCY = 4;
// Homey's price settings are asked for with every refresh of the page; a slow Energy manager
// should not hold the page up. Without an answer in time, they count as unknown for a minute.
const HOMEY_ASK_TIMEOUT = 3000;
const HOMEY_RETRY = 60 * 1000;
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

// The price list of one day from Homey: { pricesPerInterval: [{ periodStart, periodEnd, value }] }
function homeyPriceList(raw) {
  const list = Array.isArray(raw?.pricesPerInterval) ? raw.pricesPerInterval : [];
  return list
    .filter(p => p && typeof p === 'object')
    .map(p => ({ t: Date.parse(p.periodStart), end: Date.parse(p.periodEnd), price: Number(p.value) }))
    .filter(p => Number.isFinite(p.t) && Number.isFinite(p.price))
    .map(p => (Number.isFinite(p.end) ? p : { t: p.t, price: p.price }))
    .sort((a, b) => a.t - b.t);
}

// Homey answers some questions with a plain value and others with an object around it
const plain = raw => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.value ?? raw.type ?? raw.currency ?? null : raw);

// The formula of the user costs in Homey, found in whatever shape Homey returns it
function formulaText(raw) {
  if (typeof raw === 'string') return raw.trim() || null;
  const queue = [raw];
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== 'object') continue;
    for (const key of ['mathExpression', 'expression', 'formula']) {
      if (typeof item[key] === 'string' && item[key].trim()) return item[key].trim();
    }
    queue.push(...Object.values(item).filter(v => v && typeof v === 'object'));
  }
  return null;
}

// Turns Homey's formula, e.g. {{([[price]] * 1.21) + 0.0248 + 0.1108}}, into a function of the
// market price. Only numbers, the price, + - * / and brackets are allowed; anything else gives
// null, so a formula that cannot be read is never run.
function compileFormula(text) {
  if (typeof text !== 'string') return null;
  const expr = text.trim()
    .replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '')
    .replace(/\[\[\s*(price|prijs)\s*\]\]|\[\s*(price|prijs)\s*\]/gi, 'p')
    .replace(/(\d),(\d)/g, '$1.$2');
  const tokens = expr.match(/\d+(?:\.\d+)?|\.\d+|[p+\-*/()]|\S/g) || [];
  if (!tokens.length || tokens.some(t => !/^(\d+(\.\d+)?|\.\d+|[p+\-*/()])$/.test(t))) return null;

  // Recursive descent over the tokens: sum → product → factor
  let pos = 0;
  const peek = () => tokens[pos];
  function sum() {
    let node = product();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos++];
      const left = node;
      const right = product();
      node = op === '+' ? p => left(p) + right(p) : p => left(p) - right(p);
    }
    return node;
  }
  function product() {
    let node = factor();
    while (peek() === '*' || peek() === '/') {
      const op = tokens[pos++];
      const left = node;
      const right = factor();
      node = op === '*' ? p => left(p) * right(p) : p => left(p) / right(p);
    }
    return node;
  }
  function factor() {
    const token = tokens[pos++];
    if (token === '-') { const inner = factor(); return p => -inner(p); }
    if (token === '+') return factor();
    if (token === 'p') return p => p;
    if (token === '(') {
      const inner = sum();
      if (tokens[pos++] !== ')') throw new Error('bracket');
      return inner;
    }
    const number = Number(token);
    if (!Number.isFinite(number)) throw new Error('token');
    return () => number;
  }
  try {
    const fn = sum();
    if (pos !== tokens.length) return null;
    const test = fn(0.1);
    if (!Number.isFinite(test)) return null;
    return p => {
      const out = fn(p);
      return Number.isFinite(out) ? out : null;
    };
  } catch {
    return null;
  }
}

// "2026-09-30" in local time, the date format of Homey's price API
const localDate = time => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

class PriceService {

  // `homey` reads Homey Energy: { prices(date), userCosts(), priceType(), fixedPrice(), currency() },
  // each a function returning a promise; `source` returns the chosen source: auto, homey,
  // energyzero or off
  constructor({ log = () => {}, homey = null, source = () => 'auto' } = {}) {
    this.log = log;
    this.homey = homey;
    this.sourceSetting = source;
    // Per kind and day start: { at, prices: [{ t, end?, price }] }. Past days never change;
    // today and tomorrow are fetched again after a while, as tomorrow is published at 13:00
    this.days = { electricity: new Map(), gas: new Map() };
    // Days asked for without an answer yet (tomorrow before 13:00): asked again after a while
    this.tried = { electricity: new Map(), gas: new Map() };
    this.failure = null;
    // Electricity from Homey, per day start, like `days`
    this.homeyDays = new Map();
    this.homeyTried = new Map();
    this.homeyInfo = null;
  }

  // What Homey Energy knows about prices: the type (dynamic, fixed, disabled), the formula of the
  // user costs, a fixed price and the currency. Read at most once an hour.
  async homeyState() {
    if (!this.homey) return null;
    if (this.homeyInfo && Date.now() - this.homeyInfo.at < HOMEY_TTL) return this.homeyInfo.data;
    if (!this.homeyPending) {
      let slow = false;
      const ask = fn => (fn ? withTimeout(fn(), HOMEY_ASK_TIMEOUT).catch(err => { if (err.message === 'timeout') slow = true; return null; }) : Promise.resolve(null));
      this.homeyPending = Promise.all([
        ask(this.homey.priceType), ask(this.homey.userCosts), ask(this.homey.fixedPrice), ask(this.homey.currency),
      ]).then(([type, costs, fixed, currency]) => {
        const formula = formulaText(costs);
        const fixedPrice = Number(plain(fixed));
        const data = {
          type: typeof plain(type) === 'string' ? plain(type) : null,
          formula,
          allIn: compileFormula(formula),
          fixed: Number.isFinite(fixedPrice) && fixedPrice > 0 ? fixedPrice : null,
          currency: typeof plain(currency) === 'string' && /^[A-Z]{3}$/.test(plain(currency)) ? plain(currency) : null,
        };
        // An answer that came too late is asked again in a minute rather than an hour
        this.homeyInfo = { at: slow ? Date.now() - HOMEY_TTL + HOMEY_RETRY : Date.now(), data };
        return data;
      }).finally(() => { this.homeyPending = null; });
    }
    return this.homeyPending;
  }

  // The source of electricity prices in use: homey, energyzero or off
  async source() {
    const chosen = this.sourceSetting();
    if (chosen === 'off' || chosen === 'energyzero') return chosen;
    if (chosen === 'homey') return this.homey ? 'homey' : 'energyzero';
    const state = await this.homeyState();
    return state?.type === 'dynamic' ? 'homey' : 'energyzero';
  }

  // Homey's own prices for the costs, when the contract in the app leaves them open:
  // { allIn: market → price with Homey's user costs, or null; fixed: a fixed price or null }
  async homeyTariff() {
    const state = await this.homeyState();
    if (!state) return null;
    const dynamic = await this.source() === 'homey';
    // exVat: Homey's market price is without VAT and no formula in Homey adds it
    return { allIn: dynamic ? state.allIn : null, formula: dynamic ? state.formula : null, fixed: state.type === 'fixed' ? state.fixed : null, dynamic, exVat: dynamic && !state.allIn };
  }

  async currency() {
    return (await this.homeyState())?.currency || null;
  }

  // Electricity from Homey for a stretch of days. Days in the past are kept; a day Homey has no
  // prices for is not asked again for a day.
  async rangeHomey(from, till, now) {
    const days = [];
    for (let d = dayStart(from); d < till; d = nextDay(d)) days.push(d);
    const today = dayStart(now);
    const fresh = d => {
      const cached = this.homeyDays.get(d);
      if (!cached) return false;
      if (d < today) return cached.prices.length ? PriceService.complete(d, cached.prices) || now - cached.at < DAY : now - cached.at < DAY;
      return now - cached.at < TODAY_TTL;
    };
    // Homey keeps prices for a limited time. A day in the past without prices means the days
    // before it have none either; those are not asked for until a day later.
    const none = this.homeyNoneBefore && now - this.homeyNoneBefore.at < DAY ? this.homeyNoneBefore.day : -Infinity;
    const missing = days
      .filter(d => d > none && !fresh(d) && d <= nextDay(today) && !(now - (this.homeyTried.get(d) || 0) < MISSING_RETRY))
      .sort((a, b) => b - a);
    let failed = null;
    for (let i = 0; i < missing.length; i += HOMEY_CONCURRENCY) {
      const chunk = missing.slice(i, i + HOMEY_CONCURRENCY);
      let empty = -Infinity;
      await Promise.all(chunk.map(async d => {
        this.homeyTried.set(d, now);
        try {
          const prices = homeyPriceList(await this.homey.prices(localDate(d)));
          const own = prices.filter(p => p.t >= d && p.t < nextDay(d));
          // Tomorrow before its prices are out stays unknown, so it is asked again later
          if (own.length || d < today) this.homeyDays.set(d, { at: now, prices: own });
          if (!own.length && d < today) empty = Math.max(empty, d);
        } catch (err) {
          failed = err;
        }
      }));
      // The newest day without prices; the older days are skipped
      if (empty > -Infinity) {
        this.homeyNoneBefore = { day: empty, at: now };
        break;
      }
    }
    if (failed) this.log(`Homey prices: ${failed.message}`);
    for (const map of [this.homeyDays, this.homeyTried]) {
      for (const day of map.keys()) if (day < now - KEEP_DAYS * DAY) map.delete(day);
    }
    const list = days.flatMap(d => this.homeyDays.get(d)?.prices || []).filter(p => p.t < till);
    if (!list.length && failed) throw failed;
    return list;
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

  // Market prices from `from` to `till`, sorted by time: from Homey or EnergyZero (incl. VAT)
  async range(kind, from, till, now = Date.now()) {
    if (kind === 'electricity' && this.homey && await this.source() === 'homey') return this.rangeHomey(from, till, now);
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
    const source = await this.source();
    const homeyState = source === 'homey' ? await this.homeyState() : null;
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
      source: source === 'homey' ? 'Homey' : 'EnergyZero',
      allIn: Boolean(allIn),
      // All-in with the costs entered in Homey, rather than those of the contract in the app
      homeyCosts: Boolean(allIn && homeyState?.allIn && allIn === homeyState.allIn),
      currency: homeyState?.currency || null,
      today: iso(today),
      tomorrow: iso(tomorrow),
      current: current ? current.price : null,
      // The market price of this moment, before the costs that make the all-in price
      market: current ? raw.find(p => p.t === current.t)?.price ?? null : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      cheapest: cheapestWindow(prices, now),
    };
  }

}

module.exports = { PriceService, cheapestWindow, priceLookup, compileFormula, homeyPriceList, formulaText };
