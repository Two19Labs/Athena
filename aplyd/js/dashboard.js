/** APLYD - Dashboard: KPIs, recent activity and 7-day loom output. All numbers come from the store. */
(function () {
  const store = window.aplydStore;
  const L = window.AplydLayout;
  const esc = window.security.escapeHtml;
  const $ = (id) => document.getElementById(id);
  let metrics = null;

  document.addEventListener('DOMContentLoaded', async () => {
    metrics = await store.getDashboardMetrics();
    const user = store.getCurrentUser();

    $('kpiMetres').textContent = `${metrics.approvedMetres7d.toLocaleString()} m`;
    $('kpiFormsToday').textContent = metrics.formsToday;
    $('kpiPending').textContent = metrics.pendingReviews;
    $('kpiExceptions').textContent = metrics.openExceptions;
    $('kpiExceptionsNote').textContent = metrics.erpFailed ? `${metrics.erpFailed} approved record(s) not yet in ERP` : 'Blockers + warnings on pending records';

    if (user.role === 'operator') {
      $('primaryCta').textContent = '📷 Capture a form';
    }

    const rows = metrics.recentRecords;
    $('recentSubmissionsBody').innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td class="mono strong">${esc(r.record_number)}${r.seed ? ' <span class="tag">seed</span>' : ''}</td>
        <td class="strong">${esc((r.machine && r.machine.machine_code) || r.machine_raw || '—')}</td>
        <td>${esc((r.shift && r.shift.shift_code) || r.shift_raw || '—')}</td>
        <td class="num strong">${esc(L.fmtNum(r.production_quantity, r.production_unit))}</td>
        <td><span class="${L.statusClass(r.status)}">${esc(L.statusLabel(r.status))}</span></td>
        <td class="right"><a href="review.html?id=${encodeURIComponent(r.id)}" class="btn btn-outline btn-small">Open</a></td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty-cell">No records yet.</td></tr>';

    renderChart();
    window.addEventListener('themeChanged', renderChart);
  });

  function renderChart() {
    const totals = {};
    for (const r of metrics.approved7d) {
      if ((r.production_unit || 'metres') !== 'metres') continue;
      const code = (r.machine && r.machine.machine_code) || 'Unknown';
      totals[code] = (totals[code] || 0) + (Number(r.production_quantity) || 0);
    }
    const labels = Object.keys(totals).sort();
    $('chartEmpty').classList.toggle('hidden', labels.length > 0);
    window.AplydCharts.bar('loomChart', labels, labels.map(l => totals[l]), { label: 'Metres' });
  }
})();
