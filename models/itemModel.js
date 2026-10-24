const pool = require("../db");
const { UserError } = require("../utils/errors");

const CATEGORIES = [
  "Electronics",
  "Keys",
  "Wallet",
  "Bag",
  "ID / Card",
  "Clothing",
  "Books",
  "Jewellery",
  "Other",
];

const STATUSES = ["unclaimed", "claim_pending", "claimed", "returned"];

const TYPES = ["lost", "found"];

const APPROVALS = ["pending", "approved", "rejected"];

// Add an event to an item's timeline. `db` can be a transaction connection.
async function addTimelineEvent(
  itemId,
  eventType,
  message,
  actorId = null,
  db = pool,
) {
  await db.execute(
    `INSERT INTO item_events (item_id, actor_id, event_type, message)
     VALUES (?, ?, ?, ?)`,
    [itemId, actorId, eventType, message],
  );
}

// Run `work(conn)` inside a transaction; roll back on any error.
async function withTransaction(work) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      console.error("Rollback failed:", rollbackErr.message);
    }
    throw err;
  } finally {
    conn.release();
  }
}

// Escape % and _ so a search for "100%" does not match everything.
function escapeLike(text) {
  return text.replace(/[\\%_]/g, "\\$&");
}

// Get timeline events for an item
async function listTimeline(itemId) {
  const [rows] = await pool.execute(
    `SELECT e.id, e.event_type, e.message, e.created_at,
            u.display_name AS actor_name
     FROM item_events e
     LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.item_id = ?
     ORDER BY e.created_at ASC, e.id ASC`,
    [itemId],
  );

  return rows;
}

// List and filter items
// "I found this item" reports (found reports linked to a lost report) are
// private: only the lost-item owner, the finder and staff see them, through
// notifications and the lost report's page. They never show on the campus
// board, otherwise the same item would appear twice.
const NOT_LINKED_FOUND = "NOT (item_type = 'found' AND related_item_id IS NOT NULL)";

async function list({ type, status, category, q, limit = 60 } = {}) {
  const where = ["trashed_at IS NULL", "approval_status = 'approved'", NOT_LINKED_FOUND];
  const params = [];

  if (TYPES.includes(type)) {
    where.push("item_type = ?");
    params.push(type);
  }

  if (STATUSES.includes(status)) {
    where.push("status = ?");
    params.push(status);
  }

  if (category && CATEGORIES.includes(category)) {
    where.push("category = ?");
    params.push(category);
  }

  if (q && q.trim()) {
    where.push(`
      (
        item_name LIKE ?
        OR description LIKE ?
        OR location LIKE ?
        OR reference_no LIKE ?
        OR reporter_name LIKE ?
      )
    `);

    const like = "%" + escapeLike(q.trim().slice(0, 100)) + "%";

    params.push(like, like, like, like, like);
  }

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 60));

  const sql = `
    SELECT
      id,
      reference_no,
      reporter_id,
      related_item_id,
      item_type AS type,
      item_name AS title,
      description,
      category,
      location,
      status,
      approval_status,
      image_url,
      date_reported,
      COALESCE((SELECT u.display_name FROM users u WHERE u.id = items.reporter_id), reporter_name) AS reporter_name,
      reporter_contact,
      created_at,
      updated_at
    FROM items
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  const [rows] = await pool.execute(sql, params);

  return rows;
}

// Find an item by ID
async function findById(id) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        reference_no,
        reporter_id,
        related_item_id,
        item_type AS type,
        item_name AS title,
        description,
        category,
        location,
        status,
        approval_status,
        review_note,
        image_url,
        date_reported,
        COALESCE((SELECT u.display_name FROM users u WHERE u.id = items.reporter_id), reporter_name) AS reporter_name,
        reporter_contact,
        created_at,
        updated_at
      FROM items
      WHERE id = ? AND trashed_at IS NULL
      LIMIT 1
    `,
    [id],
  );

  return rows[0] || null;
}

/**
 * Find an item by ID, including items in the Trash.
 * Use this only when staff need to view a trashed item.
 */
async function findByIdIncludingTrash(id) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        reference_no,
        reporter_id,
        related_item_id,
        item_type AS type,
        item_name AS title,
        description,
        category,
        location,
        status,
        approval_status,
        review_note,
        image_url,
        date_reported,
        COALESCE((SELECT u.display_name FROM users u WHERE u.id = items.reporter_id), reporter_name) AS reporter_name,
        reporter_contact,
        created_at,
        updated_at,
        trashed_at
      FROM items
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  return rows[0] || null;
}

// Create an item report and record it in the timeline
async function create(data) {
  const itemType = TYPES.includes(data.type) ? data.type : "found";

  const reporterName = data.reporterName || data.name || "Anonymous";

  const reporterContact = data.reporterContact || data.contact || "N/A";

  const itemName = data.title || data.itemName || "Unnamed Item";

  const description = data.description || "";
  const category = data.category || "Other";
  const location = data.location || "";
  const imageUrl = data.imageUrl || null;
  const referenceNo = data.referenceNo || generateReferenceNumber();
  const reporterId = data.reporterId || null;
  const approvalStatus = APPROVALS.includes(data.approvalStatus)
    ? data.approvalStatus
    : "approved";
  // Only a found report can point back at a lost report.
  const relatedItemId =
    itemType === "found" ? data.relatedItemId || null : null;

  const [result] = await pool.execute(
    `
      INSERT INTO items
      (
        reference_no,
        reporter_id,
        related_item_id,
        item_type,
        status,
        approval_status,
        item_name,
        description,
        category,
        location,
        image_url,
        date_reported,
        reporter_name,
        reporter_contact,
        type
      )
      VALUES (?, ?, ?, ?, 'unclaimed', ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?)
    `,
    [
      referenceNo,
      reporterId,
      relatedItemId,
      itemType,
      approvalStatus,
      itemName,
      description,
      category,
      location,
      imageUrl,
      reporterName,
      reporterContact,
      itemType,
    ],
  );

  await addTimelineEvent(
    result.insertId,
    "reported",
    (itemType === "lost"
      ? "Lost item report was posted"
      : "Found item report was posted") +
      (approvalStatus === "pending" ? " and is waiting for admin approval." : "."),
    reporterId,
  );

  if (itemType === "found" && relatedItemId) {
    const linkedLostItem = await findById(relatedItemId);

    if (linkedLostItem && linkedLostItem.type === "lost") {
      await addTimelineEvent(
        linkedLostItem.id,
        "found_linked",
        "A found-item report was linked to this lost report.",
        reporterId,
      );
    }
  }

  return result.insertId;
}

// Update item status and add a timeline event.
// Keeps claims consistent with the item:
//  - "claim_pending" can only exist while a claim is actually waiting
//  - "claimed" cannot be set by hand while a claim is waiting for review
//  - moving to "unclaimed" or "returned" closes any waiting claims
// Returns { changed, rejectedClaims } so the caller can notify claimants.
async function updateStatus(id, status, actorId = null) {
  if (!STATUSES.includes(status)) {
    throw new UserError("Invalid status.");
  }

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT id, item_type, status FROM items WHERE id = ? FOR UPDATE`,
      [id],
    );

    const item = rows[0];

    if (!item) {
      throw new UserError("Item not found.", 404);
    }

    if (
      item.item_type === "lost" &&
      ["claim_pending", "claimed"].includes(status)
    ) {
      throw new UserError("Lost items cannot have a claim status.");
    }

    if (item.status === status) {
      return { changed: false, rejectedClaims: [] };
    }

    const [pending] = await conn.execute(
      `SELECT id, user_id FROM claims WHERE item_id = ? AND status = 'pending'`,
      [id],
    );

    if (status === "claim_pending" && pending.length === 0) {
      throw new UserError(
        "An item only becomes 'claim pending' when someone submits a claim.",
      );
    }

    if (status === "claimed" && pending.length > 0) {
      throw new UserError(
        "This item has a claim waiting for review. Approve or reject it from the dashboard.",
      );
    }

    let rejectedClaims = [];

    if (["unclaimed", "returned"].includes(status) && pending.length > 0) {
      await conn.execute(
        `UPDATE claims SET status = 'rejected' WHERE item_id = ? AND status = 'pending'`,
        [id],
      );
      rejectedClaims = pending;
    }

    // Reopening a report also brings it back from Trash onto the board.
    await conn.execute(
      status === "unclaimed"
        ? `UPDATE items SET status = ?, trashed_at = NULL WHERE id = ?`
        : `UPDATE items SET status = ? WHERE id = ?`,
      [status, id],
    );

    const labels = {
      unclaimed: "Report is open and awaiting a match.",
      claim_pending: "A claim is awaiting review.",
      claimed: "The item was marked as claimed.",
      returned: "The item was marked as returned.",
    };

    await addTimelineEvent(
      id,
      "status_changed",
      labels[status] || `Status changed to ${status.replace("_", " ")}.`,
      actorId,
      conn,
    );

    return { changed: true, rejectedClaims };
  });
}

// Delete an item report
async function remove(id) {
  const [result] = await pool.execute(`DELETE FROM items WHERE id = ?`, [id]);

  return result.affectedRows;
}

// Count all items
async function counts() {
  const [rows] = await pool.execute(
    `
      SELECT
        COALESCE(SUM(item_type = 'lost'), 0) AS lost,
        COALESCE(SUM(item_type = 'found'), 0) AS found,
        COALESCE(SUM(status = 'unclaimed'), 0) AS unclaimed,
        COALESCE(SUM(status = 'claim_pending'), 0) AS pending,
        COALESCE(SUM(status = 'claimed'), 0) AS claimed,
        COALESCE(SUM(status = 'returned'), 0) AS returned,
        COUNT(*) AS total
      FROM items
      WHERE trashed_at IS NULL AND approval_status = 'approved' AND ${NOT_LINKED_FOUND}
    `,
  );

  return (
    rows[0] || {
      lost: 0,
      found: 0,
      unclaimed: 0,
      pending: 0,
      claimed: 0,
      returned: 0,
      total: 0,
    }
  );
}

// List recent items reported by a user
async function listByReporter(reporterId) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        reference_no,
        item_type AS type,
        item_name AS title,
        category,
        location,
        status,
        approval_status,
        review_note,
        date_reported,
        created_at
      FROM items
      WHERE reporter_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `,
    [reporterId],
  );

  return rows;
}

// Count a user's reports
async function reporterCounts(reporterId) {
  const [rows] = await pool.execute(
    `
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(item_type = 'lost'), 0) AS lost,
        COALESCE(SUM(item_type = 'found'), 0) AS found,
        COALESCE(SUM(status = 'returned'), 0) AS returned
      FROM items
      WHERE reporter_id = ?
    `,
    [reporterId],
  );

  return (
    rows[0] || {
      total: 0,
      lost: 0,
      found: 0,
      returned: 0,
    }
  );
}

// Generate a report reference number
function generateReferenceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);

  return `REF-${year}${month}${day}-${random}`;
}

// Create a claim and flip the item to claim_pending in ONE transaction, so
// two people claiming at the same moment can never both succeed.
async function createClaim(data) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT id, item_type, status, reporter_id FROM items WHERE id = ? FOR UPDATE`,
      [data.itemId],
    );

    const item = rows[0];

    if (!item) {
      throw new UserError("Item not found.", 404);
    }

    if (item.item_type !== "found") {
      throw new UserError("Only found items can be claimed.");
    }

    if (
      item.reporter_id !== null &&
      String(item.reporter_id) === String(data.userId)
    ) {
      throw new UserError(
        "You cannot claim an item that you reported yourself.",
      );
    }

    if (item.status !== "unclaimed") {
      throw new UserError(
        "This item is no longer available for claims. Please refresh the page.",
      );
    }

    const [result] = await conn.execute(
      `
        INSERT INTO claims
        (item_id, user_id, reason, distinguishing_detail, date_lost, extra_info, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `,
      [
        data.itemId,
        data.userId,
        data.reason,
        data.distinguishingDetail,
        data.dateLost || null,
        data.extraInfo || null,
      ],
    );

    await conn.execute(
      `UPDATE items SET status = 'claim_pending' WHERE id = ?`,
      [data.itemId],
    );

    await addTimelineEvent(
      data.itemId,
      "claim_submitted",
      "A claim was submitted and is awaiting review.",
      data.userId,
      conn,
    );

    return result.insertId;
  });
}

// Find a user's latest claim for an item
async function findClaimByUserAndItem(userId, itemId) {
  const [rows] = await pool.execute(
    `
      SELECT id, status
      FROM claims
      WHERE user_id = ? AND item_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId, itemId],
  );

  return rows[0] || null;
}

// Get a claim receipt belonging to the logged-in user
async function findClaimReceipt(claimId, userId) {
  const [rows] = await pool.execute(
    `
      SELECT
        c.id,
        c.status,
        c.created_at,
        i.reference_no AS item_reference,
        i.item_name AS item_title,
        i.item_type AS item_type,
        i.category,
        i.location,
        u.display_name AS claimant_name,
        u.email AS claimant_email
      FROM claims c
      JOIN items i ON i.id = c.item_id
      JOIN users u ON u.id = c.user_id
      WHERE c.id = ? AND c.user_id = ?
      LIMIT 1
    `,
    [claimId, userId],
  );

  return rows[0] || null;
}

// List claims made for an item
async function listClaimsForItem(itemId) {
  const [rows] = await pool.execute(
    `
      SELECT
        c.*,
        u.display_name,
        u.email
      FROM claims c
      JOIN users u ON u.id = c.user_id
      WHERE c.item_id = ?
      ORDER BY c.created_at DESC
    `,
    [itemId],
  );

  return rows;
}

// Find one claim (staff use)
async function findClaimById(claimId) {
  const [rows] = await pool.execute(
    `SELECT id, item_id, user_id, status FROM claims WHERE id = ? LIMIT 1`,
    [claimId],
  );

  return rows[0] || null;
}

// The claimant whose claim was approved for an item (or null)
async function findApprovedClaimant(itemId) {
  const [rows] = await pool.execute(
    `SELECT c.id AS claim_id, c.user_id
     FROM claims c
     WHERE c.item_id = ? AND c.status = 'approved'
     ORDER BY c.updated_at DESC
     LIMIT 1`,
    [itemId],
  );

  return rows[0] || null;
}

// Find found reports linked to a lost report
async function findRelatedFoundItems(lostItemId) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        reference_no,
        reporter_id,
        item_name AS title,
        description,
        category,
        location,
        status,
        image_url,
        date_reported,
        reporter_name
      FROM items
      WHERE related_item_id = ?
      AND trashed_at IS NULL
      AND item_type = 'found'
      ORDER BY created_at DESC
    `,
    [lostItemId],
  );

  return rows;
}

// List claims waiting for staff review
async function listPendingClaims() {
  const [rows] = await pool.execute(
    `
      SELECT
        c.id,
        c.item_id,
        c.user_id,
        c.reason,
        c.distinguishing_detail,
        c.date_lost,
        c.extra_info,
        c.status,
        c.created_at,
        i.reference_no,
        i.item_name,
        i.item_type,
        i.category,
        i.location,
        i.image_url,
        u.display_name AS claimant_name,
        u.email AS claimant_email,
        reporter.display_name AS finder_name,
        reporter.email AS finder_email
      FROM claims c
      JOIN items i ON i.id = c.item_id
      JOIN users u ON u.id = c.user_id
      LEFT JOIN users reporter ON reporter.id = i.reporter_id
      WHERE c.status = 'pending'
      AND i.item_type = 'found'
      ORDER BY c.created_at ASC
    `,
  );

  return rows;
}

// Approve or reject a claim (transactional).
// Returns { claimantId, itemId, title } so the route can notify the claimant.
async function reviewClaim(claimId, decision, reviewerId = null) {
  if (decision !== "approved" && decision !== "rejected") {
    throw new UserError("Invalid claim decision.");
  }

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `
        SELECT
          c.id,
          c.item_id,
          c.user_id,
          c.status AS claim_status,
          i.item_type,
          i.item_name,
          i.status AS item_status
        FROM claims c
        JOIN items i ON i.id = c.item_id
        WHERE c.id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [claimId],
    );

    const claim = rows[0];

    if (!claim) {
      throw new UserError("Claim not found.", 404);
    }

    if (claim.claim_status !== "pending") {
      throw new UserError("This claim has already been reviewed.");
    }

    if (claim.item_type !== "found") {
      throw new UserError("Only found items can have approved claims.");
    }

    if (
      decision === "approved" &&
      !["claim_pending", "unclaimed"].includes(claim.item_status)
    ) {
      throw new UserError(
        "This item's status changed since the claim was made. Refresh and check it first.",
      );
    }

    await conn.execute(`UPDATE claims SET status = ? WHERE id = ?`, [
      decision,
      claimId,
    ]);

    if (decision === "approved") {
      await conn.execute(
        `UPDATE items SET status = 'claimed', trashed_at = NOW() WHERE id = ?`,
        [claim.item_id],
      );
    } else {
      await conn.execute(
        `UPDATE items SET status = 'unclaimed'
         WHERE id = ? AND status = 'claim_pending'`,
        [claim.item_id],
      );
    }

    await addTimelineEvent(
      claim.item_id,
      decision === "approved" ? "claim_approved" : "claim_rejected",
      decision === "approved"
        ? "A claim was approved. The item can be returned to its owner."
        : "A claim was rejected. The item is available for another claim.",
      reviewerId,
      conn,
    );

    return {
      claimantId: claim.user_id,
      itemId: claim.item_id,
      title: claim.item_name,
      completed: decision === "approved",
    };
  });
}

// Create a found report linked to an existing lost report
async function createFoundFromLost(data) {
  const lostItem = await findById(data.lostItemId);

  if (!lostItem) {
    throw new UserError("Original lost item not found.", 404);
  }

  if (lostItem.type !== "lost") {
    throw new UserError("A found report can only be linked to a lost item.");
  }

  const referenceNo = generateReferenceNumber();
  const title = data.title || lostItem.title || "Found Item";
  const category = data.category || lostItem.category || "Other";
  const description = data.description || "";
  const location = data.location || "";
  const imageUrl = data.imageUrl || null;
  const reporterId = data.reporterId || null;
  const reporterName = data.reporterName || "Anonymous";
  const reporterContact = data.reporterContact || "N/A";

  const [result] = await pool.execute(
    `
      INSERT INTO items
      (
        reference_no,
        reporter_id,
        related_item_id,
        item_type,
        status,
        item_name,
        description,
        category,
        location,
        image_url,
        date_reported,
        reporter_name,
        reporter_contact,
        type
      )
      VALUES (?, ?, ?, 'found', 'unclaimed', ?, ?, ?, ?, ?, CURDATE(), ?, ?, 'found')
    `,
    [
      referenceNo,
      reporterId,
      lostItem.id,
      title,
      description,
      category,
      location,
      imageUrl,
      reporterName,
      reporterContact,
    ],
  );

  await addTimelineEvent(
    result.insertId,
    "reported",
    "Found item report was posted and linked to lost report " +
      lostItem.reference_no +
      (data.dateFound ? ". Item found on " + data.dateFound + "." : "."),
    reporterId,
  );

  await addTimelineEvent(
    lostItem.id,
    "found_linked",
    "A found-item report was linked to this lost report.",
    reporterId,
  );

  return result.insertId;
}

// Reports (not claims) waiting for an admin decision, oldest first.
async function listPendingReports() {
  const [rows] = await pool.execute(
    `SELECT
       i.id, i.reference_no, i.item_type AS type, i.item_name AS title,
       i.description, i.category, i.location, i.image_url, i.created_at,
       i.reporter_id,
       COALESCE(u.display_name, i.reporter_name) AS reporter_name,
       COALESCE(u.email, i.reporter_contact) AS reporter_contact
     FROM items i
     LEFT JOIN users u ON u.id = i.reporter_id
     WHERE i.approval_status = 'pending' AND i.trashed_at IS NULL
     ORDER BY i.created_at ASC`,
  );

  return rows;
}

async function countPendingReports() {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM items
     WHERE approval_status = 'pending' AND trashed_at IS NULL`,
  );

  return rows[0] ? Number(rows[0].total) : 0;
}

// Approve or reject a new report (transactional).
// Returns what the route needs to notify the student who posted it.
async function reviewReport(id, decision, reviewerId = null, note = null) {
  if (decision !== "approved" && decision !== "rejected") {
    throw new UserError("Invalid decision.");
  }

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT id, item_type, item_name, reporter_id, approval_status
       FROM items WHERE id = ? FOR UPDATE`,
      [id],
    );

    const item = rows[0];

    if (!item) throw new UserError("Report not found.", 404);

    if (item.approval_status !== "pending") {
      throw new UserError("This report was already reviewed.");
    }

    const cleanNote =
      decision === "rejected" && note ? String(note).trim().slice(0, 255) : null;

    await conn.execute(
      `UPDATE items
       SET approval_status = ?, review_note = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [decision, cleanNote || null, id],
    );

    await addTimelineEvent(
      id,
      decision === "approved" ? "report_approved" : "report_rejected",
      decision === "approved"
        ? "The report was approved and is now on the campus board."
        : "The report was not approved." + (cleanNote ? " Reason: " + cleanNote : ""),
      reviewerId,
      conn,
    );

    return {
      reporterId: item.reporter_id,
      title: item.item_name,
      type: item.item_type,
      note: cleanNote,
    };
  });
}

// Reports in Trash are retained for 30 days before permanent deletion.
async function listTrash() {
  const [rows] = await pool.execute(
    `SELECT id, reference_no, item_type AS type, item_name AS title, status, image_url, trashed_at
     FROM items WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC`,
  );
  return rows;
}

async function purgeExpiredTrash() {
  const [rows] = await pool.execute(
    `SELECT id, image_url FROM items
     WHERE trashed_at IS NOT NULL AND trashed_at <= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
  );
  if (rows.length) {
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => "?").join(",");
    await pool.execute(`DELETE FROM items WHERE id IN (${placeholders})`, ids);
  }
  return rows;
}

module.exports = {
  list,
  listTimeline,
  findById,
  findByIdIncludingTrash,
  create,
  createFoundFromLost,
  updateStatus,
  remove,
  counts,
  listByReporter,
  reporterCounts,
  createClaim,
  findClaimByUserAndItem,
  findClaimReceipt,
  findClaimById,
  listClaimsForItem,
  findApprovedClaimant,
  findRelatedFoundItems,
  listPendingClaims,
  reviewClaim,
  listTrash,
  listPendingReports,
  countPendingReports,
  reviewReport,
  purgeExpiredTrash,
  CATEGORIES,
  STATUSES,
  TYPES,
  APPROVALS,
};
