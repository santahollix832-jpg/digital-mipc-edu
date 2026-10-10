-- Run this in psql or pgAdmin against your smart_school database
-- before using the /api/discipline endpoints

CREATE TABLE IF NOT EXISTS discipline_incidents (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    incident_type VARCHAR(255) NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('Low', 'Medium', 'High')),
    incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
    incident_time TIME NOT NULL DEFAULT CURRENT_TIME,
    location VARCHAR(255),
    description TEXT NOT NULL,
    reported_by VARCHAR(255) NOT NULL,
    action_taken TEXT,
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Resolved', 'Escalated')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incidents_student ON discipline_incidents (student_id);
CREATE INDEX IF NOT EXISTS idx_incidents_date    ON discipline_incidents (incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status  ON discipline_incidents (status);

-- Keep original table for marks if needed, or migration note:
-- Original discipline_records can be used for automated marks/points logic.
