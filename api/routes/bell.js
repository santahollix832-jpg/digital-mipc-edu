const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ==========================================
// 🔔 GET /api/bell/schedules — bell timetable
// ==========================================
router.get('/schedules', async (req, res, next) => {
  try {
    const schedules = await pool.query('SELECT * FROM bell_schedules ORDER BY time ASC;');
    const logs = await pool.query(
      `SELECT bl.*, u.full_name AS triggered_by_name
       FROM bell_logs bl
       LEFT JOIN users u ON u.id = bl.user_id
       ORDER BY bl.triggered_at DESC
       LIMIT 20;`
    );
    res.json({ success: true, schedules: schedules.rows, logs: logs.rows });
  } catch (err) {
    console.error('BELL_SCHEDULES_FETCH_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🔔 POST /api/bell/schedules — create a bell event (ADMIN only, enforced by server.js)
// ==========================================
router.post('/schedules', async (req, res, next) => {
  try {
    const { time, title, days, tone, is_active } = req.body;

    if (!time || !title) {
      return res.status(400).json({ success: false, error: 'time and title are required.' });
    }

    const result = await pool.query(
      `INSERT INTO bell_schedules (time, title, days, tone, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`,
      [time, title.trim(), days || 'Mon-Fri', tone || 'Standard Bell', is_active !== false]
    );
    res.status(201).json({ success: true, schedule: result.rows[0] });
  } catch (err) {
    if (err.code === '22007' || err.code === '22008') {
      return res.status(400).json({ success: false, error: 'Invalid time format. Use HH:MM (24h).' });
    }
    console.error('BELL_SCHEDULE_CREATE_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🔔 PUT /api/bell/schedules/:id — update a bell event (ADMIN only, enforced by server.js)
// ==========================================
router.put('/schedules/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM bell_schedules WHERE id = $1;', [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Bell schedule not found.' });
    }
    const row = existing.rows[0];

    const result = await pool.query(
      `UPDATE bell_schedules
       SET time = COALESCE($1, time),
           title = COALESCE(NULLIF($2, ''), title),
           days = COALESCE(NULLIF($3, ''), days),
           tone = COALESCE(NULLIF($4, ''), tone),
           is_active = COALESCE($5, is_active)
       WHERE id = $6
       RETURNING *;`,
      [
        req.body.time || null,
        req.body.title || '',
        req.body.days || null,
        req.body.tone || null,
        req.body.is_active === undefined ? null : !!req.body.is_active,
        id,
      ]
    );
    res.json({ success: true, schedule: result.rows[0] });
  } catch (err) {
    console.error('BELL_SCHEDULE_UPDATE_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🔔 DELETE /api/bell/schedules/:id — remove a bell event (ADMIN only, enforced by server.js)
// ==========================================
router.delete('/schedules/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM bell_schedules WHERE id = $1 RETURNING id;', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Bell schedule not found.' });
    }
    res.json({ success: true, message: 'Bell schedule deleted.' });
  } catch (err) {
    console.error('BELL_SCHEDULE_DELETE_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🖥️ GET /api/bell/device — hardware health
// ==========================================
router.get('/device', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM bell_device WHERE id = 1;');
    const device = result.rows[0] || null;
    if (device) {
      // Consider the device offline if it hasn't pinged in the last 2 minutes.
      const stale = !device.last_ping || (Date.now() - new Date(device.last_ping).getTime()) > 120000;
      device.is_online = !stale && device.is_online;
      device.last_ping = device.last_ping || null;
    }
    res.json({ success: true, device });
  } catch (err) {
    console.error('BELL_DEVICE_FETCH_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🖥️ POST /api/bell/device/heartbeat — IoT firmware ping
// ==========================================
router.post('/device/heartbeat', async (req, res, next) => {
  try {
    const { device_id, ip_address, uptime_seconds, firmware_version } = req.body || {};
    const result = await pool.query(
      `UPDATE bell_device
       SET device_id = COALESCE(NULLIF($1, ''), device_id),
           ip_address = COALESCE(NULLIF($2, ''), ip_address),
           uptime_seconds = COALESCE($3, uptime_seconds),
           firmware_version = COALESCE(NULLIF($4, ''), firmware_version),
           is_online = TRUE,
           last_ping = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING *;`,
      [device_id || null, ip_address || null, uptime_seconds ? parseInt(uptime_seconds) || 0 : null, firmware_version || null]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Bell device record not found.' });
    }
    res.json({ success: true, device: result.rows[0] });
  } catch (err) {
    console.error('BELL_DEVICE_HEARTBEAT_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🔔 POST /api/bell/trigger — manual override / emergency ring
// Any authenticated staff role may trigger; schedule configuration stays ADMIN-only.
// ==========================================
router.post('/trigger', async (req, res, next) => {
  try {
    // req.user is populated by the authenticateRequest middleware
    const userId = req.user?.id || null;
    const { note, schedule_id, preset, duration_seconds } = req.body || {};

    // 🔌 Hardware bridge: in a real deployment this would dispatch MQTT/HTTP
    // to the ESP32 relay module. Simulated here with a success result.
    let hardwareAck = false;
    try {
      const deviceRes = await pool.query('SELECT is_online FROM bell_device WHERE id = 1;');
      hardwareAck = !!(deviceRes.rows[0] && deviceRes.rows[0].is_online);
    } catch (deviceErr) {
      console.warn('BELL_DEVICE_STATUS_UNAVAILABLE:', deviceErr.message);
    }

    const triggerNote = preset ? `${preset} — ${note || 'Manual override triggered'}` : (note || 'Manual override triggered');

    const result = await pool.query(
      `INSERT INTO bell_logs (trigger_type, status, user_id, schedule_id, note)
       VALUES ('Manual', 'Success', $1, $2, $3)
       RETURNING *;`,
      [userId, schedule_id ? parseInt(schedule_id) : null, triggerNote]
    );
    res.status(201).json({
      success: true,
      message: `Bell triggered (${preset || 'manual'})${duration_seconds ? ` for ${duration_seconds}s` : ''}.`,
      hardware_acknowledged: hardwareAck,
      log: result.rows[0],
    });
  } catch (err) {
    console.error('BELL_TRIGGER_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🔔 GET /api/bell/logs — recent bell activity
// ==========================================
router.get('/logs', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const logs = await pool.query(
      `SELECT bl.*, u.full_name AS triggered_by_name
       FROM bell_logs bl
       LEFT JOIN users u ON u.id = bl.user_id
       ORDER BY bl.triggered_at DESC
       LIMIT $1;`,
      [limit]
    );
    res.json({ success: true, logs: logs.rows });
  } catch (err) {
    console.error('BELL_LOGS_FETCH_ERROR:', err);
    next(err);
  }
});

module.exports = router;
