import { periodLabel, periodSummary, sumPaid, getPreviousPeriod, consuntivoBalanceFootnote } from './fiscal.js';
import { inferInstallmentKey, installmentSummaryForPeriod } from './installments.js';

export function getPriorBalanceForPeriod(house, fiscalPeriodId) {
  return (house.priorBalances || []).find(b => String(b.fiscalPeriodId) === String(fiscalPeriodId)) ?? null;
}

/** Somma dei versamenti registrati direttamente a copertura di un saldo anno precedente. */
export function sumPaidForPriorBalance(house, priorBalanceId) {
  return (house.payments || [])
    .filter(p => String(p.priorBalanceId) === String(priorBalanceId))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
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

export function computeTotalToPay(baseAmount, priorAmount) {
  return Math.round((Number(baseAmount || 0) + Number(priorAmount || 0)) * 100) / 100;
}

export function buildSituazioneReport(house, fiscalPeriodId) {
  const period = house.fiscalPeriods.find(p => p.id === fiscalPeriodId);
  const totalsRow = periodSummary(house).find(p => p.id === fiscalPeriodId) || null;
  const { slots, consuntivoTotal, consuntivoDues, preventivoDues } = installmentSummaryForPeriod(house, fiscalPeriodId);

  const slotsTotalDue = slots.reduce((s, x) => s + x.amountDue, 0);
  const slotsTotalPaid = slots.reduce((s, x) => s + x.paid, 0);

  const periodPayments = house.payments.filter(p => p.fiscalPeriodId === fiscalPeriodId);
  const priorBalancePayments = periodPayments.filter(p => p.priorBalanceId);
  const exercisePayments = periodPayments.filter(p => !p.priorBalanceId);
  const unlinkedPayments = exercisePayments.filter(p => {
    const key = p.installmentKey || inferInstallmentKey(house, p);
    return !key;
  });

  const carryDues = preventivoDues.filter(d => d.carryFromPeriodId);
  const priorBalance = getPriorBalanceForPeriod(house, fiscalPeriodId);
  const priorAmount = priorBalance ? Number(priorBalance.amount) : 0;
  const priorBalancePaid = priorBalancePayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const preventivoBase = totalsRow?.preventivo ?? 0;
  const consuntivoBase = totalsRow?.consuntivo ?? 0;
  const paidTotal = totalsRow?.paid ?? sumPaid(house, fiscalPeriodId);
  const totalToPayPreventivo = priorBalance ? computeTotalToPay(preventivoBase, priorAmount) : null;
  const totalToPayConsuntivo = priorBalance ? computeTotalToPay(consuntivoBase, priorAmount) : null;
  const balanceVsTotalPreventivo = totalToPayPreventivo != null
    ? Math.round((paidTotal - totalToPayPreventivo) * 100) / 100
    : null;
  const balanceVsTotalConsuntivo = totalToPayConsuntivo != null
    ? Math.round((paidTotal - totalToPayConsuntivo) * 100) / 100
    : null;
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
    priorAmount,
    priorBalancePayments,
    priorBalancePaid,
    preventivoBase,
    consuntivoBase,
    totalToPayPreventivo,
    totalToPayConsuntivo,
    balanceVsTotalPreventivo,
    balanceVsTotalConsuntivo,
    priorBalanceWarning,
    slotsTotalDue,
    slotsTotalPaid,
    slotsBalance: slotsTotalPaid - slotsTotalDue,
    paidTotal,
    unlinkedPayments,
    periodPayments,
    exercisePayments
  };
}

export function computeSituazioneTotals(report, totalsRow) {
  const preventivo = report?.preventivoBase ?? totalsRow?.preventivo ?? 0;
  const consuntivo = report?.consuntivoBase ?? totalsRow?.consuntivo ?? 0;
  const pagato = report?.paidTotal ?? totalsRow?.paid ?? 0;
  const hasCons = consuntivo > 0.005;
  const hasPrior = Boolean(report?.priorBalance);

  let daPagare = null;
  if (hasPrior && hasCons && report.totalToPayConsuntivo != null) {
    daPagare = report.totalToPayConsuntivo;
  } else if (hasPrior && report.totalToPayPreventivo != null) {
    daPagare = report.totalToPayPreventivo;
  } else if (hasCons) {
    daPagare = consuntivo;
  } else if (preventivo > 0.005) {
    daPagare = preventivo;
  }

  let saldo = null;
  let saldoHint = '';
  if (hasPrior && hasCons && report.balanceVsTotalConsuntivo != null) {
    saldo = report.balanceVsTotalConsuntivo;
    saldoHint = 'Versato − (consuntivo + saldo precedente)';
  } else if (hasPrior && !hasCons && report.balanceVsTotalPreventivo != null) {
    saldo = report.balanceVsTotalPreventivo;
    saldoHint = 'Versato − (preventivo + saldo precedente)';
  } else if (hasPrior && report.totalToPayPreventivo != null && !hasCons) {
    saldo = report.balanceVsTotalPreventivo ?? Math.round((pagato - report.totalToPayPreventivo) * 100) / 100;
    saldoHint = 'Versato − saldo di apertura';
  } else if (hasCons) {
    saldo = totalsRow?.balanceConsuntivo ?? Math.round((pagato - consuntivo) * 100) / 100;
    saldoHint = 'Versato − consuntivo';
  } else if (preventivo > 0.005) {
    saldo = Math.round((pagato - preventivo) * 100) / 100;
    saldoHint = 'Versato − preventivo';
  } else {
    saldo = 0;
    saldoHint = '';
  }

  let saldoLabel = 'Saldo';
  let saldoTone = '';
  if (totalsRow?.consuntivoSettledInNext) {
    saldoLabel = 'Saldo';
    saldoTone = 'success';
  } else if (saldo > 0.005) {
    saldoLabel = 'Saldo positivo';
    saldoTone = 'positive';
  } else if (saldo < -0.005) {
    saldoLabel = 'Saldo negativo';
    saldoTone = 'negative';
  } else {
    saldoTone = 'warn';
  }

  return {
    preventivo,
    consuntivo,
    daPagare,
    pagato,
    saldo,
    saldoHint,
    saldoLabel,
    saldoTone,
    hasCons,
    hasPrior
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

/** Consuntivo e saldo (eccedenza/debito) dell'esercizio di origine del riporto. */
export function computePriorYearSourceSummary(house, priorBalance, currentPeriodId) {
  if (!priorBalance) return null;

  let sourcePeriodId = priorBalance.sourcePeriodId || null;
  if (!sourcePeriodId && currentPeriodId) {
    const prev = getPreviousPeriod(house, currentPeriodId);
    sourcePeriodId = prev?.id ?? null;
  }
  if (!sourcePeriodId) {
    const pres = priorBalancePresentation(priorBalance.amount);
    return {
      sourceLabel: '—',
      consuntivo: null,
      saldo: Number(priorBalance.amount || 0),
      saldoLabel: pres.label,
      saldoCls: pres.amountCls,
      settledInNext: false,
      footnote: 'Esercizio di origine non indicato'
    };
  }

  const sourceRow = periodSummary(house).find(p => String(p.id) === String(sourcePeriodId));
  const sourceLabel = sourceRow?.label ?? periodLabel(house, sourcePeriodId);
  const consuntivo = sourceRow?.consuntivo ?? 0;
  const hasCons = consuntivo > 0.005;

  if (!hasCons) {
    const pres = priorBalancePresentation(priorBalance.amount);
    return {
      sourcePeriodId,
      sourceLabel,
      consuntivo: null,
      saldo: Number(priorBalance.amount || 0),
      saldoLabel: pres.label,
      saldoCls: pres.amountCls,
      settledInNext: false,
      footnote: `Consuntivo non registrato per ${sourceLabel}`
    };
  }

  // L'esercizio di origine può avere a sua volta un proprio saldo anno precedente
  // (riportato da un esercizio ancora precedente): va incluso, altrimenti il saldo
  // qui mostrato non coincide con quello visibile aprendo direttamente quell'esercizio.
  const sourceReport = buildSituazioneReport(house, sourcePeriodId);
  const sourceTotals = computeSituazioneTotals(sourceReport, sourceRow);
  const saldo = sourceTotals.saldo ?? sourceRow.balanceConsuntivo ?? 0;
  let saldoLabel = 'Pareggio';
  let saldoCls = 'warn';
  if (sourceRow.consuntivoSettledInNext) {
    saldoLabel = 'Saldato';
    saldoCls = 'success';
  } else if (saldo > 0.005) {
    saldoLabel = 'Eccedenza totale';
    saldoCls = 'positive';
  } else if (saldo < -0.005) {
    saldoLabel = 'Debito totale';
    saldoCls = 'negative';
  }

  let footnote = sourceReport.priorBalance ? sourceTotals.saldoHint : 'Versato − consuntivo';
  if (sourceRow.consuntivoSettledInNext) {
    footnote = consuntivoBalanceFootnote(house, sourceRow);
  } else if (Math.abs((sourceRow.balanceConsuntivoRaw ?? saldo) - saldo) > 0.005) {
    footnote = `Lordo ${sourceRow.balanceConsuntivoRaw}`;
  }

  return {
    sourcePeriodId,
    sourceLabel,
    consuntivo,
    saldo,
    saldoRaw: sourceRow.balanceConsuntivoRaw,
    saldoLabel,
    saldoCls,
    settledInNext: Boolean(sourceRow.consuntivoSettledInNext),
    footnote
  };
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
