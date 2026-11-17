# APLYD: Demo Walkthrough

About 6 minutes. Use the deployed URL, or `node dev-server.js` with `GEMINI_API_KEY` set. The app starts with no records: everything shown is created live. The capture page has one-click **sample photos**; you can also upload your own (files in `aplyd/assets/samples/`).

> The AI is a real model, so its exact readings can differ from run to run. That is the point of the review step. If it reads a "hard" sample correctly and flags nothing, say so; the safeguards in Cases B and C still apply whenever it does flag something.

---

## 1. The problem (30 s)
Open the start page: *"Operators write loom output on paper. Retyping it into the ERP is slow and adds errors. APLYD turns a phone photo into a record a supervisor can verify against the photo in seconds."*

## 2. Case A: clean form, end to end (1.5 min)
1. Choose **Ramesh · Operator**. The capture page opens, and the green banner shows which AI model is live.
2. Under the dropzone, click the sample **Clean form** (or upload a photo). Point out the preflight checks: resolution, lighting and sharpness all pass. The photo is downscaled before upload.
3. Click **Read form with AI**. The steps are real, not timed animations.
4. The review screen shows the photo on the left and the fields on the right. Each field has a status badge and the exact handwriting it was read from ("Written: …").
5. As the operator, everything is read-only: *"operators can't approve their own forms."*
6. Switch persona to **Priya · Supervisor** and point out "All checks pass." Click **Approve & send to ERP**. A green banner shows the ERP reference.
7. Open **Production Register**, then this record. Expand **ERP payload** to show the clean versioned contract with provenance (source form, image hash, model, fields corrected).

## 3. Case B: difficult form, ambiguous and stained (2 min)
1. As the operator, click the sample **Unclear digit**: the first digit of the quantity could be a 3 or an 8.
2. On review, the quantity should be highlighted **Uncertain**, with the model's reason and the raw transcription. **Approve is disabled** and the panel lists what must be resolved.
3. Zoom into the photo (scroll or pinch) and compare. Correct the value, then give a reason. The badge changes to **Corrected**, and the **audit trail** shows before, after, who and why.
   - If the value was right, click **Value matches photo** instead. Confirmations are logged too.
4. Optional: click the sample **Oil stain**. The stoppage reason should come back **Illegible**, with no invented text. Click **Return to operator** with a note. As the operator, the record is now editable; fix the field and **Resubmit**.
5. Optional: upload `form-08-unknown-loom.jpg`. "L-19" is flagged **Invalid** because it is not in the loom master. The system does not quietly map it to a real loom.

## 4. Case C: failed capture (1 min)
1. Click the sample **Not a form**, a close-up of fabric.
2. The system refuses: *"The AI could not find a readable production form…"* with the model's reason. **Nothing was saved, and no values were guessed.**
3. Mention the other failure paths, each with its own message: provider rate limit, bad key, malformed model output, no network, and no key configured.

## 4b. Optional: a stack of forms (1 min)
1. As the operator, click **Choose photos** and select several sample photos at once (e.g. all 12 in `aplyd/assets/samples/`).
2. Each photo gets a row: Waiting → Reading → Ready / Needs check / Failed. Exact duplicates are skipped; the fabric photo fails with its reason.
3. Click **Review N records from this batch →**, switch to the supervisor, open the first record and, after deciding, use **Next record →** to move through the stack.

## 5. Reliability and the ERP failure path (1 min)
1. **Analytics & Reliability** shows live numbers from the reviews just done. The key one is **silent errors**: the AI was confident and wrong. Each one is listed with what was written and what the human changed it to.
2. The offline benchmark card shows `npm run benchmark` results on the labelled samples: field accuracy, silent-error rate, flag recall, blank detection.
3. In the register, open an approved record, tick **Simulate ERP timeout** and send. It is recorded as failed. Send again and it is acknowledged with the **same reference**, because dispatch is idempotent.

## 6. Close (15 s)
*"The AI does the reading, deterministic rules do the checking, and a supervisor makes every final call with the photo in front of them. Every correction is logged and becomes the data that tells us where to improve next."*
