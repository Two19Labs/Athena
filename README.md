# Athena LoomVision — Vision-First Shop Floor Digitisation
### Internship Assessment & Problem Brief Prototype for APLYD (Athena Infonomics | Athena Group)

> A production-grade, edge-friendly vision digitization pipeline transforming handwritten textile shop-floor paper logs into structured, validated, ERP-ready records.

---

## 🚀 Quickstart & Setup Instructions

### Prerequisites
* Node.js v18+ (tested on Node v24.16.0)
* npm v9+

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open your browser at **`http://localhost:3000`** (or the port indicated in the terminal).

### 3. Build for Production
```bash
npm run build
npm run preview
```

---

## 🎯 How to Test the 3 Mandated Assessment Scenarios

The web application includes an **Interactive 1-Click Test Harness** at the top of the screen:

1. **Case 1: Golden Path (`Run Case 1`)**
   * Simulates a clean Shift A production slip on Loom L-104.
   * **Result:** 96%+ AI confidence, all green status badges, balanced 8-hr shift math ($420\text{m run} + 60\text{m downtime} = 480\text{m}$). Allows **1-Click Instant Approval to ERP**.
2. **Case 2: Real-World Degraded Case (`Run Case 2`)**
   * Simulates shop-floor hazards: 20° perspective tilt, overhead fluorescent tube glare, grease thumbprint over Loom ID (`"L-1O4"`), and an odometer reading with a strikethrough correction (`348,200` crossed out with `349,800` written above).
   * **Result:** Image is deskewed; overwrite is correctly extracted; fuzzy matcher suggests `"L-104"` with Amber warning badge; supervisor verifies in 3 seconds.
3. **Case 3: Critical Boundary Failure (`Run Case 3`)**
   * Simulates math violations: missing shift box, 540 min downtime in an 8-hour (480 min) shift, and End Pick lower than Start Pick (counter reversal).
   * **Result:** Fires `ERR_TIME_OVERFLOW` and `ERR_PICK_NEGATIVE` with Red alert banners; blocks ERP dispatch until corrected or rejected.

---

## 🏭 Testing with Real Photos
You can also use the **Shop-Floor Document Ingestion** area to:
* Take a live photo using your phone camera (rear camera auto-selected on mobile devices).
* Drag and drop any image file.
* The client-side pre-flight gate will instantly analyze the photo for **Loom Alley Low Light**, **Fluorescent Tube Glare**, **Motion Blur**, and **Perspective Skew**.

---

## 📊 Downstream ERP Integration & Export
* Click **"ERP Ledger"** in the top navigation bar to inspect committed production orders.
* View live transaction IDs (`PROD-2026-W46-XXXX`) and idempotency keys.
* Click **"Export SAP PP / Infor CSV"** to download an enterprise-formatted production order confirmation spreadsheet.

---

## 📁 Repository Structure

```
Athena/
├── context.md                          # Master project state protocol file
├── PRD.md                              # Complete Product Requirements Document (v3.0.0)
├── SOLUTION_NOTE.md                    # Formal Solution Note & Architecture Sketch
├── README.md                           # Setup and testing instructions
├── package.json                        # Project dependencies
├── index.html                          # Entry HTML
├── vite.config.js                      # Vite configuration
│
├── src/
│   ├── main.tsx                        # React application bootstrap
│   ├── App.tsx                         # Main workspace shell & coordinator
│   ├── index.css                       # Design tokens & responsive styles
│   │
│   ├── data/
│   │   └── masterData.ts               # Textile master data (Looms, Sorts, Downtime codes, Defects)
│   │
│   ├── services/
│   │   ├── imageQualityGate.ts         # Client pre-flight (luminance, glare, blur, deskewing)
│   │   ├── validationEngine.ts         # Textile domain physics rules & fuzzy string matching
│   │   └── erpService.ts               # Mock ERP webhook, idempotency, SAP CSV export, telemetry
│   │
│   ├── components/
│   │   ├── CameraCapture.tsx           # Camera / upload zone with pre-flight quality badges
│   │   ├── LoomReviewModal.tsx         # Split-screen HITL review console (image left, form right)
│   │   ├── ScenarioRunner.tsx          # 1-Click test harness for Cases 1, 2, and 3
│   │   ├── ErpTransactionDrawer.tsx    # Live ERP committed payload visualizer
│   │   └── TelemetryDashboard.tsx      # Reliability metrics (HTR %, Time-to-ERP, CER)
│   │
│   └── generator/
│       └── formCanvasGenerator.ts      # Canvas generator producing realistic shop-floor test forms
│
├── fixtures/
│   └── outputs/                        # Canonical JSON output fixtures
│       ├── sample_form_01_clean_output.json
│       ├── sample_form_02_degraded_output.json
│       └── sample_form_03_failure_output.json
│
└── supabase/
    └── functions/
        └── parse-loom-slip/
            └── index.ts                # Deno Edge Function for Supabase deployment
```

---

## 🛡️ Assessment Criteria Alignment

* **Practical Workflow:** 5-second supervisor review UX with exception-only `Tab` keyboard navigation.
* **Shop-Floor Conditions:** Client pre-flight checks for glare, blur, and lighting + strikethrough handling.
* **Sensible Technical Decisions:** Multi-model fallback cascade, client-side pre-flight to save API calls, deterministic physics rules running in real time.
* **ERP Integration:** Idempotent REST webhooks + SAP PP / Infor M3 compatible CSV export.
