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
    highDowntimeMinutes: 120 // downtime per shift that warrants a warning
  };

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

  function todayIso(now) {
    const d = now ? new Date(now) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      let value = isBlank(f.value) ? null : f.value;
      const source = value !== null ? value : rawValue;

      if (status === 'missing' || (source === null && status !== 'illegible')) {
        out[def.key] = { value: null, raw_value: rawValue, status: status === 'illegible' ? 'illegible' : 'missing', reason };
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

      out[def.key] = { value, raw_value: rawValue, status, reason: reason || null };
    }

    const needsReview = FIELD_DEFS.some(def => {
      const f = out[def.key];
      if (['uncertain', 'illegible', 'invalid'].includes(f.status)) return true;
      return def.required && f.status !== 'read';
    });

    return {
      schema_version: '2.0',
      overall_status: needsReview ? 'needs_review' : 'ready_for_approval',
      image_issues: Array.isArray(raw && raw.image_issues) ? raw.image_issues.map(String).slice(0, 10) : [],
      fields: out
    };
  }

  const MAX_ENTRIES = 30;

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
    const entries = kept.map(fields => normalizeExtraction({ fields, image_issues: issues }, master));
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

  function isFieldResolved(record, def) {
    return (record.corrections || []).some(c => c.field_key === def.recordKey);
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

    const qty = isBlank(record.production_quantity) ? null : Number(record.production_quantity);
    const unit = record.production_unit || 'metres';
    if (machine && qty !== null && unit === (machine.default_unit || 'metres')) {
      if (machine.max_expected_quantity && qty > machine.max_expected_quantity) {
        warnings.push({ field: 'production_quantity', message: `${qty} ${unit} is above the expected maximum for ${machine.machine_code} (${machine.max_expected_quantity}). Check for a misread digit.` });
      } else if (machine.min_expected_quantity && qty < machine.min_expected_quantity && qty > 0) {
        warnings.push({ field: 'production_quantity', message: `${qty} ${unit} is below the expected minimum for ${machine.machine_code} (${machine.min_expected_quantity}).` });
      }
    }

    const downtime = isBlank(record.downtime_minutes) ? null : Number(record.downtime_minutes);
    const shiftMinutes = shift ? (minutesBetween(shift.start_time, shift.end_time) || shift.duration_minutes) : null;
    if (downtime !== null && shiftMinutes && downtime > shiftMinutes) {
      blockers.push({ field: 'downtime_minutes', message: `Downtime (${downtime} min) is longer than the ${shift.name} (${shiftMinutes} min).` });
    } else if (downtime !== null && downtime >= THRESHOLDS.highDowntimeMinutes) {
      warnings.push({ field: 'downtime_minutes', message: `High downtime: ${downtime} min in one shift.` });
    }
    if (downtime > 0 && isBlank(record.downtime_reason)) {
      warnings.push({ field: 'downtime_reason', message: 'Downtime is recorded but no reason is given.' });
    }

    const defects = isBlank(record.defects_count) ? null : Number(record.defects_count);
    if (defects !== null && defects >= THRESHOLDS.highDefects) {
      warnings.push({ field: 'defects_count', message: `High defect count: ${defects} in one shift.` });
    }
    if (defects > 0 && isBlank(record.defect_details)) {
      warnings.push({ field: 'defect_details', message: 'Defects are counted but not described.' });
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
        else warnings.push({ field: 'machine_id', message: msg });
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
      remarks: cleanText(record.remarks),
      approved_by: record.reviewed_by_name || record.reviewed_by || null,
      approved_at: record.reviewed_at || null,
      provenance: {
        source_form: record.form_number || null,
        source_row: record.sheet_rows > 1 ? record.sheet_row : null,
        image_sha256: record.file_sha256 || null,
        extraction_model: record.extraction_model || null,
        fields_corrected: corrections.filter(c => c.kind !== 'confirmation').length,
        fields_confirmed: corrections.filter(c => c.kind === 'confirmation').length
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
    STATUSES, FIELD_DEFS, THRESHOLDS, ERP_SCHEMA,
    normalizeMachineCode, matchShift, parseNumber, parseDurationMinutes, normalizeUnit, parseDate, todayIso,
    normalizeExtraction, normalizeSheet, MAX_ENTRIES, validateRecord, unresolvedFlags, isFieldResolved,
    buildErpPayload, validateErpPayload, erpReference, minutesBetween
  };
});
