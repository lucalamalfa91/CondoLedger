import { periodSummary } from './fiscal.js';
import { buildSituazioneReport, computeSituazioneTotals } from './situazione-report.js';
import { fmt, pad2, today } from './utils.js';

export const REMINDER_CADENCES = {
  monthly: { label: 'Mensile', months: 1 },
  bimonthly: { label: 'Bimestrale', months: 2 },
  semiannual: { label: 'Semestrale', months: 6 }
};

function monthEnd(isoMonthStart) {
  const [y, m] = isoMonthStart.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(last)}`;
}

function addMonths(isoDate, months) {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function dayBefore(isoDate) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Griglia di finestre [windowStart, windowEnd] alla cadenza scelta, con la data di promemoria di ciascuna. */
function buildCadenceSlots(period, cadence) {
  const months = REMINDER_CADENCES[cadence]?.months ?? 1;
  const windowStarts = [];
  let cursor = `${period.startDate.slice(0, 7)}-01`;
  const endMonth = period.endDate.slice(0, 7);
  while (cursor.slice(0, 7) <= endMonth) {
    windowStarts.push(cursor);
    cursor = addMonths(cursor, months);
  }
  return windowStarts.map((windowStart, i) => {
    const nextStart = windowStarts[i + 1];
    return {
      windowStart,
      windowEnd: nextStart ? dayBefore(nextStart) : period.endDate,
      reminderDate: monthEnd(windowStart)
    };
  });
}

/**
 * Rate residue da oggi (o dalla rata successiva all'ultimo versamento) a fine
 * esercizio, alla cadenza scelta, per l'importo ancora da versare
 * (preventivo/consuntivo + conguaglio − già versato).
 * @returns {{ items: Array<{date:string, amount:number, index:number, count:number, causale:string, summary:string}>, totalRemaining: number, count: number, period: object|null, fullyPaid: boolean, lastPaymentDate: string|null, resumedAfterPayment: boolean }}
 */
export function computeReminderPlan(house, fiscalPeriodId, { cadence = 'monthly', leadDays = 3 } = {}) {
  const period = house.fiscalPeriods.find(p => p.id === fiscalPeriodId);
  if (!period?.startDate || !period?.endDate) {
    return { items: [], totalRemaining: 0, count: 0, period: null, fullyPaid: false, lastPaymentDate: null, resumedAfterPayment: false };
  }

  const totalsRow = periodSummary(house).find(p => p.id === fiscalPeriodId) || null;
  const report = buildSituazioneReport(house, fiscalPeriodId);
  const totals = computeSituazioneTotals(report, totalsRow);
  const remaining = Math.max(0, Math.round((totals.totaleDaVersare - totals.totaleVersato) * 100) / 100);

  if (remaining <= 0.01) {
    return { items: [], totalRemaining: 0, count: 0, period, fullyPaid: true, lastPaymentDate: null, resumedAfterPayment: false };
  }

  const slots = buildCadenceSlots(period, cadence);

  // Verifica a quale rata della griglia appartiene l'ultimo versamento
  // registrato (non basta confrontare la data col "oggi": una rata pagata
  // il 15 del mese va comunque considerata coperta, anche se la scadenza
  // teorica di fine mese è successiva a oggi). Si riparte dalla rata
  // successiva a quella coperta.
  const lastPaymentDate = (house.payments || [])
    .filter(p => String(p.fiscalPeriodId) === String(fiscalPeriodId))
    .reduce((max, p) => {
      const d = String(p.date || '').slice(0, 10);
      return d && (!max || d > max) ? d : max;
    }, null);

  const coveredIndex = lastPaymentDate
    ? slots.findIndex(s => lastPaymentDate >= s.windowStart && lastPaymentDate <= s.windowEnd)
    : -1;
  const resumedAfterPayment = coveredIndex >= 0;

  const futureSlots = resumedAfterPayment
    ? slots.filter((s, idx) => idx > coveredIndex)
    : slots.filter(s => s.reminderDate >= today);

  const future = futureSlots.length
    ? futureSlots.map(s => s.reminderDate)
    : [resumedAfterPayment ? period.endDate : today];

  const n = future.length;
  const base = Math.floor((remaining * 100) / n) / 100;
  let allocated = 0;

  const items = future.map((date, i) => {
    const isLast = i === n - 1;
    const amount = isLast ? Math.round((remaining - allocated) * 100) / 100 : base;
    allocated += amount;
    const idx = i + 1;
    return {
      date,
      amount,
      index: idx,
      count: n,
      causale: `Rata condominiale ${idx}/${n} - ${period.label} - ${house.name}`.slice(0, 140),
      summary: `Rata condominio ${fmt(amount)} - ${house.name}`
    };
  });

  return { items, totalRemaining: remaining, count: n, period, fullyPaid: false, lastPaymentDate, resumedAfterPayment };
}
