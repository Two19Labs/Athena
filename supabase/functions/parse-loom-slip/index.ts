import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

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
      if (response.ok || response.status !== 503) {
        return response;
      }
      console.warn(`HF API returned status ${response.status}. Retrying in ${delay}ms...`);
    } catch (err: any) {
      if (i === retries - 1) throw err;
      console.warn(`Fetch failed with error: ${err.message || err}. Retrying in ${delay}ms...`);
    }
    await new Promise(res => setTimeout(res, delay));
  }
  throw new Error("Request failed after maximum retries");
}

serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    // Optional auth check if Supabase credentials provided
    if (supabaseUrl && supabaseAnonKey && authHeader) {
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: userData, error: userErr } = await supabaseClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized session' }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
          status: 401,
        });
      }
    }

    const { imageBase64, mimeType, looms, sorts, downtimeCodes } = await req.json();

    if (!imageBase64) {
      throw new Error("No imageBase64 payload provided.");
    }

    const apiKey = (Deno.env.get('HF_API_KEY') || '').trim();
    if (!apiKey) {
      throw new Error("HF_API_KEY is not configured in environment.");
    }

    const loomListStr = Array.isArray(looms) ? looms.map((l: any) => l.id || l).join(", ") : "L-101 to L-120 (Airjet), L-201 to L-220 (Rapier)";
    const sortListStr = Array.isArray(sorts) ? sorts.map((s: any) => `${s.code} (${s.description || ''})`).join("; ") : "S-6060-92, S-4040-68, D-2020-54";
    const dtListStr = Array.isArray(downtimeCodes) ? downtimeCodes.map((d: any) => `${d.code}: ${d.label}`).join("; ") : "DT-01 to DT-06";

    const systemPrompt = `You are a specialized industrial AI vision model designed to digitize handwritten textile weaving shop-floor logs.
Convert the provided daily production slip photo into a strictly formatted JSON object matching this schema:

{
  "header": {
    "loomId": { "value": "string (e.g. 'L-104')", "confidence": 0.00-1.00, "isFlagged": boolean },
    "loomType": { "value": "'Airjet' | 'Rapier' | 'Projectile' | 'Shuttle'", "confidence": 0.00-1.00 },
    "date": { "value": "YYYY-MM-DD", "confidence": 0.00-1.00, "isFlagged": boolean },
    "shift": { "value": "'A' | 'B' | 'C' | ''", "confidence": 0.00-1.00, "isFlagged": boolean },
    "operatorId": { "value": "string (e.g. 'OP-482')", "confidence": 0.00-1.00, "isFlagged": boolean },
    "sortCode": { "value": "string (e.g. 'S-4040-68')", "confidence": 0.00-1.00, "isFlagged": boolean },
    "beamNumber": { "value": "string (e.g. 'BM-8842')", "confidence": 0.00-1.00, "isFlagged": boolean }
  },
  "readings": {
    "startPick": { "value": number, "confidence": 0.00-1.00 },
    "endPick": { "value": number, "confidence": 0.00-1.00, "isFlagged": boolean },
    "netPicks": { "extracted": number, "calculated": number, "matches": boolean, "confidence": 0.00-1.00 },
    "netMeters": { "value": number, "confidence": 0.00-1.00, "isFlagged": boolean },
    "loomRpm": { "value": number, "confidence": 0.00-1.00 },
    "efficiencyPct": { "value": number, "confidence": 0.00-1.00, "isFlagged": boolean }
  },
  "defects": [
    { "defectType": "warp_break | weft_break | slub | oil_stain | reed_mark | float", "count": number, "confidence": 0.00-1.00 }
  ],
  "downtime": [
    { "reasonCode": "string (e.g. 'DT-01')", "durationMinutes": number, "remarks": "string", "confidence": 0.00-1.00 }
  ],
  "remarks": "string"
}

FACTORY MASTER DATA TO GROUND AGAINST:
Registered Looms: ${loomListStr}
Registered Fabric Sorts: ${sortListStr}
Registered Downtime Codes: ${dtListStr}

CRITICAL RULES FOR NOISY / HANDWRITTEN SHOP-FLOOR SHEETS:
1. STRIKETHROUGHS: If an operator wrote a pick count, crossed it out with a pen stroke, and wrote a new number above or beside it, EXTRACT THE NEW NUMBER.
2. DIGIT DISAMBIGUATION: Carefully distinguish '1' from '7', '0' from '6' or '8', and '5' from '6'.
3. MISSING MANDATORY FIELDS: If the Shift box or Loom ID is blank, set value to "" and confidence to 0.00 and isFlagged to true.
4. CONFIDENCE SCORING: Output a realistic confidence score between 0.00 and 1.00 for each field based on handwriting clarity and contrast.
5. NO MARKDOWN: Output ONLY valid raw JSON. Do not wrap in \`\`\`json or add markdown code blocks.`;

    const dataUri = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`;
    const userContent = [
      { type: "text", text: "Analyze this textile weaving slip and extract all structured data." },
      { type: "image_url", image_url: { url: dataUri } }
    ];

    const candidateModels = [
      "Qwen/Qwen2.5-VL-72B-Instruct",
      "Qwen/Qwen2.5-VL-7B-Instruct",
      "meta-llama/Llama-3.2-11B-Vision-Instruct"
    ];

    let response: Response | null = null;
    let lastErr = "";

    for (const model of candidateModels) {
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
        console.log(`Using model: ${model}`);
        response = resp;
        break;
      }

      lastErr = await resp.text();
      if (resp.status === 400 && /not supported by any provider/i.test(lastErr)) {
        console.warn(`Model ${model} unsupported, trying next candidate...`);
        continue;
      }
      throw new Error(`HF API Error: ${resp.status} - ${lastErr}`);
    }

    if (!response) {
      throw new Error(`No vision model available. Last error: ${lastErr}`);
    }

    const resData = await response.json();
    const rawText = resData.choices[0].message.content.trim();

    let cleaned = rawText;
    if (cleaned.startsWith("```json")) cleaned = cleaned.substring(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.substring(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.substring(0, cleaned.length - 3);
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
