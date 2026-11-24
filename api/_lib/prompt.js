'use strict';

/**
 * Prompt for the vision model. The model only transcribes and labels what it
 * sees; all mapping to master data, unit/number/date parsing and business
 * rules happen afterwards in deterministic code (aplyd/js/rules.js).
 */

const FIELD_SPEC = [
  ['machine', 'Machine / loom number as written (e.g. "L-07", "Loom 7", "7")'],
  ['production_date', 'Date of production. Copy exactly as written in raw_value; in value give YYYY-MM-DD. Dates are written day-first (DD/MM/YYYY).'],
  ['shift', 'Shift as written (e.g. "M", "Morning", "E", "N")'],
  ['production_quantity', 'Net production quantity as a number (no unit)'],
  ['production_unit', 'Unit for the quantity (m / metres / yards / picks) if written'],
  ['material_reference', 'Fabric sort / quality / material description'],
  ['batch_reference', 'Batch, lot or beam number'],
  ['defects_count', 'Number of defects as a whole number'],
  ['defect_details', 'Description of defects'],
  ['downtime_minutes', 'Total downtime converted to minutes (e.g. "1 hr 15 min" -> 75)'],
  ['downtime_reason', 'Reason for downtime / stoppage'],
  ['remarks', 'Any operator remarks']
];

function buildSystemPrompt(master) {
  const looms = (master.machines || []).map(m => m.machine_code).join(', ') || '(none configured)';
  const shifts = (master.shifts || []).map(s => `${s.shift_code} = ${s.name}`).join(', ') || '(none configured)';
  const fieldLines = FIELD_SPEC.map(([k, d]) => `- ${k}: ${d}`).join('\n');

  return `You transcribe photos of handwritten textile shop-floor production forms (weaving / loom sheds) into JSON.
The photo may be skewed, dim, stained, creased, partly torn or written in rough handwriting. Forms vary in layout; find each field by its meaning, not its position.

A photo can hold ONE entry (a slip for one loom and one shift) or SEVERAL entries (a register / ledger page with one row per loom, or several slips in one photo). Return one entry per filled row or slip. Never merge two looms into one entry, and never drop a filled row.

Registered looms: ${looms}
Registered shifts: ${shifts}

Fields to extract:
${fieldLines}

For EVERY field return an object: {"value": ..., "raw_value": "...", "status": "...", "reason": "...", "box": [ymin, xmin, ymax, xmax]}
- raw_value: the exact characters written on the paper, or null if the space is blank.
- box: where that value is written on the photo (or the empty space for it), as [ymin, xmin, ymax, xmax] scaled 0-1000 relative to the image. Omit box if the form has no place for the field.
- status, one of:
  "read"      - clearly legible, you are confident.
  "uncertain" - legible but could be read more than one way (e.g. 3 vs 8, 1 vs 7, M vs N). Put your best reading in value and list the alternatives in reason.
  "missing"   - the field is blank on the form. value and raw_value must be null.
  "illegible" - something is written but cannot be read (smudge, stain, tear). value null.
- reason: short explanation for any status other than "read", else null.

Hard rules:
1. Never guess or invent a value. If you cannot see it, use "missing" or "illegible".
2. A written zero ("0", "nil", "-0-") is a value of 0 with status "read". It is not missing.
3. Do not "correct" a value to make it fit the registered looms or shifts; transcribe what is written. Validation happens later.
4. Copy units, dates and numbers exactly in raw_value.
5. Values written once for the whole sheet (e.g. a date or shift at the top of a register page) go in "header", not repeated in every entry. Leave a field out of an entry if it is only in the header.
6. Skip rows that are completely empty. Count every row that has anything written in it in "rows_detected".
7. Crossed-out writing: ignore anything struck through or overwritten and read only the value that replaces it (never join the two, e.g. "CAm" struck out then "CMB-60-401" is just "CMB-60-401"). Add "struck_out": true to that field's object.
8. A scribble, cancel mark, dash or squiggle with no readable words is not a value: use status "missing" with reason "scribbled out". Never turn a mark into "0" or a number unless a digit is clearly written.
9. Batch / lot codes are usually 3 letters, 2 digits, 3 digits (e.g. VOI-60-446). Handwriting makes O/0, I/1/l, D/O/0, S/5, B/8 and Z/2 look alike: if any character in the code could be read either way, use status "uncertain" and say which characters in reason. Copy hyphens as written.
10. Fabric names often end in a count with "s" (e.g. "Poplin 40s", "Voile 60s"); a trailing "s" can look like "5", so mark the field "uncertain" if unsure.

Also return:
- "is_production_form": false if the image is not a production form at all or is too damaged/blurred to read anything; otherwise true.
- "image_issues": a list of short strings describing photo problems you noticed (e.g. "strong glare on lower half", "page rotated 90 degrees", "oil stain over downtime row"). Empty list if none.

- "rows_detected": how many filled entries (rows or slips) you can see in the photo.
- "fields_on_form": the field names above that the printed form has a place for (a labelled box, line or column), whether or not they are filled in.
- In each entry, "row_box": [ymin, xmin, ymax, xmax] (0-1000) around that whole row or slip.

Respond with JSON only, in exactly this shape:
{"is_production_form": true, "image_issues": [], "rows_detected": 1, "fields_on_form": ["machine", "..."], "header": {"production_date": {...}, "shift": {...}}, "entries": [{"row_box": [0, 0, 1000, 1000], "machine": {...}, "production_date": {...}, "shift": {...}, "production_quantity": {...}, "production_unit": {...}, "material_reference": {...}, "batch_reference": {...}, "defects_count": {...}, "defect_details": {...}, "downtime_minutes": {...}, "downtime_reason": {...}, "remarks": {...}}]}
"header" may be {} when nothing is shared. A single slip is an "entries" array with one object.`;
}

const USER_INSTRUCTION = 'Extract this shop-floor production form. Return JSON only.';

/** Pull a JSON object out of a model reply (tolerates code fences / leading prose). */
function parseModelJson(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Model returned no text.');
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let obj;
  try {
    obj = JSON.parse(t);
  } catch (_) {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Model reply was not valid JSON.');
    obj = JSON.parse(t.slice(start, end + 1));
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Model reply was not a JSON object.');
  const hasEntries = Array.isArray(obj.entries) && obj.entries.some(e => e && typeof e === 'object');
  const hasFields = obj.fields && typeof obj.fields === 'object';
  if (obj.is_production_form !== false && !hasEntries && !hasFields) {
    throw new Error('Model reply had no "entries".');
  }
  return obj;
}

module.exports = { buildSystemPrompt, USER_INSTRUCTION, parseModelJson, FIELD_SPEC };
