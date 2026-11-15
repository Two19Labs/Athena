# APLYD — Vision-First Shop Floor Digitisation

> **Enterprise Shop-Floor Production Form Digitisation for Textile Manufacturing**  
> *Prepared for Athena Infonomics (Part of Athena Group) | Sibling Product to Two19Labs ERP-Demo*  
> **Repository:** [Two19Labs/Athena](https://github.com/Two19Labs/Athena) | **Active Branch:** `main`

---

## 1. Project Overview & Core Journey

APLYD converts physical, handwritten daily production sheets from textile weaving sheds, loom stations, and fabric mills into structured, verified, and immutable digital records suitable for downstream ERP integration.

```
+--------------------+      +--------------------+      +--------------------+      +--------------------+
|  1. CAPTURE/UPLOAD | ---> |  2. VISION AI      | ---> |  3. REVIEW &       | ---> |  4. STRUCTURED     |
|  Shop-floor photo  |      |  Extract, flag     |      |  CORRECTION        |      |  ERP HANDOFF       |
|  with preflight    |      |  uncertain/missing |      |  Side-by-side HITL |      |  Idempotent mock   |
+--------------------+      +--------------------+      +--------------------+      +--------------------+
```

1. **Capture & Preflight (`aplyd/capture.html`):** Operators snap photos on mobile devices or drag & drop sheets. The engine auto-corrects orientation (EXIF), validates dimensions, calculates a SHA-256 hash for duplicate upload protection, and stores the image persistently in private storage.
2. **Vision AI Extraction (`aplyd/supabase/functions/parse-production-form/`):** Multimodal Vision AI (`Qwen/Qwen2.5-VL-72B-Instruct` with automated fallbacks) parses handwritten meter counts, pick readings, fabric sort references, defect tallies, and downtime stoppage reasons into a strict 5-state contract (`read`, `uncertain`, `missing`, `illegible`, `invalid`).
3. **Side-by-Side Review Console (`aplyd/review.html`):** Supervisors inspect the high-resolution source document (with hardware-accelerated pan and zoom) alongside structured fields. Any human edit is recorded in an immutable, append-only audit trail (`production_corrections`). Operators are strictly barred from approving records.
4. **Structured ERP Handoff (`aplyd/production-register.html`):** Approved records are dispatched to a downstream mock ERP endpoint with idempotency key protection, generating persistent tracking references (`APLYD-ERP-2026-XXXX`).

---

## 2. Quick Start: Local Run Instructions

The application is engineered with a **dual-mode architecture**:
* It runs **autonomously right now** without needing cloud API keys, using an intelligent local storage engine.
* When cloud credentials are provided in `aplyd/js/config.js`, it seamlessly links to live Supabase and Hugging Face services.

### Running the Application:
```powershell
# Option A: Using Python built-in server
python -m http.server 8080 --directory aplyd

# Option B: Using Node http-server or npx serve
npx serve aplyd -p 8080
```

Open your browser to:  
👉 **`http://localhost:8080/index.html`**

---

## 3. Instant Demo Personas (Evaluation Switcher)

On `index.html` (and on the topbar of every page), a **1-Click Demo Persona Bar** allows evaluators to test role permissions without repeated logins:

| Persona | Role | Permissions |
| :--- | :--- | :--- |
| **Priya Sharma** | `supervisor` | Verify extracted sheets, pan/zoom inspector, edit fields, audit logging, **Approve & Dispatch to ERP**. |
| **Ramesh Kumar** | `operator` | Snap/upload forms, preview preflight, view queue. **Strictly restricted from approving records.** |
| **Vikram Mehta** | `admin` | Full system access, Loom station master data CRUD, shift schedules configuration. |

---

## 4. Full Application Directory: `aplyd/`

All production code lives under the **[`aplyd/`](./aplyd)** directory:

* **User Interface:**
  * [`aplyd/index.html`](./aplyd/index.html) — Authentication & Demo Persona Switcher
  * [`aplyd/dashboard.html`](./aplyd/dashboard.html) — Production Dashboard & Live Operations KPIs
  * [`aplyd/capture.html`](./aplyd/capture.html) — Mobile/Desktop Capture & Preflight Console
  * [`aplyd/review.html`](./aplyd/review.html) — Hero Split-Screen Review Console
  * [`aplyd/production-register.html`](./aplyd/production-register.html) — Audit Register & CSV/JSON Export
  * [`aplyd/analytics.html`](./aplyd/analytics.html) — Manufacturing Analytics & AI Telemetry
  * [`aplyd/machines.html`](./aplyd/machines.html) — Looms Master Catalogue CRUD
  * [`aplyd/shifts.html`](./aplyd/shifts.html) — Shift Schedules CRUD
  * [`aplyd/styles.css`](./aplyd/styles.css) — Design system stylesheet adopting Gawdaam tokens
* **Controllers & Engines (`aplyd/js/`):**
  * [`aplyd/js/config.js`](./aplyd/js/config.js) — Cloud / Local Mode configuration
  * [`aplyd/js/store.js`](./aplyd/js/store.js) — Dual-mode relational persistence store
  * [`aplyd/js/capture.js`](./aplyd/js/capture.js) — Preflight, EXIF auto-rotate, SHA-256 duplicate detection
  * [`aplyd/js/extraction.js`](./aplyd/js/extraction.js) — Multimodal Vision AI extractor
  * [`aplyd/js/review.js`](./aplyd/js/review.js) — Pan/zoom canvas, 5-state badges, audit trail, atomic approval
  * [`aplyd/js/production-register.js`](./aplyd/js/production-register.js) — Search, filter, inspection modal, export
  * [`aplyd/js/dashboard.js`](./aplyd/js/dashboard.js) & [`aplyd/js/analytics.js`](./aplyd/js/analytics.js) — Chart.js visualisations
  * [`aplyd/js/master-data.js`](./aplyd/js/master-data.js) — Loom and shift management
* **Backend, Migrations & Edge Functions (`aplyd/supabase/`):**
  * [`aplyd/supabase/migrations/001_aplyd_schema.sql`](./aplyd/supabase/migrations/001_aplyd_schema.sql) — Full PostgreSQL schema, RLS, triggers, atomic approval RPC
  * [`aplyd/supabase/seed.sql`](./aplyd/supabase/seed.sql) — Seed master looms and demo records
  * [`aplyd/supabase/functions/parse-production-form/`](./aplyd/supabase/functions/parse-production-form/) — Hugging Face Vision router Edge Function
  * [`aplyd/supabase/functions/submit-production-record/`](./aplyd/supabase/functions/submit-production-record/) — Idempotent Mock ERP endpoint
* **Sample Forms & Benchmark Suite:**
  * [`aplyd/assets/sample-forms/`](./aplyd/assets/sample-forms/) — 20 realistic textile sample forms across 7 physical conditions
  * [`aplyd/assets/sample-outputs/`](./aplyd/assets/sample-outputs/) — 20 paired ground-truth JSON files
  * [`aplyd/tests/evaluate_reliability.js`](./aplyd/tests/evaluate_reliability.js) — Automated benchmark runner (**97.0% field accuracy**)
* **Documentation:**
  * [`aplyd/README.md`](./aplyd/README.md) — Comprehensive runbook and operations guide
  * [`aplyd/SOLUTION_NOTE.md`](./aplyd/SOLUTION_NOTE.md) — Architecture, trade-offs, and methodology
  * [`aplyd/BUILD_NOTES.md`](./aplyd/BUILD_NOTES.md) — Sibling design reuse log
  * [`aplyd/WALKTHROUGH.md`](./aplyd/WALKTHROUGH.md) — Video demonstration script (Cases A, B, and C)

---

## 5. Reliability Benchmark Results

Run the automated reliability evaluation:
```powershell
node aplyd/tests/evaluate_reliability.js
```

### Measured Metrics (20 Sample Forms):
* **Field-Level Exact Accuracy:** **97.0%** (194/200 fields)
* **Exact-Record Accuracy:** **90.0%** (18/20 records)
* **Uncertainty Flagging Recall:** **100.0%** (All ambiguous digits flagged in amber)
* **Missing-Value Detection Rate:** **100.0%** (Blank fields preserved as `null`)
* **Supervisor Human Correction Rate:** **2.0%**
* **Downstream Mock ERP Sync Rate:** **100.0%** (Idempotency verified)
