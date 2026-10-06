'use strict';

// Copies the shared dashboard files to the pc server and the Homey app.
// Each keeps its own site.js with the start-up that fits that host.

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');

const copies = [
  ['lib/energy.js', ['homey-app/lib/energy.js']],
  ['lib/prices.js', ['homey-app/lib/prices.js']],
  ['lib/tariffs.js', ['homey-app/lib/tariffs.js']],
  ['lib/forecast.js', ['homey-app/lib/forecast.js']],
  ['lib/weather.js', ['homey-app/lib/weather.js']],
  ['lib/alerts.js', ['homey-app/lib/alerts.js']],
  ['lib/peak.js', ['homey-app/lib/peak.js']],
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

// The page scripts are rewritten for older browsers (wall tablets, an iPad on iOS 12):
// Safari 12 stops at syntax such as ?. and ??, and then the page shows no data at all.
// Destructuring works there; esbuild only flags it for a rare Safari bug it cannot rewrite.
const BROWSER_TARGET = 'safari12';
const forBrowsers = from => from.startsWith('shared/') && from.endsWith('.js');

for (const [from, destinations] of copies) {
  const source = path.join(root, from);
  const code = forBrowsers(from)
    ? esbuild.transformSync(fs.readFileSync(source, 'utf8'), { target: BROWSER_TARGET, supported: { destructuring: true }, charset: 'utf8', sourcefile: from }).code
    : null;
  for (const to of destinations) {
    if (code === null) fs.copyFileSync(source, path.join(root, to));
    else fs.writeFileSync(path.join(root, to), code);
    console.log(`${from} -> ${to}`);
  }
}
