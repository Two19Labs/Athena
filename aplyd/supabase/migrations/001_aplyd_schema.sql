-- ==============================================================================
-- APLYD: Vision-First Shop Floor Digitisation Schema
-- Textile Manufacturing Domain Schema Migration
-- Sibling Database Architecture to Gawdaam (Two19Labs)
-- Version: 1.0.0
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. PROFILES (Extends Supabase auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'operator')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. MACHINES (Looms Master Data)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.machines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    machine_code TEXT UNIQUE NOT NULL, -- e.g. 'L-01', 'L-12'
    name TEXT NOT NULL,               -- e.g. 'Loom 01 (Air-Jet)'
    machine_type TEXT NULL,           -- 'Air-Jet', 'Rapier', 'Shuttle'
    default_unit TEXT NOT NULL DEFAULT 'metres',
    min_expected_quantity NUMERIC NULL DEFAULT 50.0,
    max_expected_quantity NUMERIC NULL DEFAULT 1000.0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. SHIFTS (Factory Shift Schedules)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_code TEXT UNIQUE NOT NULL,  -- 'M', 'E', 'N'
    name TEXT NOT NULL,               -- 'Morning', 'Evening', 'Night'
    start_time TIME NOT NULL,         -- '06:00:00'
    end_time TIME NOT NULL,           -- '14:00:00'
    duration_minutes INTEGER NOT NULL DEFAULT 480,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. PRODUCTION FORMS (Physical Document & Extraction Tracking)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_number TEXT UNIQUE NOT NULL, -- Generated human-readable ID e.g. 'PF-2026-0001'
    storage_bucket TEXT NOT NULL DEFAULT 'production-forms',
    storage_path TEXT NOT NULL,       -- Path in private bucket: '{userId}/{formId}/{fileName}'
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    file_sha256 TEXT NULL,            -- Checksum for exact duplicate upload detection
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_status TEXT NOT NULL CHECK (
        processing_status IN ('uploaded', 'queued', 'processing', 'extracted', 'extraction_failed')
    ) DEFAULT 'uploaded',
    model_provider TEXT NULL DEFAULT 'HuggingFace',
    model_name TEXT NULL,             -- e.g. 'Qwen/Qwen2.5-VL-72B-Instruct'
    prompt_version TEXT NULL DEFAULT '1.0',
    schema_version TEXT NULL DEFAULT '1.0',
    raw_model_response JSONB NULL,    -- Raw JSON/completion from LLM
    extraction_payload JSONB NULL,    -- Normalized 5-state structured fields
    processing_error TEXT NULL,       -- Explicit error message when extraction fails
    processed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. PRODUCTION RECORDS (Normalized Shop-Floor Output Data)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_number TEXT UNIQUE NOT NULL, -- Human-readable identifier e.g. 'PR-2026-0001'
    production_form_id UUID NOT NULL REFERENCES public.production_forms(id) ON DELETE CASCADE,
    machine_id UUID NULL REFERENCES public.machines(id),
    machine_id_raw TEXT NULL,           -- Literal transcribed machine text
    shift_id UUID NULL REFERENCES public.shifts(id),
    shift_raw TEXT NULL,                -- Literal transcribed shift text
    production_date DATE NULL,
    production_date_raw TEXT NULL,      -- Literal transcribed date string
    production_quantity NUMERIC NULL CHECK (production_quantity >= 0),
    production_unit TEXT NOT NULL DEFAULT 'metres',
    material_reference TEXT NULL,       -- e.g. 'Cotton 40s Cambric'
    batch_reference TEXT NULL,          -- e.g. 'B-204'
    defects_count NUMERIC NULL CHECK (defects_count >= 0),
    defect_details TEXT NULL,           -- e.g. 'Uneven weave, warp break'
    downtime_minutes NUMERIC NULL CHECK (downtime_minutes >= 0),
    downtime_reason TEXT NULL,          -- e.g. 'Machine stoppage twice'
    remarks TEXT NULL,                  -- Operator notes
    final_payload JSONB NULL,           -- Full structured record snapshot
    status TEXT NOT NULL CHECK (
        status IN ('pending_review', 'returned_for_correction', 'approved', 'rejected')
    ) DEFAULT 'pending_review',
    validation_status TEXT NOT NULL CHECK (
        validation_status IN ('pass', 'warning', 'blocked')
    ) DEFAULT 'warning',
    submitted_by UUID NOT NULL REFERENCES public.profiles(id),
    reviewed_by UUID NULL REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ NULL,
    approval_note TEXT NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. PRODUCTION CORRECTIONS (Immutable Append-Only Audit Trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_corrections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    production_record_id UUID NOT NULL REFERENCES public.production_records(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,          -- e.g. 'production_quantity', 'machine_id'
    original_value JSONB NULL,        -- Raw AI extracted value
    corrected_value JSONB NULL,       -- Human corrected value
    reason TEXT NULL,                 -- Supervisor rationale note
    changed_by UUID NOT NULL REFERENCES public.profiles(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 7. PRODUCTION ALERTS (Deterministic Business Rule Exceptions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    production_record_id UUID NOT NULL REFERENCES public.production_records(id) ON DELETE CASCADE,
    production_form_id UUID NULL REFERENCES public.production_forms(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL,          -- 'duplicate_submission', 'unknown_machine', 'high_downtime'
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    field_key TEXT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'resolved', 'dismissed')) DEFAULT 'active',
    resolved_by UUID NULL REFERENCES public.profiles(id),
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 8. ERP SUBMISSIONS (Downstream Mock ERP Integration Log)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erp_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    production_record_id UUID NOT NULL REFERENCES public.production_records(id) ON DELETE CASCADE,
    idempotency_key TEXT UNIQUE NOT NULL, -- SHA-256 hash or stable UUID
    request_payload JSONB NOT NULL,
    response_payload JSONB NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'submitted', 'failed')) DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 1,
    external_reference TEXT NULL,      -- e.g. 'APLYD-ERP-2026-0001'
    last_error TEXT NULL,
    submitted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 9. PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_prod_records_status ON public.production_records(status);
CREATE INDEX IF NOT EXISTS idx_prod_records_date ON public.production_records(production_date);
CREATE INDEX IF NOT EXISTS idx_prod_records_machine ON public.production_records(machine_id);
CREATE INDEX IF NOT EXISTS idx_prod_records_form ON public.production_records(production_form_id);
CREATE INDEX IF NOT EXISTS idx_prod_forms_sha256 ON public.production_forms(file_sha256);
CREATE INDEX IF NOT EXISTS idx_prod_forms_status ON public.production_forms(processing_status);
CREATE INDEX IF NOT EXISTS idx_prod_corrections_record ON public.production_corrections(production_record_id);
CREATE INDEX IF NOT EXISTS idx_prod_alerts_record ON public.production_alerts(production_record_id, status);
CREATE INDEX IF NOT EXISTS idx_erp_submissions_record ON public.erp_submissions(production_record_id);
CREATE INDEX IF NOT EXISTS idx_erp_submissions_key ON public.erp_submissions(idempotency_key);

-- ------------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_submissions ENABLE ROW LEVEL SECURITY;

-- Helper function: Get current user role
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles: Users can read all active profiles, admins can manage
CREATE POLICY "Allow authenticated read profiles"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin manage profiles"
ON public.profiles FOR ALL TO authenticated
USING (public.get_current_role() = 'admin');

-- Machines & Shifts: All authenticated users can read, only admin can manage
CREATE POLICY "Allow authenticated read machines"
ON public.machines FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin manage machines"
ON public.machines FOR ALL TO authenticated
USING (public.get_current_role() = 'admin');

CREATE POLICY "Allow authenticated read shifts"
ON public.shifts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin manage shifts"
ON public.shifts FOR ALL TO authenticated
USING (public.get_current_role() = 'admin');

-- Production Forms: Operators can insert and view their own; supervisors & admins can view all
CREATE POLICY "Allow insert own production forms"
ON public.production_forms FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Allow read production forms"
ON public.production_forms FOR SELECT TO authenticated
USING (
    uploaded_by = auth.uid() OR 
    public.get_current_role() IN ('supervisor', 'admin')
);

-- Production Records:
-- Operators can insert draft records, read their own records, and update only if returned_for_correction.
-- Supervisors and admins can read, update (except ordinary edits on approved records), and review.
CREATE POLICY "Allow read production records"
ON public.production_records FOR SELECT TO authenticated
USING (
    submitted_by = auth.uid() OR 
    public.get_current_role() IN ('supervisor', 'admin')
);

CREATE POLICY "Allow operator insert production records"
ON public.production_records FOR INSERT TO authenticated
WITH CHECK (
    submitted_by = auth.uid() AND 
    status = 'pending_review'
);

CREATE POLICY "Allow supervisor update production records"
ON public.production_records FOR UPDATE TO authenticated
USING (
    public.get_current_role() IN ('supervisor', 'admin') AND
    status != 'approved' -- Ordinary update cannot edit approved records
);

-- Production Corrections: Authenticated users can read; supervisors & admins can insert
CREATE POLICY "Allow read corrections"
ON public.production_corrections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow supervisor insert corrections"
ON public.production_corrections FOR INSERT TO authenticated
WITH CHECK (
    public.get_current_role() IN ('supervisor', 'admin') AND
    changed_by = auth.uid()
);

-- Production Alerts: Authenticated read; supervisor/admin update
CREATE POLICY "Allow read alerts"
ON public.production_alerts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow supervisor update alerts"
ON public.production_alerts FOR UPDATE TO authenticated
USING (public.get_current_role() IN ('supervisor', 'admin'));

-- ERP Submissions: Supervisors and admins only
CREATE POLICY "Allow supervisor erp submissions"
ON public.erp_submissions FOR ALL TO authenticated
USING (public.get_current_role() IN ('supervisor', 'admin'));

-- ------------------------------------------------------------------------------
-- 11. ATOMIC APPROVAL STORED PROCEDURE (RPC)
-- ------------------------------------------------------------------------------
-- Transaction-safe approval function.
-- Validates:
-- 1. Caller must have 'supervisor' or 'admin' role (operators cannot approve).
-- 2. Record must not have unresolved blocking alerts.
-- 3. Marks record as 'approved', sets reviewed_by and reviewed_at.
-- 4. Records approval note and locks record against ordinary client mutations.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_production_record(
    p_record_id UUID,
    p_approval_note TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_role TEXT;
    v_record RECORD;
    v_has_blocking_alerts BOOLEAN;
BEGIN
    -- Verify caller role
    SELECT role INTO v_user_role FROM public.profiles WHERE id = auth.uid();
    IF v_user_role IS NULL OR v_user_role NOT IN ('supervisor', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only supervisors or admins can approve production records.';
    END IF;

    -- Fetch record
    SELECT * INTO v_record FROM public.production_records WHERE id = p_record_id;
    IF v_record IS NULL THEN
        RAISE EXCEPTION 'Production record not found with ID: %', p_record_id;
    END IF;

    IF v_record.status = 'approved' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Record is already approved.');
    END IF;

    -- Verify no blocking alerts exist
    SELECT EXISTS (
        SELECT 1 FROM public.production_alerts 
        WHERE production_record_id = p_record_id 
        AND severity = 'critical' 
        AND status = 'active'
    ) INTO v_has_blocking_alerts;

    IF v_has_blocking_alerts THEN
        RAISE EXCEPTION 'Cannot approve: Active critical alerts must be resolved first.';
    END IF;

    -- Verify required fields
    IF v_record.machine_id IS NULL OR v_record.production_date IS NULL OR 
       v_record.shift_id IS NULL OR v_record.production_quantity IS NULL THEN
        RAISE EXCEPTION 'Cannot approve: Required fields (Machine, Date, Shift, Quantity) cannot be missing.';
    END IF;

    -- Execute atomic update
    UPDATE public.production_records
    SET status = 'approved',
        validation_status = 'pass',
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        approval_note = p_approval_note,
        updated_at = NOW()
    WHERE id = p_record_id;

    RETURN jsonb_build_object(
        'success', true,
        'record_id', p_record_id,
        'status', 'approved',
        'reviewed_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
