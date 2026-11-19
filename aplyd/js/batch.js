/**
 * APLYD - Batch upload: many photos at once (e.g. a stack of sheets at shift end).
 *
 * Each photo goes through exactly the single-photo pipeline (prepare → AI → rules →
 * pending record); nothing skips human review. Photos are read a few at a time
 * (BATCH_CONCURRENCY) so a free-tier AI quota is not flooded, and transient
 * "busy / rate-limited" answers are retried automatically before a photo is marked failed.
 */
(function () {
  const cfg = window.APLYD_CONFIG;
  const Img = window.AplydImage;
  const store = window.aplydStore;
  const esc = window.security.escapeHtml;
  const $ = (id) => document.getElementById(id);

  const STATUS = {
    preparing: ['badge-missing', 'Preparing'],
    queued: ['badge-missing', 'Waiting'],
    reading: ['badge-corrected', 'Reading…'],
    retrying: ['badge-uncertain', 'AI busy, retrying'],
    ready: ['badge-read', 'Ready'],
    flagged: ['badge-uncertain', 'Needs check'],
    failed: ['badge-invalid', 'Failed'],
    skipped: ['badge-missing', 'Skipped'],
    stopped: ['badge-missing', 'Stopped']
  };

  let batch = null; // { id, label, items, running, stopping }

  function newBatch() {
    const now = new Date();
    return {
      id: `batch-${now.getTime().toString(36)}`,
      label: `Batch ${now.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      items: [],
      started: false,
      running: false,
      stopping: false
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('batchSection')) return;
    $('batchStartBtn').addEventListener('click', start);
    $('batchStopBtn').addEventListener('click', stop);
    $('batchClearBtn').addEventListener('click', clear);
    $('batchAddBtn').addEventListener('click', () => $('galleryInput').click());
    $('batchList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const item = batch && batch.items.find(i => i.n === Number(btn.dataset.n));
      if (!item) return;
      if (btn.dataset.act === 'retry') retry(item);
      if (btn.dataset.act === 'remove') remove(item);
    });
    window.addEventListener('beforeunload', (e) => {
      if (batch && batch.running) { e.preventDefault(); e.returnValue = ''; }
    });
  });

  // ---------------------------------------------------------------------------
  // Adding photos
  // ---------------------------------------------------------------------------
  async function add(files) {
    if (batch && batch.running) {
      window.toast.show('Wait for the current batch to finish, or stop it first.', 'warning');
      return;
    }
    if (!batch || batch.started) {
      if (batch) batch.items.forEach(i => i.thumbUrl && URL.revokeObjectURL(i.thumbUrl));
      batch = newBatch();
    }

    const room = cfg.BATCH_MAX_PHOTOS - batch.items.length;
    if (files.length > room) {
      window.toast.show(`A batch holds up to ${cfg.BATCH_MAX_PHOTOS} photos. Added the first ${Math.max(room, 0)}; send the rest as another batch.`, 'warning');
    }
    const accepted = files.slice(0, Math.max(room, 0));
    if (!accepted.length) return;

    window.AplydCapture.showStart(false);
    $('batchSection').classList.remove('hidden');
    const startN = batch.items.reduce((m, i) => Math.max(m, i.n), 0);
    const newItems = accepted.map((file, k) => ({ n: startN + k + 1, file, name: file.name, status: 'preparing', issues: [], attempts: 0 }));
    batch.items.push(...newItems);
    render();

    // Prepare one at a time: decoding many 12 MP photos in parallel can exhaust phone memory.
    for (const item of newItems) await prepareItem(item);
    render();
  }

  async function prepareItem(item) {
    const problem = Img.checkFile(item.file);
    if (problem) return fail(item, problem, 'bad_file');
    let bitmap;
    try {
      bitmap = await Img.decode(item.file);
      const out = await Img.prepare(bitmap, 0);
      item.blob = out.blob;
      item.thumbUrl = URL.createObjectURL(out.blob);
      item.issues = Img.quality(out.canvas, out.srcW, out.srcH).filter(c => !c.ok).map(c => c.label);
      item.sha = await Img.sha256(item.file);
    } catch (_) {
      return fail(item, 'This browser cannot open this image type. Use JPG or PNG.', 'bad_file');
    } finally {
      if (bitmap && bitmap.close) bitmap.close();
    }

    const twin = item.sha && batch.items.find(o => o !== item && o.sha === item.sha && o.n < item.n);
    if (twin) {
      item.status = 'skipped';
      item.note = `Same photo as #${twin.n} in this batch.`;
      return;
    }
    const earlier = await store.findFormBySha256(item.sha);
    if (earlier) item.note = `Uploaded before as ${earlier.form_number}; it will be flagged as a possible duplicate.`;
    item.status = 'queued';
  }

  function fail(item, message, code) {
    item.status = 'failed';
    item.error = message;
    item.code = code;
  }

  function remove(item) {
    if (batch.running || !['queued', 'failed', 'skipped', 'stopped'].includes(item.status)) return;
    if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    batch.items = batch.items.filter(i => i !== item);
    if (!batch.items.length) return clear();
    render();
  }

  function clear() {
    if (batch && batch.running) return;
    if (batch) batch.items.forEach(i => i.thumbUrl && URL.revokeObjectURL(i.thumbUrl));
    batch = null;
    $('batchSection').classList.add('hidden');
    window.AplydCapture.showStart(true);
  }

  // ---------------------------------------------------------------------------
  // Running
  // ---------------------------------------------------------------------------
  async function start() {
    if (!batch || batch.running) return;
    batch.items.filter(i => i.status === 'stopped').forEach(i => { i.status = 'queued'; });
    if (!batch.items.some(i => i.status === 'queued')) return;
    batch.started = true;
    batch.running = true;
    batch.stopping = false;
    render();
    const workers = Array.from({ length: cfg.BATCH_CONCURRENCY }, () => worker());
    await Promise.all(workers);
    batch.running = false;
    batch.stopping = false;
    render();
    const done = batch.items.reduce((n, i) => n + (i.recordCount || 0), 0);
    if (done) window.toast.show(`${done} record${done > 1 ? 's' : ''} ready for review.`, 'success');
  }

  async function worker() {
    for (;;) {
      if (batch.stopping) {
        batch.items.filter(i => i.status === 'queued').forEach(i => { i.status = 'stopped'; });
        render();
        return;
      }
      const item = batch.items.find(i => i.status === 'queued');
      if (!item) return;
      item.status = 'reading';
      render();
      await processItem(item);
      render();
    }
  }

  async function processItem(item) {
    const waits = cfg.BATCH_RETRY_WAITS_MS;
    for (;;) {
      item.attempts++;
      try {
        const result = await window.visionExtractor.extract(item.blob);
        const records = await store.createRecordsFromExtraction({
          file: item.file, sha256: item.sha, imageBlob: item.blob, extraction: result,
          batch: { id: batch.id, label: batch.label }
        });
        const loom = (r) => r.final_payload.fields.machine.value || r.final_payload.fields.machine.raw_value || 'Loom ?';
        let toCheck = 0;
        for (const r of records) {
          const v = await store.validationFor(r);
          toCheck += v.blockers.length + v.warnings.length;
        }
        const first = records[0];
        item.recordId = records.length === 1 ? first.id : null;
        item.recordCount = records.length;
        item.summary = records.length === 1
          ? [loom(first), first.production_quantity !== null && first.production_quantity !== undefined ? `${first.production_quantity} ${first.production_unit}` : 'qty ?'].join(' · ')
          : `${records.length} entries on this sheet · ${loom(first)} to ${loom(records[records.length - 1])}`;
        if (result.data.incomplete) item.note = `The AI saw ${result.data.rows_detected} filled rows but captured ${records.length}; check the photo.`;
        item.toCheck = toCheck;
        item.status = toCheck ? 'flagged' : 'ready';
        item.error = null;
        return;
      } catch (err) {
        if (window.visionExtractor.isOffline(err.code)) {
          // No signal: keep the photo on the phone; the outbox reads it when back online.
          await store.addToOutbox({ file: item.file, sha256: item.sha, imageBlob: item.blob });
          fail(item, 'No signal: saved on this phone and will be read automatically when back online.', 'offline');
          if (window.AplydOutbox) window.AplydOutbox.render();
          return;
        }
        const retryable = window.visionExtractor.isRetryable(err.code);
        const wait = waits[item.attempts - 1];
        if (retryable && wait !== undefined && !batch.stopping) {
          item.status = 'retrying';
          item.error = `${err.message} Retrying in ${Math.round(wait / 1000)} s…`;
          render();
          await new Promise(r => setTimeout(r, wait));
          item.status = 'reading';
          render();
          continue;
        }
        fail(item, err.message || 'Extraction failed.', err.code);
        return;
      }
    }
  }

  function stop() {
    if (!batch || !batch.running) return;
    batch.stopping = true;
    render();
  }

  function retry(item) {
    if (item.status !== 'failed' || item.code === 'bad_file' || item.code === 'offline' || !item.blob) return;
    item.status = 'queued';
    item.attempts = 0;
    item.error = null;
    if (!batch.running) start();
    else render();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function render() {
    if (!batch) return;
    const items = batch.items;
    const count = (s) => items.filter(i => i.status === s).length;
    const done = count('ready') + count('flagged');
    const records = items.reduce((n, i) => n + (i.recordCount || 0), 0);
    const failed = count('failed');
    const pending = count('queued') + count('reading') + count('retrying') + count('preparing');
    const preparing = count('preparing') > 0;
    const finished = !batch.running && items.some(i => ['ready', 'flagged', 'failed'].includes(i.status));

    $('batchTitle').textContent = `${batch.label} · ${items.length} photo${items.length > 1 ? 's' : ''}`;
    const total = items.length - count('skipped');
    $('batchSummary').textContent = batch.running
      ? `${done + failed} of ${total} done · ${count('ready')} ready · ${count('flagged')} need a check · ${failed} failed${batch.stopping ? ' · stopping after the current photos…' : ''}`
      : finished
        ? `${done} photo${done === 1 ? '' : 's'} read → ${records} record${records === 1 ? '' : 's'} (${count('ready')} ready, ${count('flagged')} need a check) · ${failed} failed${count('stopped') ? ` · ${count('stopped')} not started` : ''}${count('skipped') ? ` · ${count('skipped')} skipped` : ''}`
        : preparing ? 'Preparing photos…' : `${pending} photo${pending === 1 ? '' : 's'} ready to read. Nothing is saved until the AI has read a photo.`;

    $('batchStartBtn').classList.toggle('hidden', batch.running || (!count('queued') && !count('stopped')));
    $('batchStartBtn').disabled = preparing;
    $('batchStartBtn').textContent = count('stopped') ? `Resume (${count('stopped')} left)` : `Read ${count('queued')} photo${count('queued') === 1 ? '' : 's'} with AI →`;
    $('batchStopBtn').classList.toggle('hidden', !batch.running);
    $('batchStopBtn').disabled = batch.stopping;
    $('batchAddBtn').classList.toggle('hidden', batch.running || finished || items.length >= cfg.BATCH_MAX_PHOTOS);
    $('batchClearBtn').classList.toggle('hidden', batch.running);
    $('batchClearBtn').textContent = finished ? 'New batch' : 'Cancel';
    const review = $('batchReviewLink');
    review.classList.toggle('hidden', !done || batch.running);
    review.href = `review.html?batch=${encodeURIComponent(batch.id)}`;
    review.textContent = `Review ${records} record${records === 1 ? '' : 's'} from this batch →`;

    $('batchList').innerHTML = items.map(i => {
      const [cls, label] = STATUS[i.status];
      const detail = i.status === 'ready' || i.status === 'flagged'
        ? `${esc(i.summary)}${i.toCheck ? ` · ${i.toCheck} to check` : ''}`
        : i.error ? esc(i.error) : '';
      const notes = [...(i.issues.length ? [`Photo: ${i.issues.join(', ').toLowerCase()}`] : []), ...(i.note ? [i.note] : [])];
      const actions = [
        i.recordId ? `<a class="btn btn-outline btn-small" href="review.html?id=${encodeURIComponent(i.recordId)}">Open</a>` : (i.recordCount > 1 ? `<a class="btn btn-outline btn-small" href="review.html?batch=${encodeURIComponent(batch.id)}">Open</a>` : ''),
        i.status === 'failed' && i.code !== 'bad_file' && i.code !== 'offline' && !batch.running ? `<button type="button" class="btn btn-outline btn-small" data-act="retry" data-n="${i.n}">Retry</button>` : '',
        !batch.running && ['queued', 'failed', 'skipped', 'stopped'].includes(i.status) && !i.recordCount ? `<button type="button" class="btn btn-outline btn-small" data-act="remove" data-n="${i.n}" aria-label="Remove photo ${i.n}">✕</button>` : ''
      ].join('');
      return `
        <li class="batch-item batch-${i.status}" data-n="${i.n}">
          <div class="batch-thumb">${i.thumbUrl ? `<img src="${i.thumbUrl}" alt="">` : ''}</div>
          <div class="batch-body">
            <p class="batch-name"><span class="mono">#${i.n}</span> ${esc(i.name)}</p>
            <p class="batch-detail"><span class="${cls}">${label}</span> ${detail}</p>
            ${notes.length ? `<p class="batch-note">${esc(notes.join(' · '))}</p>` : ''}
          </div>
          <div class="batch-actions">${actions}</div>
        </li>`;
    }).join('');
  }

  /** True while a batch is being assembled (photos added, not started yet). */
  const isCollecting = () => Boolean(batch && !batch.started);

  window.AplydBatch = { add, isCollecting };
})();
