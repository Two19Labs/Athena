'use strict';

/**
 * End-to-end test: real browser (headless Chrome) -> real app -> real /api
 * functions (dev-server) -> a local stub that imitates the Gemini HTTP API.
 * The stub lets the test decide what "the model" answers for each upload, so
 * every workflow branch is exercised without spending API quota.
 *
 *   npm run test:e2e        (screenshots in tests/output/)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { findChrome } = require('./_chrome');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'output');
const SAMPLES = path.join(ROOT, 'aplyd', 'assets', 'samples');
fs.mkdirSync(OUT, { recursive: true });

let passed = 0;
const failures = [];
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Stub Gemini
// ---------------------------------------------------------------------------
const stub = { next: null, requests: [] };
const f = (value, status = 'read', raw) => ({ value, raw_value: raw === undefined ? (value === null ? null : String(value)) : raw, status, reason: null });
function formReply(overrides = {}, date = '01/10/2026') {
  return {
    is_production_form: true,
    image_issues: [],
    fields: {
      machine: f('L-12'), production_date: f(date, 'read', date), shift: f('M'), production_quantity: f(612),
      production_unit: f('m'), material_reference: f('Combed Poplin 40s'), batch_reference: f('POP-40-881'),
      defects_count: f(0, 'read', '0'), defect_details: f(null, 'missing'), downtime_minutes: f(20, 'read', '20 min'),
      downtime_reason: f('Beam knotting'), remarks: f(null, 'missing'), ...overrides
    }
  };
}

function startStub() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        stub.requests.push({ url: req.url, bytes: body.length, key: req.headers['x-goog-api-key'] });
        const next = stub.next || { status: 500, json: { error: 'no stub response set' } };
        const payload = next.status === 200
          ? { candidates: [{ content: { parts: [{ text: JSON.stringify(next.json) }] } }] }
          : next.json;
        setTimeout(() => {
          res.writeHead(next.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        }, 150);
      });
    });
    srv.listen(0, () => resolve(srv));
  });
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------
async function newPage(browser, base, vp = { width: 1440, height: 900 }) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  page.errors = [];
  page.on('pageerror', e => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) page.errors.push(`console: ${m.text()}`); });
  page.on('dialog', d => { page.errors.push(`native dialog used: ${d.message()}`); d.dismiss(); });
  page.base = base;
  return page;
}
async function as(page, role) {
  await page.goto(`${page.base}/aplyd/index.html`, { waitUntil: 'load' });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.click(`.persona-card[data-role="${role}"]`)
  ]);
}
async function go(page, p) {
  await page.goto(`${page.base}/aplyd/${p}`, { waitUntil: 'networkidle0' });
  await sleep(250);
}
async function answerDialog(page, text) {
  await page.waitForSelector('.app-dialog', { timeout: 5000 });
  if (text !== undefined) {
    await page.$eval('#appDialogInput', (el, t) => { el.value = t; }, text);
  }
  await page.click('.app-dialog [data-act="ok"]');
  await page.waitForSelector('.app-dialog', { hidden: true, timeout: 5000 });
  await sleep(300);
}
async function capture(page, file, reply) {
  stub.next = reply;
  await go(page, 'capture.html');
  const input = await page.$('#fileInput');
  await input.uploadFile(file);
  await page.waitForSelector('#preflightPreviewCard:not(.hidden)', { timeout: 10000 });
  await sleep(300);
  await page.click('#extractBtn');
  await Promise.race([
    page.waitForFunction(() => location.pathname.endsWith('review.html') && location.search.includes('id='), { timeout: 20000 }),
    page.waitForSelector('#failureCard:not(.hidden)', { timeout: 20000 })
  ]);
  await sleep(500);
  return page.url();
}
async function recordCount(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('aplyd_db_v2')).records.length);
}
async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(s.overflowX) && p.getBoundingClientRect().right <= vw + 1) { clipped = true; break; }
        p = p.parentElement;
      }
      if (!clipped) bad.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} right=${Math.round(r.right)}`);
    }
    return { pageScroll: document.documentElement.scrollWidth - vw, offenders: bad.slice(0, 5) };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const stubSrv = await startStub();
  process.env.GEMINI_API_KEY = 'e2e-test-key';
  process.env.GEMINI_MODELS = 'stub-model';
  process.env.GEMINI_API_BASE = `http://localhost:${stubSrv.address().port}/v1beta`;
  delete process.env.OPENROUTER_API_KEY;
  const { createServer } = require('../dev-server.js');
  const app = createServer();
  await new Promise(r => app.listen(0, r));
  const base = `http://localhost:${app.address().port}`;
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });

  try {
    // ── 1. Every page, every viewport: no errors, no horizontal overflow ──
    console.log('\n1. Page smoke test (supervisor + admin, desktop + mobile)');
    const pages = ['index.html', 'dashboard.html', 'capture.html', 'review.html', 'review.html?id=seed-001', 'production-register.html', 'analytics.html', 'machines.html', 'shifts.html'];
    for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      const page = await newPage(browser, base, vp);
      await as(page, 'admin');
      for (const p of pages) {
        page.errors = [];
        await go(page, p);
        const o = await overflow(page);
        check(page.errors.length === 0, `[${vp.name}] ${p} loads without errors`, page.errors.join(' | '));
        check(o.pageScroll <= 0 && o.offenders.length === 0, `[${vp.name}] ${p} has no horizontal overflow`, JSON.stringify(o));
        await page.screenshot({ path: path.join(OUT, `${vp.name}_${p.replace(/[?=]/g, '_')}.png`), fullPage: vp.name === 'desktop' });
      }
      await page.close();
    }

    const page = await newPage(browser, base);

    // ── 2. Roles ──
    console.log('\n2. Role access');
    await as(page, 'operator');
    await page.goto(`${base}/aplyd/machines.html`, { waitUntil: 'networkidle0' });
    check(page.url().endsWith('dashboard.html'), 'operator is redirected away from Looms Master');
    const opNav = await page.$$eval('.sidebar-nav .nav-item', els => els.map(e => e.textContent.trim()));
    check(!opNav.includes('Looms Master') && opNav.includes('My Submissions'), 'operator sidebar hides admin pages', opNav.join(','));
    await as(page, 'supervisor');
    await page.goto(`${base}/aplyd/shifts.html`, { waitUntil: 'networkidle0' });
    check(page.url().endsWith('dashboard.html'), 'supervisor is redirected away from Shift Schedules');

    // ── 3. Capture: AI status, preflight checks, ambiguous quantity ──
    console.log('\n3. Operator capture → AI reading with an uncertain quantity');
    await as(page, 'operator');
    await go(page, 'capture.html');
    await page.waitForSelector('.ai-status-ok', { timeout: 5000 }).catch(() => {});
    check(await page.$('.ai-status-ok') !== null, 'capture page reports AI provider ready');
    const before = await recordCount(page);
    const ambiguous = formReply({ production_quantity: { value: 850, raw_value: '350 / 850?', status: 'uncertain', reason: 'First digit could be 3 or 8' } }, '02/10/2026');
    let url = await capture(page, path.join(SAMPLES, 'form-05-ambiguous-qty.jpg'), { status: 200, json: ambiguous });
    check(/review\.html\?id=rec-/.test(url), 'extraction creates a draft and opens it for review', url);
    check(await recordCount(page) === before + 1, 'exactly one record created');
    const lastReq = stub.requests[stub.requests.length - 1];
    check(lastReq && lastReq.key === 'e2e-test-key' && lastReq.url.includes('stub-model:generateContent'), 'server called the provider with the server-side key');
    check(lastReq && lastReq.bytes < 4 * 1024 * 1024, 'image sent to provider is under the 4 MB limit', String(lastReq && lastReq.bytes));
    const recId = new URL(url).searchParams.get('id');
    const opView = await page.evaluate(() => ({
      disabled: [...document.querySelectorAll('#verificationFieldsContainer input, #verificationFieldsContainer select')].every(e => e.disabled),
      approve: !!document.getElementById('approveBtn'),
      img: !document.getElementById('canvasImg').classList.contains('hidden') && document.getElementById('canvasImg').naturalWidth > 0
    }));
    check(opView.disabled && !opView.approve, 'operator sees the record read-only with no approve button');
    check(opView.img, 'source photo is shown from IndexedDB');

    // ── 4. Supervisor: blockers, confirm/correct, XSS, approve, ERP ──
    console.log('\n4. Supervisor review → correct → approve → ERP');
    await as(page, 'supervisor');
    await go(page, `review.html?id=${recId}`);
    let st = await page.evaluate(() => ({
      approveDisabled: document.getElementById('approveBtn').disabled,
      flagged: [...document.querySelectorAll('.field-verify-group.is-flagged')].map(e => e.dataset.field),
      badge: document.querySelector('[data-field="production_quantity"] .badge-uncertain') !== null,
      written: document.querySelector('[data-field="production_quantity"] .raw-transcription-hint')?.textContent || ''
    }));
    check(st.approveDisabled, 'approve is disabled while the AI flag is unresolved');
    check(st.flagged.includes('production_quantity') && st.badge, 'uncertain quantity is highlighted with its badge');
    check(st.written.includes('350 / 850?'), 'raw handwriting transcription is shown');

    await page.evaluate(() => { window.__xss = 0; });
    await page.$eval('#field_remarks', el => { el.value = '<img src=x onerror="window.__xss=1">'; el.dispatchEvent(new Event('change')); });
    await answerDialog(page, 'checking escaping');
    check(await page.evaluate(() => window.__xss) === 0, 'HTML typed into a field is not executed (audit trail escaped)');
    check(await page.evaluate(() => document.getElementById('auditTrailList').textContent.includes('<img src=x')), 'audit trail shows the literal text');

    await page.$eval('#field_production_quantity', el => { el.value = '350'; el.dispatchEvent(new Event('change')); });
    await answerDialog(page, 'Pick counter confirms 350 m');
    st = await page.evaluate(() => ({
      approveDisabled: document.getElementById('approveBtn').disabled,
      corrected: document.querySelector('[data-field="production_quantity"] .badge-corrected') !== null,
      audit: document.getElementById('auditTrailList').textContent
    }));
    check(st.corrected, 'corrected field shows the Corrected badge');
    check(st.audit.includes('850') && st.audit.includes('350') && st.audit.includes('Pick counter'), 'audit trail records before, after and reason');
    check(!st.approveDisabled, 'approve is enabled once the flag is resolved');

    await page.click('#approveBtn');
    await answerDialog(page, 'Verified against counter');
    await page.waitForFunction(() => /ERP acknowledged/.test(document.getElementById('statusBanner').textContent), { timeout: 8000 }).catch(() => {});
    const banner = await page.$eval('#statusBanner', el => el.textContent);
    check(/ERP acknowledged/.test(banner) && /ERP-\d{4}-[0-9A-F]{8}/.test(banner), 'approval sends the record to the mock ERP and shows the reference', banner.trim());
    const locked = await page.evaluate(() => [...document.querySelectorAll('#verificationFieldsContainer input, #verificationFieldsContainer select')].every(e => e.disabled));
    check(locked, 'approved record is locked');
    await page.screenshot({ path: path.join(OUT, 'flow_approved.png'), fullPage: true });

    // ERP payload in register
    await go(page, `production-register.html?highlight=${recId}`);
    await page.waitForSelector('#recordModal:not(.hidden)');
    const payloadText = await page.$eval('.code-block', el => el.textContent);
    const payload = JSON.parse(payloadText);
    check(payload.schema === 'aplyd.production_record/v1' && payload.production_quantity === 350 && payload.machine_code === 'L-12' && payload.provenance.fields_corrected === 2,
      'register shows the clean ERP payload with corrected values and provenance', payloadText.slice(0, 120));
    check(!('final_payload' in payload), 'ERP payload does not leak internal AI data');
    await page.click('#dispatchErpBtn');
    await sleep(700);
    const resend = await page.$eval('#modalErpBox', el => el.textContent);
    const firstRef = (banner.match(/ERP-\d{4}-[0-9A-F]{8}/) || [])[0];
    check(/2 attempt/.test(resend) && firstRef && resend.includes(firstRef), 're-sending is idempotent (same reference, attempt counted)', resend.trim().slice(0, 100));

    // ── 5. Duplicate photo + duplicate business key ──
    console.log('\n5. Duplicate detection');
    await as(page, 'operator');
    await go(page, 'capture.html');
    await (await page.$('#fileInput')).uploadFile(path.join(SAMPLES, 'form-05-ambiguous-qty.jpg'));
    await page.waitForSelector('#preflightPreviewCard:not(.hidden)');
    await sleep(500);
    check(await page.$eval('#duplicateWarningAlert', el => !el.classList.contains('hidden')), 'same photo twice shows a duplicate-photo warning');
    stub.next = { status: 200, json: formReply({ production_quantity: f(350) }, '02/10/2026') };
    await page.click('#extractBtn');
    await page.waitForFunction(() => location.search.includes('id='), { timeout: 20000 });
    const dupUrl = new URL(page.url()).searchParams.get('id');
    await as(page, 'supervisor');
    await go(page, `review.html?id=${dupUrl}`);
    const dupMsg = await page.$eval('#validationPanel', el => el.textContent);
    check(/double-count/.test(dupMsg), 'same loom/date/shift as an approved record blocks approval', dupMsg.trim().slice(0, 140));

    // ── 6. Return to operator → fix → resubmit; reject ──
    console.log('\n6. Return-for-correction loop and reject');
    await page.click('#returnBtn');
    await answerDialog(page, 'Wrong date, this was the 13th');
    check(/Returned by/.test(await page.$eval('#statusBanner', el => el.textContent)), 'supervisor can return a record with a reason');
    await as(page, 'operator');
    await go(page, `review.html?id=${dupUrl}`);
    const canEdit = await page.$eval('#field_production_date', el => !el.disabled);
    check(canEdit, 'operator can edit a record returned to them');
    await page.$eval('#field_production_date', el => { el.value = '2026-10-03'; el.dispatchEvent(new Event('change')); });
    await answerDialog(page, 'Fixed date');
    const opConfirm = await page.evaluate(async (id) => { try { await window.aplydStore.confirmField(id, 'production_quantity'); return 'allowed'; } catch (e) { return e.message; } }, dupUrl);
    check(/supervisor or admin/.test(opConfirm), 'operator cannot confirm AI-flagged values (only fix them)', opConfirm);
    check(await page.$('.confirm-btn') === null, 'operator sees no confirm buttons');
    await page.click('#resubmitBtn');
    await sleep(500);
    check(/pending review/i.test(await page.$eval('#detailStatusBadge', el => el.textContent)), 'operator resubmits; record is pending review again');
    await as(page, 'supervisor');
    await go(page, `review.html?id=${dupUrl}`);
    const dupGone = await page.$eval('#validationPanel', el => !/double-count/.test(el.textContent));
    check(dupGone, 'fixing the date clears the duplicate blocker');
    await page.click('#rejectBtn');
    await page.waitForSelector('.app-dialog');
    await page.$eval('#appDialogInput', el => { el.value = ''; });
    await page.click('.app-dialog [data-act="ok"]');
    await sleep(300);
    check(await page.$('.app-dialog') !== null && await page.$eval('.app-dialog-error', el => !el.classList.contains('hidden')), 'reject requires a reason (empty reason is refused)');
    await page.$eval('#appDialogInput', el => { el.value = 'Test reject'; });
    await page.click('.app-dialog [data-act="ok"]');
    await sleep(400);
    check(/rejected/i.test(await page.$eval('#detailStatusBadge', el => el.textContent)), 'supervisor can reject with a reason');

    // ── 7. Failure paths: not a form, provider down, bad key, not configured ──
    console.log('\n7. Failure handling (no invented data)');
    await as(page, 'operator');
    let n0 = await recordCount(page);
    await capture(page, path.join(SAMPLES, 'form-12-not-a-form.jpg'), { status: 200, json: { is_production_form: false, image_issues: ['close-up of woven fabric, no form visible'], fields: {} } });
    const fail1 = await page.evaluate(() => ({ visible: !document.getElementById('failureCard').classList.contains('hidden'), title: document.getElementById('failureTitle').textContent, msg: document.getElementById('failureErrorMsg').textContent }));
    check(fail1.visible && /could not read/i.test(fail1.title) && /fabric/.test(fail1.msg), 'non-form photo is refused with the model\'s reason', JSON.stringify(fail1));
    check(await recordCount(page) === n0, 'nothing is saved when the photo is unreadable');
    await page.screenshot({ path: path.join(OUT, 'flow_unreadable.png') });

    await capture(page, path.join(SAMPLES, 'form-01-clean.jpg'), { status: 403, json: { error: 'API key not valid' } });
    const fail2 = await page.$eval('#failureErrorMsg', el => el.textContent);
    check(/rejected the API key/.test(fail2), 'invalid key is reported clearly', fail2);

    await capture(page, path.join(SAMPLES, 'form-01-clean.jpg'), { status: 200, json: 'not json at all' });
    const fail3 = await page.$eval('#failureErrorMsg', el => el.textContent);
    check(/not in the expected format/.test(fail3), 'malformed model output is reported, not guessed', fail3);

    delete process.env.GEMINI_API_KEY;
    await go(page, 'capture.html');
    await page.waitForSelector('.ai-status-bad', { timeout: 5000 }).catch(() => {});
    check(await page.$('.ai-status-bad') !== null, 'capture page warns when no AI provider is configured');
    await capture(page, path.join(SAMPLES, 'form-01-clean.jpg'), null);
    check(/GEMINI_API_KEY/.test(await page.$eval('#failureErrorMsg', el => el.textContent)), 'extraction without a key explains how to configure it');
    process.env.GEMINI_API_KEY = 'e2e-test-key';
    check(await recordCount(page) === n0, 'no records were created by any failure');

    // ── 8. Large phone photo: downscaled, stored in IndexedDB, many uploads ──
    console.log('\n8. Large phone photos');
    const big = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
      const x = c.getContext('2d'); const d = x.createImageData(c.width, c.height);
      for (let i = 0; i < d.data.length; i++) d.data[i] = (i % 4 === 3) ? 255 : (Math.random() * 255) | 0;
      x.putImageData(d, 0, 0); return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    });
    const bigFile = path.join(OUT, 'big-phone-photo.jpg');
    fs.writeFileSync(bigFile, Buffer.from(big, 'base64'));
    const bigMb = (fs.statSync(bigFile).size / 1048576).toFixed(1);
    n0 = await recordCount(page);
    for (let i = 0; i < 3; i++) {
      await capture(page, bigFile, { status: 200, json: formReply({ machine: f(`L-0${i + 1}`) }, '05/10/2026') });
    }
    check(await recordCount(page) === n0 + 3, `three ${bigMb} MB photos captured without hitting storage limits`);
    const req = stub.requests[stub.requests.length - 1];
    check(req.bytes < 3 * 1024 * 1024, 'large photo is downscaled before upload', `${(req.bytes / 1048576).toFixed(2)} MB request`);
    const lsSize = await page.evaluate(() => localStorage.getItem('aplyd_db_v2').length);
    check(lsSize < 500 * 1024, 'photos are not stored in localStorage', `${lsSize} chars`);

    // ── 9. ERP failure + retry ──
    console.log('\n9. ERP failure and retry');
    await as(page, 'supervisor');
    const freshId = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('aplyd_db_v2')); return d.records[d.records.length - 1].id; });
    // Approve without dispatch, then make the first dispatch time out (as if the ERP were down).
    await go(page, `review.html?id=${freshId}`);
    await page.evaluate(async (id) => {
      await window.aplydStore.approveRecord(id, 'e2e');
      await window.aplydStore.submitToErp(id, { simulateFailure: true }).catch(() => {});
    }, freshId);
    await go(page, `review.html?id=${freshId}`);
    check(await page.$('#retryErpBtn') !== null, 'review screen offers an ERP retry when dispatch failed');
    await go(page, `production-register.html?highlight=${freshId}`);
    await page.waitForSelector('#recordModal:not(.hidden)');
    check(/Last attempt failed/.test(await page.$eval('#modalErpBox', el => el.textContent)), 'simulated ERP timeout is recorded as failed');
    check(/Failed/.test(await page.$eval('#registerTableBody', el => el.textContent)), 'register lists the record as failed');
    await page.click('#dispatchErpBtn');
    await sleep(800);
    check(/ERP acknowledged/.test(await page.$eval('#modalErpBox', el => el.textContent)), 'retry after a failure succeeds');
    await page.$eval('#simulateFailureToggle', el => { el.checked = true; });
    await page.click('#dispatchErpBtn');
    await sleep(800);
    check(/ERP acknowledged/.test(await page.$eval('#modalErpBox', el => el.textContent)), 'a failed re-send does not downgrade an acknowledged record');

    // ── 10. Master data ──
    console.log('\n10. Master data');
    await as(page, 'admin');
    await go(page, 'machines.html');
    await page.click('#openMachineModalBtn');
    await page.type('#machineCode', 'L-13');
    await page.type('#machineName', 'Loom 13 (Rapier)');
    await page.$eval('#machineMinQty', el => { el.value = '500'; });
    await page.$eval('#machineMaxQty', el => { el.value = '100'; });
    await page.click('#saveMachineBtn');
    await sleep(300);
    check(/min < max/.test(await page.$eval('#machineFormError', el => el.textContent)), 'invalid range is rejected with a message');
    await page.$eval('#machineMinQty', el => { el.value = '100'; });
    await page.$eval('#machineMaxQty', el => { el.value = '500'; });
    await page.click('#saveMachineBtn');
    await sleep(400);
    check(/L-13/.test(await page.$eval('#machinesTableBody', el => el.textContent)), 'admin can add a loom');
    await page.click('#openMachineModalBtn');
    await page.type('#machineCode', 'L-13');
    await page.type('#machineName', 'dup');
    await page.click('#saveMachineBtn');
    await sleep(300);
    check(/already exists/.test(await page.$eval('#machineFormError', el => el.textContent)), 'duplicate loom code is rejected');

    // ── 11. Analytics reflect what happened ──
    console.log('\n11. Analytics and exports');
    await go(page, 'analytics.html');
    const an = await page.evaluate(() => ({
      forms: document.getElementById('relForms').textContent,
      silent: document.getElementById('silentTable').textContent,
      corr: document.getElementById('relCorrection').textContent,
      bench: document.getElementById('benchmarkBody').textContent
    }));
    check(Number(an.forms) >= 5, 'analytics counts AI-read forms', an.forms);
    check(/Production Date/.test(an.silent), 'a human change to a field the AI marked "read" is listed as a silent error', an.silent.slice(0, 160));
    check(!/Operator Remarks/.test(an.silent), 'filling a field the AI correctly saw as blank is not counted as a silent error');
    check(an.corr.endsWith('%'), 'correction rate is computed', an.corr);
    check(/Field accuracy|npm run benchmark/.test(an.bench), 'benchmark section renders (results or how to run it)', an.bench.slice(0, 120));

    page.errors = [];
    await page.click('#themeToggleBtn');
    await sleep(400);
    await page.click('#themeToggleBtn');
    check(page.errors.length === 0, 'theme toggle re-renders charts without errors', page.errors.join('|'));

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });
    await go(page, 'production-register.html');
    await page.$eval('#searchRecords', el => { el.value = ''; });
    for (const f2 of fs.readdirSync(OUT).filter(x => x.endsWith('.csv'))) fs.unlinkSync(path.join(OUT, f2));
    await page.click('#exportCsvBtn');
    await sleep(1200);
    const csvFile = fs.readdirSync(OUT).find(x => x.endsWith('.csv'));
    const csv = csvFile ? fs.readFileSync(path.join(OUT, csvFile), 'utf8') : '';
    check(csv.includes('record_number,production_date') && csv.includes('"<img src=x onerror=""window.__xss=1"">"'), 'CSV export escapes quotes and keeps all rows', csv.split('\n').length + ' lines');

    console.log('\n12. Mobile review layout');
    const mob = await newPage(browser, base, { width: 390, height: 844, isMobile: true, hasTouch: true });
    await as(mob, 'supervisor');
    await go(mob, `review.html?id=${recId}`);
    const o = await overflow(mob);
    check(o.pageScroll <= 0 && !o.offenders.length, 'review screen fits a 390px phone', JSON.stringify(o));
    await mob.screenshot({ path: path.join(OUT, 'mobile_review_record.png') });
    check(mob.errors.length === 0, 'no errors on mobile review', mob.errors.join('|'));
    await mob.close();

    console.log('\n13. Older-browser fallbacks (no createImageBitmap, no crypto.subtle)');
    const old = await newPage(browser, base);
    await old.evaluateOnNewDocument(() => {
      delete window.createImageBitmap;
      Object.defineProperty(window.crypto, 'subtle', { get: () => undefined });
    });
    await as(old, 'operator');
    const n1 = await recordCount(old);
    await capture(old, path.join(SAMPLES, 'form-11-sideways.jpg'), { status: 200, json: formReply({ machine: f('L-06') }, '06/10/2026') });
    check(old.url().includes('review.html?id='),'capture works without createImageBitmap and without crypto.subtle', old.url());
    check(await recordCount(old) === n1 + 1, 'record saved on the fallback path');
    check(old.errors.length === 0, 'no errors on the fallback path', old.errors.join('|'));
    await old.close();

    check(page.errors.filter(e => !/Failed to load resource/.test(e)).length === 0, 'no unexpected browser errors across the whole flow', page.errors.join(' | '));
  } catch (err) {
    failures.push(`crashed: ${err.stack}`);
    console.error(err);
  } finally {
    await browser.close();
    app.close();
    stubSrv.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:\n- ' + failures.join('\n- '));
    process.exit(1);
  }
})();
