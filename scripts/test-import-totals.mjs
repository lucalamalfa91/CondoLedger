import { applyAutoFilterToPreview } from '../js/document-import-match.js';

const house = {
  importParties: [
    { role: 'owner', firstName: 'Luca', lastName: 'La Malfa' },
    { role: 'owner', firstName: 'Giulia', lastName: 'Andreazza' },
  ],
};

const preview = {
  confirmedSections: {},
  selectedRowIndex: {},
  extraction: {
    sections: [
      {
        documentKind: 'preventivo',
        rows: [
          {
            label: '111 - (PR) La Malfa Luca / Andreazza',
            preventivoAmount: 2386.87,
            saldoPrecedente: 77.5,
            totaleDaVersare: 2464.37,
            total: 2464.37,
            installments: [
              { periodStart: '2025-10-31', amount: 556.37 },
              { periodStart: '2025-12-31', amount: 477 },
              { periodStart: '2026-02-28', amount: 477 },
              { periodStart: '2026-04-30', amount: 477 },
              { periodStart: '2026-06-30', amount: 477 },
            ],
          },
        ],
      },
    ],
  },
};

applyAutoFilterToPreview(preview, house);
const row = preview.extraction.sections[0].rows[0];
const sum = row.installments.reduce((s, i) => s + i.amount, 0);
console.log('total', row.total);
console.log('installments', row.installments.map((i) => i.amount));
console.log('sum', sum);
console.log('ok', Math.abs(row.total - 2386.87) < 0.02 && Math.abs(sum - 2386.87) < 0.02);
