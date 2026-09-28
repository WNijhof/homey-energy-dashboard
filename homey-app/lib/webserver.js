'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB_DIR = path.join(__dirname, '..', 'web');

const MAX_BODY = 16 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(Object.assign(new Error('Te veel gegevens'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(Object.assign(new Error('Ongeldige gegevens'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function serveFile(res, urlPath) {
  const file = path.normalize(path.join(WEB_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(WEB_DIR + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Niet gevonden');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
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
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/layout') {
        if (req.method === 'GET') return sendJson(res, 200, await this.app.getLayoutInfo());
        if (req.method === 'POST') return sendJson(res, 200, await this.app.saveLayout(await readJson(req)));
      }
      if (req.method !== 'GET') {
        res.writeHead(405).end();
        return;
      }
      if (url.pathname === '/api/live') return sendJson(res, 200, await this.app.getLive());
      if (url.pathname === '/api/history') {
        return sendJson(res, 200, await this.app.getHistory(url.searchParams.get('period') || 'today'));
      }
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return sendJson(res, 400, { error: 'Ongeldig adres' });
      }
      return serveFile(res, pathname);
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
