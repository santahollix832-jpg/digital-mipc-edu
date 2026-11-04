-- Discipline Module Database Setup
-- Run this against your PostgreSQL database: psql -U postgres -d smart_school -f database/09_discipline_setup.sql

-- 1. Discipline Incidents Table
CREATE TABLE IF NOT EXISTS discipline_incidents (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    incident_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('Low', 'Medium', 'High')),
    incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
    incident_time TIME NOT NULL DEFAULT CURRENT_TIME,
    location VARCHAR(255),
    description TEXT NOT NULL,
    reported_by VARCHAR(150) NOT NULL,
    action_taken TEXT,
    approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    status VARCHAR(50) DEFAULT 'Pending',
    reviewed_by VARCHAR(150),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Merit/Demerit (Conduit) Ledger
CREATE TABLE IF NOT EXISTS merit_demerit_entries (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('merit', 'demerit')),
    points INT NOT NULL,
    reason TEXT NOT NULL,
    awarded_by VARCHAR(150) NOT NULL,
    incident_id INT REFERENCES discipline_incidents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Discipline Settings Table
CREATE TABLE IF NOT EXISTS discipline_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Seed Default Settings
INSERT INTO discipline_settings (setting_key, setting_value) VALUES
('demerit_default_points', '5'),
('merit_positive_points', '10'),
('conduit_base_points', '40'),
('suspension_threshold', '20'),
('counseling_threshold', '10'),
('auto_suspension_enabled', 'false'),
('auto_parent_notification', 'true'),
('categories', '["Academic Misconduct", "Behavioral Issue", "Dress Code Violation", "Chronic Tardiness", "Property Damage", "Bullying / Harassment"]'),
('rule_point_deductions', '{"Academic Misconduct": 10, "Behavioral Issue": 5, "Dress Code Violation": 3, "Chronic Tardiness": 2, "Property Damage": 15, "Bullying / Harassment": 20}')
ON CONFLICT (setting_key) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_discipline_student ON discipline_incidents(student_id);
CREATE INDEX IF NOT EXISTS idx_discipline_approval ON discipline_incidents(approval_status);
CREATE INDEX IF NOT EXISTS idx_merit_student ON merit_demerit_entries(student_id);
