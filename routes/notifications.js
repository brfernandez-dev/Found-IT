const express = require("express");
const router = express.Router();

const notificationModel = require("../models/notificationModel");
const { requireLogin } = require("../middleware/auth");
const itemModel = require("../models/itemModel");
const messageModel = require("../models/messageModel");

// Display the logged-in user's notifications
router.get("/", requireLogin, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const isStaff = req.session.user.role === "staff";
    const filter = req.query.filter === "unread" ? "unread" : "all";

    const [notifications, unreadCount, pendingClaims, pendingReports] = await Promise.all([
      notificationModel.getNotifications(userId, { unreadOnly: filter === "unread" }),
      notificationModel.getUnreadCount(userId),
      isStaff ? itemModel.listPendingClaims() : [],
      isStaff ? itemModel.listPendingReports() : [],
    ]);

    res.render(isStaff ? "admin/notifications/index" : "notifications/index", {
      title: "Notifications",
      notifications,
      unreadCount,
      filter,
      pendingClaims,
      pendingReports,
    });
  } catch (err) {
    next(err);
  }
});

// Open a notification: mark it as read, then go straight to what it is about.
// This replaces the old "View item" link - the whole notification is the link.
router.get("/:id(\\d+)/open", requireLogin, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const isStaff = req.session.user.role === "staff";

    const notification = await notificationModel.findForUser(
      Number(req.params.id),
      userId,
    );

    if (!notification) return res.redirect("/notifications");

    if (!notification.is_read) {
      await notificationModel.markAsRead(notification.id, userId);
    }

    // 1) The item itself, if this user can still see it.
    if (notification.item_id) {
      const item = isStaff
        ? await itemModel.findByIdIncludingTrash(notification.item_id)
        : await itemModel.findById(notification.item_id);

      if (item) return res.redirect("/items/" + item.id);
    }

    // 2) Completed transactions move the item to Trash, so a student whose
    //    claim was approved is sent to their claim receipt instead.
    if (notification.claim_id) {
      const receipt = await itemModel.findClaimReceipt(notification.claim_id, userId);

      if (receipt) return res.redirect("/items/claims/" + notification.claim_id + "/receipt");
    }

    // 2b) The finder of a completed item (not the claimant) lands on the
    //     claim's message box, which still works after the move to Trash.
    if (notification.claim_id && !isStaff) {
      const thread = await messageModel.findThread(notification.claim_id);

      if (thread && messageModel.roleIn(thread, req.session.user)) {
        return res.redirect("/items/claims/" + notification.claim_id + "/messages");
      }
    }

    // 3) Nothing left to show.
    if (notification.item_id || notification.claim_id) {
      req.flash("error", "This item is no longer available. The transaction may already be completed.");
    }

    return res.redirect("/notifications");
  } catch (err) {
    next(err);
  }
});

// Mark one notification as read
router.post("/:id(\\d+)/read", requireLogin, async (req, res, next) => {
  try {
    await notificationModel.markAsRead(req.params.id, req.session.user.id);

    res.redirect("/notifications");
  } catch (err) {
    next(err);
  }
});

// Mark all notifications as read
router.post("/read-all", requireLogin, async (req, res, next) => {
  try {
    await notificationModel.markAllAsRead(req.session.user.id);

    res.redirect("/notifications");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
