-- ====================================================================
-- ATHENA LOOMVISION — MASTER DATABASE SCHEMA & SEED DATA
-- Domain: Textile Weaving Shop Floor Production Digitisation
-- Dialect: PostgreSQL (Supabase Compatible with RLS)
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. MASTER DATA TABLES

-- 2.1 Loom Master
CREATE TABLE IF NOT EXISTS public.shopfloor_looms (
    id TEXT PRIMARY KEY,                       -- e.g. 'L-104'
    shed TEXT NOT NULL,                        -- e.g. 'SHED-A', 'SHED-B'
    loom_type TEXT NOT NULL,                   -- 'Airjet', 'Rapier', 'Projectile', 'Shuttle'
    model_name TEXT NOT NULL,                  -- 'Tsudakoma ZAX9100', 'Toyota JAT810'
    target_rpm INTEGER NOT NULL DEFAULT 750,
    width_cm INTEGER NOT NULL DEFAULT 190,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2 Fabric Sort / Quality Master
CREATE TABLE IF NOT EXISTS public.shopfloor_sorts (
    sort_code TEXT PRIMARY KEY,                -- e.g. 'S-4040-68'
    description TEXT NOT NULL,                 -- '40s x 40s Plain Sheeting'
    warp_count TEXT NOT NULL,                  -- '40s Ring Spun'
    weft_count TEXT NOT NULL,                  -- '40s Ring Spun'
    epi INTEGER NOT NULL,                      -- Ends Per Inch (e.g. 100)
    ppi INTEGER NOT NULL,                      -- Picks Per Inch (e.g. 68)
    standard_width_inch INTEGER NOT NULL,
    target_efficiency_pct NUMERIC(5,2) NOT NULL DEFAULT 90.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.3 Downtime & Stoppage Master
CREATE TABLE IF NOT EXISTS public.shopfloor_downtime_codes (
    code TEXT PRIMARY KEY,                     -- e.g. 'DT-01'
    category TEXT NOT NULL,                    -- 'Warp', 'Weft', 'Mechanical', 'Electrical'
    label TEXT NOT NULL,                       -- 'Beam Knotting / Gaiting'
    allowed_tolerance_mins INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.4 Operator Roster
CREATE TABLE IF NOT EXISTS public.shopfloor_operators (
    operator_token TEXT PRIMARY KEY,           -- e.g. 'OP-482'
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,                        -- 'Weaver', 'Senior Weaver', 'Loom Master'
    shed_assigned TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PRODUCTION ENTRIES & TRANSACTION TABLES

-- 3.1 Shift Production Master
CREATE TABLE IF NOT EXISTS public.shopfloor_production_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_id TEXT NOT NULL,
    loom_id TEXT NOT NULL REFERENCES public.shopfloor_looms(id),
    production_date DATE NOT NULL,
    shift_code VARCHAR(2) NOT NULL,            -- 'A', 'B', 'C'
    operator_token TEXT REFERENCES public.shopfloor_operators(operator_token),
    sort_code TEXT REFERENCES public.shopfloor_sorts(sort_code),
    beam_number TEXT,
    
    -- Counter readings
    start_pick BIGINT NOT NULL,
    end_pick BIGINT NOT NULL,
    net_picks BIGINT NOT NULL,
    net_meters NUMERIC(10,2) NOT NULL,
    operating_rpm INTEGER NOT NULL DEFAULT 800,
    efficiency_pct NUMERIC(5,2) NOT NULL,
    
    -- Operational summary
    total_downtime_mins INTEGER NOT NULL DEFAULT 0,
    total_runtime_mins INTEGER NOT NULL DEFAULT 480,
    
    -- AI Extraction & Verification Metadata
    overall_confidence NUMERIC(3,2) NOT NULL,
    capture_quality_score NUMERIC(3,2) NOT NULL,
    validation_status TEXT NOT NULL,           -- 'PASSED', 'WARNINGS', 'FAILED'
    supervisor_status TEXT NOT NULL DEFAULT 'pending_review', -- 'auto_approved', 'manually_corrected', 'rejected'
    
    raw_image_url TEXT,
    idempotency_key TEXT UNIQUE NOT NULL,
    erp_doc_no TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    supervisor_remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 Defect Breakdown per Entry
CREATE TABLE IF NOT EXISTS public.shopfloor_defect_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    production_entry_id UUID NOT NULL REFERENCES public.shopfloor_production_entries(id) ON DELETE CASCADE,
    defect_type TEXT NOT NULL,                 -- 'warp_break', 'weft_break', 'slub', 'oil_stain'
    count INTEGER NOT NULL DEFAULT 1,
    severity TEXT NOT NULL DEFAULT 'minor',
    confidence NUMERIC(3,2) NOT NULL DEFAULT 0.95
);

-- 3.3 Stoppage / Downtime Events per Entry
CREATE TABLE IF NOT EXISTS public.shopfloor_stoppage_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    production_entry_id UUID NOT NULL REFERENCES public.shopfloor_production_entries(id) ON DELETE CASCADE,
    reason_code TEXT NOT NULL,                 -- 'DT-01', 'DT-02', etc.
    duration_minutes INTEGER NOT NULL,
    remarks TEXT,
    confidence NUMERIC(3,2) NOT NULL DEFAULT 0.90
);

-- 4. CONTINUOUS LEARNING & AUDIT TELEMETRY TABLE
CREATE TABLE IF NOT EXISTS public.shopfloor_audit_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_id TEXT NOT NULL,
    initial_ai_payload JSONB NOT NULL,
    final_supervisor_payload JSONB NOT NULL,
    modified_fields TEXT[] NOT NULL DEFAULT '{}',
    human_touch_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    review_time_ms INTEGER NOT NULL DEFAULT 0,
    failure_category TEXT,                     -- 'HANDWRITING_AMBIGUITY', 'MATH_DISCREPANCY', 'IMAGE_SKEW'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SEED MASTER DATA
INSERT INTO public.shopfloor_looms (id, shed, loom_type, model_name, target_rpm, width_cm) VALUES
('L-101', 'SHED-A', 'Airjet', 'Tsudakoma ZAX9100', 750, 190),
('L-102', 'SHED-A', 'Airjet', 'Tsudakoma ZAX9100', 750, 190),
('L-103', 'SHED-A', 'Airjet', 'Tsudakoma ZAX9100', 750, 190),
('L-104', 'SHED-A', 'Airjet', 'Toyota JAT810', 800, 210),
('L-105', 'SHED-A', 'Airjet', 'Toyota JAT810', 800, 210),
('L-201', 'SHED-B', 'Rapier', 'Picanol OptiMax-i', 550, 220),
('L-202', 'SHED-B', 'Rapier', 'Picanol OptiMax-i', 550, 220)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.shopfloor_sorts (sort_code, description, warp_count, weft_count, epi, ppi, standard_width_inch, target_efficiency_pct) VALUES
('S-6060-92', '60s x 60s Cambric High Density', '60s Compact', '60s Compact', 120, 92, 50, 88.0),
('S-4040-68', '40s x 40s Plain Sheeting Fabric', '40s Ring Spun', '40s Ring Spun', 100, 68, 63, 92.0),
('D-2020-54', '20s x 20s Heavy Denim Twill 3/1', '20s Indigo', '20s OE Cotton', 72, 54, 58, 85.0)
ON CONFLICT (sort_code) DO NOTHING;

INSERT INTO public.shopfloor_downtime_codes (code, category, label, allowed_tolerance_mins) VALUES
('DT-01', 'Warp', 'Beam Knotting / Gaiting', 120),
('DT-02', 'Electrical', 'Electrical / Inverter Trip', 60),
('DT-03', 'Weft', 'Weft Feeder Jam / Nozzle Fault', 45),
('DT-04', 'Mechanical', 'Mechanical Stoppage / Guide', 90),
('DT-05', 'Material', 'Yarn Wait / Cone Shortage', 30),
('DT-06', 'Maintenance', 'Preventive Oiling & Cleaning', 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.shopfloor_operators (operator_token, full_name, role, shed_assigned) VALUES
('OP-401', 'Ramesh Kumar', 'Weaver', 'SHED-A'),
('OP-402', 'Suresh Patil', 'Weaver', 'SHED-A'),
('OP-482', 'Manoj Verma', 'Senior Weaver', 'SHED-A'),
('OP-403', 'Aditya Sharma', 'Loom Master / Supervisor', 'SHED-A')
ON CONFLICT (operator_token) DO NOTHING;
