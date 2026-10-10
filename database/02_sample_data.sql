-- ============================================================================
-- Smart School Management System - Sample Data
-- ============================================================================
-- Module: Smart Attendance System
-- This script populates the database with sample data for testing
-- ============================================================================

-- IMPORTANT: Execute 01_schema.sql BEFORE running this script

-- ============================================================================
-- SAMPLE STUDENTS DATA
-- ============================================================================

-- Function to generate sequential Student IDs
-- Usage: SELECT generate_student_id(1) -> 'SCH-2026-0001'
CREATE OR REPLACE FUNCTION generate_student_id(sequence_num INT)
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'SCH-2026-' || LPAD(sequence_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Insert sample students
INSERT INTO students 
    (student_id, first_name, last_name, email, phone, class_grade, guardian_name, guardian_phone, enrollment_date, status)
VALUES
    (generate_student_id(1), 'Aarav', 'Kumar', 'aarav.kumar@school.edu', '9876543210', 'Grade 10-A', 'Rajesh Kumar', '9876543210', '2024-04-15', 'ACTIVE'),
    (generate_student_id(2), 'Priya', 'Sharma', 'priya.sharma@school.edu', '9876543211', 'Grade 10-A', 'Sunita Sharma', '9876543211', '2024-04-20', 'ACTIVE'),
    (generate_student_id(3), 'Anisha', 'Patel', 'anisha.patel@school.edu', '9876543212', 'Grade 9-B', 'Vikram Patel', '9876543212', '2023-06-10', 'ACTIVE'),
    (generate_student_id(4), 'Rohan', 'Singh', 'rohan.singh@school.edu', '9876543213', 'Grade 10-B', 'Harpreet Singh', '9876543213', '2024-05-01', 'ACTIVE'),
    (generate_student_id(5), 'Zara', 'Khan', 'zara.khan@school.edu', '9876543214', 'Grade 9-A', 'Aisha Khan', '9876543214', '2024-02-28', 'ACTIVE'),
    (generate_student_id(6), 'Arjun', 'Gupta', 'arjun.gupta@school.edu', '9876543215', 'Grade 11-A', 'Meera Gupta', '9876543215', '2023-04-10', 'ACTIVE'),
    (generate_student_id(7), 'Divya', 'Nair', 'divya.nair@school.edu', '9876543216', 'Grade 9-C', 'Mohan Nair', '9876543216', '2024-03-15', 'ACTIVE'),
    (generate_student_id(8), 'Nikhil', 'Desai', 'nikhil.desai@school.edu', '9876543217', 'Grade 10-C', 'Anjali Desai', '9876543217', '2024-01-20', 'ACTIVE'),
    (generate_student_id(9), 'Ishita', 'Verma', 'ishita.verma@school.edu', '9876543218', 'Grade 9-A', 'Rajiv Verma', '9876543218', '2024-05-05', 'ACTIVE'),
    (generate_student_id(10), 'Kartik', 'Reddy', 'kartik.reddy@school.edu', '9876543219', 'Grade 11-B', 'Lakshmi Reddy', '9876543219', '2023-05-12', 'ACTIVE');

-- Display inserted students
SELECT 'Sample Students Inserted Successfully' as status;
SELECT COUNT(*) as total_students FROM students;

-- ============================================================================
-- SAMPLE SMART CARDS DATA
-- ============================================================================

-- Generate QR Code data (in real system, this would be encrypted/specific format)
-- Format: SCH|STUDENT_ID|TIMESTAMP|HASH
-- For demo: SCH|SCH-2026-0001|2026052500001

INSERT INTO smart_cards 
    (student_id, nfc_chip_id, qr_code_data, card_status, issued_date)
VALUES
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0001'),
        'A1B2C3D4E5F6G7H8',
        'SCH|SCH-2026-0001|2026052500001|HASH001',
        'ACTIVE',
        '2026-01-10'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0002'),
        'A1B2C3D4E5F6G7H9',
        'SCH|SCH-2026-0002|2026052500002|HASH002',
        'ACTIVE',
        '2026-01-10'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0003'),
        'A1B2C3D4E5F6G7HA',
        'SCH|SCH-2026-0003|2026052500003|HASH003',
        'ACTIVE',
        '2026-01-11'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0004'),
        'A1B2C3D4E5F6G7HB',
        'SCH|SCH-2026-0004|2026052500004|HASH004',
        'ACTIVE',
        '2026-01-11'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0005'),
        'A1B2C3D4E5F6G7HC',
        'SCH|SCH-2026-0005|2026052500005|HASH005',
        'ACTIVE',
        '2026-01-12'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0006'),
        'A1B2C3D4E5F6G7HD',
        'SCH|SCH-2026-0006|2026052500006|HASH006',
        'ACTIVE',
        '2026-01-12'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0007'),
        'A1B2C3D4E5F6G7HE',
        'SCH|SCH-2026-0007|2026052500007|HASH007',
        'ACTIVE',
        '2026-01-13'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0008'),
        'A1B2C3D4E5F6G7HF',
        'SCH|SCH-2026-0008|2026052500008|HASH008',
        'ACTIVE',
        '2026-01-13'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0009'),
        NULL, -- Card without NFC chip (QR only)
        'SCH|SCH-2026-0009|2026052500009|HASH009',
        'ACTIVE',
        '2026-01-14'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0010'),
        'A1B2C3D4E5F6G7HG',
        'SCH|SCH-2026-0010|2026052500010|HASH010',
        'ACTIVE',
        '2026-01-14'
    );

-- Display inserted smart cards
SELECT 'Sample Smart Cards Inserted Successfully' as status;
SELECT COUNT(*) as total_cards FROM smart_cards;

-- ============================================================================
-- SAMPLE ATTENDANCE LOGS DATA
-- ============================================================================

-- Sample attendance data for today (May 25, 2026)
-- Morning Check-ins (7:30 AM - 8:30 AM)

INSERT INTO attendance_logs 
    (student_id, smart_card_id, attendance_type, check_time, attendance_method, device_id, teacher_id, notes)
VALUES
    -- Morning Check-ins
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0001'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7H8'),
        'CHECK_IN',
        '2026-05-25 07:35:00+00',
        'NFC',
        'DEVICE-001',
        NULL,
        'Scanned via NFC at gate entrance'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0002'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7H9'),
        'CHECK_IN',
        '2026-05-25 07:42:00+00',
        'NFC',
        'DEVICE-001',
        NULL,
        'Scanned via NFC at gate entrance'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0003'),
        (SELECT id FROM smart_cards WHERE qr_code_data = 'SCH|SCH-2026-0003|2026052500003|HASH003'),
        'CHECK_IN',
        '2026-05-25 07:48:00+00',
        'QR_CODE',
        'DEVICE-002',
        NULL,
        'Scanned via QR code at gate entrance'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0004'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7HB'),
        'CHECK_IN',
        '2026-05-25 08:05:00+00',
        'NFC',
        'DEVICE-001',
        NULL,
        'Late entry - Scanned via NFC at gate'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0005'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7HC'),
        'CHECK_IN',
        '2026-05-25 07:39:00+00',
        'NFC',
        'DEVICE-001',
        NULL,
        'Scanned via NFC at gate entrance'
    ),
    -- Morning Check-ins for more students
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0006'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7HD'),
        'CHECK_IN',
        '2026-05-25 07:33:00+00',
        'NFC',
        'DEVICE-003',
        NULL,
        'Scanned via NFC at gate entrance'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0007'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7HE'),
        'CHECK_IN',
        '2026-05-25 07:45:00+00',
        'NFC',
        'DEVICE-002',
        NULL,
        'Scanned via NFC at gate entrance'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0008'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7HF'),
        'CHECK_IN',
        '2026-05-25 08:15:00+00',
        'NFC',
        'DEVICE-001',
        NULL,
        'Very late entry - Scanned via NFC'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0009'),
        (SELECT id FROM smart_cards WHERE qr_code_data = 'SCH|SCH-2026-0009|2026052500009|HASH009'),
        'CHECK_IN',
        '2026-05-25 07:50:00+00',
        'QR_CODE',
        'DEVICE-002',
        NULL,
        'Scanned via QR code (no NFC chip on card)'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0010'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7HG'),
        'CHECK_IN',
        '2026-05-25 07:36:00+00',
        'NFC',
        'DEVICE-003',
        NULL,
        'Scanned via NFC at gate entrance'
    ),
    
    -- Afternoon Check-outs (3:30 PM - 4:30 PM) - Sample for a few students
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0001'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7H8'),
        'CHECK_OUT',
        '2026-05-25 15:32:00+00',
        'NFC',
        'DEVICE-001',
        NULL,
        'Scanned via NFC at gate exit'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0002'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7H9'),
        'CHECK_OUT',
        '2026-05-25 15:35:00+00',
        'NFC',
        'DEVICE-001',
        NULL,
        'Scanned via NFC at gate exit'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0003'),
        (SELECT id FROM smart_cards WHERE qr_code_data = 'SCH|SCH-2026-0003|2026052500003|HASH003'),
        'CHECK_OUT',
        '2026-05-25 15:40:00+00',
        'QR_CODE',
        'DEVICE-002',
        NULL,
        'Scanned via QR code at gate exit'
    ),
    (
        (SELECT id FROM students WHERE student_id = 'SCH-2026-0005'),
        (SELECT id FROM smart_cards WHERE nfc_chip_id = 'A1B2C3D4E5F6G7HC'),
        'CHECK_OUT',
        '2026-05-25 15:38:00+00',
        'NFC',
        'DEVICE-003',
        NULL,
        'Scanned via NFC at gate exit'
    );

-- Display inserted attendance logs
SELECT 'Sample Attendance Logs Inserted Successfully' as status;
SELECT COUNT(*) as total_logs FROM attendance_logs;

-- ============================================================================
-- SAMPLE QUERIES FOR TESTING
-- ============================================================================

-- Query 1: Today's Check-in Summary
SELECT 'QUERY 1: Today''s Check-in Summary' as query_info;
SELECT 
    s.student_id,
    s.first_name || ' ' || s.last_name as full_name,
    s.class_grade,
    al.attendance_type,
    al.check_time,
    al.attendance_method,
    al.device_id
FROM students s
LEFT JOIN attendance_logs al ON s.id = al.student_id 
    AND DATE(al.check_time) = '2026-05-25'
WHERE s.status = 'ACTIVE'
ORDER BY s.student_id, al.check_time;

-- Query 2: Students who checked-in but haven't checked-out
SELECT 'QUERY 2: Students Currently Present (Checked In but Not Out)' as query_info;
SELECT DISTINCT
    s.student_id,
    s.first_name || ' ' || s.last_name as full_name,
    s.class_grade,
    MAX(al.check_time) as last_check_time,
    MAX(al.attendance_type) as last_status
FROM students s
INNER JOIN attendance_logs al ON s.id = al.student_id 
    AND DATE(al.check_time) = '2026-05-25'
WHERE s.status = 'ACTIVE'
GROUP BY s.id, s.student_id, s.first_name, s.last_name, s.class_grade
HAVING MAX(al.attendance_type) = 'CHECK_IN'
ORDER BY s.student_id;

-- Query 3: Attendance by Method
SELECT 'QUERY 3: Attendance Count by Method (Today)' as query_info;
SELECT 
    attendance_method,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM attendance_logs
WHERE DATE(check_time) = '2026-05-25'
GROUP BY attendance_method
ORDER BY count DESC;

-- Query 4: Average Check-in Time by Class
SELECT 'QUERY 4: Average Check-in Time by Class (Today)' as query_info;
SELECT 
    s.class_grade,
    COUNT(DISTINCT s.id) as total_students,
    COUNT(CASE WHEN al.attendance_type = 'CHECK_IN' THEN 1 END) as checked_in,
    ROUND(100.0 * COUNT(CASE WHEN al.attendance_type = 'CHECK_IN' THEN 1 END) / 
        COUNT(DISTINCT s.id), 2) as attendance_percentage,
    TO_CHAR(AVG(EXTRACT(EPOCH FROM al.check_time))::INTEGER, 'HH24:MI:SS') as avg_check_in_time
FROM students s
LEFT JOIN attendance_logs al ON s.id = al.student_id 
    AND DATE(al.check_time) = '2026-05-25'
    AND al.attendance_type = 'CHECK_IN'
WHERE s.status = 'ACTIVE'
GROUP BY s.class_grade
ORDER BY s.class_grade;

-- ============================================================================
-- CLEANUP FUNCTION (Optional)
-- ============================================================================
-- Use this function to reset sample data if needed

CREATE OR REPLACE FUNCTION reset_sample_data()
RETURNS void AS $$
BEGIN
    DELETE FROM attendance_logs;
    DELETE FROM smart_cards;
    DELETE FROM students;
    RAISE NOTICE 'All sample data has been deleted. Database is now empty.';
END;
$$ LANGUAGE plpgsql;

-- To reset: SELECT reset_sample_data();
