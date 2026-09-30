'use strict';

const https = require('https');

// Expected solar power for today and tomorrow from Forecast.Solar's free API (no account).
// The free API allows 12 requests an hour and asks one roof plane per request, so the forecast
// is fetched once an hour, and less often with many planes: at most 10 requests an hour.

const HOUR = 60 * 60 * 1000;
const REQUESTS_PER_HOUR = 10;
// How long a forecast is kept: an hour, or longer when there are more than 10 planes
const cacheTtl = planes => Math.max(HOUR, Math.ceil(planes / REQUESTS_PER_HOUR * HOUR));
const RETRY_AFTER = 15 * 60 * 1000;
const REQUEST_TIMEOUT = 15 * 1000;
const STEP = 15 * 60 * 1000;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' }, timeout: REQUEST_TIMEOUT }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(res.statusCode === 429 ? 'Zonneverwachting: te veel aanvragen, straks weer' : `Zonneverwachting niet beschikbaar (${res.statusCode})`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Zonneverwachting ophalen duurde te lang')));
    req.on('error', reject);
  });
}

// "2026-09-28 13:00:00" is local time at the location, which is also the time zone of the app
const parseTime = text => new Date(String(text).replace(' ', 'T')).getTime();

// Power in W at a moment, by linear interpolation between the points of one plane
function interpolate(points, t) {
  if (!points.length || t < points[0].t || t > points[points.length - 1].t) return 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].t >= t) {
      const a = points[i - 1];
      const b = points[i];
      return b.t === a.t ? b.w : a.w + (b.w - a.w) * (t - a.t) / (b.t - a.t);
    }
  }
  return 0;
}

// Only usable planes: a size in kWp, a tilt of 0–90° and a direction of -180–180° (0 = south)
function validPlanes(planes = []) {
  return planes
    .map(p => ({ kwp: Number(p.kwp), tilt: Number(p.tilt), azimuth: Number(p.azimuth) }))
    .filter(p => p.kwp > 0 && p.tilt >= 0 && p.tilt <= 90 && p.azimuth >= -180 && p.azimuth <= 180);
}

class ForecastService {

  constructor({ log = () => {} } = {}) {
    this.log = log;
    this.cache = null;
    this.failure = null;
  }

  // { watts: [{ t, w }] every 15 minutes, days: { 'YYYY-MM-DD': kWh } } for all planes together
  async get({ lat, lon, planes }) {
    const valid = validPlanes(planes);
    if (!valid.length || typeof lat !== 'number' || typeof lon !== 'number') return null;
    const key = JSON.stringify([lat.toFixed(3), lon.toFixed(3), valid]);
    if (this.cache && this.cache.key === key && Date.now() - this.cache.at < cacheTtl(valid.length)) return this.cache.data;
    // After a failure the planes are asked again later; with many planes only after a full wait
    const retry = valid.length > 5 ? cacheTtl(valid.length) : RETRY_AFTER;
    if (this.failure && this.failure.key === key && Date.now() - this.failure.at < retry) {
      if (this.cache?.key === key) return this.cache.data;
      throw this.failure.error;
    }

    try {
      const results = [];
      for (const p of valid) {
        const url = `https://api.forecast.solar/estimate/${lat.toFixed(4)}/${lon.toFixed(4)}/${p.tilt}/${p.azimuth}/${p.kwp}`;
        results.push((await getJson(url)).result || {});
      }
      const planesPoints = results.map(r => Object.entries(r.watts || {})
        .map(([time, w]) => ({ t: parseTime(time), w: Number(w) || 0 }))
        .filter(p => Number.isFinite(p.t))
        .sort((a, b) => a.t - b.t));
      const all = planesPoints.flat();
      if (!all.length) throw new Error('Zonneverwachting zonder gegevens');

      const from = Math.floor(Math.min(...all.map(p => p.t)) / STEP) * STEP;
      const till = Math.max(...all.map(p => p.t));
      const watts = [];
      for (let t = from; t <= till; t += STEP) {
        watts.push({ t, w: Math.round(planesPoints.reduce((sum, points) => sum + interpolate(points, t), 0)) });
      }
      const days = {};
      for (const r of results) {
        for (const [day, wh] of Object.entries(r.watt_hours_day || {})) days[day] = (days[day] || 0) + wh / 1000;
      }
      const data = { watts, days };
      this.cache = { key, at: Date.now(), data };
      this.failure = null;
      return data;
    } catch (err) {
      this.failure = { key, at: Date.now(), error: err };
      this.log(`Forecast: ${err.message}`);
      if (this.cache?.key === key) return this.cache.data;
      throw err;
    }
  }

}

// The forecast only covers today and tomorrow, so the expected kWh per day are kept in a log
// (date → kWh, at most `KEEP` days) to compare with what the panels produced later
const LOG_DAYS = 400;

function recordForecast(log = {}, forecast) {
  const next = { ...log };
  for (const [day, kWh] of Object.entries(forecast?.days || {})) next[day] = Math.round(kWh * 100) / 100;
  const days = Object.keys(next).sort();
  for (const day of days.slice(0, Math.max(0, days.length - LOG_DAYS))) delete next[day];
  return next;
}

// Total kWp of the configured roof planes
const totalKwp = planes => validPlanes(planes).reduce((sum, p) => sum + p.kwp, 0);

module.exports = { ForecastService, validPlanes, recordForecast, totalKwp, cacheTtl };
