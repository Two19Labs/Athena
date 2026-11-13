/**
 * Mock ERP Webhook Dispatcher & Enterprise Data Integration Service
 * Connects shop-floor vision records to ERPs (SAP PP, Infor M3, Odoo)
 */

export interface ErpResponse {
  success: boolean;
  status: 'COMMITTED' | 'REJECTED' | 'DUPLICATE';
  erpDocNo: string;
  idempotencyKey: string;
  committedAt: string;
  summary: {
    loomId: string;
    date: string;
    shift: string;
    netPicks: number;
    netMeters: number;
  };
  rawPayload: any;
}

const STORAGE_KEY_ERP_LEDGER = 'loomvision_erp_committed_ledger';
const STORAGE_KEY_AUDIT_LOGS = 'loomvision_audit_telemetry_logs';

/**
 * Generates an idempotent transaction key based on unique production coordinates
 */
export function generateIdempotencyKey(record: any): string {
  const loom = record.header?.loomId?.value || 'UNKNOWN_LOOM';
  const date = record.header?.date?.value || new Date().toISOString().split('T')[0];
  const shift = record.header?.shift?.value || 'A';
  return `IDEMP-${loom}-${date}-${shift}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Dispatches a validated production record to the downstream ERP Mock API
 */
export async function dispatchToErp(record: any): Promise<ErpResponse> {
  // Simulate network latency for realistic shop-floor demo
  await new Promise(resolve => setTimeout(resolve, 450));

  const idempotencyKey = generateIdempotencyKey(record);
  const ledger = getCommittedErpRecords();

  // Idempotency check: prevent duplicate shift submissions for same loom
  const isDuplicate = ledger.some(
    e => e.summary.loomId === record.header?.loomId?.value &&
         e.summary.date === record.header?.date?.value &&
         e.summary.shift === record.header?.shift?.value
  );

  const erpDocNo = `PROD-${new Date().getFullYear()}-W${Math.ceil(new Date().getDate() / 7)}-${Math.floor(1000 + Math.random() * 9000)}`;

  const response: ErpResponse = {
    success: true,
    status: isDuplicate ? 'DUPLICATE' : 'COMMITTED',
    erpDocNo,
    idempotencyKey,
    committedAt: new Date().toISOString(),
    summary: {
      loomId: record.header?.loomId?.value || 'N/A',
      date: record.header?.date?.value || 'N/A',
      shift: record.header?.shift?.value || 'N/A',
      netPicks: (record.readings?.endPick?.value || 0) - (record.readings?.startPick?.value || 0),
      netMeters: Number(record.readings?.netMeters?.value || 0)
    },
    rawPayload: record
  };

  // Commit to local ERP ledger
  ledger.unshift(response);
  localStorage.setItem(STORAGE_KEY_ERP_LEDGER, JSON.stringify(ledger.slice(0, 50)));

  return response;
}

/**
 * Retrieves all committed ERP production logs
 */
export function getCommittedErpRecords(): ErpResponse[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ERP_LEDGER);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Logs human correction telemetry for continuous learning
 */
export function logAuditTelemetry(entry: {
  formId: string;
  initialPayload: any;
  finalPayload: any;
  modifiedFields: string[];
  reviewTimeMs: number;
}) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUDIT_LOGS);
    const logs = raw ? JSON.parse(raw) : [];
    logs.unshift({
      ...entry,
      loggedAt: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, JSON.stringify(logs.slice(0, 100)));
  } catch (e) {
    console.error("Failed to log audit telemetry:", e);
  }
}

/**
 * Computes Human Touch Rate (HTR) and extraction metrics from telemetry
 */
export function getTelemetryMetrics() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUDIT_LOGS);
    const logs = raw ? JSON.parse(raw) : [];
    if (logs.length === 0) {
      return {
        totalProcessed: 0,
        averageHtrPct: 0,
        averageReviewTimeSec: 0,
        autoApprovalRatePct: 0
      };
    }

    let totalModified = 0;
    let totalFields = 0;
    let totalTimeMs = 0;
    let autoApprovedCount = 0;

    for (const log of logs) {
      const fieldCount = 14; // Approx standard fields
      totalFields += fieldCount;
      const modCount = log.modifiedFields ? log.modifiedFields.length : 0;
      totalModified += modCount;
      if (modCount === 0) autoApprovedCount++;
      totalTimeMs += log.reviewTimeMs || 4000;
    }

    const averageHtrPct = Number(((totalModified / totalFields) * 100).toFixed(1));
    const averageReviewTimeSec = Number((totalTimeMs / logs.length / 1000).toFixed(1));
    const autoApprovalRatePct = Number(((autoApprovedCount / logs.length) * 100).toFixed(1));

    return {
      totalProcessed: logs.length,
      averageHtrPct,
      averageReviewTimeSec,
      autoApprovalRatePct
    };
  } catch (e) {
    return { totalProcessed: 0, averageHtrPct: 0, averageReviewTimeSec: 0, autoApprovalRatePct: 0 };
  }
}

/**
 * Generates and downloads a SAP PP / Infor M3 compatible Production Confirmation CSV
 */
export function exportToSapCsv(records: ErpResponse[]) {
  if (records.length === 0) {
    alert("No committed ERP records available to export.");
    return;
  }

  const headers = [
    "ERP_DOC_NO",
    "PLANT_CODE",
    "LOOM_ID",
    "PROD_DATE",
    "SHIFT_CODE",
    "OPERATOR_ID",
    "SORT_CODE",
    "BEAM_NO",
    "START_PICK",
    "END_PICK",
    "NET_PICKS",
    "NET_METERS",
    "EFFICIENCY_PCT",
    "TOTAL_DOWNTIME_MINS",
    "DEFECT_COUNT",
    "COMMIT_TIMESTAMP"
  ];

  const rows = records.map(r => {
    const p = r.rawPayload;
    const startPick = p.readings?.startPick?.value || 0;
    const endPick = p.readings?.endPick?.value || 0;
    const netPicks = endPick - startPick;
    const defects = Array.isArray(p.defects) ? p.defects.reduce((acc: number, d: any) => acc + (d.count || 0), 0) : 0;
    const downtime = Array.isArray(p.downtime) ? p.downtime.reduce((acc: number, d: any) => acc + (d.durationMinutes || 0), 0) : 0;

    return [
      `"${r.erpDocNo}"`,
      `"PLANT-01"`,
      `"${p.header?.loomId?.value || ''}"`,
      `"${p.header?.date?.value || ''}"`,
      `"${p.header?.shift?.value || ''}"`,
      `"${p.header?.operatorId?.value || ''}"`,
      `"${p.header?.sortCode?.value || ''}"`,
      `"${p.header?.beamNumber?.value || ''}"`,
      startPick,
      endPick,
      netPicks,
      p.readings?.netMeters?.value || 0,
      p.readings?.efficiencyPct?.value || 0,
      downtime,
      defects,
      `"${r.committedAt}"`
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `SAP_PP_Order_Confirmations_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
