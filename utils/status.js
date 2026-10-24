// One place for how item statuses are named on screen.
// Database values: unclaimed, claim_pending, claimed, returned.
const LABELS = {
  unclaimed: "Unclaimed",
  claim_pending: "Pending",
  claimed: "Claimed",
  returned: "Returned",
};

function statusLabel(status) {
  return LABELS[status] || String(status || "").replace(/_/g, " ");
}

module.exports = { statusLabel, LABELS };
