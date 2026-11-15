/**
 * APLYD - Master Data Management Controller (Looms & Shifts)
 */

document.addEventListener("DOMContentLoaded", async () => {
  if (document.getElementById("machinesTableBody")) {
    await renderMachines();
    setupMachineModal();
  }
  if (document.getElementById("shiftsTableBody")) {
    await renderShifts();
    setupShiftModal();
  }
});

// ==============================================================================
// 1. MACHINES (LOOMS) MANAGEMENT
// ==============================================================================
async function renderMachines() {
  const tbody = document.getElementById("machinesTableBody");
  if (!tbody) return;

  const machines = await window.aplydStore.getMachines();

  tbody.innerHTML = machines.map(m => `
    <tr style="border-bottom: 1px solid var(--border);">
      <td style="padding: 12px 8px; font-weight: 700; font-family: monospace;">${window.security.escapeHtml(m.machine_code)}</td>
      <td style="padding: 12px 8px; font-weight: 600;">${window.security.escapeHtml(m.name)}</td>
      <td style="padding: 12px 8px;">${window.security.escapeHtml(m.machine_type || 'Air-Jet')}</td>
      <td style="padding: 12px 8px;">${window.security.escapeHtml(m.default_unit || 'metres')}</td>
      <td style="padding: 12px 8px; font-variant-numeric: tabular-nums;">${m.min_expected_quantity} - ${m.max_expected_quantity} m</td>
      <td style="padding: 12px 8px; color: var(--muted);">${window.security.escapeHtml(m.notes || '-')}</td>
      <td style="padding: 12px 8px;">
        <span class="${m.is_active ? 'badge-read' : 'badge-illegible'}">
          ${m.is_active ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </td>
      <td style="padding: 12px 8px; text-align: right;">
        <button type="button" class="btn btn-outline edit-machine-btn" data-id="${m.id}" style="padding: 4px 8px; font-size: 11px;">
          Edit
        </button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll(".edit-machine-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const mach = (await window.aplydStore.getMachines()).find(m => m.id === id);
      if (mach) openMachineModal(mach);
    });
  });
}

function setupMachineModal() {
  const openBtn = document.getElementById("openMachineModalBtn");
  const modal = document.getElementById("machineModal");
  const saveBtn = document.getElementById("saveMachineBtn");
  const closeBtn = document.getElementById("closeMachineModalBtn");

  if (openBtn) {
    openBtn.addEventListener("click", () => openMachineModal());
  }
  if (closeBtn) {
    closeBtn.addEventListener("click", () => modal?.classList.add("hidden"));
  }
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const id = document.getElementById("machineId")?.value;
      const code = document.getElementById("machineCode")?.value.trim();
      const name = document.getElementById("machineName")?.value.trim();
      const type = document.getElementById("machineType")?.value;
      const minQ = Number(document.getElementById("machineMinQty")?.value) || 50;
      const maxQ = Number(document.getElementById("machineMaxQty")?.value) || 800;
      const notes = document.getElementById("machineNotes")?.value.trim();
      const isActive = document.getElementById("machineIsActive")?.checked;

      if (!code || !name) {
        window.toast?.show("Please enter Machine Code and Name", "error");
        return;
      }

      await window.aplydStore.saveMachine({
        id: id || null,
        machine_code: code,
        name: name,
        machine_type: type,
        default_unit: 'metres',
        min_expected_quantity: minQ,
        max_expected_quantity: maxQ,
        notes: notes,
        is_active: isActive !== undefined ? isActive : true
      });

      window.toast?.show(`Loom ${code} saved successfully`, "success");
      modal?.classList.add("hidden");
      await renderMachines();
    });
  }
}

function openMachineModal(mach = null) {
  const modal = document.getElementById("machineModal");
  if (!modal) return;

  document.getElementById("machineModalTitle").textContent = mach ? `Edit Loom: ${mach.machine_code}` : "Add New Loom Station";
  document.getElementById("machineId").value = mach ? mach.id : "";
  document.getElementById("machineCode").value = mach ? mach.machine_code : "";
  document.getElementById("machineName").value = mach ? mach.name : "";
  document.getElementById("machineType").value = mach ? (mach.machine_type || "Air-Jet") : "Air-Jet";
  document.getElementById("machineMinQty").value = mach ? mach.min_expected_quantity : "100";
  document.getElementById("machineMaxQty").value = mach ? mach.max_expected_quantity : "750";
  document.getElementById("machineNotes").value = mach ? (mach.notes || "") : "";
  document.getElementById("machineIsActive").checked = mach ? mach.is_active : true;

  modal.classList.remove("hidden");
}

// ==============================================================================
// 2. SHIFTS MANAGEMENT
// ==============================================================================
async function renderShifts() {
  const tbody = document.getElementById("shiftsTableBody");
  if (!tbody) return;

  const shifts = await window.aplydStore.getShifts();

  tbody.innerHTML = shifts.map(s => `
    <tr style="border-bottom: 1px solid var(--border);">
      <td style="padding: 12px 8px; font-weight: 700; font-family: monospace;">${window.security.escapeHtml(s.shift_code)}</td>
      <td style="padding: 12px 8px; font-weight: 600;">${window.security.escapeHtml(s.name)}</td>
      <td style="padding: 12px 8px;">${s.start_time} - ${s.end_time}</td>
      <td style="padding: 12px 8px; font-variant-numeric: tabular-nums;">${s.duration_minutes} mins (8 hrs)</td>
      <td style="padding: 12px 8px;">
        <span class="${s.is_active ? 'badge-read' : 'badge-illegible'}">
          ${s.is_active ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </td>
      <td style="padding: 12px 8px; text-align: right;">
        <button type="button" class="btn btn-outline edit-shift-btn" data-id="${s.id}" style="padding: 4px 8px; font-size: 11px;">
          Edit
        </button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll(".edit-shift-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const sh = (await window.aplydStore.getShifts()).find(s => s.id === id);
      if (sh) openShiftModal(sh);
    });
  });
}

function setupShiftModal() {
  const openBtn = document.getElementById("openShiftModalBtn");
  const modal = document.getElementById("shiftModal");
  const saveBtn = document.getElementById("saveShiftBtn");
  const closeBtn = document.getElementById("closeShiftModalBtn");

  if (openBtn) openBtn.addEventListener("click", () => openShiftModal());
  if (closeBtn) closeBtn.addEventListener("click", () => modal?.classList.add("hidden"));

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const id = document.getElementById("shiftId")?.value;
      const code = document.getElementById("shiftCode")?.value.trim();
      const name = document.getElementById("shiftName")?.value.trim();
      const start = document.getElementById("shiftStart")?.value;
      const end = document.getElementById("shiftEnd")?.value;

      if (!code || !name) {
        window.toast?.show("Please enter Shift Code and Name", "error");
        return;
      }

      await window.aplydStore.saveShift({
        id: id || null,
        shift_code: code,
        name: name,
        start_time: start,
        end_time: end,
        duration_minutes: 480,
        is_active: true
      });

      window.toast?.show(`Shift ${name} saved`, "success");
      modal?.classList.add("hidden");
      await renderShifts();
    });
  }
}

function openShiftModal(sh = null) {
  const modal = document.getElementById("shiftModal");
  if (!modal) return;

  document.getElementById("shiftModalTitle").textContent = sh ? `Edit Shift: ${sh.name}` : "Add Shift Schedule";
  document.getElementById("shiftId").value = sh ? sh.id : "";
  document.getElementById("shiftCode").value = sh ? sh.shift_code : "";
  document.getElementById("shiftName").value = sh ? sh.name : "";
  document.getElementById("shiftStart").value = sh ? sh.start_time : "06:00";
  document.getElementById("shiftEnd").value = sh ? sh.end_time : "14:00";

  modal.classList.remove("hidden");
}
