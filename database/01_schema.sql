CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'PATRON', 'BURSAR', 'TEACHER')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_username_lowercase CHECK (username = lower(username))
);

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

CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    reg_number VARCHAR(50) UNIQUE,
    class VARCHAR(100) NOT NULL,
    gender VARCHAR(10) NOT NULL,
    photo_url TEXT DEFAULT 'default.png'
);

CREATE TABLE smart_cards (
    id SERIAL PRIMARY KEY,
    card_uid VARCHAR(50) UNIQUE NOT NULL,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance_logs (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    card_uid VARCHAR(50),
    check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMP NULL,
    check_in_method VARCHAR(20) DEFAULT 'card',
    status VARCHAR(20) DEFAULT 'present',
    device_id VARCHAR(50)
);

CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    leave_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    return_timestamp TIMESTAMP NOT NULL,
    actual_return_timestamp TIMESTAMP NULL,
    status VARCHAR(20) DEFAULT 'Approved',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attendance_today ON attendance_logs (check_in_time);
CREATE INDEX idx_permissions_status ON permissions (status);
CREATE INDEX idx_permissions_student ON permissions (student_id);
-- ================================================
-- SCHOOL FEES MANAGEMENT TABLES
-- ================================================

CREATE TABLE fees_ledger (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL UNIQUE,
    total_paid DECIMAL(10, 2) DEFAULT 0.00,
    balance DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'COMPLETED', 'PARTIAL')),
    last_payment_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE fees_payments (
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

-- ================================================
-- FEES TABLE INDEXES (for better query performance)
-- ================================================
CREATE INDEX idx_fees_ledger_student ON fees_ledger (student_id);
CREATE INDEX idx_fees_ledger_status ON fees_ledger (status);
CREATE INDEX idx_fees_payments_student ON fees_payments (student_id);
CREATE INDEX idx_fees_payments_date ON fees_payments (payment_date DESC);
CREATE INDEX idx_fees_payments_receipt ON fees_payments (receipt_no);
