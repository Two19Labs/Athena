# SOLUTION NOTE & ARCHITECTURE SPECIFICATION
## Vision-First Shop Floor Digitisation for Textile Manufacturing
**Candidate Submission for:** APLYD by Athena Infonomics | Part of Athena Group  
**Domain:** Textile Manufacturing (Weaving Mills & Loom Operations)  
**Author:** Engineering Assessment Candidate  
**Project Repository:** `Athena LoomVision`  
**Date:** November 2026  

---

## 1. Executive Problem Understanding & Operational Context

In modern textile manufacturing facilities (weaving mills, loom sheds, spinning units), machine telemetry is recorded by hand on paper clipboard forms pinned directly to loom frames. During an 8-hour shift, weavers and loom technicians record:
* **Header Metadata:** Loom ID and Shed Location, Shift (A/B/C), Date, Operator ID, Loom Master Name, Beam Number, Fabric Sort/Quality Code.
* **Production Readings:** Odometer pick counters (Start Pick, End Pick, Net Picks), Net Production in linear meters, Loom average RPM, Operating Efficiency (%).
* **Defect Classification Tally:** Warp breakages, Weft breakages, Slubs/contamination, Oil/grease stains, Reed marks, Floats, Selvedge defects.
* **Downtime & Stoppage Matrix:** Power outages, Warp beam knotting, Mechanical breakdowns, Weft feeder/nozzle jams, Yarn shortages, Cleaning/oiling.
* **Shift Handover & Sign-offs:** Operator remarks and physical signatures.

### The Real-World Pain Points
1. **Reporting Latency (6–24 Hour Blind Spot):** Supervisors collect stacks of 40–120 paper slips at shift changeover and spend 2–4 hours manually typing them into ERP screens. Plant managers cannot detect loom stoppage trends or efficiency drops until the next working day.
2. **Transcription Errors on High-Value Numeric Counters:** A single transposed digit in a 7-digit pick counter (e.g. `349,800` vs `348,200` or confusing `1` with `7`) results in thousands of phantom meters in inventory registers.
3. **Data Loss on Root Causes:** Granular downtime categories and operator notes are systematically skipped by tired supervisors during manual entry to save time, corrupting OEE (Overall Equipment Effectiveness) reporting.

---

## 2. Core Assumptions

1. **Shop-Floor Network Environment:** Factory weaving sheds frequently experience intermittent Wi-Fi coverage due to heavy electromagnetic machinery interference and steel shed structures.
   * *Architecture Assumption:* The mobile capture interface must evaluate image health locally on the device (client-side Canvas) without requiring a server round-trip.
2. **Capture Hardware Baseline:** Mill operators use low-to-mid-tier Android smartphones or shared ruggedized shop-floor tablets equipped with standard 12–50 MP cameras without dedicated neural processing units (NPUs). Heavy multimodal vision inference is therefore hosted on edge cloud endpoints.
3. **Factory Master Data Availability:** The system has read-only access to master data tables (Registered Looms, Fabric Sorts with Picks Per Inch (PPI), Downtime Reason Codes, Worker Rosters) to ground ambiguous OCR predictions.
4. **Physical Shift Constraints:** Standard textile weaving shifts operate on 8.0-hour durations (480 minutes), with conservation of time: $\text{Operating Run Time} + \text{Downtime Stoppages} \approx 480\text{ minutes}$.

---

## 3. End-to-End System Architecture & Data Flow

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
│  • Injected Textile Master Data (Looms L-101..L-220, Sorts S-4040-68, Downtime DT-01)  │
│  • Multi-Model Fallback Cascade:                                                        │
│    Tier 1: Qwen/Qwen2.5-VL-72B-Instruct (highest spatial reasoning)                     │
│    Tier 2: meta-llama/Llama-3.2-11B-Vision-Instruct (resilient fallback)               │
│  • Strict JSON Schema & Normalization with Confidence Scoring (0.00 to 1.00 per field)  │
│  • Handles strikethroughs & pen overwrites                                              │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ Raw Extracted JSON + Field Confidences
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     3. DETERMINISTIC TEXTILE DOMAIN ANOMALY ENGINE                      │
│  • Rule BR-01 [CRITICAL]: Shift Time Conservation (|Run + Downtime - 480m| > 15m)       │
│  • Rule BR-02 [CRITICAL]: Counter Monotonicity (End Pick >= Start Pick)                 │
│  • Rule BR-03 [WARNING]: Pick-to-Meter Plausibility (Net Meters ≈ Picks / PPI)          │
│  • Rule BR-04 [WARNING]: Loom Speed & Efficiency Limits (20% <= Efficiency <= 102%)     │
│  • Rule BR-05 [WARNING]: Master Entity Fuzzy Grounding (Levenshtein distance <= 2)      │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ Validated Schema + Traffic Light Badges
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                4. HUMAN-IN-THE-LOOP (HITL) CONSOLE: `loom-review-modal.js`              │
│  • Split-Screen Layout: Pan/Zoom source image viewer (left) + Editable cards (right)   │
│  • Traffic-Light Cues: 🟢 Green (>= 85% valid) | 🟡 Amber (uncertain) | 🔴 Red (fatal) │
│  • 5-Second Approval Workflow: Tab/Enter jumps exclusively between flagged fields       │
│  • Audit diff tracking AI prediction vs supervisor edit                                 │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ On Approval
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                             5. ERP HANDOFF & CONTINUOUS LEARNING                        │
│  • REST Webhook: POST /api/v1/erp/production-logs with X-Idempotency-Key.               │
│  • Batch Export: Instant CSV download formatted for SAP PP / Infor M3.                  │
│  • Feedback Ledger: Archives (Raw Image, Original AI JSON, Supervisor Edits) to track   │
│    Human Touch Rate (HTR) and retrain future models.                                    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Technology Choices & Trade-Off Analysis

| Architectural Layer | Selected Choice | Considered Alternatives | Trade-Off Analysis & Justification |
| :--- | :--- | :--- | :--- |
| **Vision Extraction Engine** | **Multimodal Vision LLM (Qwen-2.5-VL-72B / Gemini Vision)** | Traditional OCR (Tesseract / AWS Textract / LayoutLM) | **Why Chosen:** Traditional OCR fails catastrophically on cursive handwriting, unstructured notes, and slight paper skew. Traditional OCR only returns disjointed text bounding boxes without semantic understanding. Multimodal LLMs understand tabular cross-relationships (e.g. relating a downtime code to its adjacent duration) and can read crossed-out numbers. |
| **Image Pre-Processing** | **Client-Side HTML5 Canvas Heuristics** | Server-Side OpenCV Pipeline | **Why Chosen:** Gives immediate instant feedback (< 50ms) to the operator holding the phone at the loom frame. If lighting is too dark or overhead fluorescent tube glare blinds the camera, they are warned before uploading, saving network bandwidth and cloud API costs. |
| **Application Framework** | **Vite + React + Tailwind CSS** | Native Mobile App (React Native / Flutter) | **Why Chosen:** Zero-install web URL accessible on any shared tablet or phone browser across the factory floor. Instant startup and responsive desktop/tablet split-screen ergonomics. |
| **Validation Layer** | **Pure TypeScript Deterministic Physics Engine** | Python Backend Microservice | **Why Chosen:** Executes in sub-millisecond real-time on the client as the supervisor types or overrides fields, eliminating network latency during interactive review. |
| **ERP Dispatch Adapter** | **Idempotent REST Webhook + SAP CSV Exporter** | Heavy Proprietary SAP RFC Connector | **Why Chosen:** Production ERPs (SAP, Infor, Odoo, Tally) ingest standard JSON webhooks or scheduled batch CSV file drops. Using idempotency keys guarantees no double-counting if a supervisor hits "Submit" twice. |

---

## 5. Walkthrough of Evaluation Scenarios

The brief specifically mandates demonstrating: *"a successful case and at least one difficult or failed case, including how your design handles it."*

### Scenario 1: Successful Case (The Golden Path)
* **Form Asset:** `sample_form_01_clean.png` (Shift A, Loom L-104, Sort S-4040-68).
* **Shop-Floor Characteristics:** Crisp paper slip, clear black ballpoint pen, balanced 8-hr shift ($\text{Run Time } 420\text{ min} + \text{Downtime } 60\text{ min} = 480\text{ min}$).
* **System Handling:**
  1. *Capture Gate:* 100% luminance pass, 0% glare, zero blur.
  2. *Vision Inference:* $96\%$ aggregate confidence score.
  3. *Validation Engine:* Monotonicity confirmed ($349,800 > 148,200 \rightarrow \text{Net } 201,600$). Pick-to-meter formula verified ($201,600 / (68 \times 39.37) \approx 753\text{ m}$). 0 warnings, 0 critical errors.
  4. *HITL UI:* All cards display green borders. Prominent "1-Click Approve to ERP" button enabled.
  5. *Outcome:* Committed to Mock ERP in $< 2$ seconds with Doc No `PROD-2026-W46-XXXX`.

### Scenario 2: Difficult / Degraded Case (Real Shop-Floor Hazards)
* **Form Asset:** `sample_form_02_degraded.png`.
* **Shop-Floor Characteristics:** 
  * Photo taken at a 20° tilt under mill lighting.
  * Specular glare from overhead fluorescent tubes across bottom right.
  * Oily brown thumbprint over Loom ID box making `"L-104"` appear as `"L-1O4"`.
  * Operator made an error on End Pick, crossed out `348,200` with a blue pen stroke, and wrote `349,800` above it.
* **System Handling:**
  1. *Capture Gate:* Unwarps the 20° perspective skew using canvas quadrilateral homography.
  2. *Vision Inference:* The prompt's strikethrough handling rule correctly ignores the crossed-out `348,200` and extracts `349,800`.
  3. *Validation Engine:* Flags `"L-1O4"` with Amber warning badge. Levenshtein fuzzy string matcher compares `"L-1O4"` against Loom Master and computes a distance of 1 to `"L-104"`.
  4. *HITL UI:* Focus auto-jumps to Loom ID. The supervisor sees the amber badge and a 1-click button: `[ Accept "L-104" ]`.
  5. *Outcome:* Supervisor clicks accept and approves the slip in 3 seconds. The audit ledger logs `{ modifiedFields: ["header.loomId"] }`.

### Scenario 3: Boundary Failure Case (Preventing ERP Pollution)
* **Form Asset:** `sample_form_03_failure.png`.
* **Shop-Floor Characteristics:** 
  * Creased/folded paper.
  * Operator omitted the mandatory Shift box (left completely blank).
  * Downtime duration logged as `540 minutes` (9 hours) on an 8-hour shift.
  * End Pick logged as `148,200` while Start Pick was `349,800` (Negative Pick delta = `-201,600`).
* **System Handling:**
  1. *Vision Inference:* Extracts the raw numbers as written on paper without hallucinating false corrections.
  2. *Validation Engine:* Fires critical fatal errors:
     * `BR-06-SHIFT`: Shift indicator missing.
     * `BR-02-MONOTONICITY`: End pick lower than start pick (counter reversal).
     * `BR-01-TIME-OVERFLOW`: Total downtime (540m) > shift duration (480m).
  3. *HITL UI:* Red alert banners dominate the top of the modal. The "Approve to ERP" button is **disabled**.
  4. *Outcome:* The system guarantees that corrupt data never reaches the ERP ledger. The supervisor either corrects the numbers or marks the physical slip as rejected back to the loom technician.

---

## 6. Reliability Metrics & Workflow Improvement Over Time

### Key Telemetry Metrics
1. **Human Touch Rate (HTR):**
   $$\text{HTR} = \frac{\text{Fields Modified by Supervisor}}{\text{Total Extracted Fields}} \times 100$$
   * Target: $\text{HTR} < 8\%$ across typical mill operations.
2. **Time-to-ERP:** Average seconds elapsed from capture to ERP commit.
   * Target: $< 15$ seconds per form (representing a $>90\%$ time reduction vs. 2–3 minutes of manual transcription).
3. **First-Pass Auto-Approval Yield:** Percentage of shift logs that pass with 100% green status requiring zero supervisor edits.

### Continuous Learning & Active Learning Loop
Every shift log submission appends an immutable telemetry event to `shopfloor_audit_ledger`:
```json
{
  "form_id": "f14-degraded-strikethrough",
  "raw_image_hash": "sha256:7f83b1...",
  "initial_ai_payload": { "loomId": "L-1O4", "endPick": 349800 },
  "supervisor_final_payload": { "loomId": "L-104", "endPick": 349800 },
  "modified_fields": ["header.loomId"],
  "review_time_ms": 3200,
  "failure_category": "HANDWRITING_AMBIGUITY"
}
```
* **Weekly Automated Mining:** Clustering supervisor overrides reveals recurring weaver handwriting patterns (e.g. weaver on Loom 14 writes `7` with a crossbar that gets mistaken for `4`). The system dynamically updates few-shot prompt examples and curates fine-tuning datasets for future edge LoRA models.

---

## 7. Known Limitations & Future Roadmap (Post-POC)

### Current POC Limitations
1. **Cloud API Dependency:** Relies on cloud-hosted multimodal endpoints (Hugging Face / Gemini). In underground weaving basements with zero internet connectivity, requests queue until Wi-Fi is restored.
2. **Extreme Physical Damage:** If a form is torn in half or completely drenched in black machine grease, vision extraction degrades to manual entry.

### Production Roadmap ("What We Would Build Next With More Time")
1. **On-Premise Quantized Edge Inference:** Deploy quantized `Qwen-2.5-VL-7B-Instruct` or `Moondream2` running locally on a factory-floor edge workstation (e.g. NVIDIA Jetson Orin or RTX 4070) for 100% offline, zero-latency inference.
2. **Visual Bounding-Box Alignment:** Regress exact pixel bounding boxes for every field, rendering interactive highlight overlays on the image viewer that highlight the exact crop when focusing on an input.
3. **Automated LoRA Fine-Tuning Pipeline:** A scheduled monthly cron job that takes verified supervisor corrections and fine-tunes a domain-adapted vision LoRA adapter, progressively driving the Human Touch Rate below 2%.
