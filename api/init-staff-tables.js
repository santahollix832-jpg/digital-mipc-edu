#!/usr/bin/env node
/**
 * ================================================
 * STAFF MODULE - DATABASE INITIALIZATION SCRIPT
 * ================================================
 * Initialize staff and staff_attendance tables
 * Usage: node api/init-staff-tables.js
 */

const pool = require('./config/database');

async function initStaffTables() {
    try {
        console.log('🔄 Initializing Staff Management tables...');

        // Create staff table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS staff (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(20),
                role VARCHAR(50) NOT NULL CHECK (role IN ('TEACHER', 'BURSAR', 'ADMIN', 'SECURITY')),
                nfc_card_id VARCHAR(255) UNIQUE,
                status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')) DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Staff table created/verified');

        // Create staff_attendance table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS staff_attendance (
                id SERIAL PRIMARY KEY,
                staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                check_in TIMESTAMP,
                check_out TIMESTAMP,
                date DATE NOT NULL DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Staff Attendance table created/verified');

        // Create indexes with error handling
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_staff_email ON staff(email)',
            'CREATE INDEX IF NOT EXISTS idx_staff_nfc_card_id ON staff(nfc_card_id)',
            'CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status)',
            'CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_id ON staff_attendance(staff_id)',
            'CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(date)',
            'CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_date ON staff_attendance(staff_id, date)'
        ];

        for (const indexQuery of indexes) {
            try {
                await pool.query(indexQuery);
            } catch (err) {
                // Index might already exist, continue
                console.log(`⚠️  Index creation note: ${err.message.split('\n')[0]}`);
            }
        }

        console.log('✅ All indexes created/verified');
        console.log('✨ Staff module initialization complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Initialization error:', err.message);
        process.exit(1);
    }
}

initStaffTables();
