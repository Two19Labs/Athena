/**
 * APLYD - Capture page: single-photo flow.
 * Pick/take one photo → preview with quality checks (rotate if needed) →
 * /api/extract → draft record → review screen.
 * Two or more photos are handed to the batch flow (js/batch.js).
 */
(function () {
  const Img = window.AplydImage;
  const state = { file: null, bitmap: null, rotation: 0, sha256: null, processed: null, previewUrl: null };
  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', () => {
    const dropzone = $('dropzone');
    if (!dropzone) return;

    $('takePhotoBtn').addEventListener('click', () => $('cameraInput').click());
    $('choosePhotosBtn').addEventListener('click', () => $('galleryInput').click());
    $('cameraInput').addEventListener('change', (e) => route(e.target.files));
    $('galleryInput').addEventListener('change', (e) => route(e.target.files));
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      route(e.dataTransfer.files);
    });

    $('rotateBtn').addEventListener('click', rotate);
    $('removeFileBtn').addEventListener('click', () => reset());
    $('extractBtn').addEventListener('click', runExtraction);
    $('retryBtn').addEventListener('click', () => { $('failureCard').classList.add('hidden'); $('preflightPreviewCard').classList.remove('hidden'); });
    $('retakeBtn').addEventListener('click', () => reset());
    $('cancelExtractBtn').addEventListener('click', () => controller && controller.abort());
    $('samplePicker').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sample]');
      if (btn) loadSample(btn.dataset.sample, btn);
    });
    $('sampleBatchBtn').addEventListener('click', loadSampleBatch);

    renderAiStatus();
  });

  /** One photo → single flow; several → batch flow. */
  function route(fileList) {
    const files = Array.from(fileList || []);
    $('cameraInput').value = '';
    $('galleryInput').value = '';
    if (!files.length) return;
    if (files.length > 1 || window.AplydBatch.isCollecting()) window.AplydBatch.add(files);
    else handleFile(files[0]);
  }

  function showStart(show) {
    $('dropzone').classList.toggle('hidden', !show);
    $('samplePicker').classList.toggle('hidden', !show);
  }

  async function renderAiStatus() {
    const el = $('aiStatus');
    const s = await window.visionExtractor.status();
    if (!s.reachable) {
      el.className = 'ai-status ai-status-bad';
      el.textContent = 'Extraction service unreachable. Run the app with "node dev-server.js" or use the deployed URL.';
    } else if (!s.configured) {
      el.className = 'ai-status ai-status-bad';
      el.textContent = 'AI provider not configured on the server (set GEMINI_API_KEY). Photos cannot be read until it is.';
    } else {
      const p = s.providers[0];
      el.className = 'ai-status ai-status-ok';
      // Operators only need to know it works; reviewers and admins also see which model.
      el.textContent = window.aplydStore.getCurrentUser().role === 'operator'
        ? '✓ AI reader ready'
        : `✓ AI reader ready · ${p.name} ${p.models[0]} (+${p.models.length - 1} backup model${p.models.length === 2 ? '' : 's'})`;
    }
  }

  /** Load one of the bundled sample photos and run it through exactly the same path as an upload. */
  async function loadSample(id, btn) {
    btn.disabled = true;
    try {
      const resp = await fetch(`assets/samples/${encodeURIComponent(id)}.jpg`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      await handleFile(new File([blob], `${id}.jpg`, { type: 'image/jpeg' }));
    } catch (err) {
      window.toast.show(`Could not load the sample photo (${err.message}).`, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /** All bundled samples (aplyd/assets/samples) as one batch, to try batch upload without downloading files. */
  const SAMPLE_IDS = [
    'form-01-clean', 'form-02-skewed', 'form-03-low-light', 'form-04-glare', 'form-05-ambiguous-qty', 'form-06-oil-stain',
    'form-07-blank-and-zero', 'form-08-unknown-loom', 'form-09-ledger-layout', 'form-10-faded-torn', 'form-11-sideways', 'form-13-register-6-looms', 'form-12-not-a-form',
    'real-01-crumpled-slip', 'real-02-carbon-register', 'real-03-hindi-slip', 'real-04-ambiguous-digits', 'real-05-tubelight-glare'
  ];

  async function loadSampleBatch() {
    const btn = $('sampleBatchBtn');
    btn.disabled = true;
    try {
      const files = await Promise.all(SAMPLE_IDS.map(async (id) => {
        const resp = await fetch(`assets/samples/${id}.jpg`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${id}`);
        return new File([await resp.blob()], `${id}.jpg`, { type: 'image/jpeg' });
      }));
      await window.AplydBatch.add(files);
    } catch (err) {
      window.toast.show(`Could not load the sample photos (${err.message}).`, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function handleFile(file) {
    const problem = Img.checkFile(file);
    if (problem) {
      window.toast.show(problem, 'error');
      return;
    }
    let bitmap;
    try {
      bitmap = await Img.decode(file);
    } catch (_) {
      window.toast.show(`This browser cannot open ${file.type || 'this image type'}. Use JPG or PNG (iPhone: Settings > Camera > Formats > Most Compatible).`, 'error');
      return;
    }
    reset(true);
    Object.assign(state, { file, bitmap, rotation: 0, sha256: await Img.sha256(file) });
    await processAndRender();

    const dup = await window.aplydStore.findFormBySha256(state.sha256);
    const dupEl = $('duplicateWarningAlert');
    dupEl.classList.toggle('hidden', !dup);
    if (dup) {
      dupEl.textContent = `This exact photo was already uploaded as ${dup.form_number} on ${new Date(dup.uploaded_at).toLocaleString()}. Extracting again will create a second record; the review screen will flag it as a possible duplicate.`;
    }
  }

  async function rotate() {
    if (!state.bitmap) return;
    state.rotation = (state.rotation + 90) % 360;
    await processAndRender();
  }

  const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

  async function processAndRender() {
    const out = await Img.prepare(state.bitmap, state.rotation);
    // A small JPEG that needs no resizing or rotation is sent as it is (re-encoding would only make it bigger).
    const keepOriginal = out.scale === 1 && state.rotation === 0 && state.file.type === 'image/jpeg' && out.blob.size >= state.file.size;
    state.processed = keepOriginal ? state.file : out.blob;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(state.processed);

    showStart(false);
    $('preflightPreviewCard').classList.remove('hidden');
    $('previewImg').src = state.previewUrl;
    $('previewFileName').textContent = state.file.name;
    $('previewDimensions').textContent = `${out.srcW} × ${out.srcH} px` + (out.scale < 1 ? ` (sent as ${out.w} × ${out.h})` : '');
    $('previewFileSize').textContent = keepOriginal || state.processed.size >= state.file.size
      ? `${kb(state.processed.size)}, ready to send`
      : `${kb(state.file.size)} → ${kb(state.processed.size)} (made smaller for upload)`;
    renderChecks(Img.quality(out.canvas, out.srcW, out.srcH));
    $('extractBtn').disabled = false;
  }

  function renderChecks(checks) {
    const esc = window.security.escapeHtml;
    $('qualityChecks').innerHTML = checks.map(c => `
      <li class="${c.ok ? 'qc-ok' : 'qc-warn'}">
        <span class="qc-icon" aria-hidden="true">${c.ok ? '✓' : '!'}</span>
        <span><strong>${esc(c.label)}</strong> ${esc(c.detail)}</span>
      </li>`).join('');
    const warnings = checks.filter(c => !c.ok).length;
    $('qualitySummary').textContent = warnings ? `${warnings} photo issue${warnings > 1 ? 's' : ''}: consider retaking. You can still extract.` : 'Photo looks good.';
    $('qualitySummary').className = warnings ? 'qc-summary qc-summary-warn' : 'qc-summary qc-summary-ok';
  }

  function reset(silent) {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    if (state.bitmap && state.bitmap.close) state.bitmap.close();
    Object.assign(state, { file: null, bitmap: null, rotation: 0, sha256: null, processed: null, previewUrl: null });
    $('preflightPreviewCard').classList.add('hidden');
    $('progressSection').classList.add('hidden');
    $('failureCard').classList.add('hidden');
    $('duplicateWarningAlert').classList.add('hidden');
    showStart(true);
    if (silent !== true) $('takePhotoBtn').focus();
  }

  function setStep(n, failed) {
    for (let i = 1; i <= 3; i++) {
      const el = $(`step${i}`);
      el.className = 'step-item' + (i < n ? ' done' : i === n ? (failed ? ' failed' : ' active') : '');
      el.querySelector('.step-icon').textContent = i < n ? '✓' : (i === n && failed ? '!' : String(i));
    }
  }

  /** Elapsed-seconds counter while the AI reads; after 15 s explain the wait. */
  let ticker = null;
  let controller = null;
  function startTicker(started) {
    const el = $('progressElapsed');
    const note = $('progressNote');
    note.classList.add('hidden');
    const tick = () => {
      const s = Math.floor((Date.now() - started) / 1000);
      el.textContent = `${s} s`;
      if (s >= 15) {
        note.textContent = s >= 35
          ? 'Still working: the free AI is slow right now. Cancel and retry later if you prefer; nothing is lost.'
          : 'Taking longer than usual: the free AI may be busy, so it can switch to a backup model.';
        note.classList.remove('hidden');
      }
    };
    tick();
    ticker = setInterval(tick, 500);
  }
  const stopTicker = () => { clearInterval(ticker); ticker = null; };

  async function runExtraction() {
    if (!state.processed) return;
    $('extractBtn').disabled = true;
    $('preflightPreviewCard').classList.add('hidden');
    $('progressSection').classList.remove('hidden');
    let step = 2;
    controller = new AbortController();
    const started = Date.now();
    startTicker(started);
    try {
      setStep(1);
      setStep(2);
      const result = await window.visionExtractor.extract(state.processed, { signal: controller.signal });
      stopTicker();
      step = 3;
      setStep(3);
      const records = await window.aplydStore.createRecordsFromExtraction({
        file: state.file, sha256: state.sha256, imageBlob: state.processed, extraction: result
      });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      if (records.length === 1) {
        window.toast.show(`Read in ${secs}s. Opening review…`, 'success');
        setTimeout(() => { window.location.href = `review.html?id=${encodeURIComponent(records[0].id)}`; }, 600);
      } else {
        // A register page / several slips: one record per entry, reviewed together.
        const missed = result.data.incomplete ? ` The AI saw ${result.data.rows_detected} filled rows; check the photo for any it missed.` : '';
        window.toast.show(`This photo has ${records.length} entries: ${records.length} records created (${secs}s).${missed}`, result.data.incomplete ? 'warning' : 'success');
        setTimeout(() => { window.location.href = `review.html?batch=${encodeURIComponent(records[0].batch_id)}`; }, 1200);
      }
    } catch (err) {
      stopTicker();
      if (err.code === 'cancelled') {
        $('progressSection').classList.add('hidden');
        $('preflightPreviewCard').classList.remove('hidden');
        $('extractBtn').disabled = false;
        window.toast.show('Cancelled. Nothing was saved; the photo is still here.', 'info');
        return;
      }
      if (window.visionExtractor.isOffline(err.code)) {
        // No signal on the shop floor: keep the photo on this phone and read it when back online.
        await window.aplydStore.addToOutbox({ file: state.file, sha256: state.sha256, imageBlob: state.processed });
        $('progressSection').classList.add('hidden');
        reset(true);
        window.toast.show('No signal. The photo is saved on this phone and will be read automatically when you are back online.', 'warning');
        window.AplydOutbox && window.AplydOutbox.render();
        return;
      }
      setStep(step, true);
      showFailure(err);
    }
  }

  function showFailure(err) {
    $('progressSection').classList.add('hidden');
    $('failureCard').classList.remove('hidden');
    $('failureTitle').textContent = window.visionExtractor.errorTitle(err.code);
    $('failureErrorMsg').textContent = err.message || 'Unexpected error.';
    // Retake is the right action for unreadable photos; retry for transient errors.
    $('retryBtn').classList.toggle('hidden', err.code === 'unreadable' || err.code === 'not_configured');
    $('extractBtn').disabled = false;
  }

  window.AplydCapture = { showStart };
})();
