/**
 * Light/dark theme. Loaded in <head> so the saved theme applies before first
 * paint (no flash). Adds a toggle button to the page's .topbar-actions and
 * fires a "themeChanged" event so charts can redraw in the new colours.
 */
(function () {
  const KEY = 'theme';
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch (_) { /* storage blocked */ } };

  if (read() === 'dark') root.classList.add('dark-theme');

  const MOON = 'M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278';
  const SUN = 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708';

  document.addEventListener('DOMContentLoaded', () => {
    const actions = document.querySelector('.topbar-actions');
    if (!actions || document.getElementById('themeToggleBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.type = 'button';
    btn.className = 'btn btn-outline btn-small btn-icon';
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path/></svg>';
    const path = btn.querySelector('path');
    const sync = () => {
      const dark = root.classList.contains('dark-theme');
      path.setAttribute('d', dark ? SUN : MOON);
      btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    };
    sync();
    actions.prepend(btn);

    btn.addEventListener('click', () => {
      const dark = root.classList.toggle('dark-theme');
      write(dark ? 'dark' : 'light');
      sync();
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { isDark: dark } }));
    });
  });
})();
