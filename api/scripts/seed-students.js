const pool = require('../config/database');

async function seedStudents() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('smart-school-seed-students'))");

    const existingStudents = await client.query('SELECT EXISTS (SELECT 1 FROM students) AS has_students');
    if (existingStudents.rows[0].has_students) {
      await client.query('COMMIT');
      console.log('Students table already contains records; no sample students were inserted.');
      return;
    }

    await client.query(
      `INSERT INTO students (name, reg_number, class, gender, photo_url)
       VALUES ($1, $2, $3, $4, $5)`,
      ['ASIFIWE Josue', 'MIPC/2026/0', 'Unassigned', 'Unknown', 'default.png']
    );

    await client.query('COMMIT');
    console.log('Inserted sample student ASIFIWE Josue (MIPC/2026/0).');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

seedStudents()
  .catch(err => {
    console.error('Student seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
