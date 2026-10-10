const express = require('express');
const router = express.Router();
const pool = require('../config/database');

/**
 * ================================================
 * STAFF MANAGEMENT API - PRODUCTION VERSION
 * ================================================
 * Complete staff management system with:
 * - Staff directory and CRUD operations
 * - NFC-based attendance tracking
 * - Check-in/Check-out logic with same-day detection
 * - Database transactions for data integrity
 */

/**
 * GET /api/staff
 * 
 * Fetch all active staff members
 * @returns { success: boolean, data: Array<Staff> }
 */
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        id,
        name,
        email,
        phone,
        role,
        nfc_card_id,
        status,
        created_at
      FROM staff
      WHERE status = 'ACTIVE'
      ORDER BY name ASC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('Error fetching staff:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff directory'
    });
  }
});

/**
 * POST /api/staff/register
 * 
 * Register a new staff member
 * @body {
 *   name: string (required),
 *   email: string (required, UNIQUE),
 *   phone: string (optional),
 *   role: string (TEACHER | BURSAR | ADMIN | SECURITY),
 *   nfc_card_id: string (optional, UNIQUE)
 * }
 * @returns { success: boolean, message: string, staff_id: number (on success) }
 */
router.post('/register', async (req, res) => {
  const client = await pool.connect();

  try {
    const { name, email, phone, role, nfc_card_id } = req.body;

    // Validate required fields
    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and role are required'
      });
    }

    // Validate role
    const validRoles = ['TEACHER', 'BURSAR', 'ADMIN', 'SECURITY'];
    if (!validRoles.includes(role.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be: TEACHER, BURSAR, ADMIN, or SECURITY'
      });
    }

    // Start transaction
    await client.query('BEGIN');

    // Check if email already exists
    const emailCheck = await client.query(
      'SELECT id FROM staff WHERE email = $1',
      [email]
    );

    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Check if NFC card ID already exists (if provided)
    if (nfc_card_id) {
      const nfcCheck = await client.query(
        'SELECT id FROM staff WHERE nfc_card_id = $1',
        [nfc_card_id]
      );

      if (nfcCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: 'NFC card ID already registered to another staff member'
        });
      }
    }

    // Insert staff member
    const insertQuery = `
      INSERT INTO staff (name, email, phone, role, nfc_card_id, status)
      VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
      RETURNING id, name, email, role, nfc_card_id
    `;

    const result = await client.query(insertQuery, [
      name.trim(),
      email.trim(),
      phone || null,
      role.toUpperCase(),
      nfc_card_id || null
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `✅ Umukozi ${name} yanditswe neza!`,
      staff_id: result.rows[0].id,
      staff: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Staff registration error:', err);

    // Check for unique constraint violations
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Email or NFC card ID already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to register staff member'
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/staff/attendance
 * 
 * Handle NFC card scan for check-in/check-out
 * Automatically determines if staff is checking in or out based on today's records
 * 
 * @body {
 *   nfc_card_id: string (required) - The scanned NFC card ID,
 *   OR
 *   staff_id: number (required) - Staff member ID for manual check-in
 * }
 * @returns {
 *   success: boolean,
 *   action: 'CHECK_IN' | 'CHECK_OUT',
 *   message: string,
 *   staff_name: string,
 *   timestamp: ISO string,
 *   check_in: ISO string (if checked in),
 *   check_out: ISO string (if checked out)
 * }
 */
router.post('/attendance', async (req, res) => {
  const client = await pool.connect();

  try {
    const { nfc_card_id, staff_id } = req.body;

    // Validate that either nfc_card_id or staff_id is provided
    if (!nfc_card_id && !staff_id) {
      return res.status(400).json({
        success: false,
        error: 'Either nfc_card_id or staff_id is required'
      });
    }

    await client.query('BEGIN');

    let staffInfo;
    let actualStaffId;

    // If NFC card ID is provided, look up the staff member
    if (nfc_card_id) {
      const staffQuery = await client.query(
        'SELECT id, name, email, role FROM staff WHERE nfc_card_id = $1 AND status = $2',
        [nfc_card_id.trim(), 'ACTIVE']
      );

      if (staffQuery.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'NFC card not registered or staff member is inactive'
        });
      }

      staffInfo = staffQuery.rows[0];
      actualStaffId = staffInfo.id;
    } else {
      // Use provided staff_id
      const staffQuery = await client.query(
        'SELECT id, name, email, role FROM staff WHERE id = $1 AND status = $2',
        [staff_id, 'ACTIVE']
      );

      if (staffQuery.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Staff member not found or is inactive'
        });
      }

      staffInfo = staffQuery.rows[0];
      actualStaffId = staffInfo.id;
    }

    // Check if staff member already has an attendance record for today
    const todayQuery = await client.query(
      `SELECT id, check_in, check_out FROM staff_attendance 
       WHERE staff_id = $1 AND date = CURRENT_DATE`,
      [actualStaffId]
    );

    let action = 'CHECK_IN';
    let attendanceId;
    let checkInTime;
    let checkOutTime;

    if (todayQuery.rows.length === 0) {
      // No record yet - create new check-in
      const insertQuery = await client.query(
        `INSERT INTO staff_attendance (staff_id, check_in, date) 
         VALUES ($1, CURRENT_TIMESTAMP, CURRENT_DATE)
         RETURNING id, check_in, check_out`,
        [actualStaffId]
      );

      attendanceId = insertQuery.rows[0].id;
      checkInTime = insertQuery.rows[0].check_in;
      action = 'CHECK_IN';
    } else {
      // Record exists - check if they're already checked out
      const record = todayQuery.rows[0];
      attendanceId = record.id;
      checkInTime = record.check_in;

      if (record.check_out) {
        // Already checked out today
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Already checked out today. Attendance cannot be updated.'
        });
      }

      // Update check-out time
      const updateQuery = await client.query(
        `UPDATE staff_attendance 
         SET check_out = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING check_in, check_out`,
        [attendanceId]
      );

      checkOutTime = updateQuery.rows[0].check_out;
      action = 'CHECK_OUT';
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      action: action,
      message: action === 'CHECK_IN' 
        ? `✅ ${staffInfo.name} yinjiye @ ${new Date(checkInTime).toLocaleTimeString('rw-RW')}`
        : `👋 ${staffInfo.name} yavuye @ ${new Date(checkOutTime).toLocaleTimeString('rw-RW')}`,
      staff_name: staffInfo.name,
      staff_role: staffInfo.role,
      timestamp: new Date().toISOString(),
      check_in: checkInTime,
      check_out: checkOutTime || null
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Attendance error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to process attendance'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/staff/attendance/today
 * 
 * Get all staff attendance records for today
 * @returns { success: boolean, data: Array<AttendanceRecord> }
 */
router.get('/attendance/today', async (req, res) => {
  try {
    const query = `
      SELECT 
        sa.id,
        s.id as staff_id,
        s.name,
        s.email,
        s.role,
        sa.check_in,
        sa.check_out,
        sa.date,
        CASE 
          WHEN sa.check_out IS NOT NULL THEN 'CHECKED_OUT'
          WHEN sa.check_in IS NOT NULL THEN 'CHECKED_IN'
          ELSE 'ABSENT'
        END as status,
        EXTRACT(EPOCH FROM (COALESCE(sa.check_out, CURRENT_TIMESTAMP) - sa.check_in)) / 3600 as hours_worked
      FROM staff s
      LEFT JOIN staff_attendance sa ON s.id = sa.staff_id AND sa.date = CURRENT_DATE
      WHERE s.status = 'ACTIVE'
      ORDER BY 
        CASE WHEN sa.check_in IS NOT NULL THEN 0 ELSE 1 END,
        s.name ASC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows,
      date: new Date().toISOString().split('T')[0]
    });
  } catch (err) {
    console.error('Error fetching today\'s attendance:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attendance records'
    });
  }
});

module.exports = router;
