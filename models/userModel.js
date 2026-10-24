// models/userModel.js - all user queries (parameterised)
const pool = require('../db');

async function findByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT id, email, password_hash, display_name, profile_image, role FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id, email, display_name, role, profile_image, created_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function create({ email, passwordHash, displayName }) {
  const [result] = await pool.execute(
    'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
    [email, passwordHash, displayName]
  );
  return result.insertId;
}

async function updateDisplayName(id, displayName) {
  await pool.execute(
    'UPDATE users SET display_name = ? WHERE id = ?',
    [displayName, id]
  );
}

async function updatePasswordHash(id, passwordHash) {
  await pool.execute(
    'UPDATE users SET password_hash = ? WHERE id = ?',
    [passwordHash, id]
  );
}

async function updateProfileImage(id, profileImage) {
  await pool.execute(
    'UPDATE users SET profile_image = ? WHERE id = ?',
    [profileImage, id]
  );
}

// ---- Presence: who is online right now ------------------------------------
// "Online" = active within the last ONLINE_WINDOW_MINUTES. Both sides of the
// comparison use the database clock (NOW()), so time zones cannot disagree.
// The two numbers below are constants, not user input.
const ONLINE_WINDOW_MINUTES = 5;
const ONLINE_CONDITION =
  'last_seen_at IS NOT NULL AND last_seen_at >= DATE_SUB(NOW(), INTERVAL ' +
  ONLINE_WINDOW_MINUTES + ' MINUTE)';

async function touchLastSeen(id) {
  await pool.execute('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [id]);
}

async function clearLastSeen(id) {
  await pool.execute('UPDATE users SET last_seen_at = NULL WHERE id = ?', [id]);
}

async function listOnline(limit = 50) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const [rows] = await pool.execute(
    'SELECT id, display_name, profile_image, role FROM users WHERE ' +
      ONLINE_CONDITION +
      " ORDER BY (role = 'staff') DESC, display_name ASC LIMIT " + safeLimit
  );
  return rows;
}

async function countOnline() {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM users WHERE ' + ONLINE_CONDITION
  );
  return Number(rows[0].total) || 0;
}

module.exports = {
  findByEmail,
  findById,
  create,
  updateDisplayName,
  updatePasswordHash,
  updateProfileImage,
  touchLastSeen,
  clearLastSeen,
  listOnline,
  countOnline,
  ONLINE_WINDOW_MINUTES
};