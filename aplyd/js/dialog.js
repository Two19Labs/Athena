// In-page dialogs replacing window.prompt / window.confirm / window.alert.
// window.dialog.prompt({ title, message, label, defaultValue, required, confirmText, danger }) -> Promise<string|null>
// window.dialog.confirm({ title, message, confirmText, danger }) -> Promise<boolean>
(function () {
  function build({ title, message, label, defaultValue, required, confirmText, danger, withInput }) {
    return new Promise((resolve) => {
      const esc = window.security.escapeHtml;
      const overlay = document.createElement('div');
      overlay.className = 'app-dialog-overlay';
      overlay.innerHTML = `
        <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle">
          <h3 id="appDialogTitle">${esc(title || 'Confirm')}</h3>
          ${message ? `<p class="app-dialog-message">${esc(message)}</p>` : ''}
          ${withInput ? `
            <label class="app-dialog-label" for="appDialogInput">${esc(label || '')}${required ? ' <span class="req">*</span>' : ''}</label>
            <textarea id="appDialogInput" class="form-control" rows="3">${esc(defaultValue || '')}</textarea>
            <p class="app-dialog-error hidden">This field is required.</p>` : ''}
          <div class="app-dialog-actions">
            <button type="button" class="btn btn-outline" data-act="cancel">Cancel</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(confirmText || 'OK')}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('#appDialogInput');
      const errEl = overlay.querySelector('.app-dialog-error');
      const prevFocus = document.activeElement;
      (input || overlay.querySelector('[data-act="ok"]')).focus();
      if (input) input.select();

      function close(val) {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(val);
      }
      function submit() {
        if (!withInput) return close(true);
        const v = input.value.trim();
        if (required && !v) { errEl.classList.remove('hidden'); input.focus(); return; }
        close(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(withInput ? null : false);
        if (e.key === 'Enter' && (!withInput || e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
      }
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(withInput ? null : false);
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'cancel') close(withInput ? null : false);
        else submit();
      });
    });
  }

  window.dialog = {
    prompt: (opts) => build({ ...opts, withInput: true }),
    confirm: (opts) => build({ ...opts, withInput: false })
  };
})();
