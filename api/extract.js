'use strict';

/**
 * POST /api/extract
 * Body: { imageBase64, mimeType, master: { machines: [{machine_code, name, is_active}], shifts: [{shift_code, name}] }, today? }
 * 200:  { success, provider, model, latency_ms, data: { rows_detected, incomplete, image_issues, entries: [<5-state contract>] }, model_output }
 * 422:  { success:false, code:'unreadable', error }   image is not a readable production form
 * 4xx/5xx: { success:false, code, error }
 *
 * GET /api/extract -> { configured, providers: [{name, models}] } (no secrets)
 */

const { send, readJson } = require('./_lib/http');
const { runVision, configuredProviders, totalBudgetMs } = require('./_lib/providers');
const { buildSystemPrompt, buildAuditPrompt, USER_INSTRUCTION, AUDIT_INSTRUCTION, parseModelJson } = require('./_lib/prompt');
const { normalizeSheet, applyAudit } = require('../aplyd/js/rules.js');

const MAX_BODY = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB; the client downsizes images well below this.
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const providers = configuredProviders().map(p => ({ name: p.name, models: p.models }));
    return send(res, 200, { configured: providers.length > 0, providers });
  }
  if (req.method !== 'POST') return send(res, 405, { success: false, code: 'method_not_allowed', error: 'Use POST.' });

  // Browsers always send Origin on cross-site POSTs: refuse other websites spending this deployment's AI quota.
  const origin = req.headers && req.headers.origin;
  if (origin) {
    let originHost = null;
    try { originHost = new URL(origin).host; } catch (_) { /* malformed */ }
    if (originHost !== req.headers.host) {
      return send(res, 403, { success: false, code: 'forbidden_origin', error: 'Requests from other websites are not allowed.' });
    }
  }

  let body;
  try {
    body = await readJson(req, MAX_BODY);
  } catch (err) {
    return send(res, err.status || 400, { success: false, code: 'bad_request', error: err.status === 413 ? 'Image is too large. Retake at a lower resolution.' : 'Body must be JSON.' });
  }

  const { imageBase64, mimeType, master, today, tiles } = body || {};
  // Optional enlarged crops of the same photo (from the browser) for the corrections check.
  const extraImages = Array.isArray(tiles) ? tiles.filter(t => typeof t === 'string' && t.length > 100).slice(0, 3).map(data => ({ data, mimeType: 'image/jpeg' })) : [];
  if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    return send(res, 400, { success: false, code: 'bad_request', error: 'imageBase64 is required.' });
  }
  if (!ALLOWED_MIME.includes(mimeType)) {
    return send(res, 400, { success: false, code: 'bad_request', error: `mimeType must be one of ${ALLOWED_MIME.join(', ')}.` });
  }
  const safeMaster = {
    machines: Array.isArray(master && master.machines) ? master.machines.slice(0, 500) : [],
    shifts: Array.isArray(master && master.shifts) ? master.shifts.slice(0, 50) : [],
    today: typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined
  };

  const started = Date.now();
  const deadline = started + totalBudgetMs();
  const request = { system: buildSystemPrompt(safeMaster), user: USER_INSTRUCTION, imageBase64, mimeType, deadline };

  // Corrections check: a second, narrow reading of the same photo (with enlarged crops) runs in
  // parallel. It looks only for crossed-out / overwritten values and re-reads numbers and lot codes.
  // It never fails the main read: if it errors or runs out of time, the records say "not double-checked".
  const allModels = configuredProviders().flatMap(p => p.models);
  const secondRead = process.env.AI_SECOND_READ !== '0' && allModels.length > 0
    ? runVision({ system: buildAuditPrompt(safeMaster), user: AUDIT_INSTRUCTION, imageBase64, mimeType, extraImages,
      exclude: allModels.length > 2 ? allModels.slice(0, 2) : [], deadline: deadline - 1500 })
      .then(r => ({ model: r.model, parsed: parseModelJson(r.text) }))
      .catch(err => ({ error: err.message }))
    : null;

  // A long reply occasionally comes back as broken JSON. Ask once more (the next model in the chain,
  // within the same time budget) before telling the operator; never guess at a broken reply.
  let result;
  let parsed;
  let parseError = null;
  const attempts = [];
  const unusable = [];
  for (let round = 0; round < 2 && !parsed; round++) {
    if (round > 0 && deadline - Date.now() < 6000) break;
    try {
      result = await runVision({ ...request, exclude: unusable });
    } catch (err) {
      if (round > 0 && parseError) break; // keep the original "bad reply" error, it is the real story
      return send(res, err.status || 502, { success: false, code: err.code || 'provider_error', error: err.message, attempts: [...attempts, ...(err.attempts || [])] });
    }
    attempts.push(...result.attempts);
    try {
      parsed = parseModelJson(result.text);
    } catch (err) {
      parseError = err;
      unusable.push(result.model);
      attempts[attempts.length - 1] = { ...attempts[attempts.length - 1], ok: false, error: `unusable reply: ${err.message}`, code: 'bad_model_output' };
    }
  }
  if (!parsed) {
    return send(res, 502, { success: false, code: 'bad_model_output', error: `The AI answered but not in the expected format (${parseError.message}). Retry once; if it repeats, retake the photo.`, provider: result.provider, model: result.model, attempts });
  }

  if (parsed.is_production_form === false) {
    const issues = Array.isArray(parsed.image_issues) ? parsed.image_issues.join('; ') : '';
    return send(res, 422, {
      success: false,
      code: 'unreadable',
      error: `The AI could not find a readable production form in this photo${issues ? `: ${issues}` : '.'}`,
      provider: result.provider,
      model: result.model
    });
  }

  const data = normalizeSheet(parsed, safeMaster);
  if (secondRead && data.entries.length) {
    // Wait for the corrections check up to the time budget (it started at the same time as the main read).
    const wait = Math.max(0, deadline - Date.now() - 1000);
    const second = await Promise.race([secondRead, new Promise(r => setTimeout(() => r({ error: 'the second reading ran out of time' }), wait))]);
    if (second.parsed) {
      data.second_read = { model: second.model, crops: extraImages.length, ...applyAudit(data, second.parsed) };
    } else {
      data.entries.forEach(e => { e.double_checked = false; });
      data.second_read = { model: second.model || null, skipped: second.error || 'no usable second reading' };
    }
  }
  if (!data.entries.length) {
    return send(res, 422, {
      success: false,
      code: 'unreadable',
      error: 'The AI found a form but no filled entries on it. If the form is filled in, retake the photo closer and in better light.',
      provider: result.provider,
      model: result.model
    });
  }
  return send(res, 200, {
    success: true,
    provider: result.provider,
    model: result.model,
    latency_ms: Date.now() - started,
    attempts,
    data,
    model_output: parsed
  });
};
