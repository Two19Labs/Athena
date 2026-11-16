/** Shared Chart.js helpers: theme-aware colours and a tracked instance registry. */
(function () {
  const instances = {};

  function palette() {
    const dark = document.documentElement.classList.contains('dark-theme');
    return {
      dark,
      primary: dark ? '#60a5fa' : '#1f2937',
      secondary: dark ? '#a78bfa' : '#6b7280',
      warn: dark ? '#fbbf24' : '#b45309',
      bad: dark ? '#f87171' : '#b91c1c',
      text: dark ? '#a1a1aa' : '#6b7280',
      grid: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      series: dark ? ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24'] : ['#1f2937', '#6b7280', '#0f766e', '#b45309']
    };
  }

  function render(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return null;
    if (instances[id]) instances[id].destroy();
    instances[id] = new window.Chart(canvas, config);
    return instances[id];
  }

  function bar(id, labels, data, { color, label, horizontal, integer } = {}) {
    const p = palette();
    const valueTicks = { color: p.text, precision: integer ? 0 : undefined };
    return render(id, {
      type: 'bar',
      data: { labels, datasets: [{ label: label || '', data, backgroundColor: color || p.primary, borderRadius: 4, maxBarThickness: 42 }] },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: !!horizontal, color: p.grid }, ticks: horizontal ? valueTicks : { color: p.text }, beginAtZero: true },
          y: { grid: { display: !horizontal, color: p.grid }, ticks: horizontal ? { color: p.text } : valueTicks, beginAtZero: true }
        }
      }
    });
  }

  function doughnut(id, labels, data) {
    const p = palette();
    return render(id, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: p.series, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: p.text, boxWidth: 12 } } } }
    });
  }

  window.AplydCharts = { palette, bar, doughnut };
})();
