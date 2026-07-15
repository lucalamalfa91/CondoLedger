import { pad2, toIsoDate, today } from './utils.js';

export const DUE_KINDS = {
  preventivo: { label: 'Preventivo', short: 'Prev.' },
  consuntivo: { label: 'Consuntivo', short: 'Cons.' }
};

export function isPreventivoDue(due) {
  return (due.dueKind || 'preventivo') === 'preventivo';
}

export function isConsuntivoDue(due) {
  return due.dueKind === 'consuntivo';
}

/**
 * Preventivo "vero" da sommare negli aggregati (Situazione/Panoramica).
 * Esclude i dovuti generati da un saldo anno precedente: quell'importo è già
 * conteggiato come saldo precedente, sommarlo anche qui lo conterebbe due volte.
 */
export function isAggregatedPreventivoDue(due) {
  return isPreventivoDue(due) && !due.priorBalanceId;
}

export function fiscalLabel(startYear, startMonth) {
  if (startMonth === 1) return String(startYear);
  return `${startYear}/${startYear + 1}`;
}

export function periodBounds(startYear, startMonth) {
  const startDate = `${startYear}-${pad2(startMonth)}-01`;
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const endDate = `${endYear}-${pad2(endMonth)}-${pad2(lastDay)}`;
  return { label: fiscalLabel(startYear, startMonth), startDate, endDate };
}

export function startYearForDate(dateStr, startMonth) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= startMonth ? year : year - 1;
}

export function findPeriodByDate(house, dateStr) {
  const iso = toIsoDate(dateStr);
  const existing = house.fiscalPeriods.find(p => iso >= p.startDate && iso <= p.endDate);
  if (existing) return existing;
  const startYear = startYearForDate(iso, house.fiscalStartMonth);
  const bounds = periodBounds(startYear, house.fiscalStartMonth);
  return { id: null, ...bounds, computed: true };
}

export function periodLabel(house, periodId) {
  const p = house.fiscalPeriods.find(x => x.id === periodId);
  return p?.label || '—';
}

export function getPreviousPeriod(house, periodId) {
  const sorted = [...house.fiscalPeriods].sort((a, b) =>
    String(a.startDate).localeCompare(String(b.startDate))
  );
  const idx = sorted.findIndex(p => String(p.id) === String(periodId));
  if (idx <= 0) return null;
  return sorted[idx - 1];
}

export function getNextPeriod(house, periodId) {
  const sorted = [...house.fiscalPeriods].sort((a, b) =>
    String(a.startDate).localeCompare(String(b.startDate))
  );
  const idx = sorted.findIndex(p => String(p.id) === String(periodId));
  if (idx < 0 || idx >= sorted.length - 1) return null;
  return sorted[idx + 1];
}

/** Versamenti sul dovuto di riporto (preventivo) nell'esercizio successivo. */
export function sumConsuntivoSettlementFromNextPeriod(house, periodId) {
  const next = getNextPeriod(house, periodId);
  if (!next) return 0;

  const carryDue = house.dues.find(d =>
    String(d.fiscalPeriodId) === String(next.id) &&
    d.carryFromPeriodId &&
    String(d.carryFromPeriodId) === String(periodId)
  );
  if (!carryDue) return 0;

  const prefix = `${carryDue.id}:`;
  let sum = 0;
  for (const p of house.payments) {
    if (String(p.fiscalPeriodId) !== String(next.id)) continue;
    const key = p.installmentKey || '';
    if (!key.startsWith(prefix)) continue;
    sum += Number(p.amount || 0);
  }
  return sum;
}

export function applyConsuntivoSettlement(rawBalance, settlement) {
  if (rawBalance === null || Math.abs(rawBalance) < 0.005) {
    return { balance: rawBalance ?? 0, settlementApplied: 0, settled: false };
  }
  let applied = settlement;
  if (rawBalance < 0) applied = Math.min(Math.max(0, settlement), -rawBalance);
  else applied = Math.max(Math.min(0, settlement), -rawBalance);
  let balance = rawBalance + applied;
  if (rawBalance < 0) balance = Math.min(0, balance);
  else balance = Math.max(0, balance);
  const settled = Math.abs(applied) > 0.005 && Math.abs(balance) < 0.005;
  return { balance, settlementApplied: applied, settled };
}

export function effectiveConsuntivoBalance(house, periodId) {
  const raw = consuntivoBalance(house, periodId);
  if (raw === null) return null;
  const settlement = sumConsuntivoSettlementFromNextPeriod(house, periodId);
  return applyConsuntivoSettlement(raw, settlement).balance;
}

export function consuntivoBalanceFootnote(house, periodRow) {
  if (!periodRow || !periodRow.consuntivo) return '';
  if (periodRow.consuntivoSettledInNext) {
    const next = getNextPeriod(house, periodRow.id);
    return next ? `Saldato in ${next.label}` : 'Saldato nell\'esercizio successivo';
  }
  if (periodRow.balanceConsuntivo >= 0) return 'Eccedenza su consuntivo';
  return 'Debito su consuntivo';
}

function emptyPeriodRow(p) {
  return {
    id: p.id,
    label: p.label,
    startDate: p.startDate,
    endDate: p.endDate,
    preventivo: 0,
    consuntivo: 0,
    due: 0,
    paid: 0,
    balanceConsuntivo: 0,
    balancePreventivo: 0,
    balance: 0
  };
}

/** Id dei dovuti generati da un saldo anno precedente (rata unica collegata). */
function priorLinkedDueIds(dues) {
  return new Set(dues.filter(d => d.priorBalanceId).map(d => String(d.id)));
}

/** Il versamento copre un dovuto collegato a un saldo anno precedente (non il preventivo/consuntivo). */
function isPaymentForPriorLinkedDue(payment, linkedIds) {
  const key = payment.installmentKey || '';
  const sep = key.indexOf(':');
  const dueId = sep >= 0 ? key.slice(0, sep) : null;
  return Boolean(dueId && linkedIds.has(dueId));
}

export function periodSummary(house) {
  const map = new Map();
  for (const p of house.fiscalPeriods) {
    map.set(p.id, emptyPeriodRow(p));
  }
  for (const item of house.dues) {
    const c = map.get(item.fiscalPeriodId) || {
      id: item.fiscalPeriodId,
      label: periodLabel(house, item.fiscalPeriodId),
      preventivo: 0,
      consuntivo: 0,
      due: 0,
      paid: 0,
      priorLinkedPaid: 0
    };
    const amount = Number(item.amount || 0);
    if (isConsuntivoDue(item)) {
      c.consuntivo += amount;
      c.due += amount;
    } else if (isAggregatedPreventivoDue(item)) {
      c.preventivo += amount;
      c.due += amount;
    }
    map.set(item.fiscalPeriodId, c);
  }
  const linkedIds = priorLinkedDueIds(house.dues);
  for (const item of house.payments) {
    const c = map.get(item.fiscalPeriodId) || {
      id: item.fiscalPeriodId,
      label: periodLabel(house, item.fiscalPeriodId),
      preventivo: 0,
      consuntivo: 0,
      due: 0,
      paid: 0,
      priorLinkedPaid: 0
    };
    const amount = Number(item.amount || 0);
    c.paid += amount;
    if (isPaymentForPriorLinkedDue(item, linkedIds)) c.priorLinkedPaid = (c.priorLinkedPaid || 0) + amount;
    map.set(item.fiscalPeriodId, c);
  }
  return [...map.values()]
    .map(item => {
      // I versamenti a copertura di un saldo anno precedente non vanno sottratti dal
      // saldo preventivo/consuntivo dell'esercizio: quel debito non è conteggiato lì
      // (vedi isAggregatedPreventivoDue) ma in situazione-report.js tramite priorAmount.
      const paidForBalance = item.paid - (item.priorLinkedPaid || 0);
      const balanceConsuntivoRaw = paidForBalance - item.consuntivo;
      const settlementFromNext = sumConsuntivoSettlementFromNextPeriod(house, item.id);
      const { balance: balanceConsuntivo, settled: consuntivoSettledInNext } =
        applyConsuntivoSettlement(balanceConsuntivoRaw, settlementFromNext);
      const balancePreventivo = paidForBalance - item.preventivo;
      return {
        ...item,
        balanceConsuntivoRaw,
        settlementFromNext,
        consuntivoSettledInNext,
        balanceConsuntivo,
        balancePreventivo,
        balance: balanceConsuntivo
      };
    })
    .sort((a, b) => String(b.startDate || b.label).localeCompare(String(a.startDate || a.label)));
}

export function sumConsuntivoDue(house, periodId) {
  return house.dues
    .filter(d => d.fiscalPeriodId === periodId && isConsuntivoDue(d))
    .reduce((s, d) => s + Number(d.amount || 0), 0);
}

export function sumPreventivoDue(house, periodId) {
  return house.dues
    .filter(d => d.fiscalPeriodId === periodId && isAggregatedPreventivoDue(d))
    .reduce((s, d) => s + Number(d.amount || 0), 0);
}

export function sumPaid(house, periodId) {
  return house.payments
    .filter(p => p.fiscalPeriodId === periodId)
    .reduce((s, p) => s + Number(p.amount || 0), 0);
}

/** Importo di riferimento per match import: consuntivo se presente, altrimenti preventivo. */
export function primaryDueAmountForPeriod(periodRow) {
  if (!periodRow) return 0;
  if (Number(periodRow.consuntivo) > 0) return periodRow.consuntivo;
  return Number(periodRow.preventivo ?? periodRow.due ?? 0);
}

export function periodHasConsuntivo(house, periodId) {
  return sumConsuntivoDue(house, periodId) > 0;
}

/** Saldo consuntivo = versato − consuntivo (eccedenza se positivo). Null se non c’è consuntivo. */
export function consuntivoBalance(house, periodId) {
  const consuntivo = sumConsuntivoDue(house, periodId);
  if (consuntivo === 0) return null;
  return sumPaid(house, periodId) - consuntivo;
}

export function totals(house, periodId = null) {
  const dues = periodId ? house.dues.filter(d => d.fiscalPeriodId === periodId) : house.dues;
  const payments = periodId ? house.payments.filter(p => p.fiscalPeriodId === periodId) : house.payments;
  const preventivo = dues.filter(isAggregatedPreventivoDue).reduce((s, d) => s + Number(d.amount || 0), 0);
  const consuntivo = dues.filter(isConsuntivoDue).reduce((s, d) => s + Number(d.amount || 0), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const periods = periodId
    ? periodSummary(house).filter(p => p.id === periodId)
    : periodSummary(house);
  const balanceConsuntivo = periods.reduce((s, p) => s + p.balanceConsuntivo, 0);
  const linkedIds = priorLinkedDueIds(dues);
  const priorLinkedPaid = payments.reduce(
    (s, p) => s + (isPaymentForPriorLinkedDue(p, linkedIds) ? Number(p.amount || 0) : 0), 0
  );
  const balancePreventivo = periodId
    ? (paid - priorLinkedPaid) - preventivo
    : periods.reduce((s, p) => s + p.balancePreventivo, 0);
  return {
    preventivo,
    consuntivo,
    due: preventivo + consuntivo,
    paid,
    balance: balanceConsuntivo,
    balanceConsuntivo,
    balancePreventivo,
    debtYears: periods.filter(y => y.balanceConsuntivo < -0.005).length,
    creditYears: periods.filter(y => y.balanceConsuntivo > 0.005).length,
    years: periodId ? (periods.length ? 1 : 0) : periods.length,
    dueCount: dues.length,
    paymentCount: payments.length
  };
}

export function parseFiscalLabel(house, labelText) {
  const label = String(labelText || '').trim();
  if (!label) throw new Error('Inserisci l\'esercizio fiscale (es. 2024/2025).');

  const split = label.match(/^(\d{4})\/(\d{4})$/);
  if (split) {
    const startYear = Number(split[1]);
    const endYear = Number(split[2]);
    if (endYear !== startYear + 1) {
      throw new Error('Formato non valido: usa es. 2024/2025 (anno fine = anno inizio + 1).');
    }
    const bounds = periodBounds(startYear, house.fiscalStartMonth ?? 6);
    return { ...bounds, label };
  }

  const single = label.match(/^(\d{4})$/);
  if (single) {
    const startYear = Number(single[1]);
    const bounds = periodBounds(startYear, house.fiscalStartMonth ?? 6);
    return bounds;
  }

  throw new Error('Formato esercizio non valido. Usa 2024/2025 oppure 2025.');
}

export function defaultFiscalLabel(house, dateStr = today) {
  return findPeriodByDate(house, dateStr).label;
}

export function ensurePeriodPayload(house, dateStr) {
  const p = findPeriodByDate(house, dateStr);
  if (p.id) return { id: p.id, label: p.label, startDate: p.startDate, endDate: p.endDate };
  const startYear = startYearForDate(toIsoDate(dateStr), house.fiscalStartMonth);
  return periodBounds(startYear, house.fiscalStartMonth);
}
