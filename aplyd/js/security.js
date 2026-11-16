// Output-sanitisation helpers. Load BEFORE any page script that interpolates
// stored values into innerHTML. Exposed as window.security.{escapeHtml, safeUrl}.
(function (global) {
  const ENTITY_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (ch) => ENTITY_MAP[ch]);
  }

  // Allow only http(s) URLs for href targets sourced from user input.
  function safeUrl(value) {
    if (!value) return '#';
    try {
      const u = new URL(String(value), global.location.origin);
      if (u.protocol === 'http:' || u.protocol === 'https:') return escapeHtml(u.toString());
    } catch (_) { /* fall through */ }
    return '#';
  }

  global.security = { escapeHtml, safeUrl };
  global.escapeHtml = escapeHtml; // short alias
})(window);
