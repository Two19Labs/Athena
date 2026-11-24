# Real-world assessment

A test on real handwriting: people fill in printed forms by hand, the forms are photographed on a phone, and every photo goes through the app exactly as an operator's would.

## Steps

1. **Print the kit:** [`kit/APLYD-real-world-test-kit.pdf`](kit/APLYD-real-world-test-kit.pdf) (A4). It has the instructions, a value card for each form, and 24 blank forms (20 slips, 4 register pages). Regenerate it with `npm run realworld:kit`.
2. **Hand out** each blank form with its value card (same ID, RW-01 to RW-24) to 5 different people. They copy the values in their own handwriting and follow any note on the card.
3. **Photograph** each filled form with a phone (card removed), following any photo note on the card.
4. **Save the photos** in `real-world/photos/`, named after the form ID: `RW-01.jpg`, `RW-02.jpg`, ... (JPG or PNG).
5. Optional: `real-world/writers.csv` with lines like `RW-01,Aditya` for results per writer.
6. **Run** `npm run realworld` (needs `GEMINI_API_KEY` in `.env`).

## What the runner does

Each photo goes through the app in a headless browser: the same downscaling and photo-quality checks, the same call to the real AI, the same record creation and business rules. Every field is compared with the answer key ([`answers.json`](answers.json), generated from [`forms.js`](forms.js)), and every mistake is classed as:

- **caught:** the AI flagged the field, or a rule raised a message on it, so the reviewer is pointed straight at it;
- **silent:** wrong, marked as read, and no rule fired, so only a reviewer reading every field against the photo would notice.

It writes `results.json` (summary, per field, per layout, per writer, per form) and the raw output per photo in `outputs/`.

Photos of people's handwriting, the raw outputs and the writer list are kept out of git by default.
