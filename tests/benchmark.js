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
  if (Array.isArray(b)) return b.some(x => same(a, x)); // several acceptable readings (e.g. Devanagari or its transliteration)
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

const SET_NAMES = {
  synthetic: 'synthetic forms rendered by tests/generate-samples.js',
  realistic: 'photorealistic AI-generated phone photos (crumpled, carbon register, Hindi, glare, ambiguous digits)'
};

function newStats() {
  return { samples: 0, total: 0, correct: 0, silent: 0, flagTotal: 0, flagHit: 0, blankTotal: 0, blankHit: 0, unreadTotal: 0, unreadHit: 0, latencies: [] };
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
  const stats = { all: newStats() };
  let provider = null, model = null;

  for (let i = 0; i < manifest.samples.length; i++) {
    const s = manifest.samples[i];
    const set = s.set || 'synthetic';
    stats[set] = stats[set] || newStats();
    const targets = [stats.all, stats[set]];
    const inc = (k, n = 1) => targets.forEach(t => { t[k] += n; });
    inc('samples');
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
    const out = { sample: s.id, set, condition: s.condition, http_status: res.statusCode, latency_ms: ms, response: res.body };
    fs.writeFileSync(path.join(OUT_DIR, `${s.id}.json`), JSON.stringify(out, null, 2));

    const row = { id: s.id, set, condition: s.condition, status: res.statusCode, latency_ms: ms, fields: {} };
    const truths = s.truth ? (Array.isArray(s.truth) ? s.truth : [s.truth]) : [];
    if (s.expect.unreadable) {
      inc('unreadTotal');
      const ok = res.statusCode === 422;
      if (ok) inc('unreadHit');
      row.result = ok ? 'refused (correct)' : `NOT refused (${res.statusCode})`;
      console.log(row.result);
    } else if (res.statusCode !== 200) {
      row.result = `error ${res.statusCode}: ${res.body && res.body.error}`;
      console.log(row.result);
      // Count every scored field as wrong so failures lower the score instead of disappearing.
      for (const t of truths) for (const def of R.FIELD_DEFS) if (def.key in t) { inc('total'); fieldStats[def.key].total++; }
    } else {
      provider = res.body.provider; model = res.body.model;
      targets.forEach(t => t.latencies.push(ms));
      // truth is one object (a slip) or an array (a register page: one object per row, in order).
      const entries = res.body.data.entries;
      let sampleCorrect = 0;
      let sampleTotal = 0;
      truths.forEach((t, idx) => {
        const fields = entries[idx] ? entries[idx].fields : null; // a missing row scores 0 for all its fields
        for (const def of R.FIELD_DEFS) {
          if (!(def.key in t)) continue; // not on this form layout: not scored
          const truth = t[def.key];
          const got = fields ? fields[def.key] : { value: undefined, status: 'absent' };
          const ok = fields ? same(got.value, truth) : false;
          inc('total'); sampleTotal++; fieldStats[def.key].total++;
          if (ok) { inc('correct'); sampleCorrect++; fieldStats[def.key].correct++; }
          else if (got.status === 'read') inc('silent');
          if (truths.length === 1) row.fields[def.key] = { truth, value: got.value, raw: got.raw_value, status: got.status, correct: ok };
          else if (!ok) (row.wrong = row.wrong || []).push({ row: idx + 1, field: def.key, truth, value: got.value, status: got.status });
          if (truth === null && fields) {
            inc('blankTotal');
            if (got.value === null && got.status === 'missing') inc('blankHit');
          }
        }
      });
      if (entries.length !== truths.length) row.entries_mismatch = `expected ${truths.length} entries, got ${entries.length}`;
      for (const k of [...(s.expect.flag || []), ...(s.expect.invalid || [])]) {
        inc('flagTotal');
        const fl = entries[0] && entries[0].fields[k];
        if (fl && fl.status !== 'read') inc('flagHit');
      }
      row.result = `${sampleCorrect}/${sampleTotal} fields correct${truths.length > 1 ? ` across ${entries.length}/${truths.length} rows` : ''}${row.entries_mismatch ? ` (${row.entries_mismatch})` : ''}`;
      console.log(`${row.result} (${(ms / 1000).toFixed(1)}s)`);
    }
    perSample.push(row);
    if (i < manifest.samples.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const rate = (n, d) => (d ? Number((n / d).toFixed(4)) : null);
  const median = (xs) => {
    if (!xs.length) return null;
    const v = [...xs].sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
  };
  const summarise = (st) => ({
    samples: st.samples,
    fields_total: st.total,
    fields_correct: st.correct,
    field_accuracy: rate(st.correct, st.total),
    silent_error_rate: rate(st.silent, st.total),
    flag_recall: rate(st.flagHit, st.flagTotal),
    blank_detection: rate(st.blankHit, st.blankTotal),
    unreadable_caught: rate(st.unreadHit, st.unreadTotal),
    median_latency_ms: median(st.latencies)
  });
  const bySet = Object.fromEntries(Object.entries(stats).filter(([k]) => k !== 'all').map(([k, v]) => [k, { description: SET_NAMES[k] || k, ...summarise(v) }]));
  const results = {
    status: 'complete',
    generated_at: new Date().toISOString(),
    provider, model,
    sample_set: Object.keys(bySet).map(k => `${bySet[k].samples} ${k}`).join(' + '),
    summary: summarise(stats.all),
    by_set: bySet,
    per_field_accuracy: Object.fromEntries(Object.entries(fieldStats).map(([k, v]) => [k, rate(v.correct, v.total)])),
    samples: perSample
  };
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));

  const pct = v => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
  console.log('\nResults');
  for (const [name, sm] of [['all', results.summary], ...Object.entries(bySet)]) {
    console.log(`  [${name}] accuracy ${pct(sm.field_accuracy)} (${sm.fields_correct}/${sm.fields_total}) · silent ${pct(sm.silent_error_rate)} · flag recall ${pct(sm.flag_recall)} · blanks ${pct(sm.blank_detection)} · refused ${pct(sm.unreadable_caught)} · median ${sm.median_latency_ms} ms`);
  }
  for (const r of perSample.filter(x => x.wrong)) console.log(`  ${r.id}: ${r.wrong.map(w => `row ${w.row} ${w.field}=${JSON.stringify(w.value)} (truth ${JSON.stringify(w.truth)}, ${w.status})`).join('; ')}`);
  console.log(`\nWrote ${path.relative(ROOT, RESULTS)} and ${manifest.samples.length} files in ${path.relative(ROOT, OUT_DIR)}/`);
})();
