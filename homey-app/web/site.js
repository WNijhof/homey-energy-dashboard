'use strict';

// Start-up for the dashboard served by the Homey app

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
  missingHint: 'Kies ze in de Homey-app bij <em>Apps → Energie Dashboard → Instellingen</em>.',
});
