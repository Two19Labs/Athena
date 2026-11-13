import { validateTextileRecord, fuzzyMatchLoom, fuzzyMatchSort } from '../src/services/validationEngine.ts';
import { getScenarioCanonicalRecord } from '../src/generator/formCanvasGenerator.ts';

console.log("====================================================================");
console.log("ATHENA LOOMVISION — AUTOMATED TEST SUITE & VALIDATION GATE");
console.log("====================================================================\n");

let passedCount = 0;
let totalCount = 0;

function assert(condition, message) {
  totalCount++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

// 1. TEST FUZZY MATCHER
console.log("1. Testing Fuzzy Grounding & Master Data Matching...");
const match1 = fuzzyMatchLoom("L-1O4"); // Letter O instead of 0
assert(match1 && match1.matchedId === "L-104", 'Fuzzy matched "L-1O4" to "L-104"');

const match2 = fuzzyMatchLoom("104"); // Just number
assert(match2 && match2.matchedId === "L-104", 'Fuzzy matched "104" to "L-104"');

const match3 = fuzzyMatchSort("S-404068"); // Missing dash
assert(match3 && match3.matchedCode === "S-4040-68", 'Fuzzy matched "S-404068" to "S-4040-68"');

// 2. TEST CASE 1: GOLDEN CLEAN PATH
console.log("\n2. Testing Case 1 (Golden Clean Shift Log)...");
const cleanRec = getScenarioCanonicalRecord('clean');
const cleanVal = validateTextileRecord(cleanRec);
if (cleanVal.errors.length > 0) {
  console.log("  [DEBUG] Case 1 unexpected errors:", JSON.stringify(cleanVal.errors, null, 2));
}
assert(cleanVal.status === 'PASSED', 'Case 1 status is PASSED');
assert(cleanVal.errors.length === 0, 'Case 1 has 0 validation errors');
assert(cleanVal.calculated.netPicks === 201600, 'Case 1 calculated net picks = 201,600');
assert(cleanVal.calculated.totalDowntimeMins === 60, 'Case 1 calculated downtime = 60 mins');
assert(cleanVal.calculated.totalRunTimeMins === 420, 'Case 1 calculated runtime = 420 mins');

// 3. TEST CASE 2: DEGRADED REAL-WORLD PATH
console.log("\n3. Testing Case 2 (Degraded Real-World with Amber Flags)...");
const degradedRec = getScenarioCanonicalRecord('degraded');
const degradedVal = validateTextileRecord(degradedRec);
assert(degradedVal.status === 'WARNINGS', 'Case 2 status is WARNINGS');
const hasLoomWarning = degradedVal.errors.some(e => e.ruleCode === 'BR-05-LOOM-GROUNDING');
assert(hasLoomWarning, 'Case 2 caught BR-05-LOOM-GROUNDING for "L-1O4"');

// 4. TEST CASE 3: CRITICAL BOUNDARY FAILURE
console.log("\n4. Testing Case 3 (Critical Boundary Failure)...");
const failureRec = getScenarioCanonicalRecord('failure');
const failureVal = validateTextileRecord(failureRec);
assert(failureVal.status === 'FAILED', 'Case 3 status is FAILED');

const hasTimeOverflow = failureVal.errors.some(e => e.ruleCode === 'BR-01-TIME-OVERFLOW');
assert(hasTimeOverflow, 'Case 3 caught BR-01-TIME-OVERFLOW (540m > 480m shift)');

const hasMonotonicity = failureVal.errors.some(e => e.ruleCode === 'BR-02-MONOTONICITY');
assert(hasMonotonicity, 'Case 3 caught BR-02-MONOTONICITY (End < Start counter reversal)');

const hasMissingShift = failureVal.errors.some(e => e.ruleCode === 'BR-06-SHIFT');
assert(hasMissingShift, 'Case 3 caught BR-06-SHIFT (Mandatory shift missing)');

console.log("\n====================================================================");
console.log(`TEST RUN COMPLETE: ${passedCount}/${totalCount} tests passed (${Math.round((passedCount/totalCount)*100)}% pass rate).`);
console.log("====================================================================");

if (passedCount !== totalCount) {
  process.exit(1);
}
