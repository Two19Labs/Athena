'use strict';

/**
 * Builds the printable real-world test kit and the answer key.
 *
 *   node real-world/make-kit.js
 *
 * Writes
 *   real-world/kit/APLYD-real-world-test-kit.pdf   instructions, value cards, blank forms (A4)
 *   real-world/answers.json                        the answer key, same shape as tests/fixtures/samples.json
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { findChrome } = require('../tests/_chrome');
const { FORMS, PLAN } = require('./forms');

const OUT = path.join(__dirname, 'kit');
fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------------------
// Answer key
// ---------------------------------------------------------------------------
const answers = {
  description: 'Real-world test: forms handwritten by people, photographed on a phone. Answer keys fixed in advance by real-world/forms.js.',
  samples: FORMS.map(f => ({
    id: f.id, set: 'real-world', layout: f.layout, condition: f.condition, tags: f.tags,
    truth: f.truth, expect: f.expect || {}
  }))
};
fs.writeFileSync(path.join(__dirname, 'answers.json'), JSON.stringify(answers, null, 2) + '\n');

// ---------------------------------------------------------------------------
// Printable kit
// ---------------------------------------------------------------------------
const SLIP_ROWS = [
  ['loom', 'Loom No.'], ['date', 'Date'], ['shift', 'Shift (M / E / N)'], ['qty', 'Production (metres)'],
  ['fabric', 'Fabric Quality'], ['lot', 'Beam / Lot No.'], ['defects', 'No. of Defects'], ['defectType', 'Defect Type'],
  ['stop', 'Stoppage Time'], ['reason', 'Stoppage Reason'], ['remarks', 'Remarks']
];

const blankSlip = (f) => `
  <div class="slip">
    <div class="formid">${esc(f.id)}</div>
    <div class="co">SHREE GANESH TEXTILES</div>
    <div class="ti">LOOM PRODUCTION SLIP</div>
    <table class="slip-table">${SLIP_ROWS.map(([, label]) => `<tr><th>${esc(label)}</th><td></td></tr>`).join('')}</table>
    <div class="sign"><span>Operator sign:</span><span>Supervisor sign:</span></div>
  </div>`;

const blankRegister = (f) => `
  <section class="page register-page">
    <div class="formid">${esc(f.id)}</div>
    <div class="co">SHREE GANESH TEXTILES</div>
    <div class="ti">SHIFT PRODUCTION REGISTER</div>
    <div class="reg-head"><span>Date: ______________</span><span>Shift: ________</span><span>Supervisor: ______________</span></div>
    <table class="reg-table">
      <tr><th>Loom</th><th>Metres</th><th>Quality</th><th>Lot No.</th><th>Defects</th><th>Stop (min)</th><th>Reason</th></tr>
      ${Array.from({ length: 10 }, () => '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')}
    </table>
    <div class="sign"><span>Sign:</span></div>
  </section>`;

const showValue = (v) => (v === '' ? '<em>leave blank</em>' : esc(v));

const card = (f) => {
  const extra = [
    f.note ? `<p class="note"><b>Writer:</b> ${esc(f.note)}</p>` : '',
    f.photo ? `<p class="note photo"><b>Photo:</b> ${esc(f.photo)}</p>` : ''
  ].join('');
  if (f.layout === 'slip') {
    return `<div class="card"><div class="card-id">${esc(f.id)} <span>slip</span></div>
      <table class="vals">${SLIP_ROWS.map(([k, label]) => `<tr><th>${esc(label)}</th><td>${showValue(f.write[k])}</td></tr>`).join('')}</table>${extra}</div>`;
  }
  return `<div class="card card-wide"><div class="card-id">${esc(f.id)} <span>register page</span></div>
    <p class="reg-top">Date: <b>${esc(f.date)}</b> &nbsp; Shift: <b>${esc(f.shift)}</b> &nbsp; Supervisor: <b>any name</b></p>
    <table class="vals vals-reg"><tr><th>Loom</th><th>Metres</th><th>Quality</th><th>Lot No.</th><th>Defects</th><th>Stop</th><th>Reason</th></tr>
    ${f.write.map(r => `<tr><td>${esc(r.loom)}</td><td>${showValue(r.qty)}</td><td>${esc(r.fabric)}</td><td>${esc(r.lot)}</td><td>${esc(r.defects)}</td><td>${showValue(r.stop)}</td><td>${showValue(r.reason)}</td></tr>`).join('')}
    </table>${extra}</div>`;
};

const slips = FORMS.filter(f => f.layout === 'slip');
const registers = FORMS.filter(f => f.layout === 'register');
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// One page per person: which forms they fill in, and exactly what to write on each.
const personPage = (p, i) => {
  const forms = p.ids.map(id => FORMS.find(f => f.id === id));
  return `<section class="page person-page">
    <div class="person-head"><div class="person-name">${esc(p.person)}</div><div class="person-forms">Fills in ${forms.map(f => `<b>${esc(f.id)}</b>`).join(', ')}</div></div>
    <p class="person-how">Find the blank form with the same ID (top right corner). Copy each value onto it in your <b>own normal handwriting</b>. Keep the wording exactly as shown, but don't try to write neatly. Where it says <em>leave blank</em>, leave the box empty.</p>
    ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
    <div class="cards">${forms.map(card).join('')}</div>
    <p class="page-foot">Page ${i + 1} of ${PLAN.length} · keep this sheet out of the photo</p>
  </section>`;
};

const howTo = `<section class="page">
  <h1>Taking the photos</h1>
  <ol>
    <li>When a form is filled in, put this sheet away. <b>Only the filled form should be in the photo.</b></li>
    <li>Take <b>one photo per form</b> with your phone, quickly, the way you normally would. Where a card has a blue <b>Photo</b> note (crumpled, angled, held in hand), do that. <b>Don't retake a bad photo</b>: imperfect photos are the point of the test.</li>
    <li>Get the photos onto the laptop (WhatsApp to yourself, Google Photos, or a cable).</li>
    <li>Name each one after its form: <b>RW-01.jpg, RW-02.jpg</b> and so on, and put them in <b>Athena\\real-world\\photos</b>.</li>
    <li>If a person's name should appear in the report instead of "Person 1", edit <b>real-world\\writers.csv</b>.</li>
  </ol>
  <h2>The 15 forms at a glance</h2>
  <table class="glance"><tr><th>Person</th><th>Form</th><th>What it tests</th></tr>
  ${PLAN.flatMap(p => p.ids.map((id, k) => { const f = FORMS.find(x => x.id === id); return `<tr><td>${k === 0 ? esc(p.person) : ''}</td><td><b>${esc(id)}</b></td><td>${esc(f.condition)}</td></tr>`; })).join('')}
  </table>
</section>`;

const BODY = [
  ...chunk(slips, 2).map(pair => `<section class="page slips-page">${pair.map(blankSlip).join('')}</section>`),
  ...registers.map(blankRegister),
  ...PLAN.map(personPage),
  howTo
].join('\n');

// writers.csv: who wrote what (rename "Person 1" etc. to real names if you like). Never overwrites an edited file.
const writersFile = path.join(__dirname, 'writers.csv');
if (!fs.existsSync(writersFile)) fs.writeFileSync(writersFile, PLAN.flatMap(p => p.ids.map(id => `${id},${p.person}`)).join('\n') + '\n');

const html = `<!doctype html><html><head><meta charset="utf-8"><title>APLYD real-world test kit</title><style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #18181b; }
  .page { width: 210mm; height: 297mm; padding: 14mm 14mm; position: relative; page-break-after: always; overflow: hidden; }
  h1 { font-size: 20pt; margin-bottom: 4mm; } h2 { font-size: 13pt; margin: 6mm 0 2mm; }
  p, li { font-size: 10.5pt; line-height: 1.45; } ol, ul { padding-left: 6mm; } li { margin-bottom: 1.4mm; }
  .muted { color: #555; }
  .formid { position: absolute; top: 6mm; right: 8mm; font: 600 9pt monospace; color: #444; border: 1px solid #999; padding: 0.6mm 2mm; border-radius: 1mm; }
  .co { text-align: center; font: 700 14pt Georgia, serif; letter-spacing: 0.5px; }
  .ti { text-align: center; font: 600 10.5pt Georgia, serif; margin: 1mm 0 4mm; }
  /* two A5 slips per A4 page, cut along the dashed line */
  .slips-page { padding: 0; }
  .slip { height: 148.5mm; padding: 9mm 16mm 6mm; position: relative; border-bottom: 1px dashed #aaa; }
  .slip:last-child { border-bottom: 0; }
  .slip-table { width: 100%; border-collapse: collapse; }
  .slip-table th { width: 38%; text-align: left; font: 600 9.5pt Georgia, serif; border: 1px solid #333; padding: 0 2.5mm; height: 9.6mm; }
  .slip-table td { border: 1px solid #333; }
  .sign { display: flex; justify-content: space-between; font: 9.5pt Georgia, serif; margin-top: 4mm; }
  .register-page .reg-head { display: flex; justify-content: space-between; font: 10.5pt Georgia, serif; margin: 2mm 0 5mm; }
  .reg-table { width: 100%; border-collapse: collapse; }
  .reg-table th { font: 600 9.5pt Georgia, serif; border: 1px solid #333; padding: 2mm 1mm; }
  .reg-table td { border: 1px solid #333; height: 17mm; }
  .register-page .sign { margin-top: 8mm; }
  /* value cards: cut out, one per writer, never in the photo */
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .card { border: 1.5px solid #18181b; border-radius: 2mm; padding: 3.5mm; font-size: 9pt; break-inside: avoid; }
  .card-wide { grid-column: span 2; }
  .card-id { font: 700 12pt monospace; margin-bottom: 2mm; } .card-id span { font: 9pt 'Segoe UI', Arial; color: #555; margin-left: 2mm; }
  .vals { width: 100%; border-collapse: collapse; } .vals th, .vals td { border-bottom: 1px solid #ddd; padding: 0.8mm 1mm; text-align: left; font-size: 9pt; }
  .vals th { color: #555; font-weight: 500; width: 46%; } .vals td { font-weight: 600; }
  .vals-reg th { width: auto; } .reg-top { margin-bottom: 1.5mm; font-size: 9.5pt; }
  .note { margin-top: 2mm; font-size: 8.8pt; background: #fff4dc; padding: 1.5mm 2mm; border-radius: 1mm; } .note.photo { background: #e8efff; }
  em { color: #888; font-weight: 400; }
  .cutline { text-align: center; font-size: 8pt; color: #888; margin-bottom: 4mm; }
  .person-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #18181b; padding-bottom: 2mm; margin-bottom: 3mm; }
  .person-name { font-size: 22pt; font-weight: 700; } .person-forms { font-size: 11pt; }
  .person-how { font-size: 10pt; margin-bottom: 3mm; color: #333; }
  .person-page .card { font-size: 10pt; } .person-page .vals th, .person-page .vals td { font-size: 10pt; padding: 1.1mm 1mm; }
  .page-foot { position: absolute; bottom: 9mm; left: 14mm; right: 14mm; text-align: center; font-size: 8pt; color: #888; }
  .glance { width: 100%; border-collapse: collapse; margin-top: 2mm; } .glance th, .glance td { border-bottom: 1px solid #ddd; padding: 1.4mm 1.5mm; text-align: left; font-size: 9.5pt; } .glance th { color: #555; }
</style></head><body>

${BODY}
</body></html>`;

(async () => {
  fs.writeFileSync(path.join(OUT, 'kit.html'), html);
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const file = path.join(OUT, 'APLYD-real-world-test-kit.pdf');
  await page.pdf({ path: file, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(`Wrote ${path.relative(process.cwd(), file)} and real-world/answers.json (${FORMS.length} forms)`);
})().catch(err => { console.error(err); process.exit(1); });
