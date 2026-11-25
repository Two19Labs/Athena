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
const { buildSystemPrompt, USER_INSTRUCTION, parseModelJson } = require('./_lib/prompt');
const { normalizeSheet, compareReadings } = require('../aplyd/js/rules.js');

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
  const deadline = started + totalBudgetMs();
  const request = { system: buildSystemPrompt(safeMaster), user: USER_INSTRUCTION, imageBase64, mimeType, deadline };

  // Second opinion: a different model reads the same photo at the same time. Where the two readings
  // disagree, the field is flagged for a person and the other reading is offered as a one-tap choice.
  // It never delays or fails the main read: if it is slow or errors, the main reading is used alone.
  const allModels = configuredProviders().flatMap(p => p.models);
  const secondRead = process.env.AI_SECOND_READ !== '0' && allModels.length > 1
    ? runVision({ ...request, exclude: [allModels[0]], deadline: Math.min(deadline, started + 35000) })
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
    // Wait a little for the second reading if the main one finished first; never past the deadline.
    const wait = Math.max(0, Math.min(8000, deadline - Date.now() - 1000));
    const second = await Promise.race([secondRead, new Promise(r => setTimeout(() => r({ error: 'second reading was too slow' }), wait))]);
    if (second.parsed && second.model !== result.model && second.parsed.is_production_form !== false) {
      data.second_read = { model: second.model, ...compareReadings(data, normalizeSheet(second.parsed, safeMaster)) };
    } else {
      data.second_read = { model: second.model || null, skipped: second.error || (second.model === result.model ? 'same model as the main reading' : 'no usable second reading') };
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
