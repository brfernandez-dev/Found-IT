// utils/emailDomain.js - only CSPC student emails may sign up / log in
const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'my.cspc.edu.ph').toLowerCase();
 
const DOMAIN_ERROR = `Only @${ALLOWED_DOMAIN} email addresses are allowed.`;
 
function isAllowedEmail(email) {
  if (typeof email !== 'string') return false;
  return email.trim().toLowerCase().endsWith('@' + ALLOWED_DOMAIN);
}
 
module.exports = { ALLOWED_DOMAIN, DOMAIN_ERROR, isAllowedEmail };
 