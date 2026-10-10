-- ================================================
-- SCHOOL FEES MANAGEMENT TABLES
-- ================================================
-- This script creates the fees_ledger and fees_payments tables
-- to manage student fee payments and balances.

-- ================================================
-- CREATE fees_ledger TABLE
-- ================================================
-- Tracks the overall fee balance per student
CREATE TABLE IF NOT EXISTS fees_ledger (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL UNIQUE,
    total_required DECIMAL(10, 2) DEFAULT 0.00,
    total_paid DECIMAL(10, 2) DEFAULT 0.00,
    balance DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIALLY_PAID', 'COMPLETED')),
    last_payment_date TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ================================================
-- CREATE fees_payments TABLE
-- ================================================
-- Records each individual payment transaction
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

-- ================================================
-- CREATE INDEXES FOR PERFORMANCE
-- ================================================
CREATE INDEX IF NOT EXISTS idx_fees_ledger_student ON fees_ledger (student_id);
CREATE INDEX IF NOT EXISTS idx_fees_ledger_status ON fees_ledger (status);
CREATE INDEX IF NOT EXISTS idx_fees_payments_student ON fees_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_fees_payments_date ON fees_payments (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_fees_payments_receipt ON fees_payments (receipt_no);

-- ================================================
-- SUCCESS MESSAGE
-- ================================================
-- Tables created successfully!
-- Run this from: psql -U postgres -d smart_school < database/04_fees_setup.sql
