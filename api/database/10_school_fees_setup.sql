-- ============================================================
-- 10 · SCHOOL FEES MANAGEMENT SETUP
-- Digital MIPC EDU — fee structures, student fee accounts,
-- payment history. Access: ADMIN / BURSAR only.
-- Idempotent: safe to re-run on an existing database.
-- ============================================================

-- ------------------------------------------------------------
-- 1. fee_structures — the tuition template per class / year / term
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_structures (
  id BIGSERIAL PRIMARY KEY,
  class_name VARCHAR(100) NOT NULL,
  academic_year VARCHAR(20) NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY'),
  term VARCHAR(30) NOT NULL DEFAULT 'Term 1',
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- A class can only have one active fee per year/term combination.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_structures_unique
  ON fee_structures (class_name, academic_year, term);
CREATE INDEX IF NOT EXISTS idx_fee_structures_class ON fee_structures (class_name);

-- ------------------------------------------------------------
-- 2. student_fee_accounts — the agreed amount per student
--    (structure total minus any negotiated discount)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_fee_accounts (
  id BIGSERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_structure_id BIGINT NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  agreed_amount NUMERIC(12, 2) NOT NULL CHECK (agreed_amount >= 0),
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, fee_structure_id)
);
CREATE INDEX IF NOT EXISTS idx_student_fee_accounts_student ON student_fee_accounts (student_id);
CREATE INDEX IF NOT EXISTS idx_student_fee_accounts_structure ON student_fee_accounts (fee_structure_id);

-- ------------------------------------------------------------
-- 3. fee_payments — immutable payment history
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_payments (
  id BIGSERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount_paid NUMERIC(12, 2) NOT NULL CHECK (amount_paid > 0),
  payment_method VARCHAR(30) NOT NULL DEFAULT 'Cash'
    CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Card')),
  reference_no VARCHAR(100),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by VARCHAR(255) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON fee_payments (payment_date DESC);
