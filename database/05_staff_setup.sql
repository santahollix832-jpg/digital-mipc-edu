-- ================================================
-- STAFF MANAGEMENT MODULE - DATABASE SCHEMA
-- ================================================
-- Production-ready tables for staff management,
-- attendance tracking, and NFC card scanning integration

-- ================================================
-- 1. STAFF TABLE
-- ================================================
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

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff(email);
CREATE INDEX IF NOT EXISTS idx_staff_nfc_card_id ON staff(nfc_card_id);
CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status);

-- ================================================
-- 2. STAFF ATTENDANCE TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS staff_attendance (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    check_in TIMESTAMP,
    check_out TIMESTAMP,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_id ON staff_attendance(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_date ON staff_attendance(staff_id, date);

-- ================================================
-- SAMPLE DATA (Optional - for testing)
-- ================================================
INSERT INTO staff (name, email, phone, role, nfc_card_id, status)
VALUES
    ('Uwambaye Nzisabira', 'uwambaye@smartschool.rw', '+250788123456', 'TEACHER', 'NFC001', 'ACTIVE'),
    ('Nyiraneza Claude', 'nyiraneza@smartschool.rw', '+250788234567', 'BURSAR', 'NFC002', 'ACTIVE'),
    ('Inyange Dusabimana', 'inyange@smartschool.rw', '+250788345678', 'ADMIN', 'NFC003', 'ACTIVE'),
    ('Kamali Security', 'kamali@smartschool.rw', '+250788456789', 'SECURITY', 'NFC004', 'ACTIVE')
ON CONFLICT (email) DO NOTHING;
