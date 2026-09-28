'use strict';

// Warnings for the dashboard (and optionally the Homey timeline): a device that has been on for
// unusually long, standby use that is higher than usual, a meter that does not respond, and
// more than one home battery (possibly the same one twice). Kept light: once a minute the power
// of each device is looked at, and per device only 24 numbers are kept.

const ON_WATTS = 20;
const HOUR = 3600000;
const MINUTE = 60000;
// Devices that run for hours by design are not watched
const SKIP_CLASSES = new Set(['heatpump', 'boiler', 'evcharger', 'battery', 'solarpanel', 'thermostat', 'car', 'vehicle']);

class AlertMonitor {

  constructor() {
    // Per device: since when it is on, and the minutes it was on in each of the last 24 hours
    this.devices = new Map();
    this.started = Date.now();
  }

  // Called about once a minute with all devices (and the found meters, to leave those out)
  track(devices, found, now = Date.now()) {
    const skip = new Set([
      found.p1?.id, found.boiler?.id, found.thermostat?.id,
      ...found.solar.map(d => d.id), ...found.batteries.map(d => d.id),
      ...found.heating.map(d => d.id), ...found.evChargers.map(d => d.id),
    ]);
    const hour = Math.floor(now / HOUR);
    const seen = new Set();
    for (const d of devices) {
      const watts = d.capabilitiesObj?.measure_power?.value;
      if (skip.has(d.id) || typeof watts !== 'number' || SKIP_CLASSES.has(d.class) || SKIP_CLASSES.has(d.virtualClass)) continue;
      seen.add(d.id);
      const state = this.devices.get(d.id) || { name: d.name, since: null, watts: 0, hours: new Map(), last: now };
      const on = watts >= ON_WATTS;
      state.name = d.name;
      state.watts = watts;
      if (on && state.since === null) state.since = now;
      if (!on) state.since = null;
      if (on) state.hours.set(hour, (state.hours.get(hour) || 0) + Math.min(5, Math.max(1, Math.round((now - state.last) / MINUTE))));
      for (const h of state.hours.keys()) if (h <= hour - 24) state.hours.delete(h);
      state.last = now;
      this.devices.set(d.id, state);
    }
    for (const id of this.devices.keys()) if (!seen.has(id)) this.devices.delete(id);
  }

  // Devices on for longer than `hours` without a break, apart from ones that are always on
  longOn(hours, now = Date.now()) {
    const out = [];
    const watched = now - this.started >= 24 * HOUR;
    for (const [id, s] of this.devices) {
      if (s.since === null || now - s.since < hours * HOUR) continue;
      const minutesOn = [...s.hours.values()].reduce((a, b) => a + b, 0);
      // After a day of watching, a device that was on nearly the whole day counts as always on
      if (watched && minutesOn >= 22 * 60) continue;
      if (!watched && now - s.since >= 20 * HOUR) continue;
      out.push({ id, name: s.name, hours: Math.floor((now - s.since) / HOUR), watts: s.watts });
    }
    return out.sort((a, b) => b.hours - a.hours);
  }

}

// Standby use above the median of the previous two weeks, by at least 25% and 30 W
function baseloadAlert(today, log = {}) {
  if (typeof today !== 'number') return null;
  const values = Object.entries(log).sort(([a], [b]) => a.localeCompare(b)).slice(-15, -1).map(([, w]) => w);
  if (values.length < 7) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const usual = sorted[Math.floor(sorted.length / 2)];
  return today > usual * 1.25 && today - usual >= 30 ? { today, usual } : null;
}

// Keeps last night's standby use per day (at most 60 days) for the comparison above
function recordBaseload(log = {}, watts, date = new Date()) {
  if (typeof watts !== 'number') return log;
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const next = { ...log, [key]: Math.round(watts) };
  const keys = Object.keys(next).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete next[k];
  return next;
}

// Texts of the warnings in Dutch and English. The dashboard asks for Dutch and translates it
// itself; a notification in the Homey timeline follows the language of Homey.
const TEXTS = {
  nl: {
    offline: n => `${n} reageert niet`,
    baseload: (w, u) => `Sluipverbruik is ${w} W, normaal ${u} W`,
    longOn: (n, h, w) => `${n} staat al ${h} uur aan (${w} W)`,
    batteries: (c, names) => `${c} thuisbatterijen gevonden: ${names}. Is dit dezelfde batterij via twee apps? Kies er één bij de instellingen.`,
  },
  en: {
    offline: n => `${n} does not respond`,
    baseload: (w, u) => `Standby use is ${w} W, usually ${u} W`,
    longOn: (n, h, w) => `${n} has been on for ${h} hours (${w} W)`,
    batteries: (c, names) => `${c} home batteries found: ${names}. Is this the same battery through two apps? Choose one in the settings.`,
  },
};

// All current warnings, each with an id so a notification is sent once
function buildAlerts({ monitor, found, baseload, baseloadLog, hours = 4, lang = 'nl' }) {
  const t = TEXTS[lang] || TEXTS.nl;
  const alerts = [];
  if (found.p1 && found.p1.available === false) alerts.push({ id: 'p1', level: 'warning', text: t.offline(found.p1.name) });
  const hour = new Date().getHours();
  for (const panel of found.solar) {
    if (panel.available === false && hour >= 10 && hour < 16) alerts.push({ id: `solar-${panel.id}`, level: 'warning', text: t.offline(panel.name) });
  }
  const base = baseloadAlert(baseload?.watts, baseloadLog);
  if (base) alerts.push({ id: 'baseload', level: 'warning', text: t.baseload(Math.round(base.today), Math.round(base.usual)) });
  for (const d of monitor ? monitor.longOn(hours) : []) {
    alerts.push({ id: `on-${d.id}`, level: 'info', text: t.longOn(d.name, d.hours, Math.round(d.watts)) });
  }
  if (found.batteries.length > 1) {
    alerts.push({ id: 'batteries', level: 'info', text: t.batteries(found.batteries.length, found.batteries.map(b => b.name).join(', ')) });
  }
  return alerts;
}

module.exports = { AlertMonitor, buildAlerts, recordBaseload, baseloadAlert };
