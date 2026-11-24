'use strict';

/**
 * Real-world assessment runner.
 *
 *   npm run realworld            (needs GEMINI_API_KEY in .env, photos in real-world/photos/RW-XX.jpg)
 *
 * Every photo goes through the app itself, in a headless browser: the same downscaling and
 * photo-quality checks, the same /api/extract call to the real AI, the same record creation and
 * the same business rules a supervisor would see. Each field is then scored against the answer
 * key (real-world/answers.json), and every mistake is classed as
 *   caught  the AI flagged the field, or a rule raised a message on it (a reviewer is pointed at it)
 *   silent  wrong, marked "read", and no rule fired: only a reviewer reading every field would notice
 *
 * Writes real-world/results.json (summary + per form) and real-world/outputs/<id>.json (raw output).
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { findChrome } = require('../tests/_chrome');
const R = require('../aplyd/js/rules.js');

const ROOT = path.resolve(__dirname, '..');
const PHOTOS = process.env.REALWORLD_PHOTOS || path.join(__dirname, 'photos');
const OUTPUTS = process.env.REALWORLD_OUTPUTS || path.join(__dirname, 'outputs');
const RESULTS = process.env.REALWORLD_RESULTS || path.join(__dirname, 'results.json');
const DELAY_MS = Number(process.env.REALWORLD_DELAY_MS || 5000); // stay under free-tier per-minute limits
const answers = JSON.parse(fs.readFileSync(path.join(__dirname, 'answers.json'), 'utf8')).samples;

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function same(a, b) {
  if (Array.isArray(b)) return b.some(x => same(a, x));
  if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '';
  if (typeof b === 'number') return Number(a) === b;
  return String(a).trim().replace(/\s+/g, ' ').toLowerCase() === String(b).trim().replace(/\s+/g, ' ').toLowerCase();
}

function readWriters() {
  const file = path.join(__dirname, 'writers.csv');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.split(',').map(s => s.trim())).filter(p => /^RW-\d+$/i.test(p[0] || '') && p[1]).map(p => [p[0].toUpperCase(), p[1]]));
}

/** RW-07.jpg, rw-7.jpeg, RW_07 (2).png ... all count as form RW-07. */
function findPhoto(id) {
  if (!fs.existsSync(PHOTOS)) return null;
  const want = Number(id.replace(/\D/g, ''));
  const f = fs.readdirSync(PHOTOS).sort().find(n => {
    const m = n.match(/^rw[-_ ]?0*(\d+)(?!\d)/i);
    return m && Number(m[1]) === want;
  });
  return f ? path.join(PHOTOS, f) : null;
}

/** Runs inside the app page: the same steps the capture page takes, then the same checks the review page shows. */
async function pipelineInPage(b64, name, type) {
  await window.aplydStore.resetDemo(); // each form on its own, so no cross-form duplicate checks
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const file = new File([bytes], name, { type });
  const problem = window.AplydImage.checkFile(file);
  if (problem) return { error: problem, code: 'bad_file' };
  let prepared;
  try {
    const bmp = await window.AplydImage.decode(file);
    prepared = await window.AplydImage.prepare(bmp, 0);
  } catch (e) {
    return { error: `Could not open the image (${e.message}). Use JPG or PNG.`, code: 'bad_file' };
  }
  const quality = window.AplydImage.quality(prepared.canvas, prepared.srcW, prepared.srcH).filter(c => !c.ok).map(c => c.label);
  const t0 = performance.now();
  let result;
  try {
    result = await window.visionExtractor.extract(prepared.blob);
  } catch (e) {
    return { error: e.message, code: e.code, quality, ms: Math.round(performance.now() - t0), attempts: e.details && e.details.attempts };
  }
  const ms = Math.round(performance.now() - t0);
  const recs = await window.aplydStore.createRecordsFromExtraction({ file, sha256: null, imageBlob: prepared.blob, extraction: result });
  const ctx = window.aplydStore.validationContext();
  const records = [];
  for (const r of recs) {
    const full = await window.aplydStore.getRecordById(r.id);
    const v = await window.aplydStore.validationFor(full, ctx);
    records.push({ fields: full.final_payload.fields, blockers: v.blockers, warnings: v.warnings });
  }
  return {
    ms, model: result.model, attempts: result.attempts, quality, sent: { w: prepared.w, h: prepared.h, bytes: prepared.blob.size },
    rows_detected: result.data.rows_detected, incomplete: result.data.incomplete, image_issues: result.data.image_issues, records
  };
}

function scoreForm(sample, out) {
  const truths = Array.isArray(sample.truth) ? sample.truth : [sample.truth];
  const fields = [];
  truths.forEach((t, row) => {
    const rec = out.records[row];
    for (const def of R.FIELD_DEFS) {
      if (!(def.key in t)) continue;
      const truth = t[def.key];
      const f = rec ? rec.fields[def.key] : null;
      const value = f ? f.value : undefined;
      const status = f ? f.status : 'absent';
      const correct = f ? same(value, truth) : false;
      const msgs = rec ? [...rec.blockers, ...rec.warnings].filter(m => m.field === def.recordKey) : [];
      const aiFlag = !!f && (['uncertain', 'illegible', 'invalid'].includes(status) || (def.required && status === 'missing'));
      const blocks = !!f && (aiFlag || (rec && rec.blockers.some(b => b.field === def.recordKey)));
      // A row the AI never returned is "caught" only if the system warned that rows may be missing.
      const flagged = aiFlag || msgs.length > 0 || (!f && Boolean(out.incomplete));
      fields.push({
        row: row + 1, field: def.key, truth, value, raw: f ? f.raw_value : undefined, status, correct,
        ai_flag: aiFlag, rule: msgs.map(m => m.message), flagged, caught: !correct && flagged, blocks,
        caught_by: correct || !flagged ? null : aiFlag ? 'AI flag' : msgs.length ? 'business rule' : 'missing-row warning'
      });
    }
  });
  const expectFlags = [...((sample.expect && sample.expect.flag) || []), ...((sample.expect && sample.expect.invalid) || [])];
  return {
    fields,
    rows_expected: truths.length,
    rows_returned: out.records.length,
    expected_flags: expectFlags.map(k => ({ field: k, flagged: fields.some(x => x.field === k && x.row === 1 && (x.ai_flag || x.blocks)) }))
  };
}

const rate = (n, d) => (d ? Number((n / d).toFixed(4)) : null);
const median = (xs) => { if (!xs.length) return null; const v = [...xs].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };

/**
 * "Positive" = the system tells the reviewer "check this field" (an AI flag or a business rule).
 *   TP  wrong and flagged (mistake caught)      FP  right but flagged (false alarm)
 *   FN  wrong and not flagged (silent error)    TN  right and not flagged
 */
function confusion(fields) {
  const tp = fields.filter(f => !f.correct && f.flagged).length;
  const fn = fields.filter(f => !f.correct && !f.flagged).length;
  const fp = fields.filter(f => f.correct && f.flagged).length;
  const tn = fields.filter(f => f.correct && !f.flagged).length;
  return {
    tp, fp, fn, tn,
    precision: rate(tp, tp + fp), // when it says "check this", how often is something really wrong
    recall: rate(tp, tp + fn),    // of the real mistakes, how many it pointed at
    tp_by_ai_flag: fields.filter(f => !f.correct && f.caught_by === 'AI flag').length,
    tp_by_rule_only: fields.filter(f => !f.correct && f.caught_by === 'business rule').length
  };
}

function summarise(rows) {
  const all = rows.flatMap(r => (r.score ? r.score.fields : []));
  const wrong = all.filter(f => !f.correct);
  const flaggedCorrect = all.filter(f => f.correct && f.flagged);
  const read = rows.filter(r => r.score);
  return {
    forms: rows.length,
    forms_read: read.length,
    forms_failed: rows.filter(r => r.error).length,
    forms_all_correct: read.filter(r => r.score.fields.every(f => f.correct)).length,
    fields_total: all.length,
    fields_correct: all.length - wrong.length,
    field_accuracy: rate(all.length - wrong.length, all.length),
    confusion: confusion(all),
    errors_total: wrong.length,
    errors_caught: wrong.filter(f => f.caught).length,
    errors_silent: wrong.filter(f => !f.caught).length,
    catch_rate: rate(wrong.filter(f => f.caught).length, wrong.length),
    silent_error_rate: rate(wrong.filter(f => !f.caught).length, all.length),
    false_alarms: flaggedCorrect.length,
    false_alarm_rate: rate(flaggedCorrect.length, all.length - wrong.length),
    register_rows_expected: read.filter(r => r.layout === 'register').reduce((n, r) => n + r.score.rows_expected, 0),
    register_rows_returned: read.filter(r => r.layout === 'register').reduce((n, r) => n + Math.min(r.score.rows_returned, r.score.rows_expected), 0),
    median_read_ms: median(read.map(r => r.out.ms))
  };
}

(async () => {
  require('../dev-server.js').loadDotEnv();
  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    console.error('No AI key found. Put GEMINI_API_KEY in .env first.');
    process.exit(1);
  }
  const present = answers.map(s => ({ s, file: findPhoto(s.id) })).filter(x => x.file);
  if (!present.length) {
    console.error(`No photos found in ${path.relative(ROOT, PHOTOS)}. Name them after the form IDs, e.g. RW-01.jpg.`);
    process.exit(1);
  }
  const missing = answers.filter(s => !findPhoto(s.id)).map(s => s.id);
  console.log(`${present.length} photos found${missing.length ? `, missing: ${missing.join(', ')}` : ''}\n`);
  fs.mkdirSync(OUTPUTS, { recursive: true });
  const writers = readWriters();

  const { createServer } = require('../dev-server.js');
  const server = createServer();
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
  const page = await browser.newPage();
  await page.goto(`${base}/aplyd/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => window.aplydStore.switchUser('operator'));
  await page.goto(`${base}/aplyd/capture.html`, { waitUntil: 'networkidle0' });

  const rows = [];
  for (let i = 0; i < present.length; i++) {
    const { s, file } = present[i];
    const ext = path.extname(file).toLowerCase();
    process.stdout.write(`[${i + 1}/${present.length}] ${s.id} (${s.condition}) … `);
    const row = { id: s.id, layout: s.layout, condition: s.condition, tags: s.tags || { photo: 'normal', writing: [] }, writer: writers[s.id] || null, photo: path.basename(file), photo_bytes: fs.statSync(file).size };
    if (!MIME[ext]) {
      row.error = `Unsupported photo format ${ext} (use JPG or PNG)`;
      console.log(row.error);
      rows.push(row);
      continue;
    }
    const out = await page.evaluate(pipelineInPage, fs.readFileSync(file).toString('base64'), path.basename(file), MIME[ext]);
    fs.writeFileSync(path.join(OUTPUTS, `${s.id}.json`), JSON.stringify({ id: s.id, condition: s.condition, ...out }, null, 2));
    if (out.error) {
      row.error = out.error;
      row.code = out.code;
      row.out = out;
      console.log(`failed: ${out.error}`);
    } else {
      row.out = { ms: out.ms, model: out.model, quality: out.quality, rows_detected: out.rows_detected, image_issues: out.image_issues };
      row.score = scoreForm(s, out);
      const ok = row.score.fields.filter(f => f.correct).length;
      const miss = row.score.fields.filter(f => !f.correct);
      console.log(`${ok}/${row.score.fields.length} correct (${(out.ms / 1000).toFixed(1)}s)${miss.length ? ` · wrong: ${miss.map(f => `${f.row > 1 || s.layout === 'register' ? `r${f.row} ` : ''}${f.field}=${JSON.stringify(f.value)} [${f.caught ? 'caught' : 'SILENT'}]`).join(', ')}` : ''}`);
    }
    rows.push(row);
    if (i < present.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }
  await browser.close();
  server.close();

  // Per-field accuracy, and the same summary per writer and per layout.
  const allFields = rows.flatMap(r => (r.score ? r.score.fields : []));
  const perField = Object.fromEntries(R.FIELD_DEFS.map(d => {
    const fs2 = allFields.filter(f => f.field === d.key);
    return [d.key, { correct: fs2.filter(f => f.correct).length, total: fs2.length, accuracy: rate(fs2.filter(f => f.correct).length, fs2.length), ...confusion(fs2) }];
  }).filter(([, v]) => v.total));
  const groupBy = (key) => Object.fromEntries([...new Set(rows.map(r => r[key]).filter(Boolean))].map(k => [k, summarise(rows.filter(r => r[key] === k))]));
  const photoTags = [...new Set(rows.map(r => r.tags.photo))];
  const writingTags = [...new Set(rows.flatMap(r => r.tags.writing))];
  const byPhoto = Object.fromEntries(photoTags.map(t => [t, summarise(rows.filter(r => r.tags.photo === t))]));
  const byWriting = Object.fromEntries(writingTags.map(t => [t, summarise(rows.filter(r => r.tags.writing.includes(t)))]));
  // Every mistake, with the conditions it happened under: the "where did it fail" list.
  const failures = rows.flatMap(r => (r.score ? r.score.fields.filter(f => !f.correct).map(f => ({
    id: r.id, row: r.layout === 'register' ? f.row : null, field: f.field, truth: f.truth, read_as: f.value, written_as: f.raw,
    status: f.status, outcome: f.caught ? `caught (${f.caught_by})` : 'SILENT', photo: r.tags.photo, writing: r.tags.writing, writer: r.writer
  })) : []));
  const falseAlarms = rows.flatMap(r => (r.score ? r.score.fields.filter(f => f.correct && f.flagged).map(f => ({
    id: r.id, row: r.layout === 'register' ? f.row : null, field: f.field, value: f.value, status: f.status, why: f.ai_flag ? `AI marked it ${f.status}` : f.rule.join(' | '), photo: r.tags.photo
  })) : []));

  const results = {
    status: 'complete',
    generated_at: new Date().toISOString(),
    models: [...new Set(rows.filter(r => r.out && r.out.model).map(r => r.out.model))],
    photos_missing: missing,
    summary: summarise(rows),
    by_layout: groupBy('layout'),
    by_photo_condition: byPhoto,
    by_writing_condition: byWriting,
    by_writer: groupBy('writer'),
    per_field: perField,
    failures,
    false_alarms: falseAlarms,
    photo_quality_warnings: rows.filter(r => r.out && r.out.quality && r.out.quality.length).map(r => ({ id: r.id, warnings: r.out.quality, photo: r.tags.photo })),
    expected_flags: rows.filter(r => r.score && r.score.expected_flags.length).map(r => ({ id: r.id, flags: r.score.expected_flags })),
    forms: rows
  };
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));

  const pct = v => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
  const sm = results.summary;
  console.log('\nReal-world results');
  console.log(`  forms read          ${sm.forms_read}/${sm.forms} (${sm.forms_all_correct} with every field right)`);
  console.log(`  field accuracy      ${pct(sm.field_accuracy)} (${sm.fields_correct}/${sm.fields_total})`);
  console.log(`  mistakes            ${sm.errors_total}: ${sm.errors_caught} caught by an AI flag or a rule, ${sm.errors_silent} silent`);
  const c = sm.confusion;
  console.log(`  "check this" flags  TP ${c.tp} · FP ${c.fp} · FN ${c.fn} · TN ${c.tn} · precision ${pct(c.precision)} · recall ${pct(c.recall)}`);
  for (const [t, v] of Object.entries(results.by_photo_condition)) console.log(`  photo: ${t.padEnd(12)} accuracy ${pct(v.field_accuracy)} (${v.fields_correct}/${v.fields_total}), silent ${v.errors_silent}`);
  console.log(`  catch rate          ${pct(sm.catch_rate)} · silent error rate ${pct(sm.silent_error_rate)} of all fields`);
  console.log(`  false alarms        ${sm.false_alarms} correct fields flagged (${pct(sm.false_alarm_rate)})`);
  if (sm.register_rows_expected) console.log(`  register rows       ${sm.register_rows_returned}/${sm.register_rows_expected} found`);
  console.log(`  median read time    ${sm.median_read_ms ? (sm.median_read_ms / 1000).toFixed(1) + ' s' : '—'}`);
  console.log(`\nWrote ${path.relative(ROOT, RESULTS)} and ${rows.length} files in ${path.relative(ROOT, OUTPUTS)}/`);
})().catch(err => { console.error(err); process.exit(1); });
