const express = require('express');
const router = express.Router();
const pool = require('../config/database');

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
    res.status(201).json({ success: true, permission: result.rows[0] });
  } catch (err) {
    console.error('PERMISSION_SUBMIT_ERROR:', err);
    next(err);
  }
});

// GET /api/permissions/overdue — students whose expected return time has passed and who have not returned yet.
router.get('/overdue', async (req, res, next) => {
  try {
    await pool.query(`
      UPDATE permissions
      SET status = 'Overdue'
      WHERE actual_return_timestamp IS NULL
        AND (
          (expected_return_time IS NOT NULL AND expected_return_time < NOW())
          OR (return_timestamp IS NOT NULL AND return_timestamp < NOW())
        )
        AND status IN ('Approved', 'Pending');
    `);

    const result = await pool.query(`
      SELECT p.id, p.reason, p.status,
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
    await pool.query(
      "UPDATE permissions SET status = 'Returned', actual_return_timestamp = CURRENT_TIMESTAMP WHERE id = $1;",
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PERMISSION_RETURN_ERROR:', err);
    next(err);
  }
});

// Background overdue checker — runs every 60 seconds
const overdueCheckInterval = setInterval(async () => {
  try {
    await pool.query(`
      UPDATE permissions
      SET status = 'Overdue'
      WHERE actual_return_timestamp IS NULL
        AND (
          (expected_return_time IS NOT NULL AND expected_return_time < NOW())
          OR (return_timestamp IS NOT NULL AND return_timestamp < NOW())
        )
        AND status IN ('Approved', 'Pending');
    `);
  } catch (err) {
    console.error('[✗] Overdue checker failed:', err.message);
  }
}, 60000);

function clearOverdueInterval() { clearInterval(overdueCheckInterval); }
process.once('exit',    clearOverdueInterval);
process.once('SIGINT',  clearOverdueInterval);
process.once('SIGTERM', clearOverdueInterval);

module.exports = router;
