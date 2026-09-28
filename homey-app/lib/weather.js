'use strict';

const https = require('https');

// Daily mean outdoor temperature from Open-Meteo (free, no account), for degree days: how much
// heating the weather asked for. Past days come from its archive, today from its forecast.

const REQUEST_TIMEOUT = 15 * 1000;
const TODAY_TTL = 60 * 60 * 1000;
const RETRY_AFTER = 15 * 60 * 1000;
const KEEP_DAYS = 800;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' }, timeout: REQUEST_TIMEOUT }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Weer niet beschikbaar (${res.statusCode})`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Weer ophalen duurde te lang')));
    req.on('error', reject);
  });
}

const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Weighted degree days as used in the Netherlands: 18 °C minus the day's mean temperature,
// weighted 1.1 from November to February, 1.0 in March and October and 0.8 from April to September
function degreeDays(meanTemp, date) {
  if (typeof meanTemp !== 'number') return null;
  const month = date.getMonth() + 1;
  const weight = month <= 2 || month >= 11 ? 1.1 : month === 3 || month === 10 ? 1.0 : 0.8;
  return Math.max(0, 18 - meanTemp) * weight;
}

class WeatherService {

  constructor({ log = () => {} } = {}) {
    this.log = log;
    this.days = new Map(); // 'lat,lon|YYYY-MM-DD' → { at, temp }
    this.failure = null;
  }

  // Mean temperature per day ('YYYY-MM-DD' → °C) from `from` to `till`, up to today
  async temperatures({ lat, lon }, from, till) {
    if (typeof lat !== 'number' || typeof lon !== 'number') return {};
    const place = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];
    for (let d = new Date(from); d < till && d <= today; d.setDate(d.getDate() + 1)) days.push(dayKey(d));
    const todayKey = dayKey(today);
    const missing = days.filter(k => {
      const cached = this.days.get(`${place}|${k}`);
      return !cached || (k === todayKey && Date.now() - cached.at > TODAY_TTL);
    });

    if (missing.length && !(this.failure && Date.now() - this.failure.at < RETRY_AFTER)) {
      try {
        const past = missing.filter(k => k !== todayKey);
        const query = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=temperature_2m_mean&timezone=auto`;
        if (past.length) {
          const data = await getJson(`https://archive-api.open-meteo.com/v1/archive?${query}&start_date=${past[0]}&end_date=${past[past.length - 1]}`);
          this.store(place, data);
        }
        if (missing.includes(todayKey)) {
          this.store(place, await getJson(`https://api.open-meteo.com/v1/forecast?${query}&past_days=1&forecast_days=1`));
        }
        this.failure = null;
      } catch (err) {
        this.failure = { at: Date.now(), error: err };
        this.log(`Weather: ${err.message}`);
      }
    }
    this.prune();

    const out = {};
    for (const k of days) {
      const cached = this.days.get(`${place}|${k}`);
      if (cached && typeof cached.temp === 'number') out[k] = cached.temp;
    }
    return out;
  }

  store(place, data) {
    const times = data?.daily?.time || [];
    const temps = data?.daily?.temperature_2m_mean || [];
    times.forEach((k, i) => {
      if (typeof temps[i] === 'number') this.days.set(`${place}|${k}`, { at: Date.now(), temp: temps[i] });
    });
  }

  prune() {
    const oldest = dayKey(new Date(Date.now() - KEEP_DAYS * 86400000));
    for (const key of this.days.keys()) if (key.split('|')[1] < oldest) this.days.delete(key);
  }

}

module.exports = { WeatherService, degreeDays, dayKey };
