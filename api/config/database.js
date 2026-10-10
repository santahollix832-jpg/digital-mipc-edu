const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
});

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME     || 'smart_school',
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis:       30000,
  max:                     10,
});

// Catch pool-level errors (e.g. DB goes down) so they never crash the process
pool.on('error', (err) => {
  console.error('✗ Unexpected PostgreSQL pool error:', err.message);
});

pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('✗ PostgreSQL connection failed:', err.message);
  } else {
    console.log('✓ PostgreSQL connected successfully!');
  }
});

module.exports = pool;
