import { periodLabel, periodSummary, sumPaid } from './fiscal.js';
import { inferInstallmentKey, installmentSummaryForPeriod } from './installments.js';

export function getPriorBalanceForPeriod(house, fiscalPeriodId) {
  return (house.priorBalances || []).find(b => String(b.fiscalPeriodId) === String(fiscalPeriodId)) ?? null;
}

/** Positivo = extra da pagare; negativo = sconto/credito riportato. */
export function priorBalancePresentation(amount) {
  const n = Number(amount || 0);
  if (n > 0.005) {
    return { kind: 'extra', label: 'Extra da pagare', badgeCls: 'warn', amountCls: 'negative' };
  }
  if (n < -0.005) {
    return { kind: 'credit', label: 'Sconto / credito riportato', badgeCls: 'success', amountCls: 'positive' };
  }
  return { kind: 'zero', label: '—', badgeCls: '', amountCls: '' };
}

export function computeTotalToPay(preventivoBase, priorAmount) {
  return Math.round((Number(preventivoBase || 0) + Number(priorAmount || 0)) * 100) / 100;
}

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
  const priorBalance = getPriorBalanceForPeriod(house, fiscalPeriodId);
  const preventivoBase = totalsRow?.preventivo ?? 0;
  const totalToPay = priorBalance ? computeTotalToPay(preventivoBase, priorBalance.amount) : null;
  const priorBalanceWarning = priorBalance && carryDues.length
    ? 'Attenzione: sono presenti sia un saldo precedente dedicato sia riporti su preventivo per questo esercizio.'
    : null;

  return {
    period,
    totalsRow,
    slots,
    consuntivoDues,
    consuntivoTotal,
    preventivoDues,
    carryDues,
    priorBalance,
    preventivoBase,
    totalToPay,
    priorBalanceWarning,
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

export function priorBalanceSourceLabel(house, priorBalance) {
  if (!priorBalance?.sourcePeriodId) return '—';
  return periodLabel(house, priorBalance.sourcePeriodId);
}

export function hasConsuntivoReport(report) {
  return Boolean(report?.consuntivoDues?.length || report?.consuntivoTotal);
}

export function hasPreventivoReport(report) {
  return Boolean(report?.slots?.length || report?.preventivoDues?.length);
}

export function hasPriorBalanceReport(report) {
  return Boolean(report?.priorBalance);
}

export function hasPaymentsOnlyReport(report) {
  return Boolean(report?.periodPayments?.length) && !hasConsuntivoReport(report) && !hasPreventivoReport(report);
}

/** Default PDF: consuntivo se presente, altrimenti preventivo. */
export function defaultSituazionePdfKind(report) {
  if (hasConsuntivoReport(report)) return 'consuntivo';
  if (hasPreventivoReport(report)) return 'preventivo';
  if (hasPriorBalanceReport(report)) return 'preventivo';
  return null;
}

export function resolveSituazionePdfKind(report, requestedKind) {
  const hasCons = hasConsuntivoReport(report);
  const hasPrev = hasPreventivoReport(report);
  const hasPrior = hasPriorBalanceReport(report);
  if (!hasCons && !hasPrev && !hasPrior) return null;
  if (requestedKind === 'consuntivo' && hasCons) return 'consuntivo';
  if (requestedKind === 'preventivo' && (hasPrev || hasPrior)) return 'preventivo';
  return defaultSituazionePdfKind(report);
}
