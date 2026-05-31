import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_IMPORT_MB = 30;
const MAX_BYTES = MAX_IMPORT_MB * 1024 * 1024;
const MAX_FILES = 40;

const EXTRACTION_SCHEMA = `{
  "fiscalYearLabel": "string es. 2024/2025",
  "fieldConfidence": { "fiscalYearLabel": 0.0-1.0 },
  "extractionNotes": "string",
  "sections": [{
    "documentKind": "preventivo" | "consuntivo",
    "confidence": 0.0-1.0,
    "rows": [{
      "label": "nome condomino o unità",
      "unit": "interno opzionale",
      "millesimi": number | null,
      "total": number,
      "confidence": 0.0-1.0,
      "installments": [{ "label": "Gen 2025", "periodStart": "YYYY-MM-DD", "periodEnd": "YYYY-MM-DD", "amount": number }]
    }],
    "costLines": [{ "description": "string", "amount": number }]
  }]
}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Authorization richiesta' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Sessione non valida' }, 401);
    }

    const form = await req.formData();
    const houseId = Number(form.get('house_id'));
    if (!Number.isFinite(houseId)) {
      return json({ error: 'house_id mancante' }, 400);
    }

    const { data: house } = await supabase
      .from('houses')
      .select('id')
      .eq('id', houseId)
      .eq('user_id', user.id)
      .single();
    if (!house) return json({ error: 'Immobile non trovato' }, 403);

    const files: File[] = [];
    for (const entry of form.getAll('files')) {
      if (entry instanceof File) files.push(entry);
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!files.length) return json({ error: 'Nessun file' }, 400);
    if (files.length > MAX_FILES) return json({ error: `Massimo ${MAX_FILES} file` }, 400);

    let totalSize = 0;
    for (const f of files) totalSize += f.size;
    if (totalSize > MAX_BYTES) {
      return json({ error: `Dimensione totale oltre ${MAX_IMPORT_MB} MB` }, 400);
    }

    if (!openaiKey) {
      return json({
        error: 'OPENAI_API_KEY non configurata sulla Edge Function. Impostala in Supabase → Edge Functions → Secrets.',
      }, 503);
    }

    const contentParts: unknown[] = [
      {
        type: 'text',
        text: `Sei un assistente contabile per spese condominiali italiane. Analizza il/i documento/i (preventivo, consuntivo, ripartizioni per anagrafica, bilancio).
Estrai TUTTE le righe condomino visibili con nome/unità, totale, rate con importi e date esatte se presenti.
Se ci sono sia preventivo che consuntivo, crea due sezioni in "sections".
Rispondi SOLO con JSON valido conforme a questo schema:
${EXTRACTION_SCHEMA}`,
      },
    ];

    for (const file of files) {
      const buf = await file.arrayBuffer();
      const mime = file.type || guessMime(file.name);

      if (mime.includes('wordprocessingml') || file.name.endsWith('.docx')) {
        const text = await extractDocxText(buf);
        contentParts.push({
          type: 'text',
          text: `--- File: ${file.name} (testo estratto) ---\n${text.slice(0, 120000)}`,
        });
      } else if (mime.startsWith('image/') || mime === 'application/pdf') {
        const b64 = arrayBufferToBase64(buf);
        contentParts.push({
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${b64}` },
        });
      } else {
        contentParts.push({
          type: 'text',
          text: `File ${file.name}: formato non elaborabile automaticamente.`,
        });
      }
    }

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Rispondi solo con JSON. Importi in euro come numeri.' },
          { role: 'user', content: contentParts },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('OpenAI error', errText);
      return json({ error: 'Errore servizio AI' }, 502);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: 'Risposta AI non valida', extractionNotes: raw.slice(0, 500) }, 502);
    }

    return json(parsed, 200);
  } catch (e) {
    console.error(e);
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Base64 senza spread su buffer grandi (evita stack overflow su PDF ~5 MB). */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function guessMime(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function extractDocxText(buf: ArrayBuffer): Promise<string> {
  const { unzipSync } = await import('https://esm.sh/fflate@0.8.2?target=deno');
  const files = unzipSync(new Uint8Array(buf));
  const docXml = files['word/document.xml'];
  if (!docXml) return '';
  const xml = new TextDecoder().decode(docXml);
  return xml
    .replace(/<w:tab[^/]*\/>/g, '\t')
    .replace(/<w:br[^/]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
