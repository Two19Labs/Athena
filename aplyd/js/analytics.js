/**
 * APLYD - Analytics & reliability.
 *
 * Reliability is measured from what supervisors actually did to AI output:
 *  - correction rate: share of AI-read fields a human changed
 *  - silent errors:   fields the AI marked "read" (confident) that a human changed. The key risk metric.
 *  - flag precision:  of the fields the AI flagged, how many really needed a change
 *  - first-pass yield: approved AI records that needed no correction
 * Plus the offline benchmark (npm run benchmark) when its results file exists.
 */
(function () {
  const store = window.aplydStore;
  const Rules = window.AplydRules;
  const esc = window.security.escapeHtml;
  const $ = (id) => document.getElementById(id);
  let records = [];
  let reasons = [];

  document.addEventListener('DOMContentLoaded', async () => {
    records = await store.getRecords();
    reasons = await store.getReasons();
    renderReliability();
    await renderBenchmark();
    renderCharts();
    window.addEventListener('themeChanged', renderCharts);
  });

  const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');

  function renderReliability() {
    const ai = records.filter(r => r.final_payload);
    const reviewed = ai.filter(r => r.status === 'approved' || r.status === 'rejected');
    const approved = ai.filter(r => r.status === 'approved');

    let fields = 0, flagged = 0, corrected = 0, silent = 0, flaggedCorrected = 0;
    const silentRows = [];
    for (const r of reviewed) {
      for (const def of Rules.FIELD_DEFS) {
        const f = r.final_payload.fields[def.key];
        if (!f) continue;
        fields++;
        const isFlag = ['uncertain', 'illegible', 'invalid'].includes(f.status) || (def.required && f.status === 'missing');
        const changed = Rules.humanChanged(r, def.recordKey); // an edit that was undone does not count
        if (isFlag) flagged++;
        if (changed) corrected++;
        if (isFlag && changed) flaggedCorrected++;
        if (changed && f.status === 'read') {
          silent++;
          const edits = r.corrections.filter(x => x.field_key === def.recordKey && (x.kind === 'correction' || x.kind === 'undo'));
          silentRows.push({ r, def, f, first: edits[0], last: edits[edits.length - 1] });
        }
      }
    }
    const firstPass = approved.filter(r => !Rules.FIELD_DEFS.some(d => Rules.humanChanged(r, d.recordKey))).length;
    const caughtByRule = silentRows.filter(x => x.first.caught_by === 'rule').length;
    // One photo can produce several records (register pages): count each photo's read time once.
    const seenForms = new Set();
    const latencies = ai.filter(r => r.extraction_latency_ms && !seenForms.has(r.form_id) && seenForms.add(r.form_id))
      .map(r => r.extraction_latency_ms).sort((a, b) => a - b);
    const mid = Math.floor(latencies.length / 2);
    const median = !latencies.length ? null : latencies.length % 2 ? latencies[mid] : (latencies[mid - 1] + latencies[mid]) / 2;
    const erpOk = approved.filter(r => r.erp_status === 'submitted').length;

    $('relForms').textContent = ai.length;
    $('relFormsNote').textContent = `${reviewed.length} reviewed · ${ai.length - reviewed.length} open`;
    $('relCorrection').textContent = pct(corrected, fields);
    $('relCorrectionNote').textContent = `${corrected} of ${fields} fields changed by a human`;
    $('relSilent').textContent = pct(silent, fields);
    $('relSilentNote').textContent = `${silent} confident AI reading${silent === 1 ? ' was' : 's were'} wrong${silent ? ` · ${caughtByRule} caught by a business rule` : ''}`;
    $('relFlagPrecision').textContent = pct(flaggedCorrected, flagged);
    $('relFlagPrecisionNote').textContent = `${flagged} fields flagged, ${flaggedCorrected} needed a change`;
    $('relFirstPass').textContent = pct(firstPass, approved.length);
    $('relFirstPassNote').textContent = `${firstPass} of ${approved.length} approved with no correction`;
    $('relLatency').textContent = median ? `${(median / 1000).toFixed(1)} s` : '—';
    $('relErp').textContent = pct(erpOk, approved.length);

    $('relEmpty').classList.toggle('hidden', reviewed.length > 0);
    const CAUGHT = { rule: 'Business rule (e.g. loom range)', ai_flag: 'AI flag', reviewer: 'Reviewer only' };
    $('silentTable').innerHTML = silentRows.length ? silentRows.slice(-15).reverse().map(({ r, def, f, first, last }) => `
      <tr>
        <td><a href="review.html?id=${encodeURIComponent(r.id)}" class="mono">${esc(r.record_number)}</a></td>
        <td>${esc(def.label)}</td>
        <td class="mono">${esc(f.raw_value ?? '—')}</td>
        <td class="mono"><del>${esc(String(first.original_value ?? '—'))}</del> → <strong>${esc(String(last.corrected_value ?? '—'))}</strong></td>
        <td>${esc(CAUGHT[first.caught_by] || '—')}</td>
        <td>${esc(last.reason || '')}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty-cell">No silent errors recorded yet.</td></tr>';
  }

  async function renderBenchmark() {
    const el = $('benchmarkBody');
    try {
      const resp = await fetch('assets/benchmark/results.json', { cache: 'no-store' });
      if (!resp.ok) throw new Error('missing');
      const b = await resp.json();
      if (b.status !== 'complete' || !b.summary) throw new Error('not run');
      const s = b.summary;
      el.innerHTML = `
        <p class="muted small">Run ${esc(new Date(b.generated_at).toLocaleString())} · ${esc(b.provider)} / ${esc(b.model)} · ${esc(s.samples)} sample forms (${esc(b.sample_set)})</p>
        <div class="kpi-grid kpi-grid-tight">
          ${[
            ['Field accuracy', s.field_accuracy, `${s.fields_correct}/${s.fields_total} fields exactly right`],
            ['Silent error rate', s.silent_error_rate, 'wrong but marked "read"'],
            ['Flag recall', s.flag_recall, 'hard fields the AI flagged'],
            ['Blank detection', s.blank_detection, 'blank fields left blank']
          ].map(([k, v, n]) => `<div class="kpi-card"><p class="kpi-label">${esc(k)}</p><p class="kpi-value">${esc(v === null ? '—' : `${(v * 100).toFixed(1)}%`)}</p><p class="kpi-note">${esc(n)}</p></div>`).join('')}
        </div>
        <p class="small"><a href="assets/benchmark/results.json" target="_blank" rel="noopener">Per-sample results (JSON)</a></p>`;
    } catch (_) {
      el.innerHTML = '<p class="muted">The offline benchmark has not been run on this deployment yet. Run <code>npm run benchmark</code> with an API key to measure field accuracy against the labelled sample forms.</p>';
    }
  }

  function renderCharts() {
    const C = window.AplydCharts;
    const p = C.palette();
    const since = Rules.todayIso(new Date(Date.now() - 29 * 864e5));
    const approved = records.filter(r => r.status === 'approved' && r.production_date >= since);
    $('chartsEmpty').classList.toggle('hidden', approved.length > 0);
    document.querySelector('.chart-grid').classList.toggle('hidden', approved.length === 0);

    const sumBy = (keyFn, valFn, rows) => rows.reduce((acc, r) => { const k = keyFn(r); if (k) acc[k] = (acc[k] || 0) + (Number(valFn(r)) || 0); return acc; }, {});
    const metres = approved.filter(r => (r.production_unit || 'metres') === 'metres');

    const byLoom = sumBy(r => r.machine && r.machine.machine_code, r => r.production_quantity, metres);
    const loomLabels = Object.keys(byLoom).sort();
    C.bar('loomOutputChart', loomLabels, loomLabels.map(k => byLoom[k]), { label: 'Metres' });

    const byShift = sumBy(r => r.shift && r.shift.name, r => r.production_quantity, metres);
    C.doughnut('shiftChart', Object.keys(byShift), Object.values(byShift));

    // Grouped by reason CODE, so "Loom cleaning", "Cleaning" and "safai" are one bar.
    const reasonName = (r) => (r.downtime_reason ? (Rules.matchReason(r.downtime_reason, reasons) || Rules.OTHER_REASON).name : null);
    const byReason = sumBy(reasonName, r => r.downtime_minutes, approved);
    const topReasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 6);
    C.bar('downtimeChart', topReasons.map(x => x[0]), topReasons.map(x => x[1]), { color: p.warn, horizontal: true, label: 'Minutes' });

    const defects = sumBy(r => r.machine && r.machine.machine_code, r => r.defects_count, approved);
    const dLabels = Object.keys(defects).sort();
    C.bar('defectChart', dLabels, dLabels.map(k => defects[k]), { color: p.bad, label: 'Defects', integer: true });
  }
})();
