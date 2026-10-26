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

const permissionRequests = [];
let permissionRequestId = 1;

async function ensureDatabaseSchema() {
  await pool.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';");
  await pool.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url VARCHAR(255) DEFAULT 'default.png';");
  await pool.query("ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'present';");
  await pool.query('ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS device_id VARCHAR(50);');
  await pool.query('ALTER TABLE permissions ADD COLUMN IF NOT EXISTS departure_time TIMESTAMP;');
  await pool.query('ALTER TABLE permissions ADD COLUMN IF NOT EXISTS expected_return_time TIMESTAMP;');
  await pool.query('ALTER TABLE permissions ADD COLUMN IF NOT EXISTS actual_return_timestamp TIMESTAMP;');
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

app.get('/api/permissions', requireRoles('ADMIN', 'PATRON', 'TEACHER'), (req, res) => {
  res.json(permissionRequests);
});

app.post('/api/permissions', requireRoles('ADMIN', 'PATRON', 'TEACHER'), (req, res) => {
  try {
    const {
      student_name,
      class_name,
      reason,
      start_date,
      end_date,
      departure_time,
      expected_return_time,
      status,
    } = req.body;

    if (!student_name || !class_name || !reason || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'Please complete all permission fields.' });
    }

    const normalizedDepartureTime = departure_time || start_date;
    const normalizedExpectedReturnTime = expected_return_time || end_date;

    const request = {
      id: permissionRequestId++,
      student_name,
      class_name,
      reason,
      start_date,
      end_date,
      departure_time: normalizedDepartureTime,
      expected_return_time: normalizedExpectedReturnTime,
      status: status || 'Pending',
      created_at: new Date().toISOString(),
    };

    permissionRequests.unshift(request);
    return res.status(201).json({ success: true, permission: request });
  } catch (error) {
    console.error('PERMISSIONS_INMEMORY_CREATE_ERROR:', error);
    return res.status(500).json({ success: false, error: 'Unable to create permission request.' });
  }
});

app.patch('/api/permissions/:id/status', requireRoles('ADMIN', 'PATRON', 'TEACHER'), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const target = permissionRequests.find((request) => String(request.id) === String(id));

  if (!target) {
    return res.status(404).json({ success: false, error: 'Permission request not found.' });
  }

  if (!status || !['Pending', 'Approved', 'Rejected', 'Overdue', 'Returned'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid permission status.' });
  }

  target.status = status;
  return res.json({ success: true, permission: target });
});

// Each management module applies its role policy to every endpoint.
app.use('/api/permissions', requireRoles('ADMIN', 'PATRON', 'TEACHER'), permissionsRouter);

// Connect school fees module route
app.use('/api/fees', requireRoles('ADMIN', 'BURSAR'), feesRouter);

// Connect staff management module route
app.use('/api/staff', requireRoles('ADMIN', 'PATRON'), staffRouter);

// Connect discipline module route
app.use('/api/discipline', requireRoles('ADMIN', 'PATRON'), disciplineRouter);

// Connect attendance module route
app.use('/api/attendance', requireRoles('ADMIN', 'PATRON', 'TEACHER'), attendanceRouter);

// ==========================================
// 🌟 1. STUDENTS MODULE (CRUD)
// ==========================================
app.get('/api/students', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, reg_number, class AS class_name, gender, photo_url, COALESCE(status, 'Active') AS status
       FROM students ORDER BY id DESC;`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('STUDENT_FETCH_ERROR:', err);
    next(err);
  }
});

app.post('/api/students/register', requireRoles('ADMIN', 'PATRON', 'TEACHER'), upload.single('photo'), async (req, res, next) => {
  try {
    const finalName      = req.body.name      || req.body.studentName;
    const finalRegNumber = req.body.reg_number || req.body.reg_no || req.body.regNumber;
    const finalClass     = req.body.class_name || req.body.className || req.body.class;
    const { gender }     = req.body;
    const photo_url      = req.file ? `/uploads/${req.file.filename}` : (req.body.photo_url || 'default.png');

    if (!finalName || !finalRegNumber || !finalClass || !gender) {
      return res.status(400).json({ success: false, error: 'Uzuza amakuru yose! (name, reg_number, class, gender)' });
    }

    const result = await pool.query(
      `INSERT INTO students (name, reg_number, class, gender, photo_url, status)
       VALUES ($1, $2, $3, $4, $5, COALESCE(NULLIF($6, ''), 'Active'))
       RETURNING id, name, reg_number, class AS class_name, gender, photo_url, status;`,
      [finalName, finalRegNumber, finalClass, gender, photo_url, req.body.status || 'Active']
    );
    res.status(201).json({ success: true, student: result.rows[0] });
  } catch (err) {
    console.error('FULL_REGISTER_ERROR:', err);
    next(err);
  }
});

app.put('/api/students/:id', requireRoles('ADMIN', 'PATRON', 'TEACHER'), upload.single('photo'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, reg_number, regNumber, class_name, className, gender, status } = req.body;
    const finalName = name || req.body.studentName;
    const finalRegNumber = reg_number || regNumber || req.body.reg_no;
    const finalClass = class_name || className || req.body.class || req.body.class_name;
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
           photo_url = COALESCE($6, photo_url)
       WHERE id = $7
       RETURNING id, name, reg_number, class AS class_name, gender, photo_url, status;`,
      [finalName, finalRegNumber, finalClass, gender, status || null, nextPhotoUrl, id]
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

app.put('/api/students/:id/transfer', requireRoles('ADMIN', 'PATRON'), async (req, res, next) => {
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

app.post('/api/attendance/scan', requireRoles('ADMIN', 'PATRON', 'TEACHER'), async (req, res, next) => {
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
