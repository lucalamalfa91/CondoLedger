import { findPeriodByDate, periodSummary, totals } from './fiscal.js';
import { installmentSummaryForPeriod } from './installments.js';
import { today } from './utils.js';

const MS_DAY = 86400000;

/**
 * Stato di conformità pagamenti — hero "Sei in regola" in Panoramica.
 * @returns {{
 *   level: 'vuoto' | 'in_regola' | 'attenzione' | 'azione',
 *   headline: string,
 *   subline: string,
 *   detail: string,
 *   facts: { label: string, value: string, tone?: string }[],
 *   primaryCta: { label: string, view: string, subview: string } | null,
 *   secondaryCta: { label: string, view: string, subview: string } | null
 * }}
 */
export function computeComplianceStatus(house) {
  if (!house?.fiscalPeriods?.length && !house?.dues?.length) {
    return {
      level: 'vuoto',
      headline: 'Inizia da qui',
      subline: 'Non hai ancora dati per questo immobile.',
      detail: 'Importa il preventivo dall’amministratore o registra il primo dovuto.',
      facts: [],
      primaryCta: { label: 'Importa documento', view: 'movimenti', subview: 'import-doc' },
      secondaryCta: { label: 'Aggiungi dovuto', view: 'movimenti', subview: 'dovuti' }
    };
  }

  const period = resolveFocusPeriod(house);
  if (!period?.id) {
    return {
      level: 'vuoto',
      headline: 'Esercizio da definire',
      subline: 'Registra un preventivo o consuntivo per l’esercizio corrente.',
      detail: '',
      facts: [],
      primaryCta: { label: 'Importa documento', view: 'movimenti', subview: 'import-doc' },
      secondaryCta: { label: 'Nuovo dovuto', view: 'movimenti', subview: 'dovuti' }
    };
  }

  const summary = periodSummary(house).find(p => p.id === period.id);
  const t = totals(house, period.id);
  const inst = installmentSummaryForPeriod(house, period.id);
  const now = today;

  const overdue = [];
  const upcoming = [];
  for (const slot of inst.slots) {
    const gap = slot.amountDue - slot.paid;
    if (gap <= 0.01) continue;
    const dueBy = slot.periodEnd;
    if (dueBy < now) overdue.push({ slot, gap, dueBy });
    else upcoming.push({ slot, gap, dueBy });
  }
  upcoming.sort((a, b) => a.dueBy.localeCompare(b.dueBy));

  const consBalance = summary?.balanceConsuntivo ?? t.balanceConsuntivo;
  const consInDebit = consBalance != null && consBalance < -0.005 && !summary?.consuntivoSettledInNext;
  const hasConsuntivo = inst.consuntivoDues?.length > 0;

  const facts = [
    { label: 'Esercizio', value: period.label },
    { label: 'Saldo consuntivo', value: formatEuro(consBalance), tone: consInDebit ? 'negative' : 'positive' }
  ];
  if (upcoming[0]) {
    facts.push({
      label: 'Prossima rata',
      value: `${upcoming[0].slot.label} · ${formatEuro(upcoming[0].gap)}`,
      tone: 'warn'
    });
  }

  if (overdue.length) {
    const worst = overdue[0];
    return {
      level: 'azione',
      headline: 'Intervento richiesto',
      subline: `${overdue.length} rata${overdue.length > 1 ? 'e' : ''} scaduta${overdue.length > 1 ? 'e' : ''} · ${worst.slot.label}`,
      detail: `Mancano ${formatEuro(worst.gap)} sulla rata di ${worst.slot.label}.`,
      facts,
      primaryCta: { label: 'Registra versamento', view: 'movimenti', subview: 'versamenti' },
      secondaryCta: { label: 'Vedi situazione', view: 'movimenti', subview: 'situazione' }
    };
  }

  if (consInDebit) {
    return {
      level: 'azione',
      headline: 'Consuntivo in debito',
      subline: `Saldo consuntivo ${formatEuro(consBalance)} sull’esercizio ${period.label}.`,
      detail: 'Verifica i versamenti o salda il consuntivo dell’esercizio precedente.',
      facts,
      primaryCta: { label: 'Vedi situazione', view: 'movimenti', subview: 'situazione' },
      secondaryCta: { label: 'Registra versamento', view: 'movimenti', subview: 'versamenti' }
    };
  }

  if (!hasConsuntivo && house.dues.some(d => d.fiscalPeriodId === period.id)) {
    return {
      level: 'attenzione',
      headline: 'Consuntivo mancante',
      subline: `Hai il preventivo per ${period.label}, ma non il consuntivo.`,
      detail: 'Importa il consuntivo quando l’amministratore lo pubblica.',
      facts,
      primaryCta: { label: 'Importa consuntivo', view: 'movimenti', subview: 'import-doc' },
      secondaryCta: { label: 'Panoramica esercizi', view: 'movimenti', subview: 'situazione' }
    };
  }

  const soon = upcoming.filter(u => daysBetween(now, u.dueBy) <= 14);
  if (soon.length) {
    const next = soon[0];
    const days = daysBetween(now, next.dueBy);
    return {
      level: 'attenzione',
      headline: 'Rata in scadenza',
      subline: `${next.slot.label} · ${formatEuro(next.gap)} entro ${days} giorn${days === 1 ? 'o' : 'i'}`,
      detail: 'Registra il versamento appena effettui il bonifico.',
      facts,
      primaryCta: { label: 'Registra versamento', view: 'movimenti', subview: 'versamenti' },
      secondaryCta: { label: 'Dettaglio rate', view: 'movimenti', subview: 'situazione' }
    };
  }

  if (upcoming.length) {
    const next = upcoming[0];
    return {
      level: 'in_regola',
      headline: 'Sei in regola',
      subline: `Prossima rata: ${next.slot.label} · ${formatEuro(next.gap)}`,
      detail: `Consuntivo e rate dell’esercizio ${period.label} sono sotto controllo.`,
      facts,
      primaryCta: { label: 'Registra versamento', view: 'movimenti', subview: 'versamenti' },
      secondaryCta: { label: 'Importa documento', view: 'movimenti', subview: 'import-doc' }
    };
  }

  return {
    level: 'in_regola',
    headline: 'Sei in regola',
    subline: summary?.consuntivoSettledInNext
      ? `Esercizio ${period.label} saldato.`
      : `Nessuna rata aperta su ${period.label}.`,
    detail: consBalance != null && consBalance > 0.005
      ? `Hai un credito consuntivo di ${formatEuro(consBalance)}.`
      : 'Tutti i pagamenti risultano allineati.',
    facts,
    primaryCta: { label: 'Vedi situazione', view: 'movimenti', subview: 'situazione' },
    secondaryCta: null
  };
}

function resolveFocusPeriod(house) {
  const byDate = findPeriodByDate(house, today);
  if (byDate?.id) return house.fiscalPeriods.find(p => p.id === byDate.id) || byDate;
  const sorted = [...house.fiscalPeriods].sort((a, b) =>
    String(b.startDate).localeCompare(String(a.startDate))
  );
  return sorted[0] || null;
}

function formatEuro(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n));
}

function daysBetween(fromIso, toIso) {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  return Math.max(0, Math.ceil((b - a) / MS_DAY));
}
