/**
 * APLYD - shared app shell.
 *  - Sidebar navigation (tablet/desktop) and a bottom tab bar (phones)
 *  - Topbar user menu and the demo persona switcher (compact on phones)
 *  - Role-based page access (pages declare <body data-page="...">)
 *  - Phone tables: every .data-table gets per-cell labels so CSS can show rows as cards
 *  - Keeps --actionbar-h in sync so fixed bottom bars never cover content
 */
(function () {
  const ICONS = {
    dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
    capture: 'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm8 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    review: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
    register: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    analytics: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    machines: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    shifts: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
    more: 'M5 12h.01M12 12h.01M19 12h.01'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

  const NAV = [
    { page: 'dashboard', href: 'dashboard.html', label: 'Dashboard', short: 'Home', roles: ['operator', 'supervisor', 'admin'] },
    { page: 'capture', href: 'capture.html', label: 'Capture Form', short: 'Capture', roles: ['operator', 'supervisor', 'admin'] },
    { page: 'review', href: 'review.html', label: 'Review Queue', operatorLabel: 'My Submissions', short: 'Review', operatorShort: 'Mine', roles: ['operator', 'supervisor', 'admin'] },
    { page: 'register', href: 'production-register.html', label: 'Production Register', short: 'Register', roles: ['supervisor', 'admin'] },
    { page: 'analytics', href: 'analytics.html', label: 'Analytics & Reliability', short: 'Reliability', roles: ['supervisor', 'admin'] },
    { page: 'machines', href: 'machines.html', label: 'Looms Master', short: 'Looms', roles: ['admin'] },
    { page: 'shifts', href: 'shifts.html', label: 'Shift Schedules', short: 'Shifts', roles: ['admin'] }
  ];
  const ROLES = [['operator', 'Operator', 'Ramesh'], ['supervisor', 'Supervisor', 'Priya'], ['admin', 'Admin', 'Vikram']];

  const user = window.aplydStore.getCurrentUser();
  const page = document.body.dataset.page;
  const current = NAV.find(n => n.page === page);

  // Role guard: bounce to the dashboard if this persona may not open the page.
  if (current && !current.roles.includes(user.role)) {
    sessionStorage.setItem('aplyd_flash', `${current.label} is not available to the ${user.role} role.`);
    window.location.replace('dashboard.html');
    return;
  }

  const items = NAV.filter(n => n.roles.includes(user.role));
  const label = (n) => (user.role === 'operator' && n.operatorLabel ? n.operatorLabel : n.label);
  const short = (n) => (user.role === 'operator' && n.operatorShort ? n.operatorShort : n.short);

  document.addEventListener('DOMContentLoaded', () => {
    const esc = window.security.escapeHtml;

    // Sidebar (tablet / desktop)
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
          ${items.map(n => `
            <a class="nav-item${n.page === page ? ' nav-item-active' : ''}" href="${n.href}"${n.page === page ? ' aria-current="page"' : ''}>
              ${icon(n.page)}<span>${esc(label(n))}</span>
            </a>`).join('')}
        </nav>
        <div class="sidebar-note">
          <p class="note-label">Prototype</p>
          <p>Demo personas, no login. Data stays in this browser.</p>
        </div>`;
    }

    // Bottom tab bar (phones): up to 5 tabs; extra pages go under "More".
    if (sidebar) {
      const primary = items.length > 5 ? items.slice(0, 4) : items;
      const extra = items.length > 5 ? items.slice(4) : [];
      const moreActive = extra.some(n => n.page === page);
      const tabbar = document.createElement('nav');
      tabbar.className = 'tabbar';
      tabbar.setAttribute('aria-label', 'Primary');
      tabbar.innerHTML = primary.map(n => `
        <a class="tab-item${n.page === page ? ' tab-item-active' : ''}" href="${n.href}"${n.page === page ? ' aria-current="page"' : ''}>
          ${icon(n.page)}<span>${esc(short(n))}</span>
        </a>`).join('') + (extra.length ? `
        <button type="button" class="tab-item${moreActive ? ' tab-item-active' : ''}" id="tabMoreBtn" aria-expanded="false" aria-controls="tabMoreSheet">
          ${icon('more')}<span>More</span>
        </button>` : '');
      document.body.appendChild(tabbar);
      if (extra.length) {
        const sheet = document.createElement('div');
        sheet.id = 'tabMoreSheet';
        sheet.className = 'more-sheet hidden';
        sheet.innerHTML = `<div class="more-sheet-panel" role="menu">${extra.map(n => `
          <a class="more-item${n.page === page ? ' nav-item-active' : ''}" role="menuitem" href="${n.href}">${icon(n.page)}<span>${esc(label(n))}</span></a>`).join('')}</div>`;
        document.body.appendChild(sheet);
        const btn = document.getElementById('tabMoreBtn');
        const toggle = (open) => {
          sheet.classList.toggle('hidden', !open);
          btn.setAttribute('aria-expanded', String(open));
        };
        btn.addEventListener('click', () => toggle(sheet.classList.contains('hidden')));
        sheet.addEventListener('click', (e) => { if (e.target === sheet) toggle(false); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
      }
    }

    // Topbar user menu
    const actions = document.querySelector('.topbar-actions');
    if (actions) {
      const meta = document.createElement('div');
      meta.className = 'user-meta';
      meta.innerHTML = `<span class="user-name">${esc(user.full_name)}</span><span class="role-pill role-${esc(user.role)}">${esc(user.role)}</span>`;
      actions.appendChild(meta);
      const out = document.createElement('a');
      out.className = 'btn btn-outline btn-small';
      out.href = 'index.html';
      out.setAttribute('aria-label', 'Switch user');
      out.innerHTML = '<span class="hide-phone">Switch user</span><span class="show-phone" aria-hidden="true">⇄</span>';
      actions.appendChild(out);
    }

    // Demo persona switcher: full chips on wide screens, one compact chip on phones.
    const bar = document.getElementById('demoPersonaBar');
    if (bar) {
      const me = ROLES.find(r => r[0] === user.role);
      bar.innerHTML = `
        <button type="button" class="persona-compact" aria-expanded="false">Demo persona: <strong>${esc(me[1])} · ${esc(me[2])}</strong> <span aria-hidden="true">▾</span></button>
        <div class="persona-options">
          <span class="demo-persona-label">Demo persona</span>
          ${ROLES.map(([r, role, name]) => `<button type="button" class="persona-btn${user.role === r ? ' active' : ''}" data-role="${r}" aria-pressed="${user.role === r}">${role} · ${name}</button>`).join('')}
        </div>`;
      bar.addEventListener('click', (e) => {
        if (e.target.closest('.persona-compact')) {
          const open = !bar.classList.contains('open');
          bar.classList.toggle('open', open);
          bar.querySelector('.persona-compact').setAttribute('aria-expanded', String(open));
          return;
        }
        const btn = e.target.closest('.persona-btn');
        if (!btn || btn.dataset.role === user.role) return;
        window.aplydStore.switchUser(btn.dataset.role);
        window.location.reload();
      });
    }

    labelTables();
    trackActionBar();

    const flash = sessionStorage.getItem('aplyd_flash');
    if (flash) {
      sessionStorage.removeItem('aplyd_flash');
      window.toast.show(flash, 'warning');
    }
  });

  /**
   * Copy each column header into its cells (data-label) whenever a table body re-renders,
   * so the phone stylesheet can lay rows out as labelled cards.
   */
  function labelTables() {
    const apply = (table) => {
      const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach(tr => {
        [...tr.children].forEach((td, i) => {
          if (td.tagName !== 'TD') return;
          const h = heads[i] || '';
          if (td.getAttribute('data-label') !== h) td.setAttribute('data-label', h);
        });
      });
    };
    document.querySelectorAll('table.data-table').forEach(table => {
      apply(table);
      const body = table.querySelector('tbody');
      if (body) new MutationObserver(() => apply(table)).observe(body, { childList: true });
    });
  }

  /** Expose the fixed action bar's height so the page can reserve space for it. */
  function trackActionBar() {
    const barEl = document.querySelector('.sticky-action-bar');
    if (!barEl || !window.ResizeObserver) return;
    const set = () => document.documentElement.style.setProperty('--actionbar-h', `${barEl.offsetHeight}px`);
    new ResizeObserver(set).observe(barEl);
    set();
  }

  window.AplydLayout = {
    statusLabel: (s) => String(s || '').replace(/_/g, ' '),
    statusClass: (s) => ({ approved: 'badge-read', pending_review: 'badge-uncertain', returned_for_correction: 'badge-corrected', rejected: 'badge-invalid' }[s] || 'badge-missing'),
    fmtNum: (v, unit) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString() + (unit ? ` ${unit}` : ''))
  };
})();
