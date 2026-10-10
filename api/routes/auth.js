const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const {
  authenticateRequest,
  clearSessionCookie,
  hashSessionToken,
  requireRoles,
  setSessionCookie,
} = require('../middleware/auth');

const router = express.Router();
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = '$2b$12$DdQF1uDYOE0D/I/V5ZGOa..SKa0Mci.xcV2iSWfZBLNkUPoIfdRLS';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return next();
});

function isRateLimited(ip) {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (!attempt || now - attempt.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { startedAt: now, count: 1 });
    if (loginAttempts.size > 10000) {
      for (const [key, value] of loginAttempts) {
        if (now - value.startedAt >= LOGIN_WINDOW_MS) loginAttempts.delete(key);
      }
    }
    return false;
  }

  attempt.count += 1;
  return attempt.count > LOGIN_MAX_ATTEMPTS;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
  };
}

router.post('/login', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (isRateLimited(req.ip)) {
    return res.status(429).json({ success: false, error: 'Too many login attempts. Try again later.' });
  }

  if (!username || username.length > 254 || !password || Buffer.byteLength(password, 'utf8') > 72) {
    await bcrypt.compare(password.slice(0, 72), DUMMY_PASSWORD_HASH);
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }

  try {
    const result = await pool.query(
      `SELECT id, username, password_hash, full_name, role
       FROM users
       WHERE username = $1 AND is_active = TRUE`,
      [username]
    );
    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user?.password_hash || DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatches) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    loginAttempts.delete(req.ip);
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    await pool.query('DELETE FROM user_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
    await pool.query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashSessionToken(token), expiresAt]
    );

    setSessionCookie(res, token);
    return res.json({
      success: true,
      user: publicUser(user),
      session: { expires_at: expiresAt.toISOString() },
    });
  } catch (err) {
    console.error('[AUTH_LOGIN_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Authentication service unavailable' });
  }
});

router.post('/register', authenticateRequest, requireRoles('ADMIN'), async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = typeof req.body?.role === 'string' ? req.body.role.toUpperCase() : '';
  const allowedRoles = ['ADMIN', 'PATRON', 'BURSAR', 'TEACHER'];

  if (
    !username ||
    username.length > 254 ||
    !/^[a-z0-9._@+-]+$/.test(username) ||
    !fullName ||
    fullName.length > 150 ||
    !allowedRoles.includes(role) ||
    Buffer.byteLength(password, 'utf8') < 12 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    return res.status(400).json({
      success: false,
      error: 'Provide a valid username, full name, role, and a password between 12 and 72 UTF-8 bytes.',
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING
       RETURNING id, username, full_name, role, created_at`,
      [username, passwordHash, fullName, role]
    );

    if (!result.rowCount) {
      return res.status(409).json({ success: false, error: 'An account with that username already exists.' });
    }
    return res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('[AUTH_REGISTER_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Account creation service unavailable' });
  }
});

router.get('/me', authenticateRequest, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.cookie?.split(';')
      .map(cookie => cookie.trim())
      .find(cookie => cookie.startsWith('school_session='))
      ?.slice('school_session='.length);

    if (token && token.length <= 128) {
      await pool.query(
        `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [hashSessionToken(token)]
      );
    }

    clearSessionCookie(res);
    return res.json({ success: true });
  } catch (err) {
    console.error('[AUTH_LOGOUT_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Authentication service unavailable' });
  }
});

module.exports = router;
