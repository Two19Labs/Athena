/**
 * APLYD - Review console.
 * Queue of records + split-screen verification: photo on the left, AI-read
 * fields on the right with per-field status, inline business-rule results,
 * correct / confirm / check actions, an append-only audit trail and role-aware actions.
 */
(function () {
  const store = window.aplydStore;
  const Rules = window.AplydRules;
  const L = window.AplydLayout;
  const esc = window.security.escapeHtml;
  const $ = (id) => document.getElementById(id);

  let record = null;
  let validation = { blockers: [], warnings: [] };
  let machines = [];
  let shifts = [];
  let reasons = [];
  let knownMaterials = [];
  let imageUrl = null;
  let nextId = null;
  let groupReady = [];
  let viewer = null;
  let issueCursor = -1;
  const params = new URLSearchParams(location.search);
  const batchFilter = params.get('batch');

  document.addEventListener('DOMContentLoaded', async () => {
    const id = params.get('id');
    machines = await store.getMachines();
    shifts = await store.getShifts();
    reasons = await store.getReasons();
    if (id) await openRecord(id);
    else await initQueue();
  });

  // ---------------------------------------------------------------------------
  // Queue
  // ---------------------------------------------------------------------------
  async function initQueue() {
    const user = store.getCurrentUser();
    $('queueSection').classList.remove('hidden');
    if (user.role === 'operator') {
      $('pageTitle').textContent = 'My Submissions';
      $('queueStatusFilter').value = 'all';
    }
    if (batchFilter) $('queueStatusFilter').value = 'all';
    $('queueStatusFilter').addEventListener('change', renderQueue);
    $('queueSearchInput').addEventListener('input', renderQueue);
    $('queueSort').addEventListener('change', renderQueue);
    $('queueTableBody').addEventListener('click', (e) => {
      if (e.target.closest('[data-show-all]')) { $('queueStatusFilter').value = 'all'; renderQueue(); }
    });
    $('batchBanner').addEventListener('click', (e) => { if (e.target.closest('#bulkApproveBtn')) bulkApprove(batchFilter); });
    await renderQueue();
  }

  async function renderBatchBanner() {
    if (!batchFilter) return;
    const rows = await store.getRecords({ batch_id: batchFilter });
    const label = rows[0] && rows[0].batch_label;
    groupReady = store.can('review', { status: 'pending_review' }) ? await readyInGroup(batchFilter) : [];
    $('batchBanner').innerHTML = `<span>Showing <strong>${esc(label || 'one batch')}</strong> (${rows.length} record${rows.length === 1 ? '' : 's'}). <a href="review.html">Show all records</a></span>
      ${groupReady.length ? `<button type="button" class="btn btn-primary btn-small" id="bulkApproveBtn">✓ Approve all ready (${groupReady.length})</button>` : ''}`;
    $('batchBanner').classList.remove('hidden');
  }

  async function renderQueue() {
    const user = store.getCurrentUser();
    await renderBatchBanner();
    const status = $('queueStatusFilter').value;
    const filters = { status, search: $('queueSearchInput').value };
    if (user.role === 'operator') filters.submitted_by = user.id;
    if (batchFilter) filters.batch_id = batchFilter;
    const rows = await store.getRecords(filters); // newest first
    if ($('queueSort').value === 'oldest') rows.reverse(); // work queue: first in, first out (a sheet reads top row first)
    const tbody = $('queueTableBody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">${await emptyMessage(user, status)}</td></tr>`;
      return;
    }
    const ctx = store.validationContext();
    const cells = await Promise.all(rows.map(async (r) => {
      const v = await store.validationFor(r, ctx);
      const flags = Rules.unresolvedFlags(r).length;
      const checks = v.blockers.filter(b => b.check).length;
      const other = v.blockers.length - flags - checks;
      const changedByOthers = Rules.FIELD_DEFS.filter(d => (r.corrections || []).some(c => c.field_key === d.recordKey && c.changed_by !== r.submitted_by) && Rules.humanChanged(r, d.recordKey)).length;
      const attention = r.status === 'pending_review' && user.role !== 'operator'
        ? [
          flags ? `<span class="badge-uncertain">${flags} AI flag${flags > 1 ? 's' : ''}</span>` : '',
          checks ? `<span class="badge-uncertain">${checks} to check</span>` : '',
          other > 0 ? `<span class="badge-invalid">${other} blocker${other > 1 ? 's' : ''}</span>` : '',
          v.warnings.length ? `<span class="badge-missing">${v.warnings.length} warning${v.warnings.length > 1 ? 's' : ''}</span>` : ''
        ].filter(Boolean).join(' ') || '<span class="badge-read">Ready</span>'
        : r.status === 'returned_for_correction' ? `<span class="small">${esc(r.return_reason || '')}</span>`
          : changedByOthers ? `<span class="badge-corrected">Corrected · ${changedByOthers} field${changedByOthers > 1 ? 's' : ''}</span>` : '';
      return `
        <tr>
          <td class="mono strong">${esc(r.record_number)}</td>
          <td>${esc(r.production_date || '—')}</td>
          <td class="strong">${esc((r.machine && r.machine.machine_code) || r.machine_raw || '—')}</td>
          <td>${esc((r.shift && r.shift.name) || r.shift_raw || '—')}</td>
          <td class="num strong">${esc(L.fmtNum(r.production_quantity, r.production_unit))}</td>
          <td>${attention}</td>
          <td><span class="${L.statusClass(r.status)}">${esc(L.statusLabel(r.status))}</span></td>
          <td class="right"><a class="btn btn-outline btn-small" href="review.html?id=${encodeURIComponent(r.id)}">${r.status === 'pending_review' && user.role !== 'operator' ? 'Review →' : 'Open →'}</a></td>
        </tr>`;
    }));
    tbody.innerHTML = cells.join('');
  }

  /** Empty queue: say why (filter vs. truly nothing) and what to do next. */
  async function emptyMessage(user, status) {
    const scope = await store.getRecords({ ...(user.role === 'operator' ? { submitted_by: user.id } : {}), ...(batchFilter ? { batch_id: batchFilter } : {}) });
    if (!scope.length) return `Nothing here yet. <a href="capture.html">Capture a form</a> to start.`;
    const counts = {};
    scope.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const names = { pending_review: 'pending review', returned_for_correction: 'returned', approved: 'approved', rejected: 'rejected' };
    const summary = Object.entries(counts).map(([s, n]) => `${n} ${names[s] || L.statusLabel(s)}`).join(' · ');
    const q = $('queueSearchInput').value.trim();
    if (q) return `No records match “${esc(q)}”${status !== 'all' ? ` with this status` : ''}. Try another search.`;
    const what = status === 'pending_review' ? 'No records waiting for review.' : `No ${names[status] || 'matching'} records.`;
    return `${what} ${esc(summary)} · <button type="button" class="link-btn" data-show-all>Show all</button>`;
  }

  /** Pending records in a sheet/batch with nothing at all to check: safe to approve together. */
  async function readyInGroup(groupId) {
    const ctx = store.validationContext();
    const rows = await store.getRecords({ batch_id: groupId, status: 'pending_review' });
    const out = [];
    for (const r of rows.reverse()) {
      const v = await store.validationFor(r, ctx);
      if (!v.blockers.length && !v.warnings.length) out.push(r);
    }
    return out;
  }

  async function bulkApprove(groupId) {
    const ready = await readyInGroup(groupId);
    if (!ready.length) { window.toast.show('No rows are ready: every remaining row has something to check.', 'warning'); return; }
    const ok = await window.dialog.confirm({
      title: `Approve ${ready.length} ready record${ready.length > 1 ? 's' : ''}?`,
      message: `${ready.map(r => `${r.record_number} (${(r.machine && r.machine.machine_code) || '?'})`).join(', ')}. Each has passed every check with no AI flags or warnings, and each is sent to the ERP. Rows with anything to check are left for you to review one by one.`,
      confirmText: `Approve ${ready.length} & send`
    });
    if (!ok) return;
    let done = 0;
    let erpFailed = 0;
    for (const r of ready) {
      window.toast.show(`Approving ${done + 1} of ${ready.length}…`, 'info');
      try {
        await store.approveRecord(r.id, 'Approved with the rest of the sheet: all checks passed');
        done++;
        await store.submitToErp(r.id).catch(() => { erpFailed++; });
      } catch (err) {
        window.toast.show(`${r.record_number}: ${err.message}`, 'error');
      }
    }
    window.toast.show(`${done} record${done === 1 ? '' : 's'} approved${erpFailed ? `; ${erpFailed} not yet acknowledged by the ERP (retry from the register)` : ' and acknowledged by the ERP'}.`, erpFailed ? 'warning' : 'success');
    if (record) await refresh(); else await renderQueue();
  }

  // ---------------------------------------------------------------------------
  // Detail
  // ---------------------------------------------------------------------------
  async function openRecord(id) {
    $('detailSection').classList.remove('hidden');
    record = await store.getRecordById(id);
    if (!record) {
      $('detailSection').innerHTML = `<div class="empty-cell">Record not found. <a href="review.html">Back to the queue</a>.</div>`;
      return;
    }
    const user = store.getCurrentUser();
    if (user.role === 'operator' && record.submitted_by !== user.id) {
      $('detailSection').innerHTML = `<div class="empty-cell">Operators can only open their own submissions. <a href="review.html">Back</a>.</div>`;
      return;
    }
    $('pageTitle').textContent = 'Verify Record';
    knownMaterials = await materialList();
    viewer = setupViewer();
    setupShortcuts();
    $('groupStrip').addEventListener('click', (e) => { if (e.target.closest('#bulkApproveBtn')) bulkApprove(record.batch_id); });
    await loadImage();
    await refresh();
    showRowOnPhoto();
  }

  /**
   * On a register page, outline this record's row. The AI's row boxes drift on long pages, so snap
   * to the table's printed rules when they can be found; otherwise label the outline approximate.
   */
  function showRowOnPhoto() {
    const rowBox = record.final_payload && record.final_payload.row_box;
    if (!rowBox || !(record.sheet_rows > 1) || !viewer) return;
    const label = `Row ${record.sheet_row} of ${record.sheet_rows}`;
    let box = rowBox, snapped = false;
    try {
      const entries = (record.form && record.form.extraction_payload && record.form.extraction_payload.entries) || [];
      const boxes = entries.map(e => (e && e.row_box) || null);
      const img = $('canvasImg');
      if (window.AplydRowSnap && boxes.length === record.sheet_rows && img.naturalWidth) {
        const { gray, w, h } = window.AplydRowSnap.grayFromImage(img);
        const res = window.AplydRowSnap.snapRow(gray, w, h, boxes, record.sheet_row - 1);
        if (res.snapped) { box = res.box; snapped = true; }
      }
    } catch (_) { /* fall back to the AI's box */ }
    viewer.showBox(box, { row: true, label: snapped ? label : `${label} (approximate)` });
  }

  /** Fabric names seen before (loom notes and approved records), for "did you mean" hints. */
  async function materialList() {
    const set = new Map();
    machines.forEach(m => { const n = String(m.notes || '').split(' - ').pop().trim(); if (n) set.set(n.toLowerCase(), n); });
    (await store.getRecords({ status: 'approved' })).forEach(r => { if (r.material_reference) set.set(r.material_reference.toLowerCase(), r.material_reference); });
    return [...set.values()];
  }

  /** Next record waiting for review: same batch first (in capture order), then the oldest pending one. */
  async function findNextPending() {
    if (!store.can('review', { status: 'pending_review' })) return null;
    const rows = (await store.getRecords({ status: 'pending_review' })).filter(r => r.id !== record.id);
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const sameBatch = record.batch_id ? rows.find(r => r.batch_id === record.batch_id) : null;
    return (sameBatch || rows[0] || {}).id || null;
  }

  async function refresh() {
    record = await store.getRecordById(record.id);
    validation = await store.validationFor(record);
    nextId = await findNextPending();
    groupReady = record.batch_id && store.can('review', { status: 'pending_review' }) ? await readyInGroup(record.batch_id) : [];
    renderHeader();
    renderBanner();
    renderGroupStrip();
    renderValidation();
    renderFields();
    renderAudit();
    renderActions();
  }

  function renderHeader() {
    $('detailRecordNumber').textContent = record.record_number;
    const parts = [
      record.form_number ? `Form ${record.form_number}` : null,
      record.sheet_rows > 1 ? `Row ${record.sheet_row} of ${record.sheet_rows} on this sheet` : null,
      record.submitted_by_name ? `by ${record.submitted_by_name}` : null,
      record.created_at ? new Date(record.created_at).toLocaleString() : null
    ].filter(Boolean);
    $('detailRecordMeta').textContent = parts.join(' · ');
    const badge = $('detailStatusBadge');
    badge.className = L.statusClass(record.status);
    badge.textContent = L.statusLabel(record.status);
    if (record.extraction_model) {
      const ms = record.extraction_latency_ms || (record.form && record.form.extraction_latency_ms);
      const tries = (record.extraction_attempts || (record.form && record.form.extraction_attempts) || []).filter(a => !a.ok);
      const meta = $('extractionMeta');
      const second = record.form && record.form.extraction_payload && record.form.extraction_payload.second_read;
      const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
      const secondText = !second ? ''
        : second.skipped ? ' · not double-checked (second reading unavailable)'
          : ` · double-checked by ${second.model}: ${plural(second.corrections || 0, 'correction')} found, ${second.disagreed.length ? `${plural(second.disagreed.length, 'disagreement')} on the sheet` : 'numbers agreed'}`;
      meta.textContent = `Read by ${record.extraction_model}${ms ? ` in ${(ms / 1000).toFixed(1)}s` : ''}${tries.length ? ` · ${tries.length} busy model${tries.length > 1 ? 's' : ''} skipped` : ''}${secondText}`;
      meta.title = tries.map(a => `${a.model}: ${a.error} (${(a.ms / 1000).toFixed(1)}s)`).join('\n');
    }
  }

  function renderBanner() {
    const el = $('statusBanner');
    const user = store.getCurrentUser();
    let html = '';
    if (record.status === 'returned_for_correction') {
      html = `<div class="inline-alert inline-alert-warn"><strong>Returned by ${esc(record.returned_by_name || 'supervisor')}:</strong> ${esc(record.return_reason || '')}</div>`;
    } else if (record.status === 'rejected') {
      html = `<div class="inline-alert inline-alert-bad"><strong>Rejected by ${esc(record.reviewed_by_name || 'supervisor')}:</strong> ${esc(record.rejection_reason || '')}</div>`;
    } else if (record.status === 'approved') {
      const erp = record.erp_status === 'submitted'
        ? `ERP acknowledged · <span class="mono">${esc(record.erp_reference)}</span>`
        : `<strong>ERP not yet acknowledged</strong>${record.erp_last_error ? `: ${esc(record.erp_last_error)}` : ''}`;
      html = `<div class="inline-alert ${record.erp_status === 'submitted' ? 'inline-alert-ok' : 'inline-alert-warn'}">Approved by ${esc(record.reviewed_by_name || '')}${record.approval_note ? ` · “${esc(record.approval_note)}”` : ''} · ${erp}</div>`;
    }
    // The person who captured the form sees what a reviewer changed (feedback for next time).
    if (record.submitted_by === user.id) {
      const changes = Rules.FIELD_DEFS.filter(d => Rules.humanChanged(record, d.recordKey) && record.corrections.some(c => c.field_key === d.recordKey && c.changed_by !== user.id))
        .map(d => {
          const edits = record.corrections.filter(c => c.field_key === d.recordKey && (c.kind === 'correction' || c.kind === 'undo'));
          const by = edits[edits.length - 1].changed_by_name;
          return `${esc(by)} changed <strong>${esc(d.label)}</strong> ${esc(display(d.recordKey, edits[0].original_value))} → ${esc(display(d.recordKey, edits[edits.length - 1].corrected_value))}`;
        });
      if (changes.length) html += `<div class="inline-alert inline-alert-info">${changes.join('<br>')}</div>`;
    }
    el.innerHTML = html;
    el.classList.toggle('hidden', !html);
  }

  function renderGroupStrip() {
    const el = $('groupStrip');
    const others = groupReady.filter(r => r.id !== record.id).length;
    if (!record.batch_id || !groupReady.length || (groupReady.length === 1 && !others)) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.innerHTML = `<span>${esc(record.batch_label || 'This batch')}: <strong>${groupReady.length}</strong> record${groupReady.length > 1 ? 's' : ''} ready to approve with no checks left.</span>
      <button type="button" class="btn btn-outline btn-small" id="bulkApproveBtn">✓ Approve all ready (${groupReady.length})</button>`;
    el.classList.remove('hidden');
  }

  function renderValidation() {
    const el = $('validationPanel');
    if (record.status !== 'pending_review' && record.status !== 'returned_for_correction') { el.innerHTML = ''; return; }
    const { blockers, warnings } = validation;
    if (!blockers.length && !warnings.length) {
      el.innerHTML = `<div class="validation-panel validation-ok">✓ All checks pass. Ready to approve.</div>`;
      return;
    }
    const n = attentionGroups().length;
    el.innerHTML = `
      <div class="validation-panel">
        ${blockers.length ? `<p class="validation-head bad">${blockers.length} issue${blockers.length > 1 ? 's' : ''} must be resolved before approval</p>
          <ul>${blockers.map(b => `<li class="bad">${esc(b.message)}</li>`).join('')}</ul>` : ''}
        ${warnings.length ? `<p class="validation-head warn">${warnings.length} warning${warnings.length > 1 ? 's' : ''} to check</p>
          <ul>${warnings.map(w => `<li class="warn">${esc(w.message)}</li>`).join('')}</ul>` : ''}
        ${n ? `<button type="button" class="link-btn" id="nextIssueBtn">Next issue ↓</button>` : ''}
      </div>`;
    $('nextIssueBtn') && $('nextIssueBtn').addEventListener('click', nextIssue);
  }

  const attentionGroups = () => [...document.querySelectorAll('#verificationFieldsContainer .field-verify-group.needs-attention')];

  function nextIssue() {
    const groups = attentionGroups();
    if (!groups.length) return;
    issueCursor = (issueCursor + 1) % groups.length;
    const g = groups[issueCursor];
    g.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const input = g.querySelector('[id^="field_"]');
    if (input) input.focus({ preventScroll: true });
    showFieldOnPhoto(g.dataset.field);
  }

  function fieldBadge(def) {
    const log = (record.corrections || []).filter(c => c.field_key === def.recordKey);
    const last = log[log.length - 1];
    if (last && last.kind === 'check') return '<span class="badge-confirmed">Checked</span>';
    if (last && last.kind === 'confirmation') return '<span class="badge-confirmed">Confirmed</span>';
    if (last && Rules.humanChanged(record, def.recordKey)) return '<span class="badge-corrected">Corrected</span>';
    const f = record.final_payload && record.final_payload.fields[def.key];
    if (!f) return '';
    if (f.not_on_form) return '<span class="badge-missing">Not on form</span>';
    const map = { read: ['badge-read', 'Read'], uncertain: ['badge-uncertain', 'Uncertain'], missing: ['badge-missing', 'Blank'], illegible: ['badge-illegible', 'Illegible'], invalid: ['badge-invalid', 'Invalid'] };
    const [cls, label] = map[f.status] || map.read;
    return `<span class="${cls}">${label}</span>`;
  }

  function control(def) {
    const id = `field_${def.recordKey}`;
    const v = record[def.recordKey];
    switch (def.type) {
      case 'machine': {
        const opts = machines.filter(m => m.is_active !== false || m.id === v);
        return `<select id="${id}" class="select-control">
          <option value="">— select loom —</option>
          ${opts.map(m => `<option value="${esc(m.id)}" ${m.id === v ? 'selected' : ''}>${esc(m.machine_code)} · ${esc(m.name)}</option>`).join('')}
        </select>`;
      }
      case 'shift':
        return `<select id="${id}" class="select-control">
          <option value="">— select shift —</option>
          ${shifts.map(s => `<option value="${esc(s.id)}" ${s.id === v ? 'selected' : ''}>${esc(s.name)} (${esc(s.shift_code)})</option>`).join('')}
        </select>`;
      case 'unit':
        return `<select id="${id}" class="select-control">
          ${['metres', 'yards', 'picks'].map(u => `<option value="${u}" ${u === (v || 'metres') ? 'selected' : ''}>${u}</option>`).join('')}
        </select>`;
      case 'date':
        return `<input type="date" id="${id}" class="form-control" value="${esc(v || '')}" max="${Rules.todayIso()}">`;
      case 'number':
        return `<input type="number" inputmode="decimal" step="any" min="0" id="${id}" class="form-control strong" value="${v === null || v === undefined ? '' : esc(v)}">`;
      case 'integer':
      case 'duration':
        return `<input type="number" inputmode="numeric" step="1" min="0" id="${id}" class="form-control" value="${v === null || v === undefined ? '' : esc(v)}">`;
      default:
        return `<input type="text" id="${id}" class="form-control" value="${esc(v || '')}" maxlength="200">`;
    }
  }

  /** People who cannot edit see plain values, not greyed-out inputs that look editable. */
  function readOnlyValue(def) {
    const v = record[def.recordKey];
    let text;
    if (v === null || v === undefined || v === '') text = null;
    else if (def.type === 'machine') { const m = machines.find(x => x.id === v); text = m ? `${m.machine_code} · ${m.name}` : v; }
    else if (def.type === 'shift') { const s = shifts.find(x => x.id === v); text = s ? `${s.name} (${s.shift_code})` : v; }
    else if (def.type === 'date') text = new Date(`${v}T00:00:00`).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
    else if (def.type === 'duration') text = `${v} min`;
    else text = String(v);
    return `<p class="field-value${text === null ? ' muted' : ''}${def.type === 'number' ? ' strong' : ''}" id="value_${def.recordKey}">${esc(text === null ? '—' : text)}</p>`;
  }

  /**
   * Other values this field could be: a second AI reading that disagreed, or two numbers written in one
   * box (a crossed-out value and its correction, read as "412 - 421"). Each becomes a one-tap choice.
   * @returns [{ value (as stored on the record), label }]
   */
  function candidates(def) {
    const f = record.final_payload && record.final_payload.fields[def.key];
    if (!f) return [];
    const out = [];
    const add = (value, label) => {
      if (value === null || value === undefined || value === '') return;
      if (Rules.sameValue(value, record[def.recordKey]) || out.some(c => Rules.sameValue(c.value, value))) return;
      out.push({ value, label: String(label) });
    };
    if (['number', 'integer'].includes(def.type) && f.raw_value) {
      const nums = String(f.raw_value).match(/\d+(?:\.\d+)?/g) || [];
      if (nums.length >= 2) nums.forEach(n => add(Number(n), n));
    }
    if (f.alt !== undefined && f.alt !== null) {
      if (def.type === 'machine') { const m = machines.find(x => x.machine_code === f.alt); if (m) add(m.id, m.machine_code); }
      else if (def.type === 'shift') { const s = shifts.find(x => x.shift_code === f.alt); if (s) add(s.id, s.name); }
      else add(f.alt, def.type === 'duration' ? `${f.alt} min` : f.alt);
    }
    return out;
  }

  /** Small helper lines under a field: other possible readings, reason code, "did you mean" for fabric names and lots. */
  function fieldHints(def, canEdit) {
    const v = record[def.recordKey];
    const alts = canEdit ? candidates(def) : [];
    const altHtml = alts.length
      ? `<div class="field-hint">Other possible reading${alts.length > 1 ? 's' : ''}: ${alts.map(c => `<button type="button" class="btn btn-outline btn-tiny" data-use-value="${esc(String(c.value))}" data-key="${def.recordKey}">Use ${esc(c.label)}</button>`).join(' ')}</div>`
      : '';
    return altHtml + baseHints(def, canEdit, v);
  }

  function baseHints(def, canEdit, v) {
    if (def.recordKey === 'downtime_reason' && v) {
      const hit = Rules.reasonOf(record, reasons);
      const r = hit && hit.reason;
      return `<div class="field-hint">Reason code: <strong>${esc(r ? `${r.name} (${r.code})` : `${Rules.OTHER_REASON.name} (${Rules.OTHER_REASON.code})`)}</strong></div>`;
    }
    if (def.recordKey === 'batch_reference' && v && canEdit) {
      const lot = Rules.checkLot(v, record.material_reference);
      if (lot.suggestion) {
        return `<div class="field-hint">Did you mean <strong>${esc(lot.suggestion)}</strong>? <button type="button" class="link-btn" data-use-lot="${esc(lot.suggestion)}">Use this</button></div>`;
      }
    }
    if (def.recordKey === 'material_reference' && v && canEdit && !knownMaterials.some(m => m.toLowerCase() === String(v).toLowerCase())) {
      const near = Rules.nearFabric(v, [...Rules.DEFAULT_FABRICS, ...knownMaterials]);
      const best = near ? [near, 1] : knownMaterials.map(m => [m, Rules.similarity(v, m)]).sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 0.72) {
        return `<div class="field-hint">Did you mean <strong>${esc(best[0])}</strong>? <button type="button" class="link-btn" data-use-material="${esc(best[0])}">Use this</button></div>`;
      }
    }
    return '';
  }

  function renderFields() {
    const canEdit = store.can('edit', record);
    const user = store.getCurrentUser();
    const unresolved = new Set(Rules.unresolvedFlags(record).map(d => d.recordKey));
    const msgs = {};
    for (const m of [...validation.blockers.map(b => ({ ...b, cls: 'bad' })), ...validation.warnings.map(w => ({ ...w, cls: 'warn' }))]) {
      (msgs[m.field] = msgs[m.field] || []).push(m);
    }
    const sections = { 1: 'Loom, date & shift', 2: 'Output & batch', 3: 'Quality & downtime' };
    const isReviewer = store.can('review', record);

    const fieldHtml = (def) => {
      const f = record.final_payload && record.final_payload.fields[def.key];
      const flagged = unresolved.has(def.recordKey);
      const fieldMsgs = (msgs[def.recordKey] || []).filter(m => !(flagged && m.message.includes('flagged')));
      const needsCheck = fieldMsgs.some(m => m.check);
      const attention = flagged || fieldMsgs.length > 0;
      const log = (record.corrections || []).filter(c => c.field_key === def.recordKey);
      const last = log[log.length - 1];
      const explain = canEdit && last && last.kind === 'correction' && last.changed_by === user.id;
      const box = f && f.box;
      return `
          <div class="field-verify-group${flagged || needsCheck ? ' is-flagged' : ''}${attention ? ' needs-attention' : ''}${def.type === 'text' && ['defect_details', 'downtime_reason', 'remarks', 'material_reference'].includes(def.recordKey) ? ' span-2' : ''}" data-field="${def.recordKey}"${box ? ' data-has-box="1"' : ''}>
            <div class="field-verify-header">
              <label class="field-verify-label" for="field_${def.recordKey}">${esc(def.label)}${def.required ? ' <span class="req">*</span>' : ''}</label>
              ${fieldBadge(def)}
            </div>
            ${canEdit ? control(def) : readOnlyValue(def)}
            ${f && f.raw_value !== null && f.raw_value !== undefined ? `<div class="raw-transcription-hint">Written: “${esc(f.raw_value)}”${box ? ` <button type="button" class="link-btn locate-btn" data-locate="${def.recordKey}" aria-label="Show ${esc(def.label)} on the photo">📍 Show on photo</button>` : ''}</div>` : (box ? `<div class="raw-transcription-hint"><button type="button" class="link-btn locate-btn" data-locate="${def.recordKey}" aria-label="Show ${esc(def.label)} on the photo">📍 Show on photo</button></div>` : '')}
            ${f && f.reason && !f.not_on_form ? `<div class="field-reason-pill">${esc(f.reason)}</div>` : ''}
            ${fieldMsgs.map(m => `<div class="field-msg ${m.cls}">${esc(m.message)}</div>`).join('')}
            ${fieldHints(def, canEdit)}
            ${explain ? `<label class="reason-inline">Reason for change <input type="text" class="form-control reason-input" data-entry="${esc(last.id)}" value="${esc(last.reason || '')}" maxlength="300"></label>` : ''}
            ${flagged && canEdit && isReviewer ? `<button type="button" class="btn btn-outline btn-tiny confirm-btn" data-key="${def.recordKey}">✓ Value matches photo</button>` : ''}
            ${!flagged && needsCheck && canEdit && isReviewer ? `<button type="button" class="btn btn-outline btn-tiny check-btn" data-key="${def.recordKey}">✓ I checked this against the photo</button>` : ''}
          </div>`;
    };

    // Fields that need a human (AI flags, blockers, warnings) come first, so nobody has to hunt for them.
    const attention = Rules.FIELD_DEFS.filter(d => unresolved.has(d.recordKey) || (msgs[d.recordKey] || []).length);
    const rest = (sec) => Rules.FIELD_DEFS.filter(d => d.section === sec && !attention.includes(d));
    const issues = (record.final_payload && record.final_payload.image_issues) || [];
    const html = (issues.length ? `<p class="show-phone small warn">Photo issues noted by the AI: ${issues.map(esc).join('; ')}</p>` : '') +
      (attention.length ? `
      <p class="section-label attention-label">Needs your check</p>
      <div class="field-grid">${attention.map(fieldHtml).join('')}</div>` : '') +
      [1, 2, 3].filter(sec => rest(sec).length).map(sec => `
      <p class="section-label">${sections[sec]}</p>
      <div class="field-grid">${rest(sec).map(fieldHtml).join('')}</div>`).join('');
    const container = $('verificationFieldsContainer');
    container.innerHTML = html;
    issueCursor = -1;

    container.querySelectorAll('[data-locate]').forEach(btn => btn.addEventListener('click', () => showFieldOnPhoto(btn.dataset.locate)));
    if (!canEdit) return;
    container.querySelectorAll('[id^="field_"]').forEach(el => {
      el.addEventListener('change', () => onFieldChange(el));
      el.addEventListener('focus', () => showFieldOnPhoto(el.id.replace('field_', ''), true));
    });
    container.querySelectorAll('.reason-input').forEach(el => el.addEventListener('change', () => onReasonChange(el)));
    container.querySelectorAll('.confirm-btn').forEach(btn => btn.addEventListener('click', () => onConfirm(btn.dataset.key)));
    container.querySelectorAll('.check-btn').forEach(btn => btn.addEventListener('click', () => onCheck(btn.dataset.key)));
    container.querySelectorAll('[data-use-value]').forEach(btn => btn.addEventListener('click', async () => {
      await save(btn.dataset.key, btn.dataset.useValue, 'Picked from the other possible readings');
    }));
    container.querySelectorAll('[data-use-lot]').forEach(btn => btn.addEventListener('click', async () => {
      await save('batch_reference', btn.dataset.useLot, 'Lot number with look-alike characters fixed');
    }));
    container.querySelectorAll('[data-use-material]').forEach(btn => btn.addEventListener('click', async () => {
      await save('material_reference', btn.dataset.useMaterial, 'Matched to a known fabric name');
    }));
  }

  function showFieldOnPhoto(key, quiet) {
    const def = Rules.FIELD_DEFS.find(d => d.recordKey === key);
    const f = def && record.final_payload && record.final_payload.fields[def.key];
    if (f && f.box && viewer) viewer.showBox(f.box);
    else if (!quiet && viewer) window.toast.show('The AI did not mark where this was written.', 'info');
  }

  /** Inline correction: saved immediately with a default reason; Undo is one tap away. */
  async function onFieldChange(el) {
    const key = el.id.replace('field_', '');
    await save(key, el.value, '');
  }

  async function save(key, value, reason) {
    const def = Rules.FIELD_DEFS.find(d => d.recordKey === key);
    let entry = null;
    try {
      entry = await store.correctField(record.id, key, value, reason);
    } catch (err) {
      window.toast.show(err.message, 'error');
      await refresh();
      return;
    }
    if (entry) {
      window.toast.show(`${def.label}: ${display(key, entry.original_value)} → ${display(key, entry.corrected_value)}`, 'success', {
        action: { label: 'Undo', onClick: () => undo(entry.id) }
      });
    }
    await refresh();
  }

  async function undo(entryId) {
    try {
      await store.undoCorrection(record.id, entryId);
      window.toast.show('Change undone.', 'info');
    } catch (err) {
      window.toast.show(err.message, 'error');
    }
    await refresh();
  }

  async function onReasonChange(el) {
    try {
      await store.setCorrectionReason(record.id, el.dataset.entry, el.value);
      window.toast.show('Reason saved.', 'success');
      record = await store.getRecordById(record.id);
      renderAudit();
    } catch (err) {
      window.toast.show(err.message, 'error');
    }
  }

  async function onConfirm(key) {
    const def = Rules.FIELD_DEFS.find(d => d.recordKey === key);
    try {
      await store.confirmField(record.id, key, 'Value matches the photo');
      window.toast.show(`${def.label} confirmed.`, 'success');
    } catch (err) {
      window.toast.show(err.message, 'error');
    }
    await refresh();
  }

  async function onCheck(key) {
    const def = Rules.FIELD_DEFS.find(d => d.recordKey === key);
    try {
      await store.checkField(record.id, key);
      window.toast.show(`${def.label} checked against the photo.`, 'success');
    } catch (err) {
      window.toast.show(err.message, 'error');
    }
    await refresh();
  }

  function display(key, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (key === 'machine_id') { const m = machines.find(x => x.id === v); return m ? m.machine_code : v; }
    if (key === 'shift_id') { const s = shifts.find(x => x.id === v); return s ? s.shift_code : v; }
    return String(v);
  }

  const ACTION_LABEL = { correction: 'Corrected', undo: 'Undone', confirmation: 'Confirmed', check: 'Checked' };

  function renderAudit() {
    const list = record.corrections || [];
    $('auditTrailContainer').classList.toggle('hidden', !list.length);
    $('auditTrailList').innerHTML = list.map(c => {
      const def = Rules.FIELD_DEFS.find(d => d.recordKey === c.field_key);
      const valueChange = c.kind === 'correction' || c.kind === 'undo';
      return `
      <tr>
        <td class="strong">${esc(def ? def.label : c.field_key)}</td>
        <td>${ACTION_LABEL[c.kind] || 'Changed'}</td>
        <td class="mono">${valueChange ? `<del>${esc(display(c.field_key, c.original_value))}</del>` : ''}</td>
        <td class="mono strong">${esc(display(c.field_key, c.corrected_value))}</td>
        <td>${esc(c.changed_by_name || '')}</td>
        <td class="nowrap">${esc(new Date(c.changed_at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td>
        <td>${esc(c.reason || '')}</td>
      </tr>`;
    }).join('');
  }

  function renderActions() {
    const bar = $('actionBar');
    const user = store.getCurrentUser();
    const parts = [];
    if (store.can('review', record)) {
      const n = validation.blockers.length;
      const to = record.submitted_by === user.id ? 'me' : (record.submitted_by_name || 'operator').split(' ')[0];
      parts.push(`<div class="btn-row action-secondary">
          <button type="button" class="btn btn-outline btn-warn" id="returnBtn" aria-label="Return to ${esc(to)}" title="Send back to ${esc(record.submitted_by_name || 'the operator')} to fix">↩<span class="btn-label"> Return to ${esc(to)}</span></button>
          <button type="button" class="btn btn-outline btn-bad" id="rejectBtn" aria-label="Reject" title="Reject (never sent to the ERP)">✕<span class="btn-label"> Reject</span></button>
        </div>
        <div class="btn-row approve-group">
          ${n ? `<span class="small bad hide-phone">${n} issue${n > 1 ? 's' : ''} to resolve</span>` : ''}
          <button type="button" class="btn btn-primary btn-large" id="approveBtn" ${n ? 'disabled aria-disabled="true"' : ''} aria-label="${n ? `Approve and send to ERP (${n} to resolve first)` : 'Approve and send to ERP'}" title="Approve (A)">
            <span class="hide-phone">✓ Approve &amp; send to ERP</span><span class="show-phone">${n ? `${n} to resolve first` : '✓ Approve &amp; send'}</span>
          </button>
        </div>`);
    } else if (store.can('resubmit', record)) {
      parts.push(`<span class="small">Fix the fields the supervisor mentioned, then resubmit.</span>
        <button type="button" class="btn btn-primary" id="resubmitBtn">Resubmit for review →</button>`);
    } else if (record.status === 'approved' && store.can('dispatch_erp', record) && record.erp_status !== 'submitted') {
      parts.push(`<span class="small warn">ERP has not acknowledged this record.</span>
        <button type="button" class="btn btn-primary" id="retryErpBtn">Retry ERP dispatch</button>`);
    } else {
      const note = record.status === 'pending_review' && user.role === 'operator' ? 'Waiting for a supervisor to review.' :
        record.status === 'approved' ? 'Approved records are locked.' : record.status === 'rejected' ? 'Rejected records are locked.' : '';
      parts.push(`<span class="small muted">${note}</span><div class="btn-row"><a class="btn btn-outline" href="review.html${record.batch_id ? `?batch=${encodeURIComponent(record.batch_id)}` : ''}">Back to queue</a>${nextId ? `<a class="btn btn-primary" id="nextRecordBtn" href="review.html?id=${encodeURIComponent(nextId)}" title="Next record (N)">Next record →</a>` : ''}</div>`);
    }
    bar.innerHTML = parts.join('');

    $('approveBtn') && $('approveBtn').addEventListener('click', onApprove);
    $('returnBtn') && $('returnBtn').addEventListener('click', onReturn);
    $('rejectBtn') && $('rejectBtn').addEventListener('click', onReject);
    $('resubmitBtn') && $('resubmitBtn').addEventListener('click', onResubmit);
    $('retryErpBtn') && $('retryErpBtn').addEventListener('click', sendToErp);
  }

  async function onApprove() {
    const warn = validation.warnings.length ? `${validation.warnings.length} warning(s) are still open; approving means you accept them.` : 'The record will be locked and sent to the ERP.';
    const note = await window.dialog.prompt({ title: `Approve ${record.record_number}`, message: warn, label: 'Sign-off note (optional)', defaultValue: '', confirmText: 'Approve & send' });
    if (note === null) return;
    try {
      await store.approveRecord(record.id, note);
    } catch (err) {
      window.toast.show(err.message, 'error');
      await refresh();
      return;
    }
    await sendToErp();
  }

  async function sendToErp() {
    try {
      const res = await store.submitToErp(record.id);
      window.toast.show(`Approved. ERP reference ${res.erp_reference}.`, 'success');
    } catch (err) {
      window.toast.show(`${err.message} The record stays approved; retry from here or the register.`, 'warning');
    }
    await refresh();
  }

  async function onReturn() {
    const name = record.submitted_by_name || 'the operator';
    const reason = await window.dialog.prompt({ title: `Return to ${name}`, label: `What should ${name.split(' ')[0]} fix?`, defaultValue: '', required: true, confirmText: 'Return record' });
    if (reason === null) return;
    try {
      await store.returnForCorrection(record.id, reason);
      window.toast.show(`Returned to ${name}.`, 'warning');
    } catch (err) { window.toast.show(err.message, 'error'); }
    await refresh();
  }

  async function onReject() {
    const reason = await window.dialog.prompt({ title: 'Reject record', message: 'Rejected records are never sent to the ERP.', label: 'Reason', defaultValue: '', required: true, confirmText: 'Reject', danger: true });
    if (reason === null) return;
    try {
      await store.rejectRecord(record.id, reason);
      window.toast.show('Record rejected.', 'warning');
    } catch (err) { window.toast.show(err.message, 'error'); }
    await refresh();
  }

  async function onResubmit() {
    try {
      await store.resubmitRecord(record.id);
      window.toast.show('Sent back for review.', 'success');
    } catch (err) { window.toast.show(err.message, 'error'); }
    await refresh();
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (desktop): A approve, N next, J next issue, F photo, +/- zoom, 0 reset, ? help
  // ---------------------------------------------------------------------------
  function setupShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.closest('input, textarea, select, [contenteditable]') || document.querySelector('.app-dialog-overlay'))) return;
      const click = (id) => { const el = $(id); if (el && !el.disabled) { e.preventDefault(); el.click(); } };
      switch (e.key) {
        case 'a': case 'A': click('approveBtn'); break;
        case 'n': case 'N': click('nextRecordBtn'); break;
        case 'j': case 'J': e.preventDefault(); nextIssue(); break;
        case 'f': case 'F': click('fullscreenBtn'); break;
        case '+': case '=': click('zoomInBtn'); break;
        case '-': click('zoomOutBtn'); break;
        case '0': click('zoomResetBtn'); break;
        case '?':
          e.preventDefault();
          window.dialog.confirm({
            title: 'Keyboard shortcuts',
            message: 'A approve · N next record · J next issue · F full-screen photo · + / − zoom · 0 reset photo · Esc close. Ctrl + scroll or pinch zooms the photo; double-click zooms in where you click.',
            confirmText: 'Got it'
          });
          break;
        default:
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Photo viewer: pan, Ctrl+wheel / pinch / double-tap / button zoom, rotate,
  // and "show on photo" (zoom to where the AI says a value is written).
  // ---------------------------------------------------------------------------
  async function loadImage() {
    const img = $('canvasImg');
    const note = $('noImageNote');
    try {
      imageUrl = await store.getFormImageUrl(record.form_id);
    } catch (_) {
      imageUrl = null;
    }
    if (imageUrl) {
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = imageUrl;
      });
      img.classList.remove('hidden');
      note.classList.add('hidden');
    } else {
      img.classList.add('hidden');
      note.classList.remove('hidden');
      note.textContent = 'The photo for this record is not stored in this browser.';
    }
    const issues = (record.final_payload && record.final_payload.image_issues) || [];
    const ul = $('imageIssues');
    ul.innerHTML = issues.map(i => `<li>${esc(i)}</li>`).join('');
    ul.classList.toggle('hidden', !issues.length);
    if (issues.length) ul.insertAdjacentHTML('afterbegin', '<li class="section-label">Photo issues noted by the AI</li>');
  }

  function setupViewer() {
    const vp = $('canvasViewport');
    const img = $('canvasImg');
    const mark = $('boxHighlight');
    const view = { scale: 1, x: 0, y: 0, rot: 0 };
    const pointers = new Map();
    let pinchStart = null;
    let drag = null;
    let lastTap = null;
    let box = null;

    const rotate = (px, py) => {
      const a = (view.rot * Math.PI) / 180;
      return [px * Math.cos(a) - py * Math.sin(a), px * Math.sin(a) + py * Math.cos(a)];
    };
    const imgCenter = () => [img.offsetLeft + img.offsetWidth / 2, img.offsetTop + img.offsetHeight / 2];
    /** Screen position (inside the viewport) of a point given in image coordinates relative to its centre. */
    const toScreen = (px, py) => {
      const [cx, cy] = imgCenter();
      const [rx, ry] = rotate(px * view.scale, py * view.scale);
      return [cx + view.x + rx, cy + view.y + ry];
    };

    const apply = (animate) => {
      img.classList.toggle('animate', Boolean(animate));
      img.style.transform = `translate(${view.x}px, ${view.y}px) rotate(${view.rot}deg) scale(${view.scale})`;
      $('zoomLabel').textContent = `${Math.round(view.scale * 100)}%`;
      if (box && img.offsetWidth) {
        const w = img.offsetWidth, h = img.offsetHeight;
        const [y0, x0, y1, x1] = box.map(v => v / 1000);
        const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => toScreen((x - 0.5) * w, (y - 0.5) * h));
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        mark.style.left = `${Math.min(...xs) - 3}px`;
        mark.style.top = `${Math.min(...ys) - 3}px`;
        mark.style.width = `${Math.max(...xs) - Math.min(...xs) + 6}px`;
        mark.style.height = `${Math.max(...ys) - Math.min(...ys) + 6}px`;
        mark.classList.toggle('animate', Boolean(animate));
        mark.classList.remove('hidden');
      } else {
        mark.classList.add('hidden');
      }
    };
    const clamp = (s) => Math.min(6, Math.max(0.5, s));

    /** Zoom by `factor` keeping the point under (clientX, clientY) still. */
    const zoomAt = (factor, clientX, clientY, animate) => {
      const r = vp.getBoundingClientRect();
      const px = clientX === undefined ? r.width / 2 : clientX - r.left;
      const py = clientY === undefined ? r.height / 2 : clientY - r.top;
      const next = clamp(view.scale * factor);
      const k = next / view.scale;
      const [cx, cy] = imgCenter();
      view.x = px - cx - k * (px - cx - view.x);
      view.y = py - cy - k * (py - cy - view.y);
      view.scale = next;
      apply(animate);
    };

    /** Centre and zoom the viewer on a [ymin, xmin, ymax, xmax] (0-1000) box, and outline it. */
    let boxIsRow = false;
    let boxLabel = '';
    const showBox = (b, { row = false, label = '' } = {}) => {
      if (!b || !img.offsetWidth) return;
      box = b;
      boxIsRow = row;
      boxLabel = label;
      if (label) mark.dataset.label = label; else delete mark.dataset.label;
      const w = img.offsetWidth, h = img.offsetHeight;
      const [y0, x0, y1, x1] = b.map(v => v / 1000);
      const bw = Math.max((x1 - x0) * w, 8), bh = Math.max((y1 - y0) * h, 8);
      const target = row ? (vp.clientWidth * 0.94) / bw : Math.min((vp.clientWidth * 0.5) / bw, (vp.clientHeight * 0.3) / bh);
      view.scale = Math.min(row ? 4 : 3.5, Math.max(1.2, target));
      const [rx, ry] = rotate(((x0 + x1) / 2 - 0.5) * w * view.scale, ((y0 + y1) / 2 - 0.5) * h * view.scale);
      const [cx, cy] = imgCenter();
      view.x = vp.clientWidth / 2 - cx - rx;
      view.y = vp.clientHeight / 2 - cy - ry;
      apply(true);
    };

    const card = vp.closest('.document-viewer-card');
    const setFullscreen = (on) => {
      card.classList.toggle('is-fullscreen', on);
      document.body.classList.toggle('viewer-open', on);
      $('fullscreenBtn').setAttribute('aria-pressed', String(on));
      $('fullscreenBtn').setAttribute('aria-label', on ? 'Close full screen' : 'Full screen photo');
      $('fullscreenBtn').textContent = on ? '✕' : '⛶';
      requestAnimationFrame(() => apply());
    };
    $('fullscreenBtn').addEventListener('click', () => setFullscreen(!card.classList.contains('is-fullscreen')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card.classList.contains('is-fullscreen')) setFullscreen(false); });

    // Phone: hide / show the photo; the choice is remembered.
    const setCollapsed = (collapsed) => {
      card.classList.toggle('viewer-collapsed', collapsed);
      $('photoToggleBtn').setAttribute('aria-pressed', String(collapsed));
      $('photoToggleBtn').setAttribute('aria-label', collapsed ? 'Show photo' : 'Hide photo');
      $('photoToggleBtn').textContent = collapsed ? '▾' : '▴';
    };
    try { if (localStorage.getItem('aplyd_photo_collapsed') === '1') setCollapsed(true); } catch (_) { /* ignore */ }
    $('photoToggleBtn').addEventListener('click', () => {
      const collapsed = !card.classList.contains('viewer-collapsed');
      setCollapsed(collapsed);
      try { localStorage.setItem('aplyd_photo_collapsed', collapsed ? '1' : '0'); } catch (_) { /* ignore */ }
    });

    // Phone: while typing in a field, shrink the pinned photo so the field and keyboard fit.
    const fields = $('verificationFieldsContainer');
    fields.addEventListener('focusin', (e) => {
      if (!e.target.matches('input, select, textarea')) return;
      document.body.classList.add('editing-field');
      const g = e.target.closest('.field-verify-group');
      if (g) setTimeout(() => g.scrollIntoView({ block: 'nearest' }), 60);
    });
    fields.addEventListener('focusout', () => document.body.classList.remove('editing-field'));

    $('zoomInBtn').addEventListener('click', () => zoomAt(1.25));
    $('zoomOutBtn').addEventListener('click', () => zoomAt(0.8));
    $('rotateViewBtn').addEventListener('click', () => { view.rot = (view.rot + 90) % 360; apply(); });
    $('zoomResetBtn').addEventListener('click', () => { Object.assign(view, { scale: 1, x: 0, y: 0, rot: 0 }); box = null; apply(true); });

    // Plain wheel scrolls the page; Ctrl+wheel (and trackpad pinch) zooms. In full screen the wheel zooms.
    vp.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey || card.classList.contains('is-fullscreen'))) return;
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY);
    }, { passive: false });
    vp.addEventListener('pointerdown', (e) => {
      vp.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        // double-tap / double-click: zoom in where tapped (or back out when already zoomed)
        const now = Date.now();
        if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          if (view.scale > 1.8) { Object.assign(view, { scale: 1, x: 0, y: 0 }); apply(true); } else zoomAt(2.5 / view.scale, e.clientX, e.clientY, true);
          lastTap = null;
        } else lastTap = { t: now, x: e.clientX, y: e.clientY };
        drag = { x: e.clientX - view.x, y: e.clientY - view.y };
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      }
    });
    vp.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const want = clamp(pinchStart.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.dist);
        zoomAt(want / view.scale, pinchStart.cx, pinchStart.cy);
      } else if (pointers.size === 1 && drag) {
        view.x = e.clientX - drag.x;
        view.y = e.clientY - drag.y;
        apply();
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 1) { const p = [...pointers.values()][0]; drag = { x: p.x - view.x, y: p.y - view.y }; }
      if (!pointers.size) drag = null;
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    // The viewer changes size (phone keyboard open, full screen, window resize): keep the outlined value centred.
    let lastSize = '';
    const onResize = () => {
      const size = `${vp.clientWidth}x${vp.clientHeight}`;
      if (size === lastSize) return;
      lastSize = size;
      if (box && !drag && !pinchStart) showBox(box, { row: boxIsRow, label: boxLabel }); else apply();
    };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(vp);
    else window.addEventListener('resize', onResize);
    apply();
    return { showBox, view };
  }
})();
