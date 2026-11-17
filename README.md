# APLYD: Vision-First Shop-Floor Digitisation

A working proof of concept for the APLYD (Athena Infonomics) internship brief: **turn a phone photo of a handwritten textile production form into a reviewed, structured record ready for an ERP.**

```
photo capture → AI extraction → rule checks → supervisor review → ERP-ready record
```

- **Capture:** phone camera or upload, with automatic orientation, manual rotate, downscaling, and checks for low resolution, darkness, glare and blur.
- **Extraction:** a vision LLM (Google Gemini, free tier) transcribes the form. Every field gets a status: `read`, `uncertain`, `missing`, `illegible` or `invalid`. The model is told never to guess.
- **Validation:** deterministic code maps readings to the loom and shift master and checks business rules: required fields, expected output range, downtime longer than the shift, future dates, duplicate loom/date/shift.
- **Review:** the supervisor sees the photo and the fields side by side. Flagged fields must be corrected or explicitly confirmed before approval. Every change goes to an append-only audit trail. Records can be returned to the operator or rejected.
- **ERP handoff:** a mock ERP endpoint with a versioned JSON contract, idempotent references, a failure simulation and retry, plus CSV and ERP-JSON export.
- **Reliability:** live metrics derived from supervisor corrections (correction rate, **silent-error rate**, flag precision) and an offline benchmark on labelled sample forms.

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

The app starts empty: there is no mock data. The capture page has one-click sample photos (clean, unclear digit, oil stain, different layout, not a form), and the files are also in [`aplyd/assets/samples/`](aplyd/assets/samples/).

## Deploy (Vercel, free)

1. Import the repository in Vercel (framework preset "Other", no build command).
2. Under Project Settings → Environment Variables, add `GEMINI_API_KEY`.
3. Deploy. Static pages are served from `aplyd/` and the two functions from `api/`.

## Tests

```bash
npm install            # dev only: puppeteer-core, which drives your installed Chrome/Edge
npm test               # 30 unit tests: rules, strict parsers, ERP contract, /api/erp, /api/extract (stubbed provider, fallback, time budget, origin check)
npm run test:e2e       # 108 browser checks across every page and workflow, desktop + mobile, older-browser fallbacks
npm run samples        # re-render the synthetic sample photos
npm run benchmark      # REAL AI run over the labelled samples (needs GEMINI_API_KEY)
```

The end-to-end test runs the real app and the real `/api` functions in headless Chrome. Only the AI provider is replaced, by a local stub, so every branch can be exercised without spending quota. The benchmark is the opposite: it calls the real provider and writes the system's actual outputs to `aplyd/assets/sample-outputs/` and the scores to `aplyd/assets/benchmark/results.json`. The Analytics page shows those scores.

## Project layout

```
aplyd/                  static front end (no build step)
  js/rules.js           shared domain rules: field contract, normalisation, validation, ERP contract
  js/store.js           browser persistence (records: localStorage, photos: IndexedDB), workflow, permissions
  js/capture.js         image preprocessing + photo-quality checks
  js/review.js          split-screen review console
  assets/samples/       sample form photos (synthetic, see docs)
api/
  extract.js            POST /api/extract -> vision model -> normalised 5-state record
  erp.js                POST /api/erp     -> mock ERP (validation, idempotent reference, failure simulation)
  _lib/                 prompt, provider adapters (Gemini, OpenRouter fallback), HTTP helpers
tests/                  unit, e2e, sample generator, benchmark, fixtures (ground truth)
docs/                   solution note, walkthrough, production database schema (design only)
dev-server.js           local server that mirrors the Vercel routing
```
