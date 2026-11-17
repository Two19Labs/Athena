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
    $('samplePicker').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sample]');
      if (btn) loadSample(btn.dataset.sample, btn);
    });

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
      el.textContent = `Vision AI ready: ${p.name} (${p.models[0]})`;
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

  async function processAndRender() {
    const out = await Img.prepare(state.bitmap, state.rotation);
    state.processed = out.blob;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(out.blob);

    showStart(false);
    $('preflightPreviewCard').classList.remove('hidden');
    $('previewImg').src = state.previewUrl;
    $('previewFileName').textContent = state.file.name;
    $('previewDimensions').textContent = `${out.srcW} × ${out.srcH} px` + (out.scale < 1 ? ` (sent as ${out.w} × ${out.h})` : '');
    $('previewFileSize').textContent = `${(state.file.size / 1024).toFixed(0)} KB → ${(out.blob.size / 1024).toFixed(0)} KB`;
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

  async function runExtraction() {
    if (!state.processed) return;
    $('extractBtn').disabled = true;
    $('preflightPreviewCard').classList.add('hidden');
    $('progressSection').classList.remove('hidden');
    let step = 2;
    try {
      setStep(1);
      const started = Date.now();
      setStep(2);
      const result = await window.visionExtractor.extract(state.processed);
      step = 3;
      setStep(3);
      const record = await window.aplydStore.createRecordFromExtraction({
        file: state.file, sha256: state.sha256, imageBlob: state.processed, extraction: result
      });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      window.toast.show(`Read by ${result.model} in ${secs}s. Opening review…`, 'success');
      setTimeout(() => { window.location.href = `review.html?id=${encodeURIComponent(record.id)}`; }, 600);
    } catch (err) {
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
