import { findPeriodByDate, periodSummary } from './fiscal.js';
import { buildSituazioneReport, computeSituazioneTotals } from './situazione-report.js';
import { today } from './utils.js';

function resolveScopePeriodId(house, filterPeriodId) {
  if (filterPeriodId && filterPeriodId !== 'all') return filterPeriodId;
  const byDate = findPeriodByDate(house, today);
  if (byDate?.id) return byDate.id;
  const sorted = [...house.fiscalPeriods].sort((a, b) =>
    String(b.startDate || b.label).localeCompare(String(a.startDate || a.label))
  );
  return sorted[0]?.id ?? null;
}

function formatEuro(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n));
}

export function resolveToPayInfo(report, totalsRow) {
  const t = computeSituazioneTotals(report, totalsRow);
  if (t.daPagare != null && t.daPagare > 0.005) {
    let hint = 'Totale dovuto';
    if (t.hasPrior && t.hasCons) hint = 'Consuntivo + saldo precedente';
    else if (t.hasPrior) hint = 'Preventivo + saldo precedente';
    else if (t.hasCons) hint = 'Totale consuntivo';
    else hint = 'Totale preventivo';
    return { value: t.daPagare, hint };
  }
  return null;
}

export function netSaldoForPeriod(house, periodId) {
  const report = buildSituazioneReport(house, periodId);
  const t = computeSituazioneTotals(report, report.totalsRow);
  return t.saldo ?? 0;
}

/**
 * @returns {{
 *   focusPeriodId: string | null,
 *   focusPeriodLabel: string,
 *   cards: { id: string, label: string, value: string, hint: string, tone: string, linkSubview?: string, primary?: boolean }[],
 *   periodLinks: { periodId: string, label: string, statusLabel: string, statusCls: string, saldo: string, saldoCls: string }[]
 * }}
 */
export function computePanoramicaKpis(house, filterPeriodId = null) {
  const summary = periodSummary(house);
  const focusPeriodId = resolveScopePeriodId(house, filterPeriodId);
  const periodRow = focusPeriodId ? summary.find(p => p.id === focusPeriodId) : null;
  const focusPeriodLabel = periodRow?.label || '—';
  const cards = [];

  if (!house?.fiscalPeriods?.length && !house?.dues?.length) {
    return { focusPeriodId, focusPeriodLabel, cards: [], periodLinks: [] };
  }

  if (focusPeriodId) {
    const report = buildSituazioneReport(house, focusPeriodId);
    const t = computeSituazioneTotals(report, report.totalsRow);

    // Saldo e prossima rata sono già mostrati nell'hero "Sei in regola": qui
    // solo indicatori complementari (dettaglio preventivo/consuntivo/pagamenti),
    // per evitare di ripetere due volte gli stessi numeri in Panoramica.
    if (t.preventivo > 0.005 || !t.hasCons) {
      cards.push({
        id: 'preventivo',
        label: 'Preventivo',
        value: formatEuro(t.preventivo),
        hint: 'Voci preventivo esercizio',
        tone: 'neutral',
        linkView: 'situazione',
        linkSubview: 'rendiconto'
      });
    }

    if (t.hasCons) {
      cards.push({
        id: 'consuntivo',
        label: 'Consuntivo',
        value: formatEuro(t.consuntivo),
        hint: t.hasPrior ? 'Voci consuntivo (prima del saldo prec.)' : 'Addebiti consuntivi',
        tone: 'neutral',
        linkView: 'situazione',
        linkSubview: 'rendiconto'
      });
    }

    if (t.daPagare != null && t.daPagare > 0.005) {
      cards.push({
        id: 'da-pagare',
        label: 'Da pagare',
        value: formatEuro(t.daPagare),
        hint: t.hasPrior ? 'Consuntivo + saldo precedente' : 'Totale dovuto',
        tone: 'warn',
        linkView: 'situazione',
        linkSubview: 'rendiconto'
      });
    }

    cards.push({
      id: 'pagato',
      label: 'Pagato',
      value: formatEuro(t.pagato),
      hint: `${report.periodPayments.length} versamenti`,
      tone: 'positive',
      linkView: 'registra',
      linkSubview: 'versamenti'
    });
  }

  const periodLinks = summary
    .filter(p => p.id !== focusPeriodId)
    .sort((a, b) => {
      const aSaldo = netSaldoForPeriod(house, a.id);
      const bSaldo = netSaldoForPeriod(house, b.id);
      const aDebit = aSaldo < -0.005 ? 0 : 1;
      const bDebit = bSaldo < -0.005 ? 0 : 1;
      if (aDebit !== bDebit) return aDebit - bDebit;
      return String(b.startDate || b.label).localeCompare(String(a.startDate || a.label));
    })
    .slice(0, 5)
    .map(item => {
      const b = netSaldoForPeriod(house, item.id);
      const status = b > 0.005 ? ['Eccedenza', 'success'] : b < -0.005 ? ['In debito', 'error'] : ['Pareggio', 'warn'];
      return {
        periodId: item.id,
        label: item.label,
        statusLabel: status[0],
        statusCls: status[1],
        saldo: formatEuro(b),
        saldoCls: b >= 0 ? 'positive' : 'negative'
      };
    });

  return { focusPeriodId, focusPeriodLabel, cards, periodLinks };
}
