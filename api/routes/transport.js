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

module.exports = router;
// NOTE: module.exports above intentionally appears twice — this second block
// adds the Musanze Hub advanced endpoints below it (moving it would drop them).
// 🚏 ADVANCED TRANSPORT LOGISTICS (MUSANZE HUB)
//    Boarding registration, Call-Up Queue,
//    Ticketing, Parent Pick-Up register
// ==========================================

const ROUTES = ['Kigali', 'Rubavu', 'Huye', 'Muhanga', 'Parent Pick-Up'];

// Helper: ensure boarding/ticket rows exist for every Boarding student whose
// destination is a real bus route (auto-registration from student profiles).
async function syncBoardingRegistrations() {
  await pool.query(`
    INSERT INTO transport_boarding (student_id, route)
    SELECT s.id, s.preferred_route
    FROM students s
    WHERE s.status = 'Boarding' AND s.preferred_route IN ('Kigali', 'Rubavu', 'Huye', 'Muhanga')
    ON CONFLICT (student_id) DO UPDATE SET route = EXCLUDED.route
      WHERE transport_boarding.route IS DISTINCT FROM EXCLUDED.route;
  `);
  await pool.query(`
    INSERT INTO transport_tickets (student_id, route, payment_status)
    SELECT s.id, s.preferred_route, 'Unpaid'
    FROM students s
    WHERE s.status = 'Boarding' AND s.preferred_route IN ('Kigali', 'Rubavu', 'Huye', 'Muhanga')
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

// GET /api/transport/manifest?route=Kigali â€” grouped call-up list, prioritized by payment
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
        AND s.preferred_route IN ('Kigali', 'Rubavu', 'Huye', 'Muhanga')
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
      WHERE s.status = 'Boarding' AND s.preferred_route IN ('Kigali', 'Rubavu', 'Huye', 'Muhanga')
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

module.exports = router;
