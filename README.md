# APLYD: Vision-First Shop-Floor Digitisation

A working proof of concept for the APLYD (Athena Infonomics) internship brief: **turn a phone photo of a handwritten textile production form into a reviewed, structured record ready for an ERP.**

```
photo capture → AI extraction → rule checks → supervisor review → ERP-ready record
```

## Try it

**Live demo: https://athenavisionloom.vercel.app** (works on a phone; "Add to Home Screen" installs it).

1. Pick **Ramesh · Operator** and tap a sample photo (try **Unclear digit** or **Register page**), then **Read form with AI**.
2. Switch to **Priya · Supervisor** with the persona chip, check the flagged fields against the photo (**📍 Show on photo** zooms to the handwriting) and approve to the mock ERP.
3. See **Analytics & Reliability** for what the AI got wrong and which safety net caught it.

The full demo script is in [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md). There is no login and no shared database: each browser has its own data, and "Reset demo data" on the start page clears it.

- **Capture:** phone camera or upload, with automatic orientation, manual rotate, downscaling, and checks for low resolution, darkness, glare and blur. A live seconds counter and Cancel while the AI reads. **No signal?** The photo waits on the phone and is read automatically when the connection returns.
- **Register pages:** one photo of a shift register listing several looms becomes one record per row (header date and shift applied to each row, empty lines ignored), reviewed together as "Row 3 of 6 on this sheet".
- **Batch upload:** a stack of up to 25 sheets at once (e.g. at shift end). Photos are read two at a time, retried automatically when the free AI is busy, and each becomes a normal pending record; the supervisor reviews the batch with a "Next record" flow.
- **Extraction:** a vision LLM (Google Gemini, free tier; fast "lite" models first, with automatic fallback when one is busy) transcribes the form. Every field gets a status: `read`, `uncertain`, `missing`, `illegible` or `invalid`, plus **where on the photo it was written**. The model is told never to guess.
- **Validation:** deterministic code maps readings to the loom and shift master and checks business rules: required fields, expected output range, downtime longer than the shift, future dates, duplicate loom/date/shift. A suspicious value (e.g. output above the loom's range, a likely misread digit) blocks approval until someone corrects it or ticks "I checked this against the photo". Handwritten downtime reasons ("loom cleaning", "safai", "light gayi") are mapped to reason codes.
- **Review:** the supervisor sees the photo and the fields side by side; clicking a field zooms the photo to that handwriting, and register rows open zoomed to their line. Flagged fields must be corrected or explicitly confirmed before approval. Edits save instantly with Undo and an inline reason; every change goes to an append-only audit trail. Rows with nothing to check can be approved together. Keyboard shortcuts on desktop (A approve, N next, J next issue, ? help). Records can be returned to the operator (who later sees what was corrected) or rejected.
- **ERP handoff:** a mock ERP endpoint with a versioned JSON contract, idempotent references, a failure simulation and retry, plus CSV and ERP-JSON export.
- **Mobile-first:** on phones a bottom tab bar, card lists, the photo pinned while reviewing (tap for full screen, pinch to zoom), flagged fields listed first, bottom-sheet dialogs, 44 px touch targets and no iPhone input zoom. It can be installed with "Add to Home Screen". Tablets keep a slim sidebar.
- **Reliability:** live metrics derived from supervisor corrections (correction rate, **silent-error rate** with which safety net caught each one, flag precision) and an offline benchmark on labelled sample forms.

Design notes, assumptions and trade-offs: **[docs/SOLUTION_NOTE.md](docs/SOLUTION_NOTE.md)**. Demo script: **[docs/WALKTHROUGH.md](docs/WALKTHROUGH.md)**.

---

## Run it locally

Requirements: Node.js 18 or newer. No other dependencies are needed to run the app.

```bash
cp .env.example .env          # then put your free Gemini key in .env
node dev-server.js            # http://localhost:3000
```

Get a free Gemini API key at <https://aistudio.google.com/apikey> (Google account, no card). Without a key the app still runs, but the capture page says the AI is not configured and refuses to extract. **It never invents values.**

Pick a demo persona on the first screen:
- **Operator:** capture forms.
- **Supervisor:** review and approve.
- **Admin:** also edits the loom and shift master data.

The app starts empty: there is no mock data. The capture page has one-click sample photos: 6 synthetic forms (clean, unclear digit, oil stain, different layout, a 6-loom register page, not a form), 5 photorealistic phone photos (crumpled slip, 8-loom register book, Hindi form, overwritten digits, tube-light glare), and "All samples as a batch". The files are in [`aplyd/assets/samples/`](aplyd/assets/samples/), the AI's actual output for each in [`aplyd/assets/sample-outputs/`](aplyd/assets/sample-outputs/), and the answer keys in [`tests/fixtures/samples.json`](tests/fixtures/samples.json).

## Deploy (Vercel, free)

1. Import the repository in Vercel (framework preset "Other", no build command).
2. Under Project Settings → Environment Variables, add `GEMINI_API_KEY`.
3. Deploy. Static pages are served from `aplyd/` and the two functions from `api/`.

## Tests

```bash
npm install            # dev only: puppeteer-core, which drives your installed Chrome/Edge
npm test               # 42 unit tests: rules, strict parsers, check-required gate, undo, reason codes, photo boxes, ERP contract, /api/erp, /api/extract
npm run test:e2e       # 184 browser checks: every page and workflow incl. batch upload, register pages, bulk approve, inline edits + undo, offline outbox, a mobile audit (360/390/landscape/768 px) and phone-only behaviour
npm run samples        # re-render the synthetic sample photos
npm run benchmark      # REAL AI run over the 18 labelled samples, scored per set (needs GEMINI_API_KEY)
```

The end-to-end test runs the real app and the real `/api` functions in headless Chrome. Only the AI provider is replaced, by a local stub, so every branch can be exercised without spending quota. The benchmark is the opposite: it calls the real provider and writes the system's actual outputs to `aplyd/assets/sample-outputs/` and the scores to `aplyd/assets/benchmark/results.json`. The Analytics page shows those scores.

## Project layout

```
aplyd/                  static front end (no build step)
  js/rules.js           shared domain rules: field contract, normalisation, validation, ERP contract
  js/store.js           browser persistence (records: localStorage, photos: IndexedDB), workflow, permissions
  js/capture.js         single-photo capture (preview, quality checks, progress, cancel)
  js/batch.js           batch upload (up to 25 photos)
  js/outbox.js          photos taken with no signal, read when back online
  js/image-prep.js      orientation, downscaling, photo-quality checks
  js/review.js          split-screen review console (photo locations, checks, undo, bulk approve)
  assets/samples/       sample form photos (synthetic, see docs)
api/
  extract.js            POST /api/extract -> vision model -> normalised 5-state record
  erp.js                POST /api/erp     -> mock ERP (validation, idempotent reference, failure simulation)
  _lib/                 prompt, provider adapters (Gemini, OpenRouter fallback), HTTP helpers
tests/                  unit, e2e, sample generator, benchmark, fixtures (ground truth)
docs/                   solution note, walkthrough, production database schema (design only)
dev-server.js           local server that mirrors the Vercel routing
```
