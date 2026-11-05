-- ============================================================
-- 08_sms_setup.sql — SMS & Notifications tables for Digital MIPC EDU
-- Idempotent: safe to re-run against an existing database.
-- ============================================================

-- ------------------------------------------------------------
-- 1. sms_logs — every SMS attempt (live, failed, or logged-only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_logs (
  id BIGSERIAL PRIMARY KEY,
  student_id INT REFERENCES students(id) ON DELETE SET NULL,
  recipient_phone VARCHAR(30) NOT NULL DEFAULT '',
  recipient_name VARCHAR(255) NOT NULL DEFAULT '',
  recipient_role VARCHAR(20) NOT NULL DEFAULT 'parent'
    CHECK (recipient_role IN ('parent', 'staff')),
  message_body TEXT NOT NULL,
  notification_type VARCHAR(20) NOT NULL DEFAULT 'ANNOUNCEMENT'
    CHECK (notification_type IN ('CHECK_IN', 'CHECK_OUT', 'GATE_PASS', 'VISITE_DAY', 'ANNOUNCEMENT')),
  status VARCHAR(20) NOT NULL DEFAULT 'LOGGED_ONLY'
    CHECK (status IN ('SENT', 'FAILED', 'LOGGED_ONLY')),
  provider_response JSONB,
  sent_by VARCHAR(255) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON sms_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_student ON sms_logs (student_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON sms_logs (status);

-- ------------------------------------------------------------
-- 2. announcements — broadcast records (parents / staff / everyone)
--    Adds the new columns to the legacy table if it already exists.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  message_body TEXT NOT NULL,
  audience VARCHAR(20) NOT NULL DEFAULT 'everyone'
    CHECK (audience IN ('parents', 'staff', 'everyone')),
  dispatch_sms BOOLEAN NOT NULL DEFAULT TRUE,
  sent_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name VARCHAR(255) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migrate the legacy announcements table (audience 'all', body, no sent_by FK).
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS message_body TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS dispatch_sms BOOLEAN DEFAULT TRUE;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sent_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255) NOT NULL DEFAULT 'system';

-- Backfill message_body from the legacy body column before any migration.
UPDATE announcements SET message_body = body WHERE message_body IS NULL AND body IS NOT NULL;

-- Relax the legacy audience check to accept the new vocabulary.
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_audience_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_audience_check
  CHECK (audience IN ('parents', 'staff', 'everyone'));
-- Map any legacy 'all' rows onto the new 'everyone' value.
UPDATE announcements SET audience = 'everyone' WHERE audience = 'all';

CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements (created_at DESC);

-- 3. Gate-pass metadata + SMS linkage on permissions (Visite Day / Gate Pass triggers)
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS destination VARCHAR(255);
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS sms_log_id BIGINT;
