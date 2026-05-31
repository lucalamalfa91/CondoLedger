/**
 * Regressione IMG_3095 — output AI errato tipico (doppia riga, saldo=rata1, rate raddoppiate).
 */
import { applyAutoFilterToPreview } from '../js/document-import-match.js';
import { buildResoconto } from '../js/document-import-resoconto.js';

const PARTIES = [
  { role: 'owner', firstName: 'Luca', lastName: 'La Malfa' },
  { role: 'owner', firstName: 'Giulia', lastName: 'Andreazza' },
];

/** Simula estrazione AI difettosa come quella vista in app. */
const extraction = {
  fiscalYearLabel: '2025/2026',
  extractionNotes: 'Documento preventivo con ripartizioni per anagrafica.',
  sections: [
    {
      documentKind: 'preventivo',
      rows: [
        {
          label: '111 - (PR) La Malfa Luca / Andreazza',
          total: 2464.37,
          totaleDaVersare: 2464.37,
          saldoPrecedente: 556.37,
          installments: [
            { label: 'Rata n. 1', periodStart: '2025-10-31', amount: 556.37 },
            { label: 'Rata n. 2', periodStart: '2025-12-31', amount: 477 },
            { label: 'Rata n. 3', periodStart: '2026-02-28', amount: 477 },
            { label: 'Rata n. 4', periodStart: '2026-04-30', amount: 477 },
            { label: 'Rata n. 5', periodStart: '2026-06-30', amount: 477 },
          ],
        },
        {
          label: '111 - (PR) La Malfa Luca / Andreazz',
          preventivoAmount: 2386.87,
          total: 2386.87,
          totaleDaVersare: 2464.37,
          saldoPrecedente: 77.5,
          installments: [
            { label: 'Rata n. 1', periodStart: '2025-10-31', amount: 556.37 },
            { label: 'Rata n. 2', periodStart: '2025-12-31', amount: 477 },
            { label: 'Rata n. 3', periodStart: '2026-02-28', amount: 477 },
            { label: 'Rata n. 4', periodStart: '2026-04-30', amount: 477 },
            { label: 'Rata n. 5', periodStart: '2026-06-30', amount: 477 },
          ],
        },
        {
          label: '111 - (PR) # Galli Giulio',
          total: 332.8,
          saldoPrecedente: 332.8,
          totaleDaVersare: 332.8,
          installments: [{ periodStart: '2025-10-31', amount: 332.8 }],
        },
      ],
    },
  ],
};

const preview = {
  confirmedSections: {},
  selectedRowIndex: {},
  extraction: JSON.parse(JSON.stringify(extraction)),
};

applyAutoFilterToPreview(preview, { importParties: PARTIES });
const row = preview.extraction.sections[0].rows[0];
const resoconto = buildResoconto(preview, { fiscalPeriods: [] });
const meta = preview.matchMeta.preventivo;
const sumInst = row.installments.reduce((s, i) => s + i.amount, 0);

const ok =
  preview.extraction.sections[0].rows.length === 1 &&
  Math.abs(row.total - 2386.87) < 0.02 &&
  Math.abs(resoconto.preventivoTotal - 2386.87) < 0.02 &&
  Math.abs(resoconto.previousBalance - 77.5) < 0.02 &&
  Math.abs(sumInst - 2386.87) < 0.05 &&
  !row.label.includes('Galli') &&
  meta.matchedRowCount === 1 &&
  meta.partyMatchCount === 2;

console.log('=== IMG_3095 regressione ===');
console.log('Riga:', row.label);
console.log('Preventivo:', row.total, '| Resoconto:', resoconto.preventivoTotal);
console.log('Saldo prec.:', row.saldoPrecedente, '| Resoconto:', resoconto.previousBalance);
console.log('Rate:', row.installments.map(i => i.amount).join(', '));
console.log('Somma rate:', sumInst.toFixed(2));
console.log('Match meta:', meta.matchedRowCount, 'righe,', meta.partyMatchCount, 'nominativi');
console.log('Carryover:', resoconto.carryoverAmount);
console.log('ESITO:', ok ? 'PASS ✓' : 'FAIL ✗');

process.exit(ok ? 0 : 1);
