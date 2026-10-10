-- ============================================================================
-- Smart School Management System - Useful Queries
-- ============================================================================
-- Module: Smart Attendance System
-- Contains common queries for reporting and operations
-- ============================================================================

-- ============================================================================
-- ATTENDANCE REPORTS
-- ============================================================================

-- Report 1: Daily Roll Call Report
-- Shows all students and their check-in status for a given date
CREATE OR REPLACE FUNCTION get_daily_rollcall(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    student_id VARCHAR,
    student_name VARCHAR,
    class_grade VARCHAR,
    check_in_time TIMESTAMP,
    check_in_method VARCHAR,
    check_out_time TIMESTAMP,
    check_out_method VARCHAR,
    status VARCHAR
) AS $$
SELECT
    s.student_id,
    s.first_name || ' ' || s.last_name,
    s.class_grade,
    MAX(CASE WHEN al.attendance_type = 'CHECK_IN' THEN al.check_time END),
    MAX(CASE WHEN al.attendance_type = 'CHECK_IN' THEN al.attendance_method::VARCHAR END),
    MAX(CASE WHEN al.attendance_type = 'CHECK_OUT' THEN al.check_time END),
    MAX(CASE WHEN al.attendance_type = 'CHECK_OUT' THEN al.attendance_method::VARCHAR END),
    CASE 
        WHEN COUNT(CASE WHEN al.attendance_type = 'CHECK_IN' THEN 1 END) = 0 THEN 'ABSENT'
        WHEN COUNT(CASE WHEN al.attendance_type = 'CHECK_IN' THEN 1 END) > 0 THEN 'PRESENT'
        ELSE 'UNKNOWN'
    END
FROM students s
LEFT JOIN attendance_logs al ON s.id = al.student_id AND DATE(al.check_time) = p_date
WHERE s.status = 'ACTIVE'
GROUP BY s.id, s.student_id, s.first_name, s.last_name, s.class_grade
ORDER BY s.class_grade, s.student_id;
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_daily_rollcall('2026-05-25');


-- Report 2: Weekly Attendance Summary
-- Shows attendance percentage for each student over a week
CREATE OR REPLACE FUNCTION get_weekly_attendance_summary(p_start_date DATE, p_end_date DATE)
RETURNS TABLE (
    student_id VARCHAR,
    student_name VARCHAR,
    class_grade VARCHAR,
    total_days INT,
    days_present INT,
    days_absent INT,
    attendance_percentage NUMERIC
) AS $$
WITH date_range AS (
    SELECT GENERATE_SERIES(p_start_date, p_end_date, '1 day'::INTERVAL)::DATE as attendance_date
),
student_attendance AS (
    SELECT
        s.id,
        s.student_id,
        s.first_name || ' ' || s.last_name as student_name,
        s.class_grade,
        dr.attendance_date,
        CASE
            WHEN COUNT(DISTINCT al.id) > 0 THEN 'PRESENT'
            ELSE 'ABSENT'
        END as status
    FROM students s
    CROSS JOIN date_range dr
    LEFT JOIN attendance_logs al ON s.id = al.student_id 
        AND DATE(al.check_time) = dr.attendance_date
        AND al.attendance_type = 'CHECK_IN'
    WHERE s.status = 'ACTIVE'
    GROUP BY s.id, s.student_id, s.first_name, s.last_name, s.class_grade, dr.attendance_date
)
SELECT
    student_id,
    student_name,
    class_grade,
    COUNT(*) as total_days,
    COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) as days_present,
    COUNT(CASE WHEN status = 'ABSENT' THEN 1 END) as days_absent,
    ROUND(100.0 * COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) / COUNT(*), 2) as attendance_percentage
FROM student_attendance
GROUP BY id, student_id, student_name, class_grade
ORDER BY class_grade, student_id;
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_weekly_attendance_summary('2026-05-18', '2026-05-25');


-- Report 3: Absentees Report
-- Students who didn't check-in on a specific date
CREATE OR REPLACE FUNCTION get_absentees(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    student_id VARCHAR,
    student_name VARCHAR,
    class_grade VARCHAR,
    guardian_name VARCHAR,
    guardian_phone VARCHAR
) AS $$
SELECT
    s.student_id,
    s.first_name || ' ' || s.last_name,
    s.class_grade,
    s.guardian_name,
    s.guardian_phone
FROM students s
WHERE s.status = 'ACTIVE'
    AND s.id NOT IN (
        SELECT DISTINCT student_id
        FROM attendance_logs
        WHERE DATE(check_time) = p_date AND attendance_type = 'CHECK_IN'
    )
ORDER BY s.class_grade, s.student_id;
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_absentees('2026-05-25');


-- Report 4: Late Arrivals
-- Students who checked in after a threshold time
CREATE OR REPLACE FUNCTION get_late_arrivals(p_date DATE, p_threshold_time TIME DEFAULT '08:00:00')
RETURNS TABLE (
    student_id VARCHAR,
    student_name VARCHAR,
    class_grade VARCHAR,
    check_in_time TIMESTAMP,
    delay_minutes INT
) AS $$
SELECT
    s.student_id,
    s.first_name || ' ' || s.last_name,
    s.class_grade,
    al.check_time,
    EXTRACT(MINUTE FROM (al.check_time::TIME - p_threshold_time))::INT
FROM students s
INNER JOIN (
    SELECT student_id, MIN(check_time) as check_time
    FROM attendance_logs
    WHERE DATE(check_time) = p_date AND attendance_type = 'CHECK_IN'
    GROUP BY student_id
) al ON s.id = al.student_id
WHERE s.status = 'ACTIVE' AND al.check_time::TIME > p_threshold_time
ORDER BY s.class_grade, al.check_time;
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_late_arrivals('2026-05-25', '08:00:00');


-- ============================================================================
-- DEVICE & METHOD ANALYTICS
-- ============================================================================

-- Report 5: Attendance Method Statistics
-- Shows which scanning methods are being used
CREATE OR REPLACE FUNCTION get_attendance_method_stats(p_start_date DATE, p_end_date DATE)
RETURNS TABLE (
    attendance_method VARCHAR,
    total_scans BIGINT,
    unique_students BIGINT,
    percentage NUMERIC
) AS $$
WITH method_stats AS (
    SELECT
        attendance_method,
        COUNT(*) as total_scans,
        COUNT(DISTINCT student_id) as unique_students
    FROM attendance_logs
    WHERE DATE(check_time) BETWEEN p_start_date AND p_end_date
    GROUP BY attendance_method
),
totals AS (
    SELECT SUM(total_scans) as grand_total FROM method_stats
)
SELECT
    ms.attendance_method::VARCHAR,
    ms.total_scans,
    ms.unique_students,
    ROUND(100.0 * ms.total_scans / t.grand_total, 2) as percentage
FROM method_stats ms, totals t
ORDER BY ms.total_scans DESC;
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_attendance_method_stats('2026-05-25', '2026-05-25');


-- Report 6: Device Activity Report
-- Shows which device captured most attendance records
CREATE OR REPLACE FUNCTION get_device_activity(p_start_date DATE, p_end_date DATE)
RETURNS TABLE (
    device_id VARCHAR,
    total_scans BIGINT,
    unique_students BIGINT,
    nfc_count BIGINT,
    qr_count BIGINT,
    last_scan TIMESTAMP
) AS $$
SELECT
    device_id,
    COUNT(*) as total_scans,
    COUNT(DISTINCT student_id) as unique_students,
    COUNT(CASE WHEN attendance_method = 'NFC' THEN 1 END) as nfc_count,
    COUNT(CASE WHEN attendance_method = 'QR_CODE' THEN 1 END) as qr_count,
    MAX(check_time) as last_scan
FROM attendance_logs
WHERE DATE(check_time) BETWEEN p_start_date AND p_end_date
GROUP BY device_id
ORDER BY total_scans DESC;
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_device_activity('2026-05-25', '2026-05-25');


-- ============================================================================
-- STUDENT-SPECIFIC QUERIES
-- ============================================================================

-- Report 7: Individual Student Attendance History
CREATE OR REPLACE FUNCTION get_student_attendance_history(p_student_id VARCHAR, p_days INT DEFAULT 30)
RETURNS TABLE (
    attendance_date DATE,
    check_in_time TIMESTAMP,
    check_in_method VARCHAR,
    check_out_time TIMESTAMP,
    check_out_method VARCHAR,
    daily_hours INTERVAL
) AS $$
SELECT
    DATE(al.check_time) as attendance_date,
    MAX(CASE WHEN al.attendance_type = 'CHECK_IN' THEN al.check_time END),
    MAX(CASE WHEN al.attendance_type = 'CHECK_IN' THEN al.attendance_method::VARCHAR END),
    MAX(CASE WHEN al.attendance_type = 'CHECK_OUT' THEN al.check_time END),
    MAX(CASE WHEN al.attendance_type = 'CHECK_OUT' THEN al.attendance_method::VARCHAR END),
    MAX(CASE WHEN al.attendance_type = 'CHECK_OUT' THEN al.check_time END) - 
    MAX(CASE WHEN al.attendance_type = 'CHECK_IN' THEN al.check_time END) as daily_hours
FROM students s
INNER JOIN attendance_logs al ON s.id = al.student_id
WHERE s.student_id = p_student_id
    AND al.check_time >= CURRENT_TIMESTAMP - (p_days || ' days')::INTERVAL
GROUP BY DATE(al.check_time)
ORDER BY DATE(al.check_time) DESC;
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_student_attendance_history('SCH-2026-0001', 30);


-- Report 8: Student Profile with Active Card Info
CREATE OR REPLACE FUNCTION get_student_profile(p_student_id VARCHAR)
RETURNS TABLE (
    student_id VARCHAR,
    full_name VARCHAR,
    email VARCHAR,
    phone VARCHAR,
    class_grade VARCHAR,
    guardian_name VARCHAR,
    guardian_phone VARCHAR,
    student_status VARCHAR,
    card_status VARCHAR,
    nfc_chip_id VARCHAR,
    qr_code_data VARCHAR,
    enrollment_date DATE
) AS $$
SELECT
    s.student_id,
    s.first_name || ' ' || s.last_name,
    s.email,
    s.phone,
    s.class_grade,
    s.guardian_name,
    s.guardian_phone,
    s.status::VARCHAR,
    sc.card_status::VARCHAR,
    sc.nfc_chip_id,
    sc.qr_code_data,
    s.enrollment_date
FROM students s
LEFT JOIN smart_cards sc ON s.id = sc.student_id AND sc.card_status = 'ACTIVE'
WHERE s.student_id = p_student_id;
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_student_profile('SCH-2026-0001');


-- ============================================================================
-- REAL-TIME MONITORING
-- ============================================================================

-- Report 9: Currently Present Students
-- Live view of students who checked in but haven't checked out today
CREATE OR REPLACE FUNCTION get_students_currently_present(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    student_id VARCHAR,
    full_name VARCHAR,
    class_grade VARCHAR,
    check_in_time TIMESTAMP,
    time_in_school INTERVAL,
    check_in_method VARCHAR
) AS $$
WITH latest_status AS (
    SELECT
        student_id,
        check_time,
        attendance_type,
        attendance_method,
        ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY check_time DESC) as rn
    FROM attendance_logs
    WHERE DATE(check_time) = p_date
)
SELECT
    s.student_id,
    s.first_name || ' ' || s.last_name,
    s.class_grade,
    ls.check_time,
    CURRENT_TIMESTAMP - ls.check_time as time_in_school,
    ls.attendance_method::VARCHAR
FROM students s
INNER JOIN latest_status ls ON s.id = ls.student_id AND ls.rn = 1
WHERE s.status = 'ACTIVE' AND ls.attendance_type = 'CHECK_IN'
ORDER BY s.class_grade, s.student_id;
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_students_currently_present();


-- ============================================================================
-- DATA QUALITY & AUDITING
-- ============================================================================

-- Report 10: Duplicate or Anomalous Attendance Records
-- Check for unusual patterns (multiple check-ins within 5 minutes, etc.)
CREATE OR REPLACE FUNCTION get_attendance_anomalies(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    student_id VARCHAR,
    student_name VARCHAR,
    first_check_time TIMESTAMP,
    second_check_time TIMESTAMP,
    time_diff INTERVAL,
    anomaly_type VARCHAR
) AS $$
WITH consecutive_checks AS (
    SELECT
        al1.student_id,
        al1.check_time as first_time,
        al2.check_time as second_time,
        al2.check_time - al1.check_time as time_diff,
        ROW_NUMBER() OVER (PARTITION BY al1.student_id ORDER BY al1.check_time) as check_num
    FROM attendance_logs al1
    INNER JOIN attendance_logs al2 ON al1.student_id = al2.student_id 
        AND al2.check_time > al1.check_time
        AND al2.check_time - al1.check_time < '5 minutes'::INTERVAL
    WHERE DATE(al1.check_time) = p_date
)
SELECT
    s.student_id,
    s.first_name || ' ' || s.last_name,
    cc.first_time,
    cc.second_time,
    cc.time_diff,
    'DUPLICATE_SCAN' as anomaly_type
FROM consecutive_checks cc
INNER JOIN students s ON cc.student_id = s.id
ORDER BY cc.student_id, cc.first_time;
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_attendance_anomalies('2026-05-25');


-- ============================================================================
-- SUMMARY STATISTICS
-- ============================================================================

-- Report 11: Quick Statistics Dashboard
CREATE OR REPLACE FUNCTION get_attendance_dashboard_stats(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    metric_name VARCHAR,
    metric_value VARCHAR
) AS $$
SELECT 'Total Active Students' as metric_name, COUNT(*)::VARCHAR FROM students WHERE status = 'ACTIVE'
UNION ALL
SELECT 'Students Present Today', COUNT(DISTINCT student_id)::VARCHAR FROM attendance_logs 
    WHERE DATE(check_time) = p_date AND attendance_type = 'CHECK_IN'
UNION ALL
SELECT 'Students Absent Today', 
    (SELECT COUNT(*) FROM students WHERE status = 'ACTIVE') - 
    (SELECT COUNT(DISTINCT student_id) FROM attendance_logs 
        WHERE DATE(check_time) = p_date AND attendance_type = 'CHECK_IN')
UNION ALL
SELECT 'Late Arrivals (After 08:00)', COUNT(*)::VARCHAR FROM attendance_logs
    WHERE DATE(check_time) = p_date AND attendance_type = 'CHECK_IN' 
    AND EXTRACT(HOUR FROM check_time) || ':' || LPAD(EXTRACT(MINUTE FROM check_time)::VARCHAR, 2, '0') > '08:00'
UNION ALL
SELECT 'Total Scans Today', COUNT(*)::VARCHAR FROM attendance_logs WHERE DATE(check_time) = p_date
UNION ALL
SELECT 'NFC Scans', COUNT(*)::VARCHAR FROM attendance_logs 
    WHERE DATE(check_time) = p_date AND attendance_method = 'NFC'
UNION ALL
SELECT 'QR Code Scans', COUNT(*)::VARCHAR FROM attendance_logs 
    WHERE DATE(check_time) = p_date AND attendance_method = 'QR_CODE';
$$ LANGUAGE sql;

-- Usage: SELECT * FROM get_attendance_dashboard_stats();


-- ============================================================================
-- NOTES
-- ============================================================================
-- These functions are designed to be called from the backend application
-- to generate reports, dashboards, and real-time monitoring views.
--
-- All functions use CURRENT_DATE as default to ensure they work with
-- dynamic dates, but you can pass specific dates for historical reporting.
--
-- For API integration, wrap these in your backend application layer
-- and expose them as REST endpoints.
