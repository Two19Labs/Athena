# APLYD Demonstration Walkthrough Guide & Video Script

**Target Evaluation:** Athena Infonomics Assessment Presentation  
**Product:** APLYD — Vision-First Shop Floor Digitisation  

---

## Overview of the Walkthrough Narrative

The demonstration is organized into **5 concise chapters** designed to showcase both technical depth and operational practicality:

```
+-----------------------------------------------------------------------------------------------+
| 1. The Mill Problem  →  2. Case A (Golden Path)  →  3. Case B (Ambiguity)  →  4. Case C (Fail)|
+-----------------------------------------------------------------------------------------------+
```

---

## Chapter 1: The Operational Problem (0:00 – 0:45)
* **Visual:** Open `aplyd/index.html` on your browser.
* **Narrative:**
  > *"In textile weaving sheds and fabric mills, loom telemetry is still written by hand on physical clipboard forms. Operators log machine IDs, shift outputs, defect tallies, and stoppage downtime. At the end of each shift, supervisors collect dozens of these sheets and spend hours typing them into ERP screens. This causes a 24-hour reporting lag and introduces data-entry typos.*  
  > *APLYD is our vision-first shop-floor digitisation solution. It lets an operator photograph a paper sheet on a phone, uses multimodal vision AI to extract structured fields, highlights handwriting uncertainties, and gives supervisors an ergonomic review console to verify and approve trustworthy data for the factory ERP."*

---

## Chapter 2: Case A — The Clean Golden Path (0:45 – 2:15)
* **Goal:** Demonstrate seamless upload, extraction, verification, and mock ERP handoff on a clean standard sheet.
* **Steps:**
  1. Click **`👷 Operator: Ramesh Kumar`** on the demo persona switcher on `index.html`.
  2. Navigate to **Capture Form**.
  3. Drag and drop `aplyd/assets/sample-forms/sample_01_clean_loom_12.svg` into the dropzone (or select it).
  4. Show the **Preflight Preview Card**: point out the resolution check, file size, 90° rotate tool, and duplicate detection check.
  5. Click **"Extract Form with Vision AI"**.
  6. Highlight the animated multi-step progress stepper (*Storage Vault $\rightarrow$ Boundary Layout $\rightarrow$ Transcription $\rightarrow$ Master Data Validation*).
  7. The system redirects to the **Review Console**.
  8. Point out the split screen: high-res physical sheet on the left, structured fields on the right, all green `READ` badges.
  9. Click **`📋 Supervisor: Priya Sharma`** on the topbar to assume supervisory authority.
  10. Click **"✓ Approve & Submit to Mock ERP"**. Enter an approval note: *"Verified against loom pick counter"*.
  11. The record is approved and dispatches to the Mock ERP. The system redirects to the **Production Register**, displaying the external reference (e.g. `APLYD-ERP-2026-1044`) and green status pill.

---

## Chapter 3: Case B — Difficult & Ambiguous Handwriting (2:15 – 3:45)
* **Goal:** Prove the system does not hallucinate or guess falsely when handwriting is ambiguous.
* **Steps:**
  1. Return to **Capture Form**.
  2. Upload `aplyd/assets/sample-forms/sample_09_ambiguous_qty.svg` (Quantity digit has overlapping loops that could be 350 or 850).
  3. Click **"Extract Form with Vision AI"**.
  4. In the Review Console, immediately point out the **amber `UNCERTAIN` badge** on Production Quantity:
     * Show the explanatory reason pill: *"Handwritten first digit has conflicting loops (could be 3 or 8). Requires supervisor verification."*
     * Transcribed text shows: `"350 / 850 ?"`.
  5. On the left canvas viewer, click **Zoom In (`+`)** and drag the document to inspect the pick counter reading:
     * Point out: Start Pick = 112,000, End Pick = 148,500. A delta of ~36,500 picks mathematically confirms the output is 350 meters, not 850 meters.
  6. In the right panel, edit the quantity from 850 to **350**. When prompted, enter supervisor rationale: *"Cross-referenced pick reading: 350m is physically consistent with shift duration"*.
  7. Point out the immediate feedback:
     * The status pill turns blue (`CORRECTED`).
     * Scroll down to **Human Correction History (Audit Trail)**: show the immutable before/after record (`850` $\rightarrow$ `350`, Priya Sharma, timestamp, rationale).
  8. Click **"Approve & Submit to Mock ERP"**.
  9. Show that ONLY the approved/corrected value (350m) is handed off to the ERP.

---

## Chapter 4: Case C — Boundary Failure & Safe Error Handling (3:45 – 4:45)
* **Goal:** Prove the system never fakes success with mock data when an image is unreadable or severely corrupted.
* **Steps:**
  1. Go to **Capture Form**.
  2. Upload or simulate a severely damaged, blurred, or occluded file (e.g. filename containing `corrupt` or `unreadable`).
  3. Click **"Extract Form with Vision AI"**.
  4. Show that the system **refuses to fabricate production data**.
  5. The UI transitions to the explicit **Failure Card**:
     * Red alert: *"Extraction Failed: Document Unreadable"*.
     * Diagnosis: *"Image resolution is severely degraded or essential form boundaries are occluded."*
     * Provides clear operator recovery paths: **"Retake Photograph"** or **"Return to Dashboard"**.

---

## Chapter 5: Operations Dashboard, Analytics & Reliability Metrics (4:45 – 5:30)
* **Goal:** Conclude with plant-wide visibility and quantitative assessment evidence.
* **Steps:**
  1. Navigate to **Production Dashboard**:
     * Point out the live KPI cards (Approved Metres Today aggregated strictly from verified records, Forms Processed, Pending Reviews, Active Alerts).
     * Show the Station Output bar chart.
  2. Navigate to **Analytics**:
     * Point out the **AI Extraction Telemetry Cards**:
       * Field-Level Accuracy: **97.0%**
       * Uncertainty Flagging Recall: **100%**
       * Supervisor Correction Rate: **2.0%**
       * ERP Sync Rate: **100%**
     * Show the Weaving Shed Pareto defect distribution and downtime root-cause charts.
  3. Navigate to **Looms Master** & **Shift Schedules**:
     * Briefly show the master data CRUD interface and capacity bounds.
* **Concluding Sentence:**
  > *"APLYD provides Athena with an end-to-end, production-grade digitisation solution: reliable on the shop floor, transparent for supervisors, and seamless for enterprise ERP integration."*
