import { findPeriodByDate, periodSummary, totals } from './fiscal.js';
import { installmentSummaryForPeriod } from './installments.js';
import { buildSituazioneReport, computeSituazioneTotals } from './situazione-report.js';
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
      subline: 'Non hai ancora registrato niente per questa casa.',
      detail: 'Parti dal preventivo dell’anno che ti manda l’amministratore.',
      facts: [],
      primaryCta: { label: 'Registra il preventivo', view: 'registra', subview: 'dovuti' },
      secondaryCta: { label: 'Importa estratto conto', view: 'importa', subview: 'import-banca' }
    };
  }

  const period = resolveFocusPeriod(house);
  if (!period?.id) {
    return {
      level: 'vuoto',
      headline: 'Anno da definire',
      subline: 'Registra il preventivo o il conguaglio dell’anno in corso.',
      detail: '',
      facts: [],
      primaryCta: { label: 'Registra il preventivo', view: 'registra', subview: 'dovuti' },
      secondaryCta: { label: 'Importa estratto conto', view: 'importa', subview: 'import-banca' }
    };
  }

  const summary = periodSummary(house).find(p => p.id === period.id);
  const t = totals(house, period.id);
  const report = buildSituazioneReport(house, period.id);
  const display = computeSituazioneTotals(report, summary);
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

  const netSaldo = display.saldo ?? summary?.balanceConsuntivo ?? t.balanceConsuntivo;
  const consInDebit = netSaldo != null && netSaldo < -0.005 && !summary?.consuntivoSettledInNext;
  const hasConsuntivo = inst.consuntivoDues?.length > 0;

  const facts = [
    { label: 'Anno condominiale', value: period.label },
    { label: display.saldoLabel, value: formatEuro(netSaldo), tone: consInDebit ? 'negative' : 'positive' }
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
      subline: `${overdue.length} ${overdue.length > 1 ? 'rate scadute' : 'rata scaduta'} · la più vecchia è ${worst.slot.label}`,
      detail: `Mancano ${formatEuro(worst.gap)} sulla rata di ${worst.slot.label}.`,
      facts,
      primaryCta: { label: 'Registra pagamento', view: 'registra', subview: 'versamenti' },
      secondaryCta: { label: 'Vedi i movimenti', view: 'situazione', subview: 'rendiconto', situazionePeriod: period.id }
    };
  }

  if (consInDebit) {
    return {
      level: 'azione',
      headline: 'Consuntivo in debito',
      subline: `${display.saldoLabel} ${formatEuro(netSaldo)} sull’anno ${period.label}.`,
      detail: 'Controlla i pagamenti o salda il conguaglio dell’anno precedente.',
      facts,
      primaryCta: { label: 'Vedi i movimenti', view: 'situazione', subview: 'rendiconto', situazionePeriod: period.id },
      secondaryCta: { label: 'Registra pagamento', view: 'registra', subview: 'versamenti' }
    };
  }

  if (!hasConsuntivo && house.dues.some(d => d.fiscalPeriodId === period.id)) {
    return {
      level: 'attenzione',
      headline: 'Conguaglio mancante',
      subline: `Hai il preventivo per ${period.label}, ma non il conguaglio del consuntivo.`,
      detail: 'Registralo quando l’amministratore pubblica il consuntivo.',
      facts,
      primaryCta: { label: 'Registra il conguaglio', view: 'registra', subview: 'dovuti' },
      secondaryCta: { label: 'Vedi i movimenti', view: 'situazione', subview: 'rendiconto', situazionePeriod: period.id }
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
      detail: 'Registra il pagamento appena fai il bonifico.',
      facts,
      primaryCta: { label: 'Registra pagamento', view: 'registra', subview: 'versamenti' },
      secondaryCta: { label: 'Vedi i movimenti', view: 'situazione', subview: 'rendiconto', situazionePeriod: period.id }
    };
  }

  if (upcoming.length) {
    const next = upcoming[0];
    return {
      level: 'in_regola',
      headline: 'Sei in regola',
      subline: `Prossima rata: ${next.slot.label} · ${formatEuro(next.gap)}`,
      detail: `Rate e conguagli del ${period.label} sono sotto controllo.`,
      facts,
      primaryCta: { label: 'Registra pagamento', view: 'registra', subview: 'versamenti' },
      secondaryCta: { label: 'Importa estratto conto', view: 'importa', subview: 'import-banca' }
    };
  }

  return {
    level: 'in_regola',
    headline: 'Sei in regola',
    subline: summary?.consuntivoSettledInNext
      ? `Esercizio ${period.label} saldato.`
      : `Nessuna rata aperta su ${period.label}.`,
    detail: netSaldo != null && netSaldo > 0.005
      ? `Hai un credito di ${formatEuro(netSaldo)}.`
      : 'Tutti i pagamenti risultano allineati.',
    facts,
    primaryCta: { label: 'Vedi i movimenti', view: 'situazione', subview: 'rendiconto', situazionePeriod: period.id },
    secondaryCta: null
  };
}

export function resolveFocusPeriod(house) {
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
