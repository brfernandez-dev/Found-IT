// middleware/auth.js - session-based auth guards
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please log in to continue.');
  // Only GET pages can be revisited after login; sending someone back to a
  // POST-only URL would just show them a 404.
  if (req.method === 'GET') {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  return res.redirect('/login');
}

function requireStaff(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'staff') {
    return next();
  }
  return res.status(403).render('errors/403', { title: 'Forbidden' });
}

// Expose current user + flash to every view
function exposeUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = {
    error: req.flash('error'),
    success: req.flash('success')
  };
  next();
}

module.exports = { requireLogin, requireStaff, exposeUser };