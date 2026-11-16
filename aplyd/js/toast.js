// Lightweight toast notifications. Use window.toast.show(message, type)
// where type is "info" | "success" | "warning" | "error".
(function () {
  let containerEl = null;

  function ensureContainer() {
    if (containerEl && document.body.contains(containerEl)) return containerEl;
    containerEl = document.createElement('div');
    containerEl.className = 'toast-container';
    containerEl.setAttribute('role', 'status');
    containerEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(containerEl);
    return containerEl;
  }

  function show(message, type) {
    if (!message) return;
    const container = ensureContainer();
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-visible'));
    const lifetime = type === 'error' ? 6500 : 4000;
    setTimeout(() => {
      el.classList.remove('toast-visible');
      el.classList.add('toast-leaving');
      setTimeout(() => el.remove(), 250);
    }, lifetime);
  }

  window.toast = { show };
})();
