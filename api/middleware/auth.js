const crypto = require('crypto');
const pool = require('../config/database');

const SESSION_COOKIE = 'school_session';

function getSessionToken(req) {
  const cookies = req.headers.cookie ? req.headers.cookie.split(';') : [];
  const sessionCookie = cookies.find(cookie => cookie.trim().startsWith(`${SESSION_COOKIE}=`));
  return sessionCookie ? sessionCookie.trim().slice(SESSION_COOKIE.length + 1) : null;
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api',
  };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    ...sessionCookieOptions(),
    maxAge: 8 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
}

function authenticateRequest(req, res, next) {
  const token = getSessionToken(req);
  if (!token || token.length > 128) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  pool.query(
    `SELECT u.id, u.username, u.full_name, u.role
     FROM user_sessions us
     JOIN users u ON u.id = us.user_id
     WHERE us.token_hash = $1
       AND us.expires_at > CURRENT_TIMESTAMP
       AND us.revoked_at IS NULL
       AND u.is_active = TRUE`,
    [hashSessionToken(token)]
  ).then(result => {
    if (!result.rowCount) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    req.user = result.rows[0];
    return next();
  }).catch(err => {
    console.error('[AUTH_SESSION_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Authentication service unavailable' });
  });
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to access this resource' });
    }
    return next();
  };
}

module.exports = {
  authenticateRequest,
  clearSessionCookie,
  hashSessionToken,
  requireRoles,
  setSessionCookie,
};
