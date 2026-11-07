const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const BUS_STATUSES = ['In Transit', 'Delayed', 'Completed'];

// ==========================================
// ðŸšŒ GET /api/transport/buses â€” full fleet list (+ real-time stats)
// ==========================================
router.get('/buses', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM buses ORDER BY bus_number ASC;');
    const buses = result.rows;

    const inTransit = buses.filter((b) => b.status === 'In Transit').length;
    const delayed = buses.filter((b) => b.status === 'Delayed').length;
    const completed = buses.filter((b) => b.status === 'Completed').length;
    const passengers = buses.reduce((sum, b) => sum + (b.passengers_count || 0), 0);
    const onTimeRate = buses.length
      ? (((buses.length - delayed) / buses.length) * 100).toFixed(1) + '%'
      : '0%';
    const routes = new Set(buses.map((b) => b.route_name)).size;

    res.json({
      success: true,
      stats: {
        active_buses: inTransit,
        students_in_transit: passengers,
        on_time_rate: onTimeRate,
        routes_covered: `${routes}/${routes}`,
        delayed,
        completed,
        total_buses: buses.length,
      },
      buses,
    });
  } catch (err) {
    console.error('TRANSPORT_BUSES_FETCH_ERROR:', err);
    next(err);
  }
});

// ==========================================
// ðŸšŒ GET /api/transport/buses/:id â€” single bus
// ==========================================
router.get('/buses/:id', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM buses WHERE id = $1;', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Bus not found.' });
    }
    res.json({ success: true, bus: result.rows[0] });
  } catch (err) {
    console.error('TRANSPORT_BUS_FETCH_ERROR:', err);
    next(err);
  }
});

// ==========================================
// ðŸšŒ POST /api/transport/buses â€” add a new bus / route
// ==========================================
router.post('/buses', async (req, res, next) => {
  try {
    const { bus_number, driver_name, route_name, status, speed, capacity, passengers_count, driver_phone } = req.body;

    if (!bus_number || !driver_name || !route_name) {
      return res.status(400).json({
        success: false,
        error: 'bus_number, driver_name and route_name are required.',
      });
    }

    if (!isAllowedRoute(route_name)) {
      return res.status(400).json({
        success: false,
        error: `route_name must be one of: ${ROUTES.join(', ')}.`,
      });
    }

    const finalStatus = BUS_STATUSES.includes(status) ? status : 'In Transit';
    const finalCapacity = parseInt(capacity) > 0 ? parseInt(capacity) : 50;
    const finalPassengers = Math.min(
      Math.max(parseInt(passengers_count) || 0, 0),
      finalCapacity
    );
    const finalSpeed = Math.max(parseInt(speed) || 0, 0);

    const result = await pool.query(
      `INSERT INTO buses (bus_number, driver_name, route_name, status, speed, capacity, passengers_count, driver_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *;`,
      [bus_number.trim(), driver_name.trim(), route_name.trim(), finalStatus, finalSpeed, finalCapacity, finalPassengers, driver_phone || null]
    );
    res.status(201).json({ success: true, bus: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'A bus with this bus_number already exists.' });
    }
    console.error('TRANSPORT_BUS_CREATE_ERROR:', err);
    next(err);
  }
});

// ==========================================
// ðŸšŒ PUT /api/transport/buses/:id â€” update bus (status, speed, passengers...)
// ==========================================
router.put('/buses/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM buses WHERE id = $1;', [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Bus not found.' });
    }
    const bus = existing.rows[0];

    const status = BUS_STATUSES.includes(req.body.status) ? req.body.status : bus.status;
    const speed = req.body.speed !== undefined ? Math.max(parseInt(req.body.speed) || 0, 0) : bus.speed;
    const capacity = req.body.capacity !== undefined
      ? Math.max(parseInt(req.body.capacity) || bus.capacity, 1)
      : bus.capacity;
    const passengers_count = req.body.passengers_count !== undefined
      ? Math.min(Math.max(parseInt(req.body.passengers_count) || 0, 0), capacity)
      : bus.passengers_count;

    const result = await pool.query(
      `UPDATE buses
       SET bus_number = COALESCE(NULLIF($1, ''), bus_number),
           driver_name = COALESCE(NULLIF($2, ''), driver_name),
           route_name = COALESCE(NULLIF($3, ''), route_name),
           status = $4,
           speed = $5,
           capacity = $6,
           passengers_count = $7,
           driver_phone = COALESCE($8, driver_phone)
       WHERE id = $9
       RETURNING *;`,
      [
        req.body.bus_number || '',
        req.body.driver_name || '',
        req.body.route_name || '',
        status,
        speed,
        capacity,
        passengers_count,
        req.body.driver_phone || null,
        id,
      ]
    );
    res.json({ success: true, bus: result.rows[0] });
  } catch (err) {
    console.error('TRANSPORT_BUS_UPDATE_ERROR:', err);
    next(err);
  }
});

// ==========================================
// ðŸšŒ DELETE /api/transport/buses/:id â€” remove a bus
// ==========================================
router.delete('/buses/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM buses WHERE id = $1 RETURNING id;', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Bus not found.' });
    }
    res.json({ success: true, message: 'Bus removed from the fleet.' });
  } catch (err) {
    console.error('TRANSPORT_BUS_DELETE_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 🎫 STUDENT ROUTE ASSIGNMENT & TRANSFER
// GET /api/transport/students?route=&search= — roster grouped for assignment
// PUT /api/transport/students/:id/route      — assign / transfer between routes
// ==========================================
router.get('/students', async (req, res, next) => {
  try {
    const route = isAllowedRoute(req.query.route) ? req.query.route : null;
    const search = (req.query.search || '').trim();
    const params = [];
    if (route) { params.push(route); }
    if (search) { params.push(`%${search}%`); }
    const routeClause = route
      ? 's.preferred_route = $1'
      : "s.preferred_route IN ('Kigali', 'Rubavu', 'Musanze', 'Parent Pick-Up')";
    const searchClause = search
      ? `AND (s.name ILIKE $${params.length} OR s.reg_number ILIKE $${params.length})`
      : '';
    const result = await pool.query(
      `SELECT s.id, s.name, s.reg_number, s.class AS class_name, s.status,
              s.preferred_route AS route, s.guardian_name, s.guardian_phone,
              COALESCE(tb.boarded, FALSE) AS boarded,
              COALESCE(tt.payment_status, 'Unpaid') AS payment_status,
              COALESCE(tt.amount_paid, 0) AS amount_paid
       FROM students s
       LEFT JOIN transport_boarding tb ON tb.student_id = s.id
       LEFT JOIN transport_tickets tt ON tt.student_id = s.id
       WHERE ${routeClause} ${searchClause}
       ORDER BY s.preferred_route ASC, s.name ASC;`,
      params
    );
    const counts = await pool.query(
      `SELECT preferred_route AS route, COUNT(*)::INT AS total
       FROM students
       WHERE preferred_route IN ('Kigali', 'Rubavu', 'Musanze', 'Parent Pick-Up')
       GROUP BY preferred_route;`
    );
    res.json({ success: true, routes: ROUTES, data: result.rows, counts: counts.rows });
  } catch (err) {
    console.error('TRANSPORT_STUDENTS_ERROR:', err);
    next(err);
  }
});

router.put('/students/:id/route', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const studentId = Number(req.params.id);
    const newRoute = String(req.body?.route || '').trim();
    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, error: 'A valid student id is required.' });
    }
    if (!isAllowedRoute(newRoute)) {
      return res.status(400).json({
        success: false,
        error: `route must be one of: ${ROUTES.join(', ')}.`,
      });
    }
    await client.query('BEGIN');
    const studentRes = await client.query('SELECT * FROM students WHERE id = $1 FOR UPDATE;', [studentId]);
    if (!studentRes.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }
    const student = studentRes.rows[0];
    const previousRoute = student.preferred_route;
    if (previousRoute === newRoute) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: `Student is already assigned to ${newRoute}.` });
    }

    await client.query('UPDATE students SET preferred_route = $1 WHERE id = $2;', [newRoute, studentId]);

    if (newRoute === 'Parent Pick-Up') {
      // Moving to Parent Pick-Up: register for guardian collection, drop bus tickets.
      await client.query(
        `INSERT INTO parent_pickup_register (student_id, parent_name, parent_phone)
         VALUES ($1, COALESCE(NULLIF($2, ''), $3), COALESCE($4, ''))
         ON CONFLICT (student_id) DO UPDATE
           SET parent_name = COALESCE(NULLIF(EXCLUDED.parent_name, ''), parent_pickup_register.parent_name),
               parent_phone = COALESCE(EXCLUDED.parent_phone, parent_pickup_register.parent_phone);`,
        [studentId, student.guardian_name || '', student.guardian_email || '', student.guardian_phone]
      );
      await client.query('DELETE FROM transport_boarding WHERE student_id = $1;', [studentId]);
      await client.query('DELETE FROM transport_tickets WHERE student_id = $1;', [studentId]);
    } else {
      // Bus route: keep boarding + ticket rows in sync with the new route.
      await client.query(
        `INSERT INTO transport_boarding (student_id, route, boarded, boarded_at, boarded_by)
         VALUES ($1, $2, FALSE, NULL, '')
         ON CONFLICT (student_id) DO UPDATE
           SET route = EXCLUDED.route,
               boarded = FALSE,
               boarded_at = NULL,
               boarded_by = '',
               updated_at = CURRENT_TIMESTAMP;`,
        [studentId, newRoute]
      );
      await client.query(
        `INSERT INTO transport_tickets (student_id, route, payment_status)
         VALUES ($1, $2, 'Unpaid')
         ON CONFLICT (student_id) DO UPDATE SET route = EXCLUDED.route, updated_at = CURRENT_TIMESTAMP;`,
        [studentId, newRoute]
      );
      await client.query('DELETE FROM parent_pickup_register WHERE student_id = $1;', [studentId]);
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `${student.name} transferred from ${previousRoute} to ${newRoute}.`,
      transfer: { student_id: studentId, student_name: student.name, from: previousRoute, to: newRoute },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('TRANSPORT_ROUTE_TRANSFER_ERROR:', err);
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
// NOTE: module.exports above intentionally appears twice — this second block
// adds the Musanze Hub advanced endpoints below it (moving it would drop them).
// 🚏 ADVANCED TRANSPORT LOGISTICS (MUSANZE HUB)
//    Boarding registration, Call-Up Queue,
//    Ticketing, Parent Pick-Up register
// ==========================================

// Allowed transport routes (locked down): the three official travel hubs
// plus the Parent Pick-Up register for day students collected by guardians.
const ROUTES = ['Kigali', 'Rubavu', 'Musanze', 'Parent Pick-Up'];
const SQL_ROUTES = ['Kigali', 'Rubavu', 'Musanze'];

function isAllowedRoute(route) {
  return ROUTES.includes(route);
}

// Helper: ensure boarding/ticket rows exist for every Boarding student whose
// destination is a real bus route (auto-registration from student profiles).
async function syncBoardingRegistrations() {
  await pool.query(`
    INSERT INTO transport_boarding (student_id, route)
    SELECT s.id, s.preferred_route
    FROM students s
    WHERE s.status = 'Boarding' AND s.preferred_route IN ('Kigali', 'Rubavu', 'Musanze')
    ON CONFLICT (student_id) DO UPDATE SET route = EXCLUDED.route
      WHERE transport_boarding.route IS DISTINCT FROM EXCLUDED.route;
  `);
  await pool.query(`
    INSERT INTO transport_tickets (student_id, route, payment_status)
    SELECT s.id, s.preferred_route, 'Unpaid'
    FROM students s
    WHERE s.status = 'Boarding' AND s.preferred_route IN ('Kigali', 'Rubavu', 'Musanze')
    ON CONFLICT (student_id) DO UPDATE SET route = EXCLUDED.route
      WHERE transport_tickets.route IS DISTINCT FROM EXCLUDED.route;
  `);
  // Parent Pick-Up register mirrors profiles saved with the Parent Pick-Up destination.
  await pool.query(`
    INSERT INTO parent_pickup_register (student_id, parent_name, parent_phone)
    SELECT s.id,
           COALESCE(NULLIF(s.guardian_name, ''), s.guardian_email),
           COALESCE(s.guardian_phone, '')
    FROM students s
    WHERE s.preferred_route = 'Parent Pick-Up'
    ON CONFLICT (student_id) DO NOTHING;
  `);
  await pool.query(`
    DELETE FROM parent_pickup_register r
    USING students s
    WHERE r.student_id = s.id AND s.preferred_route != 'Parent Pick-Up';
  `);
}

// NOTE: module.exports is declared at the END of this file, AFTER the Musanze Hub
// routes below — moving it up would silently drop those endpoints.

// GET /api/transport/manifest?route=Kigali — grouped call-up list, prioritized by payment
router.get('/manifest', async (req, res, next) => {
  try {
    await syncBoardingRegistrations();
    const route = ROUTES.includes(req.query.route) ? req.query.route : null;
    const result = await pool.query(`
      SELECT s.id AS student_id, s.name AS student_name, s.class AS class_name,
             s.reg_number, s.preferred_route AS route,
             COALESCE(tb.boarded, FALSE) AS boarded,
             tb.boarded_at, tb.boarded_by,
             COALESCE(tt.payment_status, 'Unpaid') AS payment_status,
             COALESCE(tt.amount_paid, 0) AS amount_paid,
             LEAST(EXTRACT(EPOCH FROM (COALESCE(tt.paid_at, '2999-12-31'::TIMESTAMP) - NOW()))::INT, 0) * -1 AS seconds_since_payment
      FROM students s
      LEFT JOIN transport_boarding tb ON tb.student_id = s.id
      LEFT JOIN transport_tickets tt ON tt.student_id = s.id
      WHERE s.status = 'Boarding'
        AND s.preferred_route IN ('Kigali', 'Rubavu', 'Musanze')
        AND ($1::TEXT IS NULL OR s.preferred_route = $1)
      ORDER BY
        CASE COALESCE(tt.payment_status, 'Unpaid')
          WHEN 'Fully Paid' THEN 0
          WHEN 'Partial Payment' THEN 1
          ELSE 2
        END ASC,
        COALESCE(tt.paid_at, '2999-12-31'::TIMESTAMP) ASC,
        s.name ASC;
    `, [route]);
    res.json({ success: true, routes: ROUTES.filter((r) => r !== 'Parent Pick-Up'), data: result.rows });
  } catch (err) {
    console.error('TRANSPORT_MANIFEST_ERROR:', err);
    next(err);
  }
});

// PUT /api/transport/manifest/:studentId/board â€” check a student off as "Boarded"
router.put('/manifest/:studentId/board', async (req, res, next) => {
  try {
    const studentId = Number(req.params.studentId);
    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, error: 'A valid student id is required.' });
    }
    const result = await pool.query(`
      UPDATE transport_boarding
      SET boarded = NOT COALESCE(boarded, FALSE),
          boarded_at = CASE WHEN NOT COALESCE(boarded, FALSE) THEN CURRENT_TIMESTAMP ELSE NULL END,
          boarded_by = CASE WHEN NOT COALESCE(boarded, FALSE) THEN $2 ELSE '' END,
          updated_at = CURRENT_TIMESTAMP
      WHERE student_id = $1
      RETURNING student_id, route, boarded, boarded_at;
    `, [studentId, req.user?.full_name || '']);
    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'No boarding registration found for this student.' });
    }
    res.json({ success: true, boarding: result.rows[0] });
  } catch (err) {
    console.error('TRANSPORT_BOARD_TOGGLE_ERROR:', err);
    next(err);
  }
});

// GET /api/transport/tickets â€” ticketing board (all boarding students)
router.get('/tickets', async (req, res, next) => {
  try {
    await syncBoardingRegistrations();
    const result = await pool.query(`
      SELECT s.id AS student_id, s.name AS student_name, s.class AS class_name,
             s.reg_number, s.preferred_route AS route,
             COALESCE(tt.payment_status, 'Unpaid') AS payment_status,
             COALESCE(tt.amount_paid, 0) AS amount_paid,
             tt.paid_at, tt.updated_by
      FROM students s
      LEFT JOIN transport_tickets tt ON tt.student_id = s.id
      WHERE s.status = 'Boarding' AND s.preferred_route IN ('Kigali', 'Rubavu', 'Musanze')
      ORDER BY s.preferred_route ASC, s.name ASC;
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('TRANSPORT_TICKETS_ERROR:', err);
    next(err);
  }
});

// PUT /api/transport/tickets/:studentId â€” update payment status (interactive toggle)
router.put('/tickets/:studentId', async (req, res, next) => {
  try {
    const studentId = Number(req.params.studentId);
    const status = String(req.body?.payment_status || '').trim();
    const amount = Number(req.body?.amount_paid);
    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, error: 'A valid student id is required.' });
    }
    if (!['Fully Paid', 'Partial Payment', 'Unpaid'].includes(status)) {
      return res.status(400).json({ success: false, error: 'payment_status must be Fully Paid, Partial Payment or Unpaid.' });
    }
    const routeLookup = await pool.query('SELECT preferred_route AS route FROM students WHERE id = $1;', [studentId]);
    if (!routeLookup.rowCount) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }
    const result = await pool.query(`
      INSERT INTO transport_tickets (student_id, route, payment_status, amount_paid, paid_at, updated_by)
      VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'Unpaid' THEN NULL ELSE CURRENT_TIMESTAMP END, $5)
      ON CONFLICT (student_id) DO UPDATE
        SET payment_status = EXCLUDED.payment_status,
            amount_paid = EXCLUDED.amount_paid,
            paid_at = EXCLUDED.paid_at,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `, [studentId, routeLookup.rows[0].route, status, Number.isFinite(amount) && amount >= 0 ? amount : 0, req.user?.full_name || '']);
    res.json({ success: true, ticket: result.rows[0] });
  } catch (err) {
    console.error('TRANSPORT_TICKET_UPDATE_ERROR:', err);
    next(err);
  }
});

// GET /api/transport/parent-pickup â€” Abacyurwa n'Ababyeyi register
router.get('/parent-pickup', async (req, res, next) => {
  try {
    await syncBoardingRegistrations();
    const result = await pool.query(`
      SELECT r.id, r.student_id, s.name AS student_name, s.class AS class_name,
             s.reg_number, r.parent_name, r.parent_phone,
             TO_CHAR(r.expected_pickup_at, 'YYYY-MM-DD"T"HH24:MI') AS expected_pickup_at,
             r.picked_up, r.picked_up_at
      FROM parent_pickup_register r
      JOIN students s ON s.id = r.student_id
      ORDER BY r.picked_up ASC, r.expected_pickup_at ASC NULLS LAST, s.name ASC;
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('TRANSPORT_PARENT_PICKUP_ERROR:', err);
    next(err);
  }
});

// PUT /api/transport/parent-pickup/:studentId â€” update register entry
router.put('/parent-pickup/:studentId', async (req, res, next) => {
  try {
    const studentId = Number(req.params.studentId);
    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, error: 'A valid student id is required.' });
    }
    const body = req.body || {};
    const parentName = typeof body.parent_name === 'string' ? body.parent_name.trim() : undefined;
    const parentPhone = typeof body.parent_phone === 'string' ? body.parent_phone.trim() : undefined;
    const expected = body.expected_pickup_at || null;
    const markPicked = body.picked_up;

    await syncBoardingRegistrations();
    const result = await pool.query(`
      UPDATE parent_pickup_register
      SET parent_name = COALESCE(NULLIF($2, ''), parent_name),
          parent_phone = COALESCE(NULLIF($3, ''), parent_phone),
          expected_pickup_at = COALESCE($4::TIMESTAMP, expected_pickup_at),
          picked_up = CASE WHEN $5::BOOLEAN IS NULL THEN picked_up ELSE $5::BOOLEAN END,
          picked_up_at = CASE WHEN $5::BOOLEAN THEN CURRENT_TIMESTAMP WHEN $5::BOOLEAN IS FALSE THEN NULL ELSE picked_up_at END,
          updated_by = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE student_id = $1
      RETURNING *;
    `, [studentId, parentName || '', parentPhone || '', expected, markPicked === undefined ? null : Boolean(markPicked), req.user?.full_name || '']);
    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'No parent pick-up entry found for this student.' });
    }
    res.json({ success: true, entry: result.rows[0] });
  } catch (err) {
    console.error('TRANSPORT_PARENT_PICKUP_UPDATE_ERROR:', err);
    next(err);
  }
});

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
      ('Kigali', 5000), ('Rubavu', 8000), ('Musanze', 6000), ('Parent Pick-Up', 0)
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

// GET /api/transport/payments — ticket payment board incl. Parent Pick-Up.
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

module.exports = router;
