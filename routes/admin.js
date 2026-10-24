const notificationModel = require("../models/notificationModel");
const express = require("express");
const router = express.Router();

const itemModel = require("../models/itemModel");
const { requireLogin, requireStaff } = require("../middleware/auth");
const { UserError } = require("../utils/errors");
const { statusLabel } = require("../utils/status");

// =====================================================
// ADMIN CAMPUS BOARD
// =====================================================

// Keep the old URL working, but use Campus Board as the main admin page.
router.get("/", requireLogin, requireStaff, (req, res) => {
  const query = new URLSearchParams();
  for (const key of ["q", "type", "status", "category"]) {
    const value = typeof req.query[key] === "string" ? req.query[key].trim() : "";
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return res.redirect(303, "/admin/campus-board" + (suffix ? "?" + suffix : ""));
});

router.get("/campus-board", requireLogin, requireStaff, async (req, res, next) => {
  try {
    const filters = {
      q: typeof req.query.q === "string" ? req.query.q.trim() : "",
      type: typeof req.query.type === "string" ? req.query.type : "",
      status: typeof req.query.status === "string" ? req.query.status : "",
      category: typeof req.query.category === "string" ? req.query.category : "",
    };

    const [items, counts, awaitingReview] = await Promise.all([
      itemModel.list({ ...filters, limit: 200 }),
      itemModel.counts(),
      itemModel.countPendingReports(),
    ]);

    res.render("admin/campus-board", {
      awaitingReview,
      title: "Campus Board",
      items,
      counts,
      filters,
      statuses: itemModel.STATUSES,
      categories: itemModel.CATEGORIES,
    });
  } catch (err) {
    next(err);
  }
});

// Trash: completed reports retained for 30 days.
router.get("/trash", requireLogin, requireStaff, async (req, res, next) => {
  try {
    const items = await itemModel.listTrash();
    res.render("admin/trash", { title: "Trash", items });
  } catch (err) { next(err); }
});

// =====================================================
// CHANGE ITEM STATUS (unclaimed / claimed / returned)
// "Pending" is automatic: it is set when someone submits a claim.
// =====================================================

router.post(
  "/items/:id(\\d+)/status",
  requireLogin,
  requireStaff,
  async (req, res, next) => {
    const itemId = Number(req.params.id);
    const back = "/items/" + itemId;

    try {
      const status = String(req.body.status || "");
      const item = await itemModel.findByIdIncludingTrash(itemId);

      if (!item) {
        req.flash("error", "Item not found.");
        return res.redirect(303, "/admin/campus-board");
      }

      const approved =
        status === "returned" ? await itemModel.findApprovedClaimant(itemId) : null;

      const result = await itemModel.updateStatus(
        itemId,
        status,
        req.session.user.id,
      );

      if (!result.changed) {
        req.flash("success", "The status is already " + statusLabel(status) + ".");
        return res.redirect(303, back);
      }

      // Claims that were waiting got closed by this change: tell the claimants.
      for (const claim of result.rejectedClaims) {
        await notificationModel.createNotification(
          claim.user_id,
          "Your claim for '" + item.title + "' was closed because the report was marked " + statusLabel(status) + ".",
          itemId,
          claim.id,
          req.session.user.id,
        );
      }

      if (status === "returned") {
        const message = "'" + item.title + "' was marked as returned to its owner.";
        if (approved && approved.user_id) {
          await notificationModel.createNotification(
            approved.user_id,
            message,
            itemId,
            approved.claim_id,
            req.session.user.id,
          );
        }
        if (item.reporter_id && (!approved || String(approved.user_id) !== String(item.reporter_id))) {
          await notificationModel.createNotification(
            item.reporter_id,
            message + " Thank you for reporting it!",
            itemId,
            approved ? approved.claim_id : null,
            req.session.user.id,
          );
        }
      }

      req.flash("success", "Status changed to " + statusLabel(status) + ".");
      return res.redirect(303, back);
    } catch (err) {
      if (err instanceof UserError) {
        req.flash("error", err.message);
        return res.redirect(303, back);
      }
      return next(err);
    }
  },
);

// =====================================================
// REVIEW A NEW REPORT (approve = publish on the board, reject = keep hidden)
// =====================================================

router.post(
  "/items/:id(\\d+)/review",
  requireLogin,
  requireStaff,
  async (req, res, next) => {
    const itemId = Number(req.params.id);
    const back = String(req.body.returnTo || "") === "notifications"
      ? "/notifications"
      : "/items/" + itemId;

    try {
      const decision = String(req.body.decision || "");
      const note = String(req.body.note || "").trim();

      const reviewed = await itemModel.reviewReport(
        itemId,
        decision,
        req.session.user.id,
        note,
      );

      const kind = reviewed.type === "lost" ? "lost" : "found";

      // Tell the student who posted it.
      await notificationModel.createNotification(
        reviewed.reporterId,
        decision === "approved"
          ? "Your " + kind + " report '" + reviewed.title + "' was approved. It is now on the campus board."
          : "Your " + kind + " report '" + reviewed.title + "' was rejected." +
              (reviewed.note ? " Reason: " + reviewed.note : ""),
        itemId,
        null,
        req.session.user.id,
      );

      req.flash(
        "success",
        decision === "approved"
          ? "Report approved and published to the campus board."
          : "Report rejected. The student was notified.",
      );

      return res.redirect(303, back);
    } catch (err) {
      if (err instanceof UserError) {
        req.flash("error", err.message);
        return res.redirect(303, back);
      }
      return next(err);
    }
  },
);

// =====================================================
// REVIEW CLAIM
// =====================================================

router.post(
  "/claims/:claimId(\\d+)/review",
  requireLogin,
  requireStaff,
  async (req, res, next) => {
    try {
      const claimId = Number(req.params.claimId);
      const decision = String(req.body.decision || "");

      if (decision !== "approved" && decision !== "rejected") {
        req.flash("error", "Invalid claim decision.");

        return res.redirect(303, "/admin/campus-board");
      }

      // One transaction: claim + item + timeline change together.
      const reviewed = await itemModel.reviewClaim(
        claimId,
        decision,
        req.session.user.id,
      );

      // Notify the claimant about the decision
      await notificationModel.createNotification(
        reviewed.claimantId,
        "Your claim for '" + reviewed.title + "' was " + decision + ".",
        reviewed.itemId,
        claimId,
        req.session.user.id, // sender = the reviewing admin
      );

      if (reviewed.completed) {
        await notificationModel.notifyStaff(
          "Transaction completed for '" + reviewed.title + "'. The report was moved to Trash and will be permanently deleted after 30 days.",
          reviewed.itemId,
          claimId,
          null,
          req.session.user.id,
        );
      }

      req.flash(
        "success",
        decision === "approved"
          ? "Claim approved. The transaction is complete and the report was moved to Trash."
          : "Claim rejected. The item is available for another claim.",
      );

      return res.redirect(303, "/admin/campus-board");
    } catch (err) {
      // Only show messages we wrote; anything else is a real bug -> 500 page.
      if (err instanceof UserError) {
        req.flash("error", err.message);

        return res.redirect(303, "/admin/campus-board");
      }

      return next(err);
    }
  },
);

module.exports = router;
