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

/**
 * Rate residue da oggi a fine esercizio, alla cadenza scelta, per l'importo
 * ancora da versare (preventivo/consuntivo + conguaglio − già versato).
 * @returns {{ items: Array<{date:string, amount:number, index:number, count:number, causale:string, summary:string}>, totalRemaining: number, count: number, period: object|null, fullyPaid: boolean }}
 */
export function computeReminderPlan(house, fiscalPeriodId, { cadence = 'monthly', leadDays = 3 } = {}) {
  const period = house.fiscalPeriods.find(p => p.id === fiscalPeriodId);
  if (!period?.startDate || !period?.endDate) {
    return { items: [], totalRemaining: 0, count: 0, period: null, fullyPaid: false };
  }

  const totalsRow = periodSummary(house).find(p => p.id === fiscalPeriodId) || null;
  const report = buildSituazioneReport(house, fiscalPeriodId);
  const totals = computeSituazioneTotals(report, totalsRow);
  const remaining = Math.max(0, Math.round((totals.totaleDaVersare - totals.totaleVersato) * 100) / 100);

  if (remaining <= 0.01) {
    return { items: [], totalRemaining: 0, count: 0, period, fullyPaid: true };
  }

  const months = REMINDER_CADENCES[cadence]?.months ?? 1;
  const slotDates = [];
  let cursor = `${period.startDate.slice(0, 7)}-01`;
  const endMonth = period.endDate.slice(0, 7);
  while (cursor.slice(0, 7) <= endMonth) {
    slotDates.push(monthEnd(cursor));
    cursor = addMonths(cursor, months);
  }

  const future = slotDates.filter(d => d >= today);
  if (!future.length) future.push(today);

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

  return { items, totalRemaining: remaining, count: n, period, fullyPaid: false };
}
