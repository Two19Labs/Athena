# CONTEXT.MD — Multi-Agent Operational Protocol & Project State

> # 🚨 MANDATORY PROTOCOL FOR ALL AGENTS (Antigravity, Claude Code, etc.) 🚨
>
> 1. **FIRST ACTION:** read this file before planning or changing anything.
> 2. **DURING WORK:** follow the architecture below. Run `npm test` and `npm run test:e2e` before claiming anything works.
>    **Never report a metric you did not measure, and never add code that returns invented data when the AI fails.**
> 3. **LAST ACTION:** update this file: what changed, files touched, test results, git state, next steps.

---

## 1. Project

* **What:** submission for the APLYD (Athena Infonomics) internship brief "Vision-First Shop Floor Digitisation". Brief: `C:\Users\adity\Downloads\APLYD_Textile_Shopfloor_Internship_Challenge_Updated.pdf`.
* **Repo:** `https://github.com/Two19Labs/Athena`, branch `main`.
* **Live (OLD build until redeployed):** `https://athena-silk-sigma.vercel.app`

## 2. Current architecture (v2, rebuilt 2026-11-16 by Claude Code)

* **Front end:** `aplyd/`, plain HTML/JS with no build step.
  * `js/rules.js`: shared field contract, normalisation, validation and ERP contract. Used by browser AND server.
  * `js/store.js`: records in localStorage (`aplyd_db_v2`), photos in IndexedDB, workflow, permissions, ERP calls.
  * `js/layout.js`: sidebar, persona switcher, role guard.
  * `js/capture.js`: rotate, downscale, quality checks. `js/review.js`, `js/production-register.js`, `js/dashboard.js`, `js/analytics.js`, `js/master-data.js`, `js/dialog.js`, `js/charts.js`.
* **Serverless:** `api/extract.js` (vision LLM; Gemini primary, OpenRouter fallback; key in env only) and `api/erp.js` (mock ERP, deterministic idempotent reference). Helpers are in `api/_lib/`.
* **Local:** `node dev-server.js` mirrors Vercel routing and reads `.env` (see `.env.example`).
* **Supabase removed.** The design-only schema is in `docs/production-schema.sql`.
* **No fake extraction anywhere.** No key or an unreadable photo produces an explicit error, and nothing is saved.

## 3. Tests (all passing 2026-11-16)

* `npm test`: 26 unit tests (rules, ERP contract, /api/erp, /api/extract with stubbed provider, fallback, rate limit, malformed output).
* `npm run test:e2e`: 95 headless-Chrome checks. Every page, desktop and mobile (no errors, no overflow), roles, capture, review, correct/confirm, approve, ERP, duplicates, return/resubmit, reject, all failure paths, large photos, ERP failure/retry, master data, analytics, CSV, XSS.
* `npm run benchmark` (real Gemini, 2026-11-17): 131/132 fields correct (99.2%), 1 silent error (ambiguous 350 read as 850; caught by the loom range warning), blanks 100%, non-form refused. Flag recall 33%, but synthetic samples are too easy (stain readable; the ambiguous digit looks like an 8). Outputs are in `aplyd/assets/sample-outputs/`.
* Unit tests: 30; E2E: 100 (2026-11-17). Strict parsers, origin check, operator cannot confirm AI flags, older-browser fallbacks. Model order: gemini-3.5-flash-lite → 3.8-flash → 2.5-flash (2–4 s reads); 50 s total budget.
* Live real-key run 2026-11-17: clean form read 12/12, approved to ERP; sideways read; fabric photo refused.
* Working key: in `.env` (gitignored), from the user's personal Gmail project. The first key's project was ineligible for the free tier.
* Samples: 12 synthetic photos in `aplyd/assets/samples/`, ground truth in `tests/fixtures/samples.json`, generator `npm run samples`.

## 4. Handover log

| Date | Agent | Change | Commit |
|---|---|---|---|
| 2026-11-15 | Antigravity | v1 build (8 phases), Vercel routing, "deep diagnostic". | `9efe1b8`…`6575846` |
| 2026-11-16 | Claude Code | Audit: v1 crashed on 6/8 pages (`window.security` undefined), toasts never shown, extraction was filename keywords, benchmark and analytics numbers fabricated, Supabase unwired, SVG samples not uploadable, "Restaurant" branding. | — |
| 2026-11-16 | Claude Code | v2 rebuild: Supabase removed; real `/api/extract` + `/api/erp`; shared rules; approval gate on AI flags + business rules; IndexedDB photos; real analytics + silent-error metric; new samples, honest benchmark; mobile layout; dialogs instead of prompt(); new docs. Tests above pass. | **uncommitted** |

## 5. Next steps

1. **User:** add the same key as the Vercel env var `GEMINI_API_KEY`.
2. Improve synthetic samples (a truly ambiguous digit, an opaque stain), or better, add real photos. Then re-run the benchmark and update SOLUTION_NOTE section 6.
3. Commit and push (with user approval) so Vercel redeploys. Then smoke-test the live site with a real photo.
4. Fill in the author name in `docs/SOLUTION_NOTE.md`.
5. Strongly recommended: photograph 10–20 real handwritten forms, add them to `tests/fixtures/samples.json`, and re-run the benchmark.
