/**
 * APLYD - client for the /api/extract vision endpoint.
 * There is deliberately NO offline/fallback extractor: if the AI cannot read
 * the photo, the operator is told so instead of being shown invented values.
 */
(function () {
  class ExtractionError extends Error {
    constructor(message, code, details) {
      super(message);
      this.code = code || 'error';
      this.details = details || null;
    }
  }

  async function status() {
    try {
      const resp = await fetch(`${window.APLYD_CONFIG.API_BASE}/api/extract`, { method: 'GET' });
      if (!resp.ok) return { reachable: false, configured: false };
      const body = await resp.json();
      return { reachable: true, configured: Boolean(body.configured), providers: body.providers || [] };
    } catch (_) {
      return { reachable: false, configured: false };
    }
  }

  /**
   * @param blob processed JPEG blob
   * @param opts { signal } optional AbortSignal: Cancel stops waiting (nothing is saved)
   */
  async function extract(blob, opts = {}) {
    if (location.protocol === 'file:') {
      throw new ExtractionError('Open the app through the server (node dev-server.js or the deployed URL), not as a local file.', 'no_server');
    }
    const base64 = await blobToBase64(blob);
    const tiles = await cropTiles(blob, base64.length);
    const machines = (await window.aplydStore.getMachines()).filter(m => m.is_active !== false)
      .map(m => ({ machine_code: m.machine_code, name: m.name, is_active: m.is_active !== false }));
    const shifts = (await window.aplydStore.getShifts()).filter(s => s.is_active !== false)
      .map(s => ({ shift_code: s.shift_code, name: s.name }));

    let resp;
    try {
      resp = await fetch(`${window.APLYD_CONFIG.API_BASE}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: blob.type, master: { machines, shifts }, today: window.AplydRules.todayIso(), ...(tiles.length ? { tiles } : {}) }),
        signal: opts.signal
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw new ExtractionError('Cancelled. Nothing was saved.', 'cancelled');
      throw new ExtractionError(navigator.onLine === false
        ? 'No internet connection.'
        : 'Could not reach the extraction service. Check the network connection and retry.', navigator.onLine === false ? 'offline' : 'network');
    }
    let body = null;
    try { body = await resp.json(); } catch (err) {
      if (err && err.name === 'AbortError') throw new ExtractionError('Cancelled. Nothing was saved.', 'cancelled');
    }
    if (!resp.ok || !body || !body.success) {
      const msg = (body && body.error) || `Extraction service returned HTTP ${resp.status}.`;
      throw new ExtractionError(msg, (body && body.code) || `http_${resp.status}`, body);
    }
    return body; // { provider, model, latency_ms, data, model_output }
  }

  /**
   * Two overlapping crops of the photo (top 60%, bottom 60%), enlarged up to 2x, for the corrections
   * check: a thin line through a handwritten digit is much easier to see at twice the size. Skipped
   * (empty list) if anything fails or the request would get too large; the main read never needs them.
   */
  async function cropTiles(blob, mainLength) {
    try {
      if (typeof createImageBitmap !== 'function') return [];
      const bmp = await createImageBitmap(blob);
      const out = [];
      for (const [from, to] of [[0, 0.6], [0.4, 1]]) {
        const sy = Math.round(bmp.height * from), sh = Math.round(bmp.height * (to - from));
        const scale = Math.min(2, 1600 / Math.max(bmp.width, sh));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * scale); c.height = Math.round(sh * scale);
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, 0, sy, bmp.width, sh, 0, 0, c.width, c.height);
        const tile = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
        if (tile) out.push(await blobToBase64(tile));
      }
      if (bmp.close) bmp.close();
      const total = mainLength + out.reduce((n, t) => n + t.length, 0);
      return total < 3.6 * 1024 * 1024 ? out : [];
    } catch (_) {
      return [];
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Could not read the image.'));
      r.readAsDataURL(blob);
    });
  }

  const TITLES = {
    unreadable: 'The AI could not read this photo',
    not_configured: 'AI provider not configured',
    rate_limited: 'Free-tier limit reached',
    timeout: 'The AI service is busy',
    upstream: 'The AI service is busy',
    no_server: 'App opened without its server',
    network: 'Network problem',
    offline: 'No signal'
  };
  const errorTitle = (code) => TITLES[code] || 'Extraction failed';

  /** Transient problems worth an automatic retry; anything else needs a person (retake, fix config). */
  const isRetryable = (code) => ['rate_limited', 'timeout', 'upstream', 'provider_error', 'network', 'bad_model_output', 'http_500', 'http_502', 'http_503', 'http_504'].includes(code);

  /** No connection at all: keep the photo on the phone and read it later (outbox). */
  const isOffline = (code) => code === 'offline' || (code === 'network' && navigator.onLine === false);

  window.visionExtractor = { extract, status, errorTitle, isRetryable, isOffline, ExtractionError };
})();
