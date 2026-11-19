/**
 * APLYD - Outbox for photos taken without signal (weaving sheds often have patchy wifi).
 * The photo is kept on the phone (IndexedDB) and read automatically as soon as the
 * browser is back online. Each one then becomes a normal pending record; nothing skips review.
 */
(function () {
  const store = window.aplydStore;
  const $ = (id) => document.getElementById(id);
  let running = false;

  async function render() {
    const el = $('outboxBanner');
    if (!el) return;
    const items = await store.getOutbox();
    if (!items.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const n = items.length;
    el.innerHTML = `<span><strong>📶 ${n} photo${n > 1 ? 's' : ''} waiting for signal.</strong> ${n > 1 ? 'They' : 'It'} will be read automatically when this phone is back online.</span>
      <button type="button" class="btn btn-outline btn-small" id="outboxRetryBtn">${running ? 'Reading…' : 'Try now'}</button>`;
    el.classList.remove('hidden');
    $('outboxRetryBtn').disabled = running;
    $('outboxRetryBtn').addEventListener('click', () => processOutbox(true));
  }

  async function processOutbox(manual) {
    if (running) return;
    if (navigator.onLine === false) {
      if (manual) window.toast.show('Still no connection. The photos stay saved on this phone.', 'warning');
      return;
    }
    const items = await store.getOutbox();
    if (!items.length) return;
    running = true;
    await render();
    let made = 0;
    try {
      for (const item of items) {
        try {
          const result = await window.visionExtractor.extract(item.blob);
          const records = await store.createRecordsFromExtraction({
            file: { name: item.file_name, size: item.file_size }, sha256: item.sha256, imageBlob: item.blob, extraction: result, user: item.user
          });
          made += records.length;
          await store.removeFromOutbox(item.id);
        } catch (err) {
          if (window.visionExtractor.isOffline(err.code) || window.visionExtractor.isRetryable(err.code)) {
            if (manual) window.toast.show(`${err.message} The photos stay saved; trying again later.`, 'warning');
            break; // still no (good) connection: keep the rest for later
          }
          // The AI read it and refused it (e.g. not a form): tell the person, do not loop on it.
          await store.removeFromOutbox(item.id);
          window.toast.show(`A photo saved offline (${item.file_name}) could not be read: ${err.message}`, 'error');
        }
      }
    } finally {
      running = false;
      await render();
    }
    if (made) window.toast.show(`Back online: ${made} record${made > 1 ? 's' : ''} from photos taken offline ${made > 1 ? 'are' : 'is'} ready for review.`, 'success');
  }

  window.addEventListener('online', () => processOutbox(false));
  document.addEventListener('DOMContentLoaded', async () => {
    await render();
    processOutbox(false);
  });

  window.AplydOutbox = { render, process: processOutbox };
})();
