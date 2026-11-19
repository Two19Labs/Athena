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
    $('kpiMetresNote').textContent = `By approval date · ${metrics.approvedCount7d} record${metrics.approvedCount7d === 1 ? '' : 's'}`;
    $('kpiFormsToday').textContent = metrics.photosToday;
    $('kpiFormsTodayNote').textContent = metrics.photosToday
      ? `${metrics.recordsToday} record${metrics.recordsToday === 1 ? '' : 's'} read by the AI`
      : 'Read by the AI';

    // Operators hear back when a supervisor changed something they submitted.
    if (user.role === 'operator' && metrics.mineCorrected.length) {
      const n = metrics.mineCorrected.length;
      const el = $('operatorFeedback');
      el.innerHTML = `<strong>${n} of your record${n === 1 ? ' was' : 's were'} corrected by a supervisor this week.</strong> Open ${n === 1 ? 'it' : 'them'} to see what changed: ${metrics.mineCorrected.slice(0, 5).map(r => `<a href="review.html?id=${encodeURIComponent(r.id)}">${esc(r.record_number)}</a>`).join(', ')}`;
      el.classList.remove('hidden');
    }
    $('kpiPending').textContent = metrics.pendingReviews;
    $('kpiExceptions').textContent = metrics.openExceptions;
    $('kpiExceptionsNote').textContent = metrics.erpFailed ? `${metrics.erpFailed} approved record(s) not yet in ERP` : 'Blockers + warnings on pending records';

    if (user.role === 'operator') {
      $('primaryCta').textContent = '📷 Capture a form';
    }

    const rows = metrics.recentRecords;
    $('recentSubmissionsBody').innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td class="mono strong">${esc(r.record_number)}</td>
        <td class="strong">${esc((r.machine && r.machine.machine_code) || r.machine_raw || '—')}</td>
        <td>${esc((r.shift && r.shift.shift_code) || r.shift_raw || '—')}</td>
        <td class="num strong">${esc(L.fmtNum(r.production_quantity, r.production_unit))}</td>
        <td><span class="${L.statusClass(r.status)}">${esc(L.statusLabel(r.status))}</span></td>
        <td class="right"><a href="review.html?id=${encodeURIComponent(r.id)}" class="btn btn-outline btn-small">Open</a></td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty-cell">No records yet. <a href="capture.html">Capture a form</a>, or use one of the sample photos there to see the full flow.</td></tr>';

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
    document.querySelector('#loomChart').parentElement.classList.toggle('hidden', labels.length === 0);
    window.AplydCharts.bar('loomChart', labels, labels.map(l => totals[l]), { label: 'Metres' });
  }
})();
