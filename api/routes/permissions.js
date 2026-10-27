const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { enqueuePermissionNotification, retryFailedNotifications } = require('../services/permissionNotifications');

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
      "UPDATE permissions SET status = 'Returned', actual_return_timestamp = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id;",
      [id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Permission request not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('PERMISSION_RETURN_ERROR:', err);
    next(err);
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
