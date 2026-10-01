'use strict';

const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { PinGuard } = require('./energy');

const WEB_DIR = path.join(__dirname, '..', 'web');
const ACCESS_COOKIE = 'energy_dashboard_access';

const MAX_BODY = 16 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(Object.assign(new Error('Te veel gegevens'), { status: 413 }));
        // Stop keeping the rest, but let it arrive, so the answer (413) still reaches the sender
        req.removeAllListeners('data');
        req.resume();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function readJson(req) {
  try {
    return JSON.parse((await readBody(req)) || '{}');
  } catch (err) {
    throw err.status ? err : Object.assign(new Error('Ongeldige gegevens'), { status: 400 });
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

// The page refers to its scripts and styles with the app version, so a browser or a cache in
// between (such as a tunnel to the internet) always loads the files of the running version
function versioned(html, version) {
  return html.replace(/(src|href)="((?:dashboard|i18n|screen|site)\.(?:js|css))"/g, (m, attr, file) => `${attr}="${file}?v=${version}"`);
}

function serveFile(res, urlPath, version) {
  const file = path.normalize(path.join(WEB_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(WEB_DIR + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Niet gevonden');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (path.extname(file) === '.html') res.end(versioned(fs.readFileSync(file, 'utf8'), version));
  else fs.createReadStream(file).pipe(res);
}

// ---------- Access code ----------

// With an access code set, a browser needs a cookie with a hash of the code. It gets one by
// entering the code on the login page, or by opening the dashboard once with ?code=… in the
// address (handy for a tablet on the wall).
const accessToken = code => crypto.createHash('sha256').update(`energy-dashboard:${code}`).digest('hex');

function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cookieValue(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

const LOGIN_TEXT = {
  nl: {
    title: 'Energie',
    prompt: 'Vul de toegangscode van het dashboard in. Je vindt of wijzigt hem in de Homey-app bij de instellingen van Energie Dashboard.',
    label: 'Toegangscode',
    button: 'Openen',
    wrong: 'Verkeerde code.',
    locked: 'Te veel verkeerde codes. Probeer het over een minuut opnieuw.',
  },
  en: {
    title: 'Energy',
    prompt: 'Enter the access code of the dashboard. You can find or change it in the Homey app, in the settings of Energy Dashboard.',
    label: 'Access code',
    button: 'Open',
    wrong: 'Wrong code.',
    locked: 'Too many wrong codes. Try again in a minute.',
  },
};

function loginPage(req, error) {
  const lang = /^nl\b/i.test(String(req.headers['accept-language'] || '')) ? 'nl' : 'en';
  const t = LOGIN_TEXT[lang];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title>
<link rel="icon" href="icon.svg" type="image/svg+xml">
<style>
  :root { --bg: #f2f2f7; --card: #fff; --text: #1c1c1e; --muted: #8a8a8e; --line: rgba(60, 60, 67, 0.2); --accent: #0a84ff; --error: #ff4d4f; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root { --bg: #000; --card: #1c1c1e; --text: #f5f5f7; --muted: #98989f; --line: rgba(235, 235, 245, 0.2); } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; background: var(--bg); color: var(--text); font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  form { background: var(--card); border-radius: 22px; padding: 24px; width: 100%; max-width: 360px; box-sizing: border-box; }
  h1 { margin: 0 0 8px; font-size: 28px; }
  p { color: var(--muted); margin: 0 0 16px; }
  label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  input { width: 100%; box-sizing: border-box; font: inherit; font-size: 17px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: transparent; color: var(--text); }
  button { margin-top: 14px; width: 100%; font: inherit; font-weight: 600; padding: 10px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; cursor: pointer; }
  .error { color: var(--error); margin: 12px 0 0; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>${t.title}</h1>
  <p>${t.prompt}</p>
  <label for="code">${t.label}</label>
  <input id="code" name="code" type="password" autocomplete="current-password" autofocus required>
  <button type="submit">${t.button}</button>
  ${error ? `<p class="error">${t[error]}</p>` : ''}
</form>
</body>
</html>`;
}

// Serves the dashboard page and its data on the local network.
// The only thing that can be changed from the page is the layout, optionally guarded by a PIN.
class WebServer {

  constructor({ app, log, error }) {
    this.app = app;
    this.log = log;
    this.error = error;
    this.server = null;
    this.port = null;
    this.status = { running: false, port: null, message: null };
    this.accessGuard = new PinGuard();
  }

  sendLogin(req, res, error, status) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(loginPage(req, error));
  }

  // True when the request may go on; otherwise it has been answered with the login page
  async checkAccess(req, res, url) {
    const code = this.app.getConfig().accessCode;
    if (!code) return true;
    const token = accessToken(code);
    if (sameText(cookieValue(req, ACCESS_COOKIE) || '', token)) {
      if (url.pathname !== '/login') return true;
      res.writeHead(303, { Location: '/' }).end();
      return false;
    }
    if (/^\/(icon\.svg|icon-\d+\.png|apple-touch-icon\.png|manifest\.webmanifest)$/.test(url.pathname)) return true;

    let given = null;
    if (url.pathname === '/login' && req.method === 'POST') given = new URLSearchParams(await readBody(req)).get('code') || '';
    else if (req.method === 'GET' && url.searchParams.has('code')) given = url.searchParams.get('code');
    if (given !== null) {
      try {
        this.accessGuard.check(code, given);
        res.writeHead(303, {
          Location: '/',
          'Set-Cookie': `${ACCESS_COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
          'Cache-Control': 'no-store',
        }).end();
      } catch (err) {
        this.sendLogin(req, res, err.status === 429 ? 'locked' : 'wrong', 403);
      }
      return false;
    }
    if (url.pathname.startsWith('/api/')) sendJson(res, 401, { error: 'Toegangscode nodig' });
    else this.sendLogin(req, res, null, 401);
    return false;
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (!(await this.checkAccess(req, res, url))) return;
      if (url.pathname === '/api/layout') {
        if (req.method === 'GET') return sendJson(res, 200, await this.app.getLayoutInfo(url.searchParams.get('layout') || ''));
        if (req.method === 'POST') return sendJson(res, 200, await this.app.saveLayout(await readJson(req)));
      }
      if (req.method !== 'GET') {
        res.writeHead(405).end();
        return;
      }
      // With `at` (milliseconds) the dashboard of an earlier moment of today or yesterday
      if (url.pathname === '/api/live') return sendJson(res, 200, await this.app.getLive(url.searchParams.get('layout') || '', url.searchParams.get('at')));
      if (url.pathname === '/api/diagnose') return sendJson(res, 200, await this.app.getDiagnosis());
      // The report of "Share diagnosis", from the help menu of the dashboard
      if (url.pathname === '/api/diagnosis-report') {
        return sendJson(res, 200, await this.app.getDiagnosisReport({ snapshot: url.searchParams.get('snapshot') === '1' }));
      }
      if (url.pathname === '/api/export') {
        const period = url.searchParams.get('period') || 'today';
        const csv = await this.app.getExport(period, url.searchParams.get('lang') || 'nl');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="energie-${period}-${new Date().toISOString().slice(0, 10)}.csv"`,
          'Cache-Control': 'no-store',
        });
        return res.end(csv);
      }
      if (url.pathname === '/api/history') {
        return sendJson(res, 200, await this.app.getHistory(url.searchParams.get('period') || 'today'));
      }
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return sendJson(res, 400, { error: 'Ongeldig adres' });
      }
      return serveFile(res, pathname, this.app.homey?.manifest?.version || '0');
    } catch (err) {
      if (!err.status) this.error(`${url.pathname}: ${err.message}`);
      return sendJson(res, err.status || 500, { error: err.message });
    }
  }

  async start(port) {
    if (this.server && this.port === port && this.status.running) return;
    await this.stop();

    this.port = port;
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise(resolve => {
      this.server.once('error', err => {
        this.status = {
          running: false,
          port,
          reason: err.code === 'EADDRINUSE' ? 'portInUse' : null,
          message: err.code === 'EADDRINUSE' ? `Poort ${port} is al in gebruik door iets anders.` : err.message,
        };
        this.error(`Web server on port ${port} failed: ${err.message}`);
        resolve();
      });
      this.server.listen(port, () => {
        this.status = { running: true, port, message: null };
        this.log(`Dashboard available on port ${port}`);
        resolve();
      });
    });
  }

  async stop() {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise(resolve => server.close(() => resolve()));
    this.status = { running: false, port: null, message: null };
  }

}

module.exports = { WebServer };
