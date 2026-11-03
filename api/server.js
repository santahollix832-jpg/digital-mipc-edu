const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const permissionsRouter = require('./routes/permissions');
const feesRouter = require('./routes/fees');
const staffRouter = require('./routes/staff');
const disciplineRouter = require('./routes/discipline');
const attendanceRouter = require('./routes/attendance');
const transportRouter = require('./routes/transport');
const bellRouter = require('./routes/bell');
const authRouter = require('./routes/auth');
const pool = require('./config/database');
const { authenticateRequest, requireRoles } = require('./middleware/auth');
const requireTrustedOrigin = require('./middleware/trusted-origin');

const app = express();
const port = Number(process.env.PORT) || 5000;

// ==========================================
// 📁 AUTOMATIC DIRECTORY CONFIGURATION
// ==========================================
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// ==========================================
// 🗄️ MIDDLEWARES
// ==========================================
const allowedOrigins = [
  'https://digital-mipc-edu.vercel.app',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://localhost:5174',
  ...(process.env.CLIENT_ORIGIN || '').split(','),
]
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    return callback(null, !origin || allowedOrigins.includes(origin));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', requireTrustedOrigin(allowedOrigins));

// Guha umuyoboro amafayili ya static
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadsDir));

// ==========================================
// 📸 FILE UPLOAD CONFIGURATION (MULTER)
// ==========================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadsDir); },
  filename: (req, file, cb) => { 
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)); 
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) return cb(null, true);
  cb(new Error('Amafoto gusa niyo amewe!'), false);
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

async function ensureDatabaseSchema() {
  // Relax the users.role constraint so MATRON / DOD / SECURITY accounts can exist.
  await pool.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('ADMIN', 'PATRON', 'MATRON', 'DOD', 'BURSAR', 'TEACHER', 'SECURITY'));
  `);
  await pool.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';");
  await pool.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url VARCHAR(255) DEFAULT 'default.png';");
  await pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_email VARCHAR(254);');
  await pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(30);');
  await pool.query("ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'present';");
  await pool.query('ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS device_id VARCHAR(50);');
  await pool.query('ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMP;');
  await pool.query('ALTER TABLE permissions ADD COLUMN IF NOT EXISTS departure_time TIMESTAMP;');
  await pool.query('ALTER TABLE permissions ADD COLUMN IF NOT EXISTS expected_return_time TIMESTAMP;');
  await pool.query('ALTER TABLE permissions ADD COLUMN IF NOT EXISTS actual_return_timestamp TIMESTAMP;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id BIGSERIAL PRIMARY KEY,
      permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
      event_type VARCHAR(30) NOT NULL,
      channel VARCHAR(10) NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
      recipient VARCHAR(254) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TIMESTAMPTZ,
      UNIQUE (permission_id, event_type, channel, recipient)
    );
  `);
  await pool.query(`
    ALTER TABLE notification_deliveries
      DROP CONSTRAINT IF EXISTS notification_deliveries_channel_check;
    ALTER TABLE notification_deliveries
      ADD CONSTRAINT notification_deliveries_channel_check
      CHECK (channel IN ('email', 'sms', 'whatsapp'));
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discipline_incidents (
      id SERIAL PRIMARY KEY,
      student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      incident_type VARCHAR(255) NOT NULL,
      severity VARCHAR(20) CHECK (severity IN ('Low', 'Medium', 'High')),
      incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
      incident_time TIME NOT NULL DEFAULT CURRENT_TIME,
      location VARCHAR(255),
      description TEXT NOT NULL,
      reported_by VARCHAR(255) NOT NULL,
      action_taken TEXT,
      status VARCHAR(50) DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'In Progress', 'Resolved', 'Escalated')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query('ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS incident_time TIME NOT NULL DEFAULT CURRENT_TIME;');
  await pool.query('ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS location VARCHAR(255);');
  await pool.query('ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS action_taken TEXT;');
  // Discipline approval workflow: new submissions default to Pending; approval metadata.
  await pool.query("ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Pending';");
  await pool.query("ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'pending';");
  await pool.query("ALTER TABLE discipline_incidents ALTER COLUMN approval_status SET DEFAULT 'pending';");
  await pool.query('ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255);');
  await pool.query('ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;');
  await pool.query('ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS review_notes TEXT;');
  // Discipline sub-modules: corrective actions, merit/demerit ledger, gate scans, rules
  await pool.query(`
    CREATE TABLE IF NOT EXISTS corrective_actions (
      id SERIAL PRIMARY KEY,
      student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      incident_id INT REFERENCES discipline_incidents(id) ON DELETE SET NULL,
      action_type VARCHAR(100) NOT NULL,
      reason TEXT NOT NULL,
      assigned_by VARCHAR(255) NOT NULL DEFAULT '',
      due_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'In Progress', 'Completed')),
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merit_demerit_entries (
      id SERIAL PRIMARY KEY,
      student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      incident_id INT REFERENCES discipline_incidents(id) ON DELETE SET NULL,
      entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('merit', 'demerit')),
      points INT NOT NULL CHECK (points > 0 AND points <= 100),
      reason TEXT NOT NULL,
      awarded_by VARCHAR(255) NOT NULL DEFAULT '',
      awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gate_scans (
      id BIGSERIAL PRIMARY KEY,
      student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      scan_value VARCHAR(128) NOT NULL,
      scan_type VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (scan_type IN ('qr', 'nfc', 'manual')),
      gate VARCHAR(100) NOT NULL DEFAULT 'Main Gate',
      direction VARCHAR(3) NOT NULL DEFAULT 'IN' CHECK (direction IN ('IN', 'OUT')),
      scanned_by VARCHAR(255) NOT NULL DEFAULT '',
      scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discipline_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_by VARCHAR(255) NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_corrective_actions_student ON corrective_actions (student_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_merit_demerit_student ON merit_demerit_entries (student_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_gate_scans_student ON gate_scans (student_id);');

  // Security gate return tracking — formal overdue/late-return infraction reports
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gate_overdue_reports (
      id SERIAL PRIMARY KEY,
      permission_id INT REFERENCES permissions(id) ON DELETE SET NULL,
      student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      overdue_seconds INT NOT NULL DEFAULT 0,
      overdue_minutes INT NOT NULL DEFAULT 0,
      points_deducted INT NOT NULL DEFAULT 0,
      report_recipients TEXT NOT NULL DEFAULT '["ADMIN","DOD","PATRON","MATRON"]',
      created_by VARCHAR(255) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_gate_overdue_reports_student ON gate_overdue_reports (student_id);');
  await pool.query(`
    INSERT INTO discipline_settings (setting_key, setting_value, updated_by)
    VALUES ('gate_overdue_demerit_points', '"5"', 'system-default')
    ON CONFLICT (setting_key) DO NOTHING;
  `);

  // Transport Tracking & IoT Smart Bell modules
  await pool.query(`
    CREATE TABLE IF NOT EXISTS buses (
      id SERIAL PRIMARY KEY,
      bus_number VARCHAR(20) NOT NULL UNIQUE,
      driver_name VARCHAR(100) NOT NULL,
      route_name VARCHAR(150) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'In Transit'
        CHECK (status IN ('In Transit', 'Delayed', 'Completed')),
      speed INT NOT NULL DEFAULT 0 CHECK (speed >= 0),
      capacity INT NOT NULL DEFAULT 50 CHECK (capacity > 0),
      passengers_count INT NOT NULL DEFAULT 0 CHECK (passengers_count >= 0),
      driver_phone VARCHAR(30),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_buses_status ON buses(status);');
  await pool.query(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS trg_buses_updated_at ON buses;
    CREATE TRIGGER trg_buses_updated_at
      BEFORE UPDATE ON buses
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bell_schedules (
      id SERIAL PRIMARY KEY,
      time TIME NOT NULL,
      title VARCHAR(150) NOT NULL,
      days VARCHAR(50) NOT NULL DEFAULT 'Mon-Fri',
      tone VARCHAR(50) NOT NULL DEFAULT 'Standard Bell',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bell_logs (
      id SERIAL PRIMARY KEY,
      triggered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      trigger_type VARCHAR(20) NOT NULL
        CHECK (trigger_type IN ('Automated', 'Manual')),
      status VARCHAR(20) NOT NULL DEFAULT 'Success'
        CHECK (status IN ('Success', 'Failed', 'Cancelled')),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      schedule_id INTEGER REFERENCES bell_schedules(id) ON DELETE SET NULL,
      note VARCHAR(255)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_bell_logs_triggered_at ON bell_logs(triggered_at DESC);');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bell_device (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      device_id VARCHAR(50) NOT NULL DEFAULT 'BELL-ESP32-001',
      ip_address VARCHAR(45) NOT NULL DEFAULT '192.168.1.50',
      is_online BOOLEAN NOT NULL DEFAULT FALSE,
      last_ping TIMESTAMPTZ,
      uptime_seconds BIGINT NOT NULL DEFAULT 0,
      firmware_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    INSERT INTO bell_device (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);
}

let schemaInitializationError = null;
const schemaReady = ensureDatabaseSchema().then(() => true).catch((error) => {
  console.error('DATABASE_SCHEMA_CHECK_ERROR:', error);
  schemaInitializationError = error;
  return false;
});

// ==========================================
// 🌟 CONNECTING ROUTES (IMIHANDA YA API)
// ==========================================

// Authentication routes remain available before the API-wide session requirement.
app.use('/api/auth', authRouter);
app.use('/api', (req, res, next) => {
  schemaReady.then((ready) => {
    if (!ready) return next(schemaInitializationError);
    return next();
  });
});
app.use('/api', authenticateRequest);

// Permissions: ADMIN/PATRON/MATRON/DOD manage permissions; SECURITY gets read-only
// gate access (view active leaves, record returns, report overdue students).
app.use('/api/permissions', requireRoles('ADMIN', 'PATRON', 'MATRON', 'DOD', 'SECURITY'), permissionsRouter);

// Connect school fees module route
app.use('/api/fees', requireRoles('ADMIN', 'BURSAR'), feesRouter);

// Connect staff management module route
app.use('/api/staff', requireRoles('ADMIN', 'PATRON', 'MATRON', 'DOD'), staffRouter);

// Connect discipline module route
// Discipline: PATRON/MATRON can report incidents; DOD/ADMIN manage the approval workflow.
app.use('/api/discipline', requireRoles('ADMIN', 'PATRON', 'MATRON', 'DOD'), disciplineRouter);
// Discipline sub-modules (leave grid uses /api/permissions; these cover actions, points, scans, analytics, settings)
const disciplineModulesRouter = require('./routes/disciplineModules');
app.use('/api/discipline', requireRoles('ADMIN', 'PATRON', 'MATRON', 'DOD'), disciplineModulesRouter);

// Connect attendance module route
app.use('/api/attendance', requireRoles('ADMIN', 'PATRON', 'MATRON', 'DOD'), attendanceRouter);

// School buses remain for ADMIN only (Security no longer tracks transport).
app.use('/api/transport', requireRoles('ADMIN'), transportRouter);

// Connect IoT smart bell module route
app.use('/api/bell', requireRoles('ADMIN'), bellRouter);

// ==========================================
// 🌟 1. STUDENTS MODULE (CRUD)
// ==========================================
app.get('/api/students', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, reg_number, class AS class_name, gender, photo_url, guardian_email, guardian_phone,
              COALESCE(status, 'Active') AS status
       FROM students ORDER BY id DESC;`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('STUDENT_FETCH_ERROR:', err);
    next(err);
  }
});

app.post('/api/students/register', requireRoles('ADMIN', 'PATRON', 'MATRON', 'DOD'), upload.single('photo'), async (req, res, next) => {
  try {
    const finalName      = req.body.name      || req.body.studentName;
    const finalRegNumber = req.body.reg_number || req.body.reg_no || req.body.regNumber;
    const finalClass     = req.body.class_name || req.body.className || req.body.class;
    const { gender }     = req.body;
    const photo_url      = req.file ? `/uploads/${req.file.filename}` : (req.body.photo_url || 'default.png');
    const guardianEmail = typeof req.body.guardian_email === 'string' ? req.body.guardian_email.trim() || null : null;
    const guardianPhone = typeof req.body.guardian_phone === 'string' ? req.body.guardian_phone.trim() || null : null;

    if (!finalName || !finalRegNumber || !finalClass || !gender) {
      return res.status(400).json({ success: false, error: 'Uzuza amakuru yose! (name, reg_number, class, gender)' });
    }

    const result = await pool.query(
      `INSERT INTO students (name, reg_number, class, gender, photo_url, status, guardian_email, guardian_phone)
       VALUES ($1, $2, $3, $4, $5, COALESCE(NULLIF($6, ''), 'Active'), $7, $8)
       RETURNING id, name, reg_number, class AS class_name, gender, photo_url, status, guardian_email, guardian_phone;`,
      [finalName, finalRegNumber, finalClass, gender, photo_url, req.body.status || 'Active', guardianEmail, guardianPhone]
    );
    res.status(201).json({ success: true, student: result.rows[0] });
  } catch (err) {
    console.error('FULL_REGISTER_ERROR:', err);
    next(err);
  }
});

app.put('/api/students/:id', requireRoles('ADMIN', 'PATRON', 'MATRON', 'DOD'), upload.single('photo'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, reg_number, regNumber, class_name, className, gender, status, guardian_email, guardian_phone } = req.body;
    const finalName = name || req.body.studentName;
    const finalRegNumber = reg_number || regNumber || req.body.reg_no;
    const finalClass = class_name || className || req.body.class || req.body.class_name;
    const guardianEmail = typeof guardian_email === 'string' ? guardian_email.trim() || null : null;
    const guardianPhone = typeof guardian_phone === 'string' ? guardian_phone.trim() || null : null;
    const nextPhotoUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.photo_url || null);

    if (!finalName || !finalRegNumber || !finalClass || !gender) {
      return res.status(400).json({ success: false, error: 'Student update requires name, reg_number, class, and gender.' });
    }

    const result = await pool.query(
      `UPDATE students
       SET name = $1,
           reg_number = $2,
           class = $3,
           gender = $4,
           status = COALESCE(NULLIF($5, ''), status),
           photo_url = COALESCE($6, photo_url),
           guardian_email = CASE WHEN $7 THEN $8 ELSE guardian_email END,
           guardian_phone = CASE WHEN $9 THEN $10 ELSE guardian_phone END
       WHERE id = $11
       RETURNING id, name, reg_number, class AS class_name, gender, photo_url, status, guardian_email, guardian_phone;`,
      [
        finalName,
        finalRegNumber,
        finalClass,
        gender,
        status || null,
        nextPhotoUrl,
        guardian_email !== undefined,
        guardianEmail,
        guardian_phone !== undefined,
        guardianPhone,
        id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Student record not found.' });
    }

    res.json({ success: true, student: result.rows[0] });
  } catch (err) {
    console.error('STUDENT_UPDATE_ERROR:', err);
    next(err);
  }
});

app.put('/api/students/:id/transfer', requireRoles('ADMIN', 'PATRON', 'MATRON', 'DOD'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newClass } = req.body;
    await pool.query('UPDATE students SET class = $1 WHERE id = $2;', [newClass, id]);
    res.json({ success: true, message: 'Yimuriwe mu rindi shuri!' });
  } catch (err) {
    console.error('STUDENT_TRANSFER_ERROR:', err);
    next(err);
  }
});

app.delete('/api/students/:id', requireRoles('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM students WHERE id = $1;', [id]);
    res.json({ success: true, message: 'Yasibwe burundu!' });
  } catch (err) {
    console.error('STUDENT_DELETE_ERROR:', err);
    next(err);
  }
});

// ==========================================
// 📊 DASHBOARD TOTALS ENDPOINT
// ==========================================
app.get('/api/dashboard/stats', async (req, res, next) => {
  try {
    const totalStudentsRes = await pool.query('SELECT COUNT(*) FROM students;');
    const totalStudents = parseInt(totalStudentsRes.rows[0].count) || 0;

    const presentRes = await pool.query("SELECT COUNT(DISTINCT student_id) FROM attendance_logs WHERE DATE(check_in_time) = CURRENT_DATE;");
    const present = parseInt(presentRes.rows[0].count) || 0;
    const absent = totalStudents - present;
    const rate = totalStudents > 0 ? ((present / totalStudents) * 100).toFixed(1) : "0.0";

    res.json({
      success: true,
      total_students: totalStudents,
      present_today: present,
      absent_today: absent,
      attendance_rate: rate
    });
  } catch (err) { next(err); }
});

app.get('/api/classes', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT DISTINCT class FROM students WHERE class IS NOT NULL ORDER BY class ASC;');
    res.json(result.rows.map(row => row.class));
  } catch (err) { next(err); }
});

// ==========================================
// 🌟 2. ATTENDANCE & GATE INTEGRATION
// ==========================================
app.get('/api/attendance/today', async (req, res, next) => {
  try {
    const totalRes = await pool.query('SELECT COUNT(*) FROM students;');
    const presentRes = await pool.query("SELECT COUNT(DISTINCT student_id) FROM attendance_logs WHERE DATE(check_in_time) = CURRENT_DATE;");
    const total = parseInt(totalRes.rows[0].count) || 0;
    const present = parseInt(presentRes.rows[0].count) || 0;
    const absent = total - present;
    const rate = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

    const detailsRes = await pool.query(`
      SELECT s.id, s.name, s.class AS class_name, s.photo_url,
             (SELECT check_in_time FROM attendance_logs WHERE student_id = s.id AND DATE(check_in_time) = CURRENT_DATE ORDER BY check_in_time DESC LIMIT 1) as check_in_time,
             CASE WHEN EXISTS (SELECT 1 FROM attendance_logs WHERE student_id = s.id AND DATE(check_in_time) = CURRENT_DATE) THEN 'present' ELSE 'absent' END as status
      FROM students s ORDER BY s.name ASC;
    `);

    res.json({
      success: true,
      statistics: { total_students: total, present, absent, attendance_percentage: rate },
      details: detailsRes.rows
    });
  } catch (err) { next(err); }
});

app.post('/api/attendance/scan', requireRoles('ADMIN', 'PATRON', 'MATRON', 'DOD'), async (req, res, next) => {
  try {
    const { student_id, method } = req.body;
    const parsedStudentId = parseInt(student_id);

    const studentCheck = await pool.query('SELECT id FROM students WHERE id = $1;', [parsedStudentId]);
    if (studentCheck.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Nta munyeshuri ufite iyi ID!' });
    }

    const checkPerm = await pool.query(`SELECT * FROM permissions WHERE student_id = $1 AND status IN ('Approved', 'Overdue') ORDER BY leave_timestamp DESC LIMIT 1;`, [parsedStudentId]);

    let gateMode = "INCOMING (Kwinjira)";
    if (checkPerm.rowCount > 0 && checkPerm.rows[0].status === 'Approved') {
        gateMode = "OUTGOING (Gusohoka Kwemewe)";
    } else if (checkPerm.rowCount > 0 && checkPerm.rows[0].status === 'Overdue') {
        gateMode = "OUTGOING DENIED (Yarengeje igihe!)";
    }

    await pool.query(`INSERT INTO attendance_logs (student_id, check_in_time, check_in_method, status) VALUES ($1, CURRENT_TIMESTAMP, $2, 'present');`, [parsedStudentId, method]);
    res.json({ success: true, gate_mode: gateMode });
  } catch (err) { next(err); }
});

// ==========================================
// 🏠 MAIN PAGE & WILDCARD FALLBACK
// ==========================================
app.get('/', (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({
      success: false,
      error: `Nta 'index.html' twabonye muri public folder!`
    });
  }
});

// Wildcard: only serve index.html for non-API routes (SPA fallback)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ERROR HANDLING — must be last
app.use((err, req, res, next) => {
  console.error('💥 Server Error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

app.listen(port, () => { 
  console.log(`🚀 Backend running on http://localhost:${port}`); 
});
