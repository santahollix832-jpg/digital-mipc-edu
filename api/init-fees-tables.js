/**
 * ================================================
 * FEES TABLES INITIALIZATION SCRIPT
 * ================================================
 * 
 * This script creates the fees_ledger and fees_payments tables
 * if they don't already exist.
 * 
 * Usage:
 * - Run directly: node api/init-fees-tables.js
 * - Or call initFeesTables() from your app startup
 */

const pool = require('./config/database');

/**
 * Initialize fees management tables
 * Creates fees_ledger and fees_payments if they don't exist
 */
async function initFeesTables() {
  const client = await pool.connect();

  try {
    console.log('⏳ Initializing Fees Management Tables...\n');

    // ================================================
    // CREATE fees_ledger TABLE
    // ================================================
    console.log('📊 Creating fees_ledger table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS fees_ledger (
        id SERIAL PRIMARY KEY,
        student_id INT NOT NULL UNIQUE,
        total_paid DECIMAL(10, 2) DEFAULT 0.00,
        balance DECIMAL(10, 2) DEFAULT 400000.00,
        status VARCHAR(20) DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'COMPLETED', 'PARTIAL')),
        last_payment_date TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      );
    `);
    console.log('✓ fees_ledger table created/verified\n');

    // ================================================
    // CREATE fees_payments TABLE
    // ================================================
    console.log('📋 Creating fees_payments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS fees_payments (
        id SERIAL PRIMARY KEY,
        student_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        receipt_no VARCHAR(50) UNIQUE,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        payment_method VARCHAR(50) DEFAULT 'Cash',
        recorded_by VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      );
    `);
    console.log('✓ fees_payments table created/verified\n');

    // ================================================
    // CREATE INDEXES FOR PERFORMANCE
    // ================================================
    console.log('⚡ Creating performance indexes...');
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fees_ledger_student ON fees_ledger (student_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fees_ledger_status ON fees_ledger (status);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fees_payments_student ON fees_payments (student_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fees_payments_date ON fees_payments (payment_date DESC);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fees_payments_receipt ON fees_payments (receipt_no);`);
      console.log('✓ All indexes created\n');
    } catch (indexErr) {
      console.log('⚠️  Some indexes may already exist or have issues - this is okay\n');
    }

    // ================================================
    // VERIFY TABLES
    // ================================================
    console.log('✅ Verifying table structures...');
    
    const ledgerInfo = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'fees_ledger'
      ORDER BY ordinal_position;
    `);

    const paymentsInfo = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'fees_payments'
      ORDER BY ordinal_position;
    `);

    console.log('\n📊 fees_ledger columns:');
    ledgerInfo.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} ${col.column_default ? `(default: ${col.column_default})` : ''}`);
    });

    console.log('\n📋 fees_payments columns:');
    paymentsInfo.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} ${col.column_default ? `(default: ${col.column_default})` : ''}`);
    });

    console.log('\n✨ ================================================');
    console.log('✨ FEES TABLES INITIALIZED SUCCESSFULLY!');
    console.log('✨ ================================================');
    console.log('\nYou can now use:');
    console.log('  - GET  /api/fees/status/:studentId');
    console.log('  - GET  /api/fees/ledger');
    console.log('  - POST /api/fees/payments\n');

  } catch (err) {
    console.error('❌ Error initializing fees tables:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Main execution
 * Runs if this file is executed directly (not imported)
 */
if (require.main === module) {
  initFeesTables()
    .then(() => {
      console.log('Database initialization complete. Exiting...\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to initialize fees tables:', err);
      process.exit(1);
    });
}

module.exports = initFeesTables;
