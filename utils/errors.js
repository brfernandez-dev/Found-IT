// utils/errors.js - errors that are safe to show to the person using the app.
// Anything that is NOT a UserError is treated as a bug: it is logged and the
// generic 500 page is shown, so database or stack details never leak.
class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UserError';
    this.status = status;
  }
}

module.exports = { UserError };
