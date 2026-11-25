/**
 * APLYD - Shared domain rules.
 *
 * One module, loaded both in the browser (window.AplydRules) and by the
 * serverless functions (require). It owns:
 *   - the field contract (which fields exist, which are required)
 *   - normalisation of raw model output into the 5-state contract
 *   - business-rule validation of a production record
 *   - the ERP payload shape and its validation
 *
 * Keeping these in one place means the server and the review UI can never
 * disagree about what "valid" means.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AplydRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUSES = ['read', 'uncertain', 'missing', 'illegible', 'invalid'];

  // key: field key in the extraction contract
  // recordKey: column on the production record
  const FIELD_DEFS = [
    { key: 'machine', recordKey: 'machine_id', label: 'Machine / Loom ID', type: 'machine', required: true, section: 1 },
    { key: 'production_date', recordKey: 'production_date', label: 'Production Date', type: 'date', required: true, section: 1 },
    { key: 'shift', recordKey: 'shift_id', label: 'Shift', type: 'shift', required: true, section: 1 },
    { key: 'production_quantity', recordKey: 'production_quantity', label: 'Production Quantity', type: 'number', required: true, section: 2 },
    { key: 'production_unit', recordKey: 'production_unit', label: 'Unit', type: 'unit', required: false, section: 2 },
    { key: 'material_reference', recordKey: 'material_reference', label: 'Material / Fabric Sort', type: 'text', required: false, section: 2 },
    { key: 'batch_reference', recordKey: 'batch_reference', label: 'Batch / Lot Ref', type: 'text', required: false, section: 2 },
    { key: 'defects_count', recordKey: 'defects_count', label: 'Defects Count', type: 'integer', required: false, section: 3 },
    { key: 'defect_details', recordKey: 'defect_details', label: 'Defect Details', type: 'text', required: false, section: 3 },
    { key: 'downtime_minutes', recordKey: 'downtime_minutes', label: 'Downtime (minutes)', type: 'duration', required: false, section: 3 },
    { key: 'downtime_reason', recordKey: 'downtime_reason', label: 'Downtime Reason', type: 'text', required: false, section: 3 },
    { key: 'remarks', recordKey: 'remarks', label: 'Operator Remarks', type: 'text', required: false, section: 3 }
  ];

  const THRESHOLDS = {
    highDefects: 5,          // defects per shift that warrant a warning
    implausibleDefects: 10,  // more than this in one shift is almost certainly a misread (e.g. a 2 written over a 3 read as 32)
    highDowntimeMinutes: 120 // downtime per shift that warrants a warning
  };

  /**
   * Downtime reason list (admin-editable copy lives in the store). Handwritten reasons are
   * matched to a code so reports and the ERP group "Loom cleaning" and "safai" together.
   */
  const DEFAULT_DOWNTIME_REASONS = [
    { code: 'CLEAN', name: 'Cleaning', synonyms: ['clean', 'cleaning', 'loom cleaning', 'safai', 'saaf', 'saf safai', 'dusting', 'सफाई', 'साफ सफाई'] },
    { code: 'BEAM', name: 'Beam change / knotting', synonyms: ['beam', 'beam change', 'beam knotting', 'knotting', 'gaiting', 'beam gaiting', 'tying', 'बीम', 'बीम बदलना', 'बीम बदली'] },
    { code: 'BREAK', name: 'Warp / weft break', synonyms: ['warp break', 'weft break', 'thread break', 'yarn break', 'end break', 'breakage', 'dhaga', 'dhaga tuta', 'taar', 'धागा', 'धागा टूटा', 'तार टूटा'] },
    { code: 'PIRN', name: 'Pirn / bobbin change', synonyms: ['pirn', 'pirn change', 'bobbin', 'bobbin change', 'cop change'] },
    { code: 'POWER', name: 'Power cut', synonyms: ['power', 'power cut', 'power failure', 'no power', 'light', 'light gayi', 'light cut', 'bijli', 'electricity', 'load shedding', 'लाइट', 'लाइट गई', 'बिजली', 'बिजली गई'] },
    { code: 'MAINT', name: 'Maintenance / repair', synonyms: ['maintenance', 'repair', 'breakdown', 'mechanical', 'lubrication', 'oiling', 'greasing', 'motor', 'belt', 'mistri', 'fitter', 'मरम्मत', 'मिस्त्री', 'मशीन खराब'] },
    { code: 'WAIT', name: 'Waiting for yarn / material', synonyms: ['no yarn', 'yarn shortage', 'waiting', 'waiting for yarn', 'no material', 'material shortage', 'maal nahi', 'माल नहीं', 'धागा नहीं'] },
    { code: 'SHUTTLE', name: 'Shuttle change', synonyms: ['shuttle', 'shuttle change', 'shuttle changed', 'shuttle replaced'] }
  ];
  const OTHER_REASON = { code: 'OTHER', name: 'Other' };

  const UNIT_ALIASES = {
    metres: ['m', 'mt', 'mtr', 'mtrs', 'meter', 'meters', 'metre', 'metres', 'mts'],
    yards: ['y', 'yd', 'yds', 'yard', 'yards'],
    picks: ['pick', 'picks', 'kpicks']
  };

  // ---------------------------------------------------------------------------
  // Small parsers
  // ---------------------------------------------------------------------------
  function isBlank(v) {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }

  function cleanText(v) {
    if (isBlank(v)) return null;
    return String(v).replace(/\s+/g, ' ').trim();
  }

  /**
   * "Loom 12", "L12", "l-12", "Loom No. 7", "12" -> "L-12" (zero padded).
   * Strict: anything else ("L-1O", "L-12A", "Loom l2") returns null so it is
   * flagged instead of being silently read as a different loom.
   */
  function normalizeMachineCode(v) {
    if (isBlank(v)) return null;
    const s = String(v).toUpperCase().trim();
    const m = s.match(/^(?:L|LOOM)?\s*(?:NO\.?|NUMBER)?\s*[-#:.]?\s*(\d{1,3})$/);
    return m ? 'L-' + String(Number(m[1])).padStart(2, '0') : null;
  }

  function matchShift(v, shifts) {
    if (isBlank(v)) return null;
    const s = String(v).trim().toLowerCase();
    for (const sh of shifts) {
      const code = String(sh.shift_code).toLowerCase();
      const name = String(sh.name || '').toLowerCase();
      if (s === code || s === name || s === name.replace(/\s*shift$/, '')) return sh;
      if (name && (s.startsWith(name.slice(0, 3)) && s.length >= 3)) return sh;
    }
    // single letter or "shift m"
    const letter = s.replace(/shift/g, '').replace(/[^a-z]/g, '');
    if (letter.length === 1) return shifts.find(sh => String(sh.shift_code).toLowerCase() === letter) || null;
    return null;
  }

  /**
   * Accepts numbers, "425", "425 m", "1,250.5 mtrs". Strict: "3S0", "1,2O0",
   * "350 / 850" return null (flagged) instead of a silently truncated number.
   */
  function parseNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (isBlank(v)) return null;
    const s = String(v).trim().replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
    const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:[a-z]{1,8}\.?)?$/i);
    return m ? Number(m[1]) : null;
  }

  /** "45", "45 min", "2 hrs", "1.5 hrs", "1h 30m", "1h30", "1 hr 15 min", "1:30" -> minutes. Unclear text -> null. */
  function parseDurationMinutes(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (isBlank(v)) return null;
    const s = String(v).toLowerCase().trim().replace(/\s+/g, ' ');
    let m = s.match(/^(\d+)\s*:\s*(\d{1,2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    m = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\.?(?:\s*(?:and\s*)?(\d{1,2})\s*(?:m|min|mins|minute|minutes)?\.?)?$/);
    if (m) return Math.round(Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0));
    m = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)?\.?$/);
    return m ? Math.round(Number(m[1])) : null;
  }

  function normalizeUnit(v) {
    if (isBlank(v)) return null;
    const s = String(v).trim().toLowerCase().replace(/\.$/, '');
    for (const [unit, aliases] of Object.entries(UNIT_ALIASES)) {
      if (aliases.includes(s)) return unit;
    }
    return null;
  }

  function isoDate(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /**
   * Indian shop-floor convention: day first. Accepts YYYY-MM-DD, DD/MM/YYYY,
   * DD-MM-YY, DD.MM.YYYY. Returns { iso, ambiguous } or null.
   * "ambiguous" = both day and month <= 12 and they differ, and the source
   * was not already ISO; we still read it day-first (documented assumption).
   */
  function parseDate(v) {
    if (isBlank(v)) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (m) {
      const iso = isoDate(+m[1], +m[2], +m[3]);
      return iso ? { iso, ambiguous: false } : null;
    }
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.]+([a-z]{3,9})[\s\-\/.,]+(\d{2}|\d{4})$/i);
    if (m) {
      const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
      if (mon === -1) return null;
      let y = +m[3];
      if (y < 100) y += 2000;
      const iso = isoDate(y, mon + 1, +m[1]);
      return iso ? { iso, ambiguous: false } : null;
    }
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      const iso = isoDate(y, +m[2], +m[1]);
      if (!iso) return null;
      return { iso, ambiguous: +m[1] <= 12 && +m[2] <= 12 && m[1] !== m[2] };
    }
    return null;
  }

  /** Local calendar date (not UTC) as YYYY-MM-DD; also converts ISO timestamps to the local day. */
  function todayIso(now) {
    const d = now ? new Date(now) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Letters in any script (Devanagari, Gujarati, ...) and digits; everything else becomes a space.
  const normText = (v) => String(v || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

  /**
   * Map a handwritten downtime reason to the reason list. Exact name/synonym first, then the
   * longest synonym that appears as whole words. Returns the reason, or null if nothing matches.
   */
  function matchReason(text, reasons) {
    const s = normText(text);
    if (!s) return null;
    const list = (reasons || DEFAULT_DOWNTIME_REASONS).filter(r => r.is_active !== false);
    let best = null;
    let bestLen = 0;
    for (const r of list) {
      if (s === normText(r.code)) return r; // a code only counts when written on its own ("tea break" is not BREAK)
      const words = [r.name, ...(r.synonyms || [])].map(normText).filter(Boolean);
      for (const w of words) {
        if (s === w) return r;
        if (w.length > bestLen && (` ${s} `).includes(` ${w} `)) { best = r; bestLen = w.length; }
      }
    }
    return best;
  }

  /** Levenshtein similarity in [0, 1] on normalised text (for "did you mean" hints). */
  function similarity(a, b) {
    const x = normText(a).replace(/ /g, '');
    const y = normText(b).replace(/ /g, '');
    if (!x || !y) return 0;
    if (x === y) return 1;
    const prev = Array.from({ length: y.length + 1 }, (_, i) => i);
    for (let i = 1; i <= x.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= y.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return 1 - prev[y.length] / Math.max(x.length, y.length);
  }

  function editDistance(a, b) {
    const x = [...a], y = [...b];
    const prev = Array.from({ length: y.length + 1 }, (_, i) => i);
    for (let i = 1; i <= x.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= y.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return prev[y.length];
  }

  /**
   * Like matchReason, but a near-miss spelling also counts ("Pinn change", "Shuttlen Change",
   * "bean change"): within 2 letters of a known reason or synonym of 6+ letters.
   * @returns { reason, exact } or null
   */
  function resolveReason(text, reasons) {
    const exact = matchReason(text, reasons);
    if (exact) return { reason: exact, exact: true };
    const s = normText(text).replace(/ /g, '');
    if (s.length < 5) return null;
    let best = null;
    for (const r of (reasons || DEFAULT_DOWNTIME_REASONS).filter(x => x.is_active !== false)) {
      for (const w of [r.name, ...(r.synonyms || [])].map(t => normText(t).replace(/ /g, '')).filter(t => t.length >= 6)) {
        const d = editDistance(s, w);
        if (d <= 2 && (!best || d < best.d)) best = { reason: r, d };
      }
    }
    return best ? { reason: best.reason, exact: false } : null;
  }

  /** Fabric list used to catch near-miss readings like "Poplin 405" for "Poplin 40s". */
  const DEFAULT_FABRICS = ['Cambric', 'Poplin 40s', 'Combed Poplin', 'Denim 3/1', 'Oxford', 'Linen Blend', 'Voile 60s',
    'Sheeting 30s', 'Drill', 'Duck Canvas', 'Satin 50s', 'Yarn Dyed Check'];

  /**
   * A fabric that is not on the list but within 1-2 letters of one is almost certainly a misread
   * (or misspelling) of it. Returns that fabric, or null (exact match, or nothing close = a new fabric).
   */
  function nearFabric(text, fabrics) {
    const s = normText(text).replace(/ /g, '');
    if (!s) return null;
    const list = fabrics || DEFAULT_FABRICS;
    if (list.some(f => normText(f).replace(/ /g, '') === s)) return null;
    let best = null;
    for (const f of list) {
      const d = editDistance(s, normText(f).replace(/ /g, ''));
      if (d >= 1 && d <= 2 && (!best || d < best.d)) best = { fabric: f, d };
    }
    return best ? best.fabric : null;
  }

  /**
   * Lot / beam numbers: 3 letters, 2 digits, 3 digits (e.g. VOI-60-446). Handwritten codes are where
   * the AI's confident mistakes cluster: O vs 0, I vs 1 vs l, D vs O, S vs 5, a lost hyphen, or a
   * crossed-out start left in front. checkLot returns the problems and, when it can, the code with
   * look-alike characters put back in the right slots ("V01-60-446" -> "VOI-60-446").
   */
  const LOT_PREFIX_BY_FABRIC = [
    ['yarn dyed', 'YDC'], ['combed poplin', 'POP'], ['poplin', 'POP'], ['cambric', 'CMB'], ['denim', 'DEN'], ['oxford', 'OXF'],
    ['linen', 'LIN'], ['voile', 'VOI'], ['sheeting', 'SHT'], ['drill', 'DRL'], ['duck', 'DCK'], ['satin', 'SAT']
  ];
  const TO_LETTER = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z', 6: 'G' };
  const TO_DIGIT = { O: '0', D: '0', Q: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' };

  function expectedLotPrefix(material) {
    const m = normText(material);
    const hit = LOT_PREFIX_BY_FABRIC.find(([k]) => m.includes(k));
    return hit ? hit[1] : null;
  }

  function checkLot(value, material) {
    if (isBlank(value)) return { ok: true };
    const raw = String(value).trim();
    const pattern = /^[A-Z]{3}-\d{2}-\d{3}$/;
    // Take the part that looks like the code (a crossed-out start can leave a word in front of it).
    const tokens = raw.toUpperCase().split(/\s+/);
    const extra = tokens.length > 1;
    const core = tokens[tokens.length - 1];
    const chars = core.replace(/[^A-Z0-9]/g, '');
    let suggestion = null;
    if (chars.length === 8) {
      const letters = [...chars.slice(0, 3)].map(c => TO_LETTER[c] || c).join('');
      const digits = [...chars.slice(3)].map(c => TO_DIGIT[c] || c).join('');
      suggestion = `${letters}-${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    const expected = expectedLotPrefix(material);
    // A prefix one letter away from the fabric's usual one (OCK for Duck Canvas) is most likely that prefix.
    if (suggestion && expected && suggestion.slice(0, 3) !== expected && editDistance(suggestion.slice(0, 3), expected) === 1) {
      suggestion = expected + suggestion.slice(3);
    }
    if (suggestion && !pattern.test(suggestion)) suggestion = null;
    const problems = [];
    if (extra) problems.push('there is extra text in front of the code (a crossed-out start?)');
    if (!pattern.test(raw.toUpperCase())) problems.push('it does not match the usual format ABC-12-345');
    else if (expected && raw.slice(0, 3).toUpperCase() !== expected) problems.push(`the prefix does not match the fabric (${material} lots usually start ${expected})`);
    if (!problems.length && suggestion && suggestion !== raw.toUpperCase()) problems.push('some characters look like digits or letters in the wrong place');
    return { ok: problems.length === 0, problems, suggestion: suggestion && suggestion !== raw.toUpperCase() ? suggestion : null };
  }

  /**
   * A location on the photo as Gemini returns it: [ymin, xmin, ymax, xmax] on a 0-1000 scale.
   * Anything else (wrong length, out of range, zero area) is dropped rather than trusted.
   */
  function cleanBox(b) {
    // Some models wrap the box in an extra array: [[ymin, xmin, ymax, xmax]].
    if (Array.isArray(b) && b.length === 1 && Array.isArray(b[0])) b = b[0];
    if (!Array.isArray(b) || b.length !== 4) return null;
    const n = b.map(Number);
    if (n.some(v => !Number.isFinite(v) || v < 0 || v > 1000)) return null;
    const [y0, x0, y1, x1] = n;
    if (y1 - y0 < 3 || x1 - x0 < 3) return null;
    return n.map(v => Math.round(v));
  }

  // ---------------------------------------------------------------------------
  // Normalisation: raw model JSON -> 5-state contract
  // ---------------------------------------------------------------------------
  const FIELD_ALIASES = {
    machine: ['machine', 'machine_id', 'machine_code', 'loom', 'loom_id'],
    shift: ['shift', 'shift_code', 'shift_id']
  };

  function pickRawField(fields, key) {
    const names = FIELD_ALIASES[key] || [key];
    for (const n of names) if (fields && fields[n] && typeof fields[n] === 'object') return fields[n];
    return {};
  }

  /**
   * @param raw    parsed model JSON ({ fields: {...}, is_production_form, image_issues })
   * @param master { machines: [{machine_code, name, is_active}], shifts: [{shift_code, name}] , today? }
   * @returns contract { schema_version, overall_status, fields, image_issues }
   */
  function normalizeExtraction(raw, master) {
    const machines = (master && master.machines) || [];
    const shifts = (master && master.shifts) || [];
    const today = (master && master.today) || todayIso();
    const rawFields = (raw && raw.fields) || {};
    const out = {};

    for (const def of FIELD_DEFS) {
      const f = pickRawField(rawFields, def.key);
      let status = STATUSES.includes(f.status) ? f.status : null;
      let reason = cleanText(f.reason);
      const rawValue = isBlank(f.raw_value) ? (isBlank(f.value) ? null : String(f.value)) : String(f.raw_value);
      // Crossed-out writing is transcribed as ~~412~~ 421. The struck part is never the value; what is
      // left is (finalRaw). The code decides this, not the model.
      const struckParts = rawValue ? [...rawValue.matchAll(/~~([^~]*)~~/g)].map(m => m[1].trim()).filter(Boolean) : [];
      const finalRaw = struckParts.length ? (rawValue.replace(/~~[^~]*~~/g, ' ').replace(/\s+/g, ' ').trim() || null) : rawValue;
      let value = isBlank(f.value) ? null : f.value;
      if (typeof value === 'string' && value.includes('~~')) value = value.replace(/~~[^~]*~~/g, ' ').replace(/\s+/g, ' ').trim() || null;
      const source = value !== null ? value : finalRaw;

      const box = cleanBox(f.box);
      const struck = (f.struck_out === true || struckParts.length) ? { struck_out: true, ...(struckParts.length ? { struck: struckParts } : {}) } : {};
      const extra = def.key === 'downtime_reason' && !isBlank(f.meaning_en) ? { meaning: cleanText(f.meaning_en) } : {};
      if (status === 'missing' || (source === null && status !== 'illegible')) {
        out[def.key] = { value: null, raw_value: rawValue, status: status === 'illegible' ? 'illegible' : 'missing', reason, ...(box ? { box } : {}), ...struck, ...extra };
        continue;
      }
      if (!status) status = 'read';

      switch (def.type) {
        case 'machine': {
          const code = normalizeMachineCode(source);
          const match = code && machines.find(mc => mc.machine_code === code);
          if (match && match.is_active !== false) {
            value = match.machine_code;
          } else if (source !== null) {
            value = code;
            if (status !== 'illegible') {
              status = 'invalid';
              reason = reason || (match ? `Loom ${code} is marked inactive in the loom master.` : `"${rawValue}" does not match any loom in the loom master.`);
            }
          }
          break;
        }
        case 'shift': {
          const sh = matchShift(source, shifts);
          if (sh) value = sh.shift_code;
          else if (source !== null && status !== 'illegible') {
            value = null;
            status = 'invalid';
            reason = reason || `"${rawValue}" does not match a configured shift.`;
          }
          break;
        }
        case 'date': {
          const d = parseDate(source);
          if (!d) {
            if (status !== 'illegible') { status = 'invalid'; reason = reason || `Could not read "${rawValue}" as a date.`; }
            value = null;
          } else {
            value = d.iso;
            // Day-first is a documented assumption; we only flag dates the model itself was unsure of.
            if (d.iso > today) { status = 'invalid'; reason = `Date ${d.iso} is in the future.`; }
          }
          break;
        }
        case 'number':
        case 'integer': {
          const n = parseNumber(source);
          if (n === null) {
            if (status !== 'illegible') { status = 'invalid'; reason = reason || `"${rawValue}" is not a number.`; }
            value = null;
          } else if (n < 0) {
            status = 'invalid'; reason = 'Negative values are not allowed.'; value = n;
          } else {
            value = def.type === 'integer' ? Math.round(n) : n;
            if (def.type === 'integer' && n !== Math.round(n) && status === 'read') {
              status = 'uncertain'; reason = reason || `Expected a whole number, read "${rawValue}".`;
            }
          }
          break;
        }
        case 'duration': {
          const n = parseDurationMinutes(source);
          if (n === null) {
            if (status !== 'illegible') { status = 'invalid'; reason = reason || `"${rawValue}" is not a duration.`; }
            value = null;
          } else if (n < 0) {
            status = 'invalid'; reason = 'Negative values are not allowed.'; value = n;
          } else value = n;
          break;
        }
        case 'unit': {
          const u = normalizeUnit(source);
          if (u) value = u;
          else { value = null; if (status !== 'illegible') { status = 'uncertain'; reason = reason || `Unrecognised unit "${rawValue}".`; } }
          break;
        }
        default:
          value = cleanText(source);
          if (value === null && status === 'read') status = 'missing';
      }

      // The model's own transcription and its value must agree. If it wrote down "850" but returned
      // 350 (or the other way round), it is unsure whichever it says: flag it, never trust either silently.
      const parseAs = (t) => (t === null ? null : def.type === 'duration' ? parseDurationMinutes(t)
        : (def.type === 'number' || def.type === 'integer') ? parseNumber(t)
          : def.type === 'date' ? (parseDate(t) || {}).iso || null : undefined);
      if (status === 'read' && value !== null && finalRaw !== null) {
        const fromRaw = parseAs(finalRaw);
        if (fromRaw !== undefined && fromRaw !== null && !sameValue(fromRaw, value)) {
          status = 'uncertain';
          reason = `The AI transcribed "${rawValue}" but read the value as ${value}; check the photo.`;
        }
      }

      // The model picked the crossed-out value: use what was written instead, and make a person check.
      let alt;
      if (struckParts.length && value !== null) {
        const hit = struckParts.some(t => { const v = parseAs(t); return v === undefined ? normText(t) === normText(value) : v !== null && sameValue(v, value); });
        if (hit) {
          const fromFinal = parseAs(finalRaw);
          const replacement = fromFinal === undefined ? cleanText(finalRaw) : fromFinal;
          alt = value;
          if (replacement !== null && replacement !== undefined) value = replacement;
          status = 'uncertain';
          reason = `"${struckParts.join('", "')}" is crossed out on the paper${finalRaw ? ` and "${finalRaw}" written instead` : ''}. Check which one is final.`;
        }
      }

      // A fabric name the model was unsure of, but which exactly matches a known fabric, is not a misread.
      if (def.key === 'material_reference' && status === 'uncertain' && !struckParts.length && value !== null) {
        const known = [...DEFAULT_FABRICS, ...((master && master.fabrics) || [])];
        if (known.some(k => normText(k).replace(/ /g, '') === normText(value).replace(/ /g, ''))) {
          status = 'read';
          reason = `The AI was unsure, but "${value}" exactly matches a known fabric.`;
        }
      }

      out[def.key] = { value, raw_value: rawValue, status, reason: reason || null, ...(box ? { box } : {}), ...struck, ...extra, ...(alt !== undefined ? { alt } : {}) };
    }

    const needsReview = FIELD_DEFS.some(def => {
      const f = out[def.key];
      if (['uncertain', 'illegible', 'invalid'].includes(f.status)) return true;
      return def.required && f.status !== 'read';
    });

    const rowBox = cleanBox(raw && raw.row_box) || rowBoxFromFields(out);
    return {
      schema_version: '2.0',
      overall_status: needsReview ? 'needs_review' : 'ready_for_approval',
      image_issues: Array.isArray(raw && raw.image_issues) ? raw.image_issues.map(String).slice(0, 10) : [],
      ...(rowBox ? { row_box: rowBox } : {}),
      fields: out
    };
  }

  /**
   * No row box from the model: outline the row from its field boxes. Boxes far from the row's
   * median height (e.g. a unit printed in the column header) are left out.
   */
  function rowBoxFromFields(fields) {
    const boxes = Object.values(fields).map(f => f.box).filter(Boolean);
    if (boxes.length < 3) return null;
    const mids = boxes.map(b => (b[0] + b[2]) / 2).sort((a, b) => a - b);
    const median = mids[Math.floor(mids.length / 2)];
    const inRow = boxes.filter(b => Math.abs((b[0] + b[2]) / 2 - median) <= 40);
    if (inRow.length < 3) return null;
    return cleanBox([Math.min(...inRow.map(b => b[0])), Math.min(...inRow.map(b => b[1])), Math.max(...inRow.map(b => b[2])), Math.max(...inRow.map(b => b[3]))]);
  }

  const MAX_ENTRIES = 30;

  /**
   * Corrections check. `audit` is a second, narrow reading of the same photo (often with enlarged
   * crops): every crossed-out / overwritten value with its final value, and every number and lot
   * re-read character by character. Applied to the normalised main sheet in place:
   *  - the main read used the crossed-out value  -> switch to the final value, needs a check
   *  - a correction or re-read disagrees          -> needs a check, other value offered as `alt`
   *  - a lot the AI was unsure of, re-read the same -> not flagged (numbers always keep their flag)
   * @returns { corrections, compared, disagreed: [{ row, field, main, audit }] }
   */
  function applyAudit(main, audit) {
    const disagreed = [];
    let compared = 0, corrections = 0;
    const entries = (audit && Array.isArray(audit.entries)) ? audit.entries.filter(e => e && typeof e === 'object') : [];
    const loom = e => e.fields.machine && e.fields.machine.value;
    const parseFor = (def, t) => {
      if (isBlank(t)) return null;
      if (def.type === 'duration') return parseDurationMinutes(t);
      if (def.type === 'number' || def.type === 'integer') return parseNumber(t);
      if (def.type === 'date') return (parseDate(t) || {}).iso || null;
      return cleanText(t);
    };
    const same = (def, a, b) => (def.type === 'text' || def.type === 'machine' || def.type === 'shift')
      ? normText(a).replace(/ /g, '') === normText(b).replace(/ /g, '') : sameValue(a, b);
    const flag = (row, def, fa, alt, why) => {
      if (!isBlank(alt) && !same(def, alt, fa.value)) fa.alt = alt;
      fa.status = 'uncertain';
      fa.reason = why;
      fa.second_read_disagrees = true;
      disagreed.push({ row, field: def.key, main: fa.value, audit: alt });
    };
    main.entries.forEach((a, i) => {
      a.double_checked = true;
      const b = entries.find(e => normalizeMachineCode(e.machine) && normalizeMachineCode(e.machine) === loom(a)) ||
        (entries.length === main.entries.length ? entries[i] : null);
      if (!b) return;
      for (const c of (Array.isArray(b.corrections) ? b.corrections : [])) {
        const def = FIELD_DEFS.find(d => d.key === (c && c.field));
        const fa = def && a.fields[def.key];
        if (!fa || fa.not_on_form) continue;
        corrections++;
        const finalV = parseFor(def, c.final), struckV = parseFor(def, c.struck);
        fa.struck_out = true;
        if (!isBlank(c.struck)) fa.struck = [...new Set([...(fa.struck || []), String(c.struck)])];
        if (struckV !== null && fa.value !== null && same(def, fa.value, struckV) && finalV !== null && !same(def, finalV, struckV)) {
          const was = fa.value;
          fa.value = finalV;
          flag(i + 1, def, fa, was, `"${c.struck}" is crossed out on the paper and "${c.final}" written instead (found by the second reading). Check which one is final.`);
        } else if (finalV !== null && !same(def, fa.value, finalV)) {
          flag(i + 1, def, fa, finalV, `The second reading says "${c.struck}" is crossed out and the final value is "${c.final}". Check the photo.`);
        }
      }
      const reread = (b.reread && typeof b.reread === 'object') ? b.reread : {};
      for (const [key, t] of Object.entries(reread)) {
        const def = FIELD_DEFS.find(d => d.key === key);
        const fa = def && a.fields[def.key];
        if (!fa || fa.not_on_form || fa.second_read_disagrees) continue;
        const v = parseFor(def, t);
        if (v === null) continue;
        compared++;
        if (fa.value === null || !same(def, fa.value, v)) {
          flag(i + 1, def, fa, v, `A second, closer reading gave "${t}". Check the photo.`);
        } else if (def.key === 'batch_reference' && fa.status === 'uncertain') {
          fa.status = 'read';
          fa.reason = 'The AI was unsure, but a second, closer reading agreed.';
        }
      }
      a.overall_status = FIELD_DEFS.some(d => ['uncertain', 'illegible', 'invalid'].includes(a.fields[d.key].status) ||
        (d.required && a.fields[d.key].status !== 'read')) ? 'needs_review' : 'ready_for_approval';
    });
    return { corrections, compared, disagreed };
  }

  /**
   * The downtime reason code for a record: its text, or (for a reason written in Hindi or another
   * script the AI misread) the English meaning the AI gave for the original text.
   */
  function reasonOf(record, reasons) {
    const text = record && record.downtime_reason;
    if (isBlank(text)) return null;
    const direct = resolveReason(text, reasons);
    if (direct) return { ...direct, via: 'text' };
    const f = record.final_payload && record.final_payload.fields && record.final_payload.fields.downtime_reason;
    if (f && f.meaning && sameValue(f.value, text)) {
      const m = resolveReason(f.meaning, reasons);
      if (m) return { reason: m.reason, exact: false, via: 'meaning', meaning: f.meaning };
    }
    return null;
  }

  /**
   * Second opinion. `main` and `second` are normalised sheets of the same photo from two different
   * models. Every field where they disagree is marked "uncertain" in `main` (so approval waits for a
   * person) and the other reading is kept as `alt` for a one-tap choice. Entries are matched by loom
   * number, falling back to position when the two readings found the same number of rows.
   * @returns { compared, disagreed: [{ row, field, main, second }] }
   */
  function compareReadings(main, second) {
    const disagreed = [];
    let compared = 0;
    const loom = e => e.fields.machine && e.fields.machine.value;
    const norm = v => normText(v).replace(/ /g, '');
    main.entries.forEach((a, i) => {
      const b = second.entries.find(e => loom(e) && loom(e) === loom(a)) ||
        (second.entries.length === main.entries.length ? second.entries[i] : null);
      if (!b) return;
      for (const def of FIELD_DEFS) {
        if (def.key === 'production_unit') continue; // often only implied by a column header
        const fa = a.fields[def.key], fb = b.fields[def.key];
        if (!fa || !fb || fa.not_on_form || fb.not_on_form) continue;
        compared++;
        const va = fa.value, vb = fb.value;
        let differs;
        if (isBlank(va) || isBlank(vb)) differs = isBlank(va) !== isBlank(vb);
        else if (def.type === 'text') differs = similarity(norm(va), norm(vb)) < 0.8; // small wording differences are not a misread
        else differs = norm(va) !== norm(vb);
        if (!differs) continue;
        disagreed.push({ row: i + 1, field: def.key, main: va, second: vb });
        if (!isBlank(vb)) fa.alt = vb;
        if (fa.status === 'read' || fa.status === 'missing') {
          fa.status = 'uncertain';
          fa.reason = `A second AI reading gave ${isBlank(vb) ? 'nothing (blank)' : `"${fb.raw_value || vb}"`}. Check the photo.`;
        }
        fa.second_read_disagrees = true;
      }
      a.overall_status = FIELD_DEFS.some(d => ['uncertain', 'illegible', 'invalid'].includes(a.fields[d.key].status) ||
        (d.required && a.fields[d.key].status !== 'read')) ? 'needs_review' : a.overall_status;
    });
    return { compared, disagreed };
  }

  function isBlankField(f) {
    return !f || typeof f !== 'object' || (isBlank(f.value) && isBlank(f.raw_value) && f.status !== 'illegible');
  }

  /**
   * A photo can hold one slip or a multi-row register page. Normalise either shape:
   *   { fields }                          legacy single entry
   *   { header, entries: [ {...}, ... ] } one or more entries; header values fill gaps in each entry
   * Completely blank entries are dropped. If the model says it saw more filled rows than it
   * returned (or there are more than MAX_ENTRIES), `incomplete` is set so the UI can warn.
   * @returns { schema_version, image_issues, rows_detected, incomplete, entries: [contract] }
   */
  function normalizeSheet(raw, master) {
    const header = (raw && raw.header && typeof raw.header === 'object') ? raw.header : {};
    const rawEntries = Array.isArray(raw && raw.entries) ? raw.entries.filter(e => e && typeof e === 'object')
      : (raw && raw.fields && typeof raw.fields === 'object' ? [raw.fields] : []);

    // Decide emptiness from the row's OWN content first; only then fill gaps from the header.
    // (Merging first would turn blank ledger lines into phantom records full of header values.)
    const merged = rawEntries
      .filter(entry => FIELD_DEFS.some(def => !isBlankField(pickRawField(entry, def.key))))
      .map(entry => {
        const out = { ...entry };
        for (const [key, hf] of Object.entries(header)) {
          if (isBlankField(out[key]) && !isBlankField(hf)) out[key] = hf;
        }
        return out;
      });

    const kept = merged.slice(0, MAX_ENTRIES);
    const detected = Number.isInteger(raw && raw.rows_detected) && raw.rows_detected > 0 ? raw.rows_detected : merged.length;
    const issues = Array.isArray(raw && raw.image_issues) ? raw.image_issues.map(String).slice(0, 10) : [];
    const entries = kept.map(fields => normalizeExtraction({ fields, image_issues: issues, row_box: fields.row_box }, master));

    // Fields the paper has no place for (e.g. a register with no "defect type" column) are
    // "not on form", not "left blank": no warnings about them. Known from the model's
    // fields_on_form list, or, on a sheet of 3+ rows, from the field being empty on every row.
    const listed = Array.isArray(raw && raw.fields_on_form) ? raw.fields_on_form.map(String) : null;
    const known = listed && listed.some(k => FIELD_DEFS.some(d => d.key === k)) ? listed : null;
    for (const def of FIELD_DEFS) {
      const blankEverywhere = entries.every(e => e.fields[def.key].status === 'missing');
      const absent = known ? !known.includes(def.key) : (entries.length >= 3 && blankEverywhere);
      if (absent && blankEverywhere && !def.required) {
        entries.forEach(e => { e.fields[def.key].not_on_form = true; e.fields[def.key].reason = 'No space for this on the form.'; });
      }
    }
    return {
      schema_version: '2.1',
      image_issues: issues,
      rows_detected: Math.max(detected, merged.length),
      incomplete: detected > kept.length || merged.length > kept.length,
      entries
    };
  }

  // ---------------------------------------------------------------------------
  // Record validation (business rules)
  // ---------------------------------------------------------------------------
  function fieldStatus(record, def) {
    const f = record.final_payload && record.final_payload.fields && record.final_payload.fields[def.key];
    return f ? f.status : null;
  }

  const sameValue = (a, b) => String(a === null || a === undefined ? '' : a) === String(b === null || b === undefined ? '' : b);

  /**
   * A person has looked at this field's CURRENT value: they typed it (correction), or
   * confirmed / checked it against the photo. An "undo" back to the AI value does not count.
   */
  function isFieldResolved(record, def) {
    const key = def.recordKey || def;
    return (record.corrections || []).some(c => c.field_key === key && c.kind !== 'undo' && sameValue(c.corrected_value, record[key]));
  }

  /**
   * Did a person end up changing this field's value? Compares the value before the first edit with
   * the value after the last one, so a change that was undone does not count.
   */
  function humanChanged(record, key) {
    const edits = (record.corrections || []).filter(c => c.field_key === key && (c.kind === 'correction' || c.kind === 'undo'));
    if (!edits.length) return false;
    return !sameValue(edits[0].original_value, edits[edits.length - 1].corrected_value);
  }

  /** Field has a place on the paper (false for e.g. defect details on a register with no such column). */
  function onForm(record, key) {
    const def = FIELD_DEFS.find(d => d.recordKey === key);
    const f = def && record.final_payload && record.final_payload.fields && record.final_payload.fields[def.key];
    return !(f && f.not_on_form);
  }

  /** Fields the model flagged and a human has not yet corrected or confirmed. */
  function unresolvedFlags(record) {
    return FIELD_DEFS.filter(def => {
      const st = fieldStatus(record, def);
      if (!st || st === 'read') return false;
      if (st === 'missing' && !def.required) return false; // blank optional field is a valid outcome
      return !isFieldResolved(record, def);
    });
  }

  function minutesBetween(start, end) {
    if (!start || !end) return null;
    const [sh, sm] = String(start).split(':').map(Number);
    const [eh, em] = String(end).split(':').map(Number);
    if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return null;
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60; // overnight shift
    return diff;
  }

  /**
   * @returns { blockers: [{field, message}], warnings: [{field, message}] }
   * ctx: { machines, shifts, records, today }
   */
  function validateRecord(record, ctx) {
    const machines = (ctx && ctx.machines) || [];
    const shifts = (ctx && ctx.shifts) || [];
    const records = (ctx && ctx.records) || [];
    const today = (ctx && ctx.today) || todayIso();
    const blockers = [];
    const warnings = [];

    for (const def of FIELD_DEFS.filter(d => d.required)) {
      if (isBlank(record[def.recordKey])) blockers.push({ field: def.recordKey, message: `${def.label} is required.` });
    }

    for (const def of unresolvedFlags(record)) {
      const st = fieldStatus(record, def);
      blockers.push({ field: def.recordKey, message: `${def.label} was flagged "${st}" by the AI. Correct it or confirm it against the photo.` });
    }

    const machine = machines.find(m => m.id === record.machine_id);
    if (record.machine_id && !machine) blockers.push({ field: 'machine_id', message: 'Selected loom no longer exists in the loom master.' });
    if (machine && machine.is_active === false) blockers.push({ field: 'machine_id', message: `Loom ${machine.machine_code} is inactive.` });

    const shift = shifts.find(s => s.id === record.shift_id);
    if (record.shift_id && !shift) blockers.push({ field: 'shift_id', message: 'Selected shift no longer exists.' });

    if (record.production_date && record.production_date > today) {
      blockers.push({ field: 'production_date', message: 'Production date is in the future.' });
    }

    for (const key of ['production_quantity', 'defects_count', 'downtime_minutes']) {
      const v = record[key];
      if (!isBlank(v) && (Number.isNaN(Number(v)) || Number(v) < 0)) {
        blockers.push({ field: key, message: `${FIELD_DEFS.find(d => d.recordKey === key).label} must be zero or a positive number.` });
      }
    }

    // "Check required": the value is plausible but suspicious. Approval waits until a person has
    // either corrected the value or ticked "I checked this against the photo" for its current value.
    const needsCheck = (field, message) => {
      if (isFieldResolved(record, field)) return;
      blockers.push({ field, message, check: true });
    };

    const qty = isBlank(record.production_quantity) ? null : Number(record.production_quantity);
    const unit = record.production_unit || 'metres';
    if (machine && qty !== null && unit === (machine.default_unit || 'metres')) {
      if (machine.max_expected_quantity && qty > machine.max_expected_quantity) {
        needsCheck('production_quantity', `${qty} ${unit} is above the expected maximum for ${machine.machine_code} (${machine.max_expected_quantity}). Check the photo for a misread digit.`);
      } else if (machine.min_expected_quantity && qty < machine.min_expected_quantity && qty > 0) {
        needsCheck('production_quantity', `${qty} ${unit} is below the expected minimum for ${machine.machine_code} (${machine.min_expected_quantity}). Check the photo for a misread digit.`);
      }
    }

    const downtime = isBlank(record.downtime_minutes) ? null : Number(record.downtime_minutes);
    const shiftMinutes = shift ? (minutesBetween(shift.start_time, shift.end_time) || shift.duration_minutes) : null;
    if (downtime !== null && shiftMinutes && downtime > shiftMinutes) {
      blockers.push({ field: 'downtime_minutes', message: `Downtime (${downtime} min) is longer than the ${shift.name} (${shiftMinutes} min).` });
    } else if (downtime !== null && downtime >= THRESHOLDS.highDowntimeMinutes) {
      warnings.push({ field: 'downtime_minutes', message: `High downtime: ${downtime} min in one shift.` });
    }
    if (downtime > 0 && isBlank(record.downtime_reason) && onForm(record, 'downtime_reason')) {
      warnings.push({ field: 'downtime_reason', message: 'Downtime is recorded but no reason is given.' });
    }
    if (!isBlank(record.downtime_reason) && ctx && ctx.reasons) {
      const hit = reasonOf(record, ctx.reasons);
      if (hit && hit.via === 'meaning') warnings.push({ field: 'downtime_reason', message: `"${cleanText(record.downtime_reason)}" may be misread handwriting; its meaning ("${hit.meaning}") is counted as ${hit.reason.name}. Check the photo.` });
      else if (!hit) warnings.push({ field: 'downtime_reason', message: `"${cleanText(record.downtime_reason)}" is not in the downtime reason list; reports will group it under Other.` });
      else if (!hit.exact) warnings.push({ field: 'downtime_reason', message: `"${cleanText(record.downtime_reason)}" is not an exact match; it will be counted as ${hit.reason.name} (spelling differs). Check the photo if that is wrong.` });
    }

    const defects = isBlank(record.defects_count) ? null : Number(record.defects_count);
    if (defects !== null && defects >= THRESHOLDS.implausibleDefects) {
      needsCheck('defects_count', `${defects} defects in one shift is unusually high. Check the photo for an overwritten or misread digit.`);
    } else if (defects !== null && defects >= THRESHOLDS.highDefects) {
      warnings.push({ field: 'defects_count', message: `High defect count: ${defects} in one shift.` });
    }
    if (defects > 0 && isBlank(record.defect_details) && onForm(record, 'defect_details')) {
      warnings.push({ field: 'defect_details', message: 'Defects are counted but not described.' });
    }

    // Two numbers written in one number box ("412 - 421") is usually a crossed-out value and its correction.
    for (const def of FIELD_DEFS.filter(d => d.type === 'number' || d.type === 'integer')) {
      const f = record.final_payload && record.final_payload.fields && record.final_payload.fields[def.key];
      const nums = f && f.raw_value ? String(f.raw_value).match(/\d+(?:\.\d+)?/g) || [] : [];
      if (nums.length >= 2 && !f.struck_out && !isFieldResolved(record, def) && !unresolvedFlags(record).includes(def)) {
        warnings.push({ field: def.recordKey, message: `Two numbers are written here ("${f.raw_value}"), probably a correction. Check which one is the final value.` });
      }
    }

    // Text-like details that are only a number, or details with zero defects, usually mean a scribble or a stray mark was read.
    if (!isBlank(record.defect_details) && /^[\s\d.,-]+$/.test(String(record.defect_details))) {
      warnings.push({ field: 'defect_details', message: `Defect details read as "${cleanText(record.defect_details)}", which is only a number. It may be a scribble or a stray mark; check the photo.` });
    } else if (defects === 0 && !isBlank(record.defect_details)) {
      warnings.push({ field: 'defect_details', message: 'Defect details are filled in but the defect count is 0. Check the photo.' });
    }

    // Lot numbers: the AI's confident mistakes cluster here (O/0, I/1, D/O, lost hyphens, crossed-out starts).
    if (!isBlank(record.batch_reference)) {
      const lot = checkLot(record.batch_reference, record.material_reference);
      if (!lot.ok) {
        const msg = `Lot "${cleanText(record.batch_reference)}": ${lot.problems.join('; ')}.${lot.suggestion ? ` Did you mean ${lot.suggestion}?` : ''}`;
        if (lot.suggestion || lot.problems.length > 1) needsCheck('batch_reference', msg + ' Check it against the photo.');
        else warnings.push({ field: 'batch_reference', message: msg });
      }
    }

    // Fabric one or two letters away from a known fabric is almost always a misread ("Poplin 405" for "Poplin 40s").
    if (!isBlank(record.material_reference)) {
      const near = nearFabric(record.material_reference, [...DEFAULT_FABRICS, ...((ctx && ctx.fabrics) || [])]);
      if (near) warnings.push({ field: 'material_reference', message: `"${cleanText(record.material_reference)}" is not a known fabric. Did you mean ${near}?`, suggestion: near });
    }

    // Anything crossed out on paper: the AI was told to read only what replaced it, but a person should look.
    for (const def of FIELD_DEFS) {
      const f = record.final_payload && record.final_payload.fields && record.final_payload.fields[def.key];
      if (f && f.struck_out && !isFieldResolved(record, def)) {
        warnings.push({ field: def.recordKey, message: `${def.label} has crossed-out writing on the paper${f.struck && f.struck.length ? ` ("${f.struck.join('", "')}" struck out)` : ''}. Check that the right value was kept.` });
      }
    }

    if (record.final_payload && record.final_payload.double_checked === false) {
      warnings.push({ field: null, message: 'This photo was not double-checked by the second AI reading (the AI was busy or slow). Compare the numbers with the photo before approving.' });
    }

    if (record.sheet_incomplete) {
      warnings.push({ field: null, message: `The AI saw ${record.sheet_rows_detected} filled rows on this photo but captured ${record.sheet_rows}. Check the photo for a missed row and capture it separately if needed.` });
    }

    if (record.machine_id && record.shift_id && record.production_date) {
      const dup = records.find(r => r.id !== record.id && r.status !== 'rejected' &&
        r.machine_id === record.machine_id && r.shift_id === record.shift_id && r.production_date === record.production_date);
      if (dup) {
        const msg = `Another record (${dup.record_number}, ${String(dup.status).replace(/_/g, ' ')}) already exists for this loom, date and shift.`;
        if (dup.status === 'approved') blockers.push({ field: 'machine_id', message: msg + ' Approving would double-count production in the ERP.' });
        else needsCheck('machine_id', `${msg} Check the loom number on the photo; if both are right, reject one of them.`);
      }
    }

    return { blockers, warnings };
  }

  // ---------------------------------------------------------------------------
  // ERP contract
  // ---------------------------------------------------------------------------
  const ERP_SCHEMA = 'aplyd.production_record/v1';

  function buildErpPayload(record, ctx) {
    const machine = ((ctx && ctx.machines) || []).find(m => m.id === record.machine_id) || {};
    const shift = ((ctx && ctx.shifts) || []).find(s => s.id === record.shift_id) || {};
    const corrections = record.corrections || [];
    const num = v => (isBlank(v) ? null : Number(v));
    return {
      schema: ERP_SCHEMA,
      idempotency_key: `APLYD-${record.id}`,
      record_number: record.record_number,
      machine_code: machine.machine_code || null,
      production_date: record.production_date || null,
      shift_code: shift.shift_code || null,
      production_quantity: num(record.production_quantity),
      production_unit: record.production_unit || 'metres',
      material_reference: cleanText(record.material_reference),
      batch_reference: cleanText(record.batch_reference),
      defects_count: num(record.defects_count),
      defect_details: cleanText(record.defect_details),
      downtime_minutes: num(record.downtime_minutes),
      downtime_reason: cleanText(record.downtime_reason),
      downtime_reason_code: isBlank(record.downtime_reason) ? null : ((reasonOf(record, ctx && ctx.reasons) || {}).reason || OTHER_REASON).code,
      remarks: cleanText(record.remarks),
      approved_by: record.reviewed_by_name || record.reviewed_by || null,
      approved_at: record.reviewed_at || null,
      provenance: {
        source_form: record.form_number || null,
        source_row: record.sheet_rows > 1 ? record.sheet_row : null,
        image_sha256: record.file_sha256 || null,
        extraction_model: record.extraction_model || null,
        fields_corrected: new Set(corrections.filter(c => c.kind === 'correction' || c.kind === 'undo').filter(c => humanChanged(record, c.field_key)).map(c => c.field_key)).size,
        fields_confirmed: new Set(corrections.filter(c => c.kind === 'confirmation' || c.kind === 'check').map(c => c.field_key)).size
      }
    };
  }

  function validateErpPayload(p) {
    const errors = [];
    if (!p || typeof p !== 'object') return ['Payload must be a JSON object.'];
    if (p.schema !== ERP_SCHEMA) errors.push(`schema must be "${ERP_SCHEMA}".`);
    for (const k of ['idempotency_key', 'record_number', 'machine_code', 'production_date', 'shift_code', 'approved_at']) {
      if (isBlank(p[k]) || typeof p[k] !== 'string') errors.push(`${k} is required.`);
    }
    if (p.production_date && !/^\d{4}-\d{2}-\d{2}$/.test(p.production_date)) errors.push('production_date must be YYYY-MM-DD.');
    if (typeof p.production_quantity !== 'number' || p.production_quantity < 0) errors.push('production_quantity must be a number >= 0.');
    if (!['metres', 'yards', 'picks'].includes(p.production_unit)) errors.push('production_unit must be metres, yards or picks.');
    for (const k of ['defects_count', 'downtime_minutes']) {
      if (p[k] !== null && p[k] !== undefined && (typeof p[k] !== 'number' || p[k] < 0)) errors.push(`${k} must be null or a number >= 0.`);
    }
    return errors;
  }

  /** Deterministic reference: same idempotency key -> same reference, no database needed. */
  function erpReference(idempotencyKey, isoTimestamp) {
    let h = 0x811c9dc5;
    const s = String(idempotencyKey);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    const year = String(isoTimestamp || '').slice(0, 4) || String(new Date().getFullYear());
    return `ERP-${year}-${h.toString(16).toUpperCase().padStart(8, '0')}`;
  }

  return {
    STATUSES, FIELD_DEFS, THRESHOLDS, ERP_SCHEMA, DEFAULT_DOWNTIME_REASONS, OTHER_REASON,
    normalizeMachineCode, matchShift, parseNumber, parseDurationMinutes, normalizeUnit, parseDate, todayIso,
    matchReason, resolveReason, editDistance, similarity, cleanBox, checkLot, nearFabric, DEFAULT_FABRICS,
    normalizeExtraction, normalizeSheet, compareReadings, applyAudit, reasonOf, MAX_ENTRIES, validateRecord, unresolvedFlags, isFieldResolved, onForm, sameValue, humanChanged,
    buildErpPayload, validateErpPayload, erpReference, minutesBetween
  };
});
