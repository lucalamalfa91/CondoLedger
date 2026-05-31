/**
 * Test Il Parco 2024/2025 — proprietario LA MALFA + inquilina Valtolina Veronica (totali sommati).
 * Fonte: Consuntivo ripartizioni per anagrafica 2024_25 pos assemblea.pdf (pag. 2, Totale gestione).
 */
import { inferDocumentHints } from '../js/document-import-hints.js';
import { normalizeExtraction } from '../js/document-import-schema.js';
import { applyAutoFilterToPreview } from '../js/document-import-match.js';
import { buildResoconto } from '../js/document-import-resoconto.js';

const PARTIES = [
  { role: 'owner', firstName: 'Luca', lastName: 'La Malfa' },
  { role: 'tenant', firstName: 'Veronica', lastName: 'Valtolina' },
];

/** Valori attesi dal PDF (colonna Totale gestione / Saldi es. prec. / Saldo finale). */
const EXPECTED = {
  fiscalYearLabel: '2024/2025',
  documentKind: 'consuntivo',
  total: 3031.45,
  saldoPrecedente: -1057.04,
  totaleDaVersare: -75.73,
};

const extraction = normalizeExtraction({
  fiscalYearLabel: '2024/2025',
  extractionNotes: 'Consuntivo ripartizioni per anagrafica — Palazzina 1',
  sections: [
    {
      documentKind: 'consuntivo',
      confidence: 0.92,
      rows: [
        {
          label: 'LA MALFA',
          total: 279.24,
          saldoPrecedente: -896.59,
          totaleDaVersare: -476.38,
          confidence: 0.95,
        },
        {
          label: 'Valtolina Veronica',
          total: 2752.21,
          saldoPrecedente: -160.45,
          totaleDaVersare: 400.65,
          confidence: 0.93,
        },
        {
          label: 'DONI',
          total: 5604.99,
          confidence: 0.9,
        },
      ],
    },
  ],
});

const hints = inferDocumentHints([
  'Consuntivo ripartizioni per anagrafica 2024_25 pos assemblea.pdf',
  '2024-2025',
]);

const preview = {
  confirmedSections: {},
  selectedRowIndex: {},
  extraction: JSON.parse(JSON.stringify(extraction)),
};

applyAutoFilterToPreview(preview, { importParties: PARTIES });

const section = preview.extraction.sections[0];
const row = section.rows[0];
const meta = preview.matchMeta.consuntivo;
const resoconto = buildResoconto(preview, { fiscalPeriods: [] });

function close(a, b, tol = 0.02) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

const ok =
  hints.suggestedKind === 'consuntivo' &&
  hints.suggestedFiscalLabel === '2024/2025' &&
  !preview.autoFilterFailed &&
  meta.ownerIdx.length === 1 &&
  meta.tenantIdx.length === 1 &&
  section.rows.length === 1 &&
  row.label.includes('LA MALFA') &&
  row.label.includes('Valtolina') &&
  close(row.total, EXPECTED.total) &&
  close(row.saldoPrecedente, EXPECTED.saldoPrecedente) &&
  close(row.totaleDaVersare, EXPECTED.totaleDaVersare) &&
  close(resoconto.consuntivoTotal, EXPECTED.total) &&
  close(resoconto.previousBalance, EXPECTED.saldoPrecedente);

console.log('=== Il Parco 2024/2025 (owner + tenant) ===');
console.log('Hint:', hints.suggestedKind, hints.suggestedFiscalLabel);
console.log('Match owner/tenant idx:', meta.ownerIdx, meta.tenantIdx);
console.log('Riga aggregata:', row.label);
console.log('Totale consuntivo:', row.total, '(atteso', EXPECTED.total + ')');
console.log('Saldo prec.:', row.saldoPrecedente, '(atteso', EXPECTED.saldoPrecedente + ')');
console.log('Saldo finale:', row.totaleDaVersare, '(atteso', EXPECTED.totaleDaVersare + ')');
console.log('Resoconto consuntivo:', resoconto.consuntivoTotal);
console.log('Resoconto saldo prec.:', resoconto.previousBalance);
console.log('ESITO:', ok ? 'PASS ✓' : 'FAIL ✗');

process.exit(ok ? 0 : 1);
