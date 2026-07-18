/**
 * Calcolo puro delle rate residue per il feed calendario.
 * Copia minimale e volutamente autonoma della logica in js/situazione-report.js,
 * js/fiscal.js e js/reminder-plan.js: qui `today` viene passato esplicitamente
 * ad ogni chiamata (una Edge Function Deno può riusare l'isolate a caldo tra
 * richieste, quindi non si può calcolare "oggi" una volta sola a livello di modulo).
 * Se cambia la formula di conguaglio/rate lato client, va aggiornata anche qui.
 */

export type Cadence = 'monthly' | 'bimonthly' | 'semiannual';

const CADENCE_MONTHS: Record<Cadence, number> = { monthly: 1, bimonthly: 2, semiannual: 6 };

export interface FiscalPeriod {
  id: number | string;
  label: string;
  startDate: string;
  endDate: string;
}

export interface Due {
  fiscalPeriodId: number | string;
  amount: number;
  dueKind: string;
}

export interface Payment {
  fiscalPeriodId: number | string;
  amount: number;
  date: string;
}

export interface PriorBalance {
  fiscalPeriodId: number | string;
  amount: number;
}

export interface ReminderItem {
  date: string;
  amount: number;
  index: number;
  count: number;
  summary: string;
  description: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function monthEnd(isoMonthStart: string): string {
  const [y, m] = isoMonthStart.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(last)}`;
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function dayBefore(isoDate: string): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface CadenceSlot {
  windowStart: string;
  windowEnd: string;
  reminderDate: string;
}

/** Griglia di finestre [windowStart, windowEnd] alla cadenza scelta, con la data di promemoria di ciascuna. */
function buildCadenceSlots(period: FiscalPeriod, cadence: Cadence): CadenceSlot[] {
  const months = CADENCE_MONTHS[cadence] ?? 1;
  const windowStarts: string[] = [];
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

export function findActivePeriod(periods: FiscalPeriod[], today: string): FiscalPeriod | null {
  return periods.find(p => p.startDate <= today && today <= p.endDate) || null;
}

/** Importo mancante = totale da versare (preventivo/consuntivo + conguaglio) − versato. */
export function computeRemainingAmount(
  period: FiscalPeriod,
  dues: Due[],
  payments: Payment[],
  priorBalances: PriorBalance[]
): number {
  const periodDues = dues.filter(d => String(d.fiscalPeriodId) === String(period.id));
  const preventivoBase = periodDues
    .filter(d => (d.dueKind || 'preventivo') === 'preventivo')
    .reduce((s, d) => s + Number(d.amount || 0), 0);
  const consuntivoBase = periodDues
    .filter(d => d.dueKind === 'consuntivo')
    .reduce((s, d) => s + Number(d.amount || 0), 0);
  const paidTotal = payments
    .filter(p => String(p.fiscalPeriodId) === String(period.id))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const priorBalance = priorBalances.find(b => String(b.fiscalPeriodId) === String(period.id)) || null;
  const priorAmount = priorBalance ? Number(priorBalance.amount || 0) : 0;
  const hasCons = consuntivoBase > 0.005;
  const hasPrior = Boolean(priorBalance);
  const totalToPayPreventivo = hasPrior ? preventivoBase + priorAmount : null;
  const totalToPayConsuntivo = hasPrior ? consuntivoBase + priorAmount : null;

  let daPagare: number | null = null;
  if (hasPrior && hasCons && totalToPayConsuntivo != null) daPagare = totalToPayConsuntivo;
  else if (hasPrior && totalToPayPreventivo != null) daPagare = totalToPayPreventivo;
  else if (hasCons) daPagare = consuntivoBase;
  else if (preventivoBase > 0.005) daPagare = preventivoBase;

  const totaleEsercizio = hasCons ? consuntivoBase : preventivoBase;
  const totaleDaVersare = daPagare ?? totaleEsercizio;
  return Math.max(0, Math.round((totaleDaVersare - paidTotal) * 100) / 100);
}

/** Rate residue (data + importo + causale) da oggi a fine esercizio, alla cadenza scelta. */
export function computeReminderItems(
  period: FiscalPeriod,
  remaining: number,
  cadence: Cadence,
  today: string,
  houseName: string,
  payments: Payment[] = []
): ReminderItem[] {
  if (remaining <= 0.01) return [];

  const slots = buildCadenceSlots(period, cadence);

  // Verifica a quale rata della griglia appartiene l'ultimo versamento
  // registrato (non basta confrontare la data col "oggi": una rata pagata
  // il 15 del mese va comunque considerata coperta, anche se la scadenza
  // teorica di fine mese è successiva a oggi). Si riparte dalla rata
  // successiva a quella coperta.
  const lastPaymentDate = payments
    .filter(p => String(p.fiscalPeriodId) === String(period.id))
    .reduce((max: string | null, p) => {
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

  return future.map((date, i) => {
    const isLast = i === n - 1;
    const amount = isLast ? Math.round((remaining - allocated) * 100) / 100 : base;
    allocated += amount;
    const idx = i + 1;
    const amountLabel = amount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
    const causale = `Rata condominiale ${idx}/${n} - ${period.label} - ${houseName}`;
    return {
      date,
      amount,
      index: idx,
      count: n,
      summary: `Rata condominio ${amountLabel} - ${houseName}`,
      description: `Rata ${idx}/${n} - ${period.label} - Causale: ${causale}`
    };
  });
}
