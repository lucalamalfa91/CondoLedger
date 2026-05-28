import { pad2, toIsoDate } from './utils.js';

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

export function periodSummary(house) {
  const map = new Map();
  for (const p of house.fiscalPeriods) {
    map.set(p.id, { id: p.id, label: p.label, startDate: p.startDate, endDate: p.endDate, due: 0, paid: 0 });
  }
  for (const item of house.dues) {
    const c = map.get(item.fiscalPeriodId) || { id: item.fiscalPeriodId, label: periodLabel(house, item.fiscalPeriodId), due: 0, paid: 0 };
    c.due += Number(item.amount || 0);
    map.set(item.fiscalPeriodId, c);
  }
  for (const item of house.payments) {
    const c = map.get(item.fiscalPeriodId) || { id: item.fiscalPeriodId, label: periodLabel(house, item.fiscalPeriodId), due: 0, paid: 0 };
    c.paid += Number(item.amount || 0);
    map.set(item.fiscalPeriodId, c);
  }
  return [...map.values()]
    .map(item => ({ ...item, balance: item.paid - item.due }))
    .sort((a, b) => String(b.startDate || b.label).localeCompare(String(a.startDate || a.label)));
}

export function totals(house) {
  const due = house.dues.reduce((s, d) => s + Number(d.amount || 0), 0);
  const paid = house.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = paid - due;
  const periods = periodSummary(house);
  return {
    due,
    paid,
    balance,
    debtYears: periods.filter(y => y.balance < 0).length,
    creditYears: periods.filter(y => y.balance > 0).length,
    years: periods.length
  };
}

export function ensurePeriodPayload(house, dateStr) {
  const p = findPeriodByDate(house, dateStr);
  if (p.id) return { id: p.id, label: p.label, startDate: p.startDate, endDate: p.endDate };
  const startYear = startYearForDate(toIsoDate(dateStr), house.fiscalStartMonth);
  const bounds = periodBounds(startYear, house.fiscalStartMonth);
  return bounds;
}
