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
const stub = { next: null, queue: [], requests: [] }; // queue: one-shot answers in arrival order (batches), else `next`
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
        const next = stub.queue.length ? stub.queue.shift() : (stub.next || { status: 500, json: { error: 'no stub response set' } });
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
  const input = await page.$('#cameraInput');
  await input.uploadFile(file);
  await page.waitForSelector('#preflightPreviewCard:not(.hidden)', { timeout: 10000 });
  await sleep(300);
  await page.click('#extractBtn');
  await Promise.race([
    // one entry opens the record (?id=); a multi-row sheet opens its group in the queue (?batch=)
    page.waitForFunction(() => location.pathname.endsWith('review.html') && /[?&](id|batch)=/.test(location.search), { timeout: 20000 }),
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
    const pages = ['index.html', 'dashboard.html', 'capture.html', 'review.html', 'review.html?id=does-not-exist', 'production-register.html', 'analytics.html', 'machines.html', 'shifts.html'];
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

    // ── 1b. No demo data: the app starts empty and guides the user ──
    console.log('\n1b. Fresh start (no demo records)');
    await as(page, 'supervisor');
    check(await recordCount(page) === 0, 'a fresh browser starts with zero records (no mock data)');
    await go(page, 'dashboard.html');
    check(await page.$eval('#recentSubmissionsBody', el => /No records yet/.test(el.textContent) && !!el.querySelector('a[href="capture.html"]')), 'empty dashboard points to Capture');
    await go(page, 'review.html?id=does-not-exist');
    check(/Record not found/.test(await page.$eval('#detailSection', el => el.textContent)), 'unknown record id shows "not found"');
    // Browsers that ran an older build still hold demo "seed" records: they must be removed on load.
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('aplyd_db_v2'));
      db.records.push({ id: 'seed-001', seed: true, record_number: 'PR-2026-0001', status: 'approved', created_at: new Date().toISOString() });
      localStorage.setItem('aplyd_db_v2', JSON.stringify(db));
    });
    await go(page, 'dashboard.html');
    check(await recordCount(page) === 0, 'old demo records are cleaned out automatically');

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
    await (await page.$('#cameraInput')).uploadFile(path.join(SAMPLES, 'form-05-ambiguous-qty.jpg'));
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

    // ── 12. Mobile review layout ──
    console.log('\n12. Mobile review layout');
    const mob = await newPage(browser, base, { width: 390, height: 844, isMobile: true, hasTouch: true });
    await as(mob, 'supervisor');
    await go(mob, `review.html?id=${recId}`);
    const o = await overflow(mob);
    check(o.pageScroll <= 0 && !o.offenders.length, 'review screen fits a 390px phone', JSON.stringify(o));
    await mob.screenshot({ path: path.join(OUT, 'mobile_review_record.png') });
    check(mob.errors.length === 0, 'no errors on mobile review', mob.errors.join('|'));
    await mob.close();

    // ── 13. Older-browser fallbacks ──
    console.log('\n13. Older-browser fallbacks (no createImageBitmap, no crypto.subtle)');
    const old = await newPage(browser, base);
    await old.evaluateOnNewDocument(() => {
      delete window.createImageBitmap;
      Object.defineProperty(window.crypto, 'subtle', { get: () => undefined });
    });
    await as(old, 'operator');
    const n1 = await recordCount(old);
    await capture(old, path.join(SAMPLES, 'form-11-sideways.jpg'), { status: 200, json: formReply({ machine: f('L-06') }, '06/10/2026') });
    check(old.url().includes('review.html?id='), 'capture works without createImageBitmap and without crypto.subtle', old.url());
    check(await recordCount(old) === n1 + 1, 'record saved on the fallback path');
    check(old.errors.length === 0, 'no errors on the fallback path', old.errors.join('|'));
    await old.close();

    // ── 14. One-click sample photos ──
    console.log('\n14. Sample photo picker');
    await as(page, 'operator');
    await go(page, 'capture.html');
    check(await page.$$eval('#samplePicker [data-sample]', els => els.length) === 6, 'capture page offers 6 sample photos');
    await page.click('#samplePicker [data-sample="form-01-clean"]');
    await page.waitForSelector('#preflightPreviewCard:not(.hidden)', { timeout: 10000 });
    const sampleState = await page.evaluate(() => ({
      name: document.getElementById('previewFileName').textContent,
      pickerHidden: document.getElementById('samplePicker').classList.contains('hidden'),
      checks: document.querySelectorAll('#qualityChecks li').length
    }));
    check(sampleState.name === 'form-01-clean.jpg' && sampleState.pickerHidden && sampleState.checks === 3, 'sample loads into the normal preview with quality checks', JSON.stringify(sampleState));
    await page.click('#removeFileBtn');
    check(await page.$eval('#samplePicker', el => !el.classList.contains('hidden')), 'samples reappear after "Retake"');
    const n2 = await recordCount(page);
    stub.next = { status: 200, json: formReply({ machine: f('L-07') }, '07/10/2026') };
    await page.click('#samplePicker [data-sample="form-01-clean"]');
    await page.waitForSelector('#preflightPreviewCard:not(.hidden)');
    await sleep(300);
    await page.click('#extractBtn');
    await page.waitForFunction(() => location.search.includes('id='), { timeout: 20000 }).catch(() => {});
    check(page.url().includes('review.html?id=') && await recordCount(page) === n2 + 1, 'a sample photo goes through the real extraction path and creates a record');

    // ── 15. Batch upload ──
    console.log('\n15. Batch upload (many photos at once)');
    const batchState = (pg) => pg.evaluate(() => ({
      rows: [...document.querySelectorAll('#batchList .batch-item')].map(li => li.className.replace('batch-item ', '')),
      summary: document.getElementById('batchSummary').textContent,
      start: document.getElementById('batchStartBtn'),
      startText: document.getElementById('batchStartBtn').textContent,
      startHidden: document.getElementById('batchStartBtn').classList.contains('hidden'),
      reviewHref: document.getElementById('batchReviewLink').getAttribute('href'),
      reviewHidden: document.getElementById('batchReviewLink').classList.contains('hidden')
    })).then(s => ({ ...s, start: undefined }));
    const waitIdle = (pg) => pg.waitForFunction(() => {
      const rows = [...document.querySelectorAll('#batchList .batch-item')];
      return rows.length && !rows.some(li => /batch-(preparing|queued|reading|retrying)\b/.test(li.className)) && document.getElementById('batchStopBtn').classList.contains('hidden');
    }, { timeout: 30000 });
    const samples = (...ids) => ids.map(id => path.join(SAMPLES, `${id}.jpg`));

    await as(page, 'operator');
    await go(page, 'capture.html');
    await page.evaluate(() => { window.APLYD_CONFIG.BATCH_RETRY_WAITS_MS = [300, 600]; });
    const nB = await recordCount(page);
    // 4 different photos + one exact duplicate of the first
    await (await page.$('#galleryInput')).uploadFile(...samples('form-01-clean', 'form-07-blank-and-zero', 'form-09-ledger-layout', 'form-12-not-a-form', 'form-01-clean'));
    await page.waitForFunction(() => document.querySelectorAll('#batchList .batch-item').length === 5 && !document.querySelector('#batchList .batch-preparing'), { timeout: 15000 });
    let bs = await batchState(page);
    check(bs.rows.filter(r => r === 'batch-queued').length === 4 && bs.rows.includes('batch-skipped'), 'batch lists 5 photos: 4 queued, the exact duplicate skipped', JSON.stringify(bs.rows));
    check(/Read 4 photos/.test(bs.startText) && await recordCount(page) === nB, 'nothing is saved before "Read" is pressed', bs.startText);
    check(await page.$eval('#dropzone', el => el.classList.contains('hidden')), 'start area hides while a batch is open');

    stub.queue = [
      { status: 200, json: formReply({ machine: f('L-01') }, '10/10/2026') },
      { status: 200, json: formReply({ machine: f('L-02'), production_quantity: { value: 850, raw_value: '350/850?', status: 'uncertain', reason: '3 or 8' } }, '10/10/2026') },
      { status: 200, json: formReply({ machine: f('L-06') }, '10/10/2026') },
      { status: 200, json: { is_production_form: false, image_issues: ['fabric'], fields: {} } }
    ];
    const reqBefore = stub.requests.length;
    await page.click('#batchStartBtn');
    await waitIdle(page);
    bs = await batchState(page);
    check(stub.requests.length - reqBefore === 4, 'each queued photo is sent to the AI exactly once', String(stub.requests.length - reqBefore));
    check(bs.rows.filter(r => r === 'batch-ready').length === 2 && bs.rows.filter(r => r === 'batch-flagged').length === 1 && bs.rows.filter(r => r === 'batch-failed').length === 1,
      'outcomes: 2 ready, 1 needs a check (uncertain qty), 1 failed (not a form)', JSON.stringify(bs.rows));
    check(await recordCount(page) === nB + 3, 'exactly 3 records created; the failed and skipped photos save nothing');
    check(!bs.reviewHidden && /batch=batch-/.test(bs.reviewHref) && /3 photos read → 3 records/.test(bs.summary), 'summary + "Review 3 records from this batch" link', bs.summary);
    const batchId = new URLSearchParams(bs.reviewHref.split('?')[1]).get('batch');
    const recs = await page.evaluate(() => JSON.parse(localStorage.getItem('aplyd_db_v2')).records.slice(-3));
    check(recs.every(r => r.batch_id === batchId && r.status === 'pending_review'), 'batch records are normal pending records tagged with the batch');

    // Retry a failed photo manually
    stub.queue = [{ status: 200, json: formReply({ machine: f('L-04') }, '11/10/2026') }];
    await page.click('#batchList [data-act="retry"]');
    await waitIdle(page);
    check((await batchState(page)).rows.filter(r => r === 'batch-failed').length === 0 && await recordCount(page) === nB + 4, 'Retry on a failed photo re-reads just that photo');

    // Automatic retry on rate limit
    await page.click('#batchClearBtn');
    check(await page.$eval('#dropzone', el => !el.classList.contains('hidden')), '"New batch" returns to the start area');
    await (await page.$('#galleryInput')).uploadFile(...samples('form-02-skewed', 'form-03-low-light'));
    await page.waitForFunction(() => document.querySelectorAll('#batchList .batch-queued').length === 2, { timeout: 15000 });
    stub.queue = [{ status: 429, json: {} }, { status: 200, json: formReply({ machine: f('L-10') }, '12/10/2026') }, { status: 200, json: formReply({ machine: f('L-12') }, '12/10/2026') }];
    await page.click('#batchStartBtn');
    await waitIdle(page);
    bs = await batchState(page);
    check(bs.rows.every(r => r === 'batch-ready'), 'a rate-limited photo waits and retries automatically, then succeeds', JSON.stringify(bs.rows));

    // Stop mid-batch and resume
    await page.click('#batchClearBtn');
    await (await page.$('#galleryInput')).uploadFile(...samples('form-04-glare', 'form-06-oil-stain', 'form-08-unknown-loom', 'form-10-faded-torn', 'form-11-sideways'));
    await page.waitForFunction(() => document.querySelectorAll('#batchList .batch-queued').length === 5, { timeout: 15000 });
    stub.next = { status: 200, json: formReply({ machine: f('L-07') }, '13/10/2026') };
    await page.click('#batchStartBtn');
    await page.click('#batchStopBtn');
    await waitIdle(page);
    bs = await batchState(page);
    const stopped = bs.rows.filter(r => r === 'batch-stopped').length;
    check(stopped >= 1 && stopped <= 3 && /Resume/.test(bs.startText), 'Stop lets in-flight photos finish and holds the rest', JSON.stringify(bs.rows));
    await page.click('#batchStartBtn');
    await waitIdle(page);
    check((await batchState(page)).rows.every(r => r === 'batch-ready' || r === 'batch-flagged'), 'Resume finishes the remaining photos (none stopped, queued or failed)');

    // Limit: more than 25 photos
    await page.click('#batchClearBtn');
    await (await page.$('#galleryInput')).uploadFile(...Array.from({ length: 27 }, (_, i) => samples(['form-01-clean', 'form-02-skewed', 'form-03-low-light'][i % 3])[0]));
    await page.waitForFunction(() => document.querySelectorAll('#batchList .batch-item').length > 0 && !document.querySelector('#batchList .batch-preparing'), { timeout: 30000 });
    check(await page.$$eval('#batchList .batch-item', els => els.length) === 25, 'a batch is capped at 25 photos with a message');
    await page.click('#batchClearBtn');

    // A single photo from "Choose photos" still uses the single-photo flow
    await (await page.$('#galleryInput')).uploadFile(...samples('form-01-clean'));
    await page.waitForSelector('#preflightPreviewCard:not(.hidden)', { timeout: 10000 });
    check(await page.$eval('#batchSection', el => el.classList.contains('hidden')), 'one photo from the gallery opens the normal single-photo preview');
    await page.click('#removeFileBtn');

    // Review the batch: filtered queue + "Next record"
    await as(page, 'supervisor');
    await go(page, `review.html?batch=${encodeURIComponent(batchId)}`);
    const q = await page.evaluate(() => ({ banner: document.getElementById('batchBanner').textContent, rows: document.querySelectorAll('#queueTableBody tr').length }));
    check(/Batch/.test(q.banner) && q.rows === 4, 'review queue filters to just this batch', JSON.stringify(q));
    const firstId = await page.$eval('#queueTableBody a.btn', a => new URLSearchParams(a.getAttribute('href').split('?')[1]).get('id'));
    await go(page, `review.html?id=${firstId}`);
    if (await page.$('#approveBtn') && !(await page.$eval('#approveBtn', b => b.disabled))) {
      await page.click('#approveBtn');
      await answerDialog(page, '');
      await sleep(600);
    } else {
      await page.click('#returnBtn');
      await answerDialog(page, 'Check quantity');
    }
    const nextHref = await page.$eval('#nextRecordBtn', a => a.getAttribute('href')).catch(() => null);
    check(!!nextHref && !nextHref.includes(firstId), 'after a decision, "Next record →" jumps to the next pending record', String(nextHref));

    // All samples as a batch in one click
    await as(page, 'operator');
    await go(page, 'capture.html');
    await page.click('#sampleBatchBtn');
    await page.waitForFunction(() => document.querySelectorAll('#batchList .batch-item').length === 13 && !document.querySelector('#batchList .batch-preparing'), { timeout: 30000 });
    const sb = await batchState(page);
    check(sb.rows.length === 13 && /Read 13 photos/.test(sb.startText), '"All samples as a batch" loads every sample into a batch', sb.startText);
    await page.click('#batchClearBtn');

    // Mobile layout of the batch list
    const mb = await newPage(browser, base, { width: 390, height: 844, isMobile: true, hasTouch: true });
    await as(mb, 'operator');
    await go(mb, 'capture.html');
    await (await mb.$('#galleryInput')).uploadFile(...samples('form-01-clean', 'form-12-not-a-form', 'form-09-ledger-layout'));
    await mb.waitForFunction(() => document.querySelectorAll('#batchList .batch-queued').length === 3, { timeout: 15000 });
    const ob = await overflow(mb);
    check(ob.pageScroll <= 0 && !ob.offenders.length, 'batch list fits a 390px phone', JSON.stringify(ob));
    await mb.screenshot({ path: path.join(OUT, 'mobile_batch.png'), fullPage: true });
    check(mb.errors.length === 0, 'no errors in the batch flow on mobile', mb.errors.join('|'));
    await mb.close();

    // ── 16. Multi-row sheets (register page = several records) ──
    console.log('\n16. Multi-row sheets');
    const ledger = (rowsDetected, looms, date) => ({
      is_production_form: true, image_issues: [], rows_detected: rowsDetected,
      header: { production_date: f(date, 'read', date), shift: f('M') },
      entries: looms.map((l, i) => ({ machine: f(l), production_quantity: f(400 + i * 10), production_unit: f('m'), material_reference: f('Cambric'), defects_count: f(0, 'read', '0'), downtime_minutes: f(0, 'read', '0') }))
    });
    await as(page, 'operator');
    const nS = await recordCount(page);
    let sheetUrl = await capture(page, path.join(SAMPLES, 'form-09-ledger-layout.jpg'), { status: 200, json: ledger(3, ['L-01', 'L-02', 'L-03'], '20/10/2026') });
    await page.waitForFunction(() => location.search.includes('batch=sheet-'), { timeout: 10000 }).catch(() => {});
    check(page.url().includes('review.html?batch=sheet-') && await recordCount(page) === nS + 3, 'one register photo with 3 rows creates 3 records and opens them as a group', page.url());
    const sheetQ = await page.evaluate(() => ({ banner: document.getElementById('batchBanner').textContent, rows: document.querySelectorAll('#queueTableBody tr').length }));
    check(/Sheet PF-/.test(sheetQ.banner) && sheetQ.rows === 3, 'queue shows just this sheet', JSON.stringify(sheetQ));
    const sheetRecs = await page.evaluate(() => JSON.parse(localStorage.getItem('aplyd_db_v2')).records.slice(-3));
    check(new Set(sheetRecs.map(r => r.form_id)).size === 1 && sheetRecs.every(r => r.production_date === '2026-10-20' && r.shift_id === 'shift-m'),
      'all rows share one photo and inherit the header date and shift');
    await as(page, 'supervisor');
    await go(page, `review.html?id=${sheetRecs[0].id}`);
    check(/Row 1 of 3 on this sheet/.test(await page.$eval('#detailRecordMeta', el => el.textContent)), 'review header says "Row 1 of 3 on this sheet"');
    await page.click('#returnBtn');
    await answerDialog(page, 'check row');
    const nextRow = await page.$eval('#nextRecordBtn', a => a.getAttribute('href')).catch(() => null);
    check(nextRow && nextRow.includes(sheetRecs[1].id), '"Next record" moves to row 2 of the same sheet', String(nextRow));
    await go(page, `production-register.html?highlight=${sheetRecs[1].id}`);
    await page.waitForSelector('#recordModal:not(.hidden)');
    check(/row 2 of 3/.test(await page.$eval('#modalFields', el => el.textContent)), 'register shows which row of the sheet a record came from');

    // The AI saw more rows than it returned: every record from that photo is flagged
    await as(page, 'operator');
    await capture(page, path.join(SAMPLES, 'form-09-ledger-layout.jpg'), { status: 200, json: ledger(4, ['L-04', 'L-05', 'L-06'], '21/10/2026') });
    await page.waitForFunction(() => location.search.includes('batch=sheet-'), { timeout: 10000 }).catch(() => {});
    const inc = await page.evaluate(() => JSON.parse(localStorage.getItem('aplyd_db_v2')).records.slice(-1)[0].id);
    await as(page, 'supervisor');
    await go(page, `review.html?id=${inc}`);
    check(/saw 4 filled rows/.test(await page.$eval('#validationPanel', el => el.textContent)), 'a sheet with a missed row warns on its records');

    // In a batch: a register photo + a single slip
    await as(page, 'operator');
    await go(page, 'capture.html');
    await page.evaluate(() => { window.APLYD_CONFIG.BATCH_CONCURRENCY = 1; });
    await (await page.$('#galleryInput')).uploadFile(...samples('form-09-ledger-layout', 'form-01-clean'));
    await page.waitForFunction(() => document.querySelectorAll('#batchList .batch-queued').length === 2, { timeout: 15000 });
    stub.queue = [{ status: 200, json: ledger(3, ['L-07', 'L-08', 'L-10'], '22/10/2026') }, { status: 200, json: formReply({ machine: f('L-12') }, '22/10/2026') }];
    await page.click('#batchStartBtn');
    await waitIdle(page);
    bs = await batchState(page);
    const mixed = await page.$eval('#batchList', el => el.textContent);
    check(/2 photos read → 4 records/.test(bs.summary) && /3 entries on this sheet/.test(mixed), 'batch counts records, not photos (register + slip = 4 records)', bs.summary);
    check(await page.$eval('#batchReviewLink', a => a.textContent).then(t => /Review 4 records/.test(t)), 'batch review link counts every record');

    // ── Whole-run sanity ──
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
