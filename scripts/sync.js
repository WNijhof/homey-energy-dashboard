'use strict';

// Copies the shared dashboard files to the pc server and the Homey app.
// Each keeps its own site.js with the start-up that fits that host.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const copies = [
  ['lib/energy.js', ['homey-app/lib/energy.js']],
  ['lib/prices.js', ['homey-app/lib/prices.js']],
  ['lib/tariffs.js', ['homey-app/lib/tariffs.js']],
  ['lib/forecast.js', ['homey-app/lib/forecast.js']],
  ['lib/weather.js', ['homey-app/lib/weather.js']],
  ['lib/alerts.js', ['homey-app/lib/alerts.js']],
  ['shared/dashboard.js', ['public/dashboard.js', 'homey-app/web/dashboard.js']],
  ['shared/i18n.js', ['public/i18n.js', 'homey-app/web/i18n.js']],
  ['shared/screen.js', ['public/screen.js', 'homey-app/web/screen.js']],
  ['shared/dashboard.css', ['public/dashboard.css', 'homey-app/web/dashboard.css']],
  ['public/index.html', ['homey-app/web/index.html']],
  ['public/icon.svg', ['homey-app/web/icon.svg']],
  ['public/manifest.webmanifest', ['homey-app/web/manifest.webmanifest']],
  ['public/icon-192.png', ['homey-app/web/icon-192.png']],
  ['public/icon-512.png', ['homey-app/web/icon-512.png']],
  ['public/apple-touch-icon.png', ['homey-app/web/apple-touch-icon.png']],
];

for (const [from, destinations] of copies) {
  for (const to of destinations) {
    fs.copyFileSync(path.join(root, from), path.join(root, to));
    console.log(`${from} -> ${to}`);
  }
}
