/**
 * APLYD - Production Register & Downstream ERP Handoff Controller
 */

let allRecords = [];
let selectedRecord = null;

document.addEventListener("DOMContentLoaded", async () => {
  setupRegisterFilters();
  setupExportButtons();
  await loadAndRenderRegister();

  // If URL has ?highlight=RECORD_ID, open detail modal immediately
  const urlParams = new URLSearchParams(window.location.search);
  const highlightId = urlParams.get("highlight");
  if (highlightId) {
    openDetailModal(highlightId);
  }
});

async function setupRegisterFilters() {
  const searchInput = document.getElementById("searchRecords");
  const filterMachine = document.getElementById("filterMachineSelect");
  const filterShift = document.getElementById("filterShiftSelect");
  const filterDate = document.getElementById("filterDate");
  const clearDateBtn = document.getElementById("clearDateBtn");
  const tabButtons = document.querySelectorAll(".tab-button");

  // Populate machine filter dropdown
  const machines = await window.aplydStore.getMachines();
  if (filterMachine) {
    filterMachine.innerHTML = '<option value="">All Looms</option>' + 
      machines.map(m => `<option value="${m.id}">${m.machine_code} - ${m.name}</option>`).join('');
    filterMachine.addEventListener("change", () => loadAndRenderRegister());
  }

  // Populate shift filter dropdown
  const shifts = await window.aplydStore.getShifts();
  if (filterShift) {
    filterShift.innerHTML = '<option value="">All Shifts</option>' + 
      shifts.map(s => `<option value="${s.id}">${s.name} (${s.shift_code})</option>`).join('');
    filterShift.addEventListener("change", () => loadAndRenderRegister());
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => loadAndRenderRegister());
  }

  if (filterDate) {
    filterDate.addEventListener("change", () => loadAndRenderRegister());
  }

  if (clearDateBtn) {
    clearDateBtn.addEventListener("click", () => {
      if (filterDate) filterDate.value = "";
      loadAndRenderRegister();
    });
  }

  tabButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      tabButtons.forEach(b => b.classList.remove("tab-button-active"));
      e.currentTarget.classList.add("tab-button-active");
      loadAndRenderRegister();
    });
  });
}

async function loadAndRenderRegister() {
  const tbody = document.getElementById("registerTableBody");
  if (!tbody) return;

  const search = document.getElementById("searchRecords")?.value || "";
  const machine_id = document.getElementById("filterMachineSelect")?.value || "";
  const shift_id = document.getElementById("filterShiftSelect")?.value || "";
  const date = document.getElementById("filterDate")?.value || "";
  const activeTab = document.querySelector(".tab-button.tab-button-active")?.getAttribute("data-status") || "all";

  const filters = { search, machine_id, shift_id, date };
  if (activeTab !== "all") {
    filters.status = activeTab;
  }

  allRecords = await window.aplydStore.getRecords(filters);

  // Update counter badges
  const totalCountEl = document.getElementById("registerCount");
  if (totalCountEl) totalCountEl.textContent = `${allRecords.length} records`;

  if (allRecords.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 40px; color: var(--muted);">
          No production records match the selected filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = allRecords.map(r => {
    const statusPillClass = 
      r.status === 'approved' ? 'badge-read' :
      r.status === 'pending_review' ? 'badge-uncertain' :
      r.status === 'returned_for_correction' ? 'badge-corrected' : 'badge-illegible';

    const erpStatusHtml = r.erp_reference 
      ? `<span class="badge-read" title="Acknowledged by Mock ERP">✓ ${window.security.escapeHtml(r.erp_reference)}</span>`
      : (r.status === 'approved' 
          ? `<span class="badge-uncertain">Pending ERP</span>` 
          : `<span class="badge-missing">Unapproved</span>`);

    return `
      <tr style="border-bottom: 1px solid var(--border); cursor: pointer;" onclick="openDetailModal('${r.id}')">
        <td style="padding: 10px 8px; font-weight: 700; font-family: monospace;">${window.security.escapeHtml(r.record_number)}</td>
        <td style="padding: 10px 8px;">${window.security.escapeHtml(r.production_date || 'N/A')}</td>
        <td style="padding: 10px 8px; font-weight: 600;">${window.security.escapeHtml(r.machine?.machine_code || r.machine_id_raw || 'Unknown')}</td>
        <td style="padding: 10px 8px;">${window.security.escapeHtml(r.shift?.name || r.shift_raw || 'N/A')}</td>
        <td style="padding: 10px 8px; font-variant-numeric: tabular-nums; font-weight: 700; color: var(--ink);">
          ${r.production_quantity !== null ? Number(r.production_quantity).toLocaleString() + ' ' + (r.production_unit || 'm') : '-'}
        </td>
        <td style="padding: 10px 8px; color: var(--ink-2);">${window.security.escapeHtml(r.material_reference || '-')}</td>
        <td style="padding: 10px 8px; font-family: monospace; font-size: 11px;">${window.security.escapeHtml(r.batch_reference || '-')}</td>
        <td style="padding: 10px 8px; font-variant-numeric: tabular-nums;">
          ${r.downtime_minutes ? `${r.downtime_minutes} min` : '0'}
        </td>
        <td style="padding: 10px 8px;">
          <span class="${statusPillClass}">${r.status.replace('_', ' ').toUpperCase()}</span>
        </td>
        <td style="padding: 10px 8px;">
          ${erpStatusHtml}
        </td>
      </tr>
    `;
  }).join("");
}

// ==============================================================================
// DEEP INSPECTION MODAL
// ==============================================================================
window.openDetailModal = async function(recordId) {
  selectedRecord = await window.aplydStore.getRecordById(recordId);
  if (!selectedRecord) return;

  const modal = document.getElementById("recordModal");
  if (!modal) return;

  document.getElementById("modalRecordTitle").textContent = `${selectedRecord.record_number} - Production Inspection`;
  document.getElementById("modalLoomCode").textContent = selectedRecord.machine?.machine_code || selectedRecord.machine_id_raw || 'Unknown';
  document.getElementById("modalShiftName").textContent = selectedRecord.shift?.name || selectedRecord.shift_raw || 'N/A';
  document.getElementById("modalProdDate").textContent = selectedRecord.production_date || 'N/A';
  document.getElementById("modalQuantity").textContent = `${selectedRecord.production_quantity || 0} ${selectedRecord.production_unit || 'metres'}`;
  document.getElementById("modalMaterial").textContent = selectedRecord.material_reference || 'N/A';
  document.getElementById("modalBatch").textContent = selectedRecord.batch_reference || 'N/A';
  document.getElementById("modalDefects").textContent = `${selectedRecord.defects_count || 0} (${selectedRecord.defect_details || 'None'})`;
  document.getElementById("modalDowntime").textContent = `${selectedRecord.downtime_minutes || 0} mins - ${selectedRecord.downtime_reason || 'None'}`;
  document.getElementById("modalRemarks").textContent = selectedRecord.remarks || 'None';

  // Modal Status & ERP section
  const modalStatusBadge = document.getElementById("modalStatusBadge");
  modalStatusBadge.textContent = selectedRecord.status.replace('_', ' ').toUpperCase();
  modalStatusBadge.className = 'role-pill ' + (
    selectedRecord.status === 'approved' ? 'badge-read' :
    selectedRecord.status === 'pending_review' ? 'badge-uncertain' :
    selectedRecord.status === 'returned_for_correction' ? 'badge-corrected' : 'badge-illegible'
  );

  // ERP Section
  renderModalErpSection();

  // Audit History Table
  const auditContainer = document.getElementById("modalAuditList");
  const corrections = selectedRecord.corrections || [];
  if (corrections.length === 0) {
    auditContainer.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--muted);">No manual corrections. Record matches initial AI extraction.</td></tr>`;
  } else {
    auditContainer.innerHTML = corrections.map(c => `
      <tr style="border-bottom: 1px solid var(--border); font-size: 11px;">
        <td style="padding:6px; font-weight:600;">${window.security.escapeHtml(c.field_key)}</td>
        <td style="padding:6px; color:var(--bad);"><del>${JSON.stringify(c.original_value)}</del></td>
        <td style="padding:6px; color:var(--ok); font-weight:700;">${JSON.stringify(c.corrected_value)}</td>
        <td style="padding:6px; color:var(--muted);">${window.security.escapeHtml(c.changed_by_name || 'Supervisor')}</td>
        <td style="padding:6px;">${window.security.escapeHtml(c.reason || 'Verified')}</td>
      </tr>
    `).join('');
  }

  // Verification button link
  const reviewLink = document.getElementById("modalReviewLink");
  if (reviewLink) {
    reviewLink.href = `review.html?id=${selectedRecord.id}`;
    reviewLink.textContent = selectedRecord.status === 'approved' ? 'View Side-by-Side Sheet' : 'Open Verification Console →';
  }

  modal.classList.remove("hidden");
};

function renderModalErpSection() {
  const erpBox = document.getElementById("modalErpBox");
  if (!erpBox) return;

  if (selectedRecord.status !== 'approved') {
    erpBox.innerHTML = `
      <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:6px; padding:12px; font-size:12px; color:var(--muted);">
        🔒 <strong>ERP Handoff Locked:</strong> Only approved records can be dispatched to downstream ERP systems.
      </div>
    `;
    return;
  }

  if (selectedRecord.erp_reference) {
    erpBox.innerHTML = `
      <div style="background:var(--ok-soft); border:1px solid rgba(21,128,61,0.25); border-radius:6px; padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:700; color:var(--ok); font-size:13px;">✓ Downstream ERP Ingestion Confirmed</span>
          <span style="font-family:monospace; font-weight:700; background:#fff; padding:2px 8px; border-radius:4px; font-size:12px; color:var(--ok);">
            ${window.security.escapeHtml(selectedRecord.erp_reference)}
          </span>
        </div>
        <p style="font-size:11px; color:var(--ink-2); margin-top:6px;">
          Telemetry ledger synchronized with manufacturing destination. Dispatched with idempotency protection.
        </p>
      </div>
    `;
  } else {
    erpBox.innerHTML = `
      <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:6px; padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:12px; font-weight:600;">Status: Record Approved (Pending ERP Dispatch)</span>
          <label style="font-size:11px; color:var(--muted); cursor:pointer;">
            <input type="checkbox" id="simulateFailureToggle"> Simulate Gateway Timeout
          </label>
        </div>
        <button type="button" class="btn btn-primary" id="dispatchErpBtn" style="padding:8px 16px; font-size:12px; font-weight:600;">
          Dispatch to Mock ERP Webhook
        </button>
      </div>
    `;

    setTimeout(() => {
      document.getElementById("dispatchErpBtn")?.addEventListener("click", async () => {
        const simulateFailure = document.getElementById("simulateFailureToggle")?.checked;
        try {
          const res = await window.aplydStore.submitToErp(selectedRecord.id, simulateFailure);
          window.toast?.show(`Dispatched to ERP! Ref: ${res.erp_reference}`, "success");
          selectedRecord = await window.aplydStore.getRecordById(selectedRecord.id);
          renderModalErpSection();
          await loadAndRenderRegister();
        } catch (err) {
          window.toast?.show(err.message, "error");
        }
      });
    }, 50);
  }
}

window.closeDetailModal = function() {
  const modal = document.getElementById("recordModal");
  if (modal) modal.classList.add("hidden");
};

// ==============================================================================
// EXPORT UTILITIES (CSV & JSON)
// ==============================================================================
function setupExportButtons() {
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const exportJsonBtn = document.getElementById("exportJsonBtn");

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", exportRegisterCsv);
  }
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", exportRegisterJson);
  }
}

function exportRegisterCsv() {
  if (allRecords.length === 0) {
    window.toast?.show("No records to export", "warning");
    return;
  }

  const headers = [
    "Record Number", "Date", "Loom Code", "Loom Name", "Shift", 
    "Quantity", "Unit", "Material", "Batch Lot", "Defects Count", 
    "Defect Details", "Downtime Minutes", "Downtime Reason", "Remarks", 
    "Verification Status", "ERP Reference", "Created At"
  ];

  const rows = allRecords.map(r => [
    `"${r.record_number}"`,
    `"${r.production_date || ''}"`,
    `"${r.machine?.machine_code || r.machine_id_raw || ''}"`,
    `"${r.machine?.name || ''}"`,
    `"${r.shift?.name || r.shift_raw || ''}"`,
    r.production_quantity !== null ? r.production_quantity : "",
    `"${r.production_unit || 'metres'}"`,
    `"${r.material_reference || ''}"`,
    `"${r.batch_reference || ''}"`,
    r.defects_count !== null ? r.defects_count : "",
    `"${r.defect_details || ''}"`,
    r.downtime_minutes !== null ? r.downtime_minutes : "",
    `"${r.downtime_reason || ''}"`,
    `"${r.remarks || ''}"`,
    `"${r.status}"`,
    `"${r.erp_reference || ''}"`,
    `"${r.created_at || ''}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `APLYD_Production_Register_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.toast?.show("Exported Production Register to CSV", "success");
}

function exportRegisterJson() {
  if (allRecords.length === 0) {
    window.toast?.show("No records to export", "warning");
    return;
  }

  const exportPayload = {
    export_metadata: {
      generated_at: new Date().toISOString(),
      record_count: allRecords.length,
      generator: "APLYD Textile Shop-Floor Suite"
    },
    records: allRecords
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
  const link = document.createElement("a");
  link.setAttribute("href", dataStr);
  link.setAttribute("download", `APLYD_Production_Register_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.toast?.show("Exported Production Register to JSON", "success");
}
