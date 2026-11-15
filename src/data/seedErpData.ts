// Pre-seeded production orders for the live ERP ledger
// Simulates an active weaving mill shift with real production records

export const INITIAL_ERP_RECORDS = [
  {
    erpDocNo: "PROD-2026-W46-1042",
    idempotencyKey: "IDEMP-L101-2026-11-13-A-01",
    committedAt: "2026-11-13T07:15:00.000Z",
    status: "COMMITTED",
    supervisorStatus: "auto_approved",
    rawPayload: {
      metadata: { formId: "F14-L101-01", overallConfidence: 0.97, captureQualityScore: 0.95 },
      header: {
        loomId: { value: "L-101", confidence: 0.98 },
        loomType: { value: "Airjet" },
        date: { value: "2026-11-13" },
        shift: { value: "A" },
        operatorId: { value: "OP-401" },
        operatorName: { value: "Ramesh Kumar" },
        sortCode: { value: "S-6060-92" },
        beamNumber: { value: "BM-7719" }
      },
      readings: {
        startPick: { value: 110400 },
        endPick: { value: 312000 },
        netPicks: { calculated: 201600 },
        netMeters: { value: 55.6 },
        loomRpm: { value: 750 },
        efficiencyPct: { value: 89.2 }
      },
      defects: [
        { defectType: "warp_break", count: 2, severity: "minor" },
        { defectType: "weft_break", count: 4, severity: "minor" }
      ],
      downtime: [
        { reasonCode: "DT-06", durationMinutes: 20, remarks: "Shift changeover cleaning" },
        { reasonCode: "DT-03", durationMinutes: 15, remarks: "Weft feeder clear" }
      ],
      remarks: "Loom ran smoothly. Warp tension stable."
    }
  },
  {
    erpDocNo: "PROD-2026-W46-1043",
    idempotencyKey: "IDEMP-L102-2026-11-13-A-02",
    committedAt: "2026-11-13T07:22:00.000Z",
    status: "COMMITTED",
    supervisorStatus: "auto_approved",
    rawPayload: {
      metadata: { formId: "F14-L102-02", overallConfidence: 0.95, captureQualityScore: 0.92 },
      header: {
        loomId: { value: "L-102", confidence: 0.97 },
        loomType: { value: "Airjet" },
        date: { value: "2026-11-13" },
        shift: { value: "A" },
        operatorId: { value: "OP-402" },
        operatorName: { value: "Suresh Patil" },
        sortCode: { value: "S-4040-68" },
        beamNumber: { value: "BM-8102" }
      },
      readings: {
        startPick: { value: 84000 },
        endPick: { value: 282000 },
        netPicks: { calculated: 198000 },
        netMeters: { value: 73.9 },
        loomRpm: { value: 750 },
        efficiencyPct: { value: 87.5 }
      },
      defects: [
        { defectType: "warp_break", count: 4, severity: "minor" },
        { defectType: "slub", count: 1, severity: "major" }
      ],
      downtime: [
        { reasonCode: "DT-01", durationMinutes: 40, remarks: "Warp knotting new beam" }
      ],
      remarks: "Beam drawn in successfully."
    }
  },
  {
    erpDocNo: "PROD-2026-W46-1044",
    idempotencyKey: "IDEMP-L201-2026-11-13-A-03",
    committedAt: "2026-11-13T07:35:00.000Z",
    status: "COMMITTED",
    supervisorStatus: "manually_corrected",
    rawPayload: {
      metadata: { formId: "F14-L201-03", overallConfidence: 0.84, captureQualityScore: 0.78 },
      header: {
        loomId: { value: "L-201", confidence: 0.95 },
        loomType: { value: "Rapier" },
        date: { value: "2026-11-13" },
        shift: { value: "A" },
        operatorId: { value: "OP-501" },
        operatorName: { value: "Kishore Naik" },
        sortCode: { value: "D-2020-54" },
        beamNumber: { value: "BM-9230" }
      },
      readings: {
        startPick: { value: 45000 },
        endPick: { value: 185000 },
        netPicks: { calculated: 140000 },
        netMeters: { value: 65.8 },
        loomRpm: { value: 550 },
        efficiencyPct: { value: 84.8 }
      },
      defects: [
        { defectType: "weft_break", count: 8, severity: "minor" },
        { defectType: "oil_stain", count: 1, severity: "major" }
      ],
      downtime: [
        { reasonCode: "DT-04", durationMinutes: 50, remarks: "Rapier guide replaced" },
        { reasonCode: "DT-06", durationMinutes: 15, remarks: "Shift lubrication" }
      ],
      remarks: "Rapier gripper tension adjusted."
    }
  }
];
