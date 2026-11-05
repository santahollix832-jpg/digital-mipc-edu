const express = require('express');
const pool = require('../config/database');
const { authenticateRequest, requireRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateRequest);

const DEFAULT_SETTINGS = {
  school_name: 'Musanze Hub Polytechnic College',
  school_short_name: 'MIPC',
  school_address: 'Muhoza, Musanze District, Northern Province, Rwanda',
  school_phone: '+250 788 000 000',
  school_email: 'info@mipc.ac.rw',
  school_motto: 'Knowledge, Skill, Integrity',
  academic_year: String(new Date().getFullYear()),
  current_term: 'Term 1',
  session_timeout_minutes: 60,
  maintenance_mode: false,
  auto_backup: true,
  max_upload_mb: 10,
  timezone: 'Africa/Kigali',
  conduit_pickup_window: 40,
  conduit_handover_grace: 12,
  conduit_alert_threshold: 75,
  conduit_auto_escalate: true,
  bell_enabled: true,
  bell_morning: '07:30',
  bell_lunch: '12:30',
  bell_dismissal: '16:00',
  bell_volume: 70,
  system_language: 'en',
};

// Which roles may persist which settings keys (ADMIN can always save everything).
const KEY_ROLE_ACCESS = {
  school_name: ['ADMIN', 'PATRON'],
  school_short_name: ['ADMIN', 'PATRON'],
  school_address: ['ADMIN', 'PATRON'],
  school_phone: ['ADMIN', 'PATRON'],
  school_email: ['ADMIN', 'PATRON'],
  school_motto: ['ADMIN', 'PATRON'],
  academic_year: ['ADMIN'],
  current_term: ['ADMIN'],
  session_timeout_minutes: ['ADMIN'],
  maintenance_mode: ['ADMIN'],
  auto_backup: ['ADMIN'],
  max_upload_mb: ['ADMIN'],
  timezone: ['ADMIN'],
  conduit_pickup_window: ['ADMIN', 'DOD', 'PATRON', 'MATRON'],
  conduit_handover_grace: ['ADMIN', 'DOD', 'PATRON', 'MATRON'],
  conduit_alert_threshold: ['ADMIN', 'DOD', 'PATRON', 'MATRON'],
  conduit_auto_escalate: ['ADMIN', 'DOD', 'PATRON', 'MATRON'],
  bell_enabled: ['ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'DOD'],
  bell_morning: ['ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'DOD'],
  bell_lunch: ['ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'DOD'],
  bell_dismissal: ['ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'DOD'],
  bell_volume: ['ADMIN', 'TEACHER', 'PATRON', 'MATRON', 'DOD'],
  system_language: ['ADMIN', 'PATRON', 'MATRON', 'DOD', 'TEACHER', 'BURSAR', 'SECURITY'],
};

const NUMBER_KEYS = new Set([
  'session_timeout_minutes', 'max_upload_mb',
  'conduit_pickup_window', 'conduit_handover_grace', 'conduit_alert_threshold',
  'bell_volume',
]);
const BOOLEAN_KEYS = new Set([
  'maintenance_mode', 'auto_backup', 'conduit_auto_escalate', 'bell_enabled',
]);

function mergeSettings(rows) {
  const stored = {};
  for (const row of rows) {
    stored[row.setting_key] = row.setting_value;
  }
  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(merged)) {
    const defaultValue = merged[key];
    if (stored[key] === undefined || stored[key] === null) continue;
    if (BOOLEAN_KEYS.has(key)) {
      merged[key] = stored[key] === 'true';
    } else if (NUMBER_KEYS.has(key)) {
      merged[key] = Number.isFinite(Number(stored[key])) ? Number(stored[key]) : defaultValue;
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
 * PUT /api/settings — persist a partial settings patch.
 * Role-gated per key group (see KEY_ROLE_ACCESS); ADMIN can save everything.
 * Body: any subset of the known setting keys.
 */
router.put('/', async (req, res) => {
  const patch = req.body || {};
  const role = req.user?.role;
  const entries = Object.entries(patch).filter(([key]) =>
    Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key));

  if (entries.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid settings provided.' });
  }

  const denied = entries.filter(([key]) => {
    if (role === 'ADMIN') return false;
    const allowed = KEY_ROLE_ACCESS[key];
    return !allowed || !allowed.includes(role);
  });
  if (denied.length) {
    return res.status(403).json({
      success: false,
      error: `Your role (${role}) cannot change: ${denied.map(([k]) => k).join(', ')}.`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of entries) {
      let serialized;
      if (BOOLEAN_KEYS.has(key)) serialized = String(Boolean(value));
      else if (NUMBER_KEYS.has(key)) serialized = String(Number(value) || 0);
      else serialized = String(value ?? '');
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
