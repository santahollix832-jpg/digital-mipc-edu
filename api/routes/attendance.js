const express = require('express');
const router = express.Router();
const { validateScanRequest } = require('../middleware/validation');
const {
  recordAttendanceScan,
  getTodayAttendance,
  getAttendanceClasses,
  getAttendanceSummary,
  saveAttendance
} = require('../controllers/attendanceController');

router.get('/classes', getAttendanceClasses);
router.get('/summary', getAttendanceSummary);
router.post('/records', saveAttendance);

/**
 * POST /api/attendance/scan
 * Record a student attendance scan
 * Body: { student_id, check_in_method, device_id }
 */
router.post('/scan', validateScanRequest, recordAttendanceScan);

/**
 * GET /api/attendance/today
 * Fetch today's attendance statistics and details
 */
router.get('/today', getTodayAttendance);

module.exports = router;
