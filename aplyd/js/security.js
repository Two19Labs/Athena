// Output escaping for any stored value interpolated into innerHTML.
// Load before page scripts. Usage: window.security.escapeHtml(value)
(function (global) {
  const ENTITY_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (ch) => ENTITY_MAP[ch]);
  }

  global.security = { escapeHtml };
})(window);
