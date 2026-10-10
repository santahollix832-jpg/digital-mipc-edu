const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
});

async function runReset() {
    try {
        console.log("⏳ 1. Dropping old tables to clear conflicting structures...");
        // Siba amatable ashaje bwa mbere burundu n'inzira zayo zose
        await pool.query('DROP TABLE IF EXISTS attendance CASCADE;');
        await pool.query('DROP TABLE IF EXISTS students CASCADE;');

        console.log("⚙️ 2. Creating fresh 'students' table with proper columns...");
        await pool.query(`
            CREATE TABLE students (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                class VARCHAR(100) NOT NULL,
                reg_number VARCHAR(50) UNIQUE,
                gender VARCHAR(10) NOT NULL,
                photo_url TEXT DEFAULT 'default.png'
            );
        `);

        console.log("⚙️ 3. Creating fresh 'attendance' table...");
        await pool.query(`
            CREATE TABLE attendance (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL,
                date DATE NOT NULL,
                check_in_time TIMESTAMP,
                check_in_method VARCHAR(20)
            );
        `);

        console.log("📥 4. Inserting ASIFIWE Josue and NATETE N. Darlene...");
        const queryText = `
            INSERT INTO students (id, name, class, reg_number, gender, photo_url) VALUES
            (1, 'ASIFIWE Josue', 'L3 NETWORKING & INTERNET TECHNOLOGY B', 'MIPC/2026/001', 'Male', 'default.png'),
            (2, 'NATETE N. Darlene', 'L3 SOFTWARE DEVELOPMENT A', 'MIPC/2026/002', 'Female', 'default.png');
        `;
        await pool.query(queryText);

        console.log("✨ SUCCESS: Database reset complete! Total students is now exactly 2!");
    } catch (err) {
        console.error("❌ Error during database reset:", err);
    } finally {
        await pool.end();
    }
}

runReset();const pool = require('../config/database');