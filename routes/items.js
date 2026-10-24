const express = require("express");
const router = express.Router();
const path = require("path");
const itemModel = require("../models/itemModel");
const notificationModel = require("../models/notificationModel");
const messageModel = require("../models/messageModel");
const { requireLogin, requireStaff } = require("../middleware/auth");
const {
  imageUpload,
  removeFile,
  deleteStoredImage,
} = require("../middleware/upload");
const { UserError } = require("../utils/errors");
const { parseFormDate, isFuture } = require("../utils/dates");

const TITLE_MAX = 150;
const DESC_MAX = 2000;
const LOC_MAX = 150;
const CLAIM_TEXT_MAX = 2000;

const uploadDir = path.join(__dirname, "..", "public", "uploads", "items");
const upload = imageUpload({
  field: "image",
  dir: uploadDir,
  prefix: () => "item",
});

function isReporterOfItem(item, userId) {
  return (
    item.reporter_id !== null &&
    item.reporter_id !== undefined &&
    String(item.reporter_id) === String(userId)
  );
}

// Delete an uploaded file if the request is being rejected.
function discardUpload(req) {
  if (req.file) removeFile(req.file.path);
}

// Show a message from the model if it is safe to show, otherwise let the
// error handler render the generic 500 page.
function flashOrThrow(req, err, next, redirectTo) {
  if (err instanceof UserError) {
    req.flash("error", err.message);
    return redirectTo();
  }
  return next(err);
}

function validateItem(body) {
  const errors = [];

  const data = {
    type: String(body.type || "").trim(),
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    category: String(body.category || "").trim(),
    location: String(body.location || "").trim(),
  };

  if (!itemModel.TYPES.includes(data.type)) {
    errors.push("Choose Lost or Found.");
  }

  if (!data.title) {
    errors.push("Title is required.");
  }

  if (data.title.length > TITLE_MAX) {
    errors.push("Title is too long.");
  }

  if (!data.description) {
    errors.push("Description is required.");
  }

  if (data.description.length > DESC_MAX) {
    errors.push("Description is too long.");
  }

  if (!itemModel.CATEGORIES.includes(data.category)) {
    errors.push("Choose a category.");
  }

  if (!data.location) {
    errors.push("Location is required.");
  }

  if (data.location.length > LOC_MAX) {
    errors.push("Location is too long.");
  }

  return {
    errors,
    data,
  };
}

// Look up a lost report from a form/query value, or null.
async function findLostItem(value) {
  const lostId = Number(value);

  if (!Number.isInteger(lostId) || lostId <= 0) return null;

  const item = await itemModel.findById(lostId);

  return item && item.type === "lost" && item.approval_status === "approved"
    ? item
    : null;
}

// Browse items
router.get("/", async (req, res, next) => {
  if (req.session.user && req.session.user.role === "staff") {
    const query = new URLSearchParams();
    for (const key of ["q", "type", "status", "category"]) {
      const value =
        typeof req.query[key] === "string" ? req.query[key].trim() : "";
      if (value) query.set(key, value);
    }
    const suffix = query.toString();
    return res.redirect(
      303,
      "/admin/campus-board" + (suffix ? "?" + suffix : ""),
    );
  }

  try {
    const filters = {
      q: typeof req.query.q === "string" ? req.query.q : "",
      type: typeof req.query.type === "string" ? req.query.type : "",
      status: typeof req.query.status === "string" ? req.query.status : "",
      category:
        typeof req.query.category === "string" ? req.query.category : "",
    };

    const [items, counts] = await Promise.all([
      itemModel.list(filters),
      itemModel.counts(),
    ]);

    res.render("items/list", {
      title: "Browse items",
      items,
      counts,
      filters,
      categories: itemModel.CATEGORIES,
    });
  } catch (err) {
    next(err);
  }
});

// Convenience routes
router.get("/lost", (req, res) => {
  res.redirect("/items?type=lost");
});

router.get("/found", (req, res) => {
  res.redirect("/items?type=found");
});

// Show the new-item form
router.get("/new", requireLogin, async (req, res, next) => {
  try {
    const sourceLostItem = await findLostItem(req.query.fromLost);

    res.render(
      req.session.user && req.session.user.role === "staff"
        ? "admin/items/new"
        : "items/new",
      {
        title: "Report an item",
        categories: itemModel.CATEGORIES,
        errors: [],
        values: {
          type: sourceLostItem ? "found" : "",
          title: "",
          description: "",
          category: "",
          location: "",
        },
        sourceLostItem,
      },
    );
  } catch (err) {
    next(err);
  }
});

// Create a lost or found report
router.post("/", requireLogin, upload, async (req, res, next) => {
  try {
    const { errors, data } = validateItem(req.body);

    if (req.uploadError) {
      errors.push(req.uploadError);
    }

    // Only a found report may link back to a lost report.
    const sourceLostItem =
      data.type === "found"
        ? await findLostItem(req.body.relatedLostItemId)
        : null;

    if (errors.length) {
      discardUpload(req);

      return res.status(400).render("items/new", {
        title: "Report an item",
        categories: itemModel.CATEGORIES,
        errors,
        values: req.body,
        sourceLostItem,
      });
    }

    const imageUrl = req.file ? "/uploads/items/" + req.file.filename : null;

    // Reports from students wait for an admin decision before they reach the
    // campus board. Staff reports, and private "I found it" reports that are
    // linked to a lost report, are published straight away.
    const needsReview =
      req.session.user.role !== "staff" && !sourceLostItem;

    const id = await itemModel.create({
      ...data,
      imageUrl,
      reporterId: req.session.user.id,
      reporterName: req.session.user.displayName,
      reporterContact: req.session.user.email,
      relatedItemId: sourceLostItem ? sourceLostItem.id : null,
      approvalStatus: needsReview ? "pending" : "approved",
    });

    if (needsReview) {
      await notificationModel.notifyStaff(
        "A new " + data.type + " report needs review: " + data.title.slice(0, 100),
        id,
        null,
        req.session.user.id,
      );

      req.flash(
        "success",
        "Your report was submitted and is waiting for admin approval. We will notify you once it is approved or rejected.",
      );
    } else {
      req.flash(
        "success",
        data.type === "found"
          ? "Found item reported successfully."
          : "Lost item reported successfully.",
      );
    }

    return res.redirect(303, `/items/${id}`);
  } catch (err) {
    discardUpload(req);
    next(err);
  }
});

// Claim receipt
router.get(
  "/claims/:claimId(\\d+)/receipt",
  requireLogin,
  async (req, res, next) => {
    try {
      const receipt = await itemModel.findClaimReceipt(
        Number(req.params.claimId),
        req.session.user.id,
      );

      if (!receipt) {
        return res
          .status(404)
          .render(
            req.session.user && req.session.user.role === "staff"
              ? "admin/errors/404"
              : "errors/404",
            {
              title: "Not found",
            },
          );
      }

      res.render(
        req.session.user && req.session.user.role === "staff"
          ? "admin/items/claim-receipt"
          : "items/claim-receipt",
        {
          title: "Claim receipt",
          receipt,
        },
      );
    } catch (err) {
      next(err);
    }
  },
);

// Show the "I Found It" form for a lost report
router.get("/:id(\\d+)/found", requireLogin, async (req, res, next) => {
  try {
    const lostItem = await itemModel.findById(Number(req.params.id));

    if (!lostItem) {
      return res
        .status(404)
        .render(
          req.session.user && req.session.user.role === "staff"
            ? "admin/errors/404"
            : "errors/404",
          {
            title: "Not found",
          },
        );
    }

    if (lostItem.type !== "lost" || lostItem.approval_status !== "approved") {
      req.flash(
        "error",
        'The "I Found It" form can only be used for lost items on the campus board.',
      );

      return res.redirect(`/items/${lostItem.id}`);
    }

    res.render(
      req.session.user && req.session.user.role === "staff"
        ? "admin/items/found-from-lost"
        : "items/found-from-lost",
      {
        title: "I Found It",
        lostItem,
        categories: itemModel.CATEGORIES,
        errors: [],
        values: {
          location: "",
          description: "",
        },
      },
    );
  } catch (err) {
    next(err);
  }
});

// Submit a found report linked to a lost report
router.post(
  "/:id(\\d+)/found",
  requireLogin,
  upload,
  async (req, res, next) => {
    try {
      const lostItem = await itemModel.findById(Number(req.params.id));

      if (!lostItem) {
        discardUpload(req);

        return res
          .status(404)
          .render(
            req.session.user && req.session.user.role === "staff"
              ? "admin/errors/404"
              : "errors/404",
            {
              title: "Not found",
            },
          );
      }

      if (lostItem.type !== "lost" || lostItem.approval_status !== "approved") {
        discardUpload(req);

        req.flash("error", 'You can only use "I Found It" on a lost item that is on the campus board.');

        return res.redirect(`/items/${lostItem.id}`);
      }

      const location = String(req.body.location || "").trim();
      const description = String(req.body.description || "").trim();
      const dateFoundRaw = String(req.body.dateFound || "").trim();

      const errors = [];

      if (req.uploadError) {
        errors.push(req.uploadError);
      }

      if (!location) {
        errors.push("Please tell us where you found the item.");
      }

      if (location.length > LOC_MAX) {
        errors.push("The found location is too long.");
      }

      if (!description) {
        errors.push("Please describe the item you found.");
      }

      if (description.length > DESC_MAX) {
        errors.push("The description is too long.");
      }

      let dateFound = null;

      if (dateFoundRaw) {
        const parsed = parseFormDate(dateFoundRaw);

        if (!parsed) {
          errors.push("Please enter a valid date found.");
        } else if (isFuture(parsed)) {
          errors.push("The date found cannot be in the future.");
        } else {
          dateFound = dateFoundRaw;
        }
      }

      if (errors.length) {
        discardUpload(req);

        return res.status(400).render("items/found-from-lost", {
          title: "I Found It",
          lostItem,
          categories: itemModel.CATEGORIES,
          errors,
          values: req.body,
        });
      }

      const imageUrl = req.file ? "/uploads/items/" + req.file.filename : null;

      const foundId = await itemModel.createFoundFromLost({
        lostItemId: lostItem.id,
        title: lostItem.title,
        category: lostItem.category,
        location,
        description,
        imageUrl,
        reporterId: req.session.user.id,
        reporterName: req.session.user.displayName,
        reporterContact: req.session.user.email,
        dateFound,
      });

      // Notify the person who originally reported the lost item
      if (!isReporterOfItem(lostItem, req.session.user.id)) {
        await notificationModel.createNotification(
          lostItem.reporter_id,
          "Someone reported finding your lost item: " + lostItem.title,
          foundId,
          null,
          req.session.user.id, // sender = the student who found it
        );
      }

      // Notify staff about the new found-item report
      await notificationModel.notifyStaff(
        "A new found-item report was submitted: " + lostItem.title,
        foundId,
        null,
        req.session.user.id,
      );

      req.flash(
        "success",
        "Thank you! Your report was sent privately to the owner of the lost item and to the admin. It will not appear on the campus board.",
      );

      return res.redirect(303, `/items/${foundId}`);
    } catch (err) {
      discardUpload(req);

      next(err);
    }
  },
);

// Item details and timeline
router.get("/:id(\\d+)", async (req, res, next) => {
  try {
    const isStaff = req.session.user && req.session.user.role === "staff";

    const item = isStaff
      ? await itemModel.findByIdIncludingTrash(Number(req.params.id))
      : await itemModel.findById(Number(req.params.id));

    if (!item) {
      return res
        .status(404)
        .render(
          req.session.user && req.session.user.role === "staff"
            ? "admin/errors/404"
            : "errors/404",
          {
            title: "Not found",
          },
        );
    }

    const viewerId = req.session.user ? req.session.user.id : null;

    // A report that is still waiting for review (or was rejected) is only
    // visible to staff and to the student who posted it.
    if (
      item.approval_status !== "approved" &&
      !isStaff &&
      !(viewerId && isReporterOfItem(item, viewerId))
    ) {
      return res.status(404).render("errors/404", { title: "Not found" });
    }

    const [myClaim, allRelatedFound, timeline] = await Promise.all([
      viewerId ? itemModel.findClaimByUserAndItem(viewerId, item.id) : null,
      item.type === "lost" ? itemModel.findRelatedFoundItems(item.id) : [],
      itemModel.listTimeline(item.id),
    ]);

    // A linked "I found this item" report is private: only staff, the
    // finder, the owner of the lost report, or someone who already claimed
    // it may open it. Everyone else gets a 404, like it does not exist.
    const isLinkedFound = item.type === "found" && Boolean(item.related_item_id);
    const linkedLostItem = isLinkedFound
      ? await itemModel.findByIdIncludingTrash(item.related_item_id)
      : null;
    const isLostOwner = Boolean(
      viewerId && linkedLostItem && isReporterOfItem(linkedLostItem, viewerId),
    );

    if (!isStaff && isLinkedFound) {
      const allowed =
        Boolean(viewerId) &&
        (isReporterOfItem(item, viewerId) || Boolean(myClaim) || isLostOwner);

      if (!allowed) {
        return res.status(404).render("errors/404", { title: "Not found" });
      }
    }

    // On a lost report, the owner (and staff) see every linked found report;
    // a finder only sees the one they submitted; everyone else sees none.
    const relatedFoundItems =
      isStaff || (viewerId && isReporterOfItem(item, viewerId))
        ? allRelatedFound
        : allRelatedFound.filter((found) => viewerId && isReporterOfItem(found, viewerId));

    // Message boxes: staff see every claim's box, the finder sees the boxes
    // on their own report, a claimant only sees their own.
    let claimThreads = [];
    if (viewerId && item.type === "found") {
      const isFinder = isReporterOfItem(item, viewerId);
      claimThreads = await messageModel.listThreadsForItem(
        item,
        isStaff || isFinder ? {} : { onlyUserId: viewerId },
      );
    }

    res.render(
      req.session.user && req.session.user.role === "staff"
        ? "admin/items/detail"
        : "items/detail",
      {
        title: item.title,
        item,
        myClaim,
        claimThreads,
        relatedFoundItems,
        timeline,
        user: req.session.user,
        isReporter: req.session.user
          ? isReporterOfItem(item, req.session.user.id)
          : false,
        // The owner of the lost item opening a report someone else sent them
        // (e.g. from a notification) sees the finder's report, not a claim form.
        linkedLostItem,
        isLostOwnerView: !isStaff && isLostOwner,
      },
    );
  } catch (err) {
    next(err);
  }
});

// Submit a claim
router.post("/:id(\\d+)/claim", requireLogin, async (req, res, next) => {
  const itemId = Number(req.params.id);

  try {
    const userId = req.session.user.id;
    const item = await itemModel.findById(itemId);

    if (!item) {
      req.flash("error", "Item not found.");
      return res.redirect(303, "/items");
    }

    if (item.approval_status !== "approved") {
      req.flash("error", "This report is not published yet, so it cannot be claimed.");

      return res.redirect(303, `/items/${itemId}`);
    }

    if (item.type !== "found") {
      req.flash(
        "error",
        "Lost items cannot be claimed. Only found items can receive claims.",
      );

      return res.redirect(303, `/items/${itemId}`);
    }

    if (isReporterOfItem(item, userId)) {
      req.flash(
        "error",
        "You cannot claim an item that you reported yourself.",
      );

      return res.redirect(303, `/items/${itemId}`);
    }

    if (item.status !== "unclaimed") {
      req.flash("error", "This item is no longer available for claims.");

      return res.redirect(303, `/items/${itemId}`);
    }

    const reason = String(req.body.reason || "").trim();
    const distinguishingDetail = String(
      req.body.distinguishing_detail || "",
    ).trim();
    const dateLostRaw = String(req.body.dateLost || "").trim();
    const extraInfo = String(req.body.extraInfo || "").trim();
    const firstMessage = String(req.body.message || "").trim();

    const errors = [];

    if (firstMessage.length > messageModel.BODY_MAX) {
      errors.push("Your message is too long.");
    }

    if (!reason) {
      errors.push("Please provide a reason for your claim.");
    }

    if (!distinguishingDetail) {
      errors.push("Please provide distinguishing details.");
    }

    if (
      reason.length > CLAIM_TEXT_MAX ||
      distinguishingDetail.length > CLAIM_TEXT_MAX ||
      extraInfo.length > CLAIM_TEXT_MAX
    ) {
      errors.push("One of your answers is too long.");
    }

    let dateLost = null;

    if (dateLostRaw) {
      const parsed = parseFormDate(dateLostRaw);

      if (!parsed) {
        errors.push("Please enter a valid date lost.");
      } else if (isFuture(parsed)) {
        errors.push("The date lost cannot be in the future.");
      } else {
        dateLost = dateLostRaw;
      }
    }

    if (errors.length) {
      req.flash("error", errors.join(" "));
      return res.redirect(303, `/items/${itemId}?claim=open`);
    }

    const existing = await itemModel.findClaimByUserAndItem(userId, itemId);

    if (existing && ["pending", "approved"].includes(existing.status)) {
      req.flash(
        "error",
        existing.status === "approved"
          ? "Your claim for this item has already been approved."
          : "You already have a pending claim on this item.",
      );

      return res.redirect(303, `/items/${itemId}`);
    }

    const claimId = await itemModel.createClaim({
      itemId,
      userId,
      reason,
      distinguishingDetail,
      dateLost,
      extraInfo: extraInfo || null,
    });

    // Optional message to the finder, sent together with the claim.
    if (firstMessage) {
      try {
        await messageModel.addMessage(claimId, userId, firstMessage);
      } catch (msgErr) {
        if (!(msgErr instanceof UserError)) throw msgErr;
      }
    }

    // Notify the person who reported the found item
    if (!isReporterOfItem(item, userId)) {
      await notificationModel.createNotification(
        item.reporter_id,
        "Someone submitted a claim for your found item: " + item.title,
        itemId,
        claimId,
        userId, // sender = the student who submitted the claim
      );
    }

    // Notify staff so they can review the claim
    await notificationModel.notifyStaff(
      "A new claim needs review for: " + item.title,
      itemId,
      claimId,
      userId,
    );

    req.flash(
      "success",
      "Your claim has been submitted. We’ll review it shortly.",
    );

    return res.redirect(303, `/items/claims/${claimId}/receipt`);
  } catch (err) {
    return flashOrThrow(req, err, next, () =>
      res.redirect(303, `/items/${itemId}`),
    );
  }
});

// Message box for one claim (works even after the item moved to Trash)
router.get(
  "/claims/:claimId(\\d+)/messages",
  requireLogin,
  async (req, res, next) => {
    try {
      const user = req.session.user;
      const thread = await messageModel.findThread(Number(req.params.claimId));
      const role = thread ? messageModel.roleIn(thread, user) : null;

      if (!thread || !role) {
        return res.status(404).render(
          user.role === "staff" ? "admin/errors/404" : "errors/404",
          { title: "Not found" },
        );
      }

      // Staff manage everything from the item page.
      if (role === "staff") {
        return res.redirect(
          303,
          `/items/${thread.item_id}#claim-messages-${thread.claim_id}`,
        );
      }

      const messages = await messageModel.listMessages(thread.claim_id);

      res.render("items/claim-thread", {
        title: "Messages",
        user,
        thread: {
          ...thread,
          finder_id: thread.finder_id,
          canSend: messageModel.canSend(thread),
          messages,
        },
        isClaimant: role === "claimant",
      });
    } catch (err) {
      next(err);
    }
  },
);

// Send a message in a claim's message box
router.post(
  "/claims/:claimId(\\d+)/messages",
  requireLogin,
  async (req, res, next) => {
    const claimId = Number(req.params.claimId);

    try {
      const user = req.session.user;
      const thread = await messageModel.findThread(claimId);
      const role = thread ? messageModel.roleIn(thread, user) : null;

      if (!thread || !role) {
        return res.status(404).render(
          user.role === "staff" ? "admin/errors/404" : "errors/404",
          { title: "Not found" },
        );
      }

      const backTo =
        req.body.returnTo === "thread" && role !== "staff"
          ? `/items/claims/${claimId}/messages`
          : `/items/${thread.item_id}#claim-messages-${claimId}`;

      if (!messageModel.canSend(thread)) {
        req.flash("error", "This conversation is closed, so no new messages can be sent.");
        return res.redirect(303, backTo);
      }

      await messageModel.addMessage(claimId, user.id, req.body.body);

      // Tell the other people in the conversation.
      const preview = String(thread.item_title || "").slice(0, 80);
      const note = `New message about '${preview}' from ${user.displayName}.`;
      const recipients = new Set();

      if (role !== "claimant") recipients.add(String(thread.claimant_id));
      if (role !== "finder" && thread.finder_id) {
        recipients.add(String(thread.finder_id));
      }
      recipients.delete(String(user.id));

      for (const recipientId of recipients) {
        await notificationModel.createNotification(
          Number(recipientId),
          note,
          thread.item_id,
          claimId,
          user.id,
        );
      }

      return res.redirect(303, backTo);
    } catch (err) {
      return flashOrThrow(req, err, next, () =>
        res.redirect(303, `/items/claims/${claimId}/messages`),
      );
    }
  },
);

// Delete an item report
router.post("/:id(\\d+)/delete", requireLogin, async (req, res, next) => {
  try {
    const itemId = Number(req.params.id);
    const item = await itemModel.findById(itemId);

    if (!item) {
      return res.redirect(303, "/items");
    }

    const user = req.session.user;
    const isStaff = user.role === "staff";

    if (!isStaff && String(user.id) !== String(item.reporter_id)) {
      return res
        .status(403)
        .render(
          req.session.user && req.session.user.role === "staff"
            ? "admin/errors/403"
            : "errors/403",
          {
            title: "Forbidden",
          },
        );
    }

    // A reporter cannot make a report with a live claim disappear.
    if (!isStaff && ["claim_pending", "claimed"].includes(item.status)) {
      req.flash(
        "error",
        "This report has an active claim, so only staff can remove it.",
      );

      return res.redirect(303, `/items/${itemId}`);
    }

    // Remove the database row first; only then delete the picture, so a
    // failed delete never leaves a report pointing at a missing image.
    await itemModel.remove(itemId);
    await deleteStoredImage(item.image_url, "/uploads/items/", uploadDir);

    req.flash("success", "Report removed.");

    const destination =
      isStaff && req.body.returnTo === "admin" ? "/admin" : "/items";

    return res.redirect(303, destination);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
