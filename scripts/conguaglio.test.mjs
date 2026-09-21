/**
 * Il conguaglio si misura sul preventivo, mai sul versato.
 *
 * È la regola che distingue due domande diverse: «il condominio ha speso più o
 * meno del previsto?» (conguaglio) e «sono in pari con le rate?» (arretrati).
 * Confonderle sbaglia due volte, perché nel versato finiscono anche le quote di
 * recupero dei conguagli degli anni prima.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { computeConguaglio } from '../js/fiscal.js';

/** Una casa con un anno solo, con gli importi che servono al caso in prova. */
function casa({ ordinario = 0, straordinari = 0, consuntivo = 0, pagamenti = [] }) {
  const dues = [];
  if (ordinario) dues.push({ id: 'd1', fiscalPeriodId: 'p1', amount: ordinario, dueKind: 'preventivo', voice: 'ordinario' });
  if (straordinari) dues.push({ id: 'd2', fiscalPeriodId: 'p1', amount: straordinari, dueKind: 'preventivo', voice: 'straordinario' });
  if (consuntivo) dues.push({ id: 'd3', fiscalPeriodId: 'p1', amount: consuntivo, dueKind: 'consuntivo' });
  return {
    fiscalPeriods: [{ id: 'p1', label: '2025/2026', startDate: '2025-06-01', endDate: '2026-05-31' }],
    dues,
    payments: pagamenti.map((amount, i) => ({ id: `x${i}`, fiscalPeriodId: 'p1', amount })),
    priorBalances: []
  };
}

test('il conguaglio è consuntivo − preventivo, non consuntivo − versato', () => {
  // Il caso reale che ha fatto emergere l'errore: si era versato più del
  // preventivo perché una parte copriva il conguaglio dell'anno prima.
  const h = casa({ ordinario: 2386.87, consuntivo: 2301.64, pagamenti: [2464.37] });
  const c = computeConguaglio(h, 'p1');
  assert.equal(c.amount, -85.23);
  assert.equal(c.direction, 'credito');
  assert.equal(c.preventivo, 2386.87);
});

test('quello che si è versato non sposta il conguaglio', () => {
  const senza = computeConguaglio(casa({ ordinario: 1000, consuntivo: 1100 }), 'p1');
  const tanto = computeConguaglio(casa({ ordinario: 1000, consuntivo: 1100, pagamenti: [5000] }), 'p1');
  assert.equal(senza.amount, 100);
  assert.equal(tanto.amount, 100, 'versare di più non può cambiare quanto ha speso il condominio');
});

test('le rate arretrate restano arretrati, non diventano conguaglio', () => {
  // Preventivo speso in pieno e nemmeno una rata pagata: il conguaglio è zero,
  // il debito sulle rate vive altrove.
  const c = computeConguaglio(casa({ ordinario: 2400, consuntivo: 2400, pagamenti: [] }), 'p1');
  assert.equal(c.amount, 0);
  assert.equal(c.direction, 'pari');
});

test('anche gli straordinari deliberati fanno parte del preventivo dell’anno', () => {
  const c = computeConguaglio(casa({ ordinario: 2400, straordinari: 600, consuntivo: 3100 }), 'p1');
  assert.equal(c.amount, 100);
  assert.equal(c.preventivo, 3000);
});

test('senza consuntivo non c’è niente da conguagliare', () => {
  assert.equal(computeConguaglio(casa({ ordinario: 2400 }), 'p1'), null);
});
