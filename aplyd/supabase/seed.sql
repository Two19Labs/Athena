-- ==============================================================================
-- APLYD: Seed Data Script
-- Textile Manufacturing Master Data & Demo Dataset
-- Version: 1.0.0
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. MACHINES (Looms Master Catalogue L-01 to L-12)
-- ------------------------------------------------------------------------------
INSERT INTO public.machines (id, machine_code, name, machine_type, default_unit, min_expected_quantity, max_expected_quantity, is_active, notes)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'L-01', 'Loom 01 (Air-Jet High Speed)', 'Air-Jet', 'metres', 150.0, 750.0, true, 'Shed A - Fine Cotton Cambric'),
    ('a0000000-0000-0000-0000-000000000002', 'L-02', 'Loom 02 (Air-Jet High Speed)', 'Air-Jet', 'metres', 150.0, 750.0, true, 'Shed A - Poplin 40s'),
    ('a0000000-0000-0000-0000-000000000003', 'L-03', 'Loom 03 (Rapier Heavy Weave)', 'Rapier', 'metres', 100.0, 500.0, true, 'Shed B - Heavy Twill / Denim 3/1'),
    ('a0000000-0000-0000-0000-000000000004', 'L-04', 'Loom 04 (Rapier Heavy Weave)', 'Rapier', 'metres', 100.0, 500.0, true, 'Shed B - Oxford Shirting'),
    ('a0000000-0000-0000-0000-000000000005', 'L-05', 'Loom 05 (Rapier Flexible)', 'Rapier', 'metres', 100.0, 550.0, true, 'Shed B - Linen Blend'),
    ('a0000000-0000-0000-0000-000000000006', 'L-06', 'Loom 06 (Air-Jet High Speed)', 'Air-Jet', 'metres', 150.0, 750.0, true, 'Shed A - Voile 60s'),
    ('a0000000-0000-0000-0000-000000000007', 'L-07', 'Loom 07 (Air-Jet High Speed)', 'Air-Jet', 'metres', 150.0, 750.0, true, 'Shed A - Sheeting 30s'),
    ('a0000000-0000-0000-0000-000000000008', 'L-08', 'Loom 08 (Shuttle Traditional)', 'Shuttle', 'metres', 50.0, 300.0, true, 'Shed C - Selvedge Drill'),
    ('a0000000-0000-0000-0000-000000000009', 'L-09', 'Loom 09 (Shuttle Traditional)', 'Shuttle', 'metres', 50.0, 300.0, true, 'Shed C - Heavy Duck Canvas'),
    ('a0000000-0000-0000-0000-000000000010', 'L-10', 'Loom 10 (Air-Jet High Speed)', 'Air-Jet', 'metres', 150.0, 750.0, true, 'Shed A - Cotton Satin 50s'),
    ('a0000000-0000-0000-0000-000000000011', 'L-11', 'Loom 11 (Rapier Flexible)', 'Rapier', 'metres', 100.0, 550.0, true, 'Shed B - Yarn Dyed Check'),
    ('a0000000-0000-0000-0000-000000000012', 'L-12', 'Loom 12 (Air-Jet High Speed)', 'Air-Jet', 'metres', 150.0, 800.0, true, 'Shed A - Premium Combed Poplin')
ON CONFLICT (machine_code) DO UPDATE SET 
    name = EXCLUDED.name,
    machine_type = EXCLUDED.machine_type,
    notes = EXCLUDED.notes;

-- ------------------------------------------------------------------------------
-- 2. SHIFTS (Factory Shift Schedules)
-- ------------------------------------------------------------------------------
INSERT INTO public.shifts (id, shift_code, name, start_time, end_time, duration_minutes, is_active)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'M', 'Morning Shift', '06:00:00', '14:00:00', 480, true),
    ('b0000000-0000-0000-0000-000000000002', 'E', 'Evening Shift', '14:00:00', '22:00:00', 480, true),
    ('b0000000-0000-0000-0000-000000000003', 'N', 'Night Shift', '22:00:00', '06:00:00', 480, true)
ON CONFLICT (shift_code) DO UPDATE SET 
    name = EXCLUDED.name,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time;

-- ------------------------------------------------------------------------------
-- 3. PROFILES (Demo Personas)
-- Note: In Supabase production, auth.users rows are created first via Auth API.
-- These records illustrate the profile rows associated with demo accounts.
-- ------------------------------------------------------------------------------
INSERT INTO public.profiles (id, full_name, role, is_active)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'Ramesh Kumar (Operator)', 'operator', true),
    ('c0000000-0000-0000-0000-000000000002', 'Priya Sharma (Supervisor)', 'supervisor', true),
    ('c0000000-0000-0000-0000-000000000003', 'Vikram Mehta (Plant Admin)', 'admin', true)
ON CONFLICT (id) DO UPDATE SET 
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;
