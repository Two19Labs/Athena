/**
 * Row highlight for register photos.
 *
 * The AI's row boxes on a multi-row register are roughly evenly spaced guesses, so on a long page the
 * highlight drifts by a row or more towards the bottom. The printed table has ruled lines, though:
 * find them in the photo, then map sheet row k to the k-th band below the band the AI put row 1 in.
 * If the lines cannot be found cleanly, the AI's box is used and labelled approximate.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AplydRowSnap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Horizontal ruled lines in a grayscale image.
   * @param gray Uint8Array (w*h), x0/x1/yTop: pixel range to look in
   * @returns { lines: [y at the centre column], slope } or null
   */
  function findLines(gray, w, h, x0, x1, yTop) {
    x0 = Math.max(0, Math.floor(x0)); x1 = Math.min(w - 1, Math.ceil(x1));
    const span = x1 - x0;
    if (span < 50) return null;
    // A ruled line is a thin dark ridge: darker than the paper a few pixels above and below it.
    // Comparing with neighbours (not a global threshold) copes with dim and uneven lighting.
    const d = 3;
    const ridge = new Uint8Array(w * h);
    for (let y = Math.max(d, yTop); y < h - d; y++) {
      for (let x = x0; x <= x1; x++) {
        const g = gray[y * w + x];
        if (g + 14 < gray[(y - d) * w + x] && g + 14 < gray[(y + d) * w + x]) ridge[y * w + x] = 1;
      }
    }
    // Phones are rarely held square: try small tilts and keep the one that makes the lines sharpest.
    const xc = (x0 + x1) / 2;
    let best = null;
    for (let deg = -6; deg <= 6; deg += 0.5) {
      const s = Math.tan(deg * Math.PI / 180);
      const prof = new Float32Array(h);
      for (let x = x0; x <= x1; x += 2) {
        const off = s * (x - xc);
        for (let y = yTop; y < h; y++) {
          if (!ridge[y * w + x]) continue;
          const yy = Math.round(y - off);
          if (yy >= 0 && yy < h) prof[yy]++;
        }
      }
      let energy = 0;
      for (let y = 0; y < h; y++) energy += prof[y] * prof[y];
      if (!best || energy > best.energy) best = { energy, prof, s };
    }
    // Smooth over 3 px (a line can straddle two rows of pixels), then keep strong peaks.
    const p = best.prof, sm = new Float32Array(h);
    for (let y = 1; y < h - 1; y++) sm[y] = (p[y - 1] + p[y] + p[y + 1]);
    const need = 0.3 * (span / 2);
    const peaks = [];
    for (let y = 2; y < h - 2; y++) {
      if (sm[y] >= need && sm[y] >= sm[y - 1] && sm[y] > sm[y + 1] && sm[y] >= sm[y - 2] && sm[y] >= sm[y + 2]) {
        if (peaks.length && y - peaks[peaks.length - 1].y < 8) {
          if (sm[y] > peaks[peaks.length - 1].v) peaks[peaks.length - 1] = { y, v: sm[y] };
        } else peaks.push({ y, v: sm[y] });
      }
    }
    return { lines: peaks.map(q => q.y), slope: best.s };
  }

  /**
   * The table's row rules among the detected lines: the longest chain of lines whose spacing changes
   * smoothly from one row to the next. This skips doubled rules, handwriting strokes and the odd
   * header line, and allows for perspective (rows get taller towards the camera on an angled photo).
   */
  function tableRules(lines, h) {
    const n = lines.length;
    const minGap = h * 0.02, maxGap = h * 0.15;
    // best[i][j]: longest chain ending with the step lines[j] -> lines[i]
    const best = Array.from({ length: n }, () => new Array(n).fill(0));
    const prev = Array.from({ length: n }, () => new Array(n).fill(-1));
    let top = null;
    for (let i = 1; i < n; i++) {
      for (let j = 0; j < i; j++) {
        const g = lines[i] - lines[j];
        if (g < minGap || g > maxGap) continue;
        best[i][j] = 2;
        for (let k = 0; k < j; k++) {
          if (!best[j][k]) continue;
          const r = g / (lines[j] - lines[k]);
          if (r >= 0.8 && r <= 1.25 && best[j][k] + 1 > best[i][j]) { best[i][j] = best[j][k] + 1; prev[i][j] = k; }
        }
        if (!top || best[i][j] > top.len) top = { len: best[i][j], i, j };
      }
    }
    if (!top) return [];
    const chain = [lines[top.i]];
    let i = top.i, j = top.j;
    while (j >= 0) { chain.unshift(lines[j]); const k = prev[i][j]; i = j; j = k; }
    // Grow the chain one row at a time at both ends, expecting each row to be about as tall as its
    // neighbour (a little shorter going up an angled photo, a little taller going down).
    const pick = (from, ref, dir) => {
      const want = from + dir * ref * (dir < 0 ? 0.95 : 1.05);
      const ok = lines.filter(y => { const g = (y - from) * dir; return g >= ref * 0.75 && g <= ref * 1.3; });
      return ok.length ? ok.reduce((a, b) => (Math.abs(a - want) <= Math.abs(b - want) ? a : b)) : null;
    };
    for (let y; chain.length >= 2 && (y = pick(chain[0], chain[1] - chain[0], -1)) !== null;) chain.unshift(y);
    for (let y; chain.length >= 2 && (y = pick(chain[chain.length - 1], chain[chain.length - 1] - chain[chain.length - 2], 1)) !== null;) chain.push(y);
    return chain;
  }

  /**
   * @param gray, w, h  grayscale photo
   * @param boxes       the AI's row boxes for every entry on the sheet, [ymin, xmin, ymax, xmax] 0-1000, in sheet order
   * @param index       0-based row to locate
   * @returns { box, snapped: true } on success, else { box: boxes[index], snapped: false }
   */
  function snapRow(gray, w, h, boxes, index) {
    const fallback = { box: boxes[index] || null, snapped: false };
    const fail = (why, extra) => ({ ...fallback, why, ...extra });
    if (!boxes.length || !boxes[index] || boxes.some(b => !b)) return fail('no row boxes');
    const toPx = (v, size) => (v / 1000) * size;
    const xs0 = Math.min(...boxes.map(b => b[1])), xs1 = Math.max(...boxes.map(b => b[3]));
    // Rows run across the page; a sideways photo (rows taller than wide) is left to the AI box.
    if (boxes.some(b => (b[3] - b[1]) * w < (b[2] - b[0]) * h)) return fail('rows are not horizontal');
    // Look at the middle half of the table: perspective bends rules less there, and it skips the vertical borders.
    const inset = (xs1 - xs0) * 0.25;
    const top = toPx(Math.max(0, boxes[0][0] - 120), h);
    const found = findLines(gray, w, h, toPx(xs0 + inset, w), toPx(xs1 - inset, w), Math.floor(top));
    if (!found || found.lines.length < 3) return fail('no ruled lines found');
    const lines = tableRules(found.lines, h);
    if (lines.length < 3) return fail('no regular table rules');
    const gaps = lines.slice(1).map((y, i) => y - lines[i]);
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const bands = gaps.map((_, i) => [lines[i], lines[i + 1]]);
    const c0 = toPx((boxes[0][0] + boxes[0][2]) / 2, h);
    let b0 = -1, bestDist = Infinity;
    bands.forEach((b, i) => { const dd = Math.abs((b[0] + b[1]) / 2 - c0); if (dd < bestDist) { bestDist = dd; b0 = i; } });
    if (b0 < 0 || bestDist > median * 1.2) return fail(`row 1 is not near a table row (${Math.round(bestDist)}px off)`, { lines, raw: found.lines, slope: found.slope });
    // The bands from row 1 down must be contiguous, one per entry, or the mapping cannot be trusted.
    const run = bands.slice(b0, b0 + boxes.length);
    if (run.length < boxes.length) return fail(`found ${run.length} table rows below row 1, need ${boxes.length}`);
    const band = run[index];
    // The band is measured at the table's centre column; widen it by the tilt so the whole row fits.
    const xcPx = toPx((xs0 + xs1) / 2, w);
    const b = boxes[index];
    const tilt = Math.abs(found.slope) * Math.max(Math.abs(toPx(b[1], w) - xcPx), Math.abs(toPx(b[3], w) - xcPx));
    const y0 = Math.max(0, band[0] - tilt), y1 = Math.min(h, band[1] + tilt);
    return { box: [Math.round(y0 / h * 1000), b[1], Math.round(y1 / h * 1000), b[3]], snapped: true, lines, slope: found.slope };
  }

  /** Browser helper: grayscale pixels of an <img>, scaled to at most 1000 px wide. */
  function grayFromImage(img) {
    const scale = Math.min(1, 1000 / img.naturalWidth);
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    return { gray, w, h };
  }

  return { findLines, tableRules, snapRow, grayFromImage };
});
