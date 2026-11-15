/**
 * Generator for 20 realistic textile shop-floor sample forms and paired ground-truth JSON
 */
const fs = require('fs');
const path = require('path');

const sampleFormsDir = path.join(__dirname, '..', 'assets', 'sample-forms');
const sampleOutputsDir = path.join(__dirname, '..', 'assets', 'sample-outputs');

if (!fs.existsSync(sampleFormsDir)) fs.mkdirSync(sampleFormsDir, { recursive: true });
if (!fs.existsSync(sampleOutputsDir)) fs.mkdirSync(sampleOutputsDir, { recursive: true });

const samples = [
  // 1-4: Clean Baseline Forms
  { id: '01', name: 'sample_01_clean_loom_12', loom: 'L-12', date: '2026-11-15', shift: 'Morning', qty: 420, unit: 'metres', material: 'Cotton 40s Cambric', batch: 'LOT-C40-882', defects: 0, downtime: 0, reason: null, type: 'clean' },
  { id: '02', name: 'sample_02_clean_loom_01', loom: 'L-01', date: '2026-11-15', shift: 'Morning', qty: 380, unit: 'metres', material: 'Poplin 40s Combed', batch: 'POP-40-771', defects: 1, downtime: 15, reason: 'Yarn replenishment', type: 'clean' },
  { id: '03', name: 'sample_03_clean_loom_03', loom: 'L-03', date: '2026-11-15', shift: 'Morning', qty: 310, unit: 'metres', material: 'Heavy Denim 3/1', batch: 'DEN-2026-19', defects: 2, downtime: 30, reason: 'Warp tie-in', type: 'clean' },
  { id: '04', name: 'sample_04_clean_loom_07', loom: 'L-07', date: '2026-11-15', shift: 'Evening', qty: 425, unit: 'metres', material: 'Sheeting 30s', batch: 'SHT-30-104', defects: 0, downtime: 0, reason: null, type: 'clean' },

  // 5-8: Degraded Physical Conditions
  { id: '05', name: 'sample_05_skew_15deg', loom: 'L-02', date: '2026-11-15', shift: 'Morning', qty: 395, unit: 'metres', material: 'Poplin 40s', batch: 'POP-40-772', defects: 1, downtime: 10, reason: 'Bobbin check', type: 'skew', skewAngle: 12 },
  { id: '06', name: 'sample_06_low_light_shadow', loom: 'L-06', date: '2026-11-15', shift: 'Night', qty: 350, unit: 'metres', material: 'Voile 60s', batch: 'VOI-60-201', defects: 3, downtime: 40, reason: 'Tension float adjustment', type: 'shadow' },
  { id: '07', name: 'sample_07_faded_ink', loom: 'L-04', date: '2026-11-15', shift: 'Evening', qty: 290, unit: 'metres', material: 'Oxford Shirting', batch: 'OXF-50-312', defects: 2, downtime: 20, reason: 'Weft stop check', type: 'faded' },
  { id: '08', name: 'sample_08_degraded_paper', loom: 'L-10', date: '2026-11-15', shift: 'Night', qty: 375, unit: 'metres', material: 'Cotton Satin 50s', batch: 'SAT-50-901', defects: 1, downtime: 15, reason: 'Nozzle clearing', type: 'creased' },

  // 9-11: Ambiguous Handwriting
  { id: '09', name: 'sample_09_ambiguous_qty', loom: 'L-12', date: '2026-11-15', shift: 'Morning', qty: 350, candidateQty: 850, unit: 'metres', material: 'Combed Poplin', batch: 'POP-40-880', defects: 1, downtime: 20, reason: 'Loom cleaning', type: 'ambiguous_qty' },
  { id: '10', name: 'sample_10_ambiguous_shift', loom: 'L-05', date: '2026-11-15', shift: 'Morning', candidateShift: 'Night', qty: 340, unit: 'metres', material: 'Linen Blend', batch: 'LIN-35-102', defects: 2, downtime: 25, reason: 'Warp break repair', type: 'ambiguous_shift' },
  { id: '11', name: 'sample_11_cursive_writing', loom: 'L-11', date: '2026-11-15', shift: 'Evening', qty: 330, unit: 'metres', material: 'Yarn Dyed Check', batch: 'CHK-40-410', defects: 4, downtime: 35, reason: 'Pattern card check', type: 'cursive' },

  // 12-14: Stains, Smudges & Physical Damage
  { id: '12', name: 'sample_12_oil_stain_downtime', loom: 'L-08', date: '2026-11-15', shift: 'Morning', qty: 175, unit: 'metres', material: 'Selvedge Drill', batch: 'DRL-20-008', defects: 5, downtime: 90, reason: '[Oil Smudged Motor Repair]', type: 'oil_stain' },
  { id: '13', name: 'sample_13_smudged_batch', loom: 'L-09', date: '2026-11-15', shift: 'Morning', qty: 210, unit: 'metres', material: 'Heavy Duck Canvas', batch: '[Smudged LOT-DK-??]', defects: 2, downtime: 15, reason: 'Mechanical oiling', type: 'smudged_batch' },
  { id: '14', name: 'sample_14_torn_corner', loom: 'L-01', date: '2026-11-15', shift: 'Night', qty: 360, unit: 'metres', material: 'Cambric 40s', batch: 'CAM-40-512', defects: 0, downtime: 0, reason: null, type: 'torn_corner' },

  // 15-16: Incomplete & Boundary Forms
  { id: '15', name: 'sample_15_explicit_zero_defects', loom: 'L-03', date: '2026-11-15', shift: 'Evening', qty: 305, unit: 'metres', material: 'Denim Twill', batch: 'DEN-2026-20', defects: 0, downtime: 0, reason: null, type: 'explicit_zero' },
  { id: '16', name: 'sample_16_blank_batch', loom: 'L-07', date: '2026-11-15', shift: 'Night', qty: 410, unit: 'metres', material: 'Sheeting 30s', batch: null, defects: 1, downtime: 10, reason: 'Weft stop', type: 'blank_batch' },

  // 17-18: Master Data Anomalies
  { id: '17', name: 'sample_17_unknown_loom', loom: 'L-99', date: '2026-11-15', shift: 'Morning', qty: 250, unit: 'metres', material: 'Trial Fabric', batch: 'TRL-01', defects: 0, downtime: 0, reason: null, type: 'unknown_loom' },
  { id: '18', name: 'sample_18_custom_shift', loom: 'L-02', date: '2026-11-15', shift: 'Overtime', qty: 150, unit: 'metres', material: 'Poplin 40s', batch: 'POP-40-773', defects: 0, downtime: 0, reason: null, type: 'custom_shift' },

  // 19-20: Duplicate Forms
  { id: '19', name: 'sample_19_exact_duplicate', loom: 'L-12', date: '2026-11-15', shift: 'Morning', qty: 420, unit: 'metres', material: 'Cotton 40s Cambric', batch: 'LOT-C40-882', defects: 0, downtime: 0, reason: null, type: 'exact_dup' },
  { id: '20', name: 'sample_20_business_key_dup', loom: 'L-01', date: '2026-11-15', shift: 'Morning', qty: 380, unit: 'metres', material: 'Poplin 40s Combed', batch: 'POP-40-771', defects: 1, downtime: 15, reason: 'Yarn replenishment', type: 'business_key_dup' }
];

samples.forEach(s => {
  // Generate Ground Truth JSON
  const gt = {
    sample_id: s.name,
    ground_truth: {
      machine_code: s.loom,
      production_date: s.date,
      shift: s.shift,
      production_quantity: s.qty,
      production_unit: s.unit,
      material_reference: s.material,
      batch_reference: s.batch,
      defects_count: s.defects,
      downtime_minutes: s.downtime,
      downtime_reason: s.reason
    },
    test_attributes: {
      test_category: s.type,
      has_ambiguity: Boolean(s.candidateQty || s.candidateShift),
      has_missing_field: s.batch === null,
      has_anomaly: s.loom === 'L-99' || s.shift === 'Overtime',
      expected_model_status: (s.candidateQty || s.candidateShift) ? 'uncertain' : (s.loom === 'L-99' ? 'invalid' : 'read')
    }
  };

  fs.writeFileSync(
    path.join(sampleOutputsDir, `${s.name}_gt.json`),
    JSON.stringify(gt, null, 2),
    'utf-8'
  );

  // Generate SVG Graphic
  const bgColor = s.type === 'shadow' ? '#e6ddc8' : (s.type === 'faded' ? '#fcfbf7' : '#fffcf2');
  const inkColor = s.type === 'faded' ? '#7d7a72' : '#00264d';
  const transform = s.skewAngle ? `transform="rotate(${s.skewAngle} 350 450)"` : '';

  const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" width="700" height="900" viewBox="0 0 700 900" style="background:${bgColor}; font-family:Courier New, monospace;">
  <g ${transform}>
    <rect width="700" height="900" fill="${bgColor}" stroke="#d5cbb2" stroke-width="4"/>
    <text x="50" y="55" font-size="20" font-weight="bold" fill="#2d2d2d">TEXTILE MANUFACTURING - SHIFT PRODUCTION LOG</text>
    <line x1="50" y1="75" x2="650" y2="75" stroke="#2d2d2d" stroke-width="2"/>
    
    <text x="50" y="115" font-size="14" fill="#555">FACILITY: SHED A / B</text>
    <text x="380" y="115" font-size="14" fill="#555">SAMPLE FORM ID: ${s.name}</text>
    
    <rect x="50" y="140" width="600" height="120" fill="none" stroke="#2d2d2d" stroke-width="1.5"/>
    <text x="65" y="170" font-size="13" font-weight="bold">MACHINE / LOOM NO:</text>
    <text x="230" y="170" font-size="16" font-weight="bold" fill="${inkColor}">${s.loom}</text>
    
    <text x="65" y="205" font-size="13" font-weight="bold">DATE (DD/MM/YYYY):</text>
    <text x="230" y="205" font-size="16" font-weight="bold" fill="${inkColor}">${s.date.split('-').reverse().join('/')}</text>
    
    <text x="65" y="240" font-size="13" font-weight="bold">SHIFT (M / E / N):</text>
    <text x="230" y="240" font-size="16" font-weight="bold" fill="${inkColor}">${s.candidateShift ? 'M / N ?' : s.shift}</text>

    <rect x="50" y="280" width="600" height="190" fill="none" stroke="#2d2d2d" stroke-width="1.5"/>
    <text x="65" y="315" font-size="13" font-weight="bold">PRODUCTION QUANTITY:</text>
    <text x="260" y="315" font-size="19" font-weight="bold" fill="${s.candidateQty ? '#b45309' : '#880000'}">
      ${s.candidateQty ? '350 / 850 ?' : `${s.qty} metres`}
    </text>
    
    <text x="65" y="360" font-size="13" font-weight="bold">FABRIC QUALITY / SORT:</text>
    <text x="260" y="360" font-size="15" fill="${inkColor}">${s.material || '[BLANK]'}</text>
    
    <text x="65" y="405" font-size="13" font-weight="bold">BATCH / BEAM LOT NO:</text>
    <text x="260" y="405" font-size="15" fill="${inkColor}">${s.batch || '[BLANK]'}</text>
    
    <text x="65" y="445" font-size="13" font-weight="bold">PICK COUNTER READING:</text>
    <text x="260" y="445" font-size="15" fill="${inkColor}">START: 112,000 | END: 148,500</text>

    <rect x="50" y="490" width="600" height="150" fill="none" stroke="#2d2d2d" stroke-width="1.5"/>
    <text x="65" y="525" font-size="13" font-weight="bold">DEFECT COUNTS:</text>
    <text x="230" y="525" font-size="15" fill="${inkColor}">${s.defects} defects</text>
    
    <text x="65" y="570" font-size="13" font-weight="bold">DOWNTIME (MINUTES):</text>
    <text x="230" y="570" font-size="15" fill="${inkColor}">${s.downtime} mins</text>
    
    <text x="65" y="615" font-size="13" font-weight="bold">STOPPAGE REASON:</text>
    <text x="230" y="615" font-size="14" fill="${inkColor}">${s.reason || 'Normal operation'}</text>

    <rect x="50" y="660" width="600" height="90" fill="none" stroke="#2d2d2d" stroke-width="1.5"/>
    <text x="65" y="695" font-size="13" font-weight="bold">OPERATOR REMARKS:</text>
    <text x="65" y="725" font-size="13" fill="${inkColor}">Weaving shed daily report</text>

    ${s.type === 'oil_stain' ? '<circle cx="340" cy="610" r="45" fill="rgba(80,60,20,0.45)" filter="blur(4px)"/>' : ''}
    ${s.type === 'shadow' ? '<polygon points="0,0 700,0 500,900 0,900" fill="rgba(0,0,0,0.12)"/>' : ''}
  </g>
</svg>
`;

  fs.writeFileSync(path.join(sampleFormsDir, `${s.name}.svg`), svgContent.trim(), 'utf-8');
});

console.log(`Successfully generated ${samples.length} sample forms in ${sampleFormsDir}`);
console.log(`Successfully generated ${samples.length} ground truth files in ${sampleOutputsDir}`);
