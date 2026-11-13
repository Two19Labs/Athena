# MASTER PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Vision-First Shop Floor Digitisation for Textile Manufacturing
**Project Name:** `Athena LoomVision` (Industrial Shop Floor Vision Digitizer)  
**Client / Assessment Brief:** APLYD by Athena Infonomics | Part of Athena Group  
**Target Domain:** Textile Manufacturing (Weaving Sheds & Fabric Mills)  
**Evaluation Scope:** 7-Day Assessment POC & Production Architecture Roadmap  
**Document Version:** 3.0.0 (Master Final Specification)  
**Status:** Approved for Build  

---

## 1. Executive Summary & Assessment Alignment

### 1.1 The Context & The Core Problem
In textile manufacturing facilities (weaving mills, loom sheds, spinning units), production telemetry is recorded by hand on physical paper clipboard sheets affixed to individual looms. During an 8-hour shift, weavers and loom technicians record:
* **Header Metadata:** Loom ID and Shed Location, Shift (A/B/C), Date, Operator/Weaver ID, Loom Master Name, Beam Number, Fabric Sort/Quality Code (e.g., 60s Cambric, 40s Sheeting, 2/20s Denim Twill).
* **Production Readings:** Pick counter odometer readings (Start Pick, End Pick, Net Picks), Net Production in linear meters, Loom average RPM, Operating Efficiency (%).
* **Defect Classification Tally:** Warp breakages, Weft breakages, Slubs/contamination, Oil/grease stains, Reed marks, Floats, Selvedge defects.
* **Downtime & Stoppage Matrix:** Power outages, Warp beam knotting/gaiting, Mechanical breakdowns, Weft feeder/nozzle jams, Yarn shortages, Cleaning/oiling, Meal/handover.
* **Shift Handover & Sign-offs:** Operator remarks ("loom vibrating on high speed", "weft tension loose"), physical operator and supervisor signatures.

**The Bottleneck:** At the end of every shift, supervisors collect 40 to 120 paper forms and spend 2 to 4 hours manually transcribing them into ERP terminals (e.g., SAP PP/QM, Infor M3, Odoo, or bespoke factory ERPs). This introduces:
1. **6 to 24-hour reporting latency:** Plant managers cannot spot downtime trends or beam exhaustion until the next day.
2. **High transcription error rates:** Digit transposition errors in critical 7-digit pick counters (e.g., mistaking `1` for `7`, `0` for `8`).
3. **Lost operational intelligence:** Granular downtime reasons and operator notes are frequently skipped during manual entry to save time, corrupting OEE (Overall Equipment Effectiveness) reporting.

### 1.2 The Solution
`Athena LoomVision` is a vision-first shop-floor digitization pipeline designed for low-cost Android phones and shared ruggedized factory tablets. An operator or supervisor snaps a photo of the clipboard sheet. The system:
1. **Normalizes the Image:** Evaluates lighting/glare/blur before processing and applies 4-corner perspective deskewing.
2. **Extracts Structured Data via Multimodal Vision AI:** Extracts headers, pick counters, defect matrices, and downtime logs into strict JSON with field-level confidence ratings.
3. **Validates Textile Domain Physics:** Enforces shift time conservation, counter monotonicity, pick-to-meter plausibility, and fuzzy master data grounding.
4. **Enables 5-Second HITL Review:** Surfaces an ergonomic side-by-side inspection console with traffic-light badges (Green/Amber/Red) and exception-only keyboard tabbing.
5. **Dispatches ERP-Ready Records:** Transmits validated records to downstream ERP endpoints via idempotent REST webhooks and structured CSV/JSON exports, while archiving audit trails for continuous learning.

### 1.3 How Previous "ERP" Learnings Accelerate This Solution
In our previous ERP system (`c:\Users\adity\Downloads\erp`), we built:
* **Multimodal Extraction (`supabase/functions/parse-bill/index.ts`):** Ingesting messy, unstructured inputs via Hugging Face Router with prioritized fallback models (`Qwen/Qwen2.5-VL-72B-Instruct`, `meta-llama/Llama-3.2-11B-Vision-Instruct`), exponential backoff on 503/429, defensive JSON sanitization, and prompt injection of master lists.
* **Entity Grounding & Fuzzy Matching:** Matching noisy handwritten text against master database entities using bigram and Levenshtein similarity.
* **Review Console (`bill-modal.js`):** Dynamic modal injection, metadata headers, active alert banners with critical/warning styling, editable line-item tables, and role-based actions.

In `Athena LoomVision`, we elevate these exact battle-tested components into industrial textile manufacturing.

---

## 2. Assessment Matrix & Requirement Mapping

The assessment brief mandates specific explorations. Below is how every single requirement is engineered into the system:

| Assessment Brief Requirement | Engineered Feature in `Athena LoomVision` | Technical Implementation |
| :--- | :--- | :--- |
| **Real Shop-Floor Conditions** (lighting, skew, handwriting, stains, incomplete forms) | • Client-side Pre-Flight Quality Gate<br>• 4-point Perspective Homography<br>• Contrast & Adaptive Normalization | • Canvas luminance histogram ($<40 \rightarrow$ dark alert)<br>• Specular glare detector ($>15\% \rightarrow$ tilt alert)<br>• Laplacian variance blur detector ($<100 \rightarrow$ shake alert)<br>• Strikethrough & handwriting correction prompt rules |
| **Field Identification & Ambiguous Entries** (varying layouts, unreadable entries) | • Layout-Invariant Multimodal Vision Engine<br>• Field-Level Confidence Scoring<br>• Master Entity Fuzzy Grounding | • Qwen-2.5-VL-72B / Gemini Vision cascade<br>• Confidence score ($0.00$ to $1.00$) per field<br>• Levenshtein distance $\le 2$ matching against Loom Master (`L-101`..`L-220`) and Sort Master (`S-4040-68`) |
| **Human Review, Correction & Approval** (supervisor workflow before submission) | • Split-Screen HITL Console (`loom-review-modal.js`)<br>• Traffic-Light Visual Hierarchy<br>• 5-Second Rapid Approval UX | • Left: Interactive Pan/Zoom source image viewer<br>• Right: Grouped form with Green/Amber/Red badges<br>• `Tab` jumps exclusively between Amber/Red fields<br>• Audit diff tracking AI prediction vs supervisor edit |
| **Validation, Structuring & ERP Handoff** (mock API or export) | • Deterministic Textile Domain Physics Engine<br>• Mock ERP REST Webhook Listener<br>• Batch ERP File Exporter | • Time balance conservation ($480 \pm 15$ min)<br>• Monotonic counter validation ($\text{End} \ge \text{Start}$)<br>• Pick-to-Meter formula check ($\text{Meters} \approx \text{Picks}/\text{PPI}$)<br>• `POST /api/v1/erp/production-logs` with `X-Idempotency-Key`<br>• SAP PP / Infor M3 compatible CSV export |
| **Reliability Metrics & Continuous Improvement** (measuring accuracy, failure cases) | • Telemetry & Accuracy Dashboard<br>• Active Learning & Feedback Store | • Metrics: CER, FER, Human Touch Rate (HTR), Time-to-ERP<br>• Captures `{ rawImage, initialAI, supervisorEdits }` to refine few-shot prompts and LoRA models |
| **Test Cases (Successful & Failed)** | • Dedicated 3-Scenario Interactive Suite | • Case 1: Golden Path (`clean_shift.png`)<br>• Case 2: Degraded Real-World (`skewed_grease_strikethrough.png`)<br>• Case 3: Critical Failure (`boundary_failure.png`) |

---

## 3. End-to-End System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                1. SHOP FLOOR CAPTURE UI                                 │
│  [Operator Device: Mobile / Tablet Browser]                                             │
│  - Native camera capture / file drag-and-drop.                                          │
│  - Client-side Pre-Flight Quality Gate:                                                 │
│    • Mean luminance check (< 40 = too dark, warn to turn on loom torch).                │
│    • Glare detection (> 15% blown-out white pixels from overhead tube lights).           │
│    • Laplacian variance blur detector (< 100 = blurry, prompt retake).                  │
│    • Auto-crop & 4-corner perspective unwarping via Canvas homography.                  │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ WebP / Base64 image payload
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│              2. SUPABASE EDGE FUNCTION: `parse-loom-slip` (Vision Engine)               │
│  (Adapted from `supabase/functions/parse-bill/index.ts`)                                │
│                                                                                         │
│  • Injected Textile Master Data:                                                        │
│    - Loom Master: L-101 to L-120 (Airjet Shed A), L-201 to L-220 (Rapier Shed B).        │
│    - Fabric Sort Master: S-6060-92 (Cambric), S-4040-68 (Sheeting), D-2020-54 (Denim).  │
│    - Downtime Master: DT-01 (Knotting), DT-02 (Electrical), DT-03 (Feeder), etc.        │
│    - Defect Master: Warp break, Weft stop, Reed mark, Oil stain, Slub, Float.           │
│                                                                                         │
│  • Multi-Model Fallback Cascade with Retry:                                             │
│    Tier 1: Qwen/Qwen2.5-VL-72B-Instruct / Gemini 1.5-2.0 Flash (high spatial accuracy)  │
│    Tier 2: meta-llama/Llama-3.2-11B-Vision-Instruct (resilient fallback)               │
│    Tier 3: Exponential backoff on HTTP 429 / 503.                                       │
│                                                                                         │
│  • Strict JSON Schema & Normalization:                                                  │
│    - Per-field extraction confidence scores (0.00 to 1.00).                             │
│    - Strikethrough & handwriting correction handling.                                   │
│    - Stripping ```json markdown fences & structural coercion.                           │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ Raw Extracted JSON + Field Confidences
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     3. DETERMINISTIC TEXTILE DOMAIN ANOMALY ENGINE                      │
│  (Elevating `phase7_suspicious_bill_alerts.sql` into Textile Physics Rules)             │
│                                                                                         │
│  • Rule BR-01 [CRITICAL]: Shift Time Balance Conservation                               │
│    | (Run Time + Downtime) - 480 mins | > 15 mins → Flag time overflow / underflow.     │
│  • Rule BR-02 [CRITICAL]: Counter Monotonicity                                          │
│    End Pick < Start Pick (without rollover flag) → Block negative production.           │
│  • Rule BR-03 [WARNING]: Pick-to-Meter Plausibility                                     │
│    Net Meters ≈ Net Picks / (PPI * 39.37) ± 10% → Detect meter count typos.             │
│  • Rule BR-04 [WARNING]: Loom Speed & Efficiency Limits                                 │
│    Efficiency > 102% or < 25% → Flag impossible loom RPM / speed values.                │
│  • Rule BR-05 [WARNING]: Master Entity Fuzzy Grounding                                  │
│    Fuzzy Levenshtein matching on messy handwriting (e.g. "L-1O4" → "L-104").           │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ Validated Schema + Color Badges
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                4. HUMAN-IN-THE-LOOP (HITL) CONSOLE: `loom-review-modal.js`              │
│  (Evolved from `c:\Users\adity\Downloads\erp\bill-modal.js`)                            │
│                                                                                         │
│  • Split-Screen / Side-by-Side Review Experience:                                       │
│    - Left Pane: Interactive Pan/Zoom source image viewer with bounding overlays.        │
│    - Right Pane: Grouped form fields (Header, Readings, Defects, Downtime).             │
│                                                                                         │
│  • Traffic-Light Visual Cues:                                                           │
│    🟢 Green Border: High confidence (≥ 85%) & all mathematical rules pass.              │
│    🟡 Amber Border: Low confidence (50-84%) or fuzzy master match.                      │
│    🔴 Red Border: Fatal validation error or empty mandatory field.                      │
│                                                                                         │
│  • 5-Second Approval Workflow:                                                          │
│    - If 100% Green: Prominent "1-Click Approve to ERP" button.                          │
│    - Smart Tabbing: Tab / Enter jumps exclusively through Amber and Red fields.         │
│    - Audit Diff Tracking: Tracks which fields the supervisor manually edited.           │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ On Approval
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                             5. ERP HANDOFF & CONTINUOUS LEARNING                        │
│  • REST Webhook: POST /api/v1/erp/production-logs with X-Idempotency-Key.               │
│  • Batch Export: Instant CSV download formatted for SAP PP / Infor M3.                  │
│  • Feedback Ledger: Archives (Raw Image, Original AI JSON, Supervisor Edits) to track:  │
│    - Human Touch Rate (HTR = % of fields manually corrected).                           │
│    - Common digit confusions (1 vs 7, 0 vs 8) to refine prompt few-shots.               │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Complete Data Models & Schemas

### 4.1 Canonical Schema (`TextileProductionRecord`)

```typescript
export interface TextileProductionRecord {
  metadata: {
    formId: string;                     // UUID
    capturedAt: string;                 // ISO8601 Timestamp
    operatorUserId: string;             // User token/ID
    captureQualityScore: number;        // 0.0 to 1.0 (client-evaluated)
    processingTimeMs: number;
    modelUsed: string;
    overallConfidence: number;          // 0.0 to 1.0
  };
  header: {
    loomId: FieldValue<string>;         // e.g. "L-104"
    loomType: FieldValue<'Airjet' | 'Rapier' | 'Projectile' | 'Shuttle'>;
    date: FieldValue<string>;           // "YYYY-MM-DD"
    shift: FieldValue<'A' | 'B' | 'C' | 'General'>; // 8-hour shifts
    operatorId: FieldValue<string>;     // e.g. "OP-482"
    operatorName?: FieldValue<string>;
    sortCode: FieldValue<string>;       // e.g. "S-4040-68"
    fabricDescription?: FieldValue<string>;
    beamNumber: FieldValue<string>;     // e.g. "BM-9921"
  };
  readings: {
    startPick: FieldValue<number>;      // Counter at shift start
    endPick: FieldValue<number>;        // Counter at shift end
    netPicks: {
      extracted: number;
      calculated: number;
      matches: boolean;
      confidence: number;
    };
    netMeters: FieldValue<number>;      // Fabric produced in meters
    loomRpm: FieldValue<number>;        // Operating speed (e.g. 650 RPM)
    efficiencyPct: FieldValue<number>;  // Calculated vs Reported (0-100%)
  };
  defects: Array<{
    defectType: 'warp_break' | 'weft_break' | 'slub' | 'oil_stain' | 'reed_mark' | 'float' | 'other';
    count: number;
    severity: 'minor' | 'major';
    confidence: number;
  }>;
  downtime: Array<{
    reasonCode: 'power_outage' | 'mechanical_breakdown' | 'electrical_fault' | 'beam_knotting' | 'yarn_wait' | 'cleaning' | 'other';
    durationMinutes: number;
    remarks?: string;
    confidence: number;
  }>;
  summary: {
    shiftDurationMinutes: number;       // Typically 480 minutes
    totalDowntimeMinutes: number;
    totalRunTimeMinutes: number;
    calculatedEfficiencyPct: number;
    validationStatus: 'PASSED' | 'WARNINGS' | 'FAILED';
    validationErrors: ValidationError[];
  };
  supervision: {
    status: 'auto_approved' | 'pending_review' | 'manually_corrected' | 'rejected';
    reviewedBy?: string;
    reviewedAt?: string;
    correctedFields: string[];          // Keys of modified fields
    supervisorNotes?: string;
  };
}

export interface FieldValue<T> {
  value: T;
  confidence: number;                  // 0.0 to 1.0
  isFlagged: boolean;
  rawText?: string;
  suggestedMatch?: string;             // Master data fuzzy match
}

export interface ValidationError {
  ruleCode: string;
  severity: 'WARNING' | 'CRITICAL';
  field: string;
  message: string;
}
```

### 4.2 Factory Grounding Master Entities
* **Loom Master:**
  * Air-jet Shed A: `L-101` through `L-120` (Target RPM: 650–850).
  * Rapier Shed B: `L-201` through `L-220` (Target RPM: 450–600).
* **Fabric Sort Master:**
  * `S-6060-92`: 60s Cambric / 92 picks/inch (PPI) / Air-jet / Width 50".
  * `S-4040-68`: 40s Sheeting / 68 picks/inch (PPI) / Air-jet / Width 63".
  * `D-2020-54`: 20s Denim Twill / 54 picks/inch (PPI) / Rapier / Width 58".
* **Downtime Master Codes:**
  * `DT-01`: Beam Knotting / Gaiting.
  * `DT-02`: Electrical / Inverter Trip.
  * `DT-03`: Weft Feeder Jam / Nozzle Fault.
  * `DT-04`: Mechanical Breakdown.
  * `DT-05`: Yarn Wait / Supply Shortage.
  * `DT-06`: Scheduled Maintenance & Cleaning.

---

## 5. Deterministic Validation Engine (Textile Domain Physics)

| Rule ID | Rule Name | Physics / Formula | Severity | Action & UI Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `BR-01` | **Time Balance Conservation** | $\lvert (\text{Run Time} + \sum \text{Downtime}) - 480 \rvert > 15 \text{ min}$ | **CRITICAL** | Red highlight on Downtime table; blocks submission until reconciled. |
| `BR-02` | **Counter Monotonicity** | $\text{End Pick} < \text{Start Pick}$ (without odometer rollover flag) | **CRITICAL** | Red flag on pick readings; prevents negative production record. |
| `BR-03` | **Pick-to-Meter Plausibility** | $\text{Calculated Meters} = \frac{\text{Net Picks}}{\text{PPI} \times 39.37}$<br>Discrepancy $> 10\%$ vs written meters | **WARNING** | Amber flag on meters; prompts supervisor to verify decimal placement. |
| `BR-04` | **Physical Efficiency Limit** | $\text{Efficiency} > 102\%$ or $< 25\%$ | **WARNING** | Amber badge; flags possible typo in runtime or loom RPM. |
| `BR-05` | **Loom Master Grounding** | Extracted Loom ID $\notin \text{Loom Master}$ | **WARNING** | Amber suggestion dropdown showing Levenshtein nearest valid loom. |
| `BR-06` | **Mandatory Header Fields** | Date, Shift, Loom ID, or Operator ID is null | **CRITICAL** | Red border; jump focus directly to missing input. |

---

## 6. The 3 Evaluation Test Cases (Required by Brief)

To directly fulfill the brief's requirement (*"a brief walkthrough showing a successful case and at least one difficult or failed case"*), we include three physical test fixtures:

### Case 1: The Golden Path (`sample_form_01_clean.png`)
* **Physical Condition:** Clean clipboard, crisp printed form, black ballpoint pen, legible digits, balanced shift hours ($\text{Run } 420\text{ min} + \text{Downtime } 60\text{ min} = 480\text{ min}$).
* **System Behavior:** 
  * Pre-flight: 100% luminance pass, zero glare, zero blur.
  * Extraction: $96\%$ overall confidence.
  * Validation: 0 warnings, 0 critical errors.
  * HITL UI: All green badges, prominent "1-Click Quick Approve to ERP" button.
  * Approval time: $< 2$ seconds.

### Case 2: Degraded Real-World Shop-Floor Case (`sample_form_02_degraded.png`)
* **Physical Condition:** Photo taken at a 20° tilt under yellow mill lighting; grease thumbprint over Loom ID making it look like `"L-1O4"`; operator crossed out `1420` picks and rewrote `1480` above it; faint blue ink.
* **System Behavior:**
  * Pre-flight: Perspective homography auto-straightens the 20° tilt; contrast normalization clarifies faint ink.
  * Extraction: System infers the corrected pick count `1480` (ignores crossed-out `1420`); flags Loom ID with 65% confidence.
  * Validation: Fuzzy grounding recognizes `"L-1O4"` as `"L-104"` with Amber warning badge.
  * HITL UI: Focus auto-jumps to Loom ID; supervisor clicks suggested `"L-104"` and approves in 3 seconds.

### Case 3: Critical Boundary Failure Case (`sample_form_03_failure.png`)
* **Physical Condition:** Creased paper; missing shift identifier; operator logged `540 minutes` downtime on an 8-hour (480 min) shift; end pick is lower than start pick (`ERR_PICK_NEGATIVE`).
* **System Behavior:**
  * Pre-flight: Passes basic contrast.
  * Extraction: Successfully extracts raw scribbled numbers.
  * Validation: Anomaly engine fires `ERR_TIME_OVERFLOW` (Downtime 540 > 480) and `ERR_PICK_NEGATIVE` (End < Start) with Red severity.
  * HITL UI: Red alert banners at top of modal; "Approve to ERP" button is **disabled**; supervisor is forced to correct the values or mark the slip as rejected.

---

## 7. Metrics, Telemetry & Continuous Improvement

The assessment brief explicitly asks: *"How you would measure reliability, identify failure cases and improve the workflow over time."*

### 7.1 Key Reliability Metrics
1. **Character Error Rate (CER) & Field Error Rate (FER):** Measured by comparing raw AI extracted text against final supervisor approved values.
2. **Human Touch Rate (HTR):**
   $$\text{HTR} = \frac{\text{Number of Fields Modified by Supervisor}}{\text{Total Extracted Fields}} \times 100$$
   * Target: $\text{HTR} < 8\%$ across all shifts.
3. **Time-to-ERP:** Time elapsed from photo capture to ERP webhook commit.
   * Target: $< 15$ seconds per form (vs. 2–3 minutes manual data entry).
4. **First-Pass Auto-Approval Yield:** Percentage of forms that pass with 100% green status and zero human corrections.

### 7.2 The Continuous Learning Loop
Every form submission writes an immutable telemetry record to `shopfloor_audit_ledger`:
```json
{
  "form_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "raw_image_hash": "sha256:7f83b165...",
  "original_ai_payload": { ... },
  "supervisor_final_payload": { ... },
  "modified_fields": ["header.loomId", "readings.netMeters"],
  "supervisor_review_time_ms": 4200,
  "failure_category": "HANDWRITING_AMBIGUITY"
}
```
* **Weekly Mining:** Automatically clusters corrected fields to detect:
  * Persistent digit confusion (e.g. `1` vs `7` on a specific weaver's handwriting) $\rightarrow$ updates dynamic few-shot prompt examples.
  * Form layout drift (e.g. mill introducing a new 3-column downtime layout) $\rightarrow$ alerts engineers to update schema.

---

## 8. Complete Step-by-Step Build Plan

Here is the exact phased build sequence to create the runnable prototype, assets, and documentation:

### Step 1: Project Scaffolding & Shared Data
* Set up a clean, modern web application structure in `c:\Users\adity\Downloads\Athena`.
* Establish shared types, constants, textile master data (Looms, Sorts, Downtimes, Defects).

### Step 2: Realistic Textile Form Generator & Test Assets
* Create an SVG/Canvas synthetic paper form renderer matching an authentic textile weaving production slip.
* Generate and store the 3 test fixtures (`sample_form_01_clean.png`, `sample_form_02_degraded.png`, `sample_form_03_failure.png`).

### Step 3: Client-Side Capture & Pre-Flight Quality Gate
* Implement the camera/file upload handler.
* Implement the image analysis heuristics:
  * Luminance check (dark shed warning).
  * Glare detector (overhead fluorescent tube reflection).
  * Laplacian blur detector (camera shake).
  * 4-point perspective crop & deskewing.

### Step 4: Vision Extraction Engine (`parse-loom-slip`)
* Adapt the proven `parse-bill` architecture:
  * Multimodal prompt tailored to textile logs with strikethrough handling and confidence scoring.
  * Multi-model fallback cascade (Qwen-2.5-VL-72B / Gemini / Llama-3.2-Vision).
  * JSON extraction, cleaning, and normalization.

### Step 5: Deterministic Anomaly & Physics Engine
* Implement the business logic rules:
  * Time balance conservation ($480 \pm 15$ mins).
  * Pick counter monotonicity ($\text{End} \ge \text{Start}$).
  * Pick-to-meter calculation check.
  * Efficiency bounds ($20\% - 102\%$).
  * Levenshtein fuzzy string matcher for Loom IDs and Sort Codes.

### Step 6: Ergonomic HITL Review Console (`loom-review-modal.js`)
* Adapt `bill-modal.js` into a split-screen review station:
  * Left: Pan/zoom source image viewer with highlighted zones.
  * Right: Grouped form with traffic-light status badges (Green/Amber/Red).
  * Keyboard navigation: `Tab` jumps exclusively across Amber and Red fields.
  * 1-Click "Approve & Dispatch to ERP".
  * Diff tracking AI vs Supervisor edits.

### Step 7: Downstream Mock ERP & Export
* Mock ERP REST endpoint (`POST /api/v1/erp/production-logs`) with idempotency key.
* Live ERP response drawer showing committed payload.
* CSV export matching SAP PP / Infor M3 production order confirmation format.

### Step 8: Telemetry Dashboard & Walkthrough Demo Switcher
* Interactive test runner in the UI allowing 1-click execution of the 3 assessment test cases.
* Live metrics display (Confidence, Error flags, Review time, HTR).

### Step 9: Final Documentation & Solution Note
* Create `SOLUTION_NOTE.md` containing all required sections from the brief:
  * Assumptions, data flow, architecture sketch, technology choices, trade-offs, limitations, and future roadmap.
* Create `README.md` with runnable setup instructions.
