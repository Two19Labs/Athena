/** APLYD - Looms and shifts master data (admin only). */
(function () {
  const store = window.aplydStore;
  const Rules = window.AplydRules;
  const esc = window.security.escapeHtml;
  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', async () => {
    if ($('machinesTableBody')) {
      await renderMachines();
      wireModal('machineModal', 'machineForm', saveMachine);
      $('openMachineModalBtn').addEventListener('click', () => openMachine(null));
      $('machinesTableBody').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-edit]');
        if (b) openMachine((await store.getMachines()).find(m => m.id === b.dataset.edit));
      });
    }
    if ($('shiftsTableBody')) {
      await renderShifts();
      wireModal('shiftModal', 'shiftForm', saveShift);
      $('openShiftModalBtn').addEventListener('click', () => openShift(null));
      $('shiftsTableBody').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-edit]');
        if (b) openShift((await store.getShifts()).find(s => s.id === b.dataset.edit));
      });
    }
  });

  function wireModal(modalId, formId, onSave) {
    const modal = $(modalId);
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.classList.add('hidden'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.add('hidden'); });
    $(formId).addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = modal.querySelector('.field-msg');
      errEl.classList.add('hidden');
      try {
        await onSave();
        modal.classList.add('hidden');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  }

  const statusPill = (active) => `<span class="${active !== false ? 'badge-read' : 'badge-missing'}">${active !== false ? 'Active' : 'Inactive'}</span>`;

  async function renderMachines() {
    const machines = await store.getMachines();
    $('machinesTableBody').innerHTML = machines.map(m => `
      <tr>
        <td class="mono strong">${esc(m.machine_code)}</td>
        <td>${esc(m.name)}</td>
        <td>${esc(m.machine_type || '—')}</td>
        <td class="num">${esc(m.min_expected_quantity)}–${esc(m.max_expected_quantity)} m</td>
        <td class="muted">${esc(m.notes || '—')}</td>
        <td>${statusPill(m.is_active)}</td>
        <td class="right"><button type="button" class="btn btn-outline btn-small" data-edit="${esc(m.id)}">Edit</button></td>
      </tr>`).join('');
  }

  function openMachine(m) {
    $('machineModalTitle').textContent = m ? `Edit ${m.machine_code}` : 'Add loom';
    $('machineId').value = m ? m.id : '';
    $('machineCode').value = m ? m.machine_code : '';
    $('machineName').value = m ? m.name : '';
    $('machineType').value = m ? (m.machine_type || 'Air-Jet') : 'Air-Jet';
    $('machineMinQty').value = m ? m.min_expected_quantity : 100;
    $('machineMaxQty').value = m ? m.max_expected_quantity : 750;
    $('machineNotes').value = m ? (m.notes || '') : '';
    $('machineIsActive').checked = m ? m.is_active !== false : true;
    $('machineFormError').classList.add('hidden');
    $('machineModal').classList.remove('hidden');
    $('machineCode').focus();
  }

  async function saveMachine() {
    const saved = await store.saveMachine({
      id: $('machineId').value || null,
      machine_code: $('machineCode').value,
      name: $('machineName').value,
      machine_type: $('machineType').value,
      min_expected_quantity: $('machineMinQty').value,
      max_expected_quantity: $('machineMaxQty').value,
      notes: $('machineNotes').value.trim(),
      is_active: $('machineIsActive').checked
    });
    window.toast.show(`Loom ${saved.machine_code} saved.`, 'success');
    await renderMachines();
  }

  async function renderShifts() {
    const shifts = await store.getShifts();
    $('shiftsTableBody').innerHTML = shifts.map(s => {
      const mins = Rules.minutesBetween(s.start_time, s.end_time);
      return `
      <tr>
        <td class="mono strong">${esc(s.shift_code)}</td>
        <td>${esc(s.name)}</td>
        <td>${esc(s.start_time)}–${esc(s.end_time)}</td>
        <td class="num">${mins ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : '—'}</td>
        <td>${statusPill(s.is_active)}</td>
        <td class="right"><button type="button" class="btn btn-outline btn-small" data-edit="${esc(s.id)}">Edit</button></td>
      </tr>`;
    }).join('');
  }

  function openShift(s) {
    $('shiftModalTitle').textContent = s ? `Edit ${s.name}` : 'Add shift';
    $('shiftId').value = s ? s.id : '';
    $('shiftCode').value = s ? s.shift_code : '';
    $('shiftName').value = s ? s.name : '';
    $('shiftStart').value = s ? s.start_time : '06:00';
    $('shiftEnd').value = s ? s.end_time : '14:00';
    $('shiftIsActive').checked = s ? s.is_active !== false : true;
    $('shiftFormError').classList.add('hidden');
    $('shiftModal').classList.remove('hidden');
    $('shiftCode').focus();
  }

  async function saveShift() {
    const saved = await store.saveShift({
      id: $('shiftId').value || null,
      shift_code: $('shiftCode').value,
      name: $('shiftName').value,
      start_time: $('shiftStart').value,
      end_time: $('shiftEnd').value,
      is_active: $('shiftIsActive').checked
    });
    window.toast.show(`${saved.name} saved.`, 'success');
    await renderShifts();
  }
})();
