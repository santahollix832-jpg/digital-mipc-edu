-- ============================================================
-- 11 · TRANSPORT FARE & TICKET PAYMENT SETUP
-- Digital MIPC EDU — route fare configuration and per-student
-- transport ticket payments.
-- Access: ADMIN / BURSAR manage fares & payments.
-- Idempotent: safe to re-run on an existing database.
-- ============================================================

-- ------------------------------------------------------------
-- 1. transport_routes — the 4 official routes with standard fares
--    (Kigali, Rubavu, Musanze, Parent Pick-Up — default 0 RWF).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transport_routes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  fare_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fare_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed the official routes idempotently; Parent Pick-Up defaults to 0 RWF.
INSERT INTO transport_routes (name, fare_amount) VALUES
  ('Kigali', 0),
  ('Rubavu', 0),
  ('Musanze', 0),
  ('Parent Pick-Up', 0)
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Legacy installs: add fare_amount to transport_routes if the
--    table already existed without it.
-- ------------------------------------------------------------
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS fare_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- 3. student_transport_payments — one live ticket-payment record
--    per student + route, plus an append-only transaction log.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_transport_payments (
  id BIGSERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  route_id INT REFERENCES transport_routes(id) ON DELETE SET NULL,
  route_name VARCHAR(50) NOT NULL,
  fare_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fare_amount >= 0),
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  payment_method VARCHAR(30) NOT NULL DEFAULT 'Cash',
  reference_no VARCHAR(100),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'Unpaid'
    CHECK (payment_status IN ('Fully Paid', 'Partial Payment', 'Unpaid')),
  payment_date DATE,
  recorded_by VARCHAR(255) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, route_name)
);
CREATE INDEX IF NOT EXISTS idx_stp_student ON student_transport_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_stp_route ON student_transport_payments (route_name);

CREATE TABLE IF NOT EXISTS student_transport_payment_log (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES student_transport_payments(id) ON DELETE CASCADE,
  student_id INT NOT NULL,
  route_name VARCHAR(50) NOT NULL,
  fare_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'Cash',
  reference_no VARCHAR(100),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'Unpaid',
  payment_date DATE,
  recorded_by VARCHAR(255) NOT NULL DEFAULT 'system',
  action VARCHAR(10) NOT NULL DEFAULT 'CREATE'
    CHECK (action IN ('CREATE', 'UPDATE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stplog_student ON student_transport_payment_log (student_id);
