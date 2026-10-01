'use strict';

const REQUEST_TIMEOUT = 15 * 1000;
const LOGS_CACHE_TTL = 10 * 60 * 1000;

// Minimal client for the local Homey Pro Web API, authenticated with an API key
class HomeyClient {

  constructor({ address, token }) {
    let base = String(address || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base)) base = `http://${base}`;
    this.base = base;
    this.token = token;
    this.logs = null;
    this.logsFetchedAt = 0;
  }

  async get(path) {
    const res = await fetch(this.base + path, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Homey gaf ${res.status} op ${path}${body ? `: ${body.slice(0, 200)}` : ''}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async getDevices() {
    return Object.values(await this.get('/api/manager/devices/device'));
  }

  async getLogs() {
    if (!this.logs || Date.now() - this.logsFetchedAt > LOGS_CACHE_TTL) {
      this.logs = Object.values(await this.get('/api/manager/insights/log'));
      this.logsFetchedAt = Date.now();
    }
    return this.logs;
  }

  async findLog(deviceId, capability) {
    const logs = await this.getLogs();
    return logs.find(log => log.ownerUri === `homey:device:${deviceId}` && log.ownerId === capability)
      || logs.find(log => log.id === `homey:device:${deviceId}:${capability}`);
  }

  // Homey Energy: prices, the live report and the reports per period. The API key needs the
  // permission to view energy; without it these fail and the dashboard leaves them out.
  energy(path) {
    return this.get(`/api/manager/energy${path}`);
  }

  // A report for the devices per period; `request` comes from reportRequest() in energy.js
  energyReport(request) {
    const query = {
      day: `/report/day?date=${request.date}`,
      week: `/report/week?isoWeek=${request.isoWeek}`,
      month: `/report/month?yearMonth=${request.yearMonth}`,
      year: `/report/year?year=${request.year}`,
    }[request.kind];
    return this.energy(query);
  }

  // Returns [{ t: Date, v: number }] for a device capability (true or false for on/off), or [] when it has no Insights log
  async getEntries(deviceId, capability, resolution) {
    const log = await this.findLog(deviceId, capability);
    if (!log) return [];

    // Same addressing as homey-api: /log/<owner uri>/<full log id>/entry
    const uri = log.id.split(':', 3).join(':');
    const result = await this.get(`/api/manager/insights/log/${uri}/${log.id}/entry?resolution=${resolution}`);
    return parseEntries(result);
  }

}

function parseEntries(result) {
  return (result?.values || [])
    .filter(entry => typeof entry.v === 'number' || typeof entry.v === 'boolean')
    .map(entry => ({ t: new Date(entry.t), v: entry.v }));
}

module.exports = { HomeyClient, parseEntries };
