'use strict';

/**
 * Offline reliability benchmark: runs the REAL extraction endpoint (real AI
 * provider) over the labelled sample photos and scores the output.
 *
 *   GEMINI_API_KEY=... npm run benchmark     (or put the key in .env)
 *
 * Writes:
 *   aplyd/assets/sample-outputs/<id>.json   the system's actual output per sample
 *   aplyd/assets/benchmark/results.json     summary + per-field scores (shown on the Analytics page)
 *
 * Metrics
 *   field_accuracy     fields whose final value equals the ground truth (blank = null)
 *   silent_error_rate  fields that are wrong AND marked "read": the dangerous kind
 *   flag_recall        designed-hard fields (stain, ambiguous digit, unknown loom) the AI flagged
 *   blank_detection    blank fields returned as blank (not invented)
 *   unreadable_caught  non-form photos refused
 */

const fs = require('fs');
const path = require('path');
const { loadDotEnv } = require('../dev-server.js');
const R = require('../aplyd/js/rules.js');

loadDotEnv();
const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'samples.json'), 'utf8'));
const SAMPLE_DIR = path.join(ROOT, 'aplyd', 'assets', 'samples');
const OUT_DIR = path.join(ROOT, 'aplyd', 'assets', 'sample-outputs');
const RESULTS = path.join(ROOT, 'aplyd', 'assets', 'benchmark', 'results.json');
const DELAY_MS = Number(process.env.BENCHMARK_DELAY_MS || 7000); // stay under free-tier per-minute limits

// Same master data the app seeds (L-01..L-12, M/E/N).
const MASTER = {
  machines: Array.from({ length: 12 }, (_, i) => ({ machine_code: `L-${String(i + 1).padStart(2, '0')}`, name: `Loom ${i + 1}`, is_active: true })),
  shifts: [{ shift_code: 'M', name: 'Morning Shift' }, { shift_code: 'E', name: 'Evening Shift' }, { shift_code: 'N', name: 'Night Shift' }]
};

function same(a, b) {
  if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '';
  if (typeof b === 'number') return Number(a) === b;
  return String(a).trim().replace(/\s+/g, ' ').toLowerCase() === String(b).trim().replace(/\s+/g, ' ').toLowerCase();
}

async function extract(file) {
  const handler = require('../api/extract.js');
  const body = { imageBase64: fs.readFileSync(file).toString('base64'), mimeType: 'image/jpeg', master: MASTER, today: R.todayIso() };
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = JSON.parse(s); } };
  const req = { method: 'POST', body };
  await handler(req, res);
  return res;
}

(async () => {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    console.error('No AI key found. Set GEMINI_API_KEY (free at https://aistudio.google.com/apikey) in .env or the environment.');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true });

  const perSample = [];
  const fieldStats = Object.fromEntries(R.FIELD_DEFS.map(d => [d.key, { correct: 0, total: 0 }]));
  let total = 0, correct = 0, silent = 0, flagTotal = 0, flagHit = 0, blankTotal = 0, blankHit = 0, unreadTotal = 0, unreadHit = 0;
  let provider = null, model = null;
  const latencies = [];

  for (let i = 0; i < manifest.samples.length; i++) {
    const s = manifest.samples[i];
    const file = path.join(SAMPLE_DIR, `${s.id}.jpg`);
    process.stdout.write(`[${i + 1}/${manifest.samples.length}] ${s.id} … `);
    const started = Date.now();
    let res;
    try {
      res = await extract(file);
    } catch (err) {
      res = { statusCode: 0, body: { success: false, error: err.message } };
    }
    const ms = Date.now() - started;
    const out = { sample: s.id, condition: s.condition, http_status: res.statusCode, latency_ms: ms, response: res.body };
    fs.writeFileSync(path.join(OUT_DIR, `${s.id}.json`), JSON.stringify(out, null, 2));

    const row = { id: s.id, condition: s.condition, status: res.statusCode, latency_ms: ms, fields: {} };
    if (s.expect.unreadable) {
      unreadTotal++;
      const ok = res.statusCode === 422;
      if (ok) unreadHit++;
      row.result = ok ? 'refused (correct)' : `NOT refused (${res.statusCode})`;
      console.log(row.result);
    } else if (res.statusCode !== 200) {
      row.result = `error ${res.statusCode}: ${res.body && res.body.error}`;
      console.log(row.result);
      // Count every field as wrong so failures lower the score instead of disappearing.
      for (const def of R.FIELD_DEFS) { total++; fieldStats[def.key].total++; }
    } else {
      provider = res.body.provider; model = res.body.model; latencies.push(ms);
      const fields = res.body.data.fields;
      let sampleCorrect = 0;
      for (const def of R.FIELD_DEFS) {
        const truth = s.truth[def.key];
        const got = fields[def.key];
        const ok = same(got.value, truth);
        total++; fieldStats[def.key].total++;
        if (ok) { correct++; sampleCorrect++; fieldStats[def.key].correct++; }
        else if (got.status === 'read') silent++;
        row.fields[def.key] = { truth, value: got.value, raw: got.raw_value, status: got.status, correct: ok };
      }
      for (const k of [...(s.expect.flag || []), ...(s.expect.invalid || [])]) {
        flagTotal++;
        if (fields[k] && fields[k].status !== 'read') flagHit++;
      }
      for (const def of R.FIELD_DEFS) {
        if (s.truth[def.key] === null) {
          blankTotal++;
          if (fields[def.key].value === null && fields[def.key].status === 'missing') blankHit++;
        }
      }
      row.result = `${sampleCorrect}/${R.FIELD_DEFS.length} fields correct`;
      console.log(`${row.result} (${(ms / 1000).toFixed(1)}s)`);
    }
    perSample.push(row);
    if (i < manifest.samples.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const rate = (n, d) => (d ? Number((n / d).toFixed(4)) : null);
  const results = {
    status: 'complete',
    generated_at: new Date().toISOString(),
    provider, model,
    sample_set: 'synthetic (tests/generate-samples.js)',
    summary: {
      samples: manifest.samples.length,
      fields_total: total,
      fields_correct: correct,
      field_accuracy: rate(correct, total),
      silent_error_rate: rate(silent, total),
      flag_recall: rate(flagHit, flagTotal),
      blank_detection: rate(blankHit, blankTotal),
      unreadable_caught: rate(unreadHit, unreadTotal),
      median_latency_ms: latencies.length ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] : null
    },
    per_field_accuracy: Object.fromEntries(Object.entries(fieldStats).map(([k, v]) => [k, rate(v.correct, v.total)])),
    samples: perSample
  };
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));

  const pct = v => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
  console.log('\nResults');
  console.log(`  field accuracy     ${pct(results.summary.field_accuracy)} (${correct}/${total})`);
  console.log(`  silent error rate  ${pct(results.summary.silent_error_rate)}`);
  console.log(`  flag recall        ${pct(results.summary.flag_recall)}`);
  console.log(`  blank detection    ${pct(results.summary.blank_detection)}`);
  console.log(`  unreadable caught  ${pct(results.summary.unreadable_caught)}`);
  console.log(`\nWrote ${path.relative(ROOT, RESULTS)} and ${manifest.samples.length} files in ${path.relative(ROOT, OUT_DIR)}/`);
})();
