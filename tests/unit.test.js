'use strict';

/**
 * Unit tests: domain rules, ERP contract, /api/erp and /api/extract (with the
 * provider HTTP calls stubbed). Run: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../aplyd/js/rules.js');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const MACHINES = [
  { id: 'mach-03', machine_code: 'L-03', name: 'Loom 03', is_active: true, default_unit: 'metres', min_expected_quantity: 100, max_expected_quantity: 500 },
  { id: 'mach-12', machine_code: 'L-12', name: 'Loom 12', is_active: true, default_unit: 'metres', min_expected_quantity: 150, max_expected_quantity: 800 },
  { id: 'mach-09', machine_code: 'L-09', name: 'Loom 09', is_active: false, default_unit: 'metres', min_expected_quantity: 50, max_expected_quantity: 300 }
];
const SHIFTS = [
  { id: 'shift-m', shift_code: 'M', name: 'Morning Shift', start_time: '06:00', end_time: '14:00' },
  { id: 'shift-e', shift_code: 'E', name: 'Evening Shift', start_time: '14:00', end_time: '22:00' },
  { id: 'shift-n', shift_code: 'N', name: 'Night Shift', start_time: '22:00', end_time: '06:00' }
];
const MASTER = { machines: MACHINES, shifts: SHIFTS, today: '2026-11-16' };

const f = (value, status = 'read', raw) => ({ value, raw_value: raw === undefined ? (value === null ? null : String(value)) : raw, status, reason: null });

function modelOutput(overrides = {}) {
  return {
    is_production_form: true,
    image_issues: [],
    fields: {
      machine: f('L-12'), production_date: f('2026-11-14', 'read', '14/11/2026'), shift: f('M'),
      production_quantity: f(612), production_unit: f('m'), material_reference: f('Combed Poplin 40s'),
      batch_reference: f('POP-40-881'), defects_count: f(0, 'read', '0'), defect_details: f(null, 'missing'),
      downtime_minutes: f(20, 'read', '20 min'), downtime_reason: f('Beam knotting'), remarks: f(null, 'missing'),
      ...overrides
    }
  };
}

function baseRecord(extra = {}) {
  return {
    id: 'rec-1', record_number: 'PR-2026-0001', status: 'pending_review',
    machine_id: 'mach-12', shift_id: 'shift-m', production_date: '2026-11-14', production_quantity: 612,
    production_unit: 'metres', defects_count: 0, downtime_minutes: 20, downtime_reason: 'Beam knotting',
    final_payload: R.normalizeExtraction(modelOutput(), MASTER), corrections: [], ...extra
  };
}

function mockReq(method, body) {
  const buf = Buffer.from(body === undefined ? '' : JSON.stringify(body));
  return { method, headers: {}, async *[Symbol.asyncIterator]() { if (buf.length) yield buf; } };
}
function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (s) => { res.body = s ? JSON.parse(s) : null; };
  return res;
}
async function call(handler, method, body) {
  const res = mockRes();
  await handler(mockReq(method, body), res);
  return res;
}

// ---------------------------------------------------------------------------
// parsers
// ---------------------------------------------------------------------------
test('machine codes normalise from common handwriting forms', () => {
  for (const [input, out] of [['L-12', 'L-12'], ['l12', 'L-12'], ['Loom 7', 'L-07'], ['7', 'L-07'], ['LOOM #03', 'L-03'], ['L - 3', 'L-03'], ['', null], [null, null], ['abc', null]]) {
    assert.equal(R.normalizeMachineCode(input), out, input);
  }
});

test('dates parse day-first and reject impossible dates', () => {
  assert.deepEqual(R.parseDate('14/11/2026'), { iso: '2026-11-14', ambiguous: false });
  assert.deepEqual(R.parseDate('10-11-26'), { iso: '2026-11-10', ambiguous: true });
  assert.deepEqual(R.parseDate('2026-11-14'), { iso: '2026-11-14', ambiguous: false });
  assert.equal(R.parseDate('31/02/2026'), null);
  assert.equal(R.parseDate('yesterday'), null);
});

test('durations convert to minutes', () => {
  for (const [input, out] of [['1 hr 15 min', 75], ['45 min', 45], ['2 hrs', 120], ['1:30', 90], [30, 30], ['0', 0], ['', null], ['none', null]]) {
    assert.equal(R.parseDurationMinutes(input), out, String(input));
  }
});

test('units and numbers parse', () => {
  assert.equal(R.normalizeUnit('m'), 'metres');
  assert.equal(R.normalizeUnit('Mtrs'), 'metres');
  assert.equal(R.normalizeUnit('yds'), 'yards');
  assert.equal(R.normalizeUnit('kg'), null);
  assert.equal(R.parseNumber('1,250.5 m'), 1250.5);
  assert.equal(R.parseNumber('nil'), null);
});

test('shift matching accepts codes and names', () => {
  assert.equal(R.matchShift('M', SHIFTS).shift_code, 'M');
  assert.equal(R.matchShift('night', SHIFTS).shift_code, 'N');
  assert.equal(R.matchShift('Evening Shift', SHIFTS).shift_code, 'E');
  assert.equal(R.matchShift('Shift E', SHIFTS).shift_code, 'E');
  assert.equal(R.matchShift('X', SHIFTS), null);
});

// ---------------------------------------------------------------------------
// normalisation
// ---------------------------------------------------------------------------
test('clean model output normalises to ready_for_approval', () => {
  const out = R.normalizeExtraction(modelOutput(), MASTER);
  assert.equal(out.overall_status, 'ready_for_approval');
  assert.equal(out.fields.machine.value, 'L-12');
  assert.equal(out.fields.production_unit.value, 'metres');
  assert.equal(out.fields.defects_count.value, 0, 'explicit zero is kept');
  assert.equal(out.fields.defects_count.status, 'read');
  assert.equal(out.fields.remarks.status, 'missing');
  assert.equal(out.fields.remarks.value, null);
});

test('unknown and inactive looms become invalid', () => {
  const unknown = R.normalizeExtraction(modelOutput({ machine: f('Loom 19') }), MASTER);
  assert.equal(unknown.fields.machine.status, 'invalid');
  assert.equal(unknown.fields.machine.value, 'L-19');
  assert.equal(unknown.overall_status, 'needs_review');
  const inactive = R.normalizeExtraction(modelOutput({ machine: f('L-09') }), MASTER);
  assert.equal(inactive.fields.machine.status, 'invalid');
  assert.match(inactive.fields.machine.reason, /inactive/);
});

test('model uncertainty, illegibility and bad values are preserved or flagged', () => {
  const out = R.normalizeExtraction(modelOutput({
    production_quantity: { value: 850, raw_value: '350/850?', status: 'uncertain', reason: 'first digit 3 or 8' },
    downtime_reason: { value: null, raw_value: null, status: 'illegible', reason: 'oil stain' },
    shift: f('Q'),
    production_date: f('2026-12-25', 'read', '25/12/2026'),
    defects_count: f(-2)
  }), MASTER);
  assert.equal(out.fields.production_quantity.status, 'uncertain');
  assert.equal(out.fields.production_quantity.value, 850);
  assert.equal(out.fields.downtime_reason.status, 'illegible');
  assert.equal(out.fields.shift.status, 'invalid');
  assert.equal(out.fields.production_date.status, 'invalid', 'future date');
  assert.equal(out.fields.defects_count.status, 'invalid', 'negative');
  assert.equal(out.overall_status, 'needs_review');
});

test('field aliases, written shift names and durations normalise', () => {
  const raw = modelOutput();
  raw.fields.machine_id = raw.fields.machine; delete raw.fields.machine;
  raw.fields.shift = f('Night');
  raw.fields.downtime_minutes = f('1 hr 15 min');
  raw.fields.production_date = f('10-11-26');
  const out = R.normalizeExtraction(raw, MASTER);
  assert.equal(out.fields.machine.value, 'L-12');
  assert.equal(out.fields.shift.value, 'N');
  assert.equal(out.fields.downtime_minutes.value, 75);
  assert.equal(out.fields.production_date.value, '2026-11-10');
});

test('garbage statuses and missing fields do not crash and are treated conservatively', () => {
  const out = R.normalizeExtraction({ fields: { machine: { value: 'L-03', status: 'definitely' } } }, MASTER);
  assert.equal(out.fields.machine.status, 'read');
  assert.equal(out.fields.production_quantity.status, 'missing');
  assert.equal(out.overall_status, 'needs_review', 'required fields missing');
  assert.doesNotThrow(() => R.normalizeExtraction(null, MASTER));
});

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------
const CTX = { machines: MACHINES, shifts: SHIFTS, records: [], today: '2026-11-16' };

test('clean record has no blockers', () => {
  const v = R.validateRecord(baseRecord(), CTX);
  assert.deepEqual(v.blockers, []);
});

test('required fields block approval', () => {
  const v = R.validateRecord(baseRecord({ machine_id: null, production_quantity: null }), CTX);
  assert.ok(v.blockers.some(b => b.field === 'machine_id'));
  assert.ok(v.blockers.some(b => b.field === 'production_quantity'));
});

test('AI flags block until corrected or confirmed', () => {
  const payload = R.normalizeExtraction(modelOutput({ production_quantity: { value: 350, raw_value: '350?', status: 'uncertain', reason: '3 or 8' } }), MASTER);
  const rec = baseRecord({ final_payload: payload, production_quantity: 350 });
  assert.ok(R.validateRecord(rec, CTX).blockers.some(b => b.field === 'production_quantity'));
  rec.corrections = [{ field_key: 'production_quantity', kind: 'confirmation', corrected_value: 350 }];
  assert.ok(!R.validateRecord(rec, CTX).blockers.some(b => b.field === 'production_quantity'));
  // A confirmation applies to the value it confirmed: a later change to the field needs a new look...
  rec.production_quantity = 380;
  assert.ok(R.validateRecord(rec, CTX).blockers.some(b => b.field === 'production_quantity'));
  // ...which a correction to that value is.
  rec.corrections.push({ field_key: 'production_quantity', kind: 'correction', original_value: 350, corrected_value: 380 });
  assert.ok(!R.validateRecord(rec, CTX).blockers.some(b => b.field === 'production_quantity'));
});

test('undoing a correction puts an AI flag back (undo is not a review)', () => {
  const payload = R.normalizeExtraction(modelOutput({ production_quantity: { value: 850, raw_value: '850?', status: 'uncertain', reason: '3 or 8' } }), MASTER);
  const rec = baseRecord({ final_payload: payload, production_quantity: 850, corrections: [
    { field_key: 'production_quantity', kind: 'correction', original_value: 850, corrected_value: 350 },
    { field_key: 'production_quantity', kind: 'undo', original_value: 350, corrected_value: 850 }
  ] });
  assert.ok(R.validateRecord(rec, CTX).blockers.some(b => b.field === 'production_quantity'));
  assert.equal(R.humanChanged(rec, 'production_quantity'), false, 'an undone edit is not a human change');
  rec.corrections.push({ field_key: 'production_quantity', kind: 'correction', original_value: 850, corrected_value: 350 });
  rec.production_quantity = 350;
  assert.equal(R.humanChanged(rec, 'production_quantity'), true);
});

test('blank optional fields do not block; blank required fields do', () => {
  const payload = R.normalizeExtraction(modelOutput({ batch_reference: f(null, 'missing') }), MASTER);
  const rec = baseRecord({ final_payload: payload });
  assert.deepEqual(R.validateRecord(rec, CTX).blockers, []);
});

test('business rules: range, downtime vs shift, future date, duplicates', () => {
  // Out-of-range output: a likely misread digit. Approval waits for a tick ("checked") or a correction.
  let v = R.validateRecord(baseRecord({ production_quantity: 950 }), CTX);
  assert.ok(v.blockers.some(b => b.field === 'production_quantity' && b.check && /maximum/.test(b.message)));
  v = R.validateRecord(baseRecord({ production_quantity: 950, corrections: [{ field_key: 'production_quantity', kind: 'check', corrected_value: 950 }] }), CTX);
  assert.ok(!v.blockers.some(b => b.field === 'production_quantity'), 'ticked "I checked this" for 950');
  v = R.validateRecord(baseRecord({ production_quantity: 990, corrections: [{ field_key: 'production_quantity', kind: 'check', corrected_value: 950 }] }), CTX);
  assert.ok(v.blockers.some(b => b.field === 'production_quantity'), 'a tick for 950 does not cover 990');

  v = R.validateRecord(baseRecord({ downtime_minutes: 500 }), CTX);
  assert.ok(v.blockers.some(b => b.field === 'downtime_minutes'));

  v = R.validateRecord(baseRecord({ shift_id: 'shift-n', downtime_minutes: 470, final_payload: null }), CTX);
  assert.ok(!v.blockers.some(b => b.field === 'downtime_minutes'), 'night shift wraps midnight (480 min)');
  assert.ok(v.warnings.some(w => w.field === 'downtime_minutes'));

  v = R.validateRecord(baseRecord({ production_date: '2026-11-20' }), CTX);
  assert.ok(v.blockers.some(b => b.field === 'production_date'));

  const other = { id: 'rec-0', record_number: 'PR-2026-0000', status: 'approved', machine_id: 'mach-12', shift_id: 'shift-m', production_date: '2026-11-14' };
  v = R.validateRecord(baseRecord(), { ...CTX, records: [other] });
  assert.ok(v.blockers.some(b => /double-count/.test(b.message)));
  v = R.validateRecord(baseRecord(), { ...CTX, records: [{ ...other, status: 'pending_review' }] });
  assert.ok(v.blockers.some(b => b.check && /already exists/.test(b.message)), 'possible duplicate of a pending record needs a check');
  v = R.validateRecord(baseRecord(), { ...CTX, records: [{ ...other, status: 'rejected' }] });
  assert.ok(![...v.warnings, ...v.blockers].some(w => /already exists/.test(w.message)), 'rejected records do not count');
});

test('defects and downtime without descriptions warn', () => {
  const v = R.validateRecord(baseRecord({ defects_count: 6, defect_details: null, downtime_minutes: 30, downtime_reason: '' }), CTX);
  assert.ok(v.warnings.some(w => w.field === 'defects_count'));
  assert.ok(v.warnings.some(w => w.field === 'defect_details'));
  assert.ok(v.warnings.some(w => w.field === 'downtime_reason'));
});

// ---------------------------------------------------------------------------
// ERP contract
// ---------------------------------------------------------------------------
test('ERP payload is built from master data and validates', () => {
  const rec = baseRecord({ status: 'approved', reviewed_at: '2026-11-16T10:00:00Z', reviewed_by_name: 'Priya', corrections: [{ field_key: 'production_quantity', kind: 'correction', original_value: 850, corrected_value: 612 }, { field_key: 'shift_id', kind: 'confirmation', corrected_value: 'shift-m' }] });
  const p = R.buildErpPayload(rec, CTX);
  assert.equal(p.machine_code, 'L-12');
  assert.equal(p.shift_code, 'M');
  assert.equal(p.production_quantity, 612);
  assert.equal(p.provenance.fields_corrected, 1);
  assert.equal(p.provenance.fields_confirmed, 1);
  assert.deepEqual(R.validateErpPayload(p), []);
  assert.ok(R.validateErpPayload({ ...p, machine_code: null }).length > 0);
  assert.ok(R.validateErpPayload({ ...p, production_quantity: -1 }).length > 0);
  assert.ok(R.validateErpPayload({ ...p, production_unit: 'kg' }).length > 0);
  assert.ok(R.validateErpPayload(null).length > 0);
});

test('ERP reference is deterministic per idempotency key', () => {
  const a = R.erpReference('APLYD-rec-1', '2026-11-16T00:00:00Z');
  assert.equal(a, R.erpReference('APLYD-rec-1', '2026-11-16T00:00:00Z'));
  assert.notEqual(a, R.erpReference('APLYD-rec-2', '2026-11-16T00:00:00Z'));
  assert.match(a, /^ERP-2026-[0-9A-F]{8}$/);
});

// ---------------------------------------------------------------------------
// /api/erp
// ---------------------------------------------------------------------------
test('/api/erp: method, validation, idempotency, simulated failure', async () => {
  const erp = require('../api/erp.js');
  assert.equal((await call(erp, 'GET')).statusCode, 405);
  const bad = await call(erp, 'POST', { payload: { schema: 'nope' } });
  assert.equal(bad.statusCode, 422);
  assert.equal(bad.body.status, 'REJECTED');

  const payload = R.buildErpPayload(baseRecord({ reviewed_at: '2026-11-16T10:00:00Z' }), CTX);
  const ok1 = await call(erp, 'POST', { payload });
  const ok2 = await call(erp, 'POST', { payload });
  assert.equal(ok1.statusCode, 200);
  assert.equal(ok1.body.status, 'ACKNOWLEDGED');
  assert.equal(ok1.body.erp_reference, ok2.body.erp_reference, 'same key, same reference');

  const timeout = await call(erp, 'POST', { payload, simulate_failure: true });
  assert.equal(timeout.statusCode, 504);
  assert.equal(timeout.body.retryable, true);

  const notJson = mockRes();
  await erp({ method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from('{oops'); } }, notJson);
  assert.equal(notJson.statusCode, 400);
});

// ---------------------------------------------------------------------------
// /api/extract (provider HTTP stubbed)
// ---------------------------------------------------------------------------
const IMG = 'A'.repeat(200);
const EXTRACT_BODY = { imageBase64: IMG, mimeType: 'image/jpeg', master: { machines: MACHINES, shifts: SHIFTS }, today: '2026-11-16' };

function withEnv(env, fn) {
  const keys = ['GEMINI_API_KEY', 'GEMINI_MODELS', 'GEMINI_API_BASE', 'OPENROUTER_API_KEY', 'OPENROUTER_MODELS', 'OPENROUTER_API_BASE', 'AI_PROVIDER_ORDER', 'AI_TOTAL_BUDGET_MS', 'AI_SECOND_READ'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  keys.forEach(k => delete process.env[k]);
  // The second reading has its own tests; elsewhere it would consume the stubbed replies.
  Object.assign(process.env, { AI_SECOND_READ: '0' }, env);
  return Promise.resolve(fn()).finally(() => {
    keys.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  });
}

function stubFetch(responder) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
    const r = await responder(url, calls.length, JSON.parse(opts.body));
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.json,
      text: async () => (typeof r.json === 'string' ? r.json : JSON.stringify(r.json || {}))
    };
  };
  return { calls, restore: () => { global.fetch = original; } };
}

const geminiReply = (obj) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }], usageMetadata: {} } });

test('/api/extract: not configured -> 503 with clear message; GET reports status', async () => {
  const extract = require('../api/extract.js');
  await withEnv({}, async () => {
    const get = await call(extract, 'GET');
    assert.equal(get.body.configured, false);
    const res = await call(extract, 'POST', EXTRACT_BODY);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'not_configured');
    assert.match(res.body.error, /GEMINI_API_KEY/);
  });
});

test('/api/extract: input validation', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'k' }, async () => {
    assert.equal((await call(extract, 'POST', { ...EXTRACT_BODY, mimeType: 'image/gif' })).statusCode, 400);
    assert.equal((await call(extract, 'POST', { ...EXTRACT_BODY, imageBase64: '' })).statusCode, 400);
    assert.equal((await call(extract, 'PUT', EXTRACT_BODY)).statusCode, 405);
  });
});

test('/api/extract: Gemini success is normalised against master data; key stays server-side', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'secret-key', GEMINI_MODELS: 'm1' }, async () => {
    const stub = stubFetch(() => geminiReply(modelOutput({ machine: f('Loom 3', 'read', 'Loom 3') })));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.model, 'm1');
      assert.equal(res.body.data.entries.length, 1, 'a legacy single-form reply becomes one entry');
      assert.equal(res.body.data.entries[0].fields.machine.value, 'L-03');
      assert.equal(stub.calls[0].headers['x-goog-api-key'], 'secret-key');
      assert.match(stub.calls[0].url, /models\/m1:generateContent$/);
      const sys = stub.calls[0].body.systemInstruction.parts[0].text;
      assert.match(sys, /L-03, L-12, L-09/, 'loom master is in the prompt');
      assert.equal(stub.calls[0].body.contents[0].parts[0].inline_data.data, IMG);
      assert.ok(!JSON.stringify(res.body).includes('secret-key'));
    } finally { stub.restore(); }
  });
});

test('/api/extract: rate limit on first model falls through to the next model', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1,m2' }, async () => {
    const stub = stubFetch((url) => (url.includes('m1') ? { status: 429, json: { error: 'quota' } } : geminiReply(modelOutput())));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.model, 'm2');
      assert.equal(res.body.attempts.length, 2);
    } finally { stub.restore(); }
  });
});

test('/api/extract: all models rate-limited -> 429 with retry message', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1,m2' }, async () => {
    const stub = stubFetch(() => ({ status: 429, json: {} }));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 429);
      assert.equal(res.body.code, 'rate_limited');
    } finally { stub.restore(); }
  });
});

test('/api/extract: bad Gemini key falls back to OpenRouter when configured', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'bad', GEMINI_MODELS: 'g1,g2', OPENROUTER_API_KEY: 'or', OPENROUTER_MODELS: 'o1' }, async () => {
    const stub = stubFetch((url) => (url.includes('googleapis')
      ? { status: 403, json: {} }
      : { status: 200, json: { choices: [{ message: { content: '```json\n' + JSON.stringify(modelOutput()) + '\n```' } }] } }));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.provider, 'openrouter');
      assert.equal(stub.calls.length, 2, 'skips g2 after an auth failure');
      assert.equal(stub.calls[1].headers.Authorization, 'Bearer or');
    } finally { stub.restore(); }
  });
});

test('/api/extract: "not a form" -> 422 unreadable; garbage reply -> 502', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1' }, async () => {
    let stub = stubFetch(() => geminiReply({ is_production_form: false, image_issues: ['photo shows fabric, no form'], fields: {} }));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 422);
      assert.equal(res.body.code, 'unreadable');
      assert.match(res.body.error, /fabric/);
    } finally { stub.restore(); }

    for (const reply of ['Sorry, I cannot help with that.', '"just a string"', '[1,2,3]', '{"is_production_form": true}', '']) {
      stub = stubFetch(() => geminiReply(reply));
      try {
        const res = await call(extract, 'POST', EXTRACT_BODY);
        assert.equal(res.statusCode, 502, `reply ${JSON.stringify(reply)}`);
        assert.equal(res.body.code, 'bad_model_output');
      } finally { stub.restore(); }
    }
  });
});

test('/api/extract: a hanging provider is cut off within the total time budget', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'slow1,slow2', AI_TOTAL_BUDGET_MS: '4500' }, async () => {
    const original = global.fetch;
    global.fetch = (url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    });
    const started = Date.now();
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      const took = Date.now() - started;
      assert.equal(res.statusCode, 504);
      assert.equal(res.body.code, 'timeout');
      assert.ok(took < 6000, `finished in ${took} ms`);
    } finally { global.fetch = original; }
  });
});

test('/api/extract: an overloaded (503) model falls through with a readable message', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'busy,ok' }, async () => {
    const stub = stubFetch((url) => (url.includes('busy') ? { status: 503, json: { error: { message: 'high demand' } } } : geminiReply(modelOutput())));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.model, 'ok');
      assert.match(res.body.attempts[0].error, /overloaded/);
    } finally { stub.restore(); }
  });
});

test('parsers are strict: unclear text is flagged, never silently truncated', () => {
  for (const [i, o] of [['L-1O', null], ['L-12A', null], ['Loom l2', null], ['Loom 99 (Unknown)', null], ['Loom No. 7', 'L-07'], ['l-12', 'L-12']]) assert.equal(R.normalizeMachineCode(i), o, i);
  for (const [i, o] of [['3S0', null], ['1,2O0', null], ['350 / 850', null], ['12,5', null], ['1,250', 1250], ['1,250.5 mtrs', 1250.5], ['-5', -5]]) assert.equal(R.parseNumber(i), o, i);
  for (const [i, o] of [['1h30', 90], ['1.5 hrs', 90], ['1h3x', null], ['ten', null]]) assert.equal(R.parseDurationMinutes(i), o, i);
  for (const [i, o] of [['2026/11/14', '2026-11-14'], ['14 Nov 2026', '2026-11-14'], ['14-Nov-26', '2026-11-14'], ['14th November, 2026', '2026-11-14'], ['14 Foo 2026', null]]) {
    const r = R.parseDate(i);
    assert.equal(r && r.iso, o, i);
  }
  const out = R.normalizeExtraction(modelOutput({ production_quantity: f('3S0'), machine: f('L-1O') }), MASTER);
  assert.equal(out.fields.production_quantity.status, 'invalid');
  assert.equal(out.fields.production_quantity.value, null);
  assert.equal(out.fields.machine.status, 'invalid');
});

test('/api/extract: cross-site browser requests are refused, same-origin allowed', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1' }, async () => {
    const stub = stubFetch(() => geminiReply(modelOutput()));
    try {
      const evil = mockReq('POST', EXTRACT_BODY); evil.headers = { origin: 'https://evil.example', host: 'aplyd.vercel.app' };
      let res = mockRes(); await extract(evil, res);
      assert.equal(res.statusCode, 403);
      assert.equal(stub.calls.length, 0, 'provider never called');
      const same = mockReq('POST', EXTRACT_BODY); same.headers = { origin: 'https://aplyd.vercel.app', host: 'aplyd.vercel.app' };
      res = mockRes(); await extract(same, res);
      assert.equal(res.statusCode, 200);
    } finally { stub.restore(); }
  });
});

// ---------------------------------------------------------------------------
// Multi-entry sheets (register pages, several slips in one photo)
// ---------------------------------------------------------------------------
const row = (loom, qty, extra = {}) => ({ machine: f(loom), production_quantity: f(qty), production_unit: f('m'), ...extra });

test('normalizeSheet: header values fill every row; rows stay separate', () => {
  const sheet = R.normalizeSheet({
    is_production_form: true, rows_detected: 3,
    header: { production_date: f('2026-10-31', 'read', '31/10/2026'), shift: f('M') },
    entries: [row('L-01', 512), row('L-02', 498), row('L-03', 301, { shift: f('E') })]
  }, MASTER);
  assert.equal(sheet.entries.length, 3);
  assert.equal(sheet.incomplete, false);
  assert.deepEqual(sheet.entries.map(e => e.fields.machine.value), ['L-01', 'L-02', 'L-03']);
  assert.deepEqual(sheet.entries.map(e => e.fields.production_quantity.value), [512, 498, 301]);
  assert.equal(sheet.entries[0].fields.production_date.value, '2026-10-31', 'date inherited from header');
  assert.equal(sheet.entries[1].fields.shift.value, 'M', 'shift inherited from header');
  assert.equal(sheet.entries[2].fields.shift.value, 'E', 'a row-level value wins over the header');
});

test('normalizeSheet: blank rows dropped, legacy {fields} accepted, mismatch and cap flagged', () => {
  const blank = { machine: f(null, 'missing'), production_quantity: f(null, 'missing') };
  let s = R.normalizeSheet({ header: { shift: f('M') }, entries: [row('L-01', 500), blank, {}] }, MASTER);
  assert.equal(s.entries.length, 1, 'empty rows are not records');

  s = R.normalizeSheet(modelOutput(), MASTER);
  assert.equal(s.entries.length, 1, 'old single-form reply still works');
  assert.equal(s.entries[0].fields.machine.value, 'L-12');

  s = R.normalizeSheet({ rows_detected: 6, entries: [row('L-01', 500), row('L-02', 400)] }, MASTER);
  assert.equal(s.incomplete, true, 'model saw 6 rows but returned 2');
  assert.equal(s.rows_detected, 6);

  s = R.normalizeSheet({ entries: Array.from({ length: 35 }, (_, i) => row(`L-${String((i % 12) + 1).padStart(2, '0')}`, 300 + i)) }, MASTER);
  assert.equal(s.entries.length, R.MAX_ENTRIES);
  assert.equal(s.incomplete, true, 'over the cap is reported, not silently dropped');

  assert.equal(R.normalizeSheet({ entries: [] }, MASTER).entries.length, 0);
});

test('validateRecord: an incomplete sheet warns on its records', () => {
  const v = R.validateRecord(baseRecord({ sheet_incomplete: true, sheet_rows: 5, sheet_rows_detected: 6 }), CTX);
  assert.ok(v.warnings.some(w => /saw 6 filled rows/.test(w.message)));
});

test('/api/extract: a register page returns one entry per row; a form with no entries is refused', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1' }, async () => {
    let stub = stubFetch(() => geminiReply({ is_production_form: true, rows_detected: 2, header: { production_date: f('31/10/2026'), shift: f('M') }, entries: [row('L-01', 512), row('L-02', 498)] }));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.entries.length, 2);
      assert.equal(res.body.data.entries[1].fields.production_date.value, '2026-10-31');
    } finally { stub.restore(); }

    stub = stubFetch(() => geminiReply({ is_production_form: true, rows_detected: 0, header: {}, entries: [{}] }));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 422);
      assert.equal(res.body.code, 'unreadable');
    } finally { stub.restore(); }
  });
});

// ---------------------------------------------------------------------------
// Downtime reason codes, "not on form", photo locations
// ---------------------------------------------------------------------------
test('downtime reasons map to codes (English, Hinglish, longest match wins)', () => {
  const code = (t) => (R.matchReason(t) || {}).code;
  assert.equal(code('Loom cleaning'), 'CLEAN');
  assert.equal(code('Cleaning'), 'CLEAN');
  assert.equal(code('safai'), 'CLEAN');
  assert.equal(code('light gayi'), 'POWER');
  assert.equal(code('Warp break'), 'BREAK');
  assert.equal(code('Beam knotting'), 'BEAM');
  assert.equal(code('Pirn change'), 'PIRN');
  assert.equal(code('Lubrication'), 'MAINT');
  assert.equal(code('लाइट गई'), 'POWER', 'Devanagari');
  assert.equal(code('सफाई'), 'CLEAN');
  assert.equal(code('waited for supervisor signature'), undefined);
  const p = R.buildErpPayload(baseRecord({ status: 'approved', reviewed_at: '2026-11-16T10:00:00Z', downtime_reason: 'saaf safai' }), CTX);
  assert.equal(p.downtime_reason_code, 'CLEAN');
  assert.equal(R.buildErpPayload(baseRecord({ downtime_reason: 'tea break' }), CTX).downtime_reason_code, 'OTHER');
  const v = R.validateRecord(baseRecord({ downtime_reason: 'tea break' }), { ...CTX, reasons: R.DEFAULT_DOWNTIME_REASONS });
  assert.ok(v.warnings.some(w => w.field === 'downtime_reason' && /Other/.test(w.message)));
});

test('fabric name similarity for "did you mean" hints', () => {
  assert.ok(R.similarity('Poplin 40', 'Poplin 40s') > 0.85);
  assert.ok(R.similarity('Combed Poplin 40s', 'Denim 3/1') < 0.5);
});

test('register columns that do not exist are "not on form", and their warnings are skipped', () => {
  const row = (m) => ({ machine: f(m), production_quantity: f(400), defects_count: f(2, 'read', '2'), downtime_minutes: f(10, 'read', '10') });
  const sheet = R.normalizeSheet({ header: { production_date: f('14/11/2026', 'read', '14/11/2026'), shift: f('M') }, entries: [row('L-01'), row('L-02'), row('L-03')] }, MASTER);
  assert.equal(sheet.entries[0].fields.defect_details.not_on_form, true, 'blank on every row of a 3-row sheet');
  assert.ok(!sheet.entries[0].fields.production_date.not_on_form, 'header fields are on the form');
  const rec = baseRecord({ final_payload: sheet.entries[0], defects_count: 2, defect_details: null, downtime_minutes: 10, downtime_reason: null });
  const v = R.validateRecord(rec, CTX);
  assert.ok(!v.warnings.some(w => w.field === 'defect_details' || w.field === 'downtime_reason'));
  // A single slip that has the box but left it empty still warns.
  const slip = R.normalizeSheet({ fields_on_form: ['machine', 'defect_details'], entries: [row('L-04')] }, MASTER);
  assert.ok(!slip.entries[0].fields.defect_details.not_on_form);
  assert.equal(slip.entries[0].fields.remarks.not_on_form, true, 'the model said the form has no remarks box');
});

test('photo locations: valid 0-1000 boxes are kept, junk is dropped', () => {
  assert.deepEqual(R.cleanBox([100, 200, 150, 400]), [100, 200, 150, 400]);
  assert.equal(R.cleanBox([100, 200, 100, 400]), null, 'zero height');
  assert.equal(R.cleanBox([100, 200, 1500, 400]), null, 'out of range');
  assert.equal(R.cleanBox('100,200'), null);
  const sheet = R.normalizeSheet({ entries: [{ row_box: [370, 130, 410, 860], machine: { ...f('L-01'), box: [370, 130, 410, 190] }, production_quantity: { ...f(512), box: [9, 9, 9] } }] }, MASTER);
  assert.deepEqual(sheet.entries[0].row_box, [370, 130, 410, 860]);
  assert.deepEqual(sheet.entries[0].fields.machine.box, [370, 130, 410, 190]);
  assert.equal(sheet.entries[0].fields.production_quantity.box, undefined);
});

test('the model contradicting itself (transcribed "850", value 350) is flagged, never trusted', () => {
  const c = R.normalizeExtraction(modelOutput({
    production_quantity: { value: 350, raw_value: '850', status: 'read', reason: null },
    downtime_minutes: { value: 75, raw_value: '1 hr 15 min', status: 'read', reason: null },
    production_date: { value: '2026-11-12', raw_value: '12/11/2026', status: 'read', reason: null }
  }), MASTER);
  assert.equal(c.fields.production_quantity.status, 'uncertain');
  assert.match(c.fields.production_quantity.reason, /850/);
  assert.equal(c.fields.downtime_minutes.status, 'read', '"1 hr 15 min" really is 75 minutes');
  assert.equal(c.fields.production_date.status, 'read', 'day-first date agrees with its ISO value');
});

test('/api/extract: a broken JSON reply is retried once on the next model before the operator sees an error', async () => {
  const extract = require('../api/extract.js');
  await withEnv({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1,m2' }, async () => {
    const stub = stubFetch((url) => (url.includes('m1') ? geminiReply('{"entries": [{"machine": {"box": [1,2,3,4]]}') : geminiReply(modelOutput())));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.model, 'm2');
      assert.ok(res.body.attempts.some(a => a.model === 'm1' && !a.ok && /unusable reply/.test(a.error)), 'the unusable reply is recorded');
    } finally { stub.restore(); }
  });
  await withEnv({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'only' }, async () => {
    let n = 0;
    const stub = stubFetch(() => (++n === 1 ? geminiReply('not json') : geminiReply(modelOutput())));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 200, 'with one model, it is asked again');
      assert.equal(n, 2);
    } finally { stub.restore(); }
  });
});

test('an implausible defect count (a 2 written over a 3 read as 32) needs a check; a high but plausible one only warns', () => {
  let v = R.validateRecord(baseRecord({ defects_count: 32, defect_details: 'Reed mark' }), CTX);
  assert.ok(v.blockers.some(b => b.field === 'defects_count' && b.check));
  v = R.validateRecord(baseRecord({ defects_count: 6, defect_details: 'Reed mark' }), CTX);
  assert.ok(!v.blockers.some(b => b.field === 'defects_count') && v.warnings.some(w => w.field === 'defects_count'));
});

// ---------------------------------------------------------------------------
// Real-world test fixes (Nov 2026): the AI's silent mistakes on 15 handwritten photos
// ---------------------------------------------------------------------------
test('lot numbers: look-alike characters, lost hyphens and crossed-out starts are caught with a suggestion', () => {
  const cases = [
    ['V01-60-446', 'Voile 60s', 'VOI-60-446'],
    ['lin-55405', 'Linen Blend', 'LIN-55-405'],
    ['Ock-12-412', 'Duck Canvas', 'DCK-12-412'],
    ['Vol-60-420', 'Voile 60s', 'VOI-60-420'],
    ['CAM CMB-60-401', 'Cambric', 'CMB-60-401']
  ];
  for (const [value, material, want] of cases) {
    const lot = R.checkLot(value, material);
    assert.equal(lot.ok, false, value);
    assert.equal(lot.suggestion, want, value);
    const v = R.validateRecord(baseRecord({ batch_reference: value, material_reference: material }), CTX);
    assert.ok(v.blockers.some(b => b.field === 'batch_reference' && b.check), `${value} needs a check`);
  }
  // Correct codes (any case) pass; an unusual format with nothing to suggest only warns.
  for (const [ok, m] of [['VOI-60-446', 'Voile 60s'], ['cmb-60-401', 'Cambric'], ['POP-40-881', 'Combed Poplin 40s']]) assert.equal(R.checkLot(ok, m).ok, true, ok);
  assert.equal(R.checkLot('VOI-60-446', 'Combed Poplin 40s').ok, false, 'prefix must match the fabric');
  const v = R.validateRecord(baseRecord({ batch_reference: 'B-2231' }), CTX);
  assert.ok(!v.blockers.some(b => b.field === 'batch_reference') && v.warnings.some(w => w.field === 'batch_reference'));
  // Ticking "checked against the photo" clears the check.
  const rec = baseRecord({ batch_reference: 'V01-60-446', material_reference: 'Voile 60s' });
  rec.corrections = [{ field_key: 'batch_reference', kind: 'check', corrected_value: 'V01-60-446' }];
  assert.ok(!R.validateRecord(rec, CTX).blockers.some(b => b.field === 'batch_reference'));
});

test('fabric one or two letters off a known fabric gets a "did you mean"; new fabrics do not', () => {
  assert.equal(R.nearFabric('Poplin 405'), 'Poplin 40s');
  assert.equal(R.nearFabric('Denin 3/1'), 'Denim 3/1');
  assert.equal(R.nearFabric('Poplin 40s'), null);
  assert.equal(R.nearFabric('Combed Poplin 40s'), null);
  assert.equal(R.nearFabric('Cotton Cambric'), null);
  const v = R.validateRecord(baseRecord({ material_reference: 'Poplin 405' }), CTX);
  assert.ok(v.warnings.some(w => w.field === 'material_reference' && w.suggestion === 'Poplin 40s'));
});

test('defect details that are only a number, or with zero defects, are flagged as a likely scribble', () => {
  let v = R.validateRecord(baseRecord({ defects_count: 1, defect_details: '0' }), CTX);
  assert.ok(v.warnings.some(w => w.field === 'defect_details' && /only a number/.test(w.message)));
  v = R.validateRecord(baseRecord({ defects_count: 0, defect_details: 'Float' }), CTX);
  assert.ok(v.warnings.some(w => w.field === 'defect_details' && /count is 0/.test(w.message)));
  v = R.validateRecord(baseRecord({ defects_count: 1, defect_details: 'Float' }), CTX);
  assert.ok(!v.warnings.some(w => w.field === 'defect_details'));
});

test('crossed-out writing is carried from the AI and shown as a warning until checked', () => {
  const out = modelOutput();
  out.fields.batch_reference = { value: 'CMB-60-401', raw_value: 'CMB-60-401', status: 'read', reason: null, struck_out: true };
  const rec = baseRecord({ final_payload: R.normalizeExtraction(out, MASTER), batch_reference: 'CMB-60-401', material_reference: 'Cambric' });
  assert.equal(rec.final_payload.fields.batch_reference.struck_out, true);
  assert.ok(R.validateRecord(rec, CTX).warnings.some(w => w.field === 'batch_reference' && /crossed-out/.test(w.message)));
  rec.corrections = [{ field_key: 'batch_reference', kind: 'check', corrected_value: 'CMB-60-401' }];
  assert.ok(!R.validateRecord(rec, CTX).warnings.some(w => /crossed-out/.test(w.message)));
});

test('downtime reasons: Shuttle change is a code, and near-miss spellings map with a soft warning', () => {
  const ctx = { ...CTX, reasons: R.DEFAULT_DOWNTIME_REASONS };
  assert.equal(R.resolveReason('Shuttle change').reason.code, 'SHUTTLE');
  for (const [t, code] of [['Pinn change', 'PIRN'], ['Shuttlen Change', 'SHUTTLE'], ['bean change', 'BEAM']]) {
    const hit = R.resolveReason(t);
    assert.equal(hit.reason.code, code, t);
    assert.equal(hit.exact, false, t);
    const v = R.validateRecord(baseRecord({ downtime_reason: t }), ctx);
    assert.ok(v.warnings.some(w => w.field === 'downtime_reason' && /spelling differs/.test(w.message)), t);
    assert.equal(R.buildErpPayload(baseRecord({ downtime_reason: t }), ctx).downtime_reason_code, code);
  }
  assert.equal(R.resolveReason('Blank'), null);
  assert.equal(R.resolveReason('xyz'), null);
});

test('row boxes: a box wrapped in an extra array is accepted; a missing row box is built from the field boxes', () => {
  assert.deepEqual(R.cleanBox([[486, 102, 545, 882]]), [486, 102, 545, 882]);
  const out = modelOutput({
    machine: { ...f('L-12'), box: [501, 105, 528, 178] },
    production_quantity: { ...f(612), box: [517, 191, 534, 268] },
    production_unit: { ...f('m'), box: [263, 227, 271, 279] },
    batch_reference: { ...f('POP-40-881'), box: [486, 421, 542, 521] }
  });
  assert.deepEqual(R.normalizeExtraction(out, MASTER).row_box, [486, 105, 542, 521]);
  out.row_box = [[480, 100, 550, 900]];
  assert.deepEqual(R.normalizeExtraction(out, MASTER).row_box, [480, 100, 550, 900]);
});

test('second reading: disagreements are flagged with the other value kept; agreement and small wording changes are not', () => {
  const sheet = (fields) => R.normalizeSheet(modelOutput(fields), MASTER);
  const main = sheet({ production_quantity: f(412, 'read', '412'), remarks: f('Smooth run') });
  const second = sheet({ production_quantity: f(421, 'read', '421'), remarks: f('Smooth run.') });
  const out = R.compareReadings(main, second);
  assert.deepEqual(out.disagreed.map(d => d.field), ['production_quantity']);
  const q = main.entries[0].fields.production_quantity;
  assert.equal(q.status, 'uncertain');
  assert.equal(q.alt, 421);
  assert.match(q.reason, /second AI reading gave "421"/);
  assert.equal(main.entries[0].overall_status, 'needs_review');
  assert.equal(main.entries[0].fields.remarks.status, 'read');
  // A blank on one reading and a value on the other also counts (a scribble read as "0").
  const m2 = sheet({ defect_details: f(null, 'missing') }), s2 = sheet({ defect_details: f('0') });
  R.compareReadings(m2, s2);
  assert.equal(m2.entries[0].fields.defect_details.status, 'uncertain');
  assert.equal(m2.entries[0].fields.defect_details.alt, '0');
});

test('/api/extract: the corrections check runs in parallel with enlarged crops; a crossed-out value is caught; its failure never fails the read', async () => {
  const extract = require('../api/extract.js');
  const isAudit = (body) => /check photos of handwritten/.test(body.systemInstruction.parts[0].text);
  await withEnv({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1,m2', AI_SECOND_READ: '1' }, async () => {
    const audit = { entries: [{ machine: 'L-12', corrections: [{ field: 'production_quantity', struck: '612', final: '621' }], reread: { production_quantity: '621', batch_reference: 'POP-40-881' } }] };
    let stub = stubFetch((url, n, body) => geminiReply(isAudit(body) ? audit : modelOutput()));
    try {
      const res = await call(extract, 'POST', { ...EXTRACT_BODY, tiles: [IMG, IMG] });
      assert.equal(res.statusCode, 200);
      const q = res.body.data.entries[0].fields.production_quantity;
      assert.equal(q.value, 621, 'the main read used the crossed-out value; the final one is used instead');
      assert.equal(q.alt, 612);
      assert.equal(q.status, 'uncertain');
      assert.equal(res.body.data.second_read.corrections, 1);
      assert.equal(res.body.data.entries[0].double_checked, true);
      const auditCall = stub.calls.find(c => isAudit(c.body));
      assert.equal(auditCall.body.contents[0].parts.filter(x => x.inline_data).length, 3, 'photo + 2 enlarged crops');
      const mainCall = stub.calls.find(c => !isAudit(c.body));
      assert.equal(mainCall.body.contents[0].parts.filter(x => x.inline_data).length, 1, 'the main read gets the photo only');
    } finally { stub.restore(); }
    stub = stubFetch((url, n, body) => (isAudit(body) ? { status: 503, json: {} } : geminiReply(modelOutput())));
    try {
      const res = await call(extract, 'POST', EXTRACT_BODY);
      assert.equal(res.statusCode, 200, 'a failed corrections check never fails the request');
      assert.ok(res.body.data.second_read.skipped);
      assert.equal(res.body.data.entries[0].double_checked, false);
    } finally { stub.restore(); }
  });
});

test('two numbers in one number box (a correction) warn until checked', () => {
  const out = modelOutput({ production_quantity: f(421, 'read', '412 - 421') });
  const rec = baseRecord({ production_quantity: 421, final_payload: R.normalizeExtraction(out, MASTER) });
  assert.ok(R.validateRecord(rec, CTX).warnings.some(w => w.field === 'production_quantity' && /Two numbers/.test(w.message)));
  rec.corrections = [{ field_key: 'production_quantity', kind: 'check', corrected_value: 421 }];
  assert.ok(!R.validateRecord(rec, CTX).warnings.some(w => /Two numbers/.test(w.message)));
});

test('crossed-out text (~~412~~ 421): the struck value is never used, and the field always needs a check', () => {
  const field = (x) => R.normalizeExtraction(modelOutput({ production_quantity: x }), MASTER).fields.production_quantity;
  let q = field({ value: 412, raw_value: '~~412~~ 421', status: 'read' });
  assert.equal(q.value, 421);
  assert.equal(q.alt, 412);
  assert.equal(q.status, 'uncertain');
  q = field({ value: 421, raw_value: '~~412~~ 421', status: 'read' });
  assert.equal(q.value, 421);
  assert.equal(q.struck_out, true);
  const rec = baseRecord({ production_quantity: 421, final_payload: R.normalizeExtraction(modelOutput({ production_quantity: { value: 421, raw_value: '~~412~~ 421', status: 'read' } }), MASTER) });
  assert.ok(R.validateRecord(rec, CTX).warnings.some(w => w.field === 'production_quantity' && /crossed-out/.test(w.message) && /412/.test(w.message)));
});

test('corrections check: re-read disagreements need a check; an unsure lot re-read the same is cleared; numbers keep their flag', () => {
  const sheet = R.normalizeSheet(modelOutput({
    batch_reference: f('POP-40-881', 'uncertain', 'POP-40-881'), defects_count: f(0, 'uncertain', '0'), downtime_minutes: f(20, 'read', '20 min')
  }), MASTER);
  const out = R.applyAudit(sheet, { entries: [{ machine: 'L-12', corrections: [], reread: { batch_reference: 'pop-40-881', defects_count: '0', downtime_minutes: '25 min' } }] });
  const fl = sheet.entries[0].fields;
  assert.equal(fl.batch_reference.status, 'read');
  assert.equal(fl.defects_count.status, 'uncertain', 'a number the AI was unsure of stays flagged even if the re-read agrees');
  assert.equal(fl.downtime_minutes.status, 'uncertain');
  assert.equal(fl.downtime_minutes.alt, 25);
  assert.deepEqual(out.disagreed.map(d => d.field), ['downtime_minutes']);
  const rec = baseRecord({ final_payload: { ...sheet.entries[0], double_checked: false } });
  assert.ok(R.validateRecord(rec, CTX).warnings.some(w => /not double-checked/.test(w.message)));
});

test('an unsure fabric that exactly matches a known fabric is not flagged; a Hindi reason maps by its English meaning', () => {
  const fl = R.normalizeExtraction(modelOutput({
    material_reference: f('Voile 60s', 'uncertain', 'Voile 60s'),
    downtime_reason: { value: 'ताइ्रट गाई', raw_value: 'ताइ्रट गाई', status: 'read', meaning_en: 'power cut' }
  }), MASTER).fields;
  assert.equal(fl.material_reference.status, 'read');
  const rec = baseRecord({ downtime_reason: 'ताइ्रट गाई', final_payload: R.normalizeExtraction(modelOutput({ downtime_reason: { value: 'ताइ्रट गाई', raw_value: 'ताइ्रट गाई', status: 'read', meaning_en: 'power cut' } }), MASTER) });
  const ctx = { ...CTX, reasons: R.DEFAULT_DOWNTIME_REASONS };
  assert.equal(R.reasonOf(rec, ctx.reasons).reason.code, 'POWER');
  assert.equal(R.buildErpPayload(rec, ctx).downtime_reason_code, 'POWER');
  assert.ok(R.validateRecord(rec, ctx).warnings.some(w => /misread handwriting/.test(w.message)));
});
