/**
 * Test pipeline import su dati attesi da IMG_3066 (consuntivo 2024/2025, Via Anzani).
 * Valori letti dal documento: riga 111 La Malfa Luca / Andreazz (non # Galli Giulio).
 */
import { applyAutoFilterToPreview, effectivePreventivoTotal } from '../js/document-import-match.js';
import { buildResoconto } from '../js/document-import-resoconto.js';
import { validateSection } from '../js/document-import-validate.js';

const IMPORT_PARTIES = [
  { role: 'owner', firstName: 'Luca', lastName: 'La Malfa' },
  { role: 'owner', firstName: 'Giulia', lastName: 'Andreazza' },
];

/** Estrazione simulata come potrebbe restituire l'AI da IMG_3066 (solo righe interno 111). */
const extraction3066 = {
  fiscalYearLabel: '2024/2025',
  extractionNotes: 'Pagina rendiconto SCALA B — TOTALE RENDICONTO / SALDO PREC. / TOTALE DOVUTO',
  sections: [
    {
      documentKind: 'consuntivo',
      confidence: 0.9,
      rows: [
        {
          label: '111 - (PR) La Malfa Luca / Andreazz',
          total: 490.3,
          preventivoAmount: null,
          saldoPrecedente: 0,
          totaleDaVersare: 490.3,
          installments: [],
          confidence: 0.92,
        },
        {
          label: '111 - (PR) # Galli Giulio',
          total: 2088.83,
          saldoPrecedente: -48.95,
          totaleDaVersare: 2039.88,
          installments: [],
          confidence: 0.85,
        },
      ],
    },
  ],
};

/** Caso errore: AI mette TOTALE DOVUTO in total invece del rendiconto. */
const extraction3066WrongTotal = {
  ...extraction3066,
  sections: [
    {
      ...extraction3066.sections[0],
      rows: [
        {
          ...extraction3066.sections[0].rows[0],
          total: 490.3,
          totaleDaVersare: 490.3,
        },
        extraction3066.sections[0].rows[1],
      ],
    },
  ],
};

/** Caso doppia somma proprietari (bug precedente). */
const extractionDoubleOwners = {
  ...extraction3066,
  sections: [
    {
      ...extraction3066.sections[0],
      rows: [
        {
          label: '111 - (PR) La Malfa Luca / Andreazz',
          total: 490.3,
          saldoPrecedente: 0,
          totaleDaVersare: 490.3,
          installments: [],
        },
      ],
    },
  ],
};

function runCase(name, extraction) {
  const preview = {
    confirmedSections: {},
    selectedRowIndex: {},
    extraction: JSON.parse(JSON.stringify(extraction)),
  };
  applyAutoFilterToPreview(preview, { importParties: IMPORT_PARTIES });
  const section = preview.extraction.sections[0];
  const row = section.rows[0];
  const meta = preview.matchMeta?.consuntivo;
  const resoconto = buildResoconto(preview, { fiscalPeriods: [] });
  const warnings = validateSection(section, row);

  const eff = effectivePreventivoTotal(row);
  const ok =
    preview.filterMode === 'auto' &&
    !preview.autoFilterFailed &&
    meta?.ownerIdx?.length === 1 &&
    Math.abs(eff - 490.3) < 0.02 &&
    Math.abs(resoconto.consuntivoTotal - 490.3) < 0.02 &&
    section.rows.length === 1 &&
    !row.label.includes('Galli');

  console.log(`\n=== ${name} ===`);
  console.log('Match:', meta?.ownerIdx, meta?.noMatch ? 'NO MATCH' : 'ok');
  console.log('Righe dopo filtro:', section.rows.length, '→', row?.label);
  console.log('Total:', row?.total, '| Saldo prec.:', row?.saldoPrecedente);
  console.log('Totale dovuto:', row?.totaleDaVersare);
  console.log('Resoconto consuntivo:', resoconto.consuntivoTotal);
  console.log('Warnings:', warnings.length ? warnings : '—');
  console.log('ESITO:', ok ? 'PASS ✓' : 'FAIL ✗');
  return ok;
}

const allOk = [
  runCase('IMG_3066 consuntivo atteso', extraction3066),
  runCase('Singola riga 111 (no doppio conteggio)', extractionDoubleOwners),
].every(Boolean);

/** Verifica che Galli non matchi Giulia Andreazza */
import { scoreRowToParty } from '../js/document-import-match.js';
const galliScore = scoreRowToParty('111 - (PR) # Galli Giulio', IMPORT_PARTIES[1]);
console.log('\n=== Anti false-positive Galli vs Giulia ===');
console.log('Score Galli/Giulia:', galliScore, galliScore < 0.5 ? 'PASS ✓' : 'FAIL ✗');

process.exit(allOk && galliScore < 0.5 ? 0 : 1);
