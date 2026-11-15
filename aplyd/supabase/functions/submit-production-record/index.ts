import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.length === 0
    ? '*'
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid session' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (!profile || !['supervisor', 'admin'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: Only supervisors or admins can dispatch to ERP' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const { recordId, simulateFailure } = await req.json();
    if (!recordId) {
      throw new Error("Missing recordId in request payload.");
    }

    // Fetch the production record
    const { data: record, error: rErr } = await supabase
      .from('production_records')
      .select('*, machines(machine_code, name), shifts(shift_code, name)')
      .eq('id', recordId)
      .single();

    if (rErr || !record) {
      throw new Error(`Production record not found: ${recordId}`);
    }

    if (record.status !== 'approved') {
      throw new Error(`Cannot submit to ERP: Record is in '${record.status}' status. Only 'approved' records can be submitted.`);
    }

    // Check existing ERP submission for idempotency
    const idempotencyKey = `ERP-IDEMPOTENCY-${recordId}`;
    const { data: existingSub } = await supabase
      .from('erp_submissions')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existingSub && existingSub.status === 'submitted') {
      return new Response(JSON.stringify({
        success: true,
        message: "Record previously submitted to ERP (Idempotent response)",
        erp_reference: existingSub.external_reference,
        received_at: existingSub.submitted_at,
        is_replay: true
      }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Simulate optional failure for testing retry flow
    if (simulateFailure) {
      const failedPayload = {
        error: "ERP Gateway Timeout: Simulated destination server unavailable",
        timestamp: new Date().toISOString()
      };
      await supabase.from('erp_submissions').upsert({
        production_record_id: recordId,
        idempotency_key: idempotencyKey,
        request_payload: record,
        response_payload: failedPayload,
        status: 'failed',
        attempt_count: (existingSub?.attempt_count || 0) + 1,
        last_error: failedPayload.error,
        updated_at: new Date().toISOString()
      }, { onConflict: 'idempotency_key' });

      return new Response(JSON.stringify({
        success: false,
        error: failedPayload.error,
        retryable: true
      }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 504,
      });
    }

    // Generate external reference
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const erpReference = `APLYD-ERP-${new Date().getFullYear()}-${randomSuffix}`;
    const receivedAt = new Date().toISOString();

    const erpRequestPayload = {
      aplyd_record_id: record.id,
      record_number: record.record_number,
      machine_code: record.machines?.machine_code || record.machine_id_raw,
      production_date: record.production_date,
      shift_code: record.shifts?.shift_code || record.shift_raw,
      production_quantity: record.production_quantity,
      production_unit: record.production_unit,
      material_reference: record.material_reference,
      batch_reference: record.batch_reference,
      defects_count: record.defects_count,
      defect_details: record.defect_details,
      downtime_minutes: record.downtime_minutes,
      downtime_reason: record.downtime_reason,
      remarks: record.remarks,
      approved_by: record.reviewed_by,
      approved_at: record.reviewed_at
    };

    const erpResponsePayload = {
      status: "ACKNOWLEDGED",
      erp_reference: erpReference,
      received_at: receivedAt,
      message: "Textile shop-floor production telemetry ingested into manufacturing ledger."
    };

    // Upsert into erp_submissions
    await supabase.from('erp_submissions').upsert({
      production_record_id: recordId,
      idempotency_key: idempotencyKey,
      request_payload: erpRequestPayload,
      response_payload: erpResponsePayload,
      status: 'submitted',
      attempt_count: (existingSub?.attempt_count || 0) + 1,
      external_reference: erpReference,
      submitted_at: receivedAt,
      last_error: null,
      updated_at: receivedAt
    }, { onConflict: 'idempotency_key' });

    return new Response(JSON.stringify({
      success: true,
      message: "Production record successfully ingested by Mock ERP endpoint",
      erp_reference: erpReference,
      received_at: receivedAt,
      is_replay: false
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "ERP submission failed"
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
