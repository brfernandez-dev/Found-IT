const pool = require("../db");
const { UserError } = require("../utils/errors");

const BODY_MAX = 1000;

// The table comes from sql/migrations/007_claim_messages.sql. If it has not
// been created yet, the site keeps working and the message box stays hidden.
function isMissingTable(err) {
  return err && err.code === "ER_NO_SUCH_TABLE" && /claim_messages/.test(err.message || "");
}

// Everything needed to decide who may read/write a claim's message box.
async function findThread(claimId) {
  const [rows] = await pool.execute(
    `SELECT
       c.id AS claim_id,
       c.status AS claim_status,
       c.user_id AS claimant_id,
       cu.display_name AS claimant_name,
       i.id AS item_id,
       i.item_name AS item_title,
       i.reference_no,
       i.status AS item_status,
       i.reporter_id AS finder_id,
       i.trashed_at,
       fu.display_name AS finder_name
     FROM claims c
     JOIN items i ON i.id = c.item_id
     JOIN users cu ON cu.id = c.user_id
     LEFT JOIN users fu ON fu.id = i.reporter_id
     WHERE c.id = ?
     LIMIT 1`,
    [claimId],
  );

  return rows[0] || null;
}

// Messages can be sent while the claim is pending or approved, and until the
// item is marked returned. A rejected or finished claim is read-only.
function canSend(thread) {
  return (
    ["pending", "approved"].includes(thread.claim_status) &&
    thread.item_status !== "returned"
  );
}

// Who is this user in the thread? 'staff', 'claimant', 'finder' or null.
function roleIn(thread, user) {
  if (!user) return null;
  if (user.role === "staff") return "staff";
  if (String(thread.claimant_id) === String(user.id)) return "claimant";
  if (
    thread.finder_id !== null &&
    thread.finder_id !== undefined &&
    String(thread.finder_id) === String(user.id)
  ) {
    return "finder";
  }
  return null;
}

async function listMessages(claimId) {
  try {
    const [rows] = await pool.execute(
      `SELECT m.id, m.body, m.created_at, m.sender_id,
              u.display_name AS sender_name, u.role AS sender_role
       FROM claim_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.claim_id = ?
       ORDER BY m.created_at ASC, m.id ASC`,
      [claimId],
    );
    return rows;
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

// All message boxes on one item, with their messages. `onlyUserId` limits it
// to the claims made by that user (a claimant only sees their own box).
async function listThreadsForItem(item, { onlyUserId = null } = {}) {
  const params = [item.id];
  let extra = "";

  if (onlyUserId) {
    extra = "AND c.user_id = ?";
    params.push(onlyUserId);
  }

  const [claims] = await pool.execute(
    `SELECT c.id AS claim_id, c.status AS claim_status, c.user_id AS claimant_id,
            u.display_name AS claimant_name, c.created_at
     FROM claims c
     JOIN users u ON u.id = c.user_id
     WHERE c.item_id = ? ${extra}
     ORDER BY c.created_at DESC`,
    params,
  );

  if (!claims.length) return [];

  let messages = [];

  try {
    const placeholders = claims.map(() => "?").join(",");
    const [rows] = await pool.execute(
      `SELECT m.id, m.claim_id, m.body, m.created_at, m.sender_id,
              u.display_name AS sender_name, u.role AS sender_role
       FROM claim_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.claim_id IN (${placeholders})
       ORDER BY m.created_at ASC, m.id ASC`,
      claims.map((c) => c.claim_id),
    );
    messages = rows;
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }

  return claims.map((claim) => ({
    ...claim,
    finder_id: item.reporter_id,
    item_status: item.status,
    canSend: canSend({ claim_status: claim.claim_status, item_status: item.status }),
    messages: messages.filter((m) => m.claim_id === claim.claim_id),
  }));
}

async function addMessage(claimId, senderId, body) {
  const text = String(body || "").trim();

  if (!text) throw new UserError("Please type a message first.");
  if (text.length > BODY_MAX) {
    throw new UserError(`Messages can be up to ${BODY_MAX} characters.`);
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO claim_messages (claim_id, sender_id, body) VALUES (?, ?, ?)`,
      [claimId, senderId, text],
    );
    return result.insertId;
  } catch (err) {
    if (isMissingTable(err)) {
      throw new UserError(
        "The message box is not set up yet. Ask the admin to run sql/migrations/007_claim_messages.sql.",
      );
    }
    throw err;
  }
}

module.exports = {
  BODY_MAX,
  findThread,
  roleIn,
  canSend,
  listMessages,
  listThreadsForItem,
  addMessage,
};
