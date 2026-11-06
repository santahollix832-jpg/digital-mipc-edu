// ==========================================
// 💰 TRANSPORT FARE & TICKET PAYMENT MANAGEMENT (ADMIN / BURSAR)
// ==========================================

const TRANSPORT_PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Card'];

function fareMoney(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function fareTicketStatus(fare, paid) {
  if (fare <= 0) return paid > 0 ? 'Fully Paid' : 'Unpaid';
  if (paid >= fare) return 'Fully Paid';
  if (paid > 0) return 'Partial Payment';
  return 'Unpaid';
}

async function ensureFareTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transport_routes (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      fare_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fare_amount >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    INSERT INTO transport_routes (name, fare_amount) VALUES
      ('Kigali', 0), ('Rubavu', 0), ('Musanze', 0), ('Parent Pick-Up', 0)
    ON CONFLICT (name) DO NOTHING;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_transport_payments (
      id BIGSERIAL PRIMARY KEY,
      student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      route_id INT REFERENCES transport_routes(id) ON DELETE SET NULL,
      route_name VARCHAR(50) NOT NULL,
      fare_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fare_amount >= 0),
      amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
      payment_method VARCHAR(30) NOT NULL DEFAULT 'Cash',
      reference_no VARCHAR(100),
      payment_status VARCHAR(20) NOT NULL DEFAULT 'Unpaid'
        CHECK (payment_status IN ('Fully Paid', 'Partial Payment', 'Unpaid')),
      payment_date DATE,
      recorded_by VARCHAR(255) NOT NULL DEFAULT 'system',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, route_name)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_transport_payment_log (
      id BIGSERIAL PRIMARY KEY,
      payment_id BIGINT NOT NULL REFERENCES student_transport_payments(id) ON DELETE CASCADE,
      student_id INT NOT NULL,
      route_name VARCHAR(50) NOT NULL,
      fare_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(30) NOT NULL DEFAULT 'Cash',
      reference_no VARCHAR(100),
      payment_status VARCHAR(20) NOT NULL DEFAULT 'Unpaid',
      payment_date DATE,
      recorded_by VARCHAR(255) NOT NULL DEFAULT 'system',
      action VARCHAR(10) NOT NULL DEFAULT 'CREATE' CHECK (action IN ('CREATE', 'UPDATE')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// GET /api/transport/fares — the 4 routes with their standard ticket fare.
router.get('/fares', async (req, res, next) => {
  try {
    await ensureFareTables();
    const result = await pool.query(
      `SELECT id, name, fare_amount FROM transport_routes
       ORDER BY CASE name WHEN 'Kigali' THEN 1 WHEN 'Rubavu' THEN 2 WHEN 'Musanze' THEN 3 ELSE 4 END`
    );
    res.json({ success: true, routes: result.rows.map((r) => ({ ...r, fare_amount: fareMoney(r.fare_amount) })) });
  } catch (err) {
    console.error('TRANSPORT_FARES_ERROR:', err);
    next(err);
  }
});

// PUT /api/transport/routes/:id/fare — set the standard ticket price for a route.
router.put('/routes/:id/fare', async (req, res, next) => {
  try {
    if (!['ADMIN', 'BURSAR'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Only ADMIN or BURSAR can change route fares.' });
    }
    const routeId = Number(req.params.id);
    const fare = fareMoney(req.body?.fare_amount);
    if (!Number.isSafeInteger(routeId) || routeId <= 0) {
      return res.status(400).json({ success: false, error: 'A valid route id is required.' });
    }
    if (fare < 0) {
      return res.status(400).json({ success: false, error: 'Fare must be zero or greater.' });
    }
    const result = await pool.query(
      'UPDATE transport_routes SET fare_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, fare_amount',
      [fare, routeId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Route not found.' });
    }
    res.json({ success: true, route: { ...result.rows[0], fare_amount: fareMoney(result.rows[0].fare_amount) } });
  } catch (err) {
    console.error('TRANSPORT_FARE_UPDATE_ERROR:', err);
    next(err);
  }
});

// POST /api/transport/payments — record (or upsert) a student's ticket payment.
// Body: { student_id, fare_amount?, amount_paid, payment_method, reference_no?, payment_date? }
// fare_amount defaults to the route's standard fare when omitted.
router.post('/payments', async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!['ADMIN', 'BURSAR'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Only ADMIN or BURSAR can record ticket payments.' });
    }
    await ensureFareTables();
    const studentId = Number(req.body?.student_id);
    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, error: 'A valid student_id is required.' });
    }
    const amountPaid = fareMoney(req.body?.amount_paid);
    if (amountPaid < 0) {
      return res.status(400).json({ success: false, error: 'Amount paid must be zero or greater.' });
    }
    const method = TRANSPORT_PAYMENT_METHODS.includes(req.body?.payment_method) ? req.body.payment_method : 'Cash';
    const reference = req.body?.reference_no ? String(req.body.reference_no).trim() : null;
    const paymentDate = req.body?.payment_date ? String(req.body.payment_date) : null;
    const recordedBy = req.user?.full_name || req.user?.username || 'Bursar';

    await client.query('BEGIN');
    const studentRes = await client.query('SELECT id, name, preferred_route FROM students WHERE id = $1', [studentId]);
    if (!studentRes.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }
    const student = studentRes.rows[0];
    const routeName = student.preferred_route;

    const routeRes = await client.query('SELECT id, fare_amount FROM transport_routes WHERE name = $1', [routeName]);
    const route = routeRes.rows[0] || { id: null, fare_amount: 0 };
    const fare = req.body?.fare_amount !== undefined && req.body.fare_amount !== null && req.body.fare_amount !== ''
      ? fareMoney(req.body.fare_amount)
      : fareMoney(route.fare_amount);
    const status = fareTicketStatus(fare, amountPaid);

    const upsert = await client.query(
      `INSERT INTO student_transport_payments
         (student_id, route_id, route_name, fare_amount, amount_paid, payment_method, reference_no, payment_status, payment_date, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::DATE, CURRENT_DATE), $10)
       ON CONFLICT (student_id, route_name) DO UPDATE
         SET fare_amount = EXCLUDED.fare_amount,
             amount_paid = EXCLUDED.amount_paid,
             payment_method = EXCLUDED.payment_method,
             reference_no = EXCLUDED.reference_no,
             payment_status = EXCLUDED.payment_status,
             payment_date = EXCLUDED.payment_date,
             recorded_by = EXCLUDED.recorded_by,
             updated_at = CURRENT_TIMESTAMP
       RETURNING id, (xmax = 0) AS inserted`,
      [studentId, route.id, routeName, fare, amountPaid, method, reference, status, paymentDate, recordedBy]
    );
    const paymentRow = upsert.rows[0];
    await client.query(
      `INSERT INTO student_transport_payment_log
         (payment_id, student_id, route_name, fare_amount, amount_paid, payment_method, reference_no, payment_status, payment_date, recorded_by, action)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [paymentRow.id, studentId, routeName, fare, amountPaid, method, reference, status, paymentDate, recordedBy, paymentRow.inserted ? 'CREATE' : 'UPDATE']
    );

    // Keep the legacy transport_tickets board in sync.
    await client.query(
      `INSERT INTO transport_tickets (student_id, route, payment_status, amount_paid, paid_at, updated_by)
       VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'Unpaid' THEN NULL ELSE CURRENT_TIMESTAMP END, $5)
       ON CONFLICT (student_id) DO UPDATE
         SET payment_status = EXCLUDED.payment_status,
             amount_paid = EXCLUDED.amount_paid,
             paid_at = EXCLUDED.paid_at,
             updated_by = EXCLUDED.updated_by,
             updated_at = CURRENT_TIMESTAMP`,
      [studentId, routeName, status, amountPaid, recordedBy]
    );

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      payment: {
        payment_id: paymentRow.id,
        student_id: studentId,
        student_name: student.name,
        route: routeName,
        fare_amount: fare,
        amount_paid: amountPaid,
        balance: fareMoney(Math.max(fare - amountPaid, 0)),
        payment_status: status,
        payment_method: method,
        reference_no: reference,
        payment_date: paymentDate || new Date().toISOString().slice(0, 10),
        recorded_by: recordedBy,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    console.error('TRANSPORT_PAYMENT_ERROR:', err);
    next(err);
  } finally {
    client.release();
  }
});

// PUT /api/transport/payments/:id — edit an existing ticket payment and recalculate.
router.put('/payments/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!['ADMIN', 'BURSAR'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Only ADMIN or BURSAR can edit ticket payments.' });
    }
    await ensureFareTables();
    const paymentId = Number(req.params.id);
    if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({ success: false, error: 'A valid payment id is required.' });
    }

    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM student_transport_payments WHERE id = $1 FOR UPDATE', [paymentId]);
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Payment not found.' });
    }
    const current = existing.rows[0];

    const fare = req.body?.fare_amount !== undefined && req.body.fare_amount !== null && req.body.fare_amount !== ''
      ? fareMoney(req.body.fare_amount)
      : fareMoney(current.fare_amount);
    const amountPaid = req.body?.amount_paid !== undefined ? fareMoney(req.body.amount_paid) : fareMoney(current.amount_paid);
    if (fare < 0 || amountPaid < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Fare and amount paid must be zero or greater.' });
    }
    const method = req.body?.payment_method !== undefined
      ? (TRANSPORT_PAYMENT_METHODS.includes(req.body.payment_method) ? req.body.payment_method : current.payment_method)
      : current.payment_method;
    const reference = req.body?.reference_no !== undefined
      ? (req.body.reference_no ? String(req.body.reference_no).trim() : null)
      : current.reference_no;
    const paymentDate = req.body?.payment_date !== undefined && req.body.payment_date
      ? String(req.body.payment_date)
      : current.payment_date;
    const recordedBy = req.user?.full_name || req.user?.username || 'Bursar';
    const status = fareTicketStatus(fare, amountPaid);

    const updated = await client.query(
      `UPDATE student_transport_payments
       SET fare_amount = $1, amount_paid = $2, payment_method = $3, reference_no = $4,
           payment_status = $5, payment_date = COALESCE($6::DATE, payment_date), recorded_by = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [fare, amountPaid, method, reference, status, paymentDate, recordedBy, paymentId]
    );
    await client.query(
      `INSERT INTO student_transport_payment_log
         (payment_id, student_id, route_name, fare_amount, amount_paid, payment_method, reference_no, payment_status, payment_date, recorded_by, action)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'UPDATE')`,
      [paymentId, current.student_id, current.route_name, fare, amountPaid, method, reference, status, paymentDate, recordedBy]
    );

    // Keep the legacy transport_tickets board in sync.
    await client.query(
      `UPDATE transport_tickets
       SET payment_status = $1, amount_paid = $2,
           paid_at = CASE WHEN $1 = 'Unpaid' THEN NULL ELSE COALESCE(paid_at, CURRENT_TIMESTAMP) END,
           updated_by = $3, updated_at = CURRENT_TIMESTAMP
       WHERE student_id = $4`,
      [status, amountPaid, recordedBy, current.student_id]
    );

    await client.query('COMMIT');
    const row = updated.rows[0];
    res.json({
      success: true,
      payment: {
        payment_id: row.id,
        student_id: row.student_id,
        route: row.route_name,
        fare_amount: fareMoney(row.fare_amount),
        amount_paid: fareMoney(row.amount_paid),
        balance: fareMoney(Math.max(fareMoney(row.fare_amount) - fareMoney(row.amount_paid), 0)),
        payment_status: row.payment_status,
        payment_method: row.payment_method,
        reference_no: row.reference_no,
        payment_date: row.payment_date,
        recorded_by: row.recorded_by,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    console.error('TRANSPORT_PAYMENT_UPDATE_ERROR:', err);
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/transport/payments?route= — ticket payment board incl. Parent Pick-Up.
router.get('/payments', async (req, res, next) => {
  try {
    await ensureFareTables();
    const route = isAllowedRoute(req.query.route) ? req.query.route : null;
    const result = await pool.query(
      `SELECT p.id AS payment_id, p.student_id, s.name AS student_name, s.reg_number,
              s.class AS class_name, p.route_name AS route, p.fare_amount, p.amount_paid,
              (GREATEST(p.fare_amount - p.amount_paid, 0))::NUMERIC AS balance,
              p.payment_status, p.payment_method, p.reference_no, p.payment_date,
              p.recorded_by, p.updated_at
       FROM student_transport_payments p
       JOIN students s ON s.id = p.student_id
       WHERE ($1::TEXT IS NULL OR p.route_name = $1)
       ORDER BY p.route_name ASC, s.name ASC`,
      [route]
    );
    const payments = result.rows.map((r) => ({
      ...r,
      fare_amount: fareMoney(r.fare_amount),
      amount_paid: fareMoney(r.amount_paid),
      balance: fareMoney(r.balance),
    }));
    res.json({ success: true, data: payments, count: payments.length });
  } catch (err) {
    console.error('TRANSPORT_PAYMENTS_LIST_ERROR:', err);
    next(err);
  }
});
