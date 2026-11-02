const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const BUS_STATUSES = ['In Transit', 'Delayed', 'Completed'];

// ==========================================
// 🚌 GET /api/transport/buses — full fleet list (+ real-time stats)
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
// 🚌 GET /api/transport/buses/:id — single bus
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
// 🚌 POST /api/transport/buses — add a new bus / route
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
// 🚌 PUT /api/transport/buses/:id — update bus (status, speed, passengers...)
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
// 🚌 DELETE /api/transport/buses/:id — remove a bus
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
