const pool = require("../db");

// True when the database has not been migrated with 005_notification_sender.sql
// yet. We fall back to the old queries so claims/reports never crash because of
// a missing column - the sender just shows as "Found-It Admin" until migrated.
function isMissingSenderColumn(err) {
  return err && err.code === "ER_BAD_FIELD_ERROR" && /sender_id/.test(err.message || "");
}

// Create a notification for one user.
// senderId = the user whose action caused the notification (student or staff).
async function createNotification(
  userId,
  message,
  itemId = null,
  claimId = null,
  senderId = null,
) {
  if (!userId) return;

  try {
    await pool.execute(
      `INSERT INTO notifications
        (user_id, sender_id, message, item_id, claim_id)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, senderId || null, message, itemId, claimId],
    );
  } catch (err) {
    if (!isMissingSenderColumn(err)) throw err;
    await pool.execute(
      `INSERT INTO notifications
        (user_id, message, item_id, claim_id)
       VALUES (?, ?, ?, ?)`,
      [userId, message, itemId, claimId],
    );
  }
}

// Get notifications belonging only to the logged-in user, together with who
// sent each one and a small preview of the related item.
async function getNotifications(userId, { unreadOnly = false } = {}) {
  const unreadFilter = unreadOnly ? "AND n.is_read = 0" : "";

  try {
    const [rows] = await pool.execute(
      `SELECT
         n.id, n.message, n.item_id, n.claim_id, n.is_read, n.created_at,
         n.sender_id,
         s.display_name  AS sender_name,
         s.role          AS sender_role,
         s.profile_image AS sender_image,
         i.item_name     AS item_title,
         i.image_url     AS item_image
       FROM notifications n
       LEFT JOIN users s ON s.id = n.sender_id
       LEFT JOIN items i ON i.id = n.item_id
       WHERE n.user_id = ? ${unreadFilter}
       ORDER BY n.created_at DESC, n.id DESC`,
      [userId],
    );
    return rows;
  } catch (err) {
    if (!isMissingSenderColumn(err)) throw err;
    const [rows] = await pool.execute(
      `SELECT
         n.id, n.message, n.item_id, n.claim_id, n.is_read, n.created_at,
         NULL AS sender_id, NULL AS sender_name, NULL AS sender_role,
         NULL AS sender_image,
         i.item_name AS item_title, i.image_url AS item_image
       FROM notifications n
       LEFT JOIN items i ON i.id = n.item_id
       WHERE n.user_id = ? ${unreadFilter}
       ORDER BY n.created_at DESC, n.id DESC`,
      [userId],
    );
    return rows;
  }
}

// Find one notification, but only if it belongs to this user.
async function findForUser(notificationId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, item_id, claim_id, is_read
     FROM notifications
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [notificationId, userId],
  );

  return rows[0] || null;
}

// Count unread notifications
async function getUnreadCount(userId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM notifications
     WHERE user_id = ? AND is_read = 0`,
    [userId],
  );

  return rows[0].total;
}

// Mark one of the user's notifications as read
async function markAsRead(notificationId, userId) {
  await pool.execute(
    `UPDATE notifications
     SET is_read = 1
     WHERE id = ? AND user_id = ?`,
    [notificationId, userId],
  );
}

// Mark all of the user's notifications as read
async function markAllAsRead(userId) {
  await pool.execute(
    `UPDATE notifications
     SET is_read = 1
     WHERE user_id = ? AND is_read = 0`,
    [userId],
  );
}

// Notify every staff account in ONE query (optionally skipping the person
// who caused the event, so staff are not notified about their own action).
// senderId = who caused the event (defaults to excludeUserId).
async function notifyStaff(
  message,
  itemId = null,
  claimId = null,
  excludeUserId = null,
  senderId = excludeUserId,
) {
  try {
    await pool.execute(
      `INSERT INTO notifications (user_id, sender_id, message, item_id, claim_id)
       SELECT id, ?, ?, ?, ?
       FROM users
       WHERE role = 'staff' AND id <> ?`,
      [senderId || null, message, itemId, claimId, excludeUserId || 0],
    );
  } catch (err) {
    if (!isMissingSenderColumn(err)) throw err;
    await pool.execute(
      `INSERT INTO notifications (user_id, message, item_id, claim_id)
       SELECT id, ?, ?, ?
       FROM users
       WHERE role = 'staff' AND id <> ?`,
      [message, itemId, claimId, excludeUserId || 0],
    );
  }
}

module.exports = {
  createNotification,
  getNotifications,
  findForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  notifyStaff,
};
