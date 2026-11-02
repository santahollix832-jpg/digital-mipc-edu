-- ============================================
-- 09: TRANSPORT TRACKING & IOT SMART BELL SETUP
-- ============================================

-- 🚌 Buses table (real-time fleet data)
CREATE TABLE IF NOT EXISTS buses (
    id SERIAL PRIMARY KEY,
    bus_number VARCHAR(20) NOT NULL UNIQUE,
    driver_name VARCHAR(100) NOT NULL,
    route_name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'In Transit'
        CHECK (status IN ('In Transit', 'Delayed', 'Completed')),
    speed INT NOT NULL DEFAULT 0 CHECK (speed >= 0),
    capacity INT NOT NULL DEFAULT 50 CHECK (capacity > 0),
    passengers_count INT NOT NULL DEFAULT 0 CHECK (passengers_count >= 0),
    driver_phone VARCHAR(30),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_buses_status ON buses(status);

-- Trigger to refresh updated_at on every update
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_buses_updated_at ON buses;
CREATE TRIGGER trg_buses_updated_at
    BEFORE UPDATE ON buses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 🔔 Bell schedules table (timetable configuration)
CREATE TABLE IF NOT EXISTS bell_schedules (
    id SERIAL PRIMARY KEY,
    time TIME NOT NULL,
    title VARCHAR(150) NOT NULL,
    days VARCHAR(50) NOT NULL DEFAULT 'Mon-Fri',
    tone VARCHAR(50) NOT NULL DEFAULT 'Standard Bell',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bell_schedules_time ON bell_schedules(time);

-- 🔔 Bell logs table (audit trail of every ring)
CREATE TABLE IF NOT EXISTS bell_logs (
    id SERIAL PRIMARY KEY,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    trigger_type VARCHAR(20) NOT NULL
        CHECK (trigger_type IN ('Automated', 'Manual')),
    status VARCHAR(20) NOT NULL DEFAULT 'Success'
        CHECK (status IN ('Success', 'Failed', 'Cancelled')),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    schedule_id INTEGER REFERENCES bell_schedules(id) ON DELETE SET NULL,
    note VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_bell_logs_triggered_at ON bell_logs(triggered_at DESC);

-- ============================================
-- SEED DATA
-- ============================================
INSERT INTO buses (bus_number, driver_name, route_name, status, speed, capacity, passengers_count, driver_phone)
VALUES
    ('BUS-001', 'Jean Damascene', 'Kicukiro - Gikondo', 'In Transit', 35, 50, 45, '+250 788 000 111'),
    ('BUS-002', 'Marie Claire', 'Remera - Kimironko', 'Delayed', 12, 50, 32, '+250 788 000 222'),
    ('BUS-003', 'Emmanuel K.', 'Nyabugogo - Town', 'In Transit', 42, 50, 48, '+250 788 000 333'),
    ('BUS-004', 'Alice Umutoni', 'Kacyiru - Kibagabaga', 'Completed', 0, 50, 0, '+250 788 000 444'),
    ('BUS-005', 'Justin B.', 'Kanombe - Masaka', 'In Transit', 38, 50, 28, '+250 788 000 555')
ON CONFLICT (bus_number) DO NOTHING;

INSERT INTO bell_schedules (time, title, days, tone, is_active)
VALUES
    ('08:00', 'Morning Assembly Bell', 'Mon-Fri', 'Standard Bell', TRUE),
    ('10:30', 'Morning Break', 'Mon-Fri', 'Chime', TRUE),
    ('12:30', 'Lunch Break', 'Mon-Fri', 'Two Tone', TRUE),
    ('14:00', 'Afternoon Classes', 'Mon-Fri', 'Standard Bell', TRUE),
    ('16:30', 'End of Day Dismissal', 'Mon-Fri', 'Long Ring', TRUE)
ON CONFLICT DO NOTHING;
