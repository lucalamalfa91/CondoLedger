/**
 * Test classificazione + pipeline per PDF Il Parco 2025/2026.
 * 1) Heuristiche filename (senza AI)
 * 2) Pipeline con dati attesi dal PDF (LA MALFA)
 * 3) Opzionale: estrazione live OpenAI (--live)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  inferDocumentHints,
  inferDocumentHintsFromFiles,
  applyDocumentHints,
  formatHintsForPrompt
} from '../js/document-import-hints.js';
import { normalizeExtraction } from '../js/document-import-schema.js';
import { applyAutoFilterToPreview, effectivePreventivoTotal } from '../js/document-import-match.js';
import { buildResoconto } from '../js/document-import-resoconto.js';
import { validateInstallmentsVsTotal } from '../js/document-import-validate.js';

const PDF_PATH =
  'C:\\Users\\luca.la-malfa\\Documents\\Spese Condiminiali\\Il Parco\\2025-2026\\Preventivo ripartizioni per anagrafica 2025_26.pdf';

const PARTIES = [{ role: 'owner', firstName: 'Luca', lastName: 'La Malfa' }];

/** Valori attesi riga LA MALFA (PDF pag. 2-3, colonna Totale = 1.424,79). */
const EXPECTED = {
  fiscalYearLabel: '2025/2026',
  documentKind: 'preventivo',
  label: 'LA MALFA',
  total: 1424.79,
  saldoPrecedente: -75.72,
  installments: [
    { periodStart: '2025-06-20', amount: 90.9 },
    { periodStart: '2025-07-15', amount: 90.9 },
    { periodStart: '2025-10-30', amount: 89.12 },
    { periodStart: '2025-11-30', amount: 164.84 },
    { periodStart: '2025-12-30', amount: 164.84 },
    { periodStart: '2026-01-30', amount: 164.84 },
    { periodStart: '2026-02-28', amount: 164.84 },
    { periodStart: '2026-03-30', amount: 164.84 },
    { periodStart: '2026-04-30', amount: 164.84 },
    { periodStart: '2026-05-30', amount: 164.8 }
  ]
};

function mockExtractionFromPdf() {
  return {
    fiscalYearLabel: '2025/2026',
    extractionNotes: 'Preventivo ripartizioni per anagrafica — Palazzina 1',
    sections: [
      {
        documentKind: 'preventivo',
        confidence: 0.95,
        rows: [
          {
            label: 'LA MALFA',
            preventivoAmount: EXPECTED.total,
            total: EXPECTED.total,
            saldoPrecedente: EXPECTED.saldoPrecedente,
            totaleDaVersare: EXPECTED.total,
            installments: EXPECTED.installments.map(i => ({ ...i, label: '' })),
            confidence: 0.93
          }
        ]
      }
    ]
  };
}

function testHints() {
  const hints = inferDocumentHints([path.basename(PDF_PATH), '2025-2026']);
  const ok =
    hints.suggestedKind === 'preventivo' &&
    hints.suggestedFiscalLabel === '2025/2026';
  console.log('=== Hint da filename ===');
  console.log(hints);
  console.log(formatHintsForPrompt(hints));
  console.log('ESITO:', ok ? 'PASS ✓' : 'FAIL ✗');
  return ok;
}

function testPipeline() {
  const hints = inferDocumentHints([path.basename(PDF_PATH)]);
  let extraction = normalizeExtraction(mockExtractionFromPdf());
  extraction = applyDocumentHints(extraction, hints);

  const preview = {
    confirmedSections: {},
    selectedRowIndex: {},
    extraction
  };
  applyAutoFilterToPreview(preview, { importParties: PARTIES });
  const section = preview.extraction.sections[0];
  const row = section.rows[0];
  const resoconto = buildResoconto(preview, { fiscalPeriods: [] });
  const instCheck = validateInstallmentsVsTotal(row.installments, effectivePreventivoTotal(row));
  const sumInst = row.installments.reduce((s, i) => s + i.amount, 0);

  const ok =
    extraction.fiscalYearLabel === EXPECTED.fiscalYearLabel &&
    section.documentKind === EXPECTED.documentKind &&
    Math.abs(row.total - EXPECTED.total) < 0.05 &&
    Math.abs(sumInst - EXPECTED.total) < 0.5 &&
    resoconto.preventivoTotal === row.total &&
    !preview.autoFilterFailed;

  console.log('\n=== Pipeline PDF Il Parco (mock AI) ===');
  console.log('Esercizio:', extraction.fiscalYearLabel);
  console.log('Tipo:', section.documentKind);
  console.log('Riga:', row.label, '| Total:', row.total);
  console.log('Saldo prec.:', row.saldoPrecedente);
  console.log('Rate (10):', row.installments.map(i => i.amount).join(', '));
  console.log('Somma rate:', sumInst.toFixed(2));
  console.log('Resoconto preventivo:', resoconto.preventivoTotal);
  console.log('Validazione rate:', instCheck.ok ? 'ok' : instCheck.warnings);
  console.log('ESITO:', ok ? 'PASS ✓' : 'FAIL ✗');
  return ok;
}

async function testLiveExtract() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY mancante');
  if (!fs.existsSync(PDF_PATH)) throw new Error('PDF non trovato');

  const hints = inferDocumentHints([path.basename(PDF_PATH)]);
  const hintBlock = formatHintsForPrompt(hints);
  const buf = fs.readFileSync(PDF_PATH);
  const b64 = buf.toString('base64');

  const prompt = `Analizza il PDF condominiale italiano.
${hintBlock}
Restituisci JSON con fiscalYearLabel (es. 2025/2026) e sections[].documentKind (preventivo|consuntivo).
Per preventivo: total = colonna Totale preventivo/gestione, NON somma rate se diversa.
Includi SOLO la riga LA MALFA se presente, con installments (date ISO + amount) se visibili.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.1,
      max_completion_tokens: 8192,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Solo JSON valido.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'file',
              file: {
                filename: path.basename(PDF_PATH),
                file_data: `data:application/pdf;base64,${b64}`
              }
            }
          ]
        }
      ]
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || res.status);

  let extraction = normalizeExtraction(JSON.parse(data.choices[0].message.content));
  extraction = applyDocumentHints(extraction, hints);

  console.log('\n=== Estrazione live OpenAI ===');
  console.log(JSON.stringify(extraction, null, 2));

  const kindOk = extraction.sections?.[0]?.documentKind === 'preventivo';
  const yearOk = extraction.fiscalYearLabel === '2025/2026';
  console.log('Tipo preventivo:', kindOk ? 'PASS ✓' : 'FAIL ✗', extraction.sections?.[0]?.documentKind);
  console.log('Anno 2025/2026:', yearOk ? 'PASS ✓' : 'FAIL ✗', extraction.fiscalYearLabel);
  return kindOk && yearOk;
}

async function main() {
  const live = process.argv.includes('--live');
  let ok = testHints() && testPipeline();
  if (live) {
    try {
      ok = (await testLiveExtract()) && ok;
    } catch (e) {
      console.error('\nLive extract saltato:', e.message);
    }
  } else {
    console.log('\n(Salta estrazione live; usa --live per OpenAI)');
  }
  process.exit(ok ? 0 : 1);
}

main();
