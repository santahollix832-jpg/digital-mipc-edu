require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const required = [
  'users', 'user_sessions', 'students', 'smart_cards', 'attendance_logs',
  'permissions', 'notification_deliveries', 'sms_logs', 'announcements',
  'discipline_incidents', 'corrective_actions', 'merit_demerit_entries',
  'gate_scans', 'discipline_settings', 'gate_overdue_reports',
  'buses', 'transport_tickets', 'transport_boarding', 'parent_pickup_register',
  'fees_ledger', 'fees_payments', 'system_settings', 'system_logs',
  'bell_schedules', 'bell_logs', 'bell_device'
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const existing = new Set(rows.map(r => r.table_name));
  const missing = required.filter(t => !existing.has(t));
  console.log('Existing tables:', [...existing].sort().join(', '));
  if (missing.length) {
    console.error('❌ MISSING:', missing.join(', '));
    process.exitCode = 1;
  } else {
    console.log('✅ All', required.length, 'required tables verified present.');
  }
  // Spot-check key columns the APIs depend on
  const cols = await pool.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name, column_name) IN (
        ('permissions','destination'),
        ('permissions','sms_log_id'),
        ('students','created_at'),
        ('sms_logs','created_at'),
        ('announcements','message_body')
      )`);
  console.log('Key columns verified:', cols.rows.map(r => `${r.table_name}.${r.column_name}`).join(', '));
  await pool.end();
})().catch(e => { console.error(e.message); process.exitCode = 1; });
