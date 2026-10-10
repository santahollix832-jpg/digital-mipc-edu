const bcrypt = require('bcryptjs');
const pool = require('../config/database');

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_FULL_NAME?.trim();

  if (!username || !password || !fullName) {
    throw new Error('Set ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_FULL_NAME before running this script.');
  }
  if (username.length > 254 || !/^[a-z0-9._@+-]+$/.test(username)) {
    throw new Error('ADMIN_USERNAME must be a valid username or email address.');
  }
  const passwordBytes = Buffer.byteLength(password, 'utf8');
  if (passwordBytes < 12 || passwordBytes > 72) {
    throw new Error('ADMIN_PASSWORD must be at least 12 and at most 72 UTF-8 bytes.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (username) DO NOTHING
     RETURNING id`,
    [username, passwordHash, fullName]
  );

  if (result.rowCount) {
    console.log(`Created admin account "${username}" (user id ${result.rows[0].id}).`);
  } else {
    console.log(`Account "${username}" already exists; no changes were made.`);
  }
}

seedAdmin()
  .catch(err => {
    console.error('Admin seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
