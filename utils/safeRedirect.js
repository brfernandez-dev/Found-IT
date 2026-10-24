// utils/safeRedirect.js - only allow redirects to paths on this site.
// "/items/1" is fine; "//evil.com", "/\evil.com" and "https://evil.com" are not.
function safeNext(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  if (value.length === 0 || value.length > 500) return fallback;
  if (value[0] !== '/') return fallback;
  if (value[1] === '/' || value[1] === '\\') return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  return value;
}

module.exports = { safeNext };
