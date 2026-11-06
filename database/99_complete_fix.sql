-- ============================================================
-- 99_complete_fix.sql — Comprehensive idempotent schema fix
-- Digital MIPC EDU · safe to run repeatedly (additive only).
--
-- Guarantees:
--   1. All required tables exist (users, students, attendance,
--      permissions, sms_logs, announcements, discipline, transport…).
--   2. Missing columns are added with ADD COLUMN IF NOT EXISTS.
--   3. Foreign-key/constraint mismatches are repaired additively.
--   4. Every table the APIs read exists, so endpoints return
--      clean empty arrays/objects instead of 500 errors.
-- ============================================================

-- ------------------------------------------------------------
-- SECTION 0 · Extensions & core identity tables
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Relax the legacy role CHECK so MATRON/DOD/SECURITY accounts can exist.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('ADMIN', 'PATRON', 'MATRON', 'DOD', 'BURSAR', 'TEACHER', 'SECURITY'));

CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- ------------------------------------------------------------
-- SECTION 1 · Students & attendance
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    reg_number VARCHAR(50) UNIQUE,
    class VARCHAR(100) NOT NULL DEFAULT 'Unassigned',
    gender VARCHAR(10) NOT NULL DEFAULT 'Unknown',
    photo_url TEXT DEFAULT 'default.png'
);
-- Column repairs (any install missing these gets them additively).
ALTER TABLE students ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url VARCHAR(255) DEFAULT 'default.png';
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_email VARCHAR(254);
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(30);
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS preferred_route VARCHAR(80) NOT NULL DEFAULT 'Parent Pick-Up';
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS smart_cards (
    id SERIAL PRIMARY KEY,
    card_uid VARCHAR(50) UNIQUE NOT NULL,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_logs (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    card_uid VARCHAR(50),
    check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMP;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS check_in_method VARCHAR(20) DEFAULT 'card';
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'present';
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS device_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_attendance_today ON attendance_logs (check_in_time);

-- ------------------------------------------------------------
-- SECTION 2 · Permissions (gate passes) + SMS linkage
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    reason TEXT NOT NULL DEFAULT '',
    leave_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Approved',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS departure_time TIMESTAMP;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS return_timestamp TIMESTAMP;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS expected_return_time TIMESTAMP;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS actual_return_timestamp TIMESTAMP;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS destination VARCHAR(255);
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS sms_log_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_permissions_status ON permissions (status);
CREATE INDEX IF NOT EXISTS idx_permissions_student ON permissions (student_id);

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id BIGSERIAL PRIMARY KEY,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL,
    channel VARCHAR(10) NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
    recipient VARCHAR(254) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ,
    UNIQUE (permission_id, event_type, channel, recipient)
);

-- ------------------------------------------------------------
-- SECTION 3 · SMS & Notifications Center
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_logs (
    id BIGSERIAL PRIMARY KEY,
    student_id INT,
    recipient_phone VARCHAR(30) NOT NULL DEFAULT '',
    recipient_name VARCHAR(255) NOT NULL DEFAULT '',
    recipient_role VARCHAR(20) NOT NULL DEFAULT 'parent'
        CHECK (recipient_role IN ('parent', 'staff')),
    message_body TEXT NOT NULL DEFAULT '',
    notification_type VARCHAR(20) NOT NULL DEFAULT 'ANNOUNCEMENT'
        CHECK (notification_type IN ('CHECK_IN', 'CHECK_OUT', 'GATE_PASS', 'VISITE_DAY', 'ANNOUNCEMENT')),
    status VARCHAR(20) NOT NULL DEFAULT 'LOGGED_ONLY'
        CHECK (status IN ('SENT', 'FAILED', 'LOGGED_ONLY')),
    provider_response JSONB,
    sent_by VARCHAR(255) NOT NULL DEFAULT 'system',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Legacy-shape repairs for older sms_logs installs.
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS recipient_role VARCHAR(20) NOT NULL DEFAULT 'parent';
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS message_body TEXT NOT NULL DEFAULT '';
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS notification_type VARCHAR(20) NOT NULL DEFAULT 'ANNOUNCEMENT';
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'LOGGED_ONLY';
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS provider_response JSONB;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS sent_by VARCHAR(255) NOT NULL DEFAULT 'system';
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON sms_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_student ON sms_logs (student_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON sms_logs (status);

CREATE TABLE IF NOT EXISTS announcements (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    message_body TEXT NOT NULL DEFAULT '',
    audience VARCHAR(20) NOT NULL DEFAULT 'everyone'
        CHECK (audience IN ('parents', 'staff', 'everyone')),
    dispatch_sms BOOLEAN NOT NULL DEFAULT TRUE,
    sent_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(255) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS message_body TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS dispatch_sms BOOLEAN DEFAULT TRUE;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sent_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255) NOT NULL DEFAULT 'system';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
-- Legacy backfill: only run when the old 'body' column actually exists
-- (fresh installs never had it, and referencing it would abort the migration).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'body') THEN
        UPDATE announcements SET message_body = body WHERE message_body IS NULL AND body IS NOT NULL;
        UPDATE announcements SET body = message_body WHERE body IS DISTINCT FROM message_body;
        ALTER TABLE announcements ALTER COLUMN body DROP NOT NULL;
        ALTER TABLE announcements ALTER COLUMN body SET DEFAULT '';
    END IF;
END $$;
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_audience_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_audience_check
    CHECK (audience IN ('parents', 'staff', 'everyone'));
UPDATE announcements SET audience = 'everyone' WHERE audience = 'all';
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements (created_at DESC);

-- ------------------------------------------------------------
-- SECTION 4 · Discipline module
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discipline_incidents (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    incident_type VARCHAR(255) NOT NULL,
    incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL DEFAULT '',
    reported_by VARCHAR(255) NOT NULL DEFAULT '',
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS severity VARCHAR(20);
ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS incident_time TIME NOT NULL DEFAULT CURRENT_TIME;
ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS action_taken TEXT;
ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE discipline_incidents ALTER COLUMN approval_status SET DEFAULT 'pending';
ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255);
ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE discipline_incidents ADD COLUMN IF NOT EXISTS review_notes TEXT;

CREATE TABLE IF NOT EXISTS corrective_actions (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    incident_id INT,
    action_type VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    assigned_by VARCHAR(255) NOT NULL DEFAULT '',
    due_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE corrective_actions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE corrective_actions ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS merit_demerit_entries (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    incident_id INT,
    entry_type VARCHAR(10) NOT NULL,
    points INT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    awarded_by VARCHAR(255) NOT NULL DEFAULT '',
    awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gate_scans (
    id BIGSERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    scan_value VARCHAR(128) NOT NULL,
    scan_type VARCHAR(10) NOT NULL DEFAULT 'manual',
    gate VARCHAR(100) NOT NULL DEFAULT 'Main Gate',
    direction VARCHAR(3) NOT NULL DEFAULT 'IN',
    scanned_by VARCHAR(255) NOT NULL DEFAULT '',
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discipline_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_by VARCHAR(255) NOT NULL DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gate_overdue_reports (
    id SERIAL PRIMARY KEY,
    permission_id INT,
    student_id INT NOT NULL,
    overdue_seconds INT NOT NULL DEFAULT 0,
    overdue_minutes INT NOT NULL DEFAULT 0,
    points_deducted INT NOT NULL DEFAULT 0,
    report_recipients TEXT NOT NULL DEFAULT '["ADMIN","DOD","PATRON","MATRON"]',
    created_by VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO discipline_settings (setting_key, setting_value, updated_by)
VALUES ('gate_overdue_demerit_points', '"5"', 'system-default')
ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO discipline_settings (setting_key, setting_value, updated_by)
VALUES ('conduit_base_points', '"40"', 'system-default')
ON CONFLICT (setting_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_corrective_actions_student ON corrective_actions (student_id);
CREATE INDEX IF NOT EXISTS idx_merit_demerit_student ON merit_demerit_entries (student_id);
CREATE INDEX IF NOT EXISTS idx_gate_scans_student ON gate_scans (student_id);
CREATE INDEX IF NOT EXISTS idx_gate_overdue_reports_student ON gate_overdue_reports (student_id);

-- ------------------------------------------------------------
-- SECTION 5 · Transport (fleet, tickets, boarding, pick-up)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buses (
    id SERIAL PRIMARY KEY,
    bus_number VARCHAR(20) NOT NULL UNIQUE,
    driver_name VARCHAR(100) NOT NULL,
    route_name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'In Transit',
    speed INT NOT NULL DEFAULT 0,
    capacity INT NOT NULL DEFAULT 50,
    passengers_count INT NOT NULL DEFAULT 0,
    driver_phone VARCHAR(30),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE buses ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(30);
ALTER TABLE buses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_buses_status ON buses(status);

CREATE TABLE IF NOT EXISTS transport_tickets (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    route VARCHAR(80) NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'Unpaid',
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    paid_at TIMESTAMP,
    updated_by VARCHAR(255) NOT NULL DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE transport_tickets ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE transport_tickets ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE transport_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transport_tickets_student ON transport_tickets (student_id);

CREATE TABLE IF NOT EXISTS transport_boarding (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    route VARCHAR(80) NOT NULL,
    boarded BOOLEAN NOT NULL DEFAULT FALSE,
    boarded_at TIMESTAMP,
    boarded_by VARCHAR(255) NOT NULL DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE transport_boarding ADD COLUMN IF NOT EXISTS boarded_by VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE transport_boarding ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transport_boarding_student ON transport_boarding (student_id);

CREATE TABLE IF NOT EXISTS parent_pickup_register (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    parent_name VARCHAR(255) NOT NULL DEFAULT '',
    parent_phone VARCHAR(40) NOT NULL DEFAULT '',
    expected_pickup_at TIMESTAMP,
    picked_up BOOLEAN NOT NULL DEFAULT FALSE,
    picked_up_at TIMESTAMP,
    updated_by VARCHAR(255) NOT NULL DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE parent_pickup_register ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE parent_pickup_register ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_pickup_student ON parent_pickup_register (student_id);

-- ------------------------------------------------------------
-- SECTION 6 · Fees, system settings, logs, smart bell
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fees_ledger (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL UNIQUE,
    total_paid DECIMAL(10,2) DEFAULT 0.00,
    balance DECIMAL(10,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'UNPAID',
    last_payment_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS fees_payments (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    receipt_no VARCHAR(50) UNIQUE,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50) DEFAULT 'Cash',
    recorded_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fees_ledger_student ON fees_ledger (student_id);
CREATE INDEX IF NOT EXISTS idx_fees_payments_student ON fees_payments (student_id);

CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_by INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Legacy-shape healing for pre-existing system_settings tables.
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS updated_by INTEGER;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100),
    detail TEXT,
    actor_username VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bell_schedules (
    id SERIAL PRIMARY KEY,
    time TIME NOT NULL,
    title VARCHAR(150) NOT NULL,
    days VARCHAR(50) NOT NULL DEFAULT 'Mon-Fri',
    tone VARCHAR(50) NOT NULL DEFAULT 'Standard Bell',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bell_logs (
    id SERIAL PRIMARY KEY,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    trigger_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Success',
    user_id INTEGER,
    schedule_id INTEGER,
    note VARCHAR(255)
);
CREATE TABLE IF NOT EXISTS bell_device (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    device_id VARCHAR(50) NOT NULL DEFAULT 'BELL-ESP32-001',
    ip_address VARCHAR(45) NOT NULL DEFAULT '192.168.1.50',
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    last_ping TIMESTAMPTZ,
    uptime_seconds BIGINT NOT NULL DEFAULT 0,
    firmware_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO bell_device (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_bell_logs_triggered_at ON bell_logs(triggered_at DESC);

-- Bus audit trigger shared with the API bootstrap.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_buses_updated_at ON buses;
CREATE TRIGGER trg_buses_updated_at
    BEFORE UPDATE ON buses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- SECTION 7 · Foreign-key repairs (additive, orphan-safe)
-- FKs are only attached after removing orphaned rows so the
-- ALTER never fails on legacy data.
-- ------------------------------------------------------------
DO $$
DECLARE
    fk_def TEXT;
BEGIN
    -- students FK guards
    DELETE FROM attendance_logs WHERE student_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = attendance_logs.student_id);
    DELETE FROM permissions WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = permissions.student_id);
    DELETE FROM discipline_incidents WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = discipline_incidents.student_id);
    DELETE FROM corrective_actions WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = corrective_actions.student_id);
    DELETE FROM merit_demerit_entries WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = merit_demerit_entries.student_id);
    DELETE FROM gate_scans WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = gate_scans.student_id);
    DELETE FROM gate_overdue_reports WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = gate_overdue_reports.student_id);
    DELETE FROM transport_tickets WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = transport_tickets.student_id);
    DELETE FROM transport_boarding WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = transport_boarding.student_id);
    DELETE FROM parent_pickup_register WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = parent_pickup_register.student_id);
    DELETE FROM fees_ledger WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = fees_ledger.student_id);
    DELETE FROM fees_payments WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = fees_payments.student_id);
    DELETE FROM sms_logs WHERE student_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = sms_logs.student_id);

    -- permissions FK guards
    DELETE FROM gate_overdue_reports WHERE permission_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM permissions p WHERE p.id = gate_overdue_reports.permission_id);

    -- discipline cross-refs
    DELETE FROM corrective_actions WHERE incident_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM discipline_incidents d WHERE d.id = corrective_actions.incident_id);
    DELETE FROM merit_demerit_entries WHERE incident_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM discipline_incidents d WHERE d.id = merit_demerit_entries.incident_id);

    -- Attach missing FKs (skip if a constraint of the same name exists).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sms_logs_student') THEN
        ALTER TABLE sms_logs ADD CONSTRAINT fk_sms_logs_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gate_overdue_permission') THEN
        ALTER TABLE gate_overdue_reports ADD CONSTRAINT fk_gate_overdue_permission
            FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gate_overdue_student') THEN
        ALTER TABLE gate_overdue_reports ADD CONSTRAINT fk_gate_overdue_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_discipline_incidents_student') THEN
        ALTER TABLE discipline_incidents ADD CONSTRAINT fk_discipline_incidents_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_corrective_actions_student') THEN
        ALTER TABLE corrective_actions ADD CONSTRAINT fk_corrective_actions_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_corrective_actions_incident') THEN
        ALTER TABLE corrective_actions ADD CONSTRAINT fk_corrective_actions_incident
            FOREIGN KEY (incident_id) REFERENCES discipline_incidents(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_merit_demerit_student') THEN
        ALTER TABLE merit_demerit_entries ADD CONSTRAINT fk_merit_demerit_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_merit_demerit_incident') THEN
        ALTER TABLE merit_demerit_entries ADD CONSTRAINT fk_merit_demerit_incident
            FOREIGN KEY (incident_id) REFERENCES discipline_incidents(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gate_scans_student') THEN
        ALTER TABLE gate_scans ADD CONSTRAINT fk_gate_scans_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transport_tickets_student') THEN
        ALTER TABLE transport_tickets ADD CONSTRAINT fk_transport_tickets_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transport_boarding_student') THEN
        ALTER TABLE transport_boarding ADD CONSTRAINT fk_transport_boarding_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parent_pickup_student') THEN
        ALTER TABLE parent_pickup_register ADD CONSTRAINT fk_parent_pickup_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fees_ledger_student') THEN
        ALTER TABLE fees_ledger ADD CONSTRAINT fk_fees_ledger_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fees_payments_student') THEN
        ALTER TABLE fees_payments ADD CONSTRAINT fk_fees_payments_student
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ------------------------------------------------------------
-- SECTION 8 · Post-migration verification report
-- Confirms every table the API reads actually exists.
-- ------------------------------------------------------------
DO $$
DECLARE
    required TEXT[] := ARRAY[
        'users', 'user_sessions', 'students', 'smart_cards', 'attendance_logs',
        'permissions', 'notification_deliveries', 'sms_logs', 'announcements',
        'discipline_incidents', 'corrective_actions', 'merit_demerit_entries',
        'gate_scans', 'discipline_settings', 'gate_overdue_reports',
        'buses', 'transport_tickets', 'transport_boarding', 'parent_pickup_register',
        'fees_ledger', 'fees_payments', 'system_settings', 'system_logs',
        'bell_schedules', 'bell_logs', 'bell_device'
    ];
    missing TEXT := '';
    t TEXT;
BEGIN
    FOR i IN 1..array_length(required, 1) LOOP
        t := required[i];
        IF to_regclass('public.' || t) IS NULL THEN
            missing := missing || t || ', ';
        END IF;
    END LOOP;
    IF missing <> '' THEN
        RAISE EXCEPTION '99_complete_fix: missing tables after migration: %', missing;
    ELSE
        RAISE NOTICE '99_complete_fix: all % required tables verified present.', array_length(required, 1);
    END IF;
END $$;
