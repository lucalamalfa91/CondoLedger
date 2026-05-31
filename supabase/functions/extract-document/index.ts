import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const MAX_IMPORT_MB = 30;
const MAX_BYTES = MAX_IMPORT_MB * 1024 * 1024;
const MAX_FILES = 40;

const EXTRACTION_SCHEMA = `{
  "fiscalYearLabel": "string es. 2024/2025",
  "fieldConfidence": { "fiscalYearLabel": 0.0-1.0 },
  "extractionNotes": "string",
  "summary": {
    "previousBalance": "number | null saldo/riporto esercizio precedente per la riga o documento",
    "previousExerciseLabel": "string | null es. 2023/2024",
    "previousExerciseTotal": "number | null totale consuntivo/preventivo esercizio precedente",
    "notes": "string"
  },
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
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Authorization richiesta' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const aiProvider = (Deno.env.get('AI_PROVIDER') || 'auto').toLowerCase();

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

    const provider = pickAiProvider(openaiKey, anthropicKey, aiProvider);
    if (!provider) {
      return json({
        error:
          'Nessuna chiave AI sulla Edge Function. Imposta ANTHROPIC_API_KEY (Claude, sk-ant-...) oppure OPENAI_API_KEY in Supabase → Edge Functions → Secrets.',
      }, 503);
    }

    const promptText = buildPrompt();
    const filePayloads = await buildFilePayloads(files);

    let parsed: Record<string, unknown>;
    if (provider === 'anthropic') {
      parsed = await extractWithAnthropic(anthropicKey!.trim(), promptText, filePayloads);
    } else {
      parsed = await extractWithOpenAi(openaiKey!.trim(), promptText, filePayloads);
    }

    return json(parsed, 200);
  } catch (e) {
    console.error(e);
    const msg = String(e?.message || e);
    const status = /OpenAI:|Claude:|troppo pesant|non valida/i.test(msg) ? 502 : 500;
    return json({ error: msg }, status);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** auto: usa Anthropic se ANTHROPIC_API_KEY è presente, altrimenti OpenAI. */
function pickAiProvider(
  openaiKey: string | undefined,
  anthropicKey: string | undefined,
  aiProvider: string,
): 'anthropic' | 'openai' | null {
  const openai = openaiKey?.trim() || '';
  const anthropic = anthropicKey?.trim() || '';
  const pref = aiProvider.toLowerCase();

  if (pref === 'anthropic') return anthropic ? 'anthropic' : openai ? 'openai' : null;
  if (pref === 'openai') return openai ? 'openai' : anthropic ? 'anthropic' : null;
  if (anthropic) return 'anthropic';
  if (openai) return 'openai';
  return null;
}

function buildPrompt(): string {
  return `Sei un assistente contabile per spese condominiali italiane. Analizza il/i documento/i (preventivo, consuntivo, ripartizioni per anagrafica, bilancio).
Estrai TUTTE le righe condomino visibili con nome/unità, totale, rate con importi e date esatte se presenti.
Se presenti nel documento, compila "summary" con saldi precedenti, etichetta esercizio precedente e relativi totali.
Se ci sono sia preventivo che consuntivo, crea due sezioni in "sections".
Rispondi SOLO con JSON valido conforme a questo schema:
${EXTRACTION_SCHEMA}`;
}

type FilePayload =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mime: string; b64: string }
  | { kind: 'pdf'; name: string; b64: string };

async function buildFilePayloads(files: File[]): Promise<FilePayload[]> {
  const out: FilePayload[] = [];
  for (const file of files) {
    const buf = await file.arrayBuffer();
    const mime = file.type || guessMime(file.name);

    if (mime.includes('wordprocessingml') || file.name.endsWith('.docx')) {
      const text = await extractDocxText(buf);
      out.push({
        kind: 'text',
        text: `--- File: ${file.name} (testo estratto) ---\n${text.slice(0, 120000)}`,
      });
    } else if (mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      out.push({ kind: 'pdf', name: file.name, b64: arrayBufferToBase64(buf) });
    } else if (mime.startsWith('image/')) {
      const imageMime = mime === 'image/jpg' ? 'image/jpeg' : mime;
      out.push({ kind: 'image', mime: imageMime, b64: arrayBufferToBase64(buf) });
    } else {
      out.push({ kind: 'text', text: `File ${file.name}: formato non elaborabile automaticamente.` });
    }
  }
  return out;
}

async function extractWithOpenAi(
  openaiKey: string,
  promptText: string,
  payloads: FilePayload[],
): Promise<Record<string, unknown>> {
  const contentParts: Record<string, unknown>[] = [{ type: 'text', text: promptText }];
  for (const p of payloads) {
    if (p.kind === 'text') contentParts.push({ type: 'text', text: p.text });
    if (p.kind === 'pdf') {
      contentParts.push({
        type: 'file',
        file: {
          filename: p.name,
          file_data: `data:application/pdf;base64,${p.b64}`,
        },
      });
    }
    if (p.kind === 'image') {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${p.mime};base64,${p.b64}`,
          detail: 'high',
        },
      });
    }
  }

  const body = JSON.stringify({
    model: 'gpt-4o',
    temperature: 0.1,
    max_completion_tokens: 16384,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Rispondi solo con JSON. Importi in euro come numeri.' },
      { role: 'user', content: contentParts },
    ],
  });

  if (body.length > 18_000_000) {
    throw new Error(
      'Immagini troppo pesanti anche dopo la compressione. Carica meno foto per volta o scatta a risoluzione più bassa.',
    );
  }

  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('OpenAI error', aiRes.status, errText);
    throw new Error(openAiErrorMessage(errText));
  }

  const aiJson = await aiRes.json();
  return parseJsonFromModel(aiJson.choices?.[0]?.message?.content || '{}');
}

async function extractWithAnthropic(
  anthropicKey: string,
  promptText: string,
  payloads: FilePayload[],
): Promise<Record<string, unknown>> {
  const content: Record<string, unknown>[] = [{ type: 'text', text: promptText }];
  for (const p of payloads) {
    if (p.kind === 'text') content.push({ type: 'text', text: p.text });
    if (p.kind === 'pdf') {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: p.b64,
        },
      });
    }
    if (p.kind === 'image') {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: p.mime,
          data: p.b64,
        },
      });
    }
  }

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      temperature: 0.1,
      system: 'Rispondi solo con JSON valido. Importi in euro come numeri.',
      messages: [{ role: 'user', content }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Anthropic error', aiRes.status, errText);
    throw new Error(anthropicErrorMessage(errText));
  }

  const aiJson = await aiRes.json();
  const block = aiJson.content?.find((b: { type: string }) => b.type === 'text');
  return parseJsonFromModel(block?.text || '{}');
}

function parseJsonFromModel(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const jsonStr = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error(`Risposta AI non valida: ${jsonStr.slice(0, 200)}`);
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  return encodeBase64(new Uint8Array(buf));
}

function openAiErrorMessage(errText: string): string {
  try {
    const j = JSON.parse(errText);
    const msg = j?.error?.message;
    if (typeof msg === 'string' && msg.length) return `OpenAI: ${msg}`;
  } catch {
    /* ignore */
  }
  const trimmed = errText.trim().slice(0, 280);
  return trimmed ? `OpenAI: ${trimmed}` : 'Errore servizio AI (OpenAI). Verifica credito e chiave API.';
}

function anthropicErrorMessage(errText: string): string {
  try {
    const j = JSON.parse(errText);
    const msg = j?.error?.message;
    if (typeof msg === 'string' && msg.length) return `Claude: ${msg}`;
  } catch {
    /* ignore */
  }
  const trimmed = errText.trim().slice(0, 280);
  return trimmed ? `Claude: ${trimmed}` : 'Errore servizio AI (Anthropic). Verifica credito e chiave API.';
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
