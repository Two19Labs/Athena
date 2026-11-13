# CONTEXT.MD — Athena LoomVision Project State & Context

> **IMPORTANT PROTOCOL FOR AGENTS / CLAUDE CODE:**
> 1. **On every new turn / prompt:** Always read this `context.md` file first before taking any action.
> 2. **Before completing any turn:** Always update this `context.md` file with the latest progress, decisions made, file changes, and clear next steps.
> 3. This repository was designed and built by Antigravity and is configured for handover to Claude Code. All paths are exact and TypeScript/React production builds pass with zero errors.

---

## 1. Project Background & Assessment Scope

* **Client / Organization:** APLYD by Athena Infonomics | Part of Athena Group
* **Assessment Title:** Vision-First Shop Floor Digitisation (Textile Manufacturing Domain)
* **Target Environment:** Textile weaving mill / loom shed (dusty, noisy, hot, harsh fluorescent lighting, clipboard paper forms attached to looms).
* **The Problem:** Operators and supervisors manually fill physical daily production slips (Loom ID, Shift, Start/End Picks, Meters, RPM, Defects like warp/weft breaks, Downtime events, and Remarks). At shift end, supervisors spend 2–4 hours manually typing 40–120 paper sheets into ERPs (SAP/Infor/Odoo). This creates a 6–24 hour reporting lag, digit transposition errors, and lost operational data.
* **The Solution:** `Athena LoomVision` — an end-to-end vision-first shop-floor digitization pipeline. An operator snaps a photo on a mobile device or shared tablet $\rightarrow$ client pre-flight quality checks $\rightarrow$ multimodal vision extraction $\rightarrow$ deterministic physics validation $\rightarrow$ split-screen 5-second HITL review $\rightarrow$ downstream ERP handoff (mock REST API + CSV export).

---

## 2. Architectural Lineage (Previous ERP Reference)

This project references and builds directly on top of the proven architecture developed in:
`c:\Users\adity\Downloads\erp`

Specifically:
1. **Multimodal Extraction (`erp/supabase/functions/parse-bill/index.ts`):**
   * Uses Hugging Face Router (`https://router.huggingface.co/v1/chat/completions`) with a multi-model fallback cascade:
     - Tier 1: `Qwen/Qwen2.5-VL-72B-Instruct` / `Gemini Vision`
     - Tier 2: `meta-llama/Llama-3.2-11B-Vision-Instruct`
   * Exponential backoff on HTTP 429/503.
   * Dynamic prompt injection of master tables.
   * Strict JSON schema with markdown fence stripping and structural normalization.
2. **Review Console (`erp/bill-modal.js`):**
   * Dynamic modal DOM injection, metadata headers, active alert banners with critical/warning styling, editable tables, and role-based actions (`Approve`, `Reject`, `Cancel`).
3. **Suspicious Alerts / Deterministic Checks (`erp/supabase/phase7_suspicious_bill_alerts.sql` & `purchase-register.js`):**
   * Evolved from price spike/quantity anomaly checks into **Textile Domain Physics**:
     - `BR-01`: Shift time balance conservation ($\text{Run Time} + \sum\text{Downtime} = 480\text{ min} \pm 15\text{ min}$).
     - `BR-02`: Pick counter monotonicity ($\text{End Pick} \ge \text{Start Pick}$).
     - `BR-03`: Pick-to-meter sanity ($\text{Meters} \approx \text{Picks} / \text{PPI} \pm 10\%$).
     - `BR-04`: Loom efficiency bounds ($20\% \le \text{Efficiency} \le 102\%$).
     - `BR-05`: Fuzzy string matching against Loom Master (`L-101`..`L-220`) and Sort Master (`S-4040-68`).

---

## 3. Repository File Structure & Module Map

```
c:\Users\adity\Downloads\Athena\
├── context.md                          # [CRITICAL] Master state file read/updated on every turn
├── PRD.md                              # Master Product Requirements Document (v3.0.0)
├── SOLUTION_NOTE.md                    # Formal Solution Note & Architecture Sketch (Required for submission)
├── README.md                           # Setup and testing instructions
├── package.json                        # Vite + React 19 + Lucide Icons
├── index.html                          # Entry HTML pointing to /src/main.tsx
├── vite.config.js                      # Vite configuration (port 3000)
│
├── src/
│   ├── main.tsx                        # React root entry
│   ├── App.tsx                         # Main shell with navigation, capture zone, metrics & scenario runner
│   ├── index.css                       # Design tokens, traffic light colors, modern UI styles
│   │
│   ├── data/
│   │   └── masterData.ts               # Factory Master (Looms L-101..220, Sorts, Downtimes, Defects, Operators)
│   │
│   ├── services/
│   │   ├── imageQualityGate.ts         # Client-side pre-flight checks (luminance, glare, blur, deskewing)
│   │   ├── validationEngine.ts         # Textile domain deterministic physics & Levenshtein fuzzy matcher
│   │   └── erpService.ts               # Mock ERP webhook (POST /api/v1/erp/production-logs), idempotency, SAP CSV export
│   │
│   ├── components/
│   │   ├── CameraCapture.tsx           # Camera snap / upload with instant pre-flight quality badges
│   │   ├── LoomReviewModal.tsx         # Split-screen HITL console (zoomable image left, editable form right)
│   │   ├── TelemetryDashboard.tsx      # CER, FER, Human Touch Rate (HTR), Time-to-ERP metrics
│   │   ├── ScenarioRunner.tsx          # 1-Click test case runner for Case 1, Case 2, Case 3
│   │   └── ErpTransactionDrawer.tsx    # Live ERP inspection drawer showing committed payloads
│   │
│   └── generator/
│       └── formCanvasGenerator.ts      # Pure Canvas synthetic textile production slip generator
│
├── fixtures/
│   └── outputs/                        # Canonical JSON output fixtures
│       ├── sample_form_01_clean_output.json
│       ├── sample_form_02_degraded_output.json
│       └── sample_form_03_failure_output.json
│
├── dist/                               # Production build output (built with vite build)
│
└── supabase/
    └── functions/
        └── parse-loom-slip/
            └── index.ts                # Deno Edge Function matching erp/supabase/functions/parse-bill/index.ts
```

---

## 4. The 3 Evaluation Scenarios (Mandated by PDF)

1. **Case 1: Golden Path (`sample_form_01_clean`)**
   * *Conditions:* Clean printed slip, Shift A, Loom L-104, Sort S-4040-68. Math balances ($420\text{ min run} + 60\text{ min downtime} = 480\text{ min}$).
   * *System Behavior:* $96\%$ confidence, 100% green badges, 1-click auto-approval to ERP in $<2$ seconds.
2. **Case 2: Real-World Degraded Case (`sample_form_02_degraded`)**
   * *Conditions:* 20° photo tilt, tube glare across bottom right, oil thumbprint over Loom ID (`"L-1O4"`), operator crossed out pick counter `348,200` and wrote `349,800` above it.
   * *System Behavior:* Canvas homography deskews image; prompt correctly extracts overwritten `349,800`; fuzzy matcher suggests `"L-104"` with Amber warning badge; supervisor verifies in 3 seconds.
3. **Case 3: Critical Boundary Failure Case (`sample_form_03_failure`)**
   * *Conditions:* Missing shift header; downtime logged as `540 minutes` (violates 480 min shift duration); end pick is lower than start pick (`ERR_PICK_NEGATIVE`).
   * *System Behavior:* Deterministic engine triggers `ERR_TIME_OVERFLOW` and `ERR_PICK_NEGATIVE` with Red alert banners; blocks ERP dispatch until supervisor manually corrects or rejects.

---

## 5. Current Implementation Progress & Status

* [x] Problem Brief Analyzed Line-by-Line against PDF requirements.
* [x] Previous `erp` architecture inspected and mapped (`parse-bill`, `bill-modal.js`, fuzzy matching).
* [x] Master PRD created and locked (`PRD.md` v3.0.0).
* [x] Protocol file `context.md` established and actively maintained.
* [x] `package.json` created (Vite + React 19 + Lucide Icons).
* [x] `npm install` completed with zero vulnerabilities.
* [x] `src/data/masterData.ts` created (Loom Master, Sort Master, Downtime Codes, Defect Taxonomies, Roster).
* [x] `src/services/imageQualityGate.ts` created (Luminance, Glare, Blur, Deskew).
* [x] `src/services/validationEngine.ts` created (Textile domain physics & Levenshtein fuzzy matcher).
* [x] `src/services/erpService.ts` created (Mock REST API, idempotency, SAP CSV export, telemetry).
* [x] `src/generator/formCanvasGenerator.ts` created (Renders realistic clean, degraded, and failure slips).
* [x] `src/components/CameraCapture.tsx` created (Mobile/desktop photo upload with pre-flight check).
* [x] `src/components/LoomReviewModal.tsx` created (Split-screen HITL console with zoomable canvas, traffic-light badges, and keyboard navigation).
* [x] `src/components/ScenarioRunner.tsx` created (1-Click test harness for Cases 1, 2, 3).
* [x] `src/components/ErpTransactionDrawer.tsx` created (Live ERP payload inspector and CSV export).
* [x] `src/components/TelemetryDashboard.tsx` created (Reliability metrics: HTR %, Time-to-ERP, CER).
* [x] `src/App.tsx` & `src/main.tsx` created.
* [x] `fixtures/outputs/` created with canonical JSON files for all 3 scenarios.
* [x] `supabase/functions/parse-loom-slip/index.ts` created (Deno Edge Function ready for Supabase deploy).
* [x] Production build tested and verified (`npm run build` succeeds in 2.47s with zero errors).
* [x] `SOLUTION_NOTE.md` authored (Complete formal solution note covering assumptions, architecture sketch, trade-offs, walkthrough, and roadmap).
* [x] `README.md` authored (Setup instructions, run commands, and testing guide).

---

## 6. Exact Next Steps for Claude Code / Handover

1. **Local Preview / Verification:**
   * Run `npm run dev` to launch the dev server on `http://localhost:3000`.
   * Click each of the 3 scenario buttons in the UI to visually confirm the workflow.
2. **Git & GitHub Integration:**
   * Initialize git repository (`git init`).
   * Add remote and push to GitHub repository.
3. **Supabase Cloud Connectivity:**
   * Connect to user's Supabase project (`supabase login`, `supabase link`).
   * Deploy the edge function `supabase functions deploy parse-loom-slip`.
   * Set the environment secret `supabase secrets set HF_API_KEY=...`.
