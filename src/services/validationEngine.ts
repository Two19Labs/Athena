import { LOOM_MASTER, SORT_MASTER, DOWNTIME_CODES } from '../data/masterData';

export interface ValidationError {
  ruleCode: string;
  field: string;
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  suggestedValue?: any;
}

export interface ValidationResult {
  status: 'PASSED' | 'WARNINGS' | 'FAILED';
  errors: ValidationError[];
  calculated: {
    netPicks: number;
    totalDowntimeMins: number;
    totalRunTimeMins: number;
    expectedMeters: number;
    calculatedEfficiencyPct: number;
  };
}

/**
 * Calculates Levenshtein edit distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Fuzzy matches a noisy handwritten Loom ID (e.g. "L-1O4", "L104", "104") to Master Looms
 */
export function fuzzyMatchLoom(rawText: string): { matchedId: string; confidence: number } | null {
  if (!rawText) return null;
  const cleaned = rawText.trim().toUpperCase().replace(/[\s_]/g, '-');
  
  // Exact match
  const exact = LOOM_MASTER.find(l => l.id === cleaned);
  if (exact) return { matchedId: exact.id, confidence: 1.0 };

  // Strip leading non-digits/prefix (e.g. "104" -> "L-104")
  const numOnly = cleaned.replace(/\D/g, '');
  if (numOnly) {
    const candidate = LOOM_MASTER.find(l => l.id.endsWith(numOnly));
    if (candidate) return { matchedId: candidate.id, confidence: 0.90 };
  }

  // Levenshtein closest match
  let bestMatch = null;
  let minDistance = 999;

  for (const loom of LOOM_MASTER) {
    const dist = levenshteinDistance(cleaned, loom.id);
    if (dist < minDistance && dist <= 2) {
      minDistance = dist;
      bestMatch = loom.id;
    }
  }

  if (bestMatch) {
    return { matchedId: bestMatch, confidence: Number((1.0 - (minDistance * 0.2)).toFixed(2)) };
  }

  return null;
}

/**
 * Fuzzy matches noisy Sort / Fabric code to Master Sorts
 */
export function fuzzyMatchSort(rawText: string): { matchedCode: string; ppi: number; confidence: number } | null {
  if (!rawText) return null;
  const cleaned = rawText.trim().toUpperCase().replace(/[\s_]/g, '-');

  const exact = SORT_MASTER.find(s => s.code === cleaned);
  if (exact) return { matchedCode: exact.code, ppi: exact.ppi, confidence: 1.0 };

  let bestMatch = null;
  let minDistance = 999;

  for (const sort of SORT_MASTER) {
    const dist = levenshteinDistance(cleaned, sort.code);
    if (dist < minDistance && dist <= 3) {
      minDistance = dist;
      bestMatch = sort;
    }
  }

  if (bestMatch) {
    return {
      matchedCode: bestMatch.code,
      ppi: bestMatch.ppi,
      confidence: Number((1.0 - (minDistance * 0.15)).toFixed(2))
    };
  }

  return null;
}

/**
 * Deterministic Textile Physics Validation Engine
 * Evaluates physical conservation laws, odometer monotonicity, and master constraints
 */
export function validateTextileRecord(record: any): ValidationResult {
  const errors: ValidationError[] = [];

  // Extract readings safely
  const startPick = Number(record.readings?.startPick?.value ?? 0);
  const endPick = Number(record.readings?.endPick?.value ?? 0);
  const reportedNetMeters = Number(record.readings?.netMeters?.value ?? 0);
  const reportedRpm = Number(record.readings?.loomRpm?.value ?? 700);
  const reportedEff = Number(record.readings?.efficiencyPct?.value ?? 0);

  // Downtime durations sum
  const downtimes = Array.isArray(record.downtime) ? record.downtime : [];
  const totalDowntimeMins = downtimes.reduce((sum: number, dt: any) => sum + Number(dt.durationMinutes || 0), 0);

  // Shift duration (default standard 8 hours = 480 mins)
  const shiftDurationMins = 480;
  const totalRunTimeMins = Math.max(0, shiftDurationMins - totalDowntimeMins);

  // Calculated Net Picks
  const netPicks = endPick - startPick;

  // 1. Mandatory Header Completeness
  if (!record.header?.loomId?.value) {
    errors.push({
      ruleCode: 'BR-06-LOOM',
      field: 'header.loomId',
      severity: 'CRITICAL',
      message: 'Loom ID is required but missing from form.'
    });
  }

  if (!record.header?.date?.value) {
    errors.push({
      ruleCode: 'BR-06-DATE',
      field: 'header.date',
      severity: 'CRITICAL',
      message: 'Production date is missing.'
    });
  }

  if (!record.header?.shift?.value) {
    errors.push({
      ruleCode: 'BR-06-SHIFT',
      field: 'header.shift',
      severity: 'CRITICAL',
      message: 'Shift indicator (A/B/C) is missing.'
    });
  }

  // 2. Rule BR-02: Counter Monotonicity (Odometer Wrap / Typo)
  if (endPick < startPick) {
    errors.push({
      ruleCode: 'BR-02-MONOTONICITY',
      field: 'readings.endPick',
      severity: 'CRITICAL',
      message: `End pick (${endPick}) cannot be smaller than start pick (${startPick}). Counter reversal or typo detected.`
    });
  }

  // 3. Rule BR-01: Shift Time Conservation
  if (totalDowntimeMins > shiftDurationMins) {
    errors.push({
      ruleCode: 'BR-01-TIME-OVERFLOW',
      field: 'downtime',
      severity: 'CRITICAL',
      message: `Total downtime (${totalDowntimeMins} mins) exceeds total shift duration (${shiftDurationMins} mins). Impossible shift math.`
    });
  } else if (Math.abs((totalRunTimeMins + totalDowntimeMins) - shiftDurationMins) > 15) {
    errors.push({
      ruleCode: 'BR-01-TIME-MISMATCH',
      field: 'downtime',
      severity: 'WARNING',
      message: `Run time (${totalRunTimeMins}m) + Downtime (${totalDowntimeMins}m) deviates by >15 mins from 480 min shift.`
    });
  }

  // 4. Rule BR-03: Pick-to-Meter Plausibility
  // Formula: Meters = Net Picks / (Picks Per Inch * 39.3701 inches per meter)
  const sortCode = record.header?.sortCode?.value;
  const sortMatch = sortCode ? fuzzyMatchSort(sortCode) : null;
  const ppi = sortMatch ? sortMatch.ppi : 68; // fallback standard 68 PPI

  const expectedMeters = netPicks > 0 ? Number((netPicks / (ppi * 39.3701)).toFixed(1)) : 0;

  if (reportedNetMeters > 0 && expectedMeters > 0) {
    const diffPct = Math.abs(reportedNetMeters - expectedMeters) / expectedMeters;
    if (diffPct > 0.15) {
      errors.push({
        ruleCode: 'BR-03-METER-PLAUSIBILITY',
        field: 'readings.netMeters',
        severity: 'WARNING',
        message: `Reported meters (${reportedNetMeters}m) deviates >15% from pick calculation (${expectedMeters}m at ${ppi} PPI). Check decimal placement.`
      });
    }
  }

  // 5. Rule BR-04: Loom Speed & Operating Efficiency Limits
  // Theoretical max picks = Target RPM * Run Minutes
  const theoreticalMaxPicks = reportedRpm * totalRunTimeMins;
  const calculatedEfficiencyPct = theoreticalMaxPicks > 0 
    ? Number(((netPicks / theoreticalMaxPicks) * 100).toFixed(1))
    : 0;

  if (reportedEff > 102) {
    errors.push({
      ruleCode: 'BR-04-EFF-SUPER',
      field: 'readings.efficiencyPct',
      severity: 'WARNING',
      message: `Reported efficiency (${reportedEff}%) exceeds 100% physical limit. Verify operating RPM.`
    });
  } else if (reportedEff < 20 && totalRunTimeMins > 120) {
    errors.push({
      ruleCode: 'BR-04-EFF-SUB',
      field: 'readings.efficiencyPct',
      severity: 'WARNING',
      message: `Extremely low efficiency (${reportedEff}%) for ${totalRunTimeMins} mins of running time.`
    });
  }

  // 6. Rule BR-05: Loom ID Grounding
  if (record.header?.loomId?.value) {
    const rawLoom = record.header.loomId.value;
    const loomMatch = fuzzyMatchLoom(rawLoom);
    if (!loomMatch || (loomMatch && loomMatch.matchedId !== rawLoom)) {
      errors.push({
        ruleCode: 'BR-05-LOOM-GROUNDING',
        field: 'header.loomId',
        severity: 'WARNING',
        message: `Loom "${rawLoom}" not in Master table. Suggested match: "${loomMatch?.matchedId || 'L-101'}"`,
        suggestedValue: loomMatch?.matchedId
      });
    }
  }

  // Determine overall status
  const hasCritical = errors.some(e => e.severity === 'CRITICAL');
  const hasWarnings = errors.some(e => e.severity === 'WARNING');
  const status = hasCritical ? 'FAILED' : hasWarnings ? 'WARNINGS' : 'PASSED';

  return {
    status,
    errors,
    calculated: {
      netPicks: Math.max(0, netPicks),
      totalDowntimeMins,
      totalRunTimeMins,
      expectedMeters,
      calculatedEfficiencyPct
    }
  };
}
