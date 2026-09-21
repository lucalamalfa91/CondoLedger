/**
 * Il conguaglio è quello che resta da regolare quando l'anno si chiude:
 *
 *     consuntivo + straordinari + saldo riportato − versato
 *
 * I casi qui sotto sono due case vere, prese dai resoconti. Sono la ragione per
 * cui questo file esiste: la regola era già stata sbagliata due volte, una
 * dimenticando il saldo riportato e una confrontando col preventivo, e in
 * entrambi i casi i numeri tornavano lo stesso sull'esempio che si aveva in mano.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { computeConguaglio } from '../js/fiscal.js';

function casa({ preventivo = 0, straordinari = 0, consuntivo = 0, pagato = 0, riportato = 0 }) {
  const dues = [];
  if (preventivo) dues.push({ id: 'd1', fiscalPeriodId: 'p1', amount: preventivo, dueKind: 'preventivo', voice: 'ordinario' });
  if (straordinari) dues.push({ id: 'd2', fiscalPeriodId: 'p1', amount: straordinari, dueKind: 'preventivo', voice: 'straordinario' });
  if (consuntivo) dues.push({ id: 'd3', fiscalPeriodId: 'p1', amount: consuntivo, dueKind: 'consuntivo' });
  return {
    fiscalPeriods: [{ id: 'p1', label: '2025/2026', startDate: '2025-06-01', endDate: '2026-05-31' }],
    dues,
    payments: pagato ? [{ id: 'x', fiscalPeriodId: 'p1', amount: pagato }] : [],
    priorBalances: riportato ? [{ id: 'b', fiscalPeriodId: 'p1', amount: riportato }] : []
  };
}

test('un anno che chiude con rate scoperte lascia un debito', () => {
  // Casa A, 2024/2025: speso 490,30, versato 412,80.
  const c = computeConguaglio(casa({ preventivo: 490.30, consuntivo: 490.30, pagato: 412.80 }), 'p1');
  assert.equal(c.amount, 77.50);
  assert.equal(c.direction, 'debito');
});

test('la rata che recupera il debito dell’anno prima non conta due volte', () => {
  // Casa A, 2025/2026: dei 2464,37 versati, 77,50 recuperavano il 2024/2025.
  // Senza il saldo riportato fra i dovuti uscirebbe 162,73, che è il doppio errore.
  const c = computeConguaglio(casa({ preventivo: 2386.87, consuntivo: 2301.64, pagato: 2464.37, riportato: 77.50 }), 'p1');
  assert.equal(c.amount, -85.23);
  assert.equal(c.direction, 'credito');
});

test('chi ha versato più di quanto si è speso resta a credito', () => {
  // Casa B, 2024/2025: speso 3011,97, versato 3087,70 in nove rate.
  const c = computeConguaglio(casa({ preventivo: 2417.46, consuntivo: 3011.97, pagato: 3087.70 }), 'p1');
  assert.equal(c.amount, -75.73);
  assert.equal(c.direction, 'credito');
});

test('il credito dell’anno prima riduce il debito di quest’anno', () => {
  // Casa B, 2025/2026: 1941,41 speso, 75,73 di credito riportato, 1084,68 versato.
  const c = computeConguaglio(casa({ preventivo: 1564.46, consuntivo: 1941.41, pagato: 1084.68, riportato: -75.73 }), 'p1');
  assert.equal(c.amount, 781.00);
  assert.equal(c.direction, 'debito');
});

test('non è lo scostamento dal preventivo', () => {
  // Stesso consuntivo e stesso preventivo, rate pagate diverse: lo scostamento
  // dal preventivo è identico, il conguaglio no. È la prova che le due domande
  // sono diverse.
  const puntuale = computeConguaglio(casa({ preventivo: 1000, consuntivo: 1100, pagato: 1000 }), 'p1');
  const inRitardo = computeConguaglio(casa({ preventivo: 1000, consuntivo: 1100, pagato: 500 }), 'p1');
  assert.equal(puntuale.amount, 100, 'ha pagato tutte le rate: deve solo la maggior spesa');
  assert.equal(inRitardo.amount, 600, 'ne ha pagata metà: deve anche le rate scoperte');
});

test('gli straordinari deliberati stanno fra i dovuti', () => {
  const c = computeConguaglio(casa({ preventivo: 2400, straordinari: 600, consuntivo: 2400, pagato: 2400 }), 'p1');
  assert.equal(c.amount, 600, 'i lavori restano da pagare anche se la gestione è in pari');
});

test('chi ha pagato esattamente quello che si è speso chiude in pari', () => {
  const c = computeConguaglio(casa({ preventivo: 1000, consuntivo: 1100, pagato: 1100 }), 'p1');
  assert.equal(c.direction, 'pari');
  assert.equal(c.amount, 0);
});

test('senza consuntivo non c’è niente da conguagliare', () => {
  assert.equal(computeConguaglio(casa({ preventivo: 2400, pagato: 1200 }), 'p1'), null);
});
