const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ==========================================
// 🎚️ CONDUIT SYSTEM (CONDUCT POINTS)
//    40-point base per term; demerits deduct,
//    merits add back but the score is capped at the base (40).
// ==========================================

async function getBasePoints() {
  try {
    const res = await pool.query(
      "SELECT setting_value FROM discipline_settings WHERE setting_key = 'conduit_base_points' LIMIT 1;"
    );
    const raw = res.rows[0]?.setting_value;
    const parsed = raw !== undefined ? Number(JSON.parse(raw)) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 40;
  } catch {
    return 40;
  }
}

// Conduit score = base + merits - demerits, clamped to [0, base].
// Merits can restore lost points but can never push the balance above the base.
function computeConduit(base, rows) {
  let net = 0;
  for (const row of rows) {
    net += row.entry_type === 'merit' ? row.points : -row.points;
  }
  return Math.max(0, Math.min(base, base + net));
}

// GET /api/discipline/conduit — every student's live Conduit meter
router.get('/conduit', async (req, res) => {
  try {
    const base = await getBasePoints();
    const students = await pool.query(`
      SELECT s.id AS student_id, s.name AS student_name, s.class AS class_name,
             s.reg_number, s.photo_url, COALESCE(s.status, 'Active') AS status
      FROM students s
      ORDER BY s.name ASC;
    `);
    const entries = await pool.query(`
      SELECT student_id, entry_type, points
      FROM merit_demerit_entries;
    `);
    const incidentCounts = await pool.query(`
      SELECT student_id, COUNT(*)::INT AS incidents
      FROM discipline_incidents
      WHERE approval_status = 'approved'
      GROUP BY student_id;
    `);
    const incidentByStudent = new Map(incidentCounts.rows.map((r) => [r.student_id, r.incidents]));
    const byStudent = new Map();
    for (const row of entries.rows) {
      const list = byStudent.get(row.student_id) || [];
      list.push(row);
      byStudent.set(row.student_id, list);
    }
    const data = students.rows.map((s) => {
      const rows = byStudent.get(s.student_id) || [];
      const score = computeConduit(base, rows);
      const merits = rows.filter((r) => r.entry_type === 'merit').reduce((sum, r) => sum + r.points, 0);
      const demerits = rows.filter((r) => r.entry_type === 'demerit').reduce((sum, r) => sum + r.points, 0);
      return {
        ...s,
        base_points: base,
        conduit_points: score,
        merits,
        demerits,
        incidents: incidentByStudent.get(s.student_id) || 0,
        percent: Math.round((score / base) * 100),
      };
    });
    res.json({ success: true, base_points: base, data });
  } catch (err) {
    console.error('[GET /conduit]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// GET /api/discipline/conduit/:studentId — one student's meter + recent ledger
router.get('/conduit/:studentId', async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, message: 'A valid student id is required.' });
    }
    const base = await getBasePoints();
    const student = await pool.query(
      `SELECT s.id AS student_id, s.name AS student_name, s.class AS class_name,
              s.reg_number, s.photo_url, COALESCE(s.status, 'Active') AS status
       FROM students s WHERE s.id = $1;`,
      [studentId]
    );
    if (!student.rowCount) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    const entries = await pool.query(
      `SELECT id, entry_type, points, reason, awarded_by, awarded_at, incident_id
       FROM merit_demerit_entries WHERE student_id = $1
       ORDER BY awarded_at DESC LIMIT 50;`,
      [studentId]
    );
    const conduit_points = computeConduit(base, entries.rows);
    res.json({
      success: true,
      base_points: base,
      conduit_points,
      percent: Math.round((conduit_points / base) * 100),
      student: student.rows[0],
      ledger: entries.rows,
    });
  } catch (err) {
    console.error('[GET /conduit/:studentId]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// POST /api/discipline/points — award a merit / demerit manually.
// Merits are capped so the balance never exceeds the 40-point base.
router.post('/points', async (req, res) => {
  try {
    const body = req.body || {};
    const studentId = Number(body.student_id ?? body.studentId);
    const entryType = String(body.entry_type ?? body.entryType ?? '').toLowerCase();
    const points = Math.round(Number(body.points));
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const awardedBy = String(body.awarded_by ?? body.awardedBy ?? req.user?.full_name ?? '').trim();

    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, message: 'A valid student id is required.' });
    }
    if (!['merit', 'demerit'].includes(entryType)) {
      return res.status(400).json({ success: false, message: "entry_type must be 'merit' or 'demerit'." });
    }
    if (!Number.isFinite(points) || points <= 0 || points > 100) {
      return res.status(400).json({ success: false, message: 'points must be between 1 and 100.' });
    }
    if (!reason) {
      return res.status(400).json({ success: false, message: 'A reason is required.' });
    }
    const studentCheck = await pool.query('SELECT id FROM students WHERE id = $1;', [studentId]);
    if (!studentCheck.rowCount) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const base = await getBasePoints();

    // Clamp against the current balance: merits cannot exceed the base,
    // demerits cannot push the balance below zero.
    const balance = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN entry_type = 'merit' THEN points ELSE -points END), 0)::INT AS net
       FROM merit_demerit_entries WHERE student_id = $1;`,
      [studentId]
    );
    const net = balance.rows[0]?.net ?? 0;
    const clamped = entryType === 'merit'
      ? Math.max(0, Math.min(points, base - net))
      : Math.max(0, Math.min(points, base + net));

    if (clamped === 0) {
      return res.status(409).json({
        success: false,
        message: entryType === 'merit'
          ? `Conduit meter is already at the maximum of ${base} points — no merit can be added.`
          : 'Conduit balance is already at zero — nothing left to deduct.',
      });
    }

    const result = await pool.query(
      `INSERT INTO merit_demerit_entries (student_id, entry_type, points, reason, awarded_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *;`,
      [studentId, entryType, clamped, reason, awardedBy]
    );

    const newScore = entryType === 'merit' ? base + net + clamped : base + net - clamped;
    res.status(201).json({
      success: true,
      message: entryType === 'merit'
        ? `Merit recorded — ${clamped} point(s) added.`
        : `Demerit recorded — ${clamped} point(s) deducted.`,
      entry: result.rows[0],
      conduit_points: Math.max(0, Math.min(base, newScore)),
      base_points: base,
    });
  } catch (err) {
    console.error('[POST /points]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// GET /api/discipline/rules — school rules + linked point deductions
router.get('/rules', async (req, res) => {
  try {
    const settings = await pool.query(
      "SELECT setting_key, setting_value, updated_by, updated_at FROM discipline_settings WHERE setting_key = 'rule_point_deductions';"
    );
    let deductions = {};
    if (settings.rowCount) {
      try { deductions = JSON.parse(settings.rows[0].setting_value) || {}; } catch { deductions = {}; }
    }
    const incidentTypes = await pool.query(`
      SELECT incident_type, COUNT(*)::INT AS incident_count
      FROM discipline_incidents
      GROUP BY incident_type ORDER BY incident_type ASC;
    `);
    res.json({
      success: true,
      deductions,
      known_rules: incidentTypes.rows,
    });
  } catch (err) {
    console.error('[GET /rules]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

// PUT /api/discipline/rules — link rules to point deductions (ADMIN / DOD)
router.put('/rules', async (req, res) => {
  if (!['ADMIN', 'DOD'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Only ADMIN or DOD can configure rule deductions.' });
  }
  try {
    const incoming = req.body?.deductions;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return res.status(400).json({ success: false, message: 'deductions object is required.' });
    }
    const clean = {};
    for (const [rule, value] of Object.entries(incoming)) {
      const num = Math.round(Number(value));
      const ruleName = String(rule).trim();
      if (ruleName && Number.isFinite(num) && num > 0 && num <= 40) {
        clean[ruleName] = num;
      }
    }
    await pool.query(
      `INSERT INTO discipline_settings (setting_key, setting_value, updated_by)
       VALUES ('rule_point_deductions', $1, $2)
       ON CONFLICT (setting_key) DO UPDATE
         SET setting_value = EXCLUDED.setting_value,
             updated_by = EXCLUDED.updated_by,
             updated_at = CURRENT_TIMESTAMP;`,
      [JSON.stringify(clean), req.user?.full_name || '']
    );
    res.json({ success: true, deductions: clean });
  } catch (err) {
    console.error('[PUT /rules]', err.message);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

module.exports = router;
