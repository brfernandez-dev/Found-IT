// utils/dates.js - validate a YYYY-MM-DD date coming from a form.
function parseFormDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  // Reject things like 2026-02-31 that JS would roll over.
  const [y, m, day] = value.split('-').map(Number);
  if (d.getFullYear() !== y || d.getMonth() + 1 !== m || d.getDate() !== day) return null;
  return d;
}

function isFuture(date) {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return date.getTime() > endOfToday.getTime();
}

module.exports = { parseFormDate, isFuture };
