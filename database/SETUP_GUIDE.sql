-- ============================================================================
-- Smart School Management System - Setup Guide
-- ============================================================================
-- Module: Smart Attendance System
-- Database Setup & Deployment Instructions
-- ============================================================================

/*
QUICK START GUIDE
=================

Prerequisites:
- PostgreSQL 12 or higher installed and running
- psql command-line tool or pgAdmin
- Administrative access to create databases

Setup Steps:
1. Create the database
2. Execute schema script (01_schema.sql)
3. Execute sample data script (02_sample_data.sql)
4. Load query functions (03_queries.sql)
5. Test with sample queries
6. (Optional) Load production data

Estimated Setup Time: 10-15 minutes
*/

-- ============================================================================
-- STEP 1: CREATE DATABASE
-- ============================================================================

-- Run this command as PostgreSQL superuser (usually 'postgres')
-- If using psql: psql -U postgres

CREATE DATABASE smart_school_db
    WITH 
    ENCODING 'UTF8'
    LC_COLLATE 'en_US.UTF-8'
    LC_CTYPE 'en_US.UTF-8'
    TEMPLATE template0;

-- Connect to the new database
-- psql -U postgres -d smart_school_db

-- ============================================================================
-- STEP 2: CREATE APPLICATION USER (Optional but Recommended)
-- ============================================================================

-- Create a dedicated application user with limited privileges
CREATE USER smart_school_app WITH PASSWORD 'change_this_secure_password_123!';

-- Grant privileges to the user
GRANT CONNECT ON DATABASE smart_school_db TO smart_school_app;
GRANT USAGE ON SCHEMA public TO smart_school_app;
GRANT CREATE ON SCHEMA public TO smart_school_app;

-- ============================================================================
-- STEP 3: EXECUTE SCHEMA SCRIPT
-- ============================================================================

-- In psql, run:
-- \i /path/to/01_schema.sql

-- Or from command line:
-- psql -U postgres -d smart_school_db -f 01_schema.sql

-- Verify schema created successfully:
/*
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

Expected output:
 table_name          
---------------------
 attendance_logs
 smart_cards
 students

SELECT typname FROM pg_type 
WHERE typnamespace = 'public'::regnamespace 
ORDER BY typname;

Expected output:
 typname             
---------------------
 attendance_method
 attendance_type
 card_status
 student_status
*/

-- ============================================================================
-- STEP 4: VERIFY INDEXES CREATED
-- ============================================================================

/*
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;

Expected: ~15-18 indexes across all tables
*/

-- ============================================================================
-- STEP 5: LOAD SAMPLE DATA (Optional for Testing)
-- ============================================================================

-- In psql, run:
-- \i /path/to/02_sample_data.sql

-- Or from command line:
-- psql -U postgres -d smart_school_db -f 02_sample_data.sql

-- Verify sample data loaded:
/*
SELECT 
    'Students' as table_name,
    COUNT(*) as row_count
FROM students
UNION ALL
SELECT 'Smart Cards', COUNT(*) FROM smart_cards
UNION ALL
SELECT 'Attendance Logs', COUNT(*) FROM attendance_logs;

Expected output (approximately):
 table_name       | row_count
------------------+-----------
 Students         |        10
 Smart Cards      |        10
 Attendance Logs  |        14
*/

-- ============================================================================
-- STEP 6: LOAD QUERY FUNCTIONS
-- ============================================================================

-- In psql, run:
-- \i /path/to/03_queries.sql

-- Or from command line:
-- psql -U postgres -d smart_school_db -f 03_queries.sql

-- Verify functions created:
/*
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
ORDER BY routine_name;

Expected: 11 functions for reporting and analytics
*/

-- ============================================================================
-- STEP 7: TEST WITH SAMPLE QUERIES
-- ============================================================================

-- Test 1: Get today's roll call
-- SELECT * FROM get_daily_rollcall('2026-05-25');

-- Test 2: Get absentees
-- SELECT * FROM get_absentees('2026-05-25');

-- Test 3: Get late arrivals
-- SELECT * FROM get_late_arrivals('2026-05-25', '08:00:00');

-- Test 4: Get device activity
-- SELECT * FROM get_device_activity('2026-05-25', '2026-05-25');

-- Test 5: Dashboard stats
-- SELECT * FROM get_attendance_dashboard_stats('2026-05-25');

-- ============================================================================
-- PRODUCTION SETUP CHECKLIST
-- ============================================================================

/*
Before deploying to production, ensure:

Database Level:
☐ Enable SSL connections to database
☐ Configure PostgreSQL pg_hba.conf for secure connections
☐ Set up automated backups (daily, weekly, monthly)
☐ Enable WAL archiving for point-in-time recovery
☐ Configure connection pooling (PgBouncer recommended)
☐ Set up monitoring and alerting

Security:
☐ Use strong passwords (minimum 12 characters)
☐ Create application-specific user with limited privileges
☐ Configure proper database-level access controls
☐ Enable query logging for audit trails
☐ Implement row-level security (RLS) if needed
☐ Regularly review and prune access logs

Performance:
☐ Run ANALYZE on all tables to update statistics
☐ Tune shared_buffers, work_mem, etc. in postgresql.conf
☐ Monitor query performance with EXPLAIN ANALYZE
☐ Set up cron jobs for table maintenance (VACUUM, ANALYZE)
☐ Monitor disk space and plan for growth
☐ Test query performance under production load

Data Management:
☐ Develop data retention/archival policy for old logs
☐ Create archive tables for historical data
☐ Test and verify backup restoration procedures
☐ Document all custom functions and their purpose
☐ Implement data validation rules

Monitoring:
☐ Set up database monitoring tool (pgAdmin, Grafana, DataGrip)
☐ Create alerts for:
  - Connection count threshold
  - Query response time threshold
  - Disk space warnings
  - Failed backups
  - Replication lag (if applicable)

Compliance:
☐ Document data retention requirements
☐ Implement GDPR compliance (data deletion for graduated students)
☐ Set up audit logging for sensitive operations
☐ Encrypt sensitive data at rest
☐ Implement secure key management for encryption keys
*/

-- ============================================================================
-- BACKUP & RESTORE PROCEDURES
-- ============================================================================

/*
BACKUP PROCEDURE (via command line):

Full Database Backup (Plain SQL):
$ pg_dump -U postgres -d smart_school_db -f backup_$(date +%Y%m%d_%H%M%S).sql

Full Database Backup (Custom Format - Recommended):
$ pg_dump -U postgres -d smart_school_db -F c -f backup_$(date +%Y%m%d_%H%M%S).dump

Backup with compression:
$ pg_dump -U postgres -d smart_school_db -F c -Z 9 -f backup_$(date +%Y%m%d_%H%M%S).dump

Backup only schema (no data):
$ pg_dump -U postgres -d smart_school_db -s -f schema_only_$(date +%Y%m%d_%H%M%S).sql

Backup only data (no schema):
$ pg_dump -U postgres -d smart_school_db -a -f data_only_$(date +%Y%m%d_%H%M%S).sql

RESTORE PROCEDURE:

From plain SQL backup:
$ psql -U postgres -d smart_school_db -f backup_20260525_120000.sql

From custom format backup:
$ pg_restore -U postgres -d smart_school_db -v backup_20260525_120000.dump

Restore into new database:
$ createdb -U postgres smart_school_db_restored
$ pg_restore -U postgres -d smart_school_db_restored -v backup_20260525_120000.dump
*/

-- ============================================================================
-- MAINTENANCE PROCEDURES
-- ============================================================================

/*
Regular Maintenance (Should be scheduled as cron jobs):

1. VACUUM & ANALYZE (Daily, during low-traffic hours):
VACUUM ANALYZE;

2. REINDEX (Weekly or when performance degrades):
REINDEX DATABASE smart_school_db;

3. CHECK TABLE SIZES:
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

4. CHECK INDEX BLOAT (Monthly):
SELECT schemaname, tablename, indexname,
       ROUND(100 * (CASE WHEN otta > 0 
           THEN sml.relpages - otta 
           ELSE 0 END) / sml.relpages::numeric, 2) AS waste_ratio
FROM <index_bloat_query>
WHERE schemaname = 'public'
ORDER BY waste_ratio DESC;

5. CLEAN UP OLD LOGS (If implementing retention policy):
DELETE FROM attendance_logs 
WHERE check_time < CURRENT_TIMESTAMP - INTERVAL '1 year';

6. ANALYZE QUERY PERFORMANCE (Monthly):
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 20;
*/

-- ============================================================================
-- USEFUL MAINTENANCE QUERIES
-- ============================================================================

-- Get database size
SELECT pg_size_pretty(pg_database_size('smart_school_db')) as db_size;

-- Get table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                   pg_relation_size(schemaname||'.'||tablename)) as indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Get current connections
SELECT datname, usename, count(*) as connection_count
FROM pg_stat_activity
GROUP BY datname, usename;

-- Get slow queries
SELECT query, calls, mean_time
FROM pg_stat_statements
WHERE mean_time > 100  -- queries taking more than 100ms
ORDER BY mean_time DESC
LIMIT 10;

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================

/*
Issue: "ROLE smart_school_app does not exist"
Solution: Create the role first using CREATE USER command above

Issue: "Cannot execute INSERT - permission denied"
Solution: Grant appropriate permissions:
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smart_school_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO smart_school_app;

Issue: "UUID extension does not exist"
Solution: Create extension as superuser:
CREATE EXTENSION "uuid-ossp";

Issue: Query performance is slow
Solution: 
1. Run ANALYZE on tables: ANALYZE students, smart_cards, attendance_logs;
2. Check if indexes exist: SELECT * FROM pg_indexes WHERE tablename = 'attendance_logs';
3. Use EXPLAIN ANALYZE to identify bottlenecks: EXPLAIN ANALYZE SELECT ...

Issue: Disk space running out
Solution:
1. Archive old attendance logs to separate table
2. Run VACUUM FULL (during maintenance window)
3. Upgrade storage

Issue: Duplicate attendance records detected
Solution: Use anomaly detection function:
SELECT * FROM get_attendance_anomalies('2026-05-25');

Then investigate and remove duplicates as needed.
*/

-- ============================================================================
-- VERSION HISTORY
-- ============================================================================

/*
v1.0 - May 25, 2026
- Initial schema with Students, Smart Cards, Attendance Logs
- Support for NFC and QR Code scanning
- Basic reporting functions
- Sample data and test queries

Future Enhancements (v2.0+):
- Teachers/Staff user management
- Real-time dashboard WebSocket integration
- SMS/Email notification system
- Biometric fingerprint integration
- Gate management system
- Vehicle tracking for school transport
- Student discipline tracking
- School fees payment gateway integration
- Mobile app backend APIs
- Analytics and machine learning models
*/

-- ============================================================================
-- END OF SETUP GUIDE
-- ============================================================================
