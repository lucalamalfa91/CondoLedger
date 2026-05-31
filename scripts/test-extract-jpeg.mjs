/**
 * Test estrazione singolo JPEG (stesso prompt di extract-document) + filtro nominativi.
 * Uso: node scripts/test-extract-jpeg.mjs "path/to/IMG_3066.JPEG"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeExtraction } from '../js/document-import-schema.js';
import { applyAutoFilterToPreview, effectivePreventivoTotal } from '../js/document-import-match.js';
import { buildResoconto } from '../js/document-import-resoconto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXTRACTION_SCHEMA = `{
  "fiscalYearLabel": "string es. 2024/2025",
  "fieldConfidence": { "fiscalYearLabel": 0.0-1.0 },
  "extractionNotes": "string",
  "summary": {
    "previousBalance": "number | null",
    "previousExerciseLabel": "string | null",
    "previousExerciseTotal": "number | null",
    "notes": "string"
  },
  "sections": [{
    "documentKind": "preventivo" | "consuntivo",
    "confidence": 0.0-1.0,
    "rows": [{
      "label": "nome condomino o unità",
      "unit": "interno opzionale",
      "millesimi": number | null,
      "total": "number",
      "preventivoAmount": "number | null",
      "saldoPrecedente": "number | null",
      "totaleDaVersare": "number | null",
      "confidence": 0.0-1.0,
      "installments": [{ "label": "Gen 2025", "periodStart": "YYYY-MM-DD", "periodEnd": "YYYY-MM-DD", "amount": number }]
    }],
    "costLines": [{ "description": "string", "amount": number }]
  }]
}`;

const IMPORT_PARTIES = [
  { role: 'owner', firstName: 'Luca', lastName: 'La Malfa' },
  { role: 'owner', firstName: 'Giulia', lastName: 'Andreazza' },
];

function buildPrompt() {
  const names = IMPORT_PARTIES.map((p) => [p.firstName, p.lastName].filter(Boolean).join(' '));
  return `Sei un assistente contabile per spese condominiali italiane. Analizza il/i documento/i (preventivo, consuntivo, ripartizioni per anagrafica, bilancio).

NOMINATIVI CONFIGURATI PER QUESTO IMMOBILE (priorità assoluta — devi includerli nel JSON):
${names.map((n) => `- ${n}`).join('\n')}

Cerca varianti nel documento: cognome/nome invertiti ("La Malfa Luca" vs "Luca La Malfa"), slash tra comproprietari sulla stessa riga ("Luca / Andreazza"), prefisso interno numerico (es. "111 - (PR)"), troncamenti ("Andreazz" per Andreazza).

IMPORTANTE: NON elencare tutti i condomini (61, 62, 63…). Includi SOLO le righe pertinenti ai nominativi sopra (di solito 1-2 righe).
Scorri TUTTE le pagine/foto: la riga cercata può essere in fondo alla tabella (es. interno 111).
Priorizza dati dalla pagina con colonne "TOTALE PREVENTIVO", "TOTALE DA VERSARE", "SALDO PREC." e rate (Rata n. 1, 2, …) con importi e date.

Per tabelle "ripartizioni preventivo/consuntivo" su PIÙ pagine/foto JPEG che ripetono gli stessi condomini con colonne diverse (spese generali, ascensore, totale preventivo, rate):
- consolidare in UNA sola riga per condomino;
- sezione **preventivo**: "total" e "preventivoAmount" = colonna **PREVENTIVO** o **TOTALE PREVENTIVO**, NON "TOTALE DA VERSARE";
- sezione **consuntivo**: "total" = colonna **TOTALE RENDICONTO** (o totale consuntivo esercizio), NON "TOTALE DOVUTO";
- "saldoPrecedente" = colonna **SALDO PREC.** (può essere negativo = credito); "totaleDaVersare" = **TOTALE DA VERSARE** o **TOTALE DOVUTO** se presente (solo informativo);
- copiare nel campo label il nominativo completo della colonna anagrafica, es. "111 - (PR) La Malfa Luca / Andreazza" (inclusi prefisso interno e slash tra comproprietari);
- estrarre le rate (Rata n. 1, 2, …) con importi e date se visibili.
Se presenti nel documento, compila "summary" con saldi precedenti, etichetta esercizio precedente e relativi totali.
Se ci sono sia preventivo che consuntivo, crea due sezioni in "sections".
Rispondi SOLO con JSON valido conforme a questo schema:
${EXTRACTION_SCHEMA}`;
}

async function extractFromImage(filePath) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY non impostata');

  const buf = fs.readFileSync(filePath);
  const b64 = buf.toString('base64');
  const name = path.basename(filePath);

  const body = {
    model: 'gpt-4o',
    temperature: 0.1,
    max_completion_tokens: 8192,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Rispondi solo con JSON. Importi in euro come numeri.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt() },
          { type: 'text', text: `--- File: ${name} ---` },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'high' },
          },
        ],
      },
    ],
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `OpenAI ${res.status}`);
  }

  const text = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text);
}

function printReport(label, preview, extraction) {
  console.log('\n===', label, '===');
  console.log('Esercizio:', extraction.fiscalYearLabel);
  console.log('Note:', extraction.extractionNotes || '—');
  console.log('Sezioni:', extraction.sections?.map((s) => s.documentKind).join(', ') || '—');
  console.log('Filter mode:', preview.filterMode, preview.autoFilterFailed ? '(FALLITO)' : '');

  for (const section of preview.extraction.sections || []) {
    const meta = preview.matchMeta?.[section.documentKind];
    console.log(`\n--- ${section.documentKind} ---`);
    if (meta?.noMatch) console.log('  MATCH: nessuna riga');
    else console.log('  MATCH:', meta?.ownerIdx, meta?.warning || 'ok');

    for (const row of section.rows || []) {
      console.log('  Label:', row.label);
      console.log('  Total:', row.total);
      console.log('  Preventivo:', row.preventivoAmount ?? '—');
      console.log('  Saldo prec.:', row.saldoPrecedente ?? '—');
      console.log('  Totale dovuto/versare:', row.totaleDaVersare ?? '—');
      if (row.installments?.length) {
        const sum = row.installments.reduce((s, i) => s + Number(i.amount || 0), 0);
        console.log('  Rate:', row.installments.map((i) => i.amount).join(' + '), '=', sum.toFixed(2));
      }
    }
  }

  const resoconto = buildResoconto(preview, { fiscalPeriods: [] });
  console.log('\n--- Resoconto ---');
  console.log('  Saldo prec.:', resoconto.previousBalance);
  console.log('  Preventivo:', resoconto.preventivoTotal);
  console.log('  Consuntivo:', resoconto.consuntivoTotal);
  console.log('  Carryover:', resoconto.applyCarryover, resoconto.carryoverAmount);
}

async function main() {
  const fileArg =
    process.argv[2] ||
    'C:\\Users\\luca.la-malfa\\Documents\\Spese Condiminiali\\Via Anzani\\2024-2025\\IMG_3066.JPEG';

  if (!fs.existsSync(fileArg)) {
    console.error('File non trovato:', fileArg);
    process.exit(1);
  }

  console.log('Estrazione da:', fileArg);
  const raw = await extractFromImage(fileArg);
  const extraction = normalizeExtraction(raw);

  const previewBefore = {
    confirmedSections: {},
    selectedRowIndex: {},
    extraction: JSON.parse(JSON.stringify(extraction)),
  };
  printReport('Prima del filtro', previewBefore, extraction);

  const preview = {
    confirmedSections: {},
    selectedRowIndex: {},
    extraction: JSON.parse(JSON.stringify(extraction)),
  };
  applyAutoFilterToPreview(preview, { importParties: IMPORT_PARTIES });
  printReport('Dopo filtro nominativi', preview, preview.extraction);

  const row = preview.extraction.sections?.[0]?.rows?.[0];
  if (row) {
    const eff = effectivePreventivoTotal(row);
    const doubleBug = eff > 4000 && row.totaleDaVersare && Math.abs(eff - 2 * row.totaleDaVersare) < 50;
    console.log('\n=== Check regressione doppia somma ===');
    console.log('  effectivePreventivoTotal:', eff);
    console.log('  Possibile doppio conteggio:', doubleBug ? 'SÌ ⚠' : 'NO ✓');
  }
}

main().catch((e) => {
  console.error('ERRORE:', e.message);
  process.exit(1);
});
