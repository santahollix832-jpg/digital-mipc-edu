const pool = require('../config/database');

const validStatuses = new Set(['present', 'absent', 'late', 'permission']);

function getDate(value) {
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const date = value || localToday;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return date;
}

function createSummary(details, date, weeklyRows = []) {
  const classes = new Map();
  const stats = { total_enrolled: details.length, present: 0, absent: 0, late: 0, permission: 0, unmarked: 0 };

  for (const student of details) {
    const className = student.class_name || 'Unassigned';
    if (!classes.has(className)) {
      classes.set(className, {
        class_name: className,
        total_enrolled: 0,
        present: 0,
        absent: 0,
        late: 0,
        permission: 0,
        unmarked: 0,
      });
    }

    const classStats = classes.get(className);
    classStats.total_enrolled += 1;
    const status = validStatuses.has(student.status) ? student.status : 'unmarked';
    classStats[status] += 1;
    stats[status] += 1;
  }

  const weekly = { present: 0, absent: 0, late: 0, permission: 0 };
  for (const row of weeklyRows) {
    if (validStatuses.has(row.status)) weekly[row.status] = Number(row.count);
  }

  return {
    date,
    statistics: stats,
    weekly,
    classes: Array.from(classes.values()).sort((left, right) => left.class_name.localeCompare(right.class_name)),
    details,
    attendance_started: details.some((student) => student.status !== 'unmarked'),
  };
}

async function fetchAttendanceSummary(db, date) {
  const detailResult = await db.query(
    `WITH active_students AS (
       SELECT id, name, reg_number, class, gender, photo_url
       FROM students
       WHERE COALESCE(status, 'Active') <> 'Inactive'
     ),
     daily_logs AS (
       SELECT DISTINCT ON (student_id)
              student_id, status, check_in_time, check_out_time, check_in_method, device_id
       FROM attendance_logs
       WHERE check_in_time >= $1::date
         AND check_in_time < ($1::date + INTERVAL '1 day')
       ORDER BY student_id, check_in_time DESC, id DESC
     ),
     active_permissions AS (
       SELECT DISTINCT student_id
       FROM permissions
       WHERE status IN ('Approved', 'Overdue')
         AND leave_timestamp::date <= $1::date
         AND return_timestamp::date >= $1::date
     )
     SELECT s.id, s.name, s.reg_number, s.class AS class_name, s.gender, s.photo_url,
            al.check_in_time, al.check_out_time, al.check_in_method, al.device_id,
            CASE
              WHEN ap.student_id IS NOT NULL THEN 'permission'
              WHEN al.status IS NULL THEN 'unmarked'
              ELSE lower(al.status)
            END AS status
     FROM active_students s
     LEFT JOIN daily_logs al ON al.student_id = s.id
     LEFT JOIN active_permissions ap ON ap.student_id = s.id
     ORDER BY s.class, s.name;`,
    [date]
  );

  const weeklyResult = await db.query(
    `SELECT lower(status) AS status, COUNT(*)::int AS count
     FROM (
       SELECT DISTINCT ON (student_id) student_id, status
       FROM attendance_logs
       WHERE check_in_time >= DATE_TRUNC('week', $1::date)
         AND check_in_time < ($1::date + INTERVAL '1 day')
       ORDER BY student_id, check_in_time DESC, id DESC
     ) latest_weekly_status
     GROUP BY lower(status);`,
    [date]
  );

  return createSummary(detailResult.rows, date, weeklyResult.rows);
}

async function saveAttendanceRecords(db, date, records, method = 'manual', deviceId = null) {
  const savedRecords = [];
  await db.query('BEGIN');
  try {
    for (const record of records) {
      const existing = await db.query(
        `SELECT id FROM attendance_logs
         WHERE student_id = $1
           AND check_in_time >= $2::date
           AND check_in_time < ($2::date + INTERVAL '1 day')
         ORDER BY check_in_time DESC, id DESC
         LIMIT 1;`,
        [record.student_id, date]
      );

      let result;
      if (existing.rowCount) {
        result = await db.query(
          `UPDATE attendance_logs
           SET status = $1, check_in_method = $2, device_id = $3
           WHERE id = $4
           RETURNING id, student_id, status, check_in_time;`,
          [record.status, method, deviceId, existing.rows[0].id]
        );
      } else {
        result = await db.query(
          `INSERT INTO attendance_logs (student_id, check_in_time, check_in_method, device_id, status)
           VALUES ($1, $2::date + LOCALTIME, $3, $4, $5)
           RETURNING id, student_id, status, check_in_time;`,
          [record.student_id, date, method, deviceId, record.status]
        );
      }
      savedRecords.push(result.rows[0]);
    }
    await db.query('COMMIT');
    return savedRecords;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function getAttendanceSummary(req, res) {
  const date = getDate(req.query.date);
  if (!date) {
    return res.status(400).json({ success: false, error: 'date must be a valid YYYY-MM-DD value.' });
  }

  try {
    const summary = await fetchAttendanceSummary(pool, date);
    const attendancePercentage = summary.statistics.total_enrolled
      ? Number(((summary.statistics.present / summary.statistics.total_enrolled) * 100).toFixed(2))
      : 0;
    return res.json({
      success: true,
      ...summary,
      statistics: {
        ...summary.statistics,
        total_students: summary.statistics.total_enrolled,
        attendance_percentage: attendancePercentage,
      },
    });
  } catch (error) {
    console.error('ATTENDANCE_SUMMARY_ERROR:', error);
    return res.status(500).json({ success: false, error: 'Unable to load attendance summary.' });
  }
}

async function getAttendanceClasses(req, res) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT class AS class_name
       FROM students
       WHERE class IS NOT NULL AND BTRIM(class) <> ''
         AND COALESCE(status, 'Active') <> 'Inactive'
       ORDER BY class_name;`
    );
    return res.json({ success: true, classes: result.rows.map((row) => row.class_name) });
  } catch (error) {
    console.error('ATTENDANCE_CLASSES_ERROR:', error);
    return res.status(500).json({ success: false, error: 'Unable to load student classes.' });
  }
}

async function saveAttendance(req, res) {
  const date = getDate(req.body.date);
  const { records } = req.body;
  if (!date) {
    return res.status(400).json({ success: false, error: 'date must be a valid YYYY-MM-DD value.' });
  }
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one attendance record is required.' });
  }
  if (records.some((record) =>
    !Number.isSafeInteger(Number(record.student_id)) ||
    Number(record.student_id) <= 0 ||
    !validStatuses.has(String(record.status).toLowerCase())
  )) {
    return res.status(400).json({ success: false, error: 'Each record needs a valid student_id and attendance status.' });
  }

  const normalizedRecords = records.map((record) => ({
    student_id: Number(record.student_id),
    status: String(record.status).toLowerCase(),
  }));
  if (new Set(normalizedRecords.map((record) => record.student_id)).size !== normalizedRecords.length) {
    return res.status(400).json({ success: false, error: 'A student can only appear once in a batch.' });
  }

  let client;
  try {
    client = await pool.connect();
    const studentIds = normalizedRecords.map((record) => record.student_id);
    const students = await client.query(
      'SELECT id FROM students WHERE id = ANY($1::int[]) AND COALESCE(status, \'Active\') <> \'Inactive\';',
      [studentIds]
    );
    if (students.rowCount !== studentIds.length) {
      return res.status(400).json({ success: false, error: 'One or more students do not exist or are inactive.' });
    }

    const method = req.body.method === 'NFC' ? 'NFC' : 'manual';
    const saved = await saveAttendanceRecords(client, date, normalizedRecords, method, req.body.device_id || null);
    const summary = await fetchAttendanceSummary(client, date);
    return res.json({ success: true, saved_count: saved.length, records: saved, summary });
  } catch (error) {
    console.error('ATTENDANCE_SAVE_ERROR:', error);
    return res.status(500).json({ success: false, error: 'Unable to save attendance records.' });
  } finally {
    client?.release();
  }
}

async function recordAttendanceScan(req, res) {
  const date = getDate(req.body.date);
  if (!date) return res.status(400).json({ success: false, error: 'date must be a valid YYYY-MM-DD value.' });

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    const currentDateResult = await client.query('SELECT CURRENT_DATE::text AS today;');
    if (date !== currentDateResult.rows[0].today) {
      return res.status(400).json({ success: false, error: 'Live scans can only be recorded for the current date.' });
    }

    const { student_id, student_identifier, check_in_method, device_id } = req.validatedData;
    const studentResult = await client.query(
      `SELECT s.id, s.name
       FROM students s
       LEFT JOIN smart_cards sc ON sc.student_id = s.id AND sc.is_active = TRUE
       WHERE ($1::int IS NOT NULL AND s.id = $1)
          OR ($2::text IS NOT NULL AND (s.reg_number = $2 OR sc.card_uid = $2))
       ORDER BY s.id
       LIMIT 1;`,
      [student_id, student_identifier]
    );
    if (!studentResult.rowCount) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    const matchedStudent = studentResult.rows[0];
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query('SELECT id FROM students WHERE id = $1 FOR UPDATE;', [matchedStudent.id]);
    const existingResult = await client.query(
      `SELECT id, check_in_time, check_out_time
       FROM attendance_logs
       WHERE student_id = $1
         AND check_in_time >= $2::date
         AND check_in_time < ($2::date + INTERVAL '1 day')
       ORDER BY check_in_time DESC, id DESC
       LIMIT 1
       FOR UPDATE;`,
      [matchedStudent.id, date]
    );

    let saved;
    let action;
    if (!existingResult.rowCount) {
      saved = await client.query(
        `INSERT INTO attendance_logs (student_id, check_in_time, check_in_method, device_id, status)
         VALUES ($1, CURRENT_TIMESTAMP, $2, $3, 'present')
         RETURNING id, student_id, status, check_in_time, check_out_time, check_in_method, device_id;`,
        [matchedStudent.id, check_in_method, device_id]
      );
      action = 'entry';
    } else if (!existingResult.rows[0].check_out_time) {
      saved = await client.query(
        `UPDATE attendance_logs
         SET check_out_time = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, student_id, status, check_in_time, check_out_time, check_in_method, device_id;`,
        [existingResult.rows[0].id]
      );
      action = 'exit';
    } else {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        error: `${matchedStudent.name} already has an entry and exit recorded for this date.`,
      });
    }
    await client.query('COMMIT');
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: `Attendance ${action} recorded successfully.`,
      data: { ...saved.rows[0], student_name: matchedStudent.name, action },
    });
  } catch (error) {
    if (client && transactionStarted) await client.query('ROLLBACK').catch((rollbackError) => {
      console.error('ATTENDANCE_SCAN_ROLLBACK_ERROR:', rollbackError);
    });
    console.error('ATTENDANCE_SCAN_ERROR:', error);
    return res.status(500).json({ success: false, error: 'Unable to record attendance scan.' });
  } finally {
    client?.release();
  }
}

async function getTodayAttendance(req, res) {
  return getAttendanceSummary(req, res);
}

module.exports = {
  getAttendanceClasses,
  getAttendanceSummary,
  getTodayAttendance,
  recordAttendanceScan,
  saveAttendance,
};
