const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticateRequest, requireRoles } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['ADMIN', 'PATRON', 'BURSAR', 'TEACHER'];

router.use(authenticateRequest, requireRoles('ADMIN'));

/**
 * GET /api/users
 * List every system user (no password hashes).
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, role, is_active, created_at
       FROM users
       ORDER BY created_at DESC, id DESC`
    );
    return res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error('[USERS_LIST_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Unable to load user accounts.' });
  }
});

/**
 * POST /api/users
 * Create a new staff/system account.
 * Body: { username, full_name, password, role }
 */
router.post('/', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = typeof req.body?.role === 'string' ? req.body.role.toUpperCase() : '';

  if (
    !username ||
    username.length > 254 ||
    !/^[a-z0-9._@+-]+$/.test(username) ||
    !fullName ||
    fullName.length > 150 ||
    !ALLOWED_ROLES.includes(role) ||
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
       RETURNING id, username, full_name, role, is_active, created_at`,
      [username, passwordHash, fullName, role]
    );

    if (!result.rowCount) {
      return res.status(409).json({ success: false, error: 'An account with that username already exists.' });
    }
    return res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('[USERS_CREATE_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Account creation service unavailable.' });
  }
});

/**
 * PUT /api/users/:id
 * Update full name, role, and/or password for an account.
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  const role = typeof req.body?.role === 'string' ? req.body.role.toUpperCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role selection.' });
  }

  if (password && (Buffer.byteLength(password, 'utf8') < 12 || Buffer.byteLength(password, 'utf8') > 72)) {
    return res.status(400).json({ success: false, error: 'Password must be between 12 and 72 UTF-8 bytes.' });
  }

  try {
    const updates = ['full_name = $1', 'role = $2'];
    const values = [fullName, role];
    let placeholder = 3;

    if (password) {
      updates.push(`password_hash = $${placeholder}`);
      values.push(await bcrypt.hash(password, 12));
      placeholder += 1;
    }
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${placeholder}
       RETURNING id, username, full_name, role, is_active, created_at`,
      values
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }
    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('[USERS_UPDATE_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Unable to update the user account.' });
  }
});

/**
 * PATCH /api/users/:id/status
 * Activate or deactivate an account. Admins cannot deactivate themselves.
 * Body: { is_active: boolean }
 */
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const isActive = Boolean(req.body?.is_active);

  if (Number(id) === Number(req.user.id) && !isActive) {
    return res.status(400).json({ success: false, error: 'You cannot deactivate your own account.' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET is_active = $1 WHERE id = $2
       RETURNING id, username, full_name, role, is_active, created_at`,
      [isActive, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    // Deactivating a user immediately revokes all of their sessions.
    if (!isActive) {
      await pool.query('UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    }

    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('[USERS_STATUS_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Unable to change the account status.' });
  }
});

module.exports = router;
