# APLYD Implementation Reconnaissance & Engineering Notes

**Project:** APLYD - Vision-First Shop Floor Digitisation  
**Client / Context:** Athena Infonomics (Part of Athena Group)  
**Parent / Sibling Repository:** `Two19Labs/ERP-Demo` (Gawdaam)  
**Workspace:** `c:\Users\adity\Downloads\Athena`  
**Date:** November 2026  

---

## 1. Repository Reconnaissance Summary

Before authoring code, we performed a thorough inspection of the reference repository `Two19Labs/ERP-Demo` (`C:\Users\adity\Downloads\erp`).

### 1.1 Architecture & Runtime Inspection
* **Runtime Nature:** The active root application is a static, vanilla HTML5, CSS3, and modern JavaScript application integrated directly with Supabase via CDN (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`).
* **Root README Note:** The repository root README describes an older design prototype inside the misspelled `new deisgn` directory. The active runtime consists of root files (`dashboard.html`, `purchase-register.html`, `master-data.html`, `stock-ledger.html`, `analytics.html`, `alerts.html`, `style.css`, `app.js`, `purchase-register.js`, etc.).
* **Design Grammar:** The application relies on `style.css` (38 KB), which implements a clean, restrained, high-density enterprise dashboard design system featuring Inter typography, CSS custom properties (`--clay`, `--ink`, `--line`, `--saffron`, `--mint`, `--surface`, `--ground`), responsive sidebars, table densities, modal overlays, status pills, and button treatments.
* **Edge Functions & Model Router:** `supabase/functions/parse-bill/index.ts` demonstrates a working Supabase Deno Edge Function utilizing Hugging Face's router (`https://router.huggingface.co/v1/chat/completions`) with vision model candidates (`Qwen/Qwen2.5-VL-72B-Instruct`, `Qwen/Qwen2.5-VL-7B-Instruct`, `meta-llama/Llama-3.2-11B-Vision-Instruct`).

### 1.2 What We Are Reusing
1. **Design System & Typography:** Reusing and adopting Gawdaam's `style.css` tokens, sidebar layout, topbar, hero panels, card elevations, responsive breakpoints, and UI components.
2. **Utilities:** Reusing `theme.js` (light/dark theme toggle), `toast.js` (animated non-blocking notifications), and `security.js` (`escapeHtml` and `safeUrl` XSS sanitization).
3. **Capture Wizard Patterns:** Reusing file drag-and-drop, thumbnail generation, step indicators, and draft review patterns from `purchase-register.html` and `purchase-register.js`.
4. **Analytics Patterns:** Reusing Chart.js configuration, date filters, and KPI card metrics from `analytics.html` and `analytics.js`.
5. **Master Data Patterns:** Reusing tabbed list/detail patterns and modal CRUD from `master-data.html` and `master-data.js`.
6. **Edge Function Integration Pattern:** Reusing the authenticated Deno Edge Function, JWT verification, and Hugging Face Vision router cascade from `supabase/functions/parse-bill/`.

### 1.3 What We Are Leaving Untouched / Avoiding
1. **Gawdaam Isolation:** Gawdaam's root pages (`dashboard.html`, `purchase-register.html`, etc.) and database tables (`purchase_bills`, `purchase_bill_items`, `stock_items`, `stock_movements`, `vendors`, `bill_alerts`) remain 100% intact. We do NOT overwrite, repurpose, or mutate restaurant tables.
2. **No Hardcoded Filename Mocks:** Gawdaam contains `getMockOcrData` based on filename matching. In APLYD, real uploads are processed dynamically via the vision pipeline; provider failures trigger an honest, user-friendly `extraction_failed` state.
3. **No Artificial 100% Confidence:** Gawdaam hardcodes `confidence_score: 100.00` on submitted lines. APLYD treats confidence as an uncalibrated estimate and enforces explicit field statuses (`read`, `uncertain`, `missing`, `illegible`, `invalid`, `corrected`).
4. **Permanent Storage Retention:** Gawdaam has a code path that deletes uploaded files post-extraction. APLYD persistently stores source images in the private `production-forms` bucket so supervisors can verify handwriting at any time.

---

## 2. APLYD Target Sibling Architecture

APLYD is structured as a dedicated, standalone application directory `aplyd/`:

* `index.html`: Entry point with Supabase Auth and 1-Click Demo Persona Bar (Operator, Supervisor, Admin).
* `dashboard.html`: Operations Dashboard with live KPIs, Loom Output charts, and recent activity feeds.
* `capture.html`: Shop-floor ingestion console with camera trigger, client-side preflight (EXIF orientation auto-rotate, manual 90° rotation, duplicate hash detection), and real-time progress.
* `review.html`: Hero split-screen console with high-resolution pan/zoom document canvas, color-coded 5-state status pills, literal raw text display, append-only human correction audit logging, and atomic approval controls.
* `production-register.html`: Permanent audit register with multi-dimensional filters, deep-inspection modal, CSV/JSON export, and idempotent mock ERP handoff.
* `machines.html`: Master data management for Looms `L-01` through `L-12`.
* `shifts.html`: Shift schedules and definitions (`Morning`, `Evening`, `Night`).
* `analytics.html`: Detailed production analytics and AI digitization accuracy telemetry.
* `styles.css`: Adapted enterprise design system with textile status tokens.
* `js/config.js` & `js/store.js`: Dual-mode storage engine supporting autonomous local operation and live Supabase cloud connectivity.
* `supabase/migrations/001_aplyd_schema.sql`: Full PostgreSQL schema with RLS, triggers, and atomic approval RPC.
* `supabase/functions/parse-production-form/`: Multimodal vision AI Edge Function.
* `supabase/functions/submit-production-record/`: Idempotent Mock ERP endpoint.

---

## 3. Dual-Mode Execution Architecture
To guarantee that the application is production-ready for Athena while allowing full local testing before cloud API keys are inserted, `store.js` implements a transparent dual-mode adapter:
1. **Cloud Mode:** Automatically engages when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided in `config.js`. Connects directly to Supabase PostgreSQL, Storage, and Edge Functions.
2. **Local Autonomous Mode:** Engages when keys are blank. Uses IndexedDB and LocalStorage to persist forms, records, audit trails, and master data with identical relational schemas. Every screen, filter, export, pan/zoom, and validation rule is 100% interactive and functional out of the box.
