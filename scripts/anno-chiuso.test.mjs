/**
 * Quando l'anno si chiude, le rate scoperte e il conguaglio sono gli stessi
 * soldi raccontati due volte — e quasi mai con lo stesso numero.
 *
 * Le rate vengono dal preventivo, il conguaglio dalle spese vere: se il
 * consuntivo chiude sotto il preventivo, quello che resta da regolare è meno di
 * quello che manca alle rate. Metterli tutti e due davanti all'utente come
 * «da pagare» significa chiedergli due volte la stessa cifra, e con due cifre
 * diverse. Da qui la regola: con il consuntivo registrato, comanda il conguaglio.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { computeConguaglio } from '../js/fiscal.js';
import { installmentSummaryForPeriod } from '../js/installments.js';

/** Dodici rate da 165, un consuntivo e i versamenti che si vogliono. */
function casa({ consuntivo = 0, versamenti = [] } = {}) {
  const rate = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 5 + i, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const mm = String(m).padStart(2, '0');
    return {
      periodStart: `${y}-${mm}-01`,
      periodEnd: `${y}-${mm}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`,
      amount: 165, ordinario: 165, conguaglio: 0, straordinari: 0
    };
  });
  const dues = [{ id: 'd1', fiscalPeriodId: 'p1', amount: 1980, dueKind: 'preventivo', voice: 'ordinario', splitMode: 'custom', splitAmounts: rate }];
  if (consuntivo) dues.push({ id: 'd2', fiscalPeriodId: 'p1', amount: consuntivo, dueKind: 'consuntivo' });
  return {
    fiscalPeriods: [{ id: 'p1', label: '2025/2026', startDate: '2025-06-01', endDate: '2026-05-31' }],
    dues,
    payments: versamenti.map((amount, i) => ({ id: `x${i}`, fiscalPeriodId: 'p1', amount, installmentKey: `d1:${i}` })),
    priorBalances: []
  };
}

/** Quanto manca alle rate del preventivo, sommando rata per rata. */
function scopertoRate(house) {
  const { slots } = installmentSummaryForPeriod(house, 'p1');
  return Math.round(slots.reduce((s, slot) => s + Math.max(0, slot.amountDue - slot.paid), 0) * 100) / 100;
}

// 1190,41 versati: sette rate intere e una parziale.
const versamenti = [165, 165, 165, 165, 165, 165, 165, 35.41];

test('le rate scoperte e il conguaglio non sono lo stesso numero', () => {
  // È la domanda arrivata dalla schermata: 789,59 fra le rate, 781,00 riportato.
  const house = casa({ consuntivo: 1971.41, versamenti });
  assert.equal(scopertoRate(house), 789.59, 'il preventivo meno quello che è arrivato');
  assert.equal(computeConguaglio(house, 'p1').amount, 781, 'il consuntivo meno quello che è arrivato');
  // La differenza è tutta lì: il consuntivo ha chiuso 8,59 sotto il preventivo.
  assert.equal(Math.round((789.59 - 781) * 100) / 100, Math.round((1980 - 1971.41) * 100) / 100);
});

test('senza consuntivo le rate scoperte sono davvero da pagare', () => {
  // Finché l'anno è aperto non c'è nessun conguaglio che le assorba.
  const house = casa({ versamenti });
  assert.equal(scopertoRate(house), 789.59);
  assert.equal(computeConguaglio(house, 'p1'), null);
});

test('una rata versata in parte lascia scoperta solo la differenza', () => {
  const house = casa({ versamenti });
  const { slots } = installmentSummaryForPeriod(house, 'p1');
  const ottava = slots[7];
  assert.equal(ottava.paid, 35.41);
  assert.equal(Math.round((ottava.amountDue - ottava.paid) * 100) / 100, 129.59,
    'mancano 129,59, non i 165 pieni: chi ha versato qualcosa non è scoperto per tutto');
});
