const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
  sendSMS,
  sendBulkSMS,
  fetchParentRecipients,
  formatRwandanPhone,
  VALID_TYPES,
} = require('../services/smsService');

// ==========================================
// 📱 SMS & NOTIFICATIONS CENTER — Africa's Talking backed
// Tables: sms_logs, announcements (see database/08_sms_setup.sql)
// ==========================================

const STAFF_ROLES = ['ADMIN', 'DOD', 'PATRON', 'MATRON', 'TEACHER', 'BURSAR', 'SECURITY'];

const STAFF_ROLE_FOLDERS = {
  CHECK_IN: 'check_in',
  CHECK_OUT: 'check_out',
  GATE_PASS: 'gate_pass',
  VISITE_DAY: 'visite_day',
  ANNOUNCEMENT: 'announcement',
};

function actorName(req) {
  return req.user?.full_name || req.user?.username || 'system';
}

// ==========================================
// GET /api/sms/logs?notification_type=&status=&search=
// ==========================================
router.get('/logs', async (req, res, next) => {
  try {
    const { notification_type: type, status, search } = req.query;
    const params = [];
    const clauses = [];
    if (type && VALID_TYPES.includes(type)) {
      params.push(type);
      clauses.push(`notification_type = $${params.length}`);
    }
    if (status && ['SENT', 'FAILED', 'LOGGED_ONLY'].includes(status)) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(recipient_name ILIKE $${params.length} OR message_body ILIKE $${params.length} OR recipient_phone ILIKE $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT sl.*, s.name AS student_name, s.reg_number
       FROM sms_logs sl
       LEFT JOIN students s ON s.id = sl.student_id
       ${where}
       ORDER BY sl.created_at DESC
       LIMIT 200;`,
      params
    );
    const stats = await pool.query(`
      SELECT
        COUNT(*)::INT AS total,
        COUNT(*) FILTER (WHERE status = 'SENT')::INT AS sent,
        COUNT(*) FILTER (WHERE status = 'FAILED')::INT AS failed,
        COUNT(*) FILTER (WHERE status = 'LOGGED_ONLY')::INT AS logged_only,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::INT AS today
      FROM sms_logs;
    `);
    res.json({ success: true, data: result.rows, stats: stats.rows[0] });
  } catch (err) {
    console.error('SMS_LOGS_ERROR:', err);
    next(err);
  }
});

// ==========================================
// POST /api/sms/send — direct SMS to one number
// body: { to, message, student_id?, notification_type?, recipient_name?, recipient_role? }
// ==========================================
router.post('/send', async (req, res, next) => {
  try {
    const { to, message, student_id, notification_type, recipient_name, recipient_role } = req.body || {};
    if (!to || !message) {
      return res.status(400).json({ success: false, error: 'to and message are required.' });
    }
    const result = await sendSMS({
      to,
      message,
      studentId: student_id ? Number(student_id) : null,
      type: VALID_TYPES.includes(notification_type) ? notification_type : 'ANNOUNCEMENT',
      recipientName: recipient_name || '',
      recipientRole: recipient_role === 'staff' ? 'staff' : 'parent',
      sentBy: actorName(req),
    });
    const statusCode = result.status === 'FAILED' ? 502 : 201;
    return res.status(statusCode).json({
      success: result.status !== 'FAILED',
      status: result.status,
      sms_log_id: result.logId,
      provider_response: result.providerResponse,
    });
  } catch (err) {
    console.error('SMS_SEND_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🚸 TRIGGER: Gate Pass / Visite Day release notification
// body: { student_id, destination, expected_return, permission_id? }
// Fetches guardian phone from students and fires sendSMS().
// ==========================================
router.post('/trigger/gate-pass', async (req, res, next) => {
  try {
    const { student_id, destination, expected_return, permission_id } = req.body || {};
    const studentRes = await pool.query('SELECT * FROM students WHERE id = $1;', [Number(student_id)]);
    if (!studentRes.rowCount) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }
    const student = studentRes.rows[0];
    const message =
      `MIPC EDU: ${student.name} (${student.reg_number}) has been granted a gate pass` +
      (destination ? ` to ${destination}.` : '.') +
      (expected_return ? ` Expected return: ${new Date(expected_return).toLocaleString('en-GB')}.` : '') +
      ` — ${actorName(req)}`;

    const result = await sendSMS({
      to: student.guardian_phone || '',
      message,
      studentId: student.id,
      type: 'GATE_PASS',
      recipientName: student.guardian_name || student.guardian_email || 'Parent/Guardian',
      recipientRole: 'parent',
      sentBy: actorName(req),
    });

    if (permission_id) {
      await pool.query('UPDATE permissions SET sms_log_id = $2 WHERE id = $1;', [permission_id, result.logId]);
    }
    res.status(201).json({ success: result.status !== 'FAILED', status: result.status, sms_log_id: result.logId, message });
  } catch (err) {
    console.error('SMS_GATE_PASS_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🚪 TRIGGER: Check-In / Check-Out notification (NFC/QR scan or attendance update)
// body: { student_id, direction: 'in'|'out', method?: 'nfc'|'qr'|'manual' }
// ==========================================
router.post('/trigger/check', async (req, res, next) => {
  try {
    const { student_id, direction, method } = req.body || {};
    if (!['in', 'out'].includes(direction)) {
      return res.status(400).json({ success: false, error: "direction must be 'in' or 'out'." });
    }
    const studentRes = await pool.query('SELECT * FROM students WHERE id = $1;', [Number(student_id)]);
    if (!studentRes.rowCount) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }
    const student = studentRes.rows[0];
    const scanNote = method && method !== 'manual' ? ` via ${method.toUpperCase()} scan` : '';
    const message =
      `MIPC EDU: ${student.name} (${student.reg_number}) checked ` +
      `${direction === 'in' ? 'IN to' : 'OUT of'} campus at ` +
      `${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${scanNote}` +
      ` — ${actorName(req)}`;

    const result = await sendSMS({
      to: student.guardian_phone || '',
      message,
      studentId: student.id,
      type: direction === 'in' ? 'CHECK_IN' : 'CHECK_OUT',
      recipientName: student.guardian_name || student.guardian_email || 'Parent/Guardian',
      recipientRole: 'parent',
      sentBy: actorName(req),
    });
    res.status(201).json({ success: result.status !== 'FAILED', status: result.status, sms_log_id: result.logId, message });
  } catch (err) {
    console.error('SMS_CHECK_TRIGGER_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 📣 ANNOUNCEMENTS
// GET  /api/sms/announcements — list
// POST /api/sms/announcements — create + bulk dispatch
// body: { title, message_body, audience: 'parents'|'staff'|'everyone', dispatch_sms? }
// ==========================================
router.get('/announcements', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.full_name AS sent_by_name
       FROM announcements a
       LEFT JOIN users u ON u.id = a.sent_by
       ORDER BY a.created_at DESC
       LIMIT 200;`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('ANNOUNCEMENTS_LIST_ERROR:', err);
    next(err);
  }
});

router.post('/announcements', async (req, res, next) => {
  try {
    const { title, message_body, audience, dispatch_sms, student_ids } = req.body || {};
    if (!title || !message_body) {
      return res.status(400).json({ success: false, error: 'title and message_body are required.' });
    }
    const aud = ['parents', 'staff', 'everyone'].includes(audience) ? audience : 'everyone';
    const shouldDispatch = dispatch_sms !== false;

    const inserted = await pool.query(
      `INSERT INTO announcements (title, message_body, audience, dispatch_sms, sent_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`,
      [title.trim(), message_body.trim(), aud, shouldDispatch, req.user?.id || null, actorName(req)]
    );
    const announcement = inserted.rows[0];
    const fullMessage = `MIPC EDU: ${title.trim()} — ${message_body.trim()}`;

    let recipients = [];
    if (aud === 'parents' || aud === 'everyone') {
      recipients = recipients.concat(await fetchParentRecipients(
        Array.isArray(student_ids) && student_ids.length ? student_ids.map(Number) : null
      ));
    }
    if (aud === 'staff' || aud === 'everyone') {
      // Staff broadcasts are recorded as LOGGED_ONLY in-app notifications
      // (staff numbers are not stored in the database).
      recipients = recipients.concat(
        STAFF_ROLES.filter((r) => r !== req.user?.role).map((role) => ({
          name: `${role} staff`, phone: '', role: 'staff',
        }))
      );
    }

    let dispatchSummary = null;
    if (shouldDispatch) {
      dispatchSummary = await sendBulkSMS({
        recipients,
        message: fullMessage,
        type: 'ANNOUNCEMENT',
        sentBy: actorName(req),
      });
    }

    res.status(201).json({
      success: true,
      announcement,
      recipients: recipients.length,
      dispatch: dispatchSummary || { sent: 0, failed: 0, logged_only: recipients.length, logs: [] },
    });
  } catch (err) {
    console.error('ANNOUNCEMENT_CREATE_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 📣 STAFF BROADCAST — internal memo strictly among staff
// body: { title, message_body, target_roles?: [] }
// ==========================================
router.post('/broadcast', async (req, res, next) => {
  try {
    const { title, message_body, target_roles } = req.body || {};
    if (!title || !message_body) {
      return res.status(400).json({ success: false, error: 'title and message_body are required.' });
    }
    const roles = Array.isArray(target_roles) && target_roles.length
      ? target_roles.filter((r) => STAFF_ROLES.includes(r))
      : STAFF_ROLES.filter((r) => r !== req.user?.role);
    if (!roles.length) {
      return res.status(400).json({ success: false, error: 'No valid staff roles targeted.' });
    }
    const inserted = await pool.query(
      `INSERT INTO announcements (title, message_body, audience, dispatch_sms, sent_by, created_by_name)
       VALUES ($1, $2, 'staff', FALSE, $3, $4)
       RETURNING *;`,
      [title.trim(), message_body.trim(), req.user?.id || null, actorName(req)]
    );
    const message = `MIPC EDU [STAFF BROADCAST from ${req.user?.role}]: ${title.trim()} — ${message_body.trim()}`;
    let count = 0;
    for (const role of roles) {
      await sendSMS({
        to: '',
        message,
        type: 'ANNOUNCEMENT',
        recipientName: `${role} staff`,
        recipientRole: 'staff',
        sentBy: actorName(req),
      });
      count += 1;
    }
    res.status(201).json({ success: true, announcement: inserted.rows[0], delivered_to: count });
  } catch (err) {
    console.error('STAFF_BROADCAST_ERROR:', err);
    next(err);
  }
});

// ==========================================
// DELETE /api/sms/announcements/:id — retract an announcement
// ==========================================
router.delete('/announcements/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING id;', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Announcement not found.' });
    res.json({ success: true, message: 'Announcement retracted.' });
  } catch (err) {
    console.error('ANNOUNCEMENT_DELETE_ERROR:', err);
    next(err);
  }
});

// ==========================================
// POST /api/sms/validate-phone — utility for the UI
// ==========================================
router.post('/validate-phone', async (req, res) => {
  const result = formatRwandanPhone(req.body?.phone);
  return res.json({ success: result.ok, ...result });
});

module.exports = router;
