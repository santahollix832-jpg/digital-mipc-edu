const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
});

const isProductionDatabase = Boolean(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'smart_school'}`,
  ssl: isProductionDatabase ? { rejectUnauthorized: false } : false,
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
