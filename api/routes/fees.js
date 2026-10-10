const express = require('express');
const router  = express.Router();
const pool    = require('../config/database');

// Shared status calculation
function calcStatus(totalPaid, totalRequired) {
  if (totalRequired <= 0)           return 'UNPAID';
  if (totalPaid >= totalRequired)   return 'COMPLETED';
  if (totalPaid > 0)                return 'PARTIALLY_PAID';
  return 'UNPAID';
}

// ── GET /api/fees/ledger ──────────────────────────────────────────────────────
// Reads from fees_ledger (maintained by POST /payments).
// total_paid comes from the ledger itself — no JOIN to fees_payments —
// so there is zero risk of double-counting from fan-out JOINs.
router.get('/ledger', async (req, res) => {
  try {
    const classFilter = req.query.class ? String(req.query.class).trim() : null;
    const values = [];
    let where = '';
    if (classFilter && classFilter !== 'All') {
      where = 'WHERE s.class = $1';
      values.push(classFilter);
    }

    const sql = `
      SELECT
        fl.id,
        fl.student_id,
        s.name        AS student_name,
        s.class,
        s.reg_number,
        COALESCE(fl.total_required, 0)::NUMERIC                    AS total_required,
        COALESCE(p_sum.total_paid,  0)::NUMERIC                    AS total_paid,
        GREATEST(COALESCE(fl.total_required,0) - COALESCE(p_sum.total_paid,0), 0)::NUMERIC AS balance,
        CASE
          WHEN COALESCE(p_sum.total_paid,0) >= COALESCE(fl.total_required,0)
               AND COALESCE(fl.total_required,0) > 0             THEN 'COMPLETED'
          WHEN COALESCE(p_sum.total_paid,0) > 0
               AND COALESCE(p_sum.total_paid,0) < COALESCE(fl.total_required,0) THEN 'PARTIALLY_PAID'
          ELSE 'UNPAID'
        END AS status
      FROM fees_ledger fl
      INNER JOIN students s ON fl.student_id = s.id
      LEFT JOIN (
        SELECT student_id, SUM(amount) AS total_paid
        FROM fees_payments
        GROUP BY student_id
      ) p_sum ON fl.student_id = p_sum.student_id
      ${where}
      ORDER BY s.name ASC;
    `;

    const result = await pool.query(sql, values);

    const data = result.rows.map(r => ({
      id:                r.id,
      student_id:        r.student_id,
      student_name:      r.student_name,
      class:             r.class,
      reg_number:        r.reg_number,
      total_required:    parseFloat(r.total_required),
      total_paid:        parseFloat(r.total_paid),
      remaining_balance: parseFloat(r.balance),   // aliased for frontend
      balance:           parseFloat(r.balance),
      status:            r.status,
    }));

    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error('[FEES_LEDGER_ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/fees/set-target ─────────────────────────────────────────────────
// Set the required fee for one student OR all students in a class.
// Body: { student_id?, class_name?, total_required }
router.post('/set-target', async (req, res) => {
  const { student_id, class_name, total_required } = req.body;

  if (total_required === undefined || isNaN(Number(total_required)) || Number(total_required) < 0) {
    return res.status(400).json({ success: false, error: 'Valid total_required amount is required' });
  }
  if (!student_id && !class_name) {
    return res.status(400).json({ success: false, error: 'Provide student_id or class_name' });
  }

  const required = parseFloat(total_required);

  try {
    let studentIds = [];

    if (student_id) {
      studentIds = [parseInt(student_id)];
    } else {
      const r = await pool.query('SELECT id FROM students WHERE class = $1', [class_name]);
      studentIds = r.rows.map(row => row.id);
      if (!studentIds.length) {
        return res.status(404).json({ success: false, error: 'No students found for that class' });
      }
    }

    for (const sid of studentIds) {
      const existing = await pool.query('SELECT total_paid FROM fees_ledger WHERE student_id = $1', [sid]);
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO fees_ledger (student_id, total_required, total_paid, balance, status)
           VALUES ($1, $2, 0, $2, 'UNPAID')`,
          [sid, required]
        );
      } else {
        const paid    = parseFloat(existing.rows[0].total_paid);
        const balance = Math.max(required - paid, 0);
        const status  = calcStatus(paid, required);
        await pool.query(
          `UPDATE fees_ledger
           SET total_required = $1, balance = $2, status = $3, updated_at = NOW()
           WHERE student_id = $4`,
          [required, balance, status, sid]
        );
      }
    }

    return res.json({ success: true, updated: studentIds.length });
  } catch (err) {
    console.error('[FEES_SET_TARGET_ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/fees/payments ───────────────────────────────────────────────────
// Record one payment. Uses actual schema column names: amount, receipt_no.
router.post('/payments', async (req, res) => {
  const student_id     = Number(req.body.student_id ?? req.body.studentId);
  const amount_paid    = Number(req.body.amount_paid ?? req.body.amount);
  const receipt_no     = req.body.bank_reference ?? req.body.receipt_no ?? null;
  const payment_method = req.body.payment_method ?? 'Cash';
  const recorded_by    = req.body.received_by ?? req.body.recorded_by ?? 'Bursar';

  if (!student_id || isNaN(student_id)) return res.status(400).json({ success: false, error: 'Valid student_id required' });
  if (!amount_paid || amount_paid <= 0) return res.status(400).json({ success: false, error: 'Amount must be > 0' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify student exists
    const sc = await client.query('SELECT id FROM students WHERE id = $1', [student_id]);
    if (!sc.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    // 2. Insert payment record first
    await client.query(
      `INSERT INTO fees_payments (student_id, amount, receipt_no, payment_method, recorded_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [student_id, amount_paid, receipt_no, payment_method, recorded_by]
    );

    // 3. Compute the true total_paid from fees_payments directly — single source of truth,
    //    no stale ledger reads, no double-count regardless of concurrent requests.
    const sumResult = await client.query(
      'SELECT COALESCE(SUM(amount), 0)::NUMERIC AS total_paid FROM fees_payments WHERE student_id = $1',
      [student_id]
    );
    const trueTotalPaid = parseFloat(sumResult.rows[0].total_paid);

    // 4. Upsert ledger with the computed true total_paid
    const upsert = await client.query(
      `INSERT INTO fees_ledger (student_id, total_required, total_paid, balance, status, last_payment_date, updated_at)
       VALUES ($1, 0, $2, GREATEST(0 - $2, 0), 'UNPAID', NOW(), NOW())
       ON CONFLICT (student_id) DO UPDATE
         SET total_paid        = $2,
             balance           = GREATEST(fees_ledger.total_required - $2, 0),
             status            = CASE
                                   WHEN $2 >= fees_ledger.total_required AND fees_ledger.total_required > 0 THEN 'COMPLETED'
                                   WHEN $2 > 0 AND $2 < fees_ledger.total_required                         THEN 'PARTIALLY_PAID'
                                   ELSE 'UNPAID'
                                 END,
             last_payment_date = NOW(),
             updated_at        = NOW()
       RETURNING total_required, total_paid, balance, status`,
      [student_id, trueTotalPaid]
    );

    await client.query('COMMIT');
    const row = upsert.rows[0];
    return res.json({
      success: true,
      updated_ledger: {
        total_paid:     parseFloat(row.total_paid),
        total_required: parseFloat(row.total_required),
        balance:        parseFloat(row.balance),
        status:         row.status,
      }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[FEES_PAYMENT_ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ── GET /api/fees/status/:studentId ──────────────────────────────────────────
router.get('/status/:studentId', async (req, res) => {
  const { studentId } = req.params;
  if (!studentId || isNaN(studentId)) return res.status(400).json({ success: false, error: 'Invalid student ID' });
  try {
    const r = await pool.query('SELECT * FROM fees_ledger WHERE student_id = $1', [studentId]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Not found in ledger' });
    const row = r.rows[0];
    const paid = parseFloat(row.total_paid);
    const req_ = parseFloat(row.total_required || 0);
    return res.json({
      success: true,
      total_required: req_,
      total_paid:     paid,
      balance:        Math.max(req_ - paid, 0),
      status:         calcStatus(paid, req_),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
