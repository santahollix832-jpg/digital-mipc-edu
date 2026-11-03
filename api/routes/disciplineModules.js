const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const ACTION_STATUSES = ['Pending', 'In Progress', 'Completed'];
const RULE_CATEGORIES = ['Academic Misconduct', 'Behavioral Issue', 'Dress Code', 'Attendance', 'Property Damage', 'Bullying / Harassment', 'Other'];

function parseStudentId(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

// ---------------------------------------------------------------------------
// Corrective actions
// ---------------------------------------------------------------------------

// GET /api/discipline/actions - list all corrective actions
router.get('/actions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ca.*, s.name AS student_name, s.class AS class_name, s.reg_number AS student_custom_id
      FROM corrective_actions ca
      JOIN students s ON ca.student_id = s.id
      ORDER BY ca.assigned_at DESC;
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /discipline/actions]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// POST /api/discipline/actions - assign a corrective action
router.post('/actions', async (req, res) => {
  const body = req.body || {};
  const studentId = parseStudentId(body.student_id ?? body.studentId);
  const actionType = String(body.action_type ?? body.actionType ?? '').trim();
  const reason = String(body.reason ?? body.description ?? '').trim();
  const assignedBy = String(body.assigned_by ?? body.assignedBy ?? req.user?.full_name ?? '').trim();
  const dueDate = body.due_date ?? body.dueDate ?? null;
  const validTypes = ['Detention', 'Community Service', 'Suspension', 'Counseling Session', 'Written Warning', 'Other'];

  if (!studentId || !actionType || !reason || !validTypes.includes(actionType)) {
    return res.status(400).json({
      success: false,
      message: 'student_id, a valid action_type, and reason are required.',
      allowedTypes: validTypes,
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO corrective_actions (student_id, incident_id, action_type, reason, assigned_by, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6::date, 'Pending')
       RETURNING *;`,
      [studentId, parseStudentId(body.incident_id ?? body.incidentId), actionType, reason, assignedBy, dueDate]
    );
    res.status(201).json({ success: true, message: 'Corrective action assigned.', data: result.rows[0] });
  } catch (err) {
    console.error('[POST /discipline/actions]', err.message);
    res.status(500).json({ success: false, message: 'Database insertion failed', error: err.message });
  }
});

// PATCH /api/discipline/actions/:id/status - update progress
router.patch('/actions/:id/status', async (req, res) => {
  const status = String(req.body?.status ?? '').trim();
  if (!ACTION_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `Status must be one of: ${ACTION_STATUSES.join(', ')}.` });
  }
  try {
    const result = await pool.query(
      `UPDATE corrective_actions
       SET status = $1,
           completed_at = CASE WHEN $1 = 'Completed' THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = $2
       RETURNING *;`,
      [status, req.params.id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: 'Corrective action not found.' });
    }
    res.json({ success: true, message: `Action marked ${status}.`, data: result.rows[0] });
  } catch (err) {
    console.error('[PATCH /discipline/actions/:id/status]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Merit & demerit point ledger (Conduit System — 40-point base score)
// ---------------------------------------------------------------------------

async function getConduitBasePoints() {
  try {
    const result = await pool.query("SELECT setting_value FROM discipline_settings WHERE setting_key = 'conduit_base_points';");
    if (result.rowCount) {
      const parsed = Number(String(result.rows[0].setting_value).replace(/["']/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
    }
  } catch { /* fall back to default */ }
  return 40;
}

// GET /api/discipline/points - full ledger with Conduit balance per student
router.get('/points', async (req, res) => {
  try {
    const base = await getConduitBasePoints();
    const ledger = await pool.query(`
      SELECT md.*, s.name AS student_name, s.class AS class_name, s.reg_number AS student_custom_id
      FROM merit_demerit_entries md
      JOIN students s ON md.student_id = s.id
      ORDER BY md.awarded_at DESC;
    `);
    const totals = await pool.query(`
      SELECT s.id AS student_id, s.name AS student_name, s.class AS class_name, s.reg_number AS student_custom_id,
             COALESCE(SUM(CASE WHEN md.entry_type = 'merit' THEN md.points END), 0)::INT AS merits,
             COALESCE(SUM(CASE WHEN md.entry_type = 'demerit' THEN md.points END), 0)::INT AS demerits,
             LEAST(GREATEST($1 + COALESCE(SUM(CASE WHEN md.entry_type = 'merit' THEN md.points ELSE -md.points END), 0), 0), $1)::INT AS conduit_points
      FROM students s
      LEFT JOIN merit_demerit_entries md ON md.student_id = s.id
      GROUP BY s.id, s.name, s.class, s.reg_number
      ORDER BY conduit_points DESC;
    `, [base]);
    res.json({ success: true, base_points: base, ledger: ledger.rows, totals: totals.rows });
  } catch (err) {
    console.error('[GET /discipline/points]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// POST /api/discipline/points - award merit or demerit (Conduit capped at base)
router.post('/points', async (req, res) => {
  const body = req.body || {};
  const studentId = parseStudentId(body.student_id ?? body.studentId);
  const entryType = String(body.entry_type ?? body.entryType ?? '').toLowerCase();
  let points = Math.round(Number(body.points));
  const reason = String(body.reason ?? '').trim();
  const awardedBy = String(body.awarded_by ?? body.awardedBy ?? req.user?.full_name ?? '').trim();

  if (!studentId || !['merit', 'demerit'].includes(entryType) || !Number.isSafeInteger(points) || points <= 0 || points > 100 || !reason) {
    return res.status(400).json({
      success: false,
      message: 'student_id, entry_type (merit|demerit), points (1-100), and reason are required.',
    });
  }

  try {
    const base = await getConduitBasePoints();

    if (entryType === 'merit') {
      // Merits restore the Conduit score but can never exceed the 40-point base.
      const balance = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN entry_type = 'merit' THEN points ELSE -points END), 0)::INT AS net
         FROM merit_demerit_entries WHERE student_id = $1;`,
        [studentId]
      );
      const net = balance.rows[0]?.net ?? 0;
      const headroom = Math.max(base - net, 0);
      if (headroom === 0) {
        return res.status(409).json({
          success: false,
          message: `Conduit score is already at the maximum of ${base} points for this student.`,
        });
      }
      if (points > headroom) {
        points = headroom;
      }
    }

    const result = await pool.query(
      `INSERT INTO merit_demerit_entries (student_id, entry_type, points, reason, awarded_by, incident_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`,
      [studentId, entryType, points, reason, awardedBy, parseStudentId(body.incident_id ?? body.incidentId)]
    );
    res.status(201).json({ success: true, message: `${entryType === 'merit' ? 'Merit' : 'Demerit'} recorded.`, data: result.rows[0] });
  } catch (err) {
    console.error('[POST /discipline/points]', err.message);
    res.status(500).json({ success: false, message: 'Database insertion failed', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Smart card scanner — gate movement / attendance / disciplinary checks
// ---------------------------------------------------------------------------

// POST /api/discipline/scan - log a scan and resolve the student
router.post('/scan', async (req, res) => {
  const rawScan = String(req.body?.scan_value ?? req.body?.scanValue ?? '').trim();
  const scanType = ['qr', 'nfc', 'manual'].includes(req.body?.scan_type ?? req.body?.scanType) ? (req.body?.scan_type ?? req.body?.scanType) : 'manual';
  const gate = String(req.body?.gate ?? 'Main Gate').trim();
  const direction = ['IN', 'OUT'].includes(String(req.body?.direction).toUpperCase()) ? String(req.body.direction).toUpperCase() : 'IN';

  if (!rawScan || rawScan.length > 128) {
    return res.status(400).json({ success: false, message: 'A scan value (card id, QR payload, or reg number) is required.' });
  }

  try {
    const student = await pool.query(
      `SELECT id, name, reg_number, class, COALESCE(status, 'Active') AS status
       FROM students
       WHERE reg_number = $1 OR LOWER(name) = LOWER($1)
       LIMIT 1;`,
      [rawScan]
    );
    if (!student.rowCount) {
      return res.status(404).json({ success: false, message: `No student matches "${rawScan}".` });
    }
    const s = student.rows[0];

    const openDiscipline = await pool.query(
      `SELECT id, incident_type, severity, status, approval_status
       FROM discipline_incidents
       WHERE student_id = $1 AND approval_status = 'approved'
       ORDER BY incident_date DESC LIMIT 3;`,
      [s.id]
    );
    const openActions = await pool.query(
      `SELECT id, action_type, status FROM corrective_actions
       WHERE student_id = $1 AND status != 'Completed'
       ORDER BY assigned_at DESC LIMIT 3;`,
      [s.id]
    );
    const pointsRow = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN entry_type = 'merit' THEN points ELSE -points END), 0)::INT AS balance
       FROM merit_demerit_entries WHERE student_id = $1;`,
      [s.id]
    );

    const log = await pool.query(
      `INSERT INTO gate_scans (student_id, scan_value, scan_type, gate, direction, scanned_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING scanned_at;`,
      [s.id, rawScan, scanType, gate, direction, req.user?.full_name ?? '']
    );

    res.json({
      success: true,
      student: { id: s.id, name: s.name, reg_number: s.reg_number, class_name: s.class, enrollment_status: s.status },
      direction,
      gate,
      scan_type: scanType,
      scanned_at: log.rows[0].scanned_at,
      point_balance: pointsRow.rows[0]?.balance ?? 0,
      recent_incidents: openDiscipline.rows,
      open_actions: openActions.rows,
    });
  } catch (err) {
    console.error('[POST /discipline/scan]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// GET /api/discipline/scans - recent gate movement log
router.get('/scans', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT gs.*, s.name AS student_name, s.class AS class_name, s.reg_number AS student_custom_id
      FROM gate_scans gs
      JOIN students s ON gs.student_id = s.id
      ORDER BY gs.scanned_at DESC
      LIMIT 50;
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /discipline/scans]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Analytics & reports
// ---------------------------------------------------------------------------

// GET /api/discipline/analytics - summarized discipline metrics
router.get('/analytics', async (req, res) => {
  try {
    const [incidentsByType, incidentsBySeverity, incidentsByClass, monthlyTrend, actionStats, pointStats, approvalStats] = await Promise.all([
      pool.query(`SELECT incident_type AS label, COUNT(*)::INT AS count FROM discipline_incidents GROUP BY incident_type ORDER BY count DESC;`),
      pool.query(`SELECT severity AS label, COUNT(*)::INT AS count FROM discipline_incidents GROUP BY severity;`),
      pool.query(`SELECT s.class AS label, COUNT(*)::INT AS count FROM discipline_incidents di JOIN students s ON di.student_id = s.id GROUP BY s.class ORDER BY count DESC LIMIT 8;`),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month', incident_date), 'YYYY-MM') AS label, COUNT(*)::INT AS count
                  FROM discipline_incidents
                  WHERE incident_date >= CURRENT_DATE - INTERVAL '6 months'
                  GROUP BY 1 ORDER BY 1;`),
      pool.query(`SELECT status, COUNT(*)::INT AS count FROM corrective_actions GROUP BY status;`),
      pool.query(`SELECT COALESCE(SUM(CASE WHEN entry_type = 'merit' THEN points ELSE 0 END), 0)::INT AS total_merits,
                         COALESCE(SUM(CASE WHEN entry_type = 'demerit' THEN points ELSE 0 END), 0)::INT AS total_demerits
                  FROM merit_demerit_entries;`),
      pool.query(`SELECT approval_status AS label, COUNT(*)::INT AS count FROM discipline_incidents GROUP BY approval_status;`),
    ]);

    res.json({
      success: true,
      data: {
        incidentsByType: incidentsByType.rows,
        incidentsBySeverity: incidentsBySeverity.rows,
        incidentsByClass: incidentsByClass.rows,
        monthlyTrend: monthlyTrend.rows,
        actionStats: actionStats.rows,
        pointStats: pointStats.rows[0] || { total_merits: 0, total_demerits: 0 },
        approvalStats: approvalStats.rows,
      },
    });
  } catch (err) {
    console.error('[GET /discipline/analytics]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// GET /api/discipline/reports/summary.csv - downloadable CSV summary
router.get('/reports/summary.csv', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT di.id, s.name AS student_name, s.class AS class_name, s.reg_number,
             di.incident_type, di.severity, di.incident_date, di.incident_time,
             di.location, di.reported_by, di.status, di.approval_status,
             COALESCE(di.action_taken, '') AS action_taken
      FROM discipline_incidents di
      JOIN students s ON di.student_id = s.id
      ORDER BY di.incident_date DESC;
    `);
    const header = 'ID,Student,Class,Reg Number,Incident Type,Severity,Date,Time,Location,Reported By,Status,Approval Status,Action Taken';
    const rows = result.rows.map((r) =>
      [r.id, r.student_name, r.class_name, r.reg_number, r.incident_type, r.severity, r.incident_date, r.incident_time, r.location, r.reported_by, r.status, r.approval_status, r.action_taken]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="discipline-summary.csv"');
    res.send([header, ...rows].join('\n'));
  } catch (err) {
    console.error('[GET /discipline/reports/summary.csv]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Rules & settings
// ---------------------------------------------------------------------------

const DEFAULT_RULES = {
  merit_positive_points: 5,
  demerit_default_points: 5,
  suspension_threshold: 30,
  counseling_threshold: 15,
  conduit_base_points: 40,
  auto_suspension_enabled: true,
  auto_parent_notification: true,
  categories: RULE_CATEGORIES,
};

function normalizeSettings(rows) {
  const merged = { ...DEFAULT_RULES };
  for (const row of rows) {
    const raw = row.setting_value;
    let parsed = raw;
    try { parsed = JSON.parse(raw); } catch { /* keep raw string */ }
    if (row.setting_key === 'categories') {
      parsed = Array.isArray(parsed) ? parsed : String(raw).split(',').map((c) => c.trim()).filter(Boolean);
    } else if (typeof parsed === 'string' && /^-?\d+(\.\d+)?$/.test(parsed)) {
      parsed = Number(parsed);
    } else if (parsed === 'true' || parsed === 'false') {
      parsed = parsed === 'true';
    }
    merged[row.setting_key] = parsed ?? merged[row.setting_key];
  }
  merged.categories = Array.isArray(merged.categories) ? merged.categories : DEFAULT_RULES.categories;
  return merged;
}

// GET /api/discipline/settings - current rules with defaults
router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT setting_key, setting_value FROM discipline_settings;');
    res.json({ success: true, data: normalizeSettings(result.rows) });
  } catch (err) {
    console.error('[GET /discipline/settings]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// PUT /api/discipline/settings - upsert rules
router.put('/settings', async (req, res) => {
  const body = req.body || {};
  const entries = [];
  for (const key of Object.keys(DEFAULT_RULES)) {
    if (body[key] === undefined) continue;
    const value = key === 'categories'
      ? (Array.isArray(body[key]) ? body[key].filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim()) : null)
      : body[key];
    if (value === null) continue;
    entries.push([key, JSON.stringify(value)]);
  }
  if (!entries.length) {
    return res.status(400).json({ success: false, message: 'No valid settings provided.' });
  }

  try {
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO discipline_settings (setting_key, setting_value, updated_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP;`,
        [key, value, req.user?.full_name ?? '']
      );
    }
    const result = await pool.query('SELECT setting_key, setting_value FROM discipline_settings;');
    res.json({ success: true, message: 'Discipline rules saved.', data: normalizeSettings(result.rows) });
  } catch (err) {
    console.error('[PUT /discipline/settings]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

module.exports = router;
