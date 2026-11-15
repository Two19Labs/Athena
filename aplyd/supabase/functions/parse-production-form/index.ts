import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

// Allowed Origins for CORS
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

async function fetchWithRetry(url: string, options: any, retries = 3, delay = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || (response.status !== 503 && response.status !== 429)) {
        return response;
      }
      console.warn(`HF Vision API returned status ${response.status}. Retrying in ${delay}ms...`);
    } catch (err: any) {
      if (i === retries - 1) throw err;
      console.warn(`Fetch failed with error: ${err.message || err}. Retrying in ${delay}ms...`);
    }
    await new Promise(res => setTimeout(res, delay));
  }
  throw new Error("Vision extraction request failed after maximum retries");
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

    // Verify caller JWT
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing bearer token' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid session' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const body = await req.json();
    const { formId, imageBase64, mimeType } = body;

    let base64Data = imageBase64;
    let imageMime = mimeType || 'image/jpeg';
    let formRecord: any = null;

    if (formId) {
      const { data: fData, error: fErr } = await supabase
        .from('production_forms')
        .select('*')
        .eq('id', formId)
        .single();
      if (fErr || !fData) {
        throw new Error(`Production form not found with id: ${formId}`);
      }
      formRecord = fData;

      // If base64 was not passed directly, download from private bucket
      if (!base64Data && formRecord.storage_path) {
        const { data: fileBlob, error: downloadErr } = await supabase.storage
          .from(formRecord.storage_bucket || 'production-forms')
          .download(formRecord.storage_path);
        if (downloadErr || !fileBlob) {
          throw new Error(`Failed to retrieve form image from storage: ${downloadErr?.message}`);
        }
        const arrayBuf = await fileBlob.arrayBuffer();
        base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
        imageMime = formRecord.mime_type || 'image/jpeg';
      }
    }

    if (!base64Data) {
      throw new Error("No image data provided. Please provide imageBase64 or a valid formId.");
    }

    const apiKey = (Deno.env.get('HF_API_KEY') || '').trim();
    if (!apiKey) {
      throw new Error("HF_API_KEY is not configured on the server.");
    }

    // Load active machines and shifts for contextual mapping
    const { data: machinesList } = await supabase.from('machines').select('id, machine_code, name').eq('is_active', true);
    const { data: shiftsList } = await supabase.from('shifts').select('id, shift_code, name').eq('is_active', true);

    const machinesText = (machinesList || []).map(m => `"${m.machine_code}" (${m.name})`).join(", ");
    const shiftsText = (shiftsList || []).map(s => `"${s.shift_code}" (${s.name})`).join(", ");

    const systemPrompt = `You are an expert document understanding and vision extraction system for textile manufacturing shop-floor forms.
You inspect photos of handwritten or printed paper production clipboard sheets and extract production records into a strict JSON contract.

Available Factory Machines (Looms): [${machinesText}]
Available Factory Shifts: [${shiftsText}]

OUTPUT SCHEMA (Return ONLY valid JSON, no markdown fences, no explanatory text):
{
  "schema_version": "1.0",
  "form_type": "textile_shopfloor_production",
  "overall_status": "needs_review",
  "fields": {
    "machine_id": { "value": "string or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "production_date": { "value": "YYYY-MM-DD or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "shift": { "value": "Morning|Evening|Night or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "production_quantity": { "value": "number or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "production_unit": { "value": "metres|picks|yards", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "material_reference": { "value": "string or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "batch_reference": { "value": "string or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "defects_count": { "value": "number or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "defect_details": { "value": "string or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "downtime_minutes": { "value": "number or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "downtime_reason": { "value": "string or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null },
    "remarks": { "value": "string or null", "raw_value": "string or null", "status": "read|uncertain|missing|illegible|invalid", "reason": "string or null", "confidence": null }
  }
}

STRICT EXTRACTION RULES:
1. Never invent or hallucinate missing information.
2. An empty/blank column must have value: null, raw_value: null, and status: "missing".
3. An explicit written zero (e.g. "0 defects" or "0") must have value: 0 and status: "read". Zero is NOT missing.
4. If handwriting is ambiguous (e.g. a digit could be 3 or 8, or letter M vs N), set status: "uncertain" and state candidate alternatives in reason.
5. If text is damaged, smudged, stained, or illegible scribble, set status: "illegible".
6. In raw_value, preserve literal verbatim transcription.
7. Normalize dates to ISO YYYY-MM-DD only if unambiguous. If ambiguous (e.g. 05/06/26), flag as uncertain.
8. Normalize downtime hours into total minutes (e.g. "2 hours" -> 120, "45 min" -> 45).
9. Map loom numbers to standard codes (e.g. "Loom 12" -> "L-12").`;

    const dataUri = `data:${imageMime};base64,${base64Data}`;
    const userContent = [
      { type: "text", text: "Analyze this textile manufacturing shop-floor form image and extract all production telemetry into the strict JSON schema." },
      { type: "image_url", image_url: { url: dataUri } }
    ];

    const candidateModels = [
      "Qwen/Qwen2.5-VL-72B-Instruct",
      "Qwen/Qwen2.5-VL-7B-Instruct",
      "meta-llama/Llama-3.2-11B-Vision-Instruct"
    ];

    let response: Response | null = null;
    let selectedModel = "";
    let lastErr = "";

    for (const model of candidateModels) {
      try {
        const resp = await fetchWithRetry("https://router.huggingface.co/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent }
            ],
            max_tokens: 1500,
            temperature: 0.1
          })
        });

        if (resp.ok) {
          response = resp;
          selectedModel = model;
          break;
        }
        lastErr = await resp.text();
        console.warn(`Model ${model} returned ${resp.status}: ${lastErr}`);
      } catch (err: any) {
        lastErr = err.message || String(err);
        console.warn(`Attempt with ${model} failed: ${lastErr}`);
      }
    }

    if (!response) {
      throw new Error(`All vision model attempts failed. Last error: ${lastErr}`);
    }

    const resData = await response.json();
    const rawContent = resData.choices[0].message.content.trim();

    let cleanJson = rawContent;
    if (cleanJson.startsWith("```json")) cleanJson = cleanJson.substring(7);
    if (cleanJson.startsWith("```")) cleanJson = cleanJson.substring(3);
    if (cleanJson.endsWith("```")) cleanJson = cleanJson.substring(0, cleanJson.length - 3);
    cleanJson = cleanJson.trim();

    const parsedExtraction = JSON.parse(cleanJson);

    // Update production_forms if formId was provided
    if (formId) {
      await supabase
        .from('production_forms')
        .update({
          processing_status: 'extracted',
          model_name: selectedModel,
          raw_model_response: resData,
          extraction_payload: parsedExtraction,
          processed_at: new Date().toISOString()
        })
        .eq('id', formId);
    }

    return new Response(JSON.stringify({
      success: true,
      model: selectedModel,
      data: parsedExtraction
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("parse-production-form error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Failed to process production form"
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
