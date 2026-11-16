'use strict';

/**
 * Vision model providers. Both are free-tier capable:
 *   - gemini:     Google AI Studio (Gemini API), the default.
 *   - openrouter: any OpenAI-compatible endpoint, default OpenRouter ":free" models.
 *
 * Configuration (environment variables, never shipped to the browser):
 *   GEMINI_API_KEY        enables Gemini
 *   GEMINI_MODELS         comma list, tried in order (default below)
 *   GEMINI_API_BASE       override base URL (used by tests)
 *   OPENROUTER_API_KEY    enables the OpenAI-compatible fallback
 *   OPENROUTER_MODELS     comma list (default below)
 *   OPENROUTER_API_BASE   default https://openrouter.ai/api/v1
 *   AI_PROVIDER_ORDER     e.g. "gemini,openrouter" (default)
 */

const DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash']; // fastest + most available first; see SOLUTION_NOTE
const DEFAULT_OPENROUTER_MODELS = ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-super-vl:free'];
const ATTEMPT_TIMEOUT_MS = 25000; // one model attempt
const TOTAL_BUDGET_MS = 50000;   // whole fallback chain; Vercel stops the function at 60 s

class ProviderError extends Error {
  constructor(message, { status = 502, retryable = false, code = 'provider_error' } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.code = code;
  }
}

function list(envValue, fallback) {
  const v = (envValue || '').split(',').map(s => s.trim()).filter(Boolean);
  return v.length ? v : fallback;
}

function configuredProviders(env = process.env) {
  const order = list(env.AI_PROVIDER_ORDER, ['gemini', 'openrouter']);
  const out = [];
  for (const name of order) {
    if (name === 'gemini' && env.GEMINI_API_KEY) {
      out.push({
        name: 'gemini',
        apiKey: env.GEMINI_API_KEY.trim(),
        models: list(env.GEMINI_MODELS, DEFAULT_GEMINI_MODELS),
        base: (env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')
      });
    }
    if (name === 'openrouter' && env.OPENROUTER_API_KEY) {
      out.push({
        name: 'openrouter',
        apiKey: env.OPENROUTER_API_KEY.trim(),
        models: list(env.OPENROUTER_MODELS, DEFAULT_OPENROUTER_MODELS),
        base: (env.OPENROUTER_API_BASE || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
      });
    }
  }
  return out;
}

async function fetchWithTimeout(url, options, ms = ATTEMPT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new ProviderError('The AI model took too long to respond.', { status: 504, retryable: true, code: 'timeout' });
    throw new ProviderError(`Could not reach the AI provider: ${err.message}`, { status: 502, retryable: true, code: 'network' });
  } finally {
    clearTimeout(t);
  }
}

async function errorFromResponse(resp, provider, model) {
  let detail = '';
  try { detail = (await resp.text()).slice(0, 300); } catch (_) { /* ignore */ }
  if (resp.status === 429) {
    return new ProviderError(`${provider} free-tier rate limit reached for ${model}. Wait a minute and retry.`, { status: 429, retryable: true, code: 'rate_limited' });
  }
  if (resp.status === 401 || resp.status === 403) {
    const m = detail.match(/"message"\s*:\s*"([^"]+)/) || detail.match(/"error"\s*:\s*"([^"]+)/);
    const reason = m ? m[1].split(/(?<=\.)\s/)[0].slice(0, 200) : ''; // first sentence is enough for an operator
    return new ProviderError(`${provider} rejected the API key (${resp.status})${reason ? `: ${reason}` : '.'}`, { status: 502, retryable: false, code: 'auth' });
  }
  // 404 = model id not available to this key; 5xx = provider trouble. Both: try the next model.
  const brief = resp.status === 503 ? 'is overloaded right now' : `returned ${resp.status}`;
  return new ProviderError(`${provider} ${model} ${brief}.`, { status: 502, retryable: resp.status === 404 || resp.status >= 500, code: 'upstream' });
}

async function callGemini(p, model, { system, user, imageBase64, mimeType, timeoutMs }) {
  const url = `${p.base}/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: user }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  };
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.apiKey },
    body: JSON.stringify(body)
  }, timeoutMs);
  if (!resp.ok) throw await errorFromResponse(resp, 'Gemini', model);
  const data = await resp.json();
  const cand = data.candidates && data.candidates[0];
  if (!cand) {
    const block = data.promptFeedback && data.promptFeedback.blockReason;
    throw new ProviderError(`Gemini returned no answer${block ? ` (blocked: ${block})` : ''}.`, { status: 502, retryable: true });
  }
  const text = ((cand.content && cand.content.parts) || []).filter(x => typeof x.text === 'string' && !x.thought).map(x => x.text).join('');
  return { text, usage: data.usageMetadata || null };
}

async function callOpenAICompatible(p, model, { system, user, imageBase64, mimeType, timeoutMs }) {
  const resp = await fetchWithTimeout(`${p.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          { type: 'text', text: user }
        ] }
      ]
    })
  }, timeoutMs);
  if (!resp.ok) throw await errorFromResponse(resp, 'OpenRouter', model);
  const data = await resp.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof text !== 'string') throw new ProviderError('OpenRouter returned no answer.', { status: 502, retryable: true });
  return { text, usage: data.usage || null };
}

/**
 * Try each configured provider/model in order until one answers.
 * A response is "answered" when the provider returns text; parsing problems
 * are handled by the caller so they are reported, not silently retried forever.
 */
async function runVision(request, env = process.env) {
  const providers = configuredProviders(env);
  if (!providers.length) {
    throw new ProviderError('No AI provider is configured. Set GEMINI_API_KEY (free at aistudio.google.com) in the server environment.', { status: 503, code: 'not_configured' });
  }
  const attempts = [];
  let lastErr = null;
  const deadline = Date.now() + (Number(env.AI_TOTAL_BUDGET_MS) || TOTAL_BUDGET_MS);
  for (const p of providers) {
    for (const model of p.models) {
      const remaining = deadline - Date.now();
      if (remaining < 4000) {
        lastErr = lastErr || new ProviderError('The AI service is busy. Please retry in a minute.', { status: 504, retryable: true, code: 'timeout' });
        break;
      }
      const started = Date.now();
      try {
        const fn = p.name === 'gemini' ? callGemini : callOpenAICompatible;
        const out = await fn(p, model, { ...request, timeoutMs: Math.min(ATTEMPT_TIMEOUT_MS, remaining) });
        attempts.push({ provider: p.name, model, ok: true, ms: Date.now() - started });
        return { ...out, provider: p.name, model, attempts };
      } catch (err) {
        attempts.push({ provider: p.name, model, ok: false, ms: Date.now() - started, error: err.message });
        lastErr = err;
        if (!(err instanceof ProviderError) || (!err.retryable && err.code !== 'auth')) throw err;
        if (err.code === 'auth') break; // bad key: skip this provider's other models
      }
    }
  }
  lastErr.attempts = attempts;
  throw lastErr;
}

module.exports = { runVision, configuredProviders, ProviderError, DEFAULT_GEMINI_MODELS, DEFAULT_OPENROUTER_MODELS };
