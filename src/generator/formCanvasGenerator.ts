/**
 * Synthetic Textile Shop-Floor Form Canvas Generator
 * Renders high-fidelity, realistic paper production slips for testing:
 * - Scenario 1: Golden clean path (100% compliant, 96% confidence)
 * - Scenario 2: Real-world degraded (20° tilt, tube glare, grease smudge, strikethrough)
 * - Scenario 3: Critical boundary failure (540 min downtime in 480 min shift, negative pick counter)
 */

export interface FormScenarioData {
  scenarioId: 'clean' | 'degraded' | 'failure';
  title: string;
  description: string;
  expectedStatus: 'PASSED' | 'WARNINGS' | 'FAILED';
  formImageUri: string;
  canonicalOutput: any;
}

/**
 * Generates an authentic canvas image data URI for the requested scenario
 */
export function generateSyntheticForm(scenario: 'clean' | 'degraded' | 'failure'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1250;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Paper Background Base
  ctx.fillStyle = scenario === 'clean' ? '#fdfdfb' : scenario === 'degraded' ? '#f5eee1' : '#eee8dc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Paper fiber texture / subtle noise
  drawPaperTexture(ctx, canvas.width, canvas.height, scenario);

  ctx.save();

  // If degraded: apply slight rotation (perspective skew)
  if (scenario === 'degraded') {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((3.5 * Math.PI) / 180);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }

  // 2. Printed Header Title
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 24px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATHENA WEAVING MILLS LTD.', canvas.width / 2, 60);

  ctx.font = 'bold 15px "Inter", sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('DAILY LOOM PRODUCTION & STOPPAGE LOG SHEET (SHED A / B)', canvas.width / 2, 85);

  ctx.font = '12px "Inter", sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Form Ref: APLYD-TX-2026-F14  |  Standard Shift Duration: 8.0 Hours (480 Min)', canvas.width / 2, 105);

  // Top divider line
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 118);
  ctx.lineTo(canvas.width - 40, 118);
  ctx.stroke();

  // 3. Section 1: Header Metadata Grid
  drawHeaderMetadata(ctx, scenario);

  // 4. Section 2: Production & Pick Counters Table
  drawProductionTable(ctx, scenario);

  // 5. Section 3: Defect Register Grid
  drawDefectTable(ctx, scenario);

  // 6. Section 4: Downtime & Stoppage Matrix
  drawDowntimeTable(ctx, scenario);

  // 7. Section 5: Remarks & Signatures
  drawSignaturesAndRemarks(ctx, scenario);

  ctx.restore();

  // Injected Shop-Floor Hazards
  if (scenario === 'degraded') {
    // Fluorescent tube light reflection (glare gradient across bottom right)
    drawFluorescentGlare(ctx, canvas.width, canvas.height);
    // Grease thumbprint over Loom ID box
    drawGreaseThumbprint(ctx, 420, 155);
  } else if (scenario === 'failure') {
    // Paper crease / fold lines
    drawPaperCreases(ctx, canvas.width, canvas.height);
  }

  return canvas.toDataURL('image/png', 0.95);
}

function drawHeaderMetadata(ctx: CanvasRenderingContext2D, scenario: string) {
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.2;

  // Box coordinates
  const y = 135;
  const h = 75;
  ctx.strokeRect(40, y, 820, h);

  // Vertical dividers
  ctx.beginPath();
  ctx.moveTo(220, y); ctx.lineTo(220, y + h);
  ctx.moveTo(380, y); ctx.lineTo(380, y + h);
  ctx.moveTo(560, y); ctx.lineTo(560, y + h);
  ctx.moveTo(700, y); ctx.lineTo(700, y + h);
  ctx.stroke();

  // Printed labels
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PRODUCTION DATE', 50, y + 20);
  ctx.fillText('SHIFT (A / B / C)', 230, y + 20);
  ctx.fillText('LOOM / MACHINE ID', 390, y + 20);
  ctx.fillText('FABRIC SORT CODE', 570, y + 20);
  ctx.fillText('WEFT BEAM NO.', 710, y + 20);

  // Handwritten Values
  ctx.font = 'italic bold 19px "JetBrains Mono", cursive, sans-serif';
  ctx.fillStyle = scenario === 'degraded' ? '#1e3a8a' : '#0f172a'; // Blue or black ballpoint

  // Date
  ctx.fillText('2026-11-13', 50, y + 52);

  // Shift
  if (scenario === 'failure') {
    // Left completely blank! (Mandatory field missing)
  } else {
    ctx.fillText('Shift A', 235, y + 52);
  }

  // Loom ID
  if (scenario === 'degraded') {
    // Scribbled slightly ambiguous "L-1O4"
    ctx.fillText('L-1O4', 400, y + 52);
  } else if (scenario === 'clean') {
    ctx.fillText('L-104', 400, y + 52);
  } else {
    ctx.fillText('L-201', 400, y + 52);
  }

  // Sort Code
  ctx.fillText('S-4040-68', 575, y + 52);

  // Beam No
  ctx.fillText('BM-8842', 715, y + 52);
}

function drawProductionTable(ctx: CanvasRenderingContext2D, scenario: string) {
  const y = 230;
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('1. SHIFT PRODUCTION & ODOMETER READINGS', 40, y);

  const tableY = y + 10;
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, tableY, 820, 110);

  // Header row
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(40, tableY, 820, 30);
  ctx.strokeRect(40, tableY, 820, 30);

  // Grid lines
  ctx.beginPath();
  ctx.moveTo(180, tableY); ctx.lineTo(180, tableY + 110);
  ctx.moveTo(330, tableY); ctx.lineTo(330, tableY + 110);
  ctx.moveTo(480, tableY); ctx.lineTo(480, tableY + 110);
  ctx.moveTo(630, tableY); ctx.lineTo(630, tableY + 110);
  ctx.moveTo(730, tableY); ctx.lineTo(730, tableY + 110);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('START PICK', 50, tableY + 20);
  ctx.fillText('END PICK', 190, tableY + 20);
  ctx.fillText('NET PICKS', 340, tableY + 20);
  ctx.fillText('PROD. METERS', 490, tableY + 20);
  ctx.fillText('RPM', 640, tableY + 20);
  ctx.fillText('EFF. %', 740, tableY + 20);

  // Values
  ctx.font = 'italic bold 21px "JetBrains Mono", monospace';
  ctx.fillStyle = '#0f172a';

  if (scenario === 'clean') {
    ctx.fillText('148,200', 50, tableY + 75);
    ctx.fillText('349,800', 190, tableY + 75);
    ctx.fillText('201,600', 340, tableY + 75);
    ctx.fillText('75.3 m', 490, tableY + 75);
    ctx.fillText('800', 640, tableY + 75);
    ctx.fillText('88.5%', 740, tableY + 75);
  } else if (scenario === 'degraded') {
    ctx.fillText('148,200', 50, tableY + 75);

    // Strikethrough on End Pick: 348,200 crossed out, with 349,800 written above!
    ctx.fillStyle = '#dc2626';
    ctx.font = 'italic 16px "JetBrains Mono", monospace';
    ctx.fillText('348,200', 190, tableY + 85);
    // Draw strike line
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(185, tableY + 80);
    ctx.lineTo(260, tableY + 80);
    ctx.stroke();

    // Corrected number above
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'italic bold 20px "JetBrains Mono", monospace';
    ctx.fillText('349,800', 190, tableY + 60);

    ctx.fillText('201,600', 340, tableY + 75);
    ctx.fillText('752 m', 490, tableY + 75);
    ctx.fillText('800', 640, tableY + 75);
    ctx.fillText('88 %', 740, tableY + 75);
  } else {
    // Failure case: End pick LOWER than start pick (Reversal!)
    ctx.fillText('349,800', 50, tableY + 75);
    ctx.fillText('148,200', 190, tableY + 75); // Reversal
    ctx.fillText('-201,600', 340, tableY + 75);
    ctx.fillText('753 m', 490, tableY + 75);
    ctx.fillText('800', 640, tableY + 75);
    ctx.fillText('115 %', 740, tableY + 75); // Impossible efficiency
  }
}

function drawDefectTable(ctx: CanvasRenderingContext2D, scenario: string) {
  const y = 380;
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('2. DEFECT CLASSIFICATION & QUALITY INSPECTION', 40, y);

  const tableY = y + 10;
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, tableY, 820, 80);

  // 6 defect categories
  const colWidth = 820 / 6;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(40, tableY, 820, 26);
  ctx.strokeRect(40, tableY, 820, 26);

  const defects = [
    { label: 'WARP BREAK', val: scenario === 'failure' ? '14' : '3' },
    { label: 'WEFT STOP', val: scenario === 'failure' ? '22' : '6' },
    { label: 'SLUB/THICK', val: '1' },
    { label: 'OIL STAIN', val: scenario === 'degraded' ? '2' : '0' },
    { label: 'REED MARK', val: '0' },
    { label: 'FLOAT/STITCH', val: '1' }
  ];

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 10px sans-serif';

  defects.forEach((d, i) => {
    const x = 40 + (i * colWidth);
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(x, tableY);
      ctx.lineTo(x, tableY + 80);
      ctx.stroke();
    }
    ctx.fillText(d.label, x + 10, tableY + 17);

    ctx.font = 'italic bold 22px "JetBrains Mono", sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(d.val, x + 45, tableY + 62);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#475569';
  });
}

function drawDowntimeTable(ctx: CanvasRenderingContext2D, scenario: string) {
  const y = 500;
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('3. DOWNTIME & STOPPAGE LOG (TOTAL SHIFT CAPACITY: 480 MINS)', 40, y);

  const tableY = y + 10;
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, tableY, 820, 160);

  // Table header
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(40, tableY, 820, 28);
  ctx.strokeRect(40, tableY, 820, 28);

  ctx.beginPath();
  ctx.moveTo(140, tableY); ctx.lineTo(140, tableY + 160);
  ctx.moveTo(400, tableY); ctx.lineTo(400, tableY + 160);
  ctx.moveTo(540, tableY); ctx.lineTo(540, tableY + 160);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('CODE', 50, tableY + 18);
  ctx.fillText('STOPPAGE REASON / CATEGORY', 150, tableY + 18);
  ctx.fillText('DURATION (MINS)', 410, tableY + 18);
  ctx.fillText('REMARKS / ROOT CAUSE', 550, tableY + 18);

  // Rows
  ctx.font = 'italic 16px "JetBrains Mono", sans-serif';
  ctx.fillStyle = '#0f172a';

  if (scenario === 'clean') {
    // 60 mins total downtime (Run = 420 mins, total = 480 mins)
    ctx.fillText('DT-01', 50, tableY + 60);
    ctx.fillText('Warp Beam Knotting / Gaiting', 150, tableY + 60);
    ctx.fillText('45 min', 420, tableY + 60);
    ctx.fillText('New beam BM-8842 drawn in', 550, tableY + 60);

    ctx.fillText('DT-06', 50, tableY + 105);
    ctx.fillText('Scheduled Oiling & Cleaning', 150, tableY + 105);
    ctx.fillText('15 min', 420, tableY + 105);
    ctx.fillText('Shift changeover lubrication', 550, tableY + 105);
  } else if (scenario === 'degraded') {
    // 70 mins downtime
    ctx.fillText('DT-03', 50, tableY + 60);
    ctx.fillText('Weft Feeder Jam / Nozzle Fault', 150, tableY + 60);
    ctx.fillText('35 min', 420, tableY + 60);
    ctx.fillText('Nozzle 2 air pressure low', 550, tableY + 60);

    ctx.fillText('DT-05', 50, tableY + 105);
    ctx.fillText('Yarn Wait / Package Change', 150, tableY + 105);
    ctx.fillText('25 min', 420, tableY + 105);
    ctx.fillText('Cone supply delayed', 550, tableY + 105);
  } else {
    // FAILURE CASE: Impossible 540 min downtime in 480 min shift!
    ctx.fillText('DT-04', 50, tableY + 60);
    ctx.fillText('Mechanical Motor Burnout', 150, tableY + 60);
    ctx.fillText('540 min', 420, tableY + 60); // 9 hours!
    ctx.fillText('Motor replaced by electrical team', 550, tableY + 60);
  }
}

function drawSignaturesAndRemarks(ctx: CanvasRenderingContext2D, scenario: string) {
  const y = 700;
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('4. OPERATOR REMARKS & SHIFT SIGN-OFF', 40, y);

  const boxY = y + 10;
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, boxY, 820, 110);

  ctx.beginPath();
  ctx.moveTo(560, boxY); ctx.lineTo(560, boxY + 110);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('OPERATOR REMARKS & HANDOVER NOTES:', 50, boxY + 22);

  ctx.font = 'italic 16px "JetBrains Mono", cursive, sans-serif';
  ctx.fillStyle = '#1e293b';
  if (scenario === 'clean') {
    ctx.fillText('"Loom running smoothly at 800 RPM. Beam tension optimal."', 50, boxY + 60);
  } else if (scenario === 'degraded') {
    ctx.fillText('"Slight weft vibration on right selvedge. Checked by mechanic."', 50, boxY + 60);
  } else {
    ctx.fillText('"Complete stoppage due to motor fault. No production."', 50, boxY + 60);
  }

  // Signatures
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('OPERATOR SIGNATURE:', 580, boxY + 22);
  ctx.fillText('SUPERVISOR APPROVAL:', 580, boxY + 70);

  ctx.font = 'italic bold 18px cursive';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Manoj Verma (OP-482)', 580, boxY + 46);

  if (scenario === 'clean') {
    ctx.fillStyle = '#1e3a8a';
    ctx.fillText('Aditya Sharma (Supervisor)', 580, boxY + 95);
  } else if (scenario === 'degraded') {
    ctx.fillStyle = '#1e3a8a';
    ctx.fillText('Aditya (Supv)', 580, boxY + 95);
  } else {
    // Missing supervisor signature in failure case
    ctx.fillStyle = '#ef4444';
    ctx.font = 'italic 12px sans-serif';
    ctx.fillText('[PENDING SUPERVISOR REVIEW]', 580, boxY + 95);
  }
}

function drawPaperTexture(ctx: CanvasRenderingContext2D, w: number, h: number, scenario: string) {
  // Add subtle grid / paper grain
  ctx.strokeStyle = scenario === 'clean' ? 'rgba(0,0,0,0.015)' : 'rgba(0,0,0,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawFluorescentGlare(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const gradient = ctx.createRadialGradient(w * 0.75, h * 0.75, 20, w * 0.75, h * 0.75, 300);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.40)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function drawGreaseThumbprint(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, 42, 28, Math.PI / 4, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(120, 80, 20, 0.28)'; // Oily brown smudge
  ctx.fill();

  // Smudge texture
  ctx.strokeStyle = 'rgba(90, 60, 15, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawPaperCreases(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = 'rgba(60, 50, 40, 0.18)';
  ctx.lineWidth = 2.5;

  // Diagonal crease
  ctx.beginPath();
  ctx.moveTo(0, h * 0.35);
  ctx.lineTo(w, h * 0.42);
  ctx.stroke();

  // Vertical fold
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0);
  ctx.lineTo(w * 0.48, h);
  ctx.stroke();
}

/**
 * Returns canonical pre-configured records matching each scenario
 */
export function getScenarioCanonicalRecord(scenario: 'clean' | 'degraded' | 'failure') {
  if (scenario === 'clean') {
    return {
      metadata: {
        formId: 'f14-clean-shift-a',
        capturedAt: new Date().toISOString(),
        captureQualityScore: 0.96,
        modelUsed: 'Qwen/Qwen2.5-VL-72B-Instruct',
        overallConfidence: 0.96
      },
      header: {
        loomId: { value: 'L-104', confidence: 0.98, isFlagged: false },
        loomType: { value: 'Airjet', confidence: 0.95 },
        date: { value: '2026-11-13', confidence: 0.99, isFlagged: false },
        shift: { value: 'A', confidence: 0.97, isFlagged: false },
        operatorId: { value: 'OP-482', confidence: 0.96, isFlagged: false },
        sortCode: { value: 'S-4040-68', confidence: 0.97, isFlagged: false },
        beamNumber: { value: 'BM-8842', confidence: 0.95, isFlagged: false }
      },
      readings: {
        startPick: { value: 148200, confidence: 0.98 },
        endPick: { value: 349800, confidence: 0.98 },
        netPicks: { extracted: 201600, calculated: 201600, matches: true, confidence: 0.99 },
        netMeters: { value: 75.3, confidence: 0.95, isFlagged: false },
        loomRpm: { value: 800, confidence: 0.96 },
        efficiencyPct: { value: 88.5, confidence: 0.94, isFlagged: false }
      },
      defects: [
        { defectType: 'warp_break', count: 3, severity: 'minor', confidence: 0.95 },
        { defectType: 'weft_break', count: 6, severity: 'minor', confidence: 0.93 },
        { defectType: 'slub', count: 1, severity: 'major', confidence: 0.92 }
      ],
      downtime: [
        { reasonCode: 'beam_knotting', durationMinutes: 45, remarks: 'New beam BM-8842 drawn in', confidence: 0.94 },
        { reasonCode: 'cleaning', durationMinutes: 15, remarks: 'Shift changeover lubrication', confidence: 0.95 }
      ],
      remarks: 'Loom running smoothly at 800 RPM. Beam tension optimal.'
    };
  }

  if (scenario === 'degraded') {
    return {
      metadata: {
        formId: 'f14-degraded-strikethrough',
        capturedAt: new Date().toISOString(),
        captureQualityScore: 0.72,
        modelUsed: 'Qwen/Qwen2.5-VL-72B-Instruct',
        overallConfidence: 0.78
      },
      header: {
        loomId: { value: 'L-1O4', confidence: 0.65, isFlagged: true, suggestedMatch: 'L-104' },
        loomType: { value: 'Airjet', confidence: 0.85 },
        date: { value: '2026-11-13', confidence: 0.95, isFlagged: false },
        shift: { value: 'A', confidence: 0.92, isFlagged: false },
        operatorId: { value: 'OP-482', confidence: 0.88, isFlagged: false },
        sortCode: { value: 'S-4040-68', confidence: 0.90, isFlagged: false },
        beamNumber: { value: 'BM-8842', confidence: 0.85, isFlagged: false }
      },
      readings: {
        startPick: { value: 148200, confidence: 0.94 },
        endPick: { value: 349800, confidence: 0.78, note: 'Extracted overwritten value 349,800 over struck-through 348,200' },
        netPicks: { extracted: 201600, calculated: 201600, matches: true, confidence: 0.90 },
        netMeters: { value: 752.0, confidence: 0.89, isFlagged: false },
        loomRpm: { value: 800, confidence: 0.92 },
        efficiencyPct: { value: 88.0, confidence: 0.85, isFlagged: false }
      },
      defects: [
        { defectType: 'warp_break', count: 3, severity: 'minor', confidence: 0.90 },
        { defectType: 'weft_break', count: 6, severity: 'minor', confidence: 0.88 },
        { defectType: 'oil_stain', count: 2, severity: 'major', confidence: 0.84 }
      ],
      downtime: [
        { reasonCode: 'electrical_fault', durationMinutes: 35, remarks: 'Nozzle 2 air pressure low', confidence: 0.82 },
        { reasonCode: 'yarn_wait', durationMinutes: 25, remarks: 'Cone supply delayed', confidence: 0.85 }
      ],
      remarks: 'Slight weft vibration on right selvedge. Checked by mechanic.'
    };
  }

  // Failure scenario
  return {
    metadata: {
      formId: 'f14-boundary-failure',
      capturedAt: new Date().toISOString(),
      captureQualityScore: 0.58,
      modelUsed: 'Qwen/Qwen2.5-VL-72B-Instruct',
      overallConfidence: 0.52
    },
    header: {
      loomId: { value: 'L-201', confidence: 0.92, isFlagged: false },
      loomType: { value: 'Rapier', confidence: 0.90 },
      date: { value: '2026-11-13', confidence: 0.95, isFlagged: false },
      shift: { value: '', confidence: 0.0, isFlagged: true }, // MISSING SHIFT!
      operatorId: { value: 'OP-482', confidence: 0.90, isFlagged: false },
      sortCode: { value: 'S-4040-68', confidence: 0.85, isFlagged: false },
      beamNumber: { value: 'BM-8842', confidence: 0.80, isFlagged: false }
    },
    readings: {
      startPick: { value: 349800, confidence: 0.92 },
      endPick: { value: 148200, confidence: 0.88 }, // REVERSAL! End < Start
      netPicks: { extracted: -201600, calculated: -201600, matches: false, confidence: 0.40 },
      netMeters: { value: 753.0, confidence: 0.85, isFlagged: true },
      loomRpm: { value: 800, confidence: 0.80 },
      efficiencyPct: { value: 115.0, confidence: 0.60, isFlagged: true } // > 100%!
    },
    defects: [
      { defectType: 'warp_break', count: 14, severity: 'minor', confidence: 0.85 },
      { defectType: 'weft_break', count: 22, severity: 'minor', confidence: 0.80 }
    ],
    downtime: [
      // 540 minutes exceeds 480 minute shift!
      { reasonCode: 'mechanical_breakdown', durationMinutes: 540, remarks: 'Mechanical Motor Burnout replaced', confidence: 0.82 }
    ],
    remarks: 'Complete stoppage due to motor fault. No production.'
  };
}
