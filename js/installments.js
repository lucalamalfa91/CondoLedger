import { isPreventivoDue, periodLabel } from './fiscal.js';
import { isOrdinarioDue, isStraordinarioDue, VOCI_RATA } from './voci.js';
import { pad2 } from './utils.js';

export const SPLIT_MODES = {
  monthly: { label: 'Mensile', slots: 12 },
  bimonthly: { label: 'Bimestrale', slots: 6 },
  semiannual: { label: 'Semestrale', slots: 2 }
};

const MONTH_NAMES = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

export function parseInstallmentKey(key) {
  if (!key || typeof key !== 'string') return null;
  const m = key.match(/^([^:]+):(\d+)$/);
  if (!m) return null;
  return { dueId: m[1], slotIndex: Number(m[2]) };
}

export function makeInstallmentKey(dueId, slotIndex) {
  return `${dueId}:${slotIndex}`;
}

function addMonths(isoDate, months) {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function monthEnd(isoMonthStart) {
  const [y, m] = isoMonthStart.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(last)}`;
}

function slotMonthOffsets(due) {
  const mode = due.splitMode || 'monthly';
  if (mode === 'custom' && Array.isArray(due.splitCustom) && due.splitCustom.length) {
    return due.splitCustom.map(Number).filter(n => n >= 0 && n < 12);
  }
  const n = SPLIT_MODES[mode]?.slots ?? 12;
  if (mode === 'bimonthly') return Array.from({ length: n }, (_, i) => i * 2);
  if (mode === 'semiannual') return Array.from({ length: n }, (_, i) => i * 6);
  return Array.from({ length: 12 }, (_, i) => i);
}

/** Le tre voci di una rata; una riga vecchia, senza voci, è tutta ordinario. */
export function splitRowParts(row) {
  const parts = {};
  let hasVoices = false;
  for (const voice of VOCI_RATA) {
    const value = Number(row?.[voice]);
    parts[voice] = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
    if (Number.isFinite(value) && value !== 0) hasVoices = true;
  }
  if (!hasVoices) {
    const amount = Number(row?.amount);
    if (Number.isFinite(amount)) parts.ordinario = Math.round(amount * 100) / 100;
  }
  return parts;
}

export function partsTotal(parts) {
  return Math.round(VOCI_RATA.reduce((sum, voice) => sum + Number(parts?.[voice] || 0), 0) * 100) / 100;
}

function normalizeSplitAmounts(due) {
  if (!Array.isArray(due.splitAmounts) || !due.splitAmounts.length) return null;
  return due.splitAmounts
    .map((row, slotIndex) => {
      const periodStart = String(row.periodStart || row.period_start || '').slice(0, 10);
      if (!periodStart) return null;
      const parts = splitRowParts(row);
      const amount = partsTotal(parts);
      if (!Number.isFinite(amount)) return null;
      const periodEnd = row.periodEnd || row.period_end
        ? String(row.periodEnd || row.period_end).slice(0, 10)
        : monthEnd(periodStart);
      const monthNum = Number(periodStart.slice(5, 7));
      const label = row.label || `${MONTH_NAMES[monthNum - 1]} ${periodStart.slice(0, 4)}`;
      return { periodStart, periodEnd, amount, parts, label, slotIndex };
    })
    .filter(Boolean);
}

/**
 * Una riga del piano fatta di solo conguaglio.
 *
 * Non è una rata dell'anno: è il debito dell'anno prima messo a scadenza dentro
 * il piano. Chiamarla «Rata 2» sposta di uno il numero di tutte quelle dopo, e
 * chi confronta il resoconto col riparto dell'amministratore non si ritrova.
 */
export function isConguaglioSlot(slot) {
  const p = slot?.parts || {};
  return Math.abs(Number(p.conguaglio || 0)) > 0.005
    && Math.abs(Number(p.ordinario || 0)) <= 0.005
    && Math.abs(Number(p.straordinari || 0)) <= 0.005;
}

/** Numera le rate vere, saltando le righe di conguaglio. */
function numeraSlot(slots) {
  let numero = 0;
  for (const slot of slots) {
    slot.soloConguaglio = isConguaglioSlot(slot);
    slot.numero = slot.soloConguaglio ? null : ++numero;
  }
  return slots;
}

export function listInstallmentsForDue(house, due) {
  // Gli straordinari non hanno rate proprie: il loro importo sta dentro il piano
  // rate dell'ordinario, nella colonna S.
  if (!isPreventivoDue(due) || isStraordinarioDue(due)) return [];
  const period = house.fiscalPeriods.find(p => p.id === due.fiscalPeriodId);
  if (!period?.startDate) return [];

  const explicit = normalizeSplitAmounts(due);
  if (explicit?.length) {
    return numeraSlot(explicit.map(row => ({
      key: makeInstallmentKey(due.id, row.slotIndex),
      dueId: due.id,
      fiscalPeriodId: due.fiscalPeriodId,
      slotIndex: row.slotIndex,
      label: row.label,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      amountDue: row.amount,
      parts: row.parts,
      dueDescription: due.description || ''
    })));
  }

  const offsets = slotMonthOffsets(due);
  const total = Number(due.amount || 0);
  const n = offsets.length || 1;
  const base = Math.floor((total * 100) / n) / 100;
  let allocated = 0;

  return numeraSlot(offsets.map((offset, slotIndex) => {
    const periodStart = addMonths(period.startDate, offset);
    const periodEnd = monthEnd(periodStart);
    const isLast = slotIndex === n - 1;
    const amountDue = isLast ? Math.round((total - allocated) * 100) / 100 : base;
    allocated += amountDue;
    const monthNum = Number(periodStart.slice(5, 7));
    const label = `${MONTH_NAMES[monthNum - 1]} ${periodStart.slice(0, 4)}`;
    return {
      key: makeInstallmentKey(due.id, slotIndex),
      dueId: due.id,
      fiscalPeriodId: due.fiscalPeriodId,
      slotIndex,
      label,
      periodStart,
      periodEnd,
      amountDue,
      parts: { ordinario: amountDue, conguaglio: 0, straordinari: 0 },
      dueDescription: due.description || ''
    };
  }));
}

export function listInstallmentsForPeriod(house, fiscalPeriodId) {
  const dues = house.dues.filter(d => d.fiscalPeriodId === fiscalPeriodId && isOrdinarioDue(d));
  return dues.flatMap(d => listInstallmentsForDue(house, d));
}

/** Il dovuto ordinario dell'anno: è lui a portare il piano rate. */
export function ordinarioDueForPeriod(house, fiscalPeriodId) {
  return house.dues.find(d => String(d.fiscalPeriodId) === String(fiscalPeriodId) && isOrdinarioDue(d)) || null;
}

export function straordinariDuesForPeriod(house, fiscalPeriodId) {
  return house.dues.filter(d => String(d.fiscalPeriodId) === String(fiscalPeriodId) && isStraordinarioDue(d));
}

export function listAllInstallments(house) {
  return house.dues.filter(isOrdinarioDue).flatMap(d => listInstallmentsForDue(house, d));
}

export function findInstallment(house, key) {
  const parsed = parseInstallmentKey(key);
  if (!parsed) return null;
  const due = house.dues.find(d => d.id === parsed.dueId);
  if (!due) return null;
  return listInstallmentsForDue(house, due).find(s => s.slotIndex === parsed.slotIndex) || null;
}

export function findInstallmentForDate(house, due, dateStr) {
  const iso = String(dateStr || '').slice(0, 10);
  const slots = listInstallmentsForDue(house, due);
  return slots.find(s => iso >= s.periodStart && iso <= s.periodEnd) || slots[0] || null;
}

export function installmentLabel(house, key, fallback = '—') {
  if (!key) return 'Da assegnare';
  const slot = findInstallment(house, key);
  if (!slot) return fallback;
  const ex = periodLabel(house, slot.fiscalPeriodId);
  const desc = slot.dueDescription ? ` · ${slot.dueDescription}` : '';
  return `${slot.label}${desc} (${ex})`;
}

export function installmentShortLabel(house, key) {
  if (!key) return 'Da assegnare';
  const slot = findInstallment(house, key);
  return slot ? slot.label : '—';
}

export function inferInstallmentKey(house, payment) {
  if (payment.installmentKey) return payment.installmentKey;
  if (payment.priorBalanceId) return null;
  const dues = house.dues.filter(d => d.fiscalPeriodId === payment.fiscalPeriodId && isPreventivoDue(d));
  for (const due of dues) {
    const slot = findInstallmentForDate(house, due, payment.date);
    if (slot) return slot.key;
  }
  return null;
}

export function paymentsSummaryForList(payments, house) {
  const keys = new Set();
  let total = 0;
  for (const p of payments) {
    total += Number(p.amount || 0);
    const key = p.installmentKey || inferInstallmentKey(house, p);
    if (key) keys.add(key);
  }
  return { count: payments.length, installmentsCovered: keys.size, total };
}

export function installmentSummaryForPeriod(house, fiscalPeriodId) {
  const slots = listInstallmentsForPeriod(house, fiscalPeriodId);
  const consuntivoDues = house.dues.filter(d => d.fiscalPeriodId === fiscalPeriodId && d.dueKind === 'consuntivo');
  const preventivoDues = house.dues.filter(d => d.fiscalPeriodId === fiscalPeriodId && isPreventivoDue(d));
  const straordinariDues = straordinariDuesForPeriod(house, fiscalPeriodId);
  const consuntivoTotal = consuntivoDues.reduce((s, d) => s + Number(d.amount || 0), 0);
  const paidByKey = new Map();
  for (const p of house.payments.filter(x => x.fiscalPeriodId === fiscalPeriodId)) {
    const key = p.installmentKey || inferInstallmentKey(house, p);
    if (!key) continue;
    paidByKey.set(key, (paidByKey.get(key) || 0) + Number(p.amount || 0));
  }
  const rows = slots.map(slot => {
    const paid = paidByKey.get(slot.key) || 0;
    return {
      ...slot,
      paid,
      balance: paid - slot.amountDue,
      payments: house.payments.filter(p => {
        const k = p.installmentKey || inferInstallmentKey(house, p);
        return k === slot.key;
      })
    };
  });
  return { slots: rows, consuntivoTotal, consuntivoDues, preventivoDues, straordinariDues };
}
