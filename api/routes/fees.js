const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ── School Fees Management module ─────────────────────────────────────────────
// Tables: fee_structures, student_fee_accounts, fee_payments
//         (+ fees_ledger / legacy fees_payments kept for backward compatibility)
// Access is gated at mount time in server.js: ADMIN, BURSAR only.
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Card'];

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const money = (v) => Math.round(num(v) * 100) / 100;

function calcStatus(totalPaid, totalRequired) {
  if (totalRequired <= 0) return 'UNPAID';
  if (totalPaid >= totalRequired) return 'COMPLETED';
  if (totalPaid > 0) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

// Column-name adapter for the two payments-table shapes (legacy vs current).
function paymentsAdapter(table) {
  const legacy = table === 'fees_payments';
  return {
    table,
    legacy,
    amountCol: legacy ? 'amount' : 'amount_paid',
    refCol: legacy ? 'receipt_no' : 'reference_no',
    dateCol: legacy ? 'created_at::date' : 'payment_date',
  };
}

// Recompute a student's fee totals and refresh the legacy ledger when present.
// Runs inside an open transaction on `client`.
async function recomputeStudentTotals(client, studentId, studentClass) {
  const paymentsTable = await resolvePaymentsTable();
  const { amountCol } = paymentsAdapter(paymentsTable);

  const paidRes = await client.query(
    `SELECT COALESCE(SUM(${amountCol}), 0)::NUMERIC AS total_paid FROM ${paymentsTable} WHERE student_id = $1`,
    [studentId]
  );
  const totalPaid = money(paidRes.rows[0].total_paid);

  const requiredRes = await client.query(
    `SELECT COALESCE(
       (SELECT sa.agreed_amount - sa.discount_amount
        FROM student_fee_accounts sa
        JOIN fee_structures f ON f.id = sa.fee_structure_id
        WHERE sa.student_id = $1
        ORDER BY f.created_at DESC LIMIT 1),
       (SELECT f.total_amount FROM fee_structures f WHERE f.class_name = $2 ORDER BY f.created_at DESC LIMIT 1),
       0
     )::NUMERIC AS total_required`,
    [studentId, studentClass]
  );
  const totalRequired = money(requiredRes.rows[0].total_required);
  const balance = money(Math.max(totalRequired - totalPaid, 0));
  const status = calcStatus(totalPaid, totalRequired);

  // Persist the recalculated figures onto the student's latest fee account so
  // the database itself reflects the current paid_amount / balance (best-effort
  // — the live SUM from the payments table remains the source of truth).
  try {
    await client.query(
      `UPDATE student_fee_accounts sa
          SET paid_amount = $1,
              balance = $2
         WHERE sa.student_id = $3
           AND sa.id = (
             SELECT sa2.id FROM student_fee_accounts sa2
             JOIN fee_structures f2 ON f2.id = sa2.fee_structure_id
             WHERE sa2.student_id = $3
             ORDER BY f2.created_at DESC
             LIMIT 1
           )`,
      [totalPaid, balance, studentId]
    );
  } catch (persistErr) {
    console.warn('[FEE_ACCOUNT_PERSIST_WARN]', persistErr.message);
  }

  // Keep the legacy ledger in sync when that table exists (best-effort).
  try {
    await client.query(
      `INSERT INTO fees_ledger (student_id, total_required, total_paid, balance, status, last_payment_date, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (student_id) DO UPDATE
         SET total_required = EXCLUDED.total_required,
             total_paid = EXCLUDED.total_paid,
             balance = EXCLUDED.balance,
             status = EXCLUDED.status,
             last_payment_date = NOW(),
             updated_at = NOW()`,
      [studentId, totalRequired, totalPaid, balance, status]
    );
  } catch (ledgerErr) {
    console.warn('[FEES_LEDGER_SYNC_WARN]', ledgerErr.message);
  }

  return { totalRequired, totalPaid, balance, status };
}

// Ensure the new fees tables exist even if the standalone SQL setup was not run.
async function ensureFeesTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fee_structures (
      id BIGSERIAL PRIMARY KEY,
      class_name VARCHAR(100) NOT NULL,
      academic_year VARCHAR(20) NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY'),
      term VARCHAR(30) NOT NULL DEFAULT 'Term 1',
      total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_structures_unique ON fee_structures (class_name, academic_year, term);');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_fee_accounts (
      id BIGSERIAL PRIMARY KEY,
      student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      fee_structure_id BIGINT NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
      agreed_amount NUMERIC(12, 2) NOT NULL CHECK (agreed_amount >= 0),
      discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
      paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
      balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, fee_structure_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fee_payments (
      id BIGSERIAL PRIMARY KEY,
      student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      amount_paid NUMERIC(12, 2) NOT NULL CHECK (amount_paid > 0),
      payment_method VARCHAR(30) NOT NULL DEFAULT 'Cash',
      reference_no VARCHAR(100),
      payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
      recorded_by VARCHAR(255) NOT NULL DEFAULT 'system',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments (student_id);');

  // Older installs may predate the paid_amount / balance columns.
  try {
    await pool.query('ALTER TABLE student_fee_accounts ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;');
    await pool.query('ALTER TABLE student_fee_accounts ADD COLUMN IF NOT EXISTS balance NUMERIC(12, 2) NOT NULL DEFAULT 0;');
  } catch (colErr) {
    console.warn('[FEE_ACCOUNT_COLS_WARN]', colErr.message);
  }
}

// Resolve which fee_payments table shape this install uses.
// New installs use fee_payments.amount_paid; legacy ones used fees_payments.amount.
let PAYMENTS_TABLE = null;
async function resolvePaymentsTable() {
  if (PAYMENTS_TABLE) return PAYMENTS_TABLE;
  try {
    const r = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND ((table_name = 'fee_payments' AND column_name = 'amount_paid')
           OR (table_name = 'fees_payments' AND column_name = 'amount'))
       ORDER BY table_name`
    );
    PAYMENTS_TABLE = r.rows.some((x) => x.table_name === 'fee_payments')
      ? 'fee_payments'
      : 'fees_payments';
  } catch {
    PAYMENTS_TABLE = 'fee_payments';
  }
  return PAYMENTS_TABLE;
}

// ── GET /api/fees/overview?class=&year=&term=&search= ─────────────────────────
// Class-grouped student fee overview: required / paid / balance / status.
// Required amount = student_fee_accounts.agreed_amount − discount when an
// account exists, falling back to the fee structure total for the class.
router.get('/overview', async (req, res) => {
  try {
    await ensureFeesTables();
    const paymentsTable = await resolvePaymentsTable();
    const amountCol = paymentsTable === 'fee_payments' ? 'amount_paid' : 'amount';

    const { class: classFilter, year, term, search } = req.query;
    const values = [];
    const where = [];

    if (classFilter && classFilter !== 'All') {
      values.push(String(classFilter).trim());
      where.push(`LOWER(TRIM(s.class)) = LOWER(TRIM($${values.length}))`);
    }
    if (search && String(search).trim()) {
      values.push(`%${String(search).trim()}%`);
      where.push(`(s.name ILIKE $${values.length} OR s.reg_number ILIKE $${values.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // 1. Students (+ per-student paid totals from the payments table).
    const studentRows = (await pool.query(
      `SELECT s.id AS student_id, s.name AS student_name, s.class, s.reg_number,
              COALESCE((SELECT SUM(fp.${amountCol}) FROM ${paymentsTable} fp WHERE fp.student_id = s.id), 0)::NUMERIC AS total_paid
       FROM students s
       ${whereSql}
       ORDER BY s.class ASC, s.name ASC`,
      values
    )).rows;

    // 2. Fee structures, optionally narrowed to a year/term.
    const structureValues = [];
    const structureWhere = [];
    if (year) { structureValues.push(String(year)); structureWhere.push(`academic_year = $${structureValues.length}`); }
    if (term) { structureValues.push(String(term)); structureWhere.push(`term = $${structureValues.length}`); }
    const structureRows = (await pool.query(
      `SELECT id, class_name, total_amount FROM fee_structures
       ${structureWhere.length ? `WHERE ${structureWhere.join(' AND ')}` : ''}
       ORDER BY created_at DESC`,
      structureValues
    )).rows;
    // Latest structure per class wins.
    const structureByClass = new Map();
    for (const f of structureRows) {
      if (!structureByClass.has(f.class_name)) structureByClass.set(f.class_name, money(f.total_amount));
    }

    // 3. Student fee accounts, optionally narrowed to the same year/term.
    const accountRows = (await pool.query(
      `SELECT sa.student_id, sa.agreed_amount, sa.discount_amount
       FROM student_fee_accounts sa
       JOIN fee_structures f ON f.id = sa.fee_structure_id
       ${structureWhere.length ? `WHERE ${structureWhere.join(' AND ')}` : ''}
       ORDER BY f.created_at DESC`,
      structureValues
    )).rows;
    const accountByStudent = new Map();
    for (const a of accountRows) {
      if (!accountByStudent.has(a.student_id)) {
        accountByStudent.set(a.student_id, money(a.agreed_amount) - money(a.discount_amount));
      }
    }

    // 4. Assemble per-student rows.
    const students = studentRows.map((r) => {
      const required = money(accountByStudent.get(r.student_id) ?? structureByClass.get(r.class) ?? 0);
      const paid = money(r.total_paid);
      return {
        student_id: r.student_id,
        student_name: r.student_name,
        class: r.class,
        reg_number: r.reg_number,
        total_required: required,
        total_paid: paid,
        balance: money(Math.max(required - paid, 0)),
        status: calcStatus(paid, required),
      };
    });

    // Group by class + class-level totals.
    const classesMap = new Map();
    for (const s of students) {
      if (!classesMap.has(s.class)) {
        classesMap.set(s.class, { class_name: s.class, students: [], total_required: 0, total_paid: 0, balance: 0, counts: { COMPLETED: 0, PARTIALLY_PAID: 0, UNPAID: 0 } });
      }
      const group = classesMap.get(s.class);
      group.students.push(s);
      group.total_required = money(group.total_required + s.total_required);
      group.total_paid = money(group.total_paid + s.total_paid);
      group.balance = money(group.balance + s.balance);
      group.counts[s.status] = (group.counts[s.status] || 0) + 1;
    }
    const classes = [...classesMap.values()].map((g) => ({
      ...g,
      student_count: g.students.length,
      collection_rate: g.total_required > 0 ? Math.round((g.total_paid / g.total_required) * 100) : 0,
    }));

    const totals = students.reduce(
      (acc, s) => ({
        total_required: money(acc.total_required + s.total_required),
        total_paid: money(acc.total_paid + s.total_paid),
      }),
      { total_required: 0, total_paid: 0 }
    );

    return res.json({
      success: true,
      totals: { ...totals, balance: money(totals.total_required - totals.total_paid), student_count: students.length },
      classes,
      count: students.length,
    });
  } catch (err) {
    console.error('[FEES_OVERVIEW_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to load fees overview.' });
  }
});

// ── GET /api/fees/structures ──────────────────────────────────────────────────
router.get('/structures', async (req, res) => {
  try {
    await ensureFeesTables();
    const result = await pool.query(
      'SELECT id, class_name, academic_year, term, total_amount, created_at FROM fee_structures ORDER BY academic_year DESC, term ASC, class_name ASC'
    );
    return res.json({ success: true, structures: result.rows });
  } catch (err) {
    console.error('[FEES_STRUCTURES_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to load fee structures.' });
  }
});

// ── POST /api/fees/structures ─────────────────────────────────────────────────
// Create/update a class fee structure. Body: { class_name, academic_year, term, total_amount }
router.post('/structures', async (req, res) => {
  const { class_name, academic_year, term } = req.body || {};
  const total_amount = num(req.body?.total_amount, -1);

  if (!class_name || !String(class_name).trim()) {
    return res.status(400).json({ success: false, error: 'class_name is required.' });
  }
  if (total_amount < 0) {
    return res.status(400).json({ success: false, error: 'A valid non-negative total_amount is required.' });
  }

  try {
    await ensureFeesTables();
    const result = await pool.query(
      `INSERT INTO fee_structures (class_name, academic_year, term, total_amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (class_name, academic_year, term)
       DO UPDATE SET total_amount = EXCLUDED.total_amount
       RETURNING *`,
      [String(class_name).trim(), String(academic_year || new Date().getFullYear()), String(term || 'Term 1'), money(total_amount)]
    );
    return res.status(201).json({ success: true, structure: result.rows[0] });
  } catch (err) {
    console.error('[FEES_STRUCTURE_CREATE_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to save the fee structure.' });
  }
});

// ── POST /api/fees/assign ─────────────────────────────────────────────────────
// Bulk-assign a fee structure to every student in a class.
// Body: { class_name, fee_structure_id, discount_amount? }
router.post('/assign', async (req, res) => {
  const { class_name, fee_structure_id } = req.body || {};
  const discount = Math.max(num(req.body?.discount_amount, 0), 0);

  if (!class_name || !String(class_name).trim()) {
    return res.status(400).json({ success: false, error: 'class_name is required.' });
  }
  const structureId = Number(fee_structure_id);
  if (!Number.isInteger(structureId) || structureId <= 0) {
    return res.status(400).json({ success: false, error: 'A valid fee_structure_id is required.' });
  }

  const client = await pool.connect();
  try {
    await ensureFeesTables();
    await client.query('BEGIN');

    const structure = await client.query('SELECT id, total_amount, class_name FROM fee_structures WHERE id = $1', [structureId]);
    if (!structure.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Fee structure not found.' });
    }
    if (discount > num(structure.rows[0].total_amount)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Discount cannot exceed the structure total.' });
    }

    // Match students case-insensitively and ignoring surrounding whitespace so a
    // structure saved as "L3 SOFTWARE DEVELOPMENT" still matches students.class
    // stored as "l3 software development " etc.
    const students = await client.query(
      'SELECT id FROM students WHERE LOWER(TRIM(class)) = LOWER(TRIM($1))',
      [String(class_name).trim()]
    );
    if (!students.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: `No students found in ${class_name}.` });
    }

    let assigned = 0;
    for (const s of students.rows) {
      await client.query(
        `INSERT INTO student_fee_accounts (student_id, fee_structure_id, agreed_amount, discount_amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id, fee_structure_id)
         DO UPDATE SET agreed_amount = EXCLUDED.agreed_amount, discount_amount = EXCLUDED.discount_amount`,
        [s.id, structureId, money(structure.rows[0].total_amount), money(discount)]
      );
      assigned += 1;
    }

    await client.query('COMMIT');
    return res.json({ success: true, assigned, class_name: String(class_name).trim() });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    console.error('[FEES_ASSIGN_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to assign the fee structure.' });
  } finally {
    client.release();
  }
});

// ── POST /api/fees/payments ───────────────────────────────────────────────────
// Record a payment and return a digital receipt summary.
// Body: { student_id, amount_paid, payment_method, reference_no, payment_date }
router.post('/payments', async (req, res) => {
  const student_id = Number(req.body?.student_id);
  const amount_paid = num(req.body?.amount_paid, -1);
  const payment_method = PAYMENT_METHODS.includes(req.body?.payment_method) ? req.body.payment_method : 'Cash';
  const reference_no = req.body?.reference_no ? String(req.body.reference_no).trim() : null;
  const payment_date = req.body?.payment_date ? String(req.body.payment_date) : null;
  const recorded_by = req.user?.full_name || req.user?.username || 'Bursar';

  if (!Number.isInteger(student_id) || student_id <= 0) {
    return res.status(400).json({ success: false, error: 'A valid student_id is required.' });
  }
  if (amount_paid <= 0) {
    return res.status(400).json({ success: false, error: 'Amount must be greater than zero.' });
  }

  const client = await pool.connect();
  try {
    await ensureFeesTables();
    const paymentsTable = await resolvePaymentsTable();
    const amountCol = paymentsTable === 'fee_payments' ? 'amount_paid' : 'amount';
    // Legacy fees_payments used receipt_no + recorded_by only (no payment_date).
    const legacyShape = paymentsTable === 'fees_payments';

    // Probe once whether the legacy fees_ledger table exists so we can keep it
    // in sync without risking the transaction (a failed statement would abort it).
    let ledgerExists = null;
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fees_ledger'`
      );
      ledgerExists = r.rowCount > 0;
    } catch { ledgerExists = false; }

    await client.query('BEGIN');

    const studentRes = await client.query('SELECT id, name, class, reg_number FROM students WHERE id = $1', [student_id]);
    if (!studentRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }
    const student = studentRes.rows[0];

    let insertResult;
    if (legacyShape) {
      insertResult = await client.query(
        `INSERT INTO fees_payments (student_id, amount, receipt_no, payment_method, recorded_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [student_id, money(amount_paid), reference_no, payment_method, recorded_by]
      );
    } else {
      insertResult = await client.query(
        `INSERT INTO fee_payments (student_id, amount_paid, payment_method, reference_no, payment_date, recorded_by)
         VALUES ($1, $2, $3, $4, COALESCE($5::DATE, CURRENT_DATE), $6) RETURNING id, payment_date`,
        [student_id, money(amount_paid), payment_method, reference_no, payment_date, recorded_by]
      );
    }
    const paymentRow = insertResult.rows[0];

    // Recompute true totals from the payments table — single source of truth.
    const { totalRequired, totalPaid, balance, status } = await recomputeStudentTotals(client, student_id, student.class);

    // Keep the legacy ledger in sync when that table exists (backward compatibility).
    // Handled inside recomputeStudentTotals().

    await client.query('COMMIT');

    const receipt = {
      receipt_no: `RCP-${String(paymentRow.id).padStart(6, '0')}`,
      payment_id: paymentRow.id,
      payment_date: paymentRow.payment_date || new Date().toISOString().slice(0, 10),
      student_name: student.name,
      reg_number: student.reg_number,
      class: student.class,
      amount_paid: money(amount_paid),
      payment_method,
      reference_no,
      recorded_by,
      total_required: totalRequired,
      total_paid: totalPaid,
      balance,
      status,
    };
    return res.status(201).json({ success: true, receipt, ledger: { total_required: totalRequired, total_paid: totalPaid, balance, status } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    console.error('[FEES_PAYMENT_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to record the payment.' });
  } finally {
    client.release();
  }
});

// ── GET /api/fees/payments/:studentId — payment history for one student ───────
router.get('/payments/:studentId', async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    return res.status(400).json({ success: false, error: 'A valid student id is required.' });
  }
  try {
    const paymentsTable = await resolvePaymentsTable();
    const amountCol = paymentsTable === 'fee_payments' ? 'amount_paid' : 'amount';
    const dateCol = paymentsTable === 'fee_payments' ? 'payment_date' : 'created_at::date';
    const refCol = paymentsTable === 'fee_payments' ? 'reference_no' : 'receipt_no';

    const result = await pool.query(
      `SELECT id, ${amountCol} AS amount_paid, payment_method, ${refCol} AS reference_no,
              ${dateCol} AS payment_date, recorded_by, created_at
       FROM ${paymentsTable} WHERE student_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [studentId]
    );
    const payments = result.rows.map((r) => ({
      ...r,
      amount_paid: money(r.amount_paid),
      receipt_no: `RCP-${String(r.id).padStart(6, '0')}`,
    }));
    return res.json({ success: true, payments });
  } catch (err) {
    console.error('[FEES_PAYMENTS_LIST_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to load payment history.' });
  }
});

// ── PUT /api/fees/payments/:id — edit an existing payment ─────────────────────
// Body (all optional): { amount_paid, payment_method, reference_no, payment_date }
// Recomputes the student's balance/status after the update.
router.put('/payments/:id', async (req, res) => {
  const paymentId = Number(req.params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return res.status(400).json({ success: false, error: 'A valid payment id is required.' });
  }

  const amount_paid = req.body?.amount_paid !== undefined ? num(req.body.amount_paid, -1) : undefined;
  const payment_method = req.body?.payment_method !== undefined ? req.body.payment_method : undefined;
  const reference_no = req.body?.reference_no !== undefined ? (req.body.reference_no ? String(req.body.reference_no).trim() : null) : undefined;
  const payment_date = req.body?.payment_date !== undefined && req.body.payment_date ? String(req.body.payment_date) : undefined;
  const edited_by = req.user?.full_name || req.user?.username || 'Bursar';

  if (amount_paid !== undefined && amount_paid <= 0) {
    return res.status(400).json({ success: false, error: 'Amount must be greater than zero.' });
  }
  if (payment_method !== undefined && !PAYMENT_METHODS.includes(payment_method)) {
    return res.status(400).json({ success: false, error: `payment_method must be one of: ${PAYMENT_METHODS.join(', ')}.` });
  }

  const client = await pool.connect();
  try {
    await ensureFeesTables();
    const paymentsTable = await resolvePaymentsTable();
    const { legacy, amountCol, refCol } = paymentsAdapter(paymentsTable);

    await client.query('BEGIN');

    const existing = await client.query(`SELECT * FROM ${paymentsTable} WHERE id = $1 FOR UPDATE`, [paymentId]);
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Payment not found.' });
    }
    const current = existing.rows[0];
    const studentId = current.student_id;

    // Probe whether the edit-audit columns exist (older installs may lack them).
    let hasEditAudit = false;
    if (!legacy) {
      try {
        const colRes = await pool.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'fee_payments' AND column_name = 'edited_by'`
        );
        hasEditAudit = colRes.rowCount > 0;
      } catch { hasEditAudit = false; }
    }

    const newAmount = amount_paid !== undefined ? money(amount_paid) : money(current[amountCol]);
    const newMethod = payment_method !== undefined ? payment_method : current.payment_method;
    const newRef = reference_no !== undefined ? reference_no : current[refCol];

    if (legacy) {
      // Legacy table has no payment_date column — skip it there.
      await client.query(
        `UPDATE fees_payments SET ${amountCol} = $1, payment_method = $2, ${refCol} = $3 WHERE id = $4`,
        [newAmount, newMethod, newRef, paymentId]
      );
    } else {
      const newDate = payment_date !== undefined ? payment_date : current.payment_date;
      if (hasEditAudit) {
        await client.query(
          `UPDATE fee_payments SET amount_paid = $1, payment_method = $2, reference_no = $3, payment_date = $4, edited_by = $5, edited_at = NOW() WHERE id = $6`,
          [newAmount, newMethod, newRef, newDate, edited_by, paymentId]
        );
      } else {
        await client.query(
          `UPDATE fee_payments SET amount_paid = $1, payment_method = $2, reference_no = $3, payment_date = $4 WHERE id = $5`,
          [newAmount, newMethod, newRef, newDate, paymentId]
        );
      }
    }

    const studentRes = await client.query('SELECT id, name, class, reg_number FROM students WHERE id = $1', [studentId]);
    const student = studentRes.rows[0] || { name: 'Unknown', class: null, reg_number: null };

    const { totalRequired, totalPaid, balance, status } = await recomputeStudentTotals(client, studentId, student.class);
    await client.query('COMMIT');

    const paidRes = await pool.query(
      `SELECT ${refCol} AS reference_no, ${legacy ? 'created_at::date' : 'payment_date'} AS payment_date FROM ${paymentsTable} WHERE id = $1`,
      [paymentId]
    );
    const updated = paidRes.rows[0] || {};

    return res.json({
      success: true,
      payment: {
        payment_id: paymentId,
        receipt_no: `RCP-${String(paymentId).padStart(6, '0')}`,
        student_id: studentId,
        student_name: student.name,
        class: student.class,
        reg_number: student.reg_number,
        amount_paid: newAmount,
        payment_method: newMethod,
        reference_no: newRef,
        payment_date: updated.payment_date || current.payment_date || new Date().toISOString().slice(0, 10),
        edited_by,
      },
      ledger: { total_required: totalRequired, total_paid: totalPaid, balance, status },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    console.error('[FEES_PAYMENT_UPDATE_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to update the payment.' });
  } finally {
    client.release();
  }
});

// ── GET /api/students/:id/fee-summary — profile financial card data ───────────
// NOTE: mounted at /api/fees in server.js, so the effective URL is
// /api/fees/students/:id/fee-summary. Server-side alias below covers the
// /api/students path via the shared router registration.
router.get('/students/:id/fee-summary', async (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    return res.status(400).json({ success: false, error: 'A valid student id is required.' });
  }
  try {
    await ensureFeesTables();
    const paymentsTable = await resolvePaymentsTable();
    const { amountCol, refCol, dateCol } = paymentsAdapter(paymentsTable);

    const studentRes = await pool.query('SELECT id, name, class, reg_number FROM students WHERE id = $1', [studentId]);
    if (!studentRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }
    const student = studentRes.rows[0];

    const totalsRes = await pool.query(
      `SELECT
         COALESCE(
           (SELECT sa.agreed_amount - sa.discount_amount
            FROM student_fee_accounts sa
            JOIN fee_structures f ON f.id = sa.fee_structure_id
            WHERE sa.student_id = $1 ORDER BY f.created_at DESC LIMIT 1),
           (SELECT f.total_amount FROM fee_structures f WHERE f.class_name = $2 ORDER BY f.created_at DESC LIMIT 1),
           0
         )::NUMERIC AS total_required,
         COALESCE((SELECT SUM(${amountCol}) FROM ${paymentsTable} WHERE student_id = $1), 0)::NUMERIC AS total_paid`,
      [studentId, student.class]
    );
    const totalRequired = money(totalsRes.rows[0].total_required);
    const totalPaid = money(totalsRes.rows[0].total_paid);
    const balance = money(Math.max(totalRequired - totalPaid, 0));
    const status = calcStatus(totalPaid, totalRequired);

    const historyRes = await pool.query(
      `SELECT id, ${amountCol} AS amount_paid, payment_method, ${refCol} AS reference_no,
              ${dateCol} AS payment_date, recorded_by, created_at
       FROM ${paymentsTable} WHERE student_id = $1
       ORDER BY ${dateCol} DESC, id DESC LIMIT 100`,
      [studentId]
    );
    const payments = historyRes.rows.map((r) => ({
      payment_id: r.id,
      receipt_no: `RCP-${String(r.id).padStart(6, '0')}`,
      amount_paid: money(r.amount_paid),
      payment_method: r.payment_method,
      reference_no: r.reference_no || null,
      payment_date: r.payment_date,
      recorded_by: r.recorded_by,
      recorded_at: r.created_at,
    }));

    return res.json({
      success: true,
      student: { id: student.id, name: student.name, class: student.class, reg_number: student.reg_number },
      summary: {
        total_required: totalRequired,
        total_paid: totalPaid,
        balance,
        status,
        payment_count: payments.length,
        last_payment_date: payments[0]?.payment_date || null,
      },
      payments,
    });
  } catch (err) {
    console.error('[FEES_SUMMARY_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to load the fee summary.' });
  }
});

// ── GET /api/fees/status/:studentId ──────────────────────────────────────────
router.get('/status/:studentId', async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    return res.status(400).json({ success: false, error: 'A valid student id is required.' });
  }
  try {
    await ensureFeesTables();
    const paymentsTable = await resolvePaymentsTable();
    const amountCol = paymentsTable === 'fee_payments' ? 'amount_paid' : 'amount';

    const result = await pool.query(
      `SELECT
         COALESCE(
           (SELECT sa.agreed_amount - sa.discount_amount
            FROM student_fee_accounts sa
            JOIN fee_structures f ON f.id = sa.fee_structure_id
            WHERE sa.student_id = $1 ORDER BY f.created_at DESC LIMIT 1),
           (SELECT f.total_amount FROM fee_structures f
            JOIN students s2 ON s2.class = f.class_name WHERE s2.id = $1
            ORDER BY f.created_at DESC LIMIT 1),
           0
         )::NUMERIC AS total_required,
         COALESCE((SELECT SUM(${amountCol}) FROM ${paymentsTable} WHERE student_id = $1), 0)::NUMERIC AS total_paid`,
      [studentId]
    );
    const row = result.rows[0] || { total_required: 0, total_paid: 0 };
    const required = money(row.total_required);
    const paid = money(row.total_paid);
    return res.json({
      success: true,
      total_required: required,
      total_paid: paid,
      balance: money(Math.max(required - paid, 0)),
      status: calcStatus(paid, required),
    });
  } catch (err) {
    console.error('[FEES_STATUS_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to load the fee status.' });
  }
});

// ── Legacy endpoints (kept for existing clients) ─────────────────────────────

// GET /api/fees/ledger — flat ledger view (no class grouping)
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
      SELECT fl.id, fl.student_id, s.name AS student_name, s.class, s.reg_number,
             COALESCE(fl.total_required, 0)::NUMERIC AS total_required,
             COALESCE(fl.total_paid, 0)::NUMERIC AS total_paid,
             GREATEST(COALESCE(fl.total_required,0) - COALESCE(fl.total_paid,0), 0)::NUMERIC AS balance,
             COALESCE(fl.status, 'UNPAID') AS status
      FROM fees_ledger fl
      INNER JOIN students s ON fl.student_id = s.id
      ${where}
      ORDER BY s.name ASC;
    `;
    const result = await pool.query(sql, values);
    const data = result.rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      student_name: r.student_name,
      class: r.class,
      reg_number: r.reg_number,
      total_required: money(r.total_required),
      total_paid: money(r.total_paid),
      remaining_balance: money(r.balance),
      balance: money(r.balance),
      status: r.status,
    }));
    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error('[FEES_LEDGER_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to load the fees ledger.' });
  }
});

// POST /api/fees/set-target — set required fee for one student or a whole class.
// Now also writes through to the new fee_structures / student_fee_accounts tables.
router.post('/set-target', async (req, res) => {
  const { student_id, class_name } = req.body || {};
  const required = num(req.body?.total_required, -1);

  if (required < 0) {
    return res.status(400).json({ success: false, error: 'A valid non-negative total_required amount is required.' });
  }
  if (!student_id && !class_name) {
    return res.status(400).json({ success: false, error: 'Provide student_id or class_name.' });
  }

  try {
    await ensureFeesTables();
    const year = String(new Date().getFullYear());
    const term = 'Term 1';

    let structureId;
    if (class_name) {
      const up = await pool.query(
        `INSERT INTO fee_structures (class_name, academic_year, term, total_amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (class_name, academic_year, term)
         DO UPDATE SET total_amount = EXCLUDED.total_amount
         RETURNING id`,
        [String(class_name).trim(), year, term, money(required)]
      );
      structureId = up.rows[0].id;
    }

    let studentIds = [];
    if (student_id) {
      studentIds = [Number(student_id)];
    } else {
      const r = await pool.query('SELECT id FROM students WHERE LOWER(TRIM(class)) = LOWER(TRIM($1))', [String(class_name).trim()]);
      studentIds = r.rows.map((row) => row.id);
      if (!studentIds.length) {
        return res.status(404).json({ success: false, error: 'No students found for that class.' });
      }
    }

    for (const sid of studentIds) {
      if (structureId) {
        await pool.query(
          `INSERT INTO student_fee_accounts (student_id, fee_structure_id, agreed_amount, discount_amount)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (student_id, fee_structure_id)
           DO UPDATE SET agreed_amount = EXCLUDED.agreed_amount`,
          [sid, structureId, money(required)]
        );
      }
      // Keep legacy ledger in sync (best-effort).
      try {
        const existing = await pool.query('SELECT total_paid FROM fees_ledger WHERE student_id = $1', [sid]);
        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO fees_ledger (student_id, total_required, total_paid, balance, status)
             VALUES ($1, $2, 0, $2, 'UNPAID')`,
            [sid, money(required)]
          );
        } else {
          const paid = money(existing.rows[0].total_paid);
          await pool.query(
            `UPDATE fees_ledger SET total_required = $1, balance = $2, status = $3, updated_at = NOW() WHERE student_id = $4`,
            [money(required), money(Math.max(required - paid, 0)), calcStatus(paid, required), sid]
          );
        }
      } catch (ledgerErr) { /* non-fatal */ }
    }

    return res.json({ success: true, updated: studentIds.length });
  } catch (err) {
    console.error('[FEES_SET_TARGET_ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Unable to set the fee target.' });
  }
});

module.exports = router;
