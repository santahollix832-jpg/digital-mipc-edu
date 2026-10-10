/**
 * ================================================
 * FEES SCHEMA MIGRATION SCRIPT
 * ================================================
 * 
 * This script migrates the fees_ledger table to include
 * the total_required column and update status values.
 * 
 * Usage: node api/migrate-fees-schema.js
 */

const pool = require('./config/database');

async function migrateFeesSchema() {
  const client = await pool.connect();

  try {
    console.log('⏳ Starting Fees Schema Migration...\n');

    // ================================================
    // CHECK IF total_required COLUMN EXISTS
    // ================================================
    console.log('📋 Checking if total_required column exists...');
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='fees_ledger' AND column_name='total_required'
    `);

    if (columnCheck.rows.length === 0) {
      console.log('➕ Adding total_required column to fees_ledger...');
      await client.query(`
        ALTER TABLE fees_ledger 
        ADD COLUMN total_required DECIMAL(10, 2) DEFAULT 0.00
      `);
      console.log('✓ total_required column added\n');
    } else {
      console.log('✓ total_required column already exists\n');
    }

    // ================================================
    // UPDATE STATUS VALUES
    // ================================================
    console.log('🔄 Updating status values...');
    
    // First, drop the old CHECK constraint if it exists
    console.log('  - Removing old status constraint...');
    try {
      await client.query(`
        ALTER TABLE fees_ledger 
        DROP CONSTRAINT fees_ledger_status_check
      `);
      console.log('  ✓ Old constraint removed');
    } catch (err) {
      console.log('  ⚠️  Constraint may not exist, continuing...');
    }

    // Update PARTIAL to PARTIALLY_PAID
    console.log('  - Converting PARTIAL → PARTIALLY_PAID...');
    const updateResult = await client.query(`
      UPDATE fees_ledger 
      SET status = 'PARTIALLY_PAID' 
      WHERE status = 'PARTIAL'
    `);
    console.log(`  ✓ Updated ${updateResult.rowCount} rows`);

    // Add new CHECK constraint with updated values
    console.log('  - Adding new status constraint...');
    await client.query(`
      ALTER TABLE fees_ledger 
      ADD CONSTRAINT fees_ledger_status_check 
      CHECK (status IN ('UNPAID', 'PARTIALLY_PAID', 'COMPLETED'))
    `);
    console.log('  ✓ New constraint added\n');

    // ================================================
    // VERIFY MIGRATION
    // ================================================
    console.log('✅ Verifying migration...');
    const verification = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'fees_ledger'
      ORDER BY ordinal_position
    `);

    console.log('\n📊 Updated fees_ledger structure:');
    verification.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} ${col.column_default ? `(default: ${col.column_default})` : ''}`);
    });

    const statusCheck = await client.query(`
      SELECT DISTINCT status FROM fees_ledger
    `);

    console.log('\n📈 Current status distribution:');
    statusCheck.rows.forEach(row => {
      console.log(`   - ${row.status}`);
    });

    console.log('\n✨ ================================================');
    console.log('✨ FEES SCHEMA MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('✨ ================================================\n');

  } catch (err) {
    console.error('❌ Error during migration:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Run if executed directly
if (require.main === module) {
  migrateFeesSchema()
    .then(() => {
      console.log('Migration complete. Exiting...\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = migrateFeesSchema;
