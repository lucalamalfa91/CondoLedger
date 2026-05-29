import { periodLabel, periodSummary, sumPaid } from './fiscal.js';
import { inferInstallmentKey, installmentSummaryForPeriod } from './installments.js';

export function buildSituazioneReport(house, fiscalPeriodId) {
  const period = house.fiscalPeriods.find(p => p.id === fiscalPeriodId);
  const totalsRow = periodSummary(house).find(p => p.id === fiscalPeriodId) || null;
  const { slots, consuntivoTotal, consuntivoDues, preventivoDues } = installmentSummaryForPeriod(house, fiscalPeriodId);

  const slotsTotalDue = slots.reduce((s, x) => s + x.amountDue, 0);
  const slotsTotalPaid = slots.reduce((s, x) => s + x.paid, 0);

  const periodPayments = house.payments.filter(p => p.fiscalPeriodId === fiscalPeriodId);
  const unlinkedPayments = periodPayments.filter(p => {
    const key = p.installmentKey || inferInstallmentKey(house, p);
    return !key;
  });

  const carryDues = preventivoDues.filter(d => d.carryFromPeriodId);

  return {
    period,
    totalsRow,
    slots,
    consuntivoDues,
    consuntivoTotal,
    preventivoDues,
    carryDues,
    slotsTotalDue,
    slotsTotalPaid,
    slotsBalance: slotsTotalPaid - slotsTotalDue,
    paidTotal: totalsRow?.paid ?? sumPaid(house, fiscalPeriodId),
    unlinkedPayments,
    periodPayments
  };
}

export function situazioneStatusLabel(balance) {
  if (balance > 0.005) return { text: 'Eccedenza', cls: 'success' };
  if (balance < -0.005) return { text: 'Debito', cls: 'error' };
  return { text: 'Pareggio', cls: 'warn' };
}

export function carryFromLabel(house, due) {
  if (!due.carryFromPeriodId) return '';
  return periodLabel(house, due.carryFromPeriodId);
}

export function hasConsuntivoReport(report) {
  return Boolean(report?.consuntivoDues?.length || report?.consuntivoTotal);
}

export function hasPreventivoReport(report) {
  return Boolean(report?.slots?.length || report?.preventivoDues?.length);
}

export function hasPaymentsOnlyReport(report) {
  return Boolean(report?.periodPayments?.length) && !hasConsuntivoReport(report) && !hasPreventivoReport(report);
}

/** Default PDF: consuntivo se presente, altrimenti preventivo. */
export function defaultSituazionePdfKind(report) {
  if (hasConsuntivoReport(report)) return 'consuntivo';
  if (hasPreventivoReport(report)) return 'preventivo';
  return null;
}

export function resolveSituazionePdfKind(report, requestedKind) {
  const hasCons = hasConsuntivoReport(report);
  const hasPrev = hasPreventivoReport(report);
  if (!hasCons && !hasPrev) return null;
  if (requestedKind === 'consuntivo' && hasCons) return 'consuntivo';
  if (requestedKind === 'preventivo' && hasPrev) return 'preventivo';
  return defaultSituazionePdfKind(report);
}
