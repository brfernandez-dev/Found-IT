// routes/auth.js - register, login, logout
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const userModel = require('../models/userModel');
const { safeNext } = require('../utils/safeRedirect');
const { DOMAIN_ERROR, isAllowedEmail } = require('../utils/emailDomain');
 
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);
 
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { title: 'Log in', next: safeNext(req.query.next, '') });
});
 
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const nextUrl = safeNext(req.body.next, '');
    const errors = [];
 
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      errors.push('A valid email is required.');
    }
    // Only require *something* here: accounts made under older, shorter
    // password rules must still be able to log in.
    if (typeof password !== 'string' || password.length === 0) {
      errors.push('Password is required.');
    }
 
    if (errors.length) {
      req.flash('error', errors.join(' '));
      return res.status(400).render('auth/login', { title: 'Log in', next: nextUrl });
    }
 
    const normalised = email.trim().toLowerCase();
    const user = await userModel.findByEmail(normalised);
 
    // Only @my.cspc.edu.ph may log in. Existing staff accounts are exempt so
    // admins with other addresses are not locked out.
    if (!isAllowedEmail(normalised) && !(user && user.role === 'staff')) {
      req.flash('error', DOMAIN_ERROR);
      return res.status(400).render('auth/login', { title: 'Log in', next: nextUrl });
    }
 
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
 
    if (!user || !ok) {
      req.flash('error', 'Incorrect email or password.');
      return res.status(401).render('auth/login', { title: 'Log in', next: nextUrl });
    }
 
    const sessionUser = {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      profileImage: user.profile_image,
      role: user.role,
    };
 
    // New session id on login prevents session fixation.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = sessionUser;
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        return res.redirect(303, nextUrl || (sessionUser.role === 'staff' ? '/admin' : '/items'));
      });
    });
  } catch (err) {
    next(err);
  }
});
 
router.get('/signup', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/signup', { title: 'Sign up' });
});
 
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, confirm, displayName } = req.body;
    const errors = [];
 
    const name = typeof displayName === 'string' ? displayName.trim() : '';
    if (name.length < 2) errors.push('Name is too short.');
    if (name.length > 100) errors.push('Name is too long.');
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 255) {
      errors.push('A valid email is required.');
    }
    if (typeof email === 'string' && EMAIL_RE.test(email.trim()) && !isAllowedEmail(email)) {
      errors.push(DOMAIN_ERROR);
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      errors.push(`Password must be at least ${MIN_PASSWORD} characters.`);
    }
    // bcrypt only uses the first 72 bytes; refuse longer ones instead of silently truncating.
    if (typeof password === 'string' && Buffer.byteLength(password) > 72) {
      errors.push('Password is too long (72 characters maximum).');
    }
    if (password !== confirm) errors.push('Passwords do not match.');
 
    if (errors.length) {
      req.flash('error', errors.join(' '));
      return res.status(400).render('auth/signup', { title: 'Sign up' });
    }
 
    const normalised = email.trim().toLowerCase();
    if (await userModel.findByEmail(normalised)) {
      req.flash('error', 'That email is already registered.');
      return res.status(409).render('auth/signup', { title: 'Sign up' });
    }
 
    const hash = await bcrypt.hash(password, 12);
    try {
      await userModel.create({ email: normalised, passwordHash: hash, displayName: name });
    } catch (err) {
      // Two sign-ups with the same email at the same instant: the UNIQUE index wins.
      if (err && err.code === 'ER_DUP_ENTRY') {
        req.flash('error', 'That email is already registered.');
        return res.status(409).render('auth/signup', { title: 'Sign up' });
      }
      throw err;
    }
 
    req.flash('success', 'Your account has been created. Please log in.');
    return res.redirect(303, '/login');
  } catch (err) {
    next(err);
  }
});
 
router.post('/logout', (req, res, next) => {
  const userId = req.session.user && req.session.user.id;
  if (userId) {
    // Best effort: drop off the "Online now" list right away.
    userModel.clearLastSeen(userId).catch(() => {});
  }
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    return res.redirect(303, '/');
  });
});
 
module.exports = router;
 