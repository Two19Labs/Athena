# APLYD: Demo Walkthrough

About 7 minutes. Use the live demo at **https://athenavisionloom.vercel.app**, or `node dev-server.js` with `GEMINI_API_KEY` set. The app starts with no records: everything shown is created live. The capture page has one-click **sample photos**; you can also upload your own (files in `aplyd/assets/samples/`).

> The AI is a real model, so its exact readings can differ from run to run. That is the point of the review step. If it reads a "hard" sample correctly and flags nothing, say so; the safeguards in Cases B and C still apply whenever it does flag something.

> **Capture as Ramesh (operator), review as Priya (supervisor).** "Return to operator" sends a record back to whoever captured it, so capturing as Priya and returning would send it back to Priya.

---

## 1. The problem (30 s)
Open the start page: *"Operators write loom output on paper. Retyping it into the ERP is slow and adds errors. APLYD turns a phone photo into a record a supervisor can verify against the photo in seconds."*

## 2. Case A: clean form, end to end (1.5 min)
1. Choose **Ramesh · Operator**. The capture page opens with "AI reader ready".
2. Under the dropzone, click the sample **Clean form** (or upload a photo). Point out the preflight checks: resolution, lighting and sharpness all pass.
3. Click **Read form with AI**. A seconds counter runs while the AI reads, and **Cancel** is always available.
4. The review screen shows the photo on the left and the fields on the right. Each field has a status badge and the exact handwriting it was read from ("Written: …").
5. As the operator, the values are shown as plain text: *"operators can't approve their own forms."*
6. Switch persona to **Priya · Supervisor**. Click **📍 Show on photo** next to any field: the photo zooms to where that value is written and outlines it. Point out "All checks pass." Click **Approve & send to ERP** (or press **A**). A green banner shows the ERP reference.
7. Open **Production Register**, then this record. Expand **ERP payload** to show the clean versioned contract with provenance (source form, image hash, model, fields corrected) and the downtime **reason code**.

## 3. Case B: difficult form, ambiguous and stained (2 min)
1. As the operator, click the sample **Unclear digit**: the first digit of the quantity could be a 3 or an 8.
2. On review (as Priya), "Needs your check" lists the quantity first. Two safety nets can stop a wrong value here:
   - The AI marks it **Uncertain**, with its reason: approval is blocked until it is corrected or confirmed.
   - If the AI was confident (it sometimes reads 850 as "Read"), the **loom range rule** still catches it: 850 m is above L-12's 800 m maximum, so approval is blocked until someone either corrects it or ticks **"I checked this against the photo"**.
3. Click **📍 Show on photo** (or double-click the photo) to zoom into the digit. Type the right value: it saves at once, with an **Undo** button and an editable reason ("Checked against the photo"). The badge changes to **Corrected**; the **audit trail** shows before, after, who and why.
4. Optional: click the sample **Oil stain**. The stoppage reason should come back **Illegible**, with no invented text. Click **Return to Ramesh** with a note. As the operator, the record is now editable; fix the field and **Resubmit**. Ramesh's dashboard later tells him which of his records a supervisor corrected.
5. Optional: upload `form-08-unknown-loom.jpg`. "L-19" is flagged **Invalid** because it is not in the loom master. The system does not quietly map it to a real loom.

## 4. Case C: failed capture (1 min)
1. Click the sample **Not a form**, a close-up of fabric.
2. The system refuses: *"The AI could not find a readable production form…"* with the model's reason. **Nothing was saved, and no values were guessed.**
3. Mention the other failure paths, each with its own message: provider busy (it switches to a backup model and the review screen notes it), bad key, malformed model output, no key configured.
4. **No signal** (patchy shed Wi-Fi): the photo is kept on the phone and read automatically when the connection returns ("1 photo waiting for signal").

## 4a. A register page (1 min)
1. As the operator, click the sample **Register page (6 looms)**.
2. One photo becomes **6 records**: the queue opens filtered to that sheet, in paper order. The date and shift written once at the top are on every row. Columns the register does not have (defect details, remarks) are marked **Not on form**, so they raise no warnings.
3. As Priya, open a row: the photo opens **zoomed to that row's line**, and the header says **"Row 2 of 6 on this sheet"**.
4. Rows with nothing to check can be approved together: **✓ Approve all ready (n)** in the sheet banner. Rows with anything to check stay for one-by-one review with **Next record →** (or **N**).

## 4b. Optional: a stack of forms (1 min)
1. As the operator, click **All samples as a batch** under the samples (or **Choose photos** and select several of your own).
2. Each photo gets a row: Waiting → Reading → Ready / Needs check / Failed. Exact duplicates are skipped; the fabric photo fails with its reason.
3. Click **Review N records from this batch →**, switch to the supervisor, approve the ready ones together and work through the rest with **Next record →**.

## 5. Reliability and the ERP failure path (1 min)
1. **Analytics & Reliability** shows live numbers from the reviews just done. The key one is **silent errors**: the AI was confident and wrong. Each one is listed with what was written, what the human changed it to, and **which safety net caught it** (AI flag, business rule, or the reviewer alone). Downtime is grouped by reason code, so "Loom cleaning" and "Cleaning" are one bar.
2. The offline benchmark card shows `npm run benchmark` results on the labelled samples: field accuracy, silent-error rate, flag recall, blank detection.
3. In the register, open an approved record, tick **Simulate ERP timeout** and send. It is recorded as failed. Send again and it is acknowledged with the **same reference**, because dispatch is idempotent.

## 6. Close (15 s)
*"The AI does the reading, deterministic rules do the checking, and a supervisor makes every final call with the photo in front of them, zoomed to the exact handwriting. Every correction is logged, credited to the safety net that caught it, and becomes the data that tells us where to improve next."*
