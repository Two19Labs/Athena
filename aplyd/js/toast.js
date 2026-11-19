// Lightweight toast notifications.
//   window.toast.show(message, type)                      type: "info" | "success" | "warning" | "error"
//   window.toast.show(message, type, { action: { label, onClick } })   adds a button (e.g. Undo)
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

  function show(message, type, opts) {
    if (!message) return;
    const container = ensureContainer();
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    const text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);
    const action = opts && opts.action;
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      el.classList.remove('toast-visible');
      el.classList.add('toast-leaving');
      setTimeout(() => el.remove(), 250);
    };
    if (action) {
      el.classList.add('toast-has-action');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { close(); action.onClick(); });
      el.appendChild(btn);
    }
    // Keep at most 3 on screen.
    while (container.children.length >= 3) container.firstChild.remove();
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-visible'));
    setTimeout(close, action ? 8000 : type === 'error' ? 6500 : 4000);
  }

  window.toast = { show };
})();
