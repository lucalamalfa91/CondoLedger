/**
 * I promemoria di calendario devono ricalcare le rate del preventivo — mese e
 * importo — non una cadenza inventata a parte.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { computeReminderPlan } from '../js/reminder-plan.js';
import { buildIcsCalendar, paymentLinkForInstallment } from '../js/ics-export.js';

/** Un anno con cinque rate bimestrali da 506, la prima con dentro un conguaglio a credito. */
function casa({ pagamenti = [] } = {}) {
  const rate = [
    ['2026-10-01', '2026-10-31', 506, -85.23],
    ['2026-12-01', '2026-12-31', 506, 0],
    ['2027-02-01', '2027-02-28', 506, 0],
    ['2027-04-01', '2027-04-30', 506, 0],
    ['2027-06-01', '2027-06-30', 506, 0]
  ].map(([periodStart, periodEnd, ordinario, conguaglio]) => ({
    periodStart, periodEnd, ordinario, conguaglio, straordinari: 0,
    amount: Math.round((ordinario + conguaglio) * 100) / 100
  }));
  return {
    id: 1,
    name: 'Il Parco',
    fiscalPeriods: [{ id: 'p1', label: '2026/2027', startDate: '2026-06-01', endDate: '2027-05-31' }],
    dues: [{ id: 'd1', fiscalPeriodId: 'p1', amount: 2530, dueKind: 'preventivo', voice: 'ordinario', splitMode: 'custom', splitAmounts: rate }],
    payments: pagamenti,
    priorBalances: []
  };
}

test('le rate del promemoria sono quelle del preventivo, non una cadenza mensile', () => {
  const plan = computeReminderPlan(casa(), 'p1');
  assert.equal(plan.count, 5, 'cinque rate nel preventivo, cinque promemoria');
  assert.deepEqual(plan.items.map(i => i.date),
    ['2026-10-31', '2026-12-31', '2027-02-28', '2027-04-30', '2027-06-30']);
  // La prima porta dentro il conguaglio a credito: 506 − 85,23.
  assert.equal(plan.items[0].amount, 420.77);
  assert.equal(plan.items[1].amount, 506);
  assert.equal(plan.totalRemaining, 2444.77);
});

test('la rata già pagata non torna in calendario', () => {
  const pagata = casa().dues[0];
  const plan = computeReminderPlan(
    casa({ pagamenti: [{ id: 'x', fiscalPeriodId: 'p1', amount: 420.77, installmentKey: `${pagata.id}:0` }] }),
    'p1'
  );
  assert.equal(plan.count, 4);
  assert.equal(plan.items[0].date, '2026-12-31');
});

test('la composizione della rata finisce nell’appuntamento', () => {
  const plan = computeReminderPlan(casa(), 'p1');
  // fmt separa € dalla cifra con uno spazio unificatore, non con uno normale.
  assert.match(plan.items[0].composizione, /P €\s506,00/u);
  assert.match(plan.items[0].composizione, /±\s-€\s85,23/u);
  assert.equal(plan.items[1].composizione, '', 'una rata di sola quota non ha niente da scomporre');
});

test('ogni appuntamento porta il collegamento per registrare quella rata', () => {
  const plan = computeReminderPlan(casa(), 'p1');
  const ics = buildIcsCalendar(casa(), plan, 3, 'https://esempio.app');
  const link = paymentLinkForInstallment('https://esempio.app', plan.items[0].key);
  assert.equal(link, 'https://esempio.app/#/pagamenti/registra?rata=d1%3A0');
  assert.ok(ics.includes('URL:' + link), 'il collegamento deve stare nel campo URL');
  assert.ok(ics.includes('Registra il pagamento:'), 'e anche nella descrizione, per i calendari che ignorano URL');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 5);
  assert.ok(ics.includes('TRIGGER:-P3D'), 'con il preavviso di tre giorni');
});

test('senza rate aperte non si esporta niente', () => {
  const pagata = casa().dues[0];
  const tutti = [420.77, 506, 506, 506, 506].map((amount, i) => ({ id: `x${i}`, fiscalPeriodId: 'p1', amount, installmentKey: `${pagata.id}:${i}` }));
  const plan = computeReminderPlan(casa({ pagamenti: tutti }), 'p1');
  assert.equal(plan.fullyPaid, true);
  assert.equal(plan.items.length, 0);
});
