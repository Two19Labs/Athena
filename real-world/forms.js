'use strict';

/**
 * Real-world test: the 24 forms people fill in by hand.
 *
 * Each form has
 *   write  what the value card tells the writer to put on paper (exactly as shown, in their own handwriting)
 *   truth  what the system should end up with (the answer key), in the same shape as tests/fixtures/samples.json
 *   note   an extra instruction for the writer, photo  an instruction for the photographer
 *
 * The answer key is fixed in advance, so nobody has to type up the correct values after the photos are taken.
 * Text truths may be an array of acceptable readings (e.g. Devanagari or its transliteration).
 */

const slip = (id, w, t, extra = {}) => ({ id, layout: 'slip', write: w, truth: t, ...extra });

// write keys: loom, date, shift, qty, fabric, lot, defects, defectType, stop, reason, remarks ('' = leave blank)
const SLIPS = [
  slip('RW-01',
    { loom: 'L-01', date: '15/11/2026', shift: 'M', qty: '512', fabric: 'Cambric', lot: 'CMB-60-401', defects: '1', defectType: 'Weft slub', stop: '20 min', reason: 'Cleaning', remarks: 'Smooth run' },
    { machine: 'L-01', production_date: '2026-11-15', shift: 'M', production_quantity: 512, material_reference: 'Cambric', batch_reference: 'CMB-60-401', defects_count: 1, defect_details: 'Weft slub', downtime_minutes: 20, downtime_reason: 'Cleaning', remarks: 'Smooth run' },
    { condition: 'Baseline: neat handwriting, good light' }),
  slip('RW-02',
    { loom: '7', date: '15-11-26', shift: 'E', qty: '468', fabric: 'Sheeting 30s', lot: 'SHT-30-402', defects: '0', defectType: '', stop: '0', reason: '', remarks: '' },
    { machine: 'L-07', production_date: '2026-11-15', shift: 'E', production_quantity: 468, material_reference: 'Sheeting 30s', batch_reference: 'SHT-30-402', defects_count: 0, defect_details: null, downtime_minutes: 0, downtime_reason: null, remarks: null },
    { condition: 'Loom written as a bare number, short date, zeros and blanks', note: 'Write the loom as just "7" and leave the blank boxes empty.' }),
  slip('RW-03',
    { loom: 'L-12', date: '16/11/2026', shift: 'Night', qty: '735', fabric: 'Combed Poplin', lot: 'POP-40-403', defects: '2', defectType: 'Float', stop: '1 hr 15 min', reason: 'Beam knotting', remarks: '' },
    { machine: 'L-12', production_date: '2026-11-16', shift: 'N', production_quantity: 735, material_reference: 'Combed Poplin', batch_reference: 'POP-40-403', defects_count: 2, defect_details: 'Float', downtime_minutes: 75, downtime_reason: 'Beam knotting', remarks: null },
    { condition: 'Shift as a word, duration in hours and minutes' }),
  slip('RW-04',
    { loom: 'L-03', date: '16/11/26', shift: 'M', qty: '288', fabric: 'Denim 3/1', lot: 'DEN-26-404', defects: '3', defectType: 'Reed mark', stop: '45 min', reason: 'Warp break', remarks: 'Check reed' },
    { machine: 'L-03', production_date: '2026-11-16', shift: 'M', production_quantity: 288, material_reference: 'Denim 3/1', batch_reference: 'DEN-26-404', defects_count: 3, defect_details: 'Reed mark', downtime_minutes: 45, downtime_reason: 'Warp break', remarks: 'Check reed' },
    { condition: 'Ordinary slip, two-digit year' }),
  slip('RW-05',
    { loom: 'L-05', date: '16/11/2026', shift: 'E', qty: '412 → strike out, then 421', fabric: 'Linen Blend', lot: 'LIN-55-405', defects: '0', defectType: '', stop: '20 min', reason: 'Pirn change', remarks: '' },
    { machine: 'L-05', production_date: '2026-11-16', shift: 'E', production_quantity: 421, material_reference: 'Linen Blend', batch_reference: 'LIN-55-405', defects_count: 0, defect_details: null, downtime_minutes: 20, downtime_reason: 'Pirn change', remarks: null },
    { condition: 'Struck-through correction (412 crossed out, 421 written next to it)', note: 'In Production, write 412, cross it out with one line, and write 421 next to it.' }),
  slip('RW-06',
    { loom: 'L-08', date: '17/11/2026', shift: 'M', qty: '196', fabric: 'Drill', lot: 'DRL-14-406', defects: '1', defectType: 'Broken pick', stop: '30 min', reason: 'Shuttle change', remarks: '' },
    { machine: 'L-08', production_date: '2026-11-17', shift: 'M', production_quantity: 196, material_reference: 'Drill', batch_reference: 'DRL-14-406', defects_count: 1, defect_details: 'Broken pick', downtime_minutes: 30, downtime_reason: 'Shuttle change', remarks: null },
    { condition: 'Ordinary slip, shuttle loom' }),
  slip('RW-07',
    { loom: 'L-10', date: '17-11-2026', shift: 'E', qty: '690', fabric: 'Satin 50s', lot: 'SAT-50-407', defects: '0', defectType: '', stop: '15 min', reason: 'safai', remarks: 'OK' },
    { machine: 'L-10', production_date: '2026-11-17', shift: 'E', production_quantity: 690, material_reference: 'Satin 50s', batch_reference: 'SAT-50-407', defects_count: 0, defect_details: null, downtime_minutes: 15, downtime_reason: 'safai', remarks: 'OK' },
    { condition: 'Crumpled paper, Hinglish reason', photo: 'Crumple the form into a ball, flatten it roughly, then photograph it.' }),
  slip('RW-08',
    { loom: 'L-02', date: '17/11/2026', shift: 'N', qty: '505', fabric: 'Poplin 40s', lot: 'POP-40-408', defects: '2', defectType: 'Oil stain', stop: '2 hrs', reason: 'Power cut', remarks: 'Generator late' },
    { machine: 'L-02', production_date: '2026-11-17', shift: 'N', production_quantity: 505, material_reference: 'Poplin 40s', batch_reference: 'POP-40-408', defects_count: 2, defect_details: 'Oil stain', downtime_minutes: 120, downtime_reason: 'Power cut', remarks: 'Generator late' },
    { condition: 'Long stoppage written in hours' }),
  slip('RW-09',
    { loom: 'L-06', date: '18/11/2026', shift: 'M', qty: '612', fabric: 'Voile 60s', lot: '', defects: '1', defectType: 'Thick place', stop: '10 min', reason: 'Cleaning', remarks: '' },
    { machine: 'L-06', production_date: '2026-11-18', shift: 'M', production_quantity: 612, material_reference: 'Voile 60s', batch_reference: null, defects_count: 1, defect_details: 'Thick place', downtime_minutes: 10, downtime_reason: 'Cleaning', remarks: null },
    { condition: 'Blank lot number and remarks (must stay blank, not invented)', note: 'Leave Beam / Lot No. and Remarks completely empty.' }),
  slip('RW-10',
    { loom: 'L-04', date: '18/11/2026', shift: 'E', qty: '333', fabric: 'Oxford', lot: 'OXF-18-410', defects: '4', defectType: 'Weft bar', stop: '50 min', reason: 'Beam change', remarks: '' },
    { machine: 'L-04', production_date: '2026-11-18', shift: 'E', production_quantity: 333, material_reference: 'Oxford', batch_reference: 'OXF-18-410', defects_count: 4, defect_details: 'Weft bar', downtime_minutes: 50, downtime_reason: 'Beam change', remarks: null },
    { condition: 'Repeated digits (333)' }),
  slip('RW-11',
    { loom: 'L-11', date: '18/11/26', shift: 'Night', qty: '377', fabric: 'Yarn Dyed Check', lot: 'YDC-11-411', defects: '1', defectType: 'Stain', stop: '25 min', reason: 'Lubrication', remarks: '' },
    { machine: 'L-11', production_date: '2026-11-18', shift: 'N', production_quantity: 377, material_reference: 'Yarn Dyed Check', batch_reference: 'YDC-11-411', defects_count: 1, defect_details: 'Stain', downtime_minutes: 25, downtime_reason: 'Lubrication', remarks: null },
    { condition: 'Photographed at a strong angle', photo: 'Take the photo at a strong angle (about 30 to 45 degrees), not from straight above.' }),
  slip('RW-12',
    { loom: 'L-09', date: '19/11/2026', shift: 'M', qty: '154', fabric: 'Duck Canvas', lot: 'DCK-12-412', defects: '0', defectType: '', stop: '40 min', reason: 'लाइट गई  (or "light gayi" if you cannot write Hindi)', remarks: '' },
    { machine: 'L-09', production_date: '2026-11-19', shift: 'M', production_quantity: 154, material_reference: 'Duck Canvas', batch_reference: 'DCK-12-412', defects_count: 0, defect_details: null, downtime_minutes: 40, downtime_reason: ['लाइट गई', 'light gayi', 'light gai', 'light gaya', 'power cut'], remarks: null },
    { condition: 'Reason written in Hindi (Devanagari) or Hinglish' }),
  slip('RW-13',
    { loom: 'L-01', date: '19/11/2026', shift: 'E', qty: '578', fabric: 'Cambric', lot: 'CMB-60-413', defects: '2', defectType: 'Missing end', stop: '1 hr', reason: 'Warp break', remarks: '' },
    { machine: 'L-01', production_date: '2026-11-19', shift: 'E', production_quantity: 578, material_reference: 'Cambric', batch_reference: 'CMB-60-413', defects_count: 2, defect_details: 'Missing end', downtime_minutes: 60, downtime_reason: 'Warp break', remarks: null },
    { condition: 'Ordinary slip, duration "1 hr"' }),
  slip('RW-14',
    { loom: 'L-07', date: '19/11/2026', shift: 'N', qty: '449', fabric: 'Sheeting 30s', lot: 'SHT-30-414', defects: 'nil', defectType: '', stop: '0', reason: '', remarks: 'Night shift ok' },
    { machine: 'L-07', production_date: '2026-11-19', shift: 'N', production_quantity: 449, material_reference: 'Sheeting 30s', batch_reference: 'SHT-30-414', defects_count: 0, defect_details: null, downtime_minutes: 0, downtime_reason: null, remarks: 'Night shift ok' },
    { condition: '"nil" for zero defects (a written zero, not a blank)', note: 'Write the word "nil" for No. of Defects.' }),
  slip('RW-15',
    { loom: 'L-12', date: '20/11/2026', shift: 'M', qty: '760', fabric: 'Combed Poplin', lot: 'POP-40-415', defects: '1', defectType: 'Float', stop: '5 min', reason: 'Cleaning', remarks: '' },
    { machine: 'L-12', production_date: '2026-11-20', shift: 'M', production_quantity: 760, material_reference: 'Combed Poplin', batch_reference: 'POP-40-415', defects_count: 1, defect_details: 'Float', downtime_minutes: 5, downtime_reason: 'Cleaning', remarks: null },
    { condition: 'Dim light, no flash', photo: 'Photograph in a dim room with the flash off.' }),
  slip('RW-16',
    { loom: 'L-15', date: '20/11/2026', shift: 'E', qty: '410', fabric: 'Poplin 40s', lot: 'POP-40-416', defects: '0', defectType: '', stop: '0', reason: '', remarks: 'New loom?' },
    { machine: 'L-15', production_date: '2026-11-20', shift: 'E', production_quantity: 410, material_reference: 'Poplin 40s', batch_reference: 'POP-40-416', defects_count: 0, defect_details: null, downtime_minutes: 0, downtime_reason: null, remarks: 'New loom?' },
    { condition: 'Loom that is not in the loom master (must be flagged, never mapped to a real loom)', expect: { invalid: ['machine'] } }),
  slip('RW-17',
    { loom: 'L-05', date: '20/11/2026', shift: 'N', qty: '395', fabric: 'Linen Blend', lot: 'LIN-55-417', defects: '2', defectType: 'Slub', stop: '35 min', reason: 'Motor trip', remarks: '' },
    { machine: 'L-05', production_date: '2026-11-20', shift: 'N', production_quantity: 395, material_reference: 'Linen Blend', batch_reference: 'LIN-55-417', defects_count: 2, defect_details: 'Slub', downtime_minutes: 35, downtime_reason: 'Motor trip', remarks: null },
    { condition: 'Ordinary slip, night shift' }),
  slip('RW-18',
    { loom: 'L-03', date: '21/11/2026', shift: 'M', qty: '301', fabric: 'Denim 3/1', lot: 'DEN-26-418', defects: '1', defectType: 'Reed mark', stop: '1:30', reason: 'Beam change', remarks: 'Rushed' },
    { machine: 'L-03', production_date: '2026-11-21', shift: 'M', production_quantity: 301, material_reference: 'Denim 3/1', batch_reference: 'DEN-26-418', defects_count: 1, defect_details: 'Reed mark', downtime_minutes: 90, downtime_reason: 'Beam change', remarks: 'Rushed' },
    { condition: 'Deliberately fast, messy handwriting; duration as 1:30', note: 'Write this one as fast and as messily as you would at the end of a long shift.' }),
  slip('RW-19',
    { loom: 'L-10', date: '21/11/2026', shift: 'E', qty: '702', fabric: 'Satin 50s', lot: 'SAT-50-419', defects: '0', defectType: '', stop: '10 min', reason: 'Cleaning', remarks: '' },
    { machine: 'L-10', production_date: '2026-11-21', shift: 'E', production_quantity: 702, material_reference: 'Satin 50s', batch_reference: 'SAT-50-419', defects_count: 0, defect_details: null, downtime_minutes: 10, downtime_reason: 'Cleaning', remarks: null },
    { condition: 'Ordinary slip, written in pencil if you have one', note: 'Use a pencil if you have one; otherwise any pen.' }),
  slip('RW-20',
    { loom: 'L-06', date: '21/11/2026', shift: 'N', qty: '640', fabric: 'Voile 60s', lot: 'VOI-60-420', defects: '3', defectType: 'Hole', stop: '20 min', reason: 'Yarn shortage', remarks: '' },
    { machine: 'L-06', production_date: '2026-11-21', shift: 'N', production_quantity: 640, material_reference: 'Voile 60s', batch_reference: 'VOI-60-420', defects_count: 3, defect_details: 'Hole', downtime_minutes: 20, downtime_reason: 'Yarn shortage', remarks: null },
    { condition: 'Held in one hand while photographing', photo: 'Hold the form in one hand (not flat on a table) and photograph it with the other.' })
];

// Register rows: [loom, metres, quality, lot, defects, stop minutes (number) or '' for blank, reason or '']
const reg = (id, date, iso, shift, shiftCode, rows, extra = {}) => ({
  id, layout: 'register', date, shift,
  write: rows.map(([loom, qty, fabric, lot, defects, stop, reason]) => ({ loom, qty: typeof qty === 'object' ? qty.write : String(qty), fabric, lot, defects: String(defects), stop: stop === '' ? '' : String(stop), reason })),
  truth: rows.map(([loom, qty, fabric, lot, defects, stop, reason]) => ({
    production_date: iso, shift: shiftCode, machine: loom, production_quantity: typeof qty === 'object' ? qty.value : qty,
    material_reference: fabric, batch_reference: lot, defects_count: defects, downtime_minutes: stop === '' ? null : stop, downtime_reason: reason || null
  })),
  ...extra
});

const REGISTERS = [
  reg('RW-21', '19/11/2026', '2026-11-19', 'M', 'M', [
    ['L-01', 534, 'Cambric', 'CMB-60-421', 1, 15, 'Cleaning'],
    ['L-02', 488, 'Poplin 40s', 'POP-40-422', 0, 0, ''],
    ['L-03', 312, 'Denim 3/1', 'DEN-26-423', 2, 35, 'Warp break'],
    ['L-04', 276, 'Oxford', 'OXF-18-424', 1, 50, 'Pirn change'],
    ['L-05', 405, 'Linen Blend', 'LIN-55-425', 0, 20, 'Lubrication'],
    ['L-06', 605, 'Voile 60s', 'VOI-60-426', 3, 10, 'Beam knotting']
  ], { condition: 'Register page, 6 looms, one person' }),
  reg('RW-22', '20/11/2026', '2026-11-20', 'E', 'E', [
    ['L-07', 455, 'Sheeting 30s', 'SHT-30-431', 0, 25, 'Cleaning'],
    ['L-08', 172, 'Drill', 'DRL-14-432', 2, 40, 'Shuttle change'],
    ['L-09', 138, 'Duck Canvas', 'DCK-12-433', 1, 60, 'Power cut'],
    ['L-10', 681, 'Satin 50s', 'SAT-50-434', 0, 0, ''],
    ['L-11', { write: '362 → strike out, then 326', value: 326 }, 'Yarn Dyed Check', 'YDC-11-435', 1, 30, 'Beam change'],
    ['L-12', 744, 'Combed Poplin', 'POP-40-436', 2, 15, 'safai']
  ], { condition: 'Register page, 6 looms, one struck-through correction (362 to 326)', note: 'On the L-11 row, write 362, cross it out, and write 326 next to it.' }),
  reg('RW-23', '21/11/2026', '2026-11-21', 'Night', 'N', [
    ['L-01', 498, 'Cambric', 'CMB-60-441', 0, 0, ''],
    ['L-02', 521, 'Poplin 40s', 'POP-40-442', 1, 20, 'Cleaning'],
    ['L-03', 287, 'Denim 3/1', 'DEN-26-443', 0, 45, 'Warp break'],
    ['L-04', 318, 'Oxford', 'OXF-18-444', 2, 10, 'Lubrication'],
    ['L-05', 0, 'Linen Blend', 'LIN-55-445', 0, 480, 'Motor burnt'],
    ['L-06', 577, 'Voile 60s', 'VOI-60-446', 1, '', ''],
    ['L-07', 463, 'Sheeting 30s', 'SHT-30-447', 0, 15, 'Pirn change'],
    ['L-08', 201, 'Drill', 'DRL-14-448', 1, 30, 'Shuttle change']
  ], { condition: 'Register page, 8 looms, a loom stopped all shift (0 m, 480 min), a blank stop cell', photo: 'Photograph the whole page in one shot, at a slight angle.' }),
  reg('RW-24', '18/11/2026', '2026-11-18', 'E', 'E', [
    ['L-02', 476, 'Poplin 40s', 'POP-40-451', 1, 20, 'Cleaning'],
    ['L-04', 263, 'Oxford', 'OXF-18-452', 0, 35, 'Beam change'],
    ['L-06', 598, 'Voile 60s', 'VOI-60-453', 2, 10, 'Warp break'],
    ['L-08', 185, 'Drill', 'DRL-14-454', 0, 50, 'Shuttle change'],
    ['L-10', 672, 'Satin 50s', 'SAT-50-455', 1, 5, 'Cleaning'],
    ['L-12', 731, 'Combed Poplin', 'POP-40-456', 0, 0, '']
  ], { condition: 'Register page, 6 looms, each row written by a different person', note: 'Pass this register around: each row should be written by a different person (the date and shift by whoever starts).' })
];

/**
 * Conditions per form, for "where did it fail, and under what condition".
 * photo:   how the picture was taken (normal = flat, from above, ordinary light)
 * writing: what is hard about the handwriting or the content
 */
const TAGS = {
  'RW-01': { photo: 'normal', writing: ['neat'] },
  'RW-02': { photo: 'normal', writing: ['format variations', 'blanks and zeros'] },
  'RW-03': { photo: 'normal', writing: ['format variations'] },
  'RW-04': { photo: 'normal', writing: ['everyday'] },
  'RW-05': { photo: 'normal', writing: ['struck-out correction'] },
  'RW-06': { photo: 'normal', writing: ['everyday'] },
  'RW-07': { photo: 'crumpled', writing: ['Hinglish'] },
  'RW-08': { photo: 'normal', writing: ['format variations'] },
  'RW-09': { photo: 'normal', writing: ['blanks and zeros'] },
  'RW-10': { photo: 'normal', writing: ['repeated digits'] },
  'RW-11': { photo: 'angled', writing: ['everyday'] },
  'RW-12': { photo: 'normal', writing: ['Hindi'] },
  'RW-13': { photo: 'normal', writing: ['everyday'] },
  'RW-14': { photo: 'normal', writing: ['blanks and zeros'] },
  'RW-15': { photo: 'dim', writing: ['everyday'] },
  'RW-16': { photo: 'normal', writing: ['unknown loom'] },
  'RW-17': { photo: 'normal', writing: ['everyday'] },
  'RW-18': { photo: 'normal', writing: ['rushed'] },
  'RW-19': { photo: 'normal', writing: ['pencil'] },
  'RW-20': { photo: 'handheld', writing: ['everyday'] },
  'RW-21': { photo: 'normal', writing: ['register page'] },
  'RW-22': { photo: 'normal', writing: ['register page', 'struck-out correction', 'Hinglish'] },
  'RW-23': { photo: 'angled', writing: ['register page', 'blanks and zeros'] },
  'RW-24': { photo: 'normal', writing: ['register page', 'several writers'] }
};

const ALL_FORMS = [...SLIPS, ...REGISTERS].map(f => ({ ...f, tags: TAGS[f.id] }));

/**
 * The test actually run: 5 people x 3 forms = 15 (12 slips, 3 register pages), chosen to keep every
 * condition that matters (angled, crumpled, handheld, rotated, rushed, Hindi, Hinglish,
 * crossed-out numbers, blanks, an unknown loom, a register written by several people) and to give
 * every person a mix of easy and hard forms.
 */
const PLAN = [
  { person: 'Person 1', ids: ['RW-01', 'RW-16', 'RW-22'] },
  { person: 'Person 2', ids: ['RW-02', 'RW-18', 'RW-23'] },
  { person: 'Person 3', ids: ['RW-03', 'RW-05', 'RW-12'], note: 'Give RW-12 to someone who can write Hindi, if possible.' },
  { person: 'Person 4', ids: ['RW-07', 'RW-11', 'RW-15'] },
  { person: 'Person 5', ids: ['RW-19', 'RW-20', 'RW-24'], note: 'RW-24 is passed around: Person 5 writes the date, shift and the first row, then hands it to the others, one row each.' }
];

/**
 * What was ACTUALLY on the paper and in the photo (checked by eye on 25 Nov 2026), where it differs
 * from the card. The test scores the AI against the paper, not against the card: a writer who wrote
 * "Okay" instead of "OK" is a real-world variation, not an AI mistake. Text answers may list
 * several acceptable spellings of the same thing.
 */
const AS_WRITTEN = {
  'RW-01': { truth: { batch_reference: 'CMB-60-401', remarks: ['Smooth run', 'Smooth run.'] }, writing: ['neat', 'crossed-out start'], condition: 'Neat slip; a crossed-out start ("CAm") before the lot number' },
  'RW-02': { truth: { defect_details: null }, writing: ['format variations', 'blanks and zeros'], condition: 'Loom written as just "7", zeros and blanks, a scribbled-out mark in the defect box' },
  'RW-03': { photo: 'normal', truth: { downtime_minutes: 75 }, writing: ['format variations'], condition: 'Shift written as "Night", stoppage as "1 hr. 15 min"' },
  'RW-05': { writing: ['struck-out correction'], condition: 'Struck-out correction (412 crossed out, 421 written next to it), lower-case lot number' },
  'RW-07': { truth: { material_reference: ['Satin 50s', 'Satin-50s'], downtime_minutes: 15, remarks: ['Okay', 'OK'] }, writing: ['Hinglish', 'words for numbers', 'crossed-out start'], condition: 'Crumpled paper; stoppage written in words ("fifteen Min."), "Safai", "Okay", a crossed-out start in the lot number' },
  'RW-11': { truth: { material_reference: ['Yarn Dyed Check', 'Yarn-Dyed Check'] }, writing: ['everyday'], condition: 'Photographed at a strong angle' },
  'RW-12': { photo: 'rotated', writing: ['Hindi'], condition: 'Photo taken sideways; stoppage reason in Hindi (Devanagari)' },
  'RW-15': { photo: 'normal', writing: ['everyday'], condition: 'Ordinary slip' },
  'RW-16': { photo: 'rotated', writing: ['unknown loom'], condition: 'Photo taken sideways; a loom that is not in the loom master (L-15)' },
  'RW-18': { truth: { material_reference: ['Denim 3/1', 'Denim-3/1', 'Denin-3/1', 'Denin 3/1'], defect_details: ['Read mark', 'Reed mark'] }, writing: ['rushed', 'crossed-out start'], condition: 'Fast, messy handwriting; "Read mark"; a crossed-out attempt before "1:30"' },
  'RW-19': { truth: { downtime_reason: ['सफाई', 'साफ़ाई', 'safai', 'Cleaning'] }, writing: ['Hindi'], condition: 'Stoppage reason written in Hindi instead of English' },
  'RW-20': { truth: { material_reference: ['Voile 60s', 'Voile-60s'], batch_reference: ['VOI-60-420', 'V0I-60-420'], defect_details: ['whole', 'Hole'] }, writing: ['everyday'], condition: 'Held in one hand while photographing; "whole" written for the defect' },
  'RW-22': { rows: { 3: { downtime_reason: ['blank', null] }, 4: { material_reference: ['Yarn Dyed Check', 'Yarn Died check', 'Yarn Died Check'] } }, writing: ['register page', 'struck-out correction', 'Hinglish'], condition: 'Register, 6 looms; 362 struck out for 326; the word "blank" written in a Reason box' },
  'RW-23': { rows: { 3: { material_reference: ['Oxford', 'Oxbond'] } }, writing: ['register page', 'blanks and zeros', 'crossed-out start'], condition: 'Register, 8 looms, photographed at an angle; a loom stopped all shift; "Motor burnt" with a crossed-out first attempt' },
  'RW-24': { rows: { 2: { batch_reference: ['VOI-60-453', 'VOL-60-453'] } }, writing: ['register page', 'several writers'], condition: 'Register, 6 looms, rows written by different people' }
};

function applyAsWritten(f) {
  const a = AS_WRITTEN[f.id];
  if (!a) return f;
  let truth = f.truth;
  if (a.truth) truth = { ...truth, ...a.truth };
  if (a.rows) truth = truth.map((t, i) => (a.rows[i] ? { ...t, ...a.rows[i] } : t));
  return { ...f, truth, condition: a.condition || f.condition, tags: { photo: a.photo || f.tags.photo, writing: a.writing || f.tags.writing } };
}

const byId = Object.fromEntries(ALL_FORMS.map(f => [f.id, f]));
const FORMS = PLAN.flatMap(p => p.ids.map(id => applyAsWritten({ ...byId[id], person: p.person })));

module.exports = { FORMS, ALL_FORMS, PLAN };
