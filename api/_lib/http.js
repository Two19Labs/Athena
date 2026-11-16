'use strict';

/** Minimal helpers shared by the serverless functions (Vercel Node runtime and dev-server.js). */

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req, limitBytes) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const s = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (s.length > limitBytes) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    return s ? JSON.parse(s) : {};
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

module.exports = { send, readJson };
