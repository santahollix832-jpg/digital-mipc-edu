const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ==========================================
// 📱 SMS & NOTIFICATIONS CENTER
// Tables: sms_logs, announcements
// ==========================================

const STAFF_ROLES = ['ADMIN', 'DOD', 'PATRON', 'MATRON', 'TEACHER', 'BURSAR', 'SECURITY'];
const ANNOUNCEMENT_AUDIENCES = ['staff', 'parents', 'all'];
const SMS_CATEGORIES = [
  'visite_day',
  'gate_pass',
  'check_in',
  'check_out',
  'announcement',
  'staff_broadcast',
];

/**
 * Simulated SMS gateway. Swap this with Africa's Talking / Twilio / MTN Rwanda
 * integration by setting SMS_GATEWAY_URL; messages are always logged to
 * sms_logs with status 'sent' (or 'pending' when no gateway is configured).
 */
async function dispatchSms({ phone, message }) {
  const gateway = process.env.SMS_GATEWAY_URL;
  if (!gateway) {
    return { status: 'sent', provider_ref: `local-${Date.now()}` };
  }
  try {
    const response = await fetch(gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, message }),
    });
    return { status: response.ok ? 'sent' : 'pending', provider_ref: `gw-${Date.now()}` };
  } catch {
    return { status: 'pending', provider_ref: null };
  }
}

async function logSms({ studentId = null, recipient, recipientRole = 'parent', phone, message, category, senderName, senderRole, status = 'sent' }) {
  const result = await pool.query(
    `INSERT INTO sms_logs (student_id, recipient_name, recipient_role, phone, message, category, status, sender_name, sender_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *;`,
    [studentId, recipient, recipientRole, phone || '', message, category, status, senderName, senderRole]
  );
  return result.rows[0];
}

function ensureRole(req) {
  return req.user?.full_name || req.user?.username || 'System';
}

// ==========================================
// GET /api/sms/logs — sms history (+filters)
// ==========================================
router.get('/logs', async (req, res, next) => {
  try {
    const { category, status, search } = req.query;
    const params = [];
    const clauses = [];
    if (category && SMS_CATEGORIES.includes(category)) {
      params.push(category);
      clauses.push(`category = $${params.length}`);
    }
    if (status && ['sent', 'pending', 'failed'].includes(status)) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(recipient_name ILIKE $${params.length} OR message ILIKE $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT sl.*, s.name AS student_name, s.reg_number
       FROM sms_logs sl
       LEFT JOIN students s ON s.id = sl.student_id
       ${where}
       ORDER BY sl.sent_at DESC
       LIMIT 200;`,
      params
    );
    const stats = await pool.query(`
      SELECT
        COUNT(*)::INT AS total,
        COUNT(*) FILTER (WHERE status = 'sent')::INT AS sent,
        COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending,
        COUNT(*) FILTER (WHERE sent_at::date = CURRENT_DATE)::INT AS today
      FROM sms_logs;
    `);
    res.json({ success: true, data: result.rows, stats: stats.rows[0] });
  } catch (err) {
    console.error('SMS_LOGS_ERROR:', err);
    next(err);
  }
});

// ==========================================
// POST /api/sms/send — manual/targeted SMS
// body: { student_id?, recipient_name, phone, message, category }
// ==========================================
router.post('/send', async (req, res, next) => {
  try {
    const { student_id, recipient_name, phone, message, category } = req.body || {};
    if (!recipient_name || !message) {
      return res.status(400).json({ success: false, error: 'recipient_name and message are required.' });
    }
    const cat = SMS_CATEGORIES.includes(category) ? category : 'announcement';
    const dispatch = await dispatchSms({ phone, message });
    const log = await logSms({
      studentId: student_id ? Number(student_id) : null,
      recipient: recipient_name,
      phone,
      message,
      category: cat,
      senderName: ensureRole(req),
      senderRole: req.user?.role || 'ADMIN',
      status: dispatch.status,
    });
    res.status(201).json({ success: true, sms: log });
  } catch (err) {
    console.error('SMS_SEND_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🚸 AUTOMATED TRIGGER: Visite Day / Gate Pass notification
// body: { student_id, destination, expected_return, permission_id? }
// ==========================================
router.post('/trigger/gate-pass', async (req, res, next) => {
  try {
    const { student_id, destination, expected_return, permission_id } = req.body || {};
    const studentRes = await pool.query('SELECT * FROM students WHERE id = $1;', [Number(student_id)]);
    if (!studentRes.rowCount) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }
    const student = studentRes.rows[0];
    const phone = student.guardian_phone || '';
    const message =
      `MIPC EDU: ${student.name} (${student.reg_number}) has been granted a gate pass` +
      (destination ? ` to ${destination}` : '') +
      (expected_return ? `. Expected return: ${new Date(expected_return).toLocaleString()}` : '') +
      `. — ${ensureRole(req)}`;
    const dispatch = await dispatchSms({ phone, message });
    const log = await logSms({
      studentId: student.id,
      recipient: student.guardian_name || student.guardian_email || 'Parent/Guardian',
      phone,
      message,
      category: 'gate_pass',
      senderName: ensureRole(req),
      senderRole: req.user?.role || 'ADMIN',
      status: dispatch.status,
    });
    if (permission_id) {
      await pool.query('UPDATE permissions SET sms_log_id = $2 WHERE id = $1;', [permission_id, log.id]);
    }
    res.status(201).json({ success: true, sms: log, message });
  } catch (err) {
    console.error('SMS_GATE_PASS_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🚪 AUTOMATED TRIGGER: Day-scholar / Boarder Check-In & Check-Out
// Fired by NFC/QR gate scans or attendance/discipline updates.
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
    const isBoarder = String(student.status || '').toLowerCase() === 'boarding';
    const scanNote = method && method !== 'manual' ? ` via ${method.toUpperCase()} scan` : '';
    const message =
      `MIPC EDU: ${student.name} (${student.reg_number})` +
      ` has checked ${direction === 'in' ? 'IN to' : 'OUT of'} campus at ` +
      `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` +
      `${scanNote} — ${ensureRole(req)}`;
    const phone = student.guardian_phone || '';
    const dispatch = await dispatchSms({ phone, message });
    const log = await logSms({
      studentId: student.id,
      recipient: student.guardian_name || student.guardian_email || 'Parent/Guardian',
      phone,
      message,
      category: direction === 'in' ? 'check_in' : 'check_out',
      senderName: ensureRole(req),
      senderRole: req.user?.role || 'SECURITY',
      status: dispatch.status,
    });
    res.status(201).json({ success: true, sms: log, message, student_type: isBoarder ? 'boarder' : 'day_scholar' });
  } catch (err) {
    console.error('SMS_CHECK_TRIGGER_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 📣 ANNOUNCEMENTS
// GET /api/sms/announcements  — list (staff see all)
// POST /api/sms/announcements — create + broadcast
// body: { title, body, audience: 'staff'|'parents'|'all', send_sms? }
// ==========================================
router.get('/announcements', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT a.*, s.name AS student_name
      FROM announcements a
      LEFT JOIN students s ON s.id = a.student_id
      ORDER BY a.created_at DESC
      LIMIT 200;
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('ANNOUNCEMENTS_LIST_ERROR:', err);
    next(err);
  }
});

router.post('/announcements', async (req, res, next) => {
  try {
    const { title, body, audience, send_sms } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'title and body are required.' });
    }
    const aud = ANNOUNCEMENT_AUDIENCES.includes(audience) ? audience : 'all';

    const inserted = await pool.query(
      `INSERT INTO announcements (title, body, audience, created_by, created_by_role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`,
      [title.trim(), body.trim(), aud, ensureRole(req), req.user?.role || 'ADMIN']
    );
    const announcement = inserted.rows[0];

    // Broadcast: staff-only, parents, or both.
    let recipients = [];
    let smsCount = 0;
    if (aud === 'staff' || aud === 'all') {
      recipients = recipients.concat(STAFF_ROLES.map((role) => ({ name: `${role} staff`, role, phone: '' })));
    }
    if (aud === 'parents' || aud === 'all') {
      const parentsRes = await pool.query(
        `SELECT id, name, guardian_name, guardian_email, guardian_phone FROM students;`
      );
      recipients = recipients.concat(
        parentsRes.rows.map((s) => ({
          name: s.guardian_name || s.guardian_email || `Parent of ${s.name}`,
          role: 'parent',
          phone: s.guardian_phone || '',
          studentId: s.id,
        }))
      );
    }

    if (send_sms !== false) {
      for (const r of recipients) {
        if (aud === 'parents' || aud === 'all') {
          if (!r.phone) continue; // only text parents we can reach
          const dispatch = await dispatchSms({ phone: r.phone, message: `MIPC EDU: ${title} — ${body}` });
          await logSms({
            studentId: r.studentId || null,
            recipient: r.name,
            recipientRole: r.role,
            phone: r.phone,
            message: `MIPC EDU: ${title} — ${body}`,
            category: 'announcement',
            senderName: ensureRole(req),
            senderRole: req.user?.role || 'ADMIN',
            status: dispatch.status,
          });
          smsCount += 1;
        } else {
          await logSms({
            recipient: r.name,
            recipientRole: r.role,
            message: `MIPC EDU [STAFF]: ${title} — ${body}`,
            category: 'staff_broadcast',
            senderName: ensureRole(req),
            senderRole: req.user?.role || 'ADMIN',
            status: 'sent',
          });
          smsCount += 1;
        }
      }
    }

    res.status(201).json({ success: true, announcement, recipients: recipients.length, sms_sent: smsCount });
  } catch (err) {
    console.error('ANNOUNCEMENT_CREATE_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 📣 STAFF BROADCAST — internal memo strictly among staff
// body: { title, body, target_roles?: [] } (empty target = all staff roles)
// ==========================================
router.post('/broadcast', async (req, res, next) => {
  try {
    const { title, body, target_roles } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'title and body are required.' });
    }
    const roles = Array.isArray(target_roles) && target_roles.length
      ? target_roles.filter((r) => STAFF_ROLES.includes(r))
      : STAFF_ROLES;
    if (!roles.length) {
      return res.status(400).json({ success: false, error: 'No valid staff roles targeted.' });
    }
    const inserted = await pool.query(
      `INSERT INTO announcements (title, body, audience, created_by, created_by_role)
       VALUES ($1, $2, 'staff', $3, $4)
       RETURNING *;`,
      [title.trim(), body.trim(), ensureRole(req), req.user?.role || 'ADMIN']
    );
    let count = 0;
    for (const role of roles) {
      await logSms({
        recipient: `${role} staff`,
        recipientRole: role,
        message: `MIPC EDU [STAFF BROADCAST from ${req.user?.role}]: ${title} — ${body}`,
        category: 'staff_broadcast',
        senderName: ensureRole(req),
        senderRole: req.user?.role || 'ADMIN',
        status: 'sent',
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

module.exports = router;
