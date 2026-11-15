/**
 * APLYD - Hero Review & Correction Console Controller
 * Implements the Split-Screen Document Inspector, 5-State Verification Badges,
 * Append-Only Human Correction Audit Trail, and Atomic Approval Gate.
 */

let activeRecord = null;
let zoomScale = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const recordId = urlParams.get("id");

  if (recordId) {
    await initVerificationView(recordId);
  } else {
    await initQueueView();
  }
});

// ==============================================================================
// 1. QUEUE VIEW (Supervisor Inbox)
// ==============================================================================
async function initQueueView() {
  const queueSection = document.getElementById("queueSection");
  const detailSection = document.getElementById("detailSection");
  if (!queueSection) return;

  queueSection.classList.remove("hidden");
  if (detailSection) detailSection.classList.add("hidden");

  setupQueueFilters();
  await renderQueueTable();
}

function setupQueueFilters() {
  const statusFilter = document.getElementById("queueStatusFilter");
  const searchInput = document.getElementById("queueSearchInput");

  if (statusFilter) {
    statusFilter.addEventListener("change", () => renderQueueTable());
  }
  if (searchInput) {
    searchInput.addEventListener("input", () => renderQueueTable());
  }
}

async function renderQueueTable() {
  const tbody = document.getElementById("queueTableBody");
  if (!tbody) return;

  const status = document.getElementById("queueStatusFilter")?.value || "pending_review";
  const search = document.getElementById("queueSearchInput")?.value || "";

  const records = await window.aplydStore.getRecords({ status, search });

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--muted);">
          No production records currently in '${status.replace('_', ' ')}' queue.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(r => {
    const rawPayload = r.final_payload?.fields || {};
    let uncertainCount = 0;
    let missingCount = 0;

    Object.values(rawPayload).forEach(f => {
      if (f.status === 'uncertain') uncertainCount++;
      if (f.status === 'missing') missingCount++;
    });

    const statusPillClass = 
      r.status === 'approved' ? 'badge-read' :
      r.status === 'pending_review' ? 'badge-uncertain' :
      r.status === 'returned_for_correction' ? 'badge-corrected' : 'badge-illegible';

    return `
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 12px 8px; font-weight: 700; font-family: monospace;">${window.security.escapeHtml(r.record_number)}</td>
        <td style="padding: 12px 8px;">${window.security.escapeHtml(r.production_date || 'N/A')}</td>
        <td style="padding: 12px 8px; font-weight: 600;">${window.security.escapeHtml(r.machine?.machine_code || r.machine_id_raw || 'Unknown')}</td>
        <td style="padding: 12px 8px;">${window.security.escapeHtml(r.shift?.name || r.shift_raw || 'N/A')}</td>
        <td style="padding: 12px 8px; font-variant-numeric: tabular-nums; font-weight: 600;">
          ${r.production_quantity !== null ? Number(r.production_quantity).toLocaleString() + ' ' + (r.production_unit || 'm') : 'Missing'}
        </td>
        <td style="padding: 12px 8px;">
          ${uncertainCount > 0 ? `<span class="badge-uncertain" style="margin-right: 4px;">${uncertainCount} Uncertain</span>` : ''}
          ${missingCount > 0 ? `<span class="badge-missing">${missingCount} Blank</span>` : ''}
          ${uncertainCount === 0 && missingCount === 0 ? `<span class="badge-read">Clean</span>` : ''}
        </td>
        <td style="padding: 12px 8px;">
          <span class="${statusPillClass}">${r.status.replace('_', ' ').toUpperCase()}</span>
        </td>
        <td style="padding: 12px 8px; text-align: right;">
          <a href="review.html?id=${r.id}" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px; font-weight: 600;">
            Verify Record →
          </a>
        </td>
      </tr>
    `;
  }).join("");
}

// ==============================================================================
// 2. DETAIL VERIFICATION VIEW (Split-Screen Hero)
// ==============================================================================
async function initVerificationView(recordId) {
  const queueSection = document.getElementById("queueSection");
  const detailSection = document.getElementById("detailSection");

  if (queueSection) queueSection.classList.add("hidden");
  if (detailSection) detailSection.classList.remove("hidden");

  activeRecord = await window.aplydStore.getRecordById(recordId);
  if (!activeRecord) {
    window.toast?.show("Record not found", "error");
    setTimeout(() => { window.location.href = "review.html"; }, 1500);
    return;
  }

  renderRecordHeader();
  renderDocumentViewer();
  await renderVerificationFields();
  renderAuditTrail();
  setupPanZoomViewer();
  setupActionButtons();
}

function renderRecordHeader() {
  const titleEl = document.getElementById("detailRecordNumber");
  const metaEl = document.getElementById("detailRecordMeta");
  const statusBadge = document.getElementById("detailStatusBadge");

  if (titleEl) titleEl.textContent = activeRecord.record_number;
  if (metaEl) {
    metaEl.textContent = `Loom: ${activeRecord.machine?.machine_code || activeRecord.machine_id_raw || 'Unknown'} | Shift: ${activeRecord.shift?.name || activeRecord.shift_raw || 'N/A'} | Date: ${activeRecord.production_date || 'N/A'}`;
  }
  if (statusBadge) {
    statusBadge.textContent = activeRecord.status.replace('_', ' ').toUpperCase();
    statusBadge.className = 'role-pill ' + (
      activeRecord.status === 'approved' ? 'badge-read' :
      activeRecord.status === 'pending_review' ? 'badge-uncertain' :
      activeRecord.status === 'returned_for_correction' ? 'badge-corrected' : 'badge-illegible'
    );
  }
}

function renderDocumentViewer() {
  const imgEl = document.getElementById("canvasImg");
  if (!imgEl) return;

  // Use stored data URL or fallback sample
  const form = activeRecord.form;
  if (form && form.storage_data_url) {
    imgEl.src = form.storage_data_url;
  } else {
    // Elegant SVG fallback shop-floor form if no local file was uploaded
    imgEl.src = generateSvgSampleForm(activeRecord);
  }
}

function generateSvgSampleForm(record) {
  const loom = record.machine?.machine_code || record.machine_id_raw || "L-12";
  const date = record.production_date || "2026-11-15";
  const shift = record.shift?.name || record.shift_raw || "Morning";
  const qty = record.production_quantity !== null ? record.production_quantity : "350";
  const batch = record.batch_reference || "LOT-B-204";
  const defects = record.defects_count !== null ? record.defects_count : "2";
  const downtime = record.downtime_minutes !== null ? record.downtime_minutes : "25";

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="700" height="900" viewBox="0 0 700 900" style="background:#fffcf2; font-family:Courier New, monospace;">
    <rect width="700" height="900" fill="#fffcf5" stroke="#d5cbb2" stroke-width="4"/>
    <text x="50" y="55" font-size="20" font-weight="bold" fill="#2d2d2d">TEXTILE MANUFACTURING - SHIFT PRODUCTION LOG</text>
    <line x1="50" y1="75" x2="650" y2="75" stroke="#2d2d2d" stroke-width="2"/>
    
    <text x="50" y="115" font-size="14" fill="#555">FACILITY: SHED A (WEAVING)</text>
    <text x="400" y="115" font-size="14" fill="#555">CLIPBOARD REF: ${record.record_number}</text>
    
    <rect x="50" y="140" width="600" height="120" fill="none" stroke="#2d2d2d" stroke-width="1.5"/>
    <text x="65" y="170" font-size="13" font-weight="bold">MACHINE / LOOM NO:</text>
    <text x="230" y="170" font-size="16" font-weight="bold" fill="#003366">${loom}</text>
    
    <text x="65" y="205" font-size="13" font-weight="bold">DATE (DD/MM/YYYY):</text>
    <text x="230" y="205" font-size="16" font-weight="bold" fill="#003366">${date}</text>
    
    <text x="65" y="240" font-size="13" font-weight="bold">SHIFT (M / E / N):</text>
    <text x="230" y="240" font-size="16" font-weight="bold" fill="#003366">${shift}</text>

    <rect x="50" y="280" width="600" height="190" fill="none" stroke="#2d2d2d" stroke-width="1.5"/>
    <text x="65" y="315" font-size="13" font-weight="bold">PRODUCTION QUANTITY:</text>
    <text x="260" y="315" font-size="19" font-weight="bold" fill="#880000">${qty} metres</text>
    
    <text x="65" y="360" font-size="13" font-weight="bold">FABRIC QUALITY / SORT:</text>
    <text x="260" y="360" font-size="15" fill="#003366">${record.material_reference || 'Cotton 40s Cambric'}</text>
    
    <text x="65" y="405" font-size="13" font-weight="bold">BATCH / BEAM LOT NO:</text>
    <text x="260" y="405" font-size="15" fill="#003366">${batch}</text>
    
    <text x="65" y="445" font-size="13" font-weight="bold">PICK COUNTER READING:</text>
    <text x="260" y="445" font-size="15" fill="#003366">START: 124,500 | END: 159,500</text>

    <rect x="50" y="490" width="600" height="150" fill="none" stroke="#2d2d2d" stroke-width="1.5"/>
    <text x="65" y="525" font-size="13" font-weight="bold">DEFECT COUNTS:</text>
    <text x="230" y="525" font-size="15" fill="#003366">${defects} (Weft breakages)</text>
    
    <text x="65" y="570" font-size="13" font-weight="bold">DOWNTIME (MINUTES):</text>
    <text x="230" y="570" font-size="15" fill="#003366">${downtime} mins</text>
    
    <text x="65" y="615" font-size="13" font-weight="bold">STOPPAGE REASON:</text>
    <text x="230" y="615" font-size="14" fill="#003366">${record.downtime_reason || 'Beam change and lubrication'}</text>

    <rect x="50" y="660" width="600" height="90" fill="none" stroke="#2d2d2d" stroke-width="1.5"/>
    <text x="65" y="695" font-size="13" font-weight="bold">OPERATOR REMARKS:</text>
    <text x="65" y="725" font-size="13" fill="#003366">${record.remarks || 'Recorded on shop floor clipboard'}</text>
    
    <text x="50" y="780" font-size="12" fill="#777">OPERATOR SIGNATURE: _______________________</text>
    <text x="400" y="780" font-size="12" fill="#777">SUPERVISOR SIGN: ____________________</text>
  </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function renderVerificationFields() {
  const container = document.getElementById("verificationFieldsContainer");
  if (!container) return;

  const machines = await window.aplydStore.getMachines();
  const shifts = await window.aplydStore.getShifts();
  const rawFields = activeRecord.final_payload?.fields || {};

  const currentUser = window.aplydStore.getCurrentUser();
  const isOperator = currentUser.role === 'operator';

  // Helper to determine status badge HTML
  const getBadgeHtml = (fieldKey, rawObj, currentVal) => {
    // If the field was corrected by human, show corrected badge
    const wasCorrected = (activeRecord.corrections || []).some(c => c.field_key === fieldKey);
    if (wasCorrected) {
      return `<span class="badge-corrected" title="Manually edited by supervisor">CORRECTED</span>`;
    }

    const st = rawObj?.status || 'read';
    if (st === 'read') return `<span class="badge-read">READ</span>`;
    if (st === 'uncertain') return `<span class="badge-uncertain">UNCERTAIN</span>`;
    if (st === 'missing') return `<span class="badge-missing">BLANK / MISSING</span>`;
    if (st === 'illegible') return `<span class="badge-illegible">ILLEGIBLE</span>`;
    if (st === 'invalid') return `<span class="badge-invalid">INVALID</span>`;
    return `<span class="badge-read">READ</span>`;
  };

  container.innerHTML = `
    <!-- 1. HEADER TELEMETRY -->
    <div class="form-section-title">1. Station & Schedule Header</div>
    
    <div class="field-verify-group" data-field="machine_id">
      <div class="field-verify-header">
        <label class="field-verify-label" for="field_machine_id">Machine / Loom ID <span style="color:var(--bad);">*</span></label>
        ${getBadgeHtml('machine_id', rawFields.machine_id, activeRecord.machine_id)}
      </div>
      <select id="field_machine_id" class="select-control" style="width: 100%;" ${isOperator ? 'disabled' : ''}>
        <option value="">-- Select Active Loom --</option>
        ${machines.map(m => `
          <option value="${m.id}" ${m.id === activeRecord.machine_id ? 'selected' : ''}>
            ${m.machine_code} - ${m.name}
          </option>
        `).join('')}
      </select>
      <div class="raw-transcription-hint">Transcribed: "${window.security.escapeHtml(rawFields.machine_id?.raw_value || activeRecord.machine_id_raw || 'N/A')}"</div>
      ${rawFields.machine_id?.reason ? `<div class="field-reason-pill">${window.security.escapeHtml(rawFields.machine_id.reason)}</div>` : ''}
    </div>

    <div class="two-column-fields" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <div class="field-verify-group" data-field="production_date">
        <div class="field-verify-header">
          <label class="field-verify-label" for="field_production_date">Date <span style="color:var(--bad);">*</span></label>
          ${getBadgeHtml('production_date', rawFields.production_date, activeRecord.production_date)}
        </div>
        <input type="date" id="field_production_date" class="form-control" value="${activeRecord.production_date || ''}" ${isOperator ? 'disabled' : ''}>
        <div class="raw-transcription-hint">Transcribed: "${window.security.escapeHtml(rawFields.production_date?.raw_value || activeRecord.production_date_raw || 'N/A')}"</div>
      </div>

      <div class="field-verify-group" data-field="shift_id">
        <div class="field-verify-header">
          <label class="field-verify-label" for="field_shift_id">Shift <span style="color:var(--bad);">*</span></label>
          ${getBadgeHtml('shift_id', rawFields.shift, activeRecord.shift_id)}
        </div>
        <select id="field_shift_id" class="select-control" style="width: 100%;" ${isOperator ? 'disabled' : ''}>
          <option value="">-- Select Shift --</option>
          ${shifts.map(s => `
            <option value="${s.id}" ${s.id === activeRecord.shift_id ? 'selected' : ''}>
              ${s.name} (${s.shift_code})
            </option>
          `).join('')}
        </select>
        <div class="raw-transcription-hint">Transcribed: "${window.security.escapeHtml(rawFields.shift?.raw_value || activeRecord.shift_raw || 'N/A')}"</div>
        ${rawFields.shift?.reason ? `<div class="field-reason-pill">${window.security.escapeHtml(rawFields.shift.reason)}</div>` : ''}
      </div>
    </div>

    <!-- 2. PRODUCTION OUTPUT -->
    <div class="form-section-title" style="margin-top: 14px;">2. Production Output & Batch</div>

    <div class="field-verify-group" data-field="production_quantity">
      <div class="field-verify-header">
        <label class="field-verify-label" for="field_production_quantity">Production Quantity & Unit <span style="color:var(--bad);">*</span></label>
        ${getBadgeHtml('production_quantity', rawFields.production_quantity, activeRecord.production_quantity)}
      </div>
      <div style="display: flex; gap: 8px;">
        <input type="number" step="0.1" min="0" id="field_production_quantity" class="form-control" style="flex: 2; font-weight: 700; font-size: 15px;" value="${activeRecord.production_quantity !== null ? activeRecord.production_quantity : ''}" placeholder="0.0" ${isOperator ? 'disabled' : ''}>
        <select id="field_production_unit" class="select-control" style="flex: 1;" ${isOperator ? 'disabled' : ''}>
          <option value="metres" ${activeRecord.production_unit === 'metres' ? 'selected' : ''}>metres</option>
          <option value="picks" ${activeRecord.production_unit === 'picks' ? 'selected' : ''}>picks</option>
          <option value="yards" ${activeRecord.production_unit === 'yards' ? 'selected' : ''}>yards</option>
        </select>
      </div>
      <div class="raw-transcription-hint">Transcribed: "${window.security.escapeHtml(rawFields.production_quantity?.raw_value || 'N/A')}"</div>
      ${rawFields.production_quantity?.reason ? `<div class="field-reason-pill">${window.security.escapeHtml(rawFields.production_quantity.reason)}</div>` : ''}
    </div>

    <div class="two-column-fields" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <div class="field-verify-group" data-field="material_reference">
        <div class="field-verify-header">
          <label class="field-verify-label" for="field_material_reference">Material / Sort</label>
          ${getBadgeHtml('material_reference', rawFields.material_reference, activeRecord.material_reference)}
        </div>
        <input type="text" id="field_material_reference" class="form-control" value="${window.security.escapeHtml(activeRecord.material_reference || '')}" placeholder="e.g. Cotton 40s" ${isOperator ? 'disabled' : ''}>
        <div class="raw-transcription-hint">Transcribed: "${window.security.escapeHtml(rawFields.material_reference?.raw_value || 'N/A')}"</div>
      </div>

      <div class="field-verify-group" data-field="batch_reference">
        <div class="field-verify-header">
          <label class="field-verify-label" for="field_batch_reference">Batch / Lot Ref</label>
          ${getBadgeHtml('batch_reference', rawFields.batch_reference, activeRecord.batch_reference)}
        </div>
        <input type="text" id="field_batch_reference" class="form-control" value="${window.security.escapeHtml(activeRecord.batch_reference || '')}" placeholder="e.g. B-204" ${isOperator ? 'disabled' : ''}>
        <div class="raw-transcription-hint">Transcribed: "${window.security.escapeHtml(rawFields.batch_reference?.raw_value || 'N/A')}"</div>
        ${rawFields.batch_reference?.reason ? `<div class="field-reason-pill">${window.security.escapeHtml(rawFields.batch_reference.reason)}</div>` : ''}
      </div>
    </div>

    <!-- 3. EXCEPTIONS & DOWNTIME -->
    <div class="form-section-title" style="margin-top: 14px;">3. Quality & Stoppage Exceptions</div>

    <div class="two-column-fields" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <div class="field-verify-group" data-field="defects_count">
        <div class="field-verify-header">
          <label class="field-verify-label" for="field_defects_count">Defects Count</label>
          ${getBadgeHtml('defects_count', rawFields.defects_count, activeRecord.defects_count)}
        </div>
        <input type="number" min="0" id="field_defects_count" class="form-control" value="${activeRecord.defects_count !== null ? activeRecord.defects_count : '0'}" ${isOperator ? 'disabled' : ''}>
        <div class="raw-transcription-hint">Transcribed: "${window.security.escapeHtml(rawFields.defects_count?.raw_value || 'N/A')}"</div>
      </div>

      <div class="field-verify-group" data-field="downtime_minutes">
        <div class="field-verify-header">
          <label class="field-verify-label" for="field_downtime_minutes">Downtime (Minutes)</label>
          ${getBadgeHtml('downtime_minutes', rawFields.downtime_minutes, activeRecord.downtime_minutes)}
        </div>
        <input type="number" min="0" id="field_downtime_minutes" class="form-control" value="${activeRecord.downtime_minutes !== null ? activeRecord.downtime_minutes : '0'}" ${isOperator ? 'disabled' : ''}>
        <div class="raw-transcription-hint">Transcribed: "${window.security.escapeHtml(rawFields.downtime_minutes?.raw_value || 'N/A')}"</div>
      </div>
    </div>

    <div class="field-verify-group" data-field="downtime_reason">
      <div class="field-verify-header">
        <label class="field-verify-label" for="field_downtime_reason">Downtime / Stoppage Reason</label>
        ${getBadgeHtml('downtime_reason', rawFields.downtime_reason, activeRecord.downtime_reason)}
      </div>
      <input type="text" id="field_downtime_reason" class="form-control" value="${window.security.escapeHtml(activeRecord.downtime_reason || '')}" placeholder="Reason for stoppage" ${isOperator ? 'disabled' : ''}>
      <div class="raw-transcription-hint">Transcribed: "${window.security.escapeHtml(rawFields.downtime_reason?.raw_value || 'N/A')}"</div>
      ${rawFields.downtime_reason?.reason ? `<div class="field-reason-pill">${window.security.escapeHtml(rawFields.downtime_reason.reason)}</div>` : ''}
    </div>

    <div class="field-verify-group" data-field="remarks">
      <div class="field-verify-header">
        <label class="field-verify-label" for="field_remarks">Operator Remarks</label>
        ${getBadgeHtml('remarks', rawFields.remarks, activeRecord.remarks)}
      </div>
      <input type="text" id="field_remarks" class="form-control" value="${window.security.escapeHtml(activeRecord.remarks || '')}" placeholder="Additional observations" ${isOperator ? 'disabled' : ''}>
      <div class="raw-transcription-hint">Transcribed: "${window.security.escapeHtml(rawFields.remarks?.raw_value || 'N/A')}"</div>
    </div>
  `;

  // Attach change listeners to track human supervisor edits
  if (!isOperator) {
    container.querySelectorAll("input, select").forEach(input => {
      input.addEventListener("change", async (e) => {
        const fieldKey = e.target.id.replace("field_", "");
        let newVal = e.target.value;
        if (e.target.type === "number") {
          newVal = newVal === "" ? null : Number(newVal);
        }

        // Prompt supervisor for optional reason
        const reason = prompt(`Supervisor Edit: Enter reason for updating '${fieldKey}' (or leave blank):`, "Corrected handwriting transcription against document");
        if (reason === null) {
          // User cancelled prompt, revert field
          await renderVerificationFields();
          return;
        }
        await window.aplydStore.correctField(activeRecord.id, fieldKey, newVal, reason);

        window.toast?.show(`Updated ${fieldKey}. Audit log recorded.`, "success");
        activeRecord = await window.aplydStore.getRecordById(activeRecord.id);
        await renderVerificationFields();
        renderAuditTrail();
      });
    });
  }
}

function renderAuditTrail() {
  const container = document.getElementById("auditTrailContainer");
  const listEl = document.getElementById("auditTrailList");
  if (!container || !listEl) return;

  const corrections = activeRecord.corrections || [];
  if (corrections.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  listEl.innerHTML = corrections.map(c => `
    <tr style="border-bottom: 1px solid var(--border); font-size: 12px;">
      <td style="padding: 8px 6px; font-weight: 600;">${window.security.escapeHtml(c.field_key)}</td>
      <td style="padding: 8px 6px; color: var(--bad);"><del>${JSON.stringify(c.original_value)}</del></td>
      <td style="padding: 8px 6px; color: var(--ok); font-weight: 700;">${JSON.stringify(c.corrected_value)}</td>
      <td style="padding: 8px 6px; color: var(--muted);">${window.security.escapeHtml(c.changed_by_name || 'Supervisor')}</td>
      <td style="padding: 8px 6px; color: var(--muted);">${new Date(c.changed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
      <td style="padding: 8px 6px; font-style: italic;">${window.security.escapeHtml(c.reason || 'Manual override')}</td>
    </tr>
  `).join('');
}

function setupPanZoomViewer() {
  const viewport = document.getElementById("canvasViewport");
  const img = document.getElementById("canvasImg");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomResetBtn = document.getElementById("zoomResetBtn");

  if (!viewport || !img) return;

  const updateTransform = () => {
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
  };

  zoomInBtn?.addEventListener("click", () => {
    zoomScale = Math.min(zoomScale + 0.25, 3.5);
    updateTransform();
  });

  zoomOutBtn?.addEventListener("click", () => {
    zoomScale = Math.max(zoomScale - 0.25, 0.5);
    updateTransform();
  });

  zoomResetBtn?.addEventListener("click", () => {
    zoomScale = 1.0;
    panX = 0;
    panY = 0;
    updateTransform();
  });

  viewport.addEventListener("mousedown", (e) => {
    isPanning = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateTransform();
  });

  window.addEventListener("mouseup", () => {
    isPanning = false;
  });
}

function setupActionButtons() {
  const approveBtn = document.getElementById("approveBtn");
  const returnBtn = document.getElementById("returnBtn");
  const rejectBtn = document.getElementById("rejectBtn");

  const currentUser = window.aplydStore.getCurrentUser();
  const isOperator = currentUser.role === 'operator';

  if (approveBtn) {
    if (isOperator) {
      approveBtn.disabled = true;
      approveBtn.title = "Permission Denied: Operators cannot approve production records.";
    } else {
      approveBtn.addEventListener("click", handleApprove);
    }
  }

  if (returnBtn) {
    if (isOperator) returnBtn.disabled = true;
    else returnBtn.addEventListener("click", handleReturn);
  }

  if (rejectBtn) {
    if (isOperator) rejectBtn.disabled = true;
    else rejectBtn.addEventListener("click", handleReject);
  }
}

async function handleApprove() {
  try {
    const note = prompt("Supervisor Approval: Enter optional sign-off note:", "Verified physical form handwriting and counter consistency");
    if (note === null) return; // User cancelled prompt
    const updated = await window.aplydStore.approveRecord(activeRecord.id, note);

    window.toast?.show(`Record ${updated.record_number} Approved! Dispatched to Mock ERP.`, "success");

    // Show modal or route to register
    setTimeout(() => {
      window.location.href = `production-register.html?highlight=${activeRecord.id}`;
    }, 1000);
  } catch (err) {
    alert(err.message);
  }
}

async function handleReturn() {
  const reason = prompt("Enter reason for returning record to operator for clarification:", "Please retake image with better lighting; quantity digit is obscured");
  if (!reason) return;
  await window.aplydStore.returnForCorrection(activeRecord.id, reason);
  window.toast?.show("Record returned for correction", "warning");
  setTimeout(() => { window.location.href = "review.html"; }, 800);
}

async function handleReject() {
  const reason = prompt("Enter reason for rejecting this record:", "Document appears to be from a non-company facility");
  if (!reason) return;
  await window.aplydStore.rejectRecord(activeRecord.id, reason);
  window.toast?.show("Record rejected", "error");
  setTimeout(() => { window.location.href = "review.html"; }, 800);
}
