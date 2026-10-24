// routes/settings.js - the logged-in user's own profile page.
// Dark mode itself is a client-side/localStorage toggle (see
// public/js/theme.js) - this page just gives it a home next to the
// account's profile info, same as the one in the nav.
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const path = require('path');
const { requireLogin } = require('../middleware/auth');
const userModel = require('../models/userModel');
const itemModel = require('../models/itemModel');
const { imageUpload, removeFile, deleteStoredImage } = require('../middleware/upload');

const profileUploadDir = path.join(__dirname, '..', 'public', 'uploads', 'profiles');

const profileUpload = imageUpload({
  field: 'profilePicture',
  dir: profileUploadDir,
  prefix: (req) => `profile-${req.session.user.id}`
});

// Handle the upload and show a friendly message if the file is rejected.
function handleProfileUpload(req, res, next) {
  profileUpload(req, res, (err) => {
    if (err) return next(err);
    if (req.uploadError) {
      req.flash('error', req.uploadError);
      return res.redirect(303, '/profile#profile-settings');
    }
    return next();
  });
}

router.get('/profile', requireLogin, async (req, res, next) => {
  try {
    const profile = await userModel.findById(req.session.user.id);
    if (!profile) {
      req.session.destroy(() => res.redirect('/login'));
      return;
    }

    const [activity, reports] = await Promise.all([
      itemModel.reporterCounts(profile.id),
      itemModel.listByReporter(profile.id)
    ]);

    res.render(req.session.user.role === "staff" ? "admin/pages/profile" : "pages/profile", {
      title: 'My profile',
      profile,
      activity,
      reports
    });
  } catch (err) {
    next(err);
  }
});

router.get('/settings', requireLogin, async (req, res, next) => {
  if (req.session.user.role !== 'staff') return res.redirect(303, '/profile#profile-settings');

  try {
    const profile = await userModel.findById(req.session.user.id);
    if (!profile) {
      req.session.destroy(() => res.redirect('/login'));
      return;
    }
    res.render(req.session.user.role === "staff" ? "admin/pages/settings" : "pages/settings", { title: 'Settings', profile });
  } catch (err) {
    next(err);
  }
});

router.post('/profile', requireLogin, async (req, res, next) => {
  try {
    const displayName = (req.body.displayName || '').trim();

    if (displayName.length < 2 || displayName.length > 100) {
      req.flash('error', 'Name must be between 2 and 100 characters.');
      return res.redirect(303, '/profile#profile-settings');
    }

    await userModel.updateDisplayName(req.session.user.id, displayName);
    req.session.user.displayName = displayName;
    req.flash('success', 'Profile details updated.');
    return res.redirect(303, '/profile#profile-settings');
  } catch (err) {
    return next(err);
  }
});

router.post('/profile/password', requireLogin, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = await userModel.findByEmail(req.session.user.email);

    if (!user || !(await bcrypt.compare(currentPassword || '', user.password_hash))) {
      req.flash('error', 'Your current password is incorrect.');
      return res.redirect(303, '/profile#profile-settings');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      req.flash('error', 'Your new password must be at least 8 characters.');
      return res.redirect(303, '/profile#profile-settings');
    }
    if (Buffer.byteLength(newPassword) > 72) {
      req.flash('error', 'Your new password is too long (72 characters maximum).');
      return res.redirect(303, '/profile#profile-settings');
    }
    if (newPassword !== confirmPassword) {
      req.flash('error', 'Your new passwords do not match.');
      return res.redirect(303, '/profile#profile-settings');
    }

    await userModel.updatePasswordHash(
      req.session.user.id,
      await bcrypt.hash(newPassword, 12)
    );
    req.flash('success', 'Password changed successfully.');
    return res.redirect(303, '/profile#profile-settings');
  } catch (err) {
    return next(err);
  }
});

router.post('/profile/photo', requireLogin, handleProfileUpload, async (req, res, next) => {
  if (!req.file) {
    req.flash('error', 'Choose a profile picture to upload.');
    return res.redirect(303, '/profile#profile-settings');
  }

  try {
    const profile = await userModel.findById(req.session.user.id);
    const profileImage = `/uploads/profiles/${req.file.filename}`;
    await userModel.updateProfileImage(req.session.user.id, profileImage);
    req.session.user.profileImage = profileImage;
    await removeProfileImage(profile && profile.profile_image);
    req.flash('success', 'Profile picture updated.');
    return res.redirect(303, '/profile#profile-settings');
  } catch (err) {
    removeFile(req.file.path);
    return next(err);
  }
});

router.post('/profile/photo/remove', requireLogin, async (req, res, next) => {
  try {
    const profile = await userModel.findById(req.session.user.id);
    await userModel.updateProfileImage(req.session.user.id, null);
    req.session.user.profileImage = null;
    await removeProfileImage(profile && profile.profile_image);
    req.flash('success', 'Profile picture removed.');
    return res.redirect(303, '/profile#profile-settings');
  } catch (err) {
    return next(err);
  }
});

function removeProfileImage(imagePath) {
  return deleteStoredImage(imagePath, '/uploads/profiles/', profileUploadDir);
}

router.post('/settings/profile', requireLogin, async (req, res, next) => {
  if (req.session.user.role !== 'staff') return res.redirect(303, '/profile#profile-settings');

  try {
    const displayName = (req.body.displayName || '').trim();

    if (displayName.length < 2 || displayName.length > 100) {
      req.flash('error', 'Name must be between 2 and 100 characters.');
      return res.redirect(303, '/settings');
    }

    await userModel.updateDisplayName(req.session.user.id, displayName);

    // Keep the session copy in sync so the nav/greeting update too,
    // without needing the user to log in again.
    req.session.user.displayName = displayName;

    req.flash('success', 'Profile updated.');
    res.redirect(303, '/settings');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
