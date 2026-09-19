/**
 * Il piano rate di un anno condominiale.
 *
 * Una rata non è più un solo importo: contiene quanto di ordinario (P), quanto di
 * conguaglio (±) e quanto di straordinari (S). Il piano vive nel dovuto ordinario
 * dell'anno — è l'unico ancoraggio stabile, quello a cui i pagamenti si agganciano
 * con la chiave rata — e le tre colonne devono tornare con i tre totali dell'anno:
 * il preventivo, il conguaglio che arriva dall'anno prima e gli straordinari
 * deliberati.
 */
import { periodLabel } from './fiscal.js';
import {
  listInstallmentsForDue,
  ordinarioDueForPeriod,
  partsTotal,
  straordinariDuesForPeriod
} from './installments.js';
import { getPriorBalanceForPeriod } from './situazione-report.js';
import { VOCI_RATA } from './voci.js';
import { pad2 } from './utils.js';

const MONTH_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export function monthEndIso(startIso) {
  const [y, m] = String(startIso).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(last)}`;
}

export function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/** Quanto c'è da mettere nelle rate, voce per voce. */
export function planTargets(house, periodId) {
  const ordinarioDue = ordinarioDueForPeriod(house, periodId);
  const straordinari = straordinariDuesForPeriod(house, periodId);
  const prior = getPriorBalanceForPeriod(house, periodId);
  return {
    ordinario: round2(ordinarioDue?.amount || 0),
    conguaglio: round2(prior?.amount || 0),
    straordinari: round2(straordinari.reduce((sum, d) => sum + Number(d.amount || 0), 0)),
    ordinarioDue,
    straordinariDues: straordinari,
    priorBalance: prior || null
  };
}

/** Le righe del piano come sono salvate oggi (o quelle generate dalla cadenza). */
export function planRows(house, periodId) {
  const due = ordinarioDueForPeriod(house, periodId);
  if (!due) return [];
  return listInstallmentsForDue(house, due).map(slot => ({
    start: slot.periodStart,
    ordinario: round2(slot.parts?.ordinario || 0),
    conguaglio: round2(slot.parts?.conguaglio || 0),
    straordinari: round2(slot.parts?.straordinari || 0)
  }));
}

export function rowTotal(row) {
  return partsTotal(row);
}

export function planTotals(rows) {
  const out = { ordinario: 0, conguaglio: 0, straordinari: 0, total: 0 };
  for (const row of rows || []) {
    for (const voice of VOCI_RATA) out[voice] = round2(out[voice] + Number(row[voice] || 0));
    out.total = round2(out.total + rowTotal(row));
  }
  return out;
}

/**
 * Confronto fra quello che c'è da pagare e quello che è finito nelle rate.
 * @returns {{voice:string,target:number,allocated:number,diff:number,ok:boolean,message:string}[]}
 */
export function planStatus(targets, rows) {
  const allocated = planTotals(rows);
  return VOCI_RATA.map(voice => {
    const target = round2(targets[voice] || 0);
    const got = round2(allocated[voice] || 0);
    const diff = round2(got - target);
    const ok = Math.abs(diff) < 0.01;
    let message = 'Tutto nelle rate';
    if (!ok) {
      message = diff < 0
        ? `Mancano ${fmtShort(Math.abs(diff))} da mettere nelle rate`
        : `Ci sono ${fmtShort(diff)} in più nelle rate`;
    }
    return { voice, target, allocated: got, diff, ok, message };
  });
}

function fmtShort(n) {
  return `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Divide un importo in `n` parti: i centesimi di resto vanno sull'ultima. */
export function splitEqually(total, n) {
  if (!n) return [];
  const cents = Math.round(Number(total || 0) * 100);
  const base = Math.trunc(cents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? cents - base * (n - 1) : base) / 100);
}

export const CADENCES = [
  { id: 'monthly', label: '12 rate mensili', slots: 12, step: 1 },
  { id: 'bimonthly', label: '6 rate bimestrali', slots: 6, step: 2 },
  { id: 'semiannual', label: '2 rate semestrali', slots: 2, step: 6 },
  { id: 'single', label: 'Rata unica', slots: 1, step: 12 }
];

export function monthsOfYear(startIso) {
  if (!startIso) return [];
  const [y, m] = String(startIso).split('-').map(Number);
  if (!y || !m) return [];
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m - 1 + i, 1);
    const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
    return { value: iso, month: d.getMonth(), year: d.getFullYear(), label: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}` };
  });
}

/**
 * Genera le rate di una cadenza: l'ordinario diviso in parti uguali, il conguaglio
 * sulla prima rata utile e gli straordinari divisi sulle rate scelte (tutte, se non
 * si dice altro).
 */
export function generateRows({ periodStart, cadence = 'monthly', targets }) {
  const months = monthsOfYear(periodStart);
  const spec = CADENCES.find(c => c.id === cadence) || CADENCES[0];
  if (!months.length) return [];
  const ordinari = splitEqually(targets?.ordinario || 0, spec.slots);
  const straordinari = splitEqually(targets?.straordinari || 0, spec.slots);
  return ordinari.map((amount, i) => ({
    start: months[i * spec.step]?.value || months[0].value,
    ordinario: amount,
    // Il conguaglio sta tutto sulla prima rata: è un debito con una sua scadenza,
    // non una spesa da spalmare, a meno che non si scelga diversamente.
    conguaglio: i === 0 ? round2(targets?.conguaglio || 0) : 0,
    straordinari: straordinari[i] || 0
  }));
}

/** Le righe pronte per `split_amounts`, ordinate per scadenza. */
export function rowsToSplitAmounts(house, periodId, rows) {
  return (rows || [])
    .filter(r => r.start)
    .slice()
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .map((row, i) => ({
      periodStart: row.start,
      periodEnd: monthEndIso(row.start),
      amount: rowTotal(row),
      ordinario: round2(row.ordinario),
      conguaglio: round2(row.conguaglio),
      straordinari: round2(row.straordinari),
      label: `Rata ${i + 1} · ${MONTH_SHORT[Number(String(row.start).slice(5, 7)) - 1]} ${String(row.start).slice(0, 4)}`
    }));
}

/** Una rata è dentro l'anno condominiale? Fuori si può stare, ma va detto. */
export function isOutsidePeriod(house, periodId, startIso) {
  const period = house.fiscalPeriods.find(p => String(p.id) === String(periodId));
  if (!period?.startDate || !startIso) return false;
  return startIso < period.startDate || startIso > period.endDate;
}

export function planPeriodLabel(house, periodId) {
  return periodLabel(house, periodId);
}
