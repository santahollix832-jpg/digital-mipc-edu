-- Run once against your live smart_school database in pgAdmin or psql:
-- psql -U postgres -d smart_school -f database/07_fix_class_column.sql

ALTER TABLE students ALTER COLUMN class TYPE VARCHAR(100);
