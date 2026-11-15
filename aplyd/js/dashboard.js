/**
 * APLYD - Operations Dashboard Controller
 */

let miniLoomChartInstance = null;

document.addEventListener("DOMContentLoaded", async () => {
  await renderDashboard();

  window.addEventListener("themeChanged", () => {
    renderMiniLoomChart();
  });
});

async function renderDashboard() {
  const metrics = await window.aplydStore.getDashboardMetrics();

  // Populate Stat Cards
  const kpiMetersEl = document.getElementById("kpiMetersToday");
  const kpiFormsEl = document.getElementById("kpiFormsToday");
  const kpiPendingEl = document.getElementById("kpiPendingReview");
  const kpiAlertsEl = document.getElementById("kpiActiveAlerts");

  if (kpiMetersEl) kpiMetersEl.textContent = metrics.totalMetersToday.toLocaleString() + " m";
  if (kpiFormsEl) kpiFormsEl.textContent = metrics.formsToday;
  if (kpiPendingEl) kpiPendingEl.textContent = metrics.pendingReviews;
  if (kpiAlertsEl) kpiAlertsEl.textContent = metrics.activeExceptions;

  // Render Recent Activity Feed
  const recentTbody = document.getElementById("recentSubmissionsBody");
  if (recentTbody) {
    if (metrics.recentRecords.length === 0) {
      recentTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--muted);">No submissions logged today.</td></tr>`;
    } else {
      recentTbody.innerHTML = metrics.recentRecords.map(r => {
        const statusPillClass = 
          r.status === 'approved' ? 'badge-read' :
          r.status === 'pending_review' ? 'badge-uncertain' :
          r.status === 'returned_for_correction' ? 'badge-corrected' : 'badge-illegible';

        return `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding:10px 8px; font-weight:700; font-family:monospace;">${window.security.escapeHtml(r.record_number)}</td>
            <td style="padding:10px 8px; font-weight:600;">${window.security.escapeHtml(r.machine?.machine_code || r.machine_id_raw || 'Unknown')}</td>
            <td style="padding:10px 8px;">${window.security.escapeHtml(r.shift?.name || r.shift_raw || 'N/A')}</td>
            <td style="padding:10px 8px; font-weight:700;">${r.production_quantity !== null ? Number(r.production_quantity).toLocaleString() + ' ' + (r.production_unit || 'm') : '-'}</td>
            <td style="padding:10px 8px;"><span class="${statusPillClass}">${r.status.replace('_', ' ').toUpperCase()}</span></td>
            <td style="padding:10px 8px; text-align:right;">
              <a href="review.html?id=${r.id}" class="btn btn-outline" style="padding:4px 10px; font-size:11px; font-weight:600;">
                Verify →
              </a>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // Render Mini Loom Production Chart
  await renderMiniLoomChart();
}

async function renderMiniLoomChart() {
  const canvas = document.getElementById("miniLoomChart");
  if (!canvas || !window.Chart) return;

  if (miniLoomChartInstance) {
    miniLoomChartInstance.destroy();
    miniLoomChartInstance = null;
  }

  const records = await window.aplydStore.getRecords();
  const approved = records.filter(r => r.status === 'approved');

  const loomTotals = {};
  approved.forEach(r => {
    const code = r.machine?.machine_code || r.machine_id_raw || 'Other';
    loomTotals[code] = (loomTotals[code] || 0) + (Number(r.production_quantity) || 0);
  });

  const labels = Object.keys(loomTotals);
  const data = Object.values(loomTotals);

  const isDark = document.body.classList.contains("dark-theme") || document.documentElement.classList.contains("dark-theme");
  const barColor = isDark ? '#3b82f6' : '#18181b';
  const textColor = isDark ? '#a1a1aa' : '#71717a';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';

  miniLoomChartInstance = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['L-01', 'L-03', 'L-12'],
      datasets: [{
        label: 'Approved Metres Produced',
        data: data.length > 0 ? data : [380, 310, 420],
        backgroundColor: barColor,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { 
          beginAtZero: true, 
          grid: { color: gridColor },
          ticks: { color: textColor }
        },
        x: { 
          grid: { display: false },
          ticks: { color: textColor }
        }
      }
    }
  });
}
