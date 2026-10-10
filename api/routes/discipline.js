const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET /api/discipline/incidents - Fetch all records with student details
router.get('/incidents', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        di.*, 
        s.name AS student_name, 
        s.class AS class_name,
        s.reg_number AS student_custom_id
      FROM discipline_incidents di
      JOIN students s ON di.student_id = s.id
      ORDER BY di.incident_date DESC, di.incident_time DESC;
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /incidents]', err.message);
    res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  }
});

// POST /api/discipline/incidents - Record a new incident
router.post('/incidents', async (req, res) => {
  const payload = req.body || {};
  const {
    studentId,
    studentName,
    student_id,
    incidentType,
    incident_type,
    severity,
    description,
    reportedBy,
    reported_by
  } = payload;
  const studentInput = student_id ?? studentId ?? studentName;
  const finalType = String(incident_type ?? incidentType ?? '').trim();
  const finalDescription = typeof description === 'string' ? description.trim() : '';
  const finalReportedBy = String(reported_by ?? reportedBy ?? '').trim();
  const rawSeverity = String(severity || 'Medium').trim().toLowerCase();
  const severityValues = { low: 'Low', medium: 'Medium', high: 'High' };
  const finalSeverity = severityValues[rawSeverity];
  const incidentDate = payload.incident_date ?? payload.date;
  const incidentTime = payload.incident_time ?? payload.time;
  const location = typeof payload.location === 'string' ? payload.location.trim() : '';
  const actionTaken = payload.action_taken ?? payload.immediate_action;
  const parsedIncidentDate = typeof incidentDate === 'string'
    ? new Date(`${incidentDate}T00:00:00.000Z`)
    : null;
  const validDate = typeof incidentDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(incidentDate) &&
    parsedIncidentDate &&
    !Number.isNaN(parsedIncidentDate.getTime()) &&
    parsedIncidentDate.toISOString().slice(0, 10) === incidentDate;
  const validTime = typeof incidentTime === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(incidentTime);

  try {
    let resolvedStudentId;
    if (Number.isInteger(studentInput) || (typeof studentInput === 'string' && /^\d+$/.test(studentInput.trim()))) {
      const numericStudentId = Number(studentInput);
      if (Number.isSafeInteger(numericStudentId) && numericStudentId > 0) {
        const studentLookup = await pool.query(
          'SELECT id FROM students WHERE id = $1',
          [numericStudentId]
        );
        resolvedStudentId = studentLookup.rows[0]?.id;
      }
    } else if (typeof studentInput === 'string' && studentInput.trim()) {
      const displayValue = studentInput.trim();
      const displayMatch = displayValue.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
      const studentNameValue = displayMatch ? displayMatch[1].trim() : displayValue;
      const registrationNumber = displayMatch ? displayMatch[2].trim() : null;
      const studentLookup = await pool.query(
        `SELECT id FROM students
         WHERE ($1::text IS NOT NULL AND reg_number = $1)
            OR lower(name) = lower($2)
         LIMIT 1`,
        [registrationNumber, studentNameValue]
      );
      resolvedStudentId = studentLookup.rows[0]?.id;
    }

    if (!resolvedStudentId || !finalType || !finalDescription || !finalReportedBy ||
        !finalSeverity || !validDate || !validTime) {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid incident fields, or student not found.",
        received: {
          student_id: resolvedStudentId,
          incident_type: finalType,
          description: finalDescription,
          reported_by: finalReportedBy,
          severity: rawSeverity,
          incident_date: incidentDate,
          incident_time: incidentTime,
        }
      });
    }

    const result = await pool.query(
      `INSERT INTO discipline_incidents
        (student_id, incident_type, severity, incident_date, incident_time, location,
         description, reported_by, action_taken)
       VALUES ($1, $2, $3, $4::date, $5::time, NULLIF($6, ''),
               $7, $8, NULLIF($9, ''))
       RETURNING *;`,
      [
        resolvedStudentId,
        finalType,
        finalSeverity,
        incidentDate,
        incidentTime,
        location,
        finalDescription,
        finalReportedBy,
        typeof actionTaken === 'string' ? actionTaken.trim() : ''
      ]
    );

    res.status(201).json({ 
      success: true, 
      message: "Incident recorded successfully", 
      data: result.rows[0] 
    });
  } catch (err) {
    console.error('[POST /api/discipline/incidents] Database insertion failed:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
      column: err.column,
      table: err.table,
    });
    res.status(500).json({
      success: false,
      message: 'Database insertion failed',
      error: err.message,
      code: err.code,
    });
  }
});

// Legacy routes for compatibility if needed (can be removed later)
// ... existing code ...

module.exports = router;
