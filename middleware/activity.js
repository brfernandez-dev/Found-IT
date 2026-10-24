// middleware/activity.js - presence tracking for the "Online now" panel
//
// trackActivity does two jobs:
//   1. While someone is logged in, record "last seen" at most once a minute.
//   2. On the pages that show the panel, load who is online.
//
// Presence is a nice-to-have: any database error here is swallowed so a
// missing migration can never break a page.
const userModel = require('../models/userModel');

const WRITE_EVERY_MS = 60 * 1000;
const PANEL_PAGES = new Set(['/', '/items', '/admin', '/admin/campus-board']);

let warned = false;
function warnOnce(err) {
  if (warned) return;
  warned = true;
  console.warn(
    'Presence tracking is off (have you run sql/migrations/006_user_last_seen.sql?):',
    err.message
  );
}

function normalise(path) {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

async function trackActivity(req, res, next) {
  res.locals.onlineUsers = [];
  res.locals.onlineCount = 0;

  const user = req.session && req.session.user;
  if (!user) return next();

  const now = Date.now();
  const due =
    !req.session.lastSeenWrittenAt ||
    now - req.session.lastSeenWrittenAt > WRITE_EVERY_MS;
  const showsPanel = req.method === 'GET' && PANEL_PAGES.has(normalise(req.path));

  try {
    if (due) {
      req.session.lastSeenWrittenAt = now;
      const write = userModel.touchLastSeen(user.id);
      // Wait for the write only when this page is about to list who is
      // online, so the visitor always sees themselves in the list.
      if (showsPanel) await write;
      else write.catch(warnOnce);
    }

    if (showsPanel) {
      const [users, count] = await Promise.all([
        userModel.listOnline(50),
        userModel.countOnline()
      ]);
      res.locals.onlineUsers = users;
      res.locals.onlineCount = count;
    }
  } catch (err) {
    warnOnce(err);
  }
  return next();
}

module.exports = { trackActivity };
