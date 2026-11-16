/**
 * APLYD - Capture & preflight.
 * 1. Decode the photo (browser applies EXIF orientation via imageOrientation:'from-image').
 * 2. Apply any manual rotation, downscale to MAX_IMAGE_EDGE, re-encode as JPEG.
 * 3. Run cheap photo-quality checks (resolution, brightness/glare, blur) and tell the operator.
 * 4. Send to /api/extract, then create a draft record for review.
 */
(function () {
  const cfg = window.APLYD_CONFIG;
  const state = { file: null, bitmap: null, rotation: 0, sha256: null, processed: null, previewUrl: null };

  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', () => {
    const dropzone = $('dropzone');
    const fileInput = $('fileInput');
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => { if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]); });
    $('rotateBtn').addEventListener('click', rotate);
    $('removeFileBtn').addEventListener('click', reset);
    $('extractBtn').addEventListener('click', runExtraction);
    $('retryBtn').addEventListener('click', () => { $('failureCard').classList.add('hidden'); $('preflightPreviewCard').classList.remove('hidden'); });
    $('retakeBtn').addEventListener('click', reset);

    renderAiStatus();
  });

  async function renderAiStatus() {
    const el = $('aiStatus');
    if (!el) return;
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

  async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      window.toast.show('That file is not an image. Upload a JPG, PNG or WebP photo.', 'error');
      return;
    }
    if (file.size > cfg.MAX_UPLOAD_BYTES) {
      window.toast.show('Photo is larger than 25 MB. Use the phone camera\'s normal quality setting.', 'error');
      return;
    }
    let bitmap;
    try {
      bitmap = await decodeImage(file);
    } catch (_) {
      window.toast.show(`This browser cannot open ${file.type || 'this image type'}. Use JPG or PNG (iPhone: Settings > Camera > Formats > Most Compatible).`, 'error');
      return;
    }
    reset(true);
    state.file = file;
    state.bitmap = bitmap;
    state.rotation = 0;
    state.sha256 = await sha256Hex(await file.arrayBuffer());
    await processAndRender();

    const dup = await window.aplydStore.findFormBySha256(state.sha256);
    const dupEl = $('duplicateWarningAlert');
    if (dup) {
      dupEl.textContent = `This exact photo was already uploaded as ${dup.form_number} on ${new Date(dup.uploaded_at).toLocaleString()}. Extracting again will create a second record; the review screen will flag it as a possible duplicate.`;
      dupEl.classList.remove('hidden');
    } else {
      dupEl.classList.add('hidden');
    }
  }

  async function rotate() {
    if (!state.bitmap) return;
    state.rotation = (state.rotation + 90) % 360;
    await processAndRender();
  }

  /** Draw rotated + downscaled image, encode JPEG, run quality checks, update preview. */
  async function processAndRender() {
    const { bitmap, rotation } = state;
    const swap = rotation % 180 !== 0;
    const srcW = swap ? bitmap.height : bitmap.width;
    const srcH = swap ? bitmap.width : bitmap.height;
    const scale = Math.min(1, cfg.MAX_IMAGE_EDGE / Math.max(srcW, srcH));
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    const dw = (swap ? h : w);
    const dh = (swap ? w : h);
    ctx.drawImage(bitmap.source || bitmap, -dw / 2, -dh / 2, dw, dh);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', cfg.JPEG_QUALITY));
    state.processed = blob;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(blob);

    $('dropzone').classList.add('hidden');
    $('preflightPreviewCard').classList.remove('hidden');
    $('previewImg').src = state.previewUrl;
    $('previewFileName').textContent = state.file.name;
    $('previewDimensions').textContent = `${srcW} × ${srcH} px` + (scale < 1 ? ` (sent as ${w} × ${h})` : '');
    $('previewFileSize').textContent = `${(state.file.size / 1024).toFixed(0)} KB → ${(blob.size / 1024).toFixed(0)} KB`;
    renderChecks(qualityChecks(canvas, srcW, srcH));
    $('extractBtn').disabled = false;
  }

  /**
   * Heuristic photo checks on a small copy of the image. They warn, never block:
   * the model decides readability; these just prompt a retake before wasting a request.
   */
  function qualityChecks(canvas, srcW, srcH) {
    const size = 320;
    const s = Math.min(1, size / Math.max(canvas.width, canvas.height));
    const w = Math.max(1, Math.round(canvas.width * s));
    const h = Math.max(1, Math.round(canvas.height * s));
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(canvas, 0, 0, w, h);
    const px = sctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    let sum = 0;
    let clipped = 0;
    for (let i = 0; i < w * h; i++) {
      const g = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      gray[i] = g;
      sum += g;
      if (g > 250) clipped++;
    }
    const mean = sum / (w * h);
    // Variance of the Laplacian: low = blurry.
    let lapSum = 0;
    let lapSq = 0;
    let n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
        lapSum += lap;
        lapSq += lap * lap;
        n++;
      }
    }
    const lapVar = n ? lapSq / n - (lapSum / n) ** 2 : 0;
    const shortEdge = Math.min(srcW, srcH);

    return [
      shortEdge >= 900
        ? { ok: true, label: 'Resolution', detail: `${shortEdge}px short edge` }
        : { ok: false, label: 'Low resolution', detail: `${shortEdge}px short edge. Move closer so the form fills the frame.` },
      mean < 70
        ? { ok: false, label: 'Too dark', detail: 'Turn on a light or move away from shadow.' }
        : (clipped / (w * h) > 0.25
          ? { ok: false, label: 'Glare / overexposed', detail: 'Tilt the phone slightly to avoid the lamp reflection.' }
          : { ok: true, label: 'Lighting', detail: 'Brightness looks usable' }),
      lapVar < 60
        ? { ok: false, label: 'Possibly blurry', detail: 'Hold the phone steady and tap to focus before capturing.' }
        : { ok: true, label: 'Sharpness', detail: 'Edges look sharp' }
    ];
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

  function reset(keepToast) {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    Object.assign(state, { file: null, bitmap: null, rotation: 0, sha256: null, processed: null, previewUrl: null });
    $('fileInput').value = '';
    $('preflightPreviewCard').classList.add('hidden');
    $('progressSection').classList.add('hidden');
    $('failureCard').classList.add('hidden');
    $('duplicateWarningAlert').classList.add('hidden');
    $('dropzone').classList.remove('hidden');
    if (keepToast !== true) $('dropzone').focus();
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
    let step = 1;
    try {
      setStep(1);
      const started = Date.now();
      step = 2;
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
    const titles = {
      unreadable: 'The AI could not read this photo',
      not_configured: 'AI provider not configured',
      rate_limited: 'Free-tier limit reached',
      no_server: 'App opened without its server',
      network: 'Network problem'
    };
    $('failureTitle').textContent = titles[err.code] || 'Extraction failed';
    $('failureErrorMsg').textContent = err.message || 'Unexpected error.';
    // Retake is the right action for unreadable photos; retry for transient errors.
    $('retryBtn').classList.toggle('hidden', err.code === 'unreadable' || err.code === 'not_configured');
    $('extractBtn').disabled = false;
  }

  /** Decode with EXIF orientation applied. Falls back to <img> where createImageBitmap is missing or rejects options (older Safari). */
  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fall back */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight, source: img, url };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  /** SHA-256 for duplicate detection. crypto.subtle only exists on HTTPS/localhost; elsewhere skip the check. */
  async function sha256Hex(buf) {
    if (!(window.crypto && crypto.subtle)) return null;
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
})();
