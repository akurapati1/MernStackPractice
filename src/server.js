'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { TriageService } = require('./triage');

const MAX_BODY = 50_000;

function createServer(service = new TriageService()) {
  return http.createServer((req, res) => {
    const send = (code, obj, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type });
      res.end(type === 'application/json' ? JSON.stringify(obj) : obj);
    };
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      return send(200, fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok' });
    if (req.method !== 'POST' || !['/triage', '/feedback'].includes(req.url)) return send(404, { error: 'not found' });
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { send(413, { error: 'payload too large' }); req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => {
      if (size > MAX_BODY) return;
      let data;
      try { data = JSON.parse(body || '{}'); } catch { return send(400, { error: 'invalid JSON' }); }
      if (typeof data.text !== 'string' || !data.text.trim()) return send(400, { error: "'text' is required" });
      if (req.url === '/triage') return send(200, service.triage(data.text));
      try { service.feedback(data.text, data.category); send(200, { ok: true }); } catch (e) { send(400, { error: e.message }); }
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => console.log(`ticket-triage on http://localhost:${port}`));
}

module.exports = { createServer };
