'use strict';

/**
 * Renders the synthetic sample form photos listed in tests/fixtures/samples.json
 * into aplyd/assets/samples/<id>.jpg using headless Chrome.
 *
 * Handwriting is simulated with Google handwriting fonts; photo conditions are
 * simulated with CSS (perspective, brightness, glare, stain, tear, fading).
 * These are a stand-in for real photographed forms, and are labelled as such.
 *
 *   npm run samples
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { findChrome } = require('./_chrome');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'aplyd', 'assets', 'samples');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'samples.json'), 'utf8'));

const SHIFT_WORDS = { M: 'M', E: 'E', N: 'N' };

function written(sample, key) {
  if (sample.written && sample.written[key] !== undefined) return sample.written[key];
  const v = sample.truth[key];
  if (v === null || v === undefined) return '';
  if (key === 'production_date') { const [y, m, d] = v.split('-'); return `${d}/${m}/${y}`; }
  if (key === 'shift') return SHIFT_WORDS[v] || v;
  if (key === 'production_unit') return 'm';
  if (key === 'downtime_minutes') return v === 0 ? '0' : `${v} min`;
  return String(v);
}

function hand(text, opts = {}) {
  const rot = (Math.random() * 4 - 2).toFixed(1);
  const cls = ['hw', opts.cls || ''].join(' ');
  return `<span class="${cls}" style="transform: rotate(${rot}deg)">${text}</span>`;
}

function standardForm(s, fx) {
  const v = (k) => written(s, k);
  let qty = hand(v('production_quantity'));
  if (fx.includes('ambiguous_qty')) {
    const rest = String(s.truth.production_quantity).slice(1);
    qty = `<span class="hw amb"><span class="amb-wrap"><span>3</span><span class="amb-over">8</span></span>${rest}</span>`;
  }
  const row = (label, val, extra = '') => `<tr class="${extra}"><th>${label}</th><td>${val}</td></tr>`;
  return `
  <div class="paper ${fx.includes('torn') ? 'torn' : ''}">
    <div class="form-head">
      <div><div class="co">SHREE LAXMI WEAVING MILLS</div><div class="ti">LOOM SHIFT PRODUCTION REPORT</div></div>
      <div class="fno">Form WV-07 / Rev 2</div>
    </div>
    <table class="grid">
      ${row('Loom No.', hand(v('machine')))}
      ${row('Date', hand(v('production_date')))}
      ${row('Shift (M / E / N)', hand(v('shift')))}
      ${row('Production (metres)', `${qty} ${v('production_unit') ? hand(v('production_unit'), { cls: 'unit' }) : ''}`)}
      ${row('Fabric Quality / Sort', hand(v('material_reference')))}
      ${row('Beam / Lot No.', hand(v('batch_reference')))}
      ${row('No. of Defects', hand(v('defects_count')))}
      ${row('Defect Type', hand(v('defect_details')))}
      ${row('Stoppage Time', hand(v('downtime_minutes')))}
      ${row('Stoppage Reason', hand(v('downtime_reason')), fx.includes('stain_downtime_reason') ? 'stained' : '')}
      ${row('Remarks', hand(v('remarks')), 'remarks')}
    </table>
    <div class="sign"><span>Operator sign: ${hand('<i>R.K.</i>')}</span><span>Supervisor: ________</span></div>
  </div>`;
}

function ledgerForm(s) {
  const v = (k) => written(s, k);
  return `
  <div class="paper ledger">
    <div class="form-head"><div><div class="co">WEAVING SHED B</div><div class="ti">DAILY LOOM REGISTER</div></div><div class="fno">Page 14</div></div>
    <table class="ledger-grid">
      <tr><th>Date</th><th>Shift</th><th>Loom</th><th>Quality</th><th>Lot</th><th>Mtrs</th><th>Defects</th><th>Defect type</th><th>Stop time</th><th>Reason</th><th>Remarks</th></tr>
      <tr>
        <td>${hand(v('production_date'))}</td><td>${hand(v('shift'))}</td><td>${hand(v('machine'))}</td><td>${hand(v('material_reference'))}</td>
        <td>${hand(v('batch_reference'))}</td><td>${hand(v('production_quantity'))}</td><td>${hand(v('defects_count'))}</td>
        <td>${hand(v('defect_details'))}</td><td>${hand(v('downtime_minutes'))}</td><td>${hand(v('downtime_reason'))}</td><td>${hand(v('remarks'))}</td>
      </tr>
      <tr>${'<td>&nbsp;</td>'.repeat(11)}</tr><tr>${'<td>&nbsp;</td>'.repeat(11)}</tr>
    </table>
  </div>`;
}

/** Shift register page: header written once, one handwritten row per loom, a few empty lines. */
function registerForm(s) {
  const h = s.header;
  const cell = (row, k) => {
    const v = row[k];
    if (v === null || v === undefined) return '';
    return k === 'downtime_minutes' ? String(v) : String(v);
  };
  const rows = s.truth.map(r => `<tr>${['machine', 'production_quantity', 'material_reference', 'batch_reference', 'defects_count', 'downtime_minutes', 'downtime_reason']
    .map(k => `<td>${cell(r, k) ? hand(cell(r, k)) : '&nbsp;'}</td>`).join('')}</tr>`).join('');
  return `
  <div class="paper ledger register">
    <div class="form-head"><div><div class="co">SHREE LAXMI WEAVING MILLS</div><div class="ti">SHIFT PRODUCTION REGISTER</div></div><div class="fno">Page 31</div></div>
    <p class="reg-head">Date ${hand(h.date)} &nbsp;&nbsp; Shift ${hand(h.shift)} &nbsp;&nbsp; Supervisor ${hand(h.supervisor)}</p>
    <table class="ledger-grid">
      <tr><th>Loom</th><th>Metres</th><th>Quality</th><th>Lot</th><th>Defects</th><th>Stop (min)</th><th>Reason</th></tr>
      ${rows}
      ${'<tr>' + '<td>&nbsp;</td>'.repeat(7) + '</tr>'}${'<tr>' + '<td>&nbsp;</td>'.repeat(7) + '</tr>'}
    </table>
  </div>`;
}

function fabric() {
  return `<div class="fabric"></div>`;
}

function page(sample) {
  const fx = sample.effects || [];
  const body = sample.layout === 'none' ? fabric() : sample.layout === 'register' ? registerForm(sample) : sample.layout === 'ledger' ? ledgerForm(sample) : standardForm(sample, fx);
  const sceneTransform = [
    fx.includes('skew') ? 'perspective(1400px) rotateX(9deg) rotateZ(-11deg) scale(0.86)' : 'rotateZ(-1.2deg) scale(0.92)',
    fx.includes('rotate90') ? 'rotate(90deg) scale(0.72)' : ''
  ].join(' ');
  const font = fx.includes('rough_hand') ? "'Reenie Beanie'" : "'Caveat'";
  return `<!doctype html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Reenie+Beanie&family=Special+Elite&display=block" rel="stylesheet">
  <style>
    html,body{margin:0;width:1200px;height:1600px;overflow:hidden}
    .scene{width:1200px;height:1600px;display:flex;align-items:center;justify-content:center;position:relative;
      background: radial-gradient(circle at 30% 20%, #6b5338, #3e2f1f 70%), #3e2f1f;}
    .scene::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(95deg, rgba(0,0,0,.06) 0 3px, transparent 3px 22px);}
    .holder{transform:${sceneTransform};transform-origin:center}
    .paper{width:960px;min-height:1260px;background:#fbf8ef;padding:46px 48px;box-sizing:border-box;position:relative;
      box-shadow:0 18px 40px rgba(0,0,0,.45);font-family:'Special Elite',monospace;color:#222;
      background-image:linear-gradient(180deg, rgba(0,0,0,.02), rgba(0,0,0,.05));}
    .paper.ledger{width:1060px;min-height:700px}
    .paper.torn{clip-path:polygon(0 0,100% 0,100% 84%,93% 86%,86% 90%,80% 87%,72% 93%,64% 91%,55% 97%,47% 94%,40% 100%,0 100%)}
    .form-head{display:flex;justify-content:space-between;border-bottom:3px double #333;padding-bottom:10px;margin-bottom:18px}
    .co{font-size:22px;letter-spacing:1px}.ti{font-size:17px;margin-top:4px}.fno{font-size:13px;color:#555}
    table.grid{width:100%;border-collapse:collapse}
    table.grid th{width:38%;text-align:left;font-weight:normal;font-size:19px;padding:14px 10px;border:1.5px solid #555;background:rgba(0,0,0,.03)}
    table.grid td{border:1.5px solid #555;padding:6px 14px;height:62px}
    .ledger-grid{width:100%;border-collapse:collapse;font-size:13px}
    .ledger-grid th{border:1.5px solid #555;padding:8px 4px;font-weight:normal;background:rgba(0,0,0,.04)}
    .ledger-grid td{border:1.5px solid #555;padding:6px 4px;height:70px;text-align:center}
    .ledger-grid .hw{font-size:30px}
    .register .ledger-grid td{height:64px}
    .reg-head{font-size:18px;margin:4px 0 14px}
    .reg-head .hw{font-size:34px}
    .hw{display:inline-block;font-family:${font},cursive;font-size:44px;color:#1c2f8a;line-height:1}
    .hw.unit{font-size:34px;margin-left:6px}
    .amb-wrap{position:relative;display:inline-block}
    .amb-over{position:absolute;left:1px;top:0;opacity:.55}
    .stained td{position:relative}
    .stained td::after{content:'';position:absolute;left:-30px;top:-34px;width:520px;height:140px;border-radius:50%;
      background:radial-gradient(ellipse at center, rgba(52,33,8,.985) 0%, rgba(62,40,12,.97) 52%, rgba(110,78,28,.5) 68%, transparent 76%);}
    .sign{display:flex;justify-content:space-between;margin-top:34px;font-size:16px}
    .fabric{width:1000px;height:1300px;background:
      repeating-linear-gradient(0deg, #2d4f7a 0 6px, #e8e2d0 6px 9px),
      repeating-linear-gradient(90deg, rgba(45,79,122,.9) 0 6px, rgba(232,226,208,.8) 6px 9px);
      background-blend-mode:multiply;filter:blur(.6px)}
    .fx-dark .scene{filter:brightness(.42) contrast(.85)}
    .fx-dark .scene::after{content:'';position:absolute;inset:0;opacity:.35;
      background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>")}
    .fx-glare .scene::after{content:'';position:absolute;left:300px;top:150px;width:800px;height:520px;border-radius:50%;
      background:radial-gradient(ellipse at center, rgba(255,255,255,.97) 0%, rgba(255,255,255,.8) 30%, rgba(255,255,255,.35) 55%, transparent 72%);}
    .fx-faded .hw{color:rgba(90,100,130,.55)}
  </style></head>
  <body class="${fx.map(f => 'fx-' + f).join(' ')}"><div class="scene"><div class="holder">${body}</div></div></body></html>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
  try {
    const only = process.argv.slice(2); // optional: render only these sample ids
    for (const s of manifest.samples.filter(x => !only.length || only.includes(x.id))) {
      const pageObj = await browser.newPage();
      await pageObj.setViewport({ width: 1200, height: 1600 });
      await pageObj.setContent(page(s), { waitUntil: 'load', timeout: 60000 });
      await pageObj.evaluate(() => document.fonts.ready);
      await new Promise(r => setTimeout(r, 300));
      const file = path.join(OUT_DIR, `${s.id}.jpg`);
      await pageObj.screenshot({ path: file, type: 'jpeg', quality: 86 });
      await pageObj.close();
      console.log(`wrote ${path.relative(ROOT, file)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
