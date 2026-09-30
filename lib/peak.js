'use strict';

// The monthly peak for the Belgian capacity tariff: the highest average import power over a
// quarter hour in a month. Belgian meters report it themselves (HomeWizard passes it on as
// measure_power.montly_power_peak, and the average of the running quarter hour as
// measure_power.average_power_15m_w); without those the app measures it: the grid power once a
// minute, averaged per quarter hour. The highest quarter of each month is kept in a log
// (month → { w, at, since }), at most 13 months, for the average of the last 12 months.

const QUARTER = 15 * 60 * 1000;
const KEEP_MONTHS = 13;
// Fewer readings than this in a quarter hour say too little about it
const MIN_READINGS = 3;
// The Belgian tariff counts at least 2.5 kW per month
const DEFAULT_MIN_KW = 2.5;

const pad = n => String(n).padStart(2, '0');
const monthKey = time => {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

// Capabilities of a P1 meter with the meter's own monthly peak and running quarter hour
function peakCapabilities(p1) {
  const caps = p1?.capabilities || [];
  return {
    peak: caps.find(c => /^measure_power\.(montly|monthly)_power_peak/.test(c)) || null,
    average: caps.find(c => /^measure_power\.average_power_15m/.test(c)) || null,
  };
}

class PeakTracker {

  constructor(log = {}) {
    this.log = log && typeof log === 'object' ? { ...log } : {};
    this.quarter = null;
  }

  // The import power (W) of this moment; returns true when the log changed
  add(importW, now = Date.now()) {
    if (typeof importW !== 'number' || !Number.isFinite(importW)) return false;
    const start = Math.floor(now / QUARTER) * QUARTER;
    let changed = false;
    if (this.quarter && this.quarter.start !== start) {
      changed = this.close();
      this.quarter = null;
    }
    if (!this.quarter) this.quarter = { start, sum: 0, count: 0 };
    this.quarter.sum += Math.max(0, importW);
    this.quarter.count++;
    return changed;
  }

  close() {
    const q = this.quarter;
    if (!q || q.count < MIN_READINGS) return false;
    return this.record(q.start, q.sum / q.count);
  }

  // A quarter hour average; kept when it is the highest of its month so far
  record(start, watts, since = start) {
    const key = monthKey(start);
    const entry = this.log[key];
    const earliest = Math.min(Date.parse(entry?.since) || Infinity, since);
    if (entry && entry.w >= watts) {
      if (earliest < Date.parse(entry.since)) {
        this.log[key] = { ...entry, since: new Date(earliest).toISOString() };
        return true;
      }
      return false;
    }
    this.log[key] = { w: Math.round(watts), at: new Date(start).toISOString(), since: new Date(earliest).toISOString() };
    const keys = Object.keys(this.log).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_MONTHS))) delete this.log[old];
    return true;
  }

  // The peak the meter reports for this month, kept for the months to come
  recordMeter(watts, now = Date.now()) {
    if (typeof watts !== 'number' || !(watts > 0)) return false;
    const key = monthKey(now);
    const entry = this.log[key];
    if (entry && entry.w >= watts) return false;
    this.log[key] = { w: Math.round(watts), at: entry?.meter && entry.w === Math.round(watts) ? entry.at : null, since: entry?.since || new Date(now).toISOString(), meter: true };
    return true;
  }

  // Quarter hour averages from a power series (W, positive while importing), such as the grid
  // power of today and yesterday from Insights, so a new installation starts with those days
  seed(entries) {
    const quarters = new Map();
    for (const e of entries) {
      const start = Math.floor(e.t.getTime() / QUARTER) * QUARTER;
      const q = quarters.get(start) || { sum: 0, count: 0 };
      q.sum += Math.max(0, e.v);
      q.count++;
      quarters.set(start, q);
    }
    if (!quarters.size) return false;
    const since = Math.min(...quarters.keys());
    let changed = false;
    for (const [start, q] of quarters) {
      // Insights keeps a reading every few minutes, so a single one can describe a quarter
      if (this.record(start, q.sum / q.count, since)) changed = true;
    }
    return changed;
  }

  // The running quarter hour: its start and the average so far
  current(now = Date.now()) {
    const q = this.quarter;
    if (!q || !q.count || q.start !== Math.floor(now / QUARTER) * QUARTER) return null;
    return { start: new Date(q.start).toISOString(), watts: q.sum / q.count };
  }

}

// What the block shows: this month's peak (from the meter, or measured), the running quarter
// hour, the last 12 months and, with a tariff in €/kW per year, what it costs
function peakSummary({ tracker, p1, grid = {}, now = new Date() }) {
  const caps = peakCapabilities(p1);
  const read = cap => (cap ? p1?.capabilitiesObj?.[cap]?.value ?? null : null);
  const meterPeak = read(caps.peak);
  const meterAverage = read(caps.average);
  const key = monthKey(now);
  const entry = tracker?.log[key] || null;
  const fromMeter = typeof meterPeak === 'number';
  const peakW = fromMeter ? meterPeak : entry?.w ?? null;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const since = !fromMeter && entry?.since && Date.parse(entry.since) > monthStart + 86400000 ? entry.since : null;
  const running = tracker?.current(now.getTime()) || null;
  const quarterW = typeof meterAverage === 'number' ? meterAverage : running?.watts ?? null;

  const months = Object.entries(tracker?.log || {})
    .filter(([month]) => month !== key)
    .map(([month, e]) => ({ month, w: e.w }));
  if (typeof peakW === 'number') months.push({ month: key, w: peakW });
  months.sort((a, b) => a.month.localeCompare(b.month));
  const last12 = months.slice(-12);

  const tariff = Number(grid.capacityTariff) > 0 ? Number(grid.capacityTariff) : null;
  const minKw = Number(grid.capacityMin) >= 0 && grid.capacityMin !== '' && grid.capacityMin !== null && grid.capacityMin !== undefined
    ? Number(grid.capacityMin) : DEFAULT_MIN_KW;
  const counted = w => Math.max(minKw, w / 1000);
  const yearKw = last12.length ? last12.reduce((sum, m) => sum + counted(m.w), 0) / last12.length : null;

  if (peakW === null && quarterW === null) return null;
  return {
    peakW,
    at: fromMeter ? null : entry?.at ?? null,
    source: fromMeter ? 'meter' : 'measured',
    since,
    quarterW,
    quarterStart: running?.start ?? new Date(Math.floor(now.getTime() / QUARTER) * QUARTER).toISOString(),
    months: last12,
    minKw,
    tariff,
    monthCost: tariff && typeof peakW === 'number' ? counted(peakW) * tariff / 12 : null,
    yearKw,
    yearCost: tariff && yearKw !== null ? yearKw * tariff : null,
  };
}

module.exports = { PeakTracker, peakSummary, peakCapabilities, monthKey, QUARTER };
