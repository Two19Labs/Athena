/** APLYD - entry page: pick a demo persona, or reset this browser's demo data. */
(function () {
  document.querySelectorAll('.persona-card').forEach(btn => btn.addEventListener('click', () => {
    window.aplydStore.switchUser(btn.dataset.role);
    window.location.href = btn.dataset.role === 'operator' ? 'capture.html' : 'dashboard.html';
  }));
  document.getElementById('resetDemoBtn').addEventListener('click', async () => {
    const ok = await window.dialog.confirm({ title: 'Reset demo data?', message: 'Deletes every captured form, photo and record in this browser. Loom and shift settings go back to the defaults.', confirmText: 'Reset', danger: true });
    if (!ok) return;
    await window.aplydStore.resetDemo();
    window.toast.show('Demo data reset.', 'success');
  });
})();
