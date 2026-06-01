import { deleteDueFromSupabase, ensureAuthenticated } from './api.js';
import { state } from './state.js';
import {
  ALLOWED_MIME,
  MAX_BATCH_FILES,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_MB,
  normalizeExtraction
} from './document-import-schema.js';
import { prepareFilesForImport } from './document-import-images.js';
import { inferDocumentHintsFromFiles, applyDocumentHints } from './document-import-hints.js';
import { hashBlob } from './utils.js';

const MIGRATION_HINT =
  'Esegui la migration supabase/migrations/20260531120000_split_amounts_document_imports.sql nel SQL Editor Supabase.';

export function validateFiles(fileList) {
  const files = [...fileList];
  if (!files.length) throw new Error('Seleziona almeno un file.');
  if (files.length > MAX_BATCH_FILES) throw new Error(`Massimo ${MAX_BATCH_FILES} file per import.`);
  let total = 0;
  for (const f of files) {
    total += f.size;
    const mime = (f.type || '').toLowerCase();
    const ext = (f.name || '').split('.').pop()?.toLowerCase();
    const okMime = ALLOWED_MIME.has(mime) || ['pdf', 'docx', 'jpeg', 'jpg', 'png', 'webp'].includes(ext);
    if (!okMime) throw new Error(`Formato non supportato: ${f.name}`);
  }
  if (total > MAX_IMPORT_BYTES) {
    const mb = (total / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Dimensione totale ${mb} MB oltre il limite di ${MAX_IMPORT_MB} MB. Riduci i file o importa meno pagine.`
    );
  }
  return files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function sourceLabelFromFiles(files) {
  if (files.length === 1) return files[0].name;
  return `${files.length} file (${files[0].name} …)`;
}

export async function hashFiles(files) {
  const parts = await Promise.all(files.map(f => hashBlob(f)));
  const combined = parts.join('|');
  const enc = new TextEncoder().encode(combined);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Verifica che migration e colonna split_amounts siano presenti. */
export async function ensureDocumentImportReady() {
  await ensureAuthenticated();
  const { error: impErr } = await state.supabase.from('document_imports').select('id').limit(1);
  if (impErr?.code === '42P01' || impErr?.message?.includes('document_imports')) {
    throw new Error(`Import documento non configurato sul database. ${MIGRATION_HINT}`);
  }
  if (impErr) throw impErr;

  const house = state.data.houses.find(h => Number.isFinite(Number(h.id)));
  if (!house) return;
  const { error: dueErr } = await state.supabase
    .from('dues')
    .select('id, split_amounts')
    .eq('house_id', Number(house.id))
    .limit(1);
  if (dueErr?.message?.includes('split_amounts') || dueErr?.code === '42703') {
    throw new Error(`Colonna split_amounts assente. ${MIGRATION_HINT}`);
  }
  if (dueErr && dueErr.code !== 'PGRST116') throw dueErr;
}

export async function extractFromDocument(houseId, files, importParties = null) {
  await ensureAuthenticated();
  await ensureDocumentImportReady();
  const prepared = await prepareFilesForImport([...files]);
  const sorted = validateFiles(prepared);
  const form = new FormData();
  form.append('house_id', String(houseId));
  if (importParties?.length) {
    form.append('import_parties', JSON.stringify(importParties));
  }
  for (const f of sorted) form.append('files', f, f.name);
  const hints = inferDocumentHintsFromFiles(sorted);
  if (hints.sources.length) {
    form.append('document_hints', JSON.stringify(hints));
  }

  const { data: sessionData, error: sessErr } = await state.supabase.auth.getSession();
  if (sessErr) throw sessErr;
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessione scaduta. Accedi di nuovo.');

  if (!state.supabaseAnonKey) {
    throw new Error('Configurazione Supabase mancante (chiave anon).');
  }

  const url = `${state.supabaseUrl}/functions/v1/extract-document`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: state.supabaseAnonKey
      },
      body: form
    });
  } catch (networkErr) {
    const raw = String(networkErr?.message || networkErr || '');
    if (/failed to fetch|networkerror|load failed|cors/i.test(raw)) {
      throw new Error(
        'Impossibile raggiungere extract-document su Supabase. Di solito la function non è deployata: `npx supabase functions deploy extract-document --project-ref cwvwfrrknmjwdpcnqvhv` e secret OPENAI_API_KEY o ANTHROPIC_API_KEY.'
      );
    }
    throw networkErr;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      body.error ||
      body.message ||
      (res.status === 502
        ? 'Errore servizio AI (502). Rideploy extract-document se il messaggio non è dettagliato.'
        : `Errore estrazione (${res.status})`);
    if (res.status === 404) {
      throw new Error(
        'Funzione extract-document non disponibile. Deploy della function e secret OPENAI_API_KEY o ANTHROPIC_API_KEY su Supabase.'
      );
    }
    throw new Error(msg);
  }
  return applyDocumentHints(normalizeExtraction(body), hints);
}

export async function findDuplicateImport(houseId, fileHash) {
  await ensureAuthenticated();
  const { data, error } = await state.supabase
    .from('document_imports')
    .select('id, source_label, created_at, committed_due_ids')
    .eq('house_id', Number(houseId))
    .eq('file_hash', fileHash)
    .eq('status', 'committed')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    if (error.code === '42P01') {
      throw new Error(`Tabella document_imports assente. ${MIGRATION_HINT}`);
    }
    throw error;
  }
  return data?.[0] || null;
}

/** Dovuti già presenti per stesso esercizio e tipo (oltre al controllo hash). */
export function findExistingDuesForImport(house, fiscalLabel, dueKinds) {
  const period = house.fiscalPeriods.find(p => p.label === String(fiscalLabel).trim());
  if (!period) return [];
  const kinds = new Set(dueKinds);
  return house.dues.filter(d => d.fiscalPeriodId === period.id && kinds.has(d.dueKind || 'preventivo'));
}

export async function recordDocumentImport(house, meta, extraction, dueIds) {
  await ensureAuthenticated();
  const user = state.user;
  const { error } = await state.supabase.from('document_imports').insert({
    house_id: Number(house.id),
    user_id: user.id,
    source_label: meta.sourceLabel,
    file_hash: meta.fileHash,
    mime_types: meta.mimeTypes,
    status: 'committed',
    extraction_json: extraction,
    committed_due_ids: dueIds.filter(id => Number.isFinite(Number(id))).map(Number)
  });
  if (error) {
    if (error.code === '42P01') throw new Error(`Tabella document_imports assente. ${MIGRATION_HINT}`);
    throw error;
  }
}

export async function deleteDuesByIds(house, dueIds) {
  const errors = [];
  for (const id of dueIds) {
    if (!id) continue;
    try {
      await deleteDueFromSupabase(house, id);
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  if (errors.length) throw new Error(`Errore eliminazione dovuti precedenti: ${errors[0]}`);
}
