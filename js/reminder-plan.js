/**
 * I promemoria delle rate sul calendario.
 *
 * Le rate sono quelle che il preventivo dell'anno ha già stabilito — mese e
 * importo, conguaglio e straordinari compresi — non una cadenza ricostruita a
 * parte. Prima qui si rifaceva una griglia mensile e si divideva il residuo in
 * parti uguali: ne usciva un piano che non somigliava a quello dell'app, e chi
 * lo importava nel calendario si ritrovava scadenze e cifre che non esistevano.
 */
import { installmentSummaryForPeriod } from './installments.js';
import { VOCI, VOCI_RATA } from './voci.js';
import { fmt } from './utils.js';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/** «Rata 3 · febbraio 2027» */
function titoloRata(slot) {
  const mese = Number(String(slot.periodStart || '').slice(5, 7));
  const anno = String(slot.periodStart || '').slice(0, 4);
  return `Rata ${Number(slot.slotIndex ?? 0) + 1}${mese ? ` · ${MESI[mese - 1]} ${anno}` : ''}`;
}

/** «P € 506,00 · ± -€ 85,23»: di cosa è fatta la rata, quando non è di una voce sola. */
function composizione(parts) {
  const voci = VOCI_RATA.filter(v => Math.abs(Number(parts?.[v] || 0)) > 0.005);
  if (voci.length < 2) return '';
  return voci.map(v => `${VOCI[v].badge} ${fmt(parts[v])}`).join(' · ');
}

/**
 * Le rate ancora scoperte dell'anno, nell'ordine in cui scadono.
 *
 * @param {object} house
 * @param {string} fiscalPeriodId
 * @returns {{ items: Array<{date:string, amount:number, index:number, count:number,
 *   key:string, titolo:string, composizione:string, causale:string, summary:string}>,
 *   totalRemaining:number, count:number, period:object|null, fullyPaid:boolean }}
 */
export function computeReminderPlan(house, fiscalPeriodId) {
  const period = house.fiscalPeriods.find(p => String(p.id) === String(fiscalPeriodId));
  const vuoto = { items: [], totalRemaining: 0, count: 0, period: period || null, fullyPaid: false };
  if (!period?.startDate) return vuoto;

  const { slots } = installmentSummaryForPeriod(house, fiscalPeriodId);
  if (!slots.length) return vuoto;

  const aperte = slots
    .map(slot => ({ slot, residuo: round2(slot.amountDue - slot.paid) }))
    .filter(r => r.residuo > 0.01)
    .sort((a, b) => String(a.slot.periodEnd).localeCompare(String(b.slot.periodEnd)));

  if (!aperte.length) return { ...vuoto, fullyPaid: true };

  const items = aperte.map(({ slot, residuo }, i) => {
    const titolo = titoloRata(slot);
    const parti = composizione(slot.parts);
    return {
      date: slot.periodEnd,
      amount: residuo,
      index: i + 1,
      count: aperte.length,
      key: slot.key,
      titolo,
      composizione: parti,
      causale: `Rata condominiale ${slot.slotIndex + 1} - ${period.label} - ${house.name}`.slice(0, 140),
      summary: `${titolo} · ${fmt(residuo)} - ${house.name}`
    };
  });

  return {
    items,
    totalRemaining: round2(items.reduce((s, i) => s + i.amount, 0)),
    count: items.length,
    period,
    fullyPaid: false
  };
}
