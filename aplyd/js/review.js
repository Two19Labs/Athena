/**
 * APLYD - Review console.
 * Queue of records + split-screen verification: photo on the left, AI-read
 * fields on the right with per-field status, inline business-rule results,
 * correct/confirm actions, an append-only audit trail and role-aware actions.
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
  let imageUrl = null;
  const view = { scale: 1, x: 0, y: 0, rot: 0 };

  document.addEventListener('DOMContentLoaded', async () => {
    const id = new URLSearchParams(location.search).get('id');
    machines = await store.getMachines();
    shifts = await store.getShifts();
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
    $('queueStatusFilter').addEventListener('change', renderQueue);
    $('queueSearchInput').addEventListener('input', renderQueue);
    await renderQueue();
  }

  async function renderQueue() {
    const user = store.getCurrentUser();
    const status = $('queueStatusFilter').value;
    const filters = { status, search: $('queueSearchInput').value };
    if (user.role === 'operator') filters.submitted_by = user.id;
    const rows = await store.getRecords(filters);
    const tbody = $('queueTableBody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">Nothing here. <a href="capture.html">Capture a form</a> to start.</td></tr>`;
      return;
    }
    const cells = await Promise.all(rows.map(async (r) => {
      const v = await store.validationFor(r);
      const flags = Rules.unresolvedFlags(r).length;
      const attention = r.status === 'pending_review'
        ? [
          flags ? `<span class="badge-uncertain">${flags} AI flag${flags > 1 ? 's' : ''}</span>` : '',
          v.blockers.length - flags > 0 ? `<span class="badge-invalid">${v.blockers.length - flags} blocker${v.blockers.length - flags > 1 ? 's' : ''}</span>` : '',
          v.warnings.length ? `<span class="badge-missing">${v.warnings.length} warning${v.warnings.length > 1 ? 's' : ''}</span>` : ''
        ].join(' ') || '<span class="badge-read">Ready</span>'
        : (r.status === 'returned_for_correction' ? `<span class="small">${esc(r.return_reason || '')}</span>` : '');
      return `
        <tr>
          <td class="mono strong">${esc(r.record_number)}${r.seed ? ' <span class="tag">seed</span>' : ''}</td>
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
    setupViewer();
    await loadImage();
    await refresh();
  }

  async function refresh() {
    record = await store.getRecordById(record.id);
    validation = await store.validationFor(record);
    renderHeader();
    renderBanner();
    renderValidation();
    renderFields();
    renderAudit();
    renderActions();
  }

  function renderHeader() {
    $('detailRecordNumber').textContent = record.record_number;
    const parts = [
      record.form_number ? `Form ${record.form_number}` : 'Seeded history record',
      record.submitted_by_name ? `by ${record.submitted_by_name}` : null,
      record.created_at ? new Date(record.created_at).toLocaleString() : null
    ].filter(Boolean);
    $('detailRecordMeta').textContent = parts.join(' · ');
    const badge = $('detailStatusBadge');
    badge.className = L.statusClass(record.status);
    badge.textContent = L.statusLabel(record.status);
    if (record.extraction_model) {
      const ms = record.form && record.form.extraction_latency_ms;
      $('extractionMeta').textContent = `Read by ${record.extraction_model}${ms ? ` in ${(ms / 1000).toFixed(1)}s` : ''}`;
    }
  }

  function renderBanner() {
    const el = $('statusBanner');
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
    el.innerHTML = html;
    el.classList.toggle('hidden', !html);
  }

  function renderValidation() {
    const el = $('validationPanel');
    if (record.status !== 'pending_review' && record.status !== 'returned_for_correction') { el.innerHTML = ''; return; }
    const { blockers, warnings } = validation;
    if (!blockers.length && !warnings.length) {
      el.innerHTML = `<div class="validation-panel validation-ok">✓ All checks pass. Ready to approve.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="validation-panel">
        ${blockers.length ? `<p class="validation-head bad">${blockers.length} issue${blockers.length > 1 ? 's' : ''} must be resolved before approval</p>
          <ul>${blockers.map(b => `<li class="bad">${esc(b.message)}</li>`).join('')}</ul>` : ''}
        ${warnings.length ? `<p class="validation-head warn">${warnings.length} warning${warnings.length > 1 ? 's' : ''} to check</p>
          <ul>${warnings.map(w => `<li class="warn">${esc(w.message)}</li>`).join('')}</ul>` : ''}
      </div>`;
  }

  function fieldBadge(def) {
    const log = (record.corrections || []).filter(c => c.field_key === def.recordKey);
    const last = log[log.length - 1];
    if (last && last.kind === 'confirmation') return '<span class="badge-confirmed">Confirmed</span>';
    if (last) return '<span class="badge-corrected">Corrected</span>';
    const f = record.final_payload && record.final_payload.fields[def.key];
    if (!f) return '';
    const map = { read: ['badge-read', 'Read'], uncertain: ['badge-uncertain', 'Uncertain'], missing: ['badge-missing', 'Blank'], illegible: ['badge-illegible', 'Illegible'], invalid: ['badge-invalid', 'Invalid'] };
    const [cls, label] = map[f.status] || map.read;
    return `<span class="${cls}">${label}</span>`;
  }

  function control(def, disabled) {
    const id = `field_${def.recordKey}`;
    const v = record[def.recordKey];
    const dis = disabled ? 'disabled' : '';
    switch (def.type) {
      case 'machine': {
        const opts = machines.filter(m => m.is_active !== false || m.id === v);
        return `<select id="${id}" class="select-control" ${dis}>
          <option value="">— select loom —</option>
          ${opts.map(m => `<option value="${esc(m.id)}" ${m.id === v ? 'selected' : ''}>${esc(m.machine_code)} · ${esc(m.name)}</option>`).join('')}
        </select>`;
      }
      case 'shift':
        return `<select id="${id}" class="select-control" ${dis}>
          <option value="">— select shift —</option>
          ${shifts.map(s => `<option value="${esc(s.id)}" ${s.id === v ? 'selected' : ''}>${esc(s.name)} (${esc(s.shift_code)})</option>`).join('')}
        </select>`;
      case 'unit':
        return `<select id="${id}" class="select-control" ${dis}>
          ${['metres', 'yards', 'picks'].map(u => `<option value="${u}" ${u === (v || 'metres') ? 'selected' : ''}>${u}</option>`).join('')}
        </select>`;
      case 'date':
        return `<input type="date" id="${id}" class="form-control" value="${esc(v || '')}" max="${Rules.todayIso()}" ${dis}>`;
      case 'number':
        return `<input type="number" inputmode="decimal" step="any" min="0" id="${id}" class="form-control strong" value="${v === null || v === undefined ? '' : esc(v)}" ${dis}>`;
      case 'integer':
      case 'duration':
        return `<input type="number" inputmode="numeric" step="1" min="0" id="${id}" class="form-control" value="${v === null || v === undefined ? '' : esc(v)}" ${dis}>`;
      default:
        return `<input type="text" id="${id}" class="form-control" value="${esc(v || '')}" maxlength="200" ${dis}>`;
    }
  }

  function renderFields() {
    const canEdit = store.can('edit', record);
    const unresolved = new Set(Rules.unresolvedFlags(record).map(d => d.recordKey));
    const msgs = {};
    for (const m of [...validation.blockers.map(b => ({ ...b, cls: 'bad' })), ...validation.warnings.map(w => ({ ...w, cls: 'warn' }))]) {
      (msgs[m.field] = msgs[m.field] || []).push(m);
    }
    const sections = { 1: 'Loom, date & shift', 2: 'Output & batch', 3: 'Quality & downtime' };

    const html = [1, 2, 3].map(sec => `
      <p class="section-label">${sections[sec]}</p>
      <div class="field-grid">
        ${Rules.FIELD_DEFS.filter(d => d.section === sec).map(def => {
          const f = record.final_payload && record.final_payload.fields[def.key];
          const flagged = unresolved.has(def.recordKey);
          const fieldMsgs = (msgs[def.recordKey] || []).filter(m => !(flagged && m.message.includes('flagged')));
          return `
          <div class="field-verify-group${flagged ? ' is-flagged' : ''}${def.type === 'text' && ['defect_details', 'downtime_reason', 'remarks', 'material_reference'].includes(def.recordKey) ? ' span-2' : ''}" data-field="${def.recordKey}">
            <div class="field-verify-header">
              <label class="field-verify-label" for="field_${def.recordKey}">${esc(def.label)}${def.required ? ' <span class="req">*</span>' : ''}</label>
              ${fieldBadge(def)}
            </div>
            ${control(def, !canEdit)}
            ${f && f.raw_value !== null && f.raw_value !== undefined ? `<div class="raw-transcription-hint">Written: “${esc(f.raw_value)}”</div>` : ''}
            ${f && f.reason ? `<div class="field-reason-pill">${esc(f.reason)}</div>` : ''}
            ${fieldMsgs.map(m => `<div class="field-msg ${m.cls}">${esc(m.message)}</div>`).join('')}
            ${flagged && canEdit && store.can('review', record) ? `<button type="button" class="btn btn-outline btn-tiny confirm-btn" data-key="${def.recordKey}">✓ Value matches photo</button>` : ''}
          </div>`;
        }).join('')}
      </div>`).join('');
    $('verificationFieldsContainer').innerHTML = html;

    if (!canEdit) return;
    $('verificationFieldsContainer').querySelectorAll('input, select').forEach(el => {
      el.addEventListener('change', () => onFieldChange(el));
    });
    $('verificationFieldsContainer').querySelectorAll('.confirm-btn').forEach(btn => {
      btn.addEventListener('click', () => onConfirm(btn.dataset.key));
    });
  }

  async function onFieldChange(el) {
    const key = el.id.replace('field_', '');
    const def = Rules.FIELD_DEFS.find(d => d.recordKey === key);
    const reason = await window.dialog.prompt({
      title: `Change ${def.label}`,
      message: 'The original AI value is kept in the audit trail.',
      label: 'Reason (optional)',
      defaultValue: 'Checked against the photo',
      confirmText: 'Save change'
    });
    if (reason === null) { renderFields(); return; }
    try {
      await store.correctField(record.id, key, el.value, reason);
      window.toast.show(`${def.label} updated.`, 'success');
    } catch (err) {
      window.toast.show(err.message, 'error');
    }
    await refresh();
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

  function display(key, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (key === 'machine_id') { const m = machines.find(x => x.id === v); return m ? m.machine_code : v; }
    if (key === 'shift_id') { const s = shifts.find(x => x.id === v); return s ? s.shift_code : v; }
    return String(v);
  }

  function renderAudit() {
    const list = record.corrections || [];
    $('auditTrailContainer').classList.toggle('hidden', !list.length);
    $('auditTrailList').innerHTML = list.map(c => {
      const def = Rules.FIELD_DEFS.find(d => d.recordKey === c.field_key);
      return `
      <tr>
        <td class="strong">${esc(def ? def.label : c.field_key)}</td>
        <td>${c.kind === 'confirmation' ? 'Confirmed' : 'Corrected'}</td>
        <td class="mono">${c.kind === 'confirmation' ? '' : `<del>${esc(display(c.field_key, c.original_value))}</del>`}</td>
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
      parts.push(`<div class="btn-row">
          <button type="button" class="btn btn-outline btn-warn" id="returnBtn">↩ Return to operator</button>
          <button type="button" class="btn btn-outline btn-bad" id="rejectBtn">✕ Reject</button>
        </div>
        <div class="btn-row approve-group">
          ${n ? `<span class="small bad">${n} issue${n > 1 ? 's' : ''} to resolve</span>` : ''}
          <button type="button" class="btn btn-primary btn-large" id="approveBtn" ${n ? 'disabled aria-disabled="true"' : ''}>✓ Approve &amp; send to ERP</button>
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
      parts.push(`<span class="small muted">${note}</span><a class="btn btn-outline" href="review.html">Back to queue</a>`);
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
    const reason = await window.dialog.prompt({ title: 'Return to operator', label: 'What should the operator fix?', defaultValue: '', required: true, confirmText: 'Return record' });
    if (reason === null) return;
    try {
      await store.returnForCorrection(record.id, reason);
      window.toast.show('Returned to the operator.', 'warning');
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
  // Photo viewer: pointer pan, wheel / pinch / button zoom, rotate
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
      img.src = imageUrl;
      img.classList.remove('hidden');
      note.classList.add('hidden');
    } else {
      img.classList.add('hidden');
      note.classList.remove('hidden');
      note.textContent = record.seed
        ? 'Seeded history record: no photo attached.'
        : 'The photo for this record is not stored in this browser.';
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
    const pointers = new Map();
    let pinchStart = null;
    let drag = null;

    const apply = () => {
      img.style.transform = `translate(${view.x}px, ${view.y}px) rotate(${view.rot}deg) scale(${view.scale})`;
      $('zoomLabel').textContent = `${Math.round(view.scale * 100)}%`;
    };
    const zoom = (factor) => { view.scale = Math.min(6, Math.max(0.5, view.scale * factor)); apply(); };

    $('zoomInBtn').addEventListener('click', () => zoom(1.25));
    $('zoomOutBtn').addEventListener('click', () => zoom(0.8));
    $('rotateViewBtn').addEventListener('click', () => { view.rot = (view.rot + 90) % 360; apply(); });
    $('zoomResetBtn').addEventListener('click', () => { Object.assign(view, { scale: 1, x: 0, y: 0, rot: 0 }); apply(); });

    vp.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 0.9); }, { passive: false });
    vp.addEventListener('pointerdown', (e) => {
      vp.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) drag = { x: e.clientX - view.x, y: e.clientY - view.y };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
      }
    });
    vp.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        view.scale = Math.min(6, Math.max(0.5, pinchStart.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.dist));
        apply();
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
    apply();
  }
})();
