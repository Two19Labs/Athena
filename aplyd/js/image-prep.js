/**
 * APLYD - photo preparation shared by single capture and batch upload.
 *  decode()   EXIF-aware decode (falls back to <img> on older browsers)
 *  prepare()  rotate + downscale to MAX_IMAGE_EDGE + re-encode as JPEG
 *  quality()  cheap heuristic checks: resolution, darkness/glare, blur
 *  sha256()   fingerprint for duplicate detection (HTTPS/localhost only)
 */
(function () {
  const cfg = window.APLYD_CONFIG;

  /** Validate type/size before decoding. Returns an error message or null. */
  function checkFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) return 'Not an image. Use a JPG, PNG or WebP photo.';
    if (file.size > cfg.MAX_UPLOAD_BYTES) return 'Photo is larger than 25 MB. Use the phone camera\'s normal quality setting.';
    return null;
  }

  async function decode(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fall back */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight, source: img, url, close() { URL.revokeObjectURL(url); } };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  /** Draw rotated + downscaled, encode JPEG. Returns { blob, canvas, srcW, srcH, w, h, scale }. */
  async function prepare(bitmap, rotation = 0) {
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
    const dw = swap ? h : w;
    const dh = swap ? w : h;
    ctx.drawImage(bitmap.source || bitmap, -dw / 2, -dh / 2, dw, dh);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', cfg.JPEG_QUALITY));
    return { blob, canvas, srcW, srcH, w, h, scale };
  }

  /**
   * Heuristic checks on a small copy of the image. They warn, never block:
   * the model decides readability; these just prompt a retake before wasting a request.
   */
  function quality(canvas, srcW, srcH) {
    const s = Math.min(1, 320 / Math.max(canvas.width, canvas.height));
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

  async function sha256(file) {
    if (!(window.crypto && crypto.subtle)) return null;
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  window.AplydImage = { checkFile, decode, prepare, quality, sha256 };
})();
