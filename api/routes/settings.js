const express = require('express');
const pool = require('../config/database');
const { authenticateRequest, requireRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateRequest);

const DEFAULT_SETTINGS = {
  school_name: 'Digital MIPC School',
  academic_year: String(new Date().getFullYear()),
  current_term: 'Term 1',
  term_start_date: '',
  term_end_date: '',
  contact_email: '',
  contact_phone: '',
  physical_address: '',
  session_timeout_minutes: 60,
  enforce_two_factor: false,
  notify_attendance_email: true,
  notify_attendance_sms: false,
  notify_discipline_email: true,
  notify_discipline_sms: false,
  theme: 'light',
  auto_backup: true,
};

function mergeSettings(rows) {
  const stored = {};
  for (const row of rows) {
    stored[row.setting_key] = row.setting_value;
  }
  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(merged)) {
    if (stored[key] === undefined || stored[key] === null) continue;
    const defaultValue = merged[key];
    if (typeof defaultValue === 'boolean') {
      merged[key] = stored[key] === 'true';
    } else if (key === 'session_timeout_minutes') {
      merged[key] = Number(stored[key]) || defaultValue;
    } else {
      merged[key] = stored[key];
    }
  }
  return merged;
}

/**
 * GET /api/settings — merged settings (any authenticated staff member can read).
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    return res.json({ success: true, settings: mergeSettings(result.rows) });
  } catch (err) {
    console.error('[SETTINGS_FETCH_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Unable to load system settings.' });
  }
});

/**
 * PUT /api/settings — persist a partial settings patch (ADMIN only).
 * Body: any subset of the setting keys.
 */
router.put('/', requireRoles('ADMIN'), async (req, res) => {
  const patch = req.body || {};
  const entries = Object.entries(patch).filter(([key]) => Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key));

  if (entries.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid settings provided.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of entries) {
      const serialized = typeof value === 'boolean' ? String(value) : String(value ?? '');
      await client.query(
        `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
        [key, serialized, req.user.id]
      );
    }
    await client.query('COMMIT');

    const result = await client.query('SELECT setting_key, setting_value FROM system_settings');
    return res.json({ success: true, settings: mergeSettings(result.rows) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[SETTINGS_UPDATE_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Unable to save system settings.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/settings/logs — recent audit/system log entries (ADMIN only).
 */
router.get('/logs', requireRoles('ADMIN'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, action, entity, detail, actor_username, created_at
       FROM system_logs
       ORDER BY created_at DESC
       LIMIT 100`
    );
    return res.json({ success: true, logs: result.rows });
  } catch (err) {
    console.error('[SETTINGS_LOGS_ERROR]', err);
    return res.status(500).json({ success: false, error: 'Unable to load system logs.' });
  }
});

module.exports = router;
