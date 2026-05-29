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
      paid: 0
    };
    const amount = Number(item.amount || 0);
    if (isConsuntivoDue(item)) c.consuntivo += amount;
    else c.preventivo += amount;
    c.due += amount;
    map.set(item.fiscalPeriodId, c);
  }
  for (const item of house.payments) {
    const c = map.get(item.fiscalPeriodId) || {
      id: item.fiscalPeriodId,
      label: periodLabel(house, item.fiscalPeriodId),
      preventivo: 0,
      consuntivo: 0,
      due: 0,
      paid: 0
    };
    c.paid += Number(item.amount || 0);
    map.set(item.fiscalPeriodId, c);
  }
  return [...map.values()]
    .map(item => {
      const balanceConsuntivo = item.paid - item.consuntivo;
      const balancePreventivo = item.paid - item.preventivo;
      return {
        ...item,
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
    .filter(d => d.fiscalPeriodId === periodId && isPreventivoDue(d))
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
  const preventivo = dues.filter(isPreventivoDue).reduce((s, d) => s + Number(d.amount || 0), 0);
  const consuntivo = dues.filter(isConsuntivoDue).reduce((s, d) => s + Number(d.amount || 0), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balanceConsuntivo = paid - consuntivo;
  const balancePreventivo = paid - preventivo;
  const periods = periodId
    ? periodSummary(house).filter(p => p.id === periodId)
    : periodSummary(house);
  return {
    preventivo,
    consuntivo,
    due: preventivo + consuntivo,
    paid,
    balance: balanceConsuntivo,
    balanceConsuntivo,
    balancePreventivo,
    debtYears: periods.filter(y => y.balanceConsuntivo < 0).length,
    creditYears: periods.filter(y => y.balanceConsuntivo > 0).length,
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
