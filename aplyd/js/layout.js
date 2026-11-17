/**
 * APLYD - shared app shell: sidebar navigation, topbar user menu, demo persona
 * switcher and role-based page access. Pages declare themselves with
 * <body data-page="...">.
 */
(function () {
  const NAV = [
    { page: 'dashboard', href: 'dashboard.html', label: 'Dashboard', roles: ['operator', 'supervisor', 'admin'] },
    { page: 'capture', href: 'capture.html', label: 'Capture Form', roles: ['operator', 'supervisor', 'admin'] },
    { page: 'review', href: 'review.html', label: 'Review Queue', operatorLabel: 'My Submissions', roles: ['operator', 'supervisor', 'admin'] },
    { page: 'register', href: 'production-register.html', label: 'Production Register', roles: ['supervisor', 'admin'] },
    { page: 'analytics', href: 'analytics.html', label: 'Analytics & Reliability', roles: ['supervisor', 'admin'] },
    { page: 'machines', href: 'machines.html', label: 'Looms Master', roles: ['admin'] },
    { page: 'shifts', href: 'shifts.html', label: 'Shift Schedules', roles: ['admin'] }
  ];

  const user = window.aplydStore.getCurrentUser();
  const page = document.body.dataset.page;
  const current = NAV.find(n => n.page === page);

  // Role guard: bounce to the dashboard if this persona may not open the page.
  if (current && !current.roles.includes(user.role)) {
    sessionStorage.setItem('aplyd_flash', `${current.label} is not available to the ${user.role} role.`);
    window.location.replace('dashboard.html');
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const esc = window.security.escapeHtml;

    const sidebar = document.getElementById('appSidebar');
    if (sidebar) {
      sidebar.innerHTML = `
        <div class="brand-block">
          <span class="brand-mark" aria-hidden="true">A</span>
          <div>
            <p class="brand-name">APLYD</p>
            <p class="brand-sub">Shop-floor digitisation</p>
          </div>
        </div>
        <nav class="sidebar-nav" aria-label="Primary">
          ${NAV.filter(n => n.roles.includes(user.role)).map(n => `
            <a class="nav-item${n.page === page ? ' nav-item-active' : ''}" href="${n.href}"${n.page === page ? ' aria-current="page"' : ''}>
              ${esc(user.role === 'operator' && n.operatorLabel ? n.operatorLabel : n.label)}
            </a>`).join('')}
        </nav>
        <div class="sidebar-note">
          <p class="note-label">Prototype</p>
          <p>Demo personas, no login. Data stays in this browser.</p>
        </div>`;
      // On phones the nav is a horizontal strip: make sure the current page is visible.
      const active = sidebar.querySelector('.nav-item-active');
      const nav = sidebar.querySelector('.sidebar-nav');
      if (active && nav && nav.scrollWidth > nav.clientWidth) {
        // Scroll only if the current page's tab is cut off, and then just enough to show it fully.
        const left = active.offsetLeft - nav.offsetLeft;
        const right = left + active.offsetWidth;
        if (right > nav.clientWidth) nav.scrollLeft = right - nav.clientWidth + 12;
      }
    }

    const actions = document.querySelector('.topbar-actions');
    if (actions) {
      const meta = document.createElement('div');
      meta.className = 'user-meta';
      meta.innerHTML = `<span class="user-name">${esc(user.full_name)}</span><span class="role-pill role-${esc(user.role)}">${esc(user.role)}</span>`;
      actions.appendChild(meta);
      const out = document.createElement('a');
      out.className = 'btn btn-outline btn-small';
      out.href = 'index.html';
      out.textContent = 'Switch user';
      actions.appendChild(out);
    }

    const bar = document.getElementById('demoPersonaBar');
    if (bar) {
      const roles = [['operator', 'Operator · Ramesh'], ['supervisor', 'Supervisor · Priya'], ['admin', 'Admin · Vikram']];
      bar.innerHTML = `<span class="demo-persona-label">Demo persona</span>` + roles.map(([r, l]) =>
        `<button type="button" class="persona-btn${user.role === r ? ' active' : ''}" data-role="${r}" aria-pressed="${user.role === r}">${l}</button>`).join('');
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.persona-btn');
        if (!btn || btn.dataset.role === user.role) return;
        window.aplydStore.switchUser(btn.dataset.role);
        window.location.reload();
      });
    }

    const flash = sessionStorage.getItem('aplyd_flash');
    if (flash) {
      sessionStorage.removeItem('aplyd_flash');
      window.toast.show(flash, 'warning');
    }
  });

  window.AplydLayout = {
    statusLabel: (s) => String(s || '').replace(/_/g, ' '),
    statusClass: (s) => ({ approved: 'badge-read', pending_review: 'badge-uncertain', returned_for_correction: 'badge-corrected', rejected: 'badge-invalid' }[s] || 'badge-missing'),
    fmtNum: (v, unit) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString() + (unit ? ` ${unit}` : ''))
  };
})();
