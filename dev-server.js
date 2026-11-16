'use strict';

/**
 * Local development server: serves the static app and the /api functions the
 * same way Vercel does. No dependencies.
 *
 *   node dev-server.js            -> http://localhost:3000
 *   PORT=8080 node dev-server.js
 *
 * Reads API keys from a `.env` file in this folder if present (see .env.example).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APP_DIR = path.join(ROOT, 'aplyd');

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8'
};

const API_ROUTES = {
  '/api/extract': () => require('./api/extract.js'),
  '/api/erp': () => require('./api/erp.js')
};

function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/aplyd\/?/, '')) || 'index.html';
  const file = path.normalize(path.join(APP_DIR, rel));
  if (!file.startsWith(APP_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function createServer() {
  return http.createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0];
    try {
      if (API_ROUTES[urlPath]) return await API_ROUTES[urlPath]()(req, res);
      if (urlPath === '/' || urlPath === '/index.html') {
        res.writeHead(307, { Location: '/aplyd/index.html' });
        return res.end();
      }
      // Mirror vercel.json: everything outside /aplyd and /api is served from /aplyd
      return serveStatic(req, res, urlPath.startsWith('/aplyd') ? urlPath : '/aplyd' + urlPath);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    }
  });
}

if (require.main === module) {
  loadDotEnv();
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    const configured = Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
    console.log(`APLYD running at http://localhost:${port}`);
    console.log(configured ? 'AI provider key found.' : 'No AI key found: extraction will report "not configured". Copy .env.example to .env and add GEMINI_API_KEY.');
  });
}

module.exports = { createServer, loadDotEnv };
