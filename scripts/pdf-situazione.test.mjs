/**
 * Le tabelle del resoconto da stampare.
 *
 * Il PDF si mette a fianco del riparto dell'amministratore, quindi ogni cifra
 * deve reggere il confronto e ogni colonna deve dire cosa contiene. La versione
 * precedente falliva su entrambi i fronti: il «Totale» per rata era sempre lo
 * stesso numero, e il rigo «Pagato» sommava le voci solo delle rate intere ma
 * l'importo di tutti i versamenti — due criteri nella stessa riga.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { buildChiusuraRows, buildRatePlanTable, buildRiepilogoRows, coperturaVersamento } from '../js/pdf-situazione.js';
import { buildSituazioneReport } from '../js/situazione-report.js';
import { computeConguaglio } from '../js/fiscal.js';

/**
 * Dodici rate da 165 (1980 di preventivo), consuntivo 1941,41 e 1084,68
 * versati: sei rate intere, una a metà strada e le altre mai versate.
 */
function casa({ consuntivo = 1941.41, straordinari = 0, riportato = 0, versamenti = null } = {}) {
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
  if (straordinari) dues.push({ id: 'd2', fiscalPeriodId: 'p1', amount: straordinari, dueKind: 'preventivo', voice: 'straordinario' });
  if (consuntivo) dues.push({ id: 'd3', fiscalPeriodId: 'p1', amount: consuntivo, dueKind: 'consuntivo', description: 'Gestione ordinaria' });
  const versati = versamenti ?? [165, 165, 165, 165, 165, 165, 94.68];
  return {
    fiscalPeriods: [
      { id: 'p0', label: '2024/2025', startDate: '2024-06-01', endDate: '2025-05-31' },
      { id: 'p1', label: '2025/2026', startDate: '2025-06-01', endDate: '2026-05-31' }
    ],
    dues,
    payments: versati.map((amount, i) => ({
      id: `x${i}`, fiscalPeriodId: 'p1', amount, date: `2025-${String(6 + i).padStart(2, '0')}-28`,
      method: 'Bonifico', installmentKey: `d1:${i}`
    })),
    priorBalances: riportato ? [{ id: 'b1', fiscalPeriodId: 'p1', sourcePeriodId: 'p0', amount: riportato }] : []
  };
}

test('ogni rata mette in fila previsto, effettivo e versato', () => {
  const t = buildRatePlanTable(casa(), 'p1');
  assert.equal(t.rows.length, 12);
  // Il preventivo è la rata come è stata decisa, non un totale finto sempre uguale.
  assert.equal(t.rows[0].preventivo, 165);
  // Il consuntivo si ripartisce sulle rate: 1941,41 / 12.
  assert.equal(t.rows[0].consuntivo, 161.78);
  assert.equal(t.rows[0].versato, 165);
  // La somma della colonna consuntivo torna esatta: l'ultima rata prende il resto.
  const sommaCons = t.rows.reduce((s, r) => s + r.consuntivo, 0);
  assert.equal(Math.round(sommaCons * 100) / 100, 1941.41);
});

test('lo stato distingue pagata, parziale e non pagata', () => {
  const t = buildRatePlanTable(casa(), 'p1');
  assert.equal(t.rows[0].stato, 'Pagata');
  assert.equal(t.rows[6].stato, 'Parziale, mancano 70,32', 'versati 94,68 su 165');
  assert.equal(t.rows[7].stato, 'Non pagata, mancano 165,00');
});

test('chi versa più della rata vede l’eccedenza, non un «pagata» e basta', () => {
  const t = buildRatePlanTable(casa({ versamenti: [200] }), 'p1');
  assert.equal(t.rows[0].stato, 'Pagata, eccedenza 35,00');
});

test('i totali sono preventivo, consuntivo e versato, contati allo stesso modo', () => {
  const t = buildRatePlanTable(casa(), 'p1');
  assert.equal(t.totali.preventivo, 1980);
  assert.equal(t.totali.consuntivo, 1941.41);
  assert.equal(t.totali.versato, 1084.68, 'la somma dei versamenti, rata per rata');
});

test('la chiusura dell’anno porta dal consuntivo al conguaglio', () => {
  const house = casa({ riportato: -75.73 });
  const chiusura = buildChiusuraRows(house, 'p1', buildRatePlanTable(house, 'p1'));
  assert.equal(chiusura.differenza, 781, 'consuntivo + riportato − versato');
  assert.equal(chiusura.verso, 'a debito');
  const etichette = chiusura.righe.map(([e]) => e);
  assert.deepEqual(etichette, [
    'Totale preventivo (rate decise)',
    'Totale consuntivo (spesa accertata)',
    'Saldo a credito dall’anno precedente',
    'Totale dovuto',
    'Totale versato nell’anno',
    'Conguaglio dell’anno: a debito'
  ]);
});

test('senza consuntivo la tabella lo dice invece di inventarlo', () => {
  const house = casa({ consuntivo: 0 });
  const t = buildRatePlanTable(house, 'p1');
  assert.equal(t.rows[0].consuntivo, null);
  assert.equal(t.totali.consuntivo, null);
  const chiusura = buildChiusuraRows(house, 'p1', t);
  assert.match(chiusura.righe.at(-1)[0], /Ancora da versare sul preventivo/);
  assert.equal(chiusura.differenza, 895.32, '1980 − 1084,68');
});

test('il riepilogo in testa usa lo stesso conguaglio dell’app', () => {
  const righe = buildRiepilogoRows(casa({ riportato: -75.73 }), { period: { id: 'p1' } });
  assert.deepEqual(righe, [
    ['Preventivo dell’anno', 1980],
    ['Conguaglio a credito dall’anno precedente', -75.73],
    ['Consuntivo (spesa accertata)', 1941.41],
    ['Versato nell’anno', 1084.68],
    ['Conguaglio dell’anno: a debito', 781]
  ]);
});

test('i versamenti a copertura del conguaglio compaiono fra gli altri', () => {
  const house = casa({ riportato: 77.5 });
  house.payments.push({
    id: 'c1', fiscalPeriodId: 'p1', amount: 77.5, date: '2025-06-10',
    method: 'Bonifico', priorBalanceId: 'b1'
  });
  const report = buildSituazioneReport(house, 'p1');
  const tutti = [...report.exercisePayments, ...report.priorBalancePayments];
  assert.equal(tutti.length, house.payments.length, 'nessun versamento resta fuori dall’elenco');
  const conguaglio = tutti.find(p => p.priorBalanceId);
  assert.equal(coperturaVersamento(house, report, conguaglio), 'Conguaglio 2024/2025');
  const suRata = coperturaVersamento(house, report, tutti[0]);
  assert.notEqual(suRata, 'Non assegnato', `il versamento sulla rata deve dire quale: ${suRata}`);
  assert.ok(!/Conguaglio/.test(suRata), suRata);
});

test('il versato della chiusura conta anche le quote di conguaglio', () => {
  // Un versamento a copertura del saldo precedente riduce il dovuto come gli
  // altri: se la chiusura contasse solo le rate, la stessa pagina mostrerebbe
  // due «totale versato» diversi.
  const house = casa({ riportato: 77.5 });
  house.payments.push({ id: 'c1', fiscalPeriodId: 'p1', amount: 77.5, date: '2025-06-10', method: 'Bonifico', priorBalanceId: 'b1' });
  const chiusura = buildChiusuraRows(house, 'p1', buildRatePlanTable(house, 'p1'));
  const versato = chiusura.righe.find(([e]) => e === 'Totale versato nell’anno')[1];
  assert.equal(versato, 1162.18, '1084,68 sulle rate + 77,50 sul conguaglio');
  // E la differenza resta identica al conguaglio calcolato dall'app.
  assert.equal(chiusura.differenza, computeConguaglio(house, 'p1').amount);
});
