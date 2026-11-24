'use strict';

/**
 * Turns real-world/results.json into a report draft with every number filled in.
 *
 *   npm run realworld:report        -> real-world/report-draft.md
 *
 * The draft holds the measured tables and lists; the written conclusions are added by hand
 * after looking at the failures (the draft marks those places with "TODO").
 */

const fs = require('fs');
const path = require('path');

const RESULTS = process.env.REALWORLD_RESULTS || path.join(__dirname, 'results.json');
const OUT = process.env.REALWORLD_REPORT || path.join(__dirname, 'report-draft.md');
const r = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
const s = r.summary;
const c = s.confusion;

const pct = (v) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const val = (v) => (v === null || v === undefined || v === '' ? '(blank)' : Array.isArray(v) ? v[0] : String(v));
const LABELS = {
  machine: 'Loom', production_date: 'Date', shift: 'Shift', production_quantity: 'Production (m)', production_unit: 'Unit',
  material_reference: 'Fabric', batch_reference: 'Lot no.', defects_count: 'Defects', defect_details: 'Defect type',
  downtime_minutes: 'Stoppage (min)', downtime_reason: 'Stoppage reason', remarks: 'Remarks'
};
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(x => `| ${x.join(' | ')} |`)].join('\n');
const groupRows = (groups) => Object.entries(groups)
  .sort((a, b) => (a[1].field_accuracy ?? 1) - (b[1].field_accuracy ?? 1))
  .map(([k, v]) => [k, String(v.forms_read), `${pct(v.field_accuracy)} (${v.fields_correct}/${v.fields_total})`, String(v.confusion.tp), String(v.confusion.fn), String(v.confusion.fp)]);

const md = `# Real-World Assessment (draft)

Generated ${new Date(r.generated_at).toLocaleString()} from ${s.forms_read} handwritten forms${r.photos_missing.length ? ` (${r.photos_missing.length} of ${s.forms + r.photos_missing.length} not photographed: ${r.photos_missing.join(', ')})` : ''}. Model(s): ${r.models.join(', ') || 'n/a'}.

## Headline numbers

- Fields read correctly: **${pct(s.field_accuracy)}** (${s.fields_correct} of ${s.fields_total}); forms with every field right: ${s.forms_all_correct} of ${s.forms_read}.
- Mistakes: **${s.errors_total}**, of which **${s.errors_caught} were flagged** for the reviewer and **${s.errors_silent} were silent**.
- Silent errors as a share of all fields: **${pct(s.silent_error_rate)}**.
- False alarms: ${s.false_alarms} correct fields flagged (${pct(s.false_alarm_rate)} of correct fields).
${s.register_rows_expected ? `- Register rows found: ${s.register_rows_returned} of ${s.register_rows_expected}.\n` : ''}- Median read time per photo: ${s.median_read_ms ? `${(s.median_read_ms / 1000).toFixed(1)} s` : 'n/a'}.${s.forms_failed ? `\n- Photos that could not be read at all: ${s.forms_failed}.` : ''}

## True and false positives

A "positive" is the system telling the reviewer "check this field" (an AI flag or a business rule).

${table(['', 'Field was wrong', 'Field was right'], [
  ['**Flagged**', `**${c.tp}** true positives (caught)`, `**${c.fp}** false positives (false alarms)`],
  ['**Not flagged**', `**${c.fn}** false negatives (silent)`, `**${c.tn}** true negatives`]
])}

- Precision (when it says "check this", something really is wrong): **${pct(c.precision)}**
- Recall (share of real mistakes it pointed at): **${pct(c.recall)}**
- Of the ${c.tp} caught mistakes, ${c.tp_by_ai_flag} were flagged by the AI itself and ${c.tp_by_rule_only} only by a business rule.

## By photo condition

${table(['Condition', 'Forms', 'Fields right', 'Caught', 'Silent', 'False alarms'], groupRows(r.by_photo_condition))}

## By writing condition

${table(['Condition', 'Forms', 'Fields right', 'Caught', 'Silent', 'False alarms'], groupRows(r.by_writing_condition))}
${Object.keys(r.by_writer || {}).length ? `\n## By writer\n\n${table(['Writer', 'Forms', 'Fields right', 'Caught', 'Silent', 'False alarms'], groupRows(r.by_writer))}\n` : ''}
## By field

${table(['Field', 'Right', 'Accuracy', 'Caught', 'Silent', 'False alarms'], Object.entries(r.per_field)
  .sort((a, b) => a[1].accuracy - b[1].accuracy)
  .map(([k, v]) => [LABELS[k] || k, `${v.correct}/${v.total}`, pct(v.accuracy), String(v.tp), String(v.fn), String(v.fp)]))}

## Every mistake

${r.failures.length ? table(['Form', 'Field', 'Should be', 'Read as', 'Written as (AI)', 'Outcome', 'Photo', 'Writing'], r.failures.map(f => [
  `${f.id}${f.row ? ` row ${f.row}` : ''}`, LABELS[f.field] || f.field, val(f.truth), val(f.read_as), val(f.written_as), f.outcome, f.photo, f.writing.join(', ')
])) : 'None.'}

## False alarms

${r.false_alarms.length ? table(['Form', 'Field', 'Value', 'Why it was flagged', 'Photo'], r.false_alarms.map(f => [
  `${f.id}${f.row ? ` row ${f.row}` : ''}`, LABELS[f.field] || f.field, val(f.value), f.why.replace(/\|/g, '/'), f.photo
])) : 'None.'}
${r.photo_quality_warnings.length ? `\n## Photo-quality warnings shown before upload\n\n${table(['Form', 'Photo condition', 'Warnings'], r.photo_quality_warnings.map(w => [w.id, w.photo, w.warnings.join(', ')]))}\n` : ''}
## TODO (written after looking at the failures)

- Where it failed and why, in plain words, with 2 or 3 example photos.
- What I changed or would change because of it.
- Honest limits of this test.
`;

fs.writeFileSync(OUT, md);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
