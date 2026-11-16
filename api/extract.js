'use strict';

/**
 * POST /api/extract
 * Body: { imageBase64, mimeType, master: { machines: [{machine_code, name, is_active}], shifts: [{shift_code, name}] }, today? }
 * 200:  { success, provider, model, latency_ms, data: <5-state contract>, model_output: <raw parsed JSON> }
 * 422:  { success:false, code:'unreadable', error }   image is not a readable production form
 * 4xx/5xx: { success:false, code, error }
 *
 * GET /api/extract -> { configured, providers: [{name, models}] } (no secrets)
 */

const { send, readJson } = require('./_lib/http');
const { runVision, configuredProviders } = require('./_lib/providers');
const { buildSystemPrompt, USER_INSTRUCTION, parseModelJson } = require('./_lib/prompt');
const { normalizeExtraction } = require('../aplyd/js/rules.js');

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

  const { imageBase64, mimeType, master, today } = body || {};
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
  let result;
  try {
    result = await runVision({
      system: buildSystemPrompt(safeMaster),
      user: USER_INSTRUCTION,
      imageBase64,
      mimeType
    });
  } catch (err) {
    return send(res, err.status || 502, { success: false, code: err.code || 'provider_error', error: err.message, attempts: err.attempts });
  }

  let parsed;
  try {
    parsed = parseModelJson(result.text);
  } catch (err) {
    return send(res, 502, { success: false, code: 'bad_model_output', error: `The AI answered but not in the expected format (${err.message}). Retry once; if it repeats, retake the photo.`, provider: result.provider, model: result.model });
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

  const data = normalizeExtraction(parsed, safeMaster);
  return send(res, 200, {
    success: true,
    provider: result.provider,
    model: result.model,
    latency_ms: Date.now() - started,
    attempts: result.attempts,
    data,
    model_output: parsed
  });
};
