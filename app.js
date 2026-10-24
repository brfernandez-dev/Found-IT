// app.js - Express app: middleware, routes, error handling

require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");

const itemRoutes = require("./routes/items");
const adminRoutes = require("./routes/admin");
const authRoutes = require("./routes/auth");
const settingsRoutes = require("./routes/settings");
const notificationRoutes = require("./routes/notifications");
const notificationModel = require("./models/notificationModel");
const itemModel = require("./models/itemModel");
const { exposeUser } = require("./middleware/auth");
const { trackActivity } = require("./middleware/activity");
const pool = require("./db");
const fs = require("fs");
const { purgeExpiredTrash } = itemModel;

// Permanently purge reports that have spent 30 days in Trash.
// Runs on startup and every 24 hours; image files are removed after DB deletion.
async function purgeOldTrash() {
  try {
    const expired = await purgeExpiredTrash();
    for (const item of expired) {
      if (item.image_url && item.image_url.startsWith("/uploads/items/")) {
        const filePath = path.join(__dirname, "public", item.image_url.replace(/^\//, ""));
        fs.unlink(filePath, (err) => { if (err && err.code !== "ENOENT") console.error("Trash image cleanup failed:", err.message); });
      }
    }
  } catch (err) {
    // A missing migration is logged rather than crashing the whole web server.
    console.error("Trash cleanup failed. Confirm the trash migration was applied:", err.message);
  }
}

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// A guessable session secret lets anyone forge a login cookie.
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set when NODE_ENV=production.");
}

// Behind a reverse proxy (Nginx, Render, Railway...) set TRUST_PROXY=1 so
// req.ip and secure cookies work correctly.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

app.disable("x-powered-by");

// =====================================================
// VIEW ENGINE
// =====================================================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// =====================================================
// LOGGER
// =====================================================

app.use((req, res, next) => {
  const started = Date.now();

  res.on("finish", () => {
    console.log(
      req.method,
      req.originalUrl,
      res.statusCode,
      Date.now() - started + "ms",
    );
  });

  next();
});

// =====================================================
// STATIC FILES
// =====================================================

// Uploaded pictures have unique names, so they can be cached for a long time.
app.use(
  ["/uploads", "/images"],
  express.static(path.join(__dirname, "public"), { maxAge: "7d" }),
);
app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// BODY PARSERS
// =====================================================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// =====================================================
// SESSION
// =====================================================

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-only-change-me",
    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // "auto" = secure whenever the request came in over HTTPS.
      secure: isProduction ? "auto" : false,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

// =====================================================
// FLASH MESSAGES
// =====================================================

app.use(flash());

// =====================================================
// CURRENT USER + PATH
// =====================================================

app.use(exposeUser);

// Status names for views: unclaimed / pending / claimed / returned.
app.locals.statusLabel = require("./utils/status").statusLabel;

// Set before anything that can fail, so the error pages can always render.
app.use((req, res, next) => {
  res.locals.unreadNotificationCount = 0;
  res.locals.currentPath = req.path;
  res.locals.isAdminArea = Boolean(
    res.locals.currentUser &&
    res.locals.currentUser.role === "staff" &&
    (req.path === "/admin" ||
      req.path.startsWith("/admin/") ||
      req.path === "/items" ||
      req.path.startsWith("/items/") ||
      req.path === "/settings" ||
      req.path === "/profile" ||
      req.path === "/notifications" ||
      req.path.startsWith("/notifications/") ||
      req.path === "/help" ||
      req.path === "/about" ||
      req.path === "/how-it-works"),
  );
  next();
});

// Remember when logged-in users were last active; powers "Online now".
app.use(trackActivity);

// Notification links are shown without an unread-count badge.

// =====================================================
// HOME PAGE
// =====================================================

app.get("/", async (req, res, next) => {
  try {
    const items = await itemModel.list({
      limit: 4,
    });

    res.render(req.session.user && req.session.user.role === "staff" ? "admin/pages/home" : "pages/home", {
      title: "Found IT!",
      items: items || [],
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// PUBLIC PAGES
// =====================================================

app.get("/how-it-works", (req, res) => {
  res.render(req.session.user && req.session.user.role === "staff" ? "admin/pages/how-it-works" : "pages/how-it-works", {
    title: "How it works",
  });
});

app.get("/about", (req, res) => {
  res.render(req.session.user && req.session.user.role === "staff" ? "admin/pages/about" : "pages/about", {
    title: "About",
  });
});

app.get("/help", (req, res) => {
  res.render(req.session.user && req.session.user.role === "staff" ? "admin/pages/help" : "pages/help", {
    title: "Help",
  });
});

// =====================================================
// AUTH ROUTES
// =====================================================

app.use("/", authRoutes);

// =====================================================
// SETTINGS
// =====================================================

app.use("/", settingsRoutes);

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/health", async (req, res) => {
  const body = {
    status: "ok",
    uptime: process.uptime(),
  };

  // /health?db=1 also checks the database connection (for monitoring).
  if (req.query.db) {
    try {
      await pool.query("SELECT 1");
      body.database = "ok";
    } catch (err) {
      body.status = "degraded";
      body.database = "unreachable";
      return res.status(503).json(body);
    }
  }

  res.json(body);
});

// =====================================================
// ITEMS / REPORTS
// =====================================================

app.use("/admin", adminRoutes);
app.use("/items", itemRoutes);
app.use("/notifications", notificationRoutes);

// =====================================================
// 404 PAGE
// =====================================================

app.use((req, res) => {
  const errorView = req.session.user && req.session.user.role === "staff"
    ? "admin/errors/404"
    : "errors/404";
  res.status(404).render(errorView, { title: "Not found" });
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status =
    Number.isInteger(err.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  if (status >= 500) {
    console.error("🔥", status, "at", req.method, req.originalUrl);
    console.error(err.stack || err);
  }

  if (status === 404) {
    const errorView = req.session.user && req.session.user.role === "staff"
      ? "admin/errors/404"
      : "errors/404";
    return res.status(404).render(errorView, { title: "Not found" });
  }

  if (status === 403) {
    const errorView = req.session.user && req.session.user.role === "staff"
      ? "admin/errors/403"
      : "errors/403";
    return res.status(403).render(errorView, { title: "Forbidden" });
  }

  const errorView = req.session.user && req.session.user.role === "staff"
    ? "admin/errors/500"
    : "errors/500";
  res.status(status).render(errorView, { title: "Something went wrong" });
});

// =====================================================
// START SERVER
// =====================================================

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  const server = app.listen(PORT, () => {
  purgeOldTrash();
  setInterval(purgeOldTrash, 24 * 60 * 60 * 1000).unref();
    console.log(`Found IT! running at http://localhost:${PORT}`);
  });

  // Finish in-flight requests and close the database pool on Ctrl+C / deploys.
  const shutdown = () => {
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// =====================================================
// EXPORT APP
// =====================================================

module.exports = app;
