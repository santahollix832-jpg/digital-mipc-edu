-- Run once against smart_school database:
-- psql -U postgres -d smart_school -f database/08_fees_fix.sql

-- Add total_required column (was missing from original schema)
ALTER TABLE fees_ledger ADD COLUMN IF NOT EXISTS total_required DECIMAL(10,2) DEFAULT 0.00;

-- Widen status constraint to include PARTIALLY_PAID
ALTER TABLE fees_ledger DROP CONSTRAINT IF EXISTS fees_ledger_status_check;
ALTER TABLE fees_ledger ADD CONSTRAINT fees_ledger_status_check
    CHECK (status IN ('UNPAID', 'COMPLETED', 'PARTIAL', 'PARTIALLY_PAID'));

-- Set existing rows to UNPAID if total_required is still 0
UPDATE fees_ledger SET status = 'UNPAID' WHERE total_required = 0;
