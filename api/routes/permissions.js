const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { enqueuePermissionNotification, retryFailedNotifications } = require('../services/permissionNotifications');
const { sendSMS } = require('../services/smsService');

// 🔔 Fire a guardian gate-pass SMS (GATE_PASS type) — never blocks the request.
async function sendGatePassSms(permissionId, actorName = 'system') {
  try {
    const detail = await pool.query(
      `SELECT p.id, p.student_id, s.name, s.reg_number, s.guardian_name, s.guardian_email, s.guardian_phone,
              COALESCE(p.destination, '') AS destination,
              TO_CHAR(COALESCE(p.expected_return_time, p.return_timestamp), 'YYYY-MM-DD HH24:MI') AS expected_return
       FROM permissions p
       JOIN students s ON s.id = p.student_id
       WHERE p.id = $1;`,
      [permissionId]
    );
    if (!detail.rowCount) return;
    const row = detail.rows[0];
    const message =
      `MIPC EDU: ${row.name} (${row.reg_number}) has been granted a gate pass` +
      (row.destination ? ` to ${row.destination}.` : '.') +
      (row.expected_return ? ` Expected return: ${row.expected_return}.` : '') +
      ` — ${actorName}`;
    const result = await sendSMS({
      to: row.guardian_phone || '',
      message,
      studentId: row.student_id,
      type: 'GATE_PASS',
      recipientName: row.guardian_name || row.guardian_email || 'Parent/Guardian',
      recipientRole: 'parent',
      sentBy: actorName,
    });
    await pool.query('UPDATE permissions SET sms_log_id = $2 WHERE id = $1;', [permissionId, result.logId]);
  } catch (err) {
    console.error('[GATE_PASS_SMS_ERROR]', err.message);
  }
}

// ---------------------------------------------------------------------------
// Security role policy: SECURITY is strictly view + gate-report only.
// It may never create, issue, approve or reject leave permissions.
// ---------------------------------------------------------------------------
router.use((req, res, next) => {
  if (req.user?.role === 'SECURITY') {
    const gateAction = req.method === 'POST' && /^\/gate\/\d+\/(return|report-overdue)$/.test(req.path);
    if (req.method !== 'GET' && !gateAction) {
      return res.status(403).json({
        success: false,
        error: 'Security staff may only view permissions and record gate returns / overdue reports.',
      });
    }
  }
  return next();
});

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.student_id, p.reason, p.status, p.created_at,
             TO_CHAR(p.leave_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS leave_timestamp,
             TO_CHAR(COALESCE(p.departure_time, p.leave_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS departure_time,
             TO_CHAR(COALESCE(p.expected_return_time, p.return_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS expected_return_time,
             TO_CHAR(COALESCE(p.return_timestamp, p.expected_return_time), 'YYYY-MM-DD"T"HH24:MI:SS') AS return_timestamp,
             TO_CHAR(p.actual_return_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS actual_return_timestamp,
             s.name AS student_name, s.class AS class_name
      FROM permissions p
      JOIN students s ON s.id = p.student_id
      ORDER BY p.leave_timestamp DESC;
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error('PERMISSION_LIST_ERROR:', error);
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { student_id, reason, departure_time, expected_return_time } = req.body;
    if (!Number.isSafeInteger(Number(student_id)) || Number(student_id) <= 0 ||
        typeof reason !== 'string' || !reason.trim() ||
        typeof departure_time !== 'string' || typeof expected_return_time !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'student_id, reason, departure_time, and expected_return_time are required.',
      });
    }
    const departureDate = new Date(departure_time);
    const expectedReturnDate = new Date(expected_return_time);
    if (Number.isNaN(departureDate.getTime()) || Number.isNaN(expectedReturnDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Departure and expected return times must be valid timestamps.' });
    }
    if (departureDate >= expectedReturnDate) {
      return res.status(400).json({ success: false, error: 'Expected return time must be after departure time.' });
    }

    const result = await pool.query(
      `INSERT INTO permissions (student_id, reason, leave_timestamp, departure_time, return_timestamp, expected_return_time, status)
       VALUES ($1, $2, $3::TIMESTAMP, $3::TIMESTAMP, $4::TIMESTAMP, $4::TIMESTAMP, 'Pending')
       RETURNING id, student_id, reason, status,
                 TO_CHAR(leave_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS leave_timestamp,
                 TO_CHAR(departure_time, 'YYYY-MM-DD"T"HH24:MI:SS') AS departure_time,
                 TO_CHAR(expected_return_time, 'YYYY-MM-DD"T"HH24:MI:SS') AS expected_return_time;`,
      [Number(student_id), reason.trim(), departure_time, expected_return_time]
    );
    const student = await pool.query(
      'SELECT name AS student_name, class AS class_name FROM students WHERE id = $1;',
      [Number(student_id)]
    );
    return res.status(201).json({
      success: true,
      permission: { ...result.rows[0], ...student.rows[0] },
    });
  } catch (error) {
    console.error('PERMISSION_CREATE_ERROR:', error);
    return next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid permission status.' });
    }
    const result = await pool.query(
      `UPDATE permissions
       SET status = $1
       WHERE id = $2 AND status IS DISTINCT FROM $1
       RETURNING id, student_id, status;`,
      [status, req.params.id]
    );
    if (!result.rowCount) {
      const exists = await pool.query('SELECT id, status FROM permissions WHERE id = $1;', [req.params.id]);
      if (!exists.rowCount) return res.status(404).json({ success: false, error: 'Permission request not found.' });
      return res.json({ success: true, permission: exists.rows[0] });
    }
    if (status === 'Approved') {
      await enqueuePermissionNotification(result.rows[0].id, 'approved');
      await sendGatePassSms(result.rows[0].id, req.user?.full_name || 'system');
    }
    return res.json({ success: true, permission: result.rows[0] });
  } catch (error) {
    console.error('PERMISSION_STATUS_UPDATE_ERROR:', error);
    return next(error);
  }
});

// POST /api/permissions/give
router.post('/give', async (req, res, next) => {
  try {
    const { student_id, reason, departure_time, expected_return_time, return_timestamp } = req.body;
    const finalExpectedReturnTime = expected_return_time || return_timestamp;

    if (!student_id || !reason || !finalExpectedReturnTime) {
      return res.status(400).json({ success: false, error: 'Uzuza amakuru yose! (student_id, reason, expected_return_time)' });
    }

    const result = await pool.query(
      `INSERT INTO permissions (student_id, reason, departure_time, return_timestamp, expected_return_time, status)
       VALUES ($1, $2, $3::TIMESTAMP, $4::TIMESTAMP, $5::TIMESTAMP, 'Approved')
       RETURNING id, student_id, reason,
                 TO_CHAR(leave_timestamp,  'YYYY-MM-DD"T"HH24:MI:SS') AS leave_timestamp,
                 TO_CHAR(departure_time,  'YYYY-MM-DD"T"HH24:MI:SS') AS departure_time,
                 TO_CHAR(expected_return_time, 'YYYY-MM-DD"T"HH24:MI:SS') AS expected_return_time,
                 TO_CHAR(return_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS return_timestamp,
                 status;`,
      [parseInt(student_id), reason, departure_time || null, return_timestamp || null, finalExpectedReturnTime]
    );
    await enqueuePermissionNotification(result.rows[0].id, 'approved');
    await sendGatePassSms(result.rows[0].id, req.user?.full_name || 'system');
    res.status(201).json({ success: true, permission: result.rows[0] });
  } catch (err) {
    console.error('PERMISSION_SUBMIT_ERROR:', err);
    next(err);
  }
});

// GET /api/permissions/overdue — students whose expected return time has passed and who have not returned yet.
router.get('/overdue', async (req, res, next) => {
  try {
    const newlyOverdue = await pool.query(`
      UPDATE permissions
      SET status = 'Overdue'
      WHERE actual_return_timestamp IS NULL
        AND (
          (expected_return_time IS NOT NULL AND expected_return_time < NOW())
          OR (return_timestamp IS NOT NULL AND return_timestamp < NOW())
        )
        AND status = 'Approved'
      RETURNING id;
    `);
    for (const permission of newlyOverdue.rows) {
      await enqueuePermissionNotification(permission.id, 'overdue');
    }

    const result = await pool.query(`
      SELECT p.id, p.student_id, p.reason, p.status,
             TO_CHAR(p.leave_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS leave_timestamp,
             TO_CHAR(COALESCE(p.expected_return_time, p.return_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS expected_return_time,
             TO_CHAR(COALESCE(p.departure_time, p.leave_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS departure_time,
             TO_CHAR(p.actual_return_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS actual_return_timestamp,
             s.name AS student_name, s.class AS class_name,
             EXTRACT(EPOCH FROM (NOW() - COALESCE(p.expected_return_time, p.return_timestamp)))::INT AS seconds_overdue
      FROM permissions p
      JOIN students s ON p.student_id = s.id
      WHERE p.status = 'Overdue'
      ORDER BY COALESCE(p.expected_return_time, p.return_timestamp) ASC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('PERMISSION_OVERDUE_ERROR:', err);
    next(err);
  }
});

// GET /api/permissions/list — active (Approved + Overdue)
router.get('/list', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.reason, p.status,
             TO_CHAR(p.leave_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS leave_timestamp,
             TO_CHAR(COALESCE(p.departure_time, p.leave_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS departure_time,
             TO_CHAR(COALESCE(p.expected_return_time, p.return_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS expected_return_time,
             TO_CHAR(COALESCE(p.return_timestamp, p.expected_return_time), 'YYYY-MM-DD"T"HH24:MI:SS') AS return_timestamp,
             TO_CHAR(p.actual_return_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS actual_return_timestamp,
             s.name AS student_name, s.class AS class_name
      FROM permissions p
      JOIN students s ON p.student_id = s.id
      WHERE p.status IN ('Approved', 'Overdue')
      ORDER BY p.leave_timestamp DESC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('PERMISSION_LIST_ERROR:', err);
    next(err);
  }
});

// GET /api/permissions/history  — all records
router.get('/history', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.reason, p.status,
             TO_CHAR(p.leave_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS leave_timestamp,
             TO_CHAR(COALESCE(p.departure_time, p.leave_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS departure_time,
             TO_CHAR(COALESCE(p.expected_return_time, p.return_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS expected_return_time,
             TO_CHAR(COALESCE(p.return_timestamp, p.expected_return_time), 'YYYY-MM-DD"T"HH24:MI:SS') AS return_timestamp,
             TO_CHAR(p.actual_return_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS actual_return_timestamp,
             s.name AS student_name, s.class AS class_name
      FROM permissions p
      JOIN students s ON p.student_id = s.id
      ORDER BY p.leave_timestamp DESC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('PERMISSION_HISTORY_ERROR:', err);
    next(err);
  }
});

// PUT /api/permissions/:id/return
router.put('/:id/return', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "UPDATE permissions SET status = 'Returned', actual_return_timestamp = CURRENT_TIMESTAMP WHERE id = $1 AND actual_return_timestamp IS NULL RETURNING id, student_id;",
      [id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Permission request not found or already returned.' });
    res.json({ success: true });
  } catch (err) {
    console.error('PERMISSION_RETURN_ERROR:', err);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GATE RETURN TRACKING (Security)
// ---------------------------------------------------------------------------

// GET /api/permissions/gate/active — students currently outside the school
router.get('/gate/active', async (req, res, next) => {
  try {
    // Flip expired approvals to Overdue so the gate view always shows the true state.
    await pool.query(`
      UPDATE permissions
      SET status = 'Overdue'
      WHERE actual_return_timestamp IS NULL
        AND COALESCE(expected_return_time, return_timestamp) < NOW()
        AND status = 'Approved';
    `);
    const result = await pool.query(`
      SELECT p.id, p.student_id, p.reason, p.status,
             TO_CHAR(COALESCE(p.departure_time, p.leave_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS departure_time,
             TO_CHAR(COALESCE(p.expected_return_time, p.return_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS expected_return_time,
             s.name AS student_name, s.class AS class_name,
             GREATEST(EXTRACT(EPOCH FROM (NOW() - COALESCE(p.expected_return_time, p.return_timestamp))), 0)::INT AS seconds_overdue
      FROM permissions p
      JOIN students s ON s.id = p.student_id
      WHERE p.status IN ('Approved', 'Overdue')
      ORDER BY COALESCE(p.expected_return_time, p.return_timestamp) ASC;
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error('GATE_ACTIVE_ERROR:', err);
    return next(err);
  }
});

// GET /api/permissions/gate/reported — overdue reports already filed at the gate
router.get('/gate/reported', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT r.id, r.permission_id, r.student_id, r.points_deducted, r.created_at,
             r.report_recipients, r.overdue_minutes,
             s.name AS student_name, s.class AS class_name,
             p.reason AS leave_reason,
             TO_CHAR(COALESCE(p.expected_return_time, p.return_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS expected_return_time,
             r.created_by
      FROM gate_overdue_reports r
      JOIN students s ON s.id = r.student_id
      LEFT JOIN permissions p ON p.id = r.permission_id
      ORDER BY r.created_at DESC;
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error('GATE_REPORTED_ERROR:', err);
    return next(err);
  }
});

// POST /api/permissions/gate/:id/report-overdue — Security files a formal infraction report
router.post('/gate/:id/report-overdue', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const permissionResult = await client.query(`
      SELECT p.id, p.student_id, p.reason, p.status,
             COALESCE(p.expected_return_time, p.return_timestamp) AS expected_return_time
      FROM permissions p
      WHERE p.id = $1
      FOR UPDATE;
    `, [req.params.id]);

    const permission = permissionResult.rows[0];
    if (!permission) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Permission request not found.' });
    }
    if (permission.actual_return_timestamp || !['Approved', 'Overdue'].includes(permission.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'This student is not currently outside the school.' });
    }

    const overdueSeconds = Math.max(0, Math.floor((Date.now() - new Date(permission.expected_return_time).getTime()) / 1000));
    if (overdueSeconds <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'The expected return time has not passed yet. Use “Returned” instead.' });
    }

    const already = await client.query(
      'SELECT id FROM gate_overdue_reports WHERE permission_id = $1;',
      [permission.id]
    );
    if (already.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'An overdue report has already been filed for this permission.' });
    }

    // Points rule configured in discipline_settings (default 5 demerits).
    const settingsResult = await client.query(
      "SELECT setting_value FROM discipline_settings WHERE setting_key = 'gate_overdue_demerit_points';"
    );
    let points = 5;
    if (settingsResult.rowCount) {
      const parsed = Number(String(settingsResult.rows[0].setting_value).replace(/["']/g, ''));
      if (Number.isSafeInteger(parsed) && parsed > 0) points = parsed;
    }

    const overdueMinutes = Math.floor(overdueSeconds / 60);
    const recipients = ['ADMIN', 'DOD', 'PATRON', 'MATRON'];
    const createdBy = req.user?.full_name || 'Security';

    const reportResult = await client.query(`
      INSERT INTO gate_overdue_reports
        (permission_id, student_id, overdue_seconds, overdue_minutes, points_deducted, report_recipients, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, overdue_minutes, points_deducted, created_at;
    `, [permission.id, permission.student_id, overdueSeconds, overdueMinutes, points, JSON.stringify(recipients), createdBy]);

    // Formal infraction record visible to Admin / DOD / Patron / Matron in Discipline.
    await client.query(`
      INSERT INTO discipline_incidents
        (student_id, incident_type, severity, incident_date, incident_time, location,
         description, reported_by, action_taken, approval_status, status, reviewed_by, reviewed_at)
      VALUES ($1, 'Late Return from Leave', 'Medium', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
              TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'HH24:MI'), 'Main Gate',
              $2, $3, 'Reported at gate — pending review by Admin/DOD/Patron/Matron',
              'pending', 'Pending', NULL, NULL);
    `, [
      `Student exceeded the approved leave return time by ${formatOverdueDuration(overdueSeconds)}. ` +
      `Leave reason: ${permission.reason || 'No reason provided'}. ` +
      `Expected return: ${permission.expected_return_time.toISOString()}. ` +
      `${points} discipline point(s) automatically deducted. Filed by ${createdBy} (Security).`,
      createdBy,
    ]);

    // Automatic discipline-point deduction.
    await client.query(`
      INSERT INTO merit_demerit_entries (student_id, entry_type, points, reason, awarded_by)
      VALUES ($1, 'demerit', $2, $3, $4);
    `, [
      permission.student_id,
      points,
      `Overdue return from leave: exceeded expected return time by ${formatOverdueDuration(overdueSeconds)}.`,
      `Security — ${createdBy}`,
    ]);

    await client.query("UPDATE permissions SET status = 'Overdue' WHERE id = $1;", [permission.id]);

    await client.query('COMMIT');

    // Notify Admin / DOD / Patron / Matron (best-effort, outside the transaction).
    try {
      await enqueuePermissionNotification(permission.id, 'overdue');
    } catch (notifyError) {
      console.error('GATE_REPORT_NOTIFY_ERROR:', notifyError);
    }

    return res.status(201).json({
      success: true,
      message: `Overdue report filed. ${points} discipline point(s) deducted.`,
      report: reportResult.rows[0],
    });
  } catch (err) {
    try { await (client ? client.query('ROLLBACK') : Promise.resolve()); } catch { /* ignore */ }
    console.error('GATE_REPORT_OVERDUE_ERROR:', err);
    return next(err);
  } finally {
    client.release();
  }
});

function formatOverdueDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute(s)`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hour(s) ${remainingMinutes} minute(s)` : `${hours} hour(s)`;
}

// POST /api/permissions/gate/:id/return — Security marks an on-time (or any) return
router.post('/gate/:id/return', async (req, res, next) => {
  try {
    const result = await pool.query(
      "UPDATE permissions SET status = 'Returned', actual_return_timestamp = CURRENT_TIMESTAMP WHERE id = $1 AND actual_return_timestamp IS NULL RETURNING id, student_id, status;",
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Permission request not found or already returned.' });

    // 🔔 Automated CHECK_OUT / safe-return notification to the guardian.
    try {
      const detail = await pool.query(
        `SELECT s.id AS student_id, s.name, s.reg_number, s.guardian_name, s.guardian_email, s.guardian_phone
         FROM permissions p JOIN students s ON s.id = p.student_id WHERE p.id = $1;`,
        [req.params.id]
      );
      if (detail.rowCount) {
        const row = detail.rows[0];
        await sendSMS({
          to: row.guardian_phone || '',
          message: `MIPC EDU: ${row.name} (${row.reg_number}) has safely RETURNED to campus at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`,
          studentId: row.student_id,
          type: 'CHECK_OUT',
          recipientName: row.guardian_name || row.guardian_email || 'Parent/Guardian',
          recipientRole: 'parent',
          sentBy: req.user?.full_name || 'gate-return',
        });
      }
    } catch (smsError) {
      console.error('[GATE_RETURN_SMS_ERROR]', smsError.message);
    }

    return res.json({ success: true, permission: result.rows[0] });
  } catch (err) {
    console.error('GATE_RETURN_ERROR:', err);
    return next(err);
  }
});

// Background overdue checker — runs every 60 seconds
const overdueCheckInterval = setInterval(async () => {
  try {
    const newlyOverdue = await pool.query(`
      UPDATE permissions
      SET status = 'Overdue'
      WHERE actual_return_timestamp IS NULL
        AND (
          (expected_return_time IS NOT NULL AND expected_return_time < NOW())
          OR (return_timestamp IS NOT NULL AND return_timestamp < NOW())
        )
        AND status = 'Approved'
      RETURNING id;
    `);
    for (const permission of newlyOverdue.rows) {
      await enqueuePermissionNotification(permission.id, 'overdue');
    }
    await retryFailedNotifications();
  } catch (err) {
    console.error('[✗] Overdue checker failed:', err.message);
  }
}, 60000);

function clearOverdueInterval() { clearInterval(overdueCheckInterval); }
process.once('exit',    clearOverdueInterval);
process.once('SIGINT',  clearOverdueInterval);
process.once('SIGTERM', clearOverdueInterval);

module.exports = router;
