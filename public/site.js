'use strict';

// Start-up for the stand-alone server on a pc

EnergyDashboard.start({
  get: async path => {
    const res = await fetch(`/api${path}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Fout ${res.status}`);
    return data;
  },
  post: async (path, body) => {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Fout ${res.status}`), { status: res.status });
    return data;
  },
  demoMessage: '<strong>Demo-modus.</strong> Je ziet voorbeelddata. Vul <code>config.json</code> in met het adres en de API-key van je Homey Pro en start de server opnieuw.',
  missingHint: 'Zet de apparaat-id\'s in <code>config.json</code> (zie <a href="/api/devices" target="_blank">/api/devices</a>).',
});
