/**
 * APLYD - Production register: filterable ledger, record inspector with the
 * exact ERP payload, ERP dispatch/retry, CSV and JSON export.
 */
(function () {
  const store = window.aplydStore;
  const L = window.AplydLayout;
  const esc = window.security.escapeHtml;
  const $ = (id) => document.getElementById(id);
  let rows = [];
  let selected = null;
  let reasons = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const machines = await store.getMachines();
    const shifts = await store.getShifts();
    reasons = await store.getReasons();
    $('filterMachineSelect').innerHTML = '<option value="">All looms</option>' + machines.map(m => `<option value="${esc(m.id)}">${esc(m.machine_code)}</option>`).join('');
    $('filterShiftSelect').innerHTML = '<option value="">All shifts</option>' + shifts.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    ['searchRecords', 'filterMachineSelect', 'filterShiftSelect', 'filterDate'].forEach(id => $(id).addEventListener(id === 'searchRecords' ? 'input' : 'change', render));
    $('filtersToggle').addEventListener('click', () => {
      const open = $('registerFilters').classList.toggle('open');
      $('filtersToggle').setAttribute('aria-expanded', String(open));
    });
    $('clearDateBtn').addEventListener('click', () => { $('filterDate').value = ''; render(); });
    document.querySelectorAll('.tab-button').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach(b => { b.classList.remove('tab-button-active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('tab-button-active');
      btn.setAttribute('aria-selected', 'true');
      render();
    }));
    $('exportCsvBtn').addEventListener('click', exportCsv);
    $('exportJsonBtn').addEventListener('click', exportJson);
    $('registerTableBody').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) openModal(tr.dataset.id);
    });
    $('registerTableBody').addEventListener('keydown', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openModal(tr.dataset.id); }
    });
    $('recordModal').addEventListener('click', (e) => { if (e.target.id === 'recordModal' || e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    await render();
    const hl = new URLSearchParams(location.search).get('highlight');
    if (hl) openModal(hl);
  });

  async function render() {
    const tab = document.querySelector('.tab-button.tab-button-active');
    const filters = {
      search: $('searchRecords').value,
      machine_id: $('filterMachineSelect').value,
      shift_id: $('filterShiftSelect').value,
      date: $('filterDate').value,
      status: tab ? tab.dataset.status : 'all'
    };
    rows = await store.getRecords(filters);
    const active = ['search', 'machine_id', 'shift_id', 'date'].filter(k => filters[k]).length;
    $('filtersToggle').textContent = active ? `Filters & export (${active} active)` : 'Filters & export';
    $('registerCount').textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    const tbody = $('registerTableBody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No records match these filters.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr data-id="${esc(r.id)}" tabindex="0" class="clickable">
        <td class="mono strong">${esc(r.record_number)}</td>
        <td>${esc(r.production_date || '—')}</td>
        <td class="strong">${esc((r.machine && r.machine.machine_code) || r.machine_raw || '—')}</td>
        <td>${esc((r.shift && r.shift.shift_code) || r.shift_raw || '—')}</td>
        <td class="num strong">${esc(L.fmtNum(r.production_quantity, r.production_unit))}</td>
        <td>${esc(r.material_reference || '—')}</td>
        <td class="num">${esc(L.fmtNum(r.downtime_minutes, 'min'))}</td>
        <td><span class="${L.statusClass(r.status)}">${esc(L.statusLabel(r.status))}</span></td>
        <td>${erpCell(r)}</td>
      </tr>`).join('');
  }

  function erpCell(r) {
    if (r.status !== 'approved') return '<span class="muted small">—</span>';
    if (r.erp_status === 'submitted') return `<span class="badge-read mono">${esc(r.erp_reference)}</span>`;
    if (r.erp_status === 'failed') return '<span class="badge-invalid">Failed · retry</span>';
    return '<span class="badge-uncertain">Not sent</span>';
  }

  async function openModal(id) {
    selected = await store.getRecordById(id);
    if (!selected) return;
    const r = selected;
    $('modalRecordTitle').textContent = r.record_number;
    const badge = $('modalStatusBadge');
    badge.className = L.statusClass(r.status);
    badge.textContent = L.statusLabel(r.status);
    const kv = [
      ['Loom', (r.machine && `${r.machine.machine_code} · ${r.machine.name}`) || r.machine_raw],
      ['Shift', (r.shift && r.shift.name) || r.shift_raw],
      ['Date', r.production_date],
      ['Output', L.fmtNum(r.production_quantity, r.production_unit)],
      ['Material', r.material_reference],
      ['Batch / lot', r.batch_reference],
      ['Defects', r.defects_count === null || r.defects_count === undefined ? null : `${r.defects_count}${r.defect_details ? ` · ${r.defect_details}` : ''}`],
      ['Downtime', r.downtime_minutes === null || r.downtime_minutes === undefined ? null : `${r.downtime_minutes} min${r.downtime_reason ? ` · ${r.downtime_reason}` : ''}`],
      ['Remarks', r.remarks],
      ['Submitted by', r.submitted_by_name],
      ['Reviewed by', r.reviewed_by_name ? `${r.reviewed_by_name}${r.reviewed_at ? ` · ${new Date(r.reviewed_at).toLocaleString()}` : ''}` : null],
      ['Source', r.form_number ? `${r.form_number}${r.sheet_rows > 1 ? ` (row ${r.sheet_row} of ${r.sheet_rows})` : ''} · read by ${r.extraction_model || 'AI'}` : null]
    ];
    $('modalFields').innerHTML = kv.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v === null || v === undefined || v === '' ? '—' : v)}</dd></div>`).join('');

    const corr = r.corrections || [];
    $('modalAudit').innerHTML = corr.length
      ? corr.map(c => `<li><strong>${esc(c.field_key)}</strong> ${c.kind === 'confirmation' ? 'confirmed' : `${esc(String(c.original_value ?? '—'))} → ${esc(String(c.corrected_value ?? '—'))}`} · ${esc(c.changed_by_name || '')}${c.reason ? ` · “${esc(c.reason)}”` : ''}</li>`).join('')
      : '<li class="muted">No human changes: the record matches the AI reading.</li>';

    await renderErpBox();
    $('modalReviewLink').href = `review.html?id=${encodeURIComponent(r.id)}`;
    $('recordModal').classList.remove('hidden');
    $('recordModal').querySelector('[data-close]').focus();
  }

  function closeModal() {
    $('recordModal').classList.add('hidden');
    selected = null;
  }

  async function renderErpBox() {
    const r = selected;
    const box = $('modalErpBox');
    if (r.status !== 'approved') {
      box.innerHTML = '<div class="inline-alert">Only approved records are sent to the ERP.</div>';
      return;
    }
    const payload = r.erp_payload || await store.buildErpPayload(r.id);
    const status = r.erp_status === 'submitted'
      ? `<div class="inline-alert inline-alert-ok">ERP acknowledged · <span class="mono">${esc(r.erp_reference)}</span> · ${esc(r.erp_attempts || 1)} attempt(s)</div>`
      : `<div class="inline-alert inline-alert-warn">${r.erp_status === 'failed' ? `Last attempt failed: ${esc(r.erp_last_error || '')}` : 'Not yet sent.'}</div>`;
    const canSend = store.can('dispatch_erp', r);
    box.innerHTML = `
      ${status}
      ${canSend ? `<div class="erp-actions">
        <label class="small"><input type="checkbox" id="simulateFailureToggle"> Simulate ERP timeout</label>
        <button type="button" class="btn btn-primary btn-small" id="dispatchErpBtn">${r.erp_status === 'submitted' ? 'Re-send (idempotent)' : 'Send to ERP'}</button>
      </div>` : ''}
      <details class="payload-details">
        <summary>ERP payload (${esc(payload.schema)})</summary>
        <pre class="code-block">${esc(JSON.stringify(payload, null, 2))}</pre>
      </details>`;
    const btn = $('dispatchErpBtn');
    if (btn) btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await store.submitToErp(r.id, { simulateFailure: $('simulateFailureToggle').checked });
        window.toast.show(`ERP acknowledged: ${res.erp_reference}`, 'success');
      } catch (err) {
        window.toast.show(err.message, 'error');
      }
      selected = await store.getRecordById(r.id);
      await renderErpBox();
      await render();
    });
  }

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportCsv() {
    if (!rows.length) return window.toast.show('No records to export.', 'warning');
    const header = ['record_number', 'production_date', 'machine_code', 'shift_code', 'production_quantity', 'production_unit', 'material_reference', 'batch_reference', 'defects_count', 'defect_details', 'downtime_minutes', 'downtime_reason', 'downtime_reason_code', 'remarks', 'status', 'erp_reference', 'reviewed_by', 'reviewed_at'];
    const lines = rows.map(r => [
      r.record_number, r.production_date, r.machine && r.machine.machine_code, r.shift && r.shift.shift_code,
      r.production_quantity, r.production_unit, r.material_reference, r.batch_reference, r.defects_count, r.defect_details,
      r.downtime_minutes, r.downtime_reason, r.downtime_reason ? (window.AplydRules.matchReason(r.downtime_reason, reasons) || window.AplydRules.OTHER_REASON).code : null, r.remarks, r.status, r.erp_reference, r.reviewed_by_name, r.reviewed_at
    ].map(csvCell).join(','));
    download(`aplyd-register-${window.AplydRules.todayIso()}.csv`, '﻿' + [header.join(','), ...lines].join('\r\n'), 'text/csv;charset=utf-8');
    window.toast.show(`Exported ${rows.length} records to CSV.`, 'success');
  }

  async function exportJson() {
    const approved = rows.filter(r => r.status === 'approved');
    if (!approved.length) return window.toast.show('No approved records in this view to export.', 'warning');
    const payloads = [];
    for (const r of approved) payloads.push(r.erp_payload || await store.buildErpPayload(r.id));
    download(`aplyd-erp-export-${window.AplydRules.todayIso()}.json`, JSON.stringify({ generated_at: new Date().toISOString(), schema: window.AplydRules.ERP_SCHEMA, records: payloads }, null, 2), 'application/json');
    window.toast.show(`Exported ${payloads.length} approved records in ERP format.`, 'success');
  }
})();
