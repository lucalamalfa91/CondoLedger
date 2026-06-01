import { findPeriodByDate, periodSummary, totals } from './fiscal.js';
import { buildSituazioneReport } from './situazione-report.js';
import { installmentSummaryForPeriod } from './installments.js';
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

function countOverdueSlots(house, periodId) {
  const inst = installmentSummaryForPeriod(house, periodId);
  let count = 0;
  for (const slot of inst.slots) {
    const gap = slot.amountDue - slot.paid;
    if (gap <= 0.01) continue;
    if (slot.periodEnd < today) count += 1;
  }
  return count;
}

function nextUpcomingSlot(house, periodId) {
  const inst = installmentSummaryForPeriod(house, periodId);
  const upcoming = [];
  for (const slot of inst.slots) {
    const gap = slot.amountDue - slot.paid;
    if (gap <= 0.01) continue;
    if (slot.periodEnd >= today) upcoming.push({ slot, gap });
  }
  upcoming.sort((a, b) => a.slot.periodEnd.localeCompare(b.slot.periodEnd));
  return upcoming[0] || null;
}

export function resolveToPayInfo(report, consBal, periodRow) {
  if (report?.totalToPayConsuntivo != null && (report.consuntivoBase ?? 0) > 0.005) {
    return {
      value: report.totalToPayConsuntivo,
      hint: report.priorBalance ? 'Consuntivo + saldo precedente' : 'Totale consuntivo da saldare'
    };
  }
  if (report?.totalToPayPreventivo != null && (report.preventivoBase ?? 0) > 0.005) {
    return {
      value: report.totalToPayPreventivo,
      hint: report.priorBalance ? 'Preventivo + saldo precedente' : 'Totale preventivo da saldare'
    };
  }
  if (report?.totalToPayPreventivo != null && report.priorBalance) {
    return { value: report.totalToPayPreventivo, hint: 'Solo saldo di apertura' };
  }
  if (consBal < -0.005 && !periodRow?.consuntivoSettledInNext) {
    return { value: Math.abs(consBal), hint: 'Residuo consuntivo' };
  }
  return null;
}

/**
 * @returns {{
 *   focusPeriodId: string | null,
 *   focusPeriodLabel: string,
 *   cards: { id: string, label: string, value: string, hint: string, tone: string, linkSubview?: string }[],
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

  const report = focusPeriodId ? buildSituazioneReport(house, focusPeriodId) : null;
  const t = focusPeriodId ? totals(house, focusPeriodId) : totals(house);
  const consBal = periodRow?.balanceConsuntivo ?? t.balanceConsuntivo;
  const consTone = periodRow?.consuntivoSettledInNext
    ? 'success'
    : consBal >= 0 ? 'positive' : 'negative';

  cards.push({
    id: 'saldo-consuntivo',
    label: 'Saldo consuntivo',
    value: formatEuro(consBal),
    hint: periodRow?.consuntivoSettledInNext ? 'Saldato in esercizio successivo' : 'Versato − consuntivo',
    tone: consTone,
    linkSubview: 'situazione'
  });

  const toPayInfo = report ? resolveToPayInfo(report, consBal, periodRow) : null;
  const toPay = toPayInfo?.value ?? null;

  const paid = periodRow?.paid ?? t.paid;
  if (toPay != null && toPay > 0.005) {
    const coverageRaw = Math.round((paid / toPay) * 100);
    const coverage = Math.min(100, coverageRaw);
    cards.push({
      id: 'da-pagare',
      label: 'Da pagare',
      value: formatEuro(toPay),
      hint: toPayInfo.hint,
      tone: 'negative',
      linkSubview: 'situazione'
    });
    let coverageHint = `${formatEuro(paid)} versati su ${formatEuro(toPay)}`;
    if (paid > toPay + 0.005) {
      coverageHint += ` · Eccedenza ${formatEuro(paid - toPay)}`;
    }
    cards.push({
      id: 'copertura',
      label: 'Copertura pagamenti',
      value: coverageRaw > 100 ? `${coverageRaw}%` : `${coverage}%`,
      hint: coverageHint,
      tone: coverageRaw >= 100 ? 'positive' : coverage >= 50 ? 'warn' : 'negative',
      linkSubview: 'situazione'
    });
  }

  if (focusPeriodId) {
    const overdue = countOverdueSlots(house, focusPeriodId);
    if (overdue > 0) {
      cards.push({
        id: 'rate-scadute',
        label: 'Rate scadute',
        value: String(overdue),
        hint: overdue === 1 ? '1 rata oltre scadenza' : `${overdue} rate oltre scadenza`,
        tone: 'negative',
        linkSubview: 'situazione'
      });
    }
    const next = nextUpcomingSlot(house, focusPeriodId);
    if (next) {
      cards.push({
        id: 'prossima-rata',
        label: 'Prossima rata',
        value: formatEuro(next.gap),
        hint: next.slot.label,
        tone: 'warn',
        linkSubview: 'situazione'
      });
    }
  }

  const prev = periodRow?.preventivo ?? t.preventivo;
  const cons = periodRow?.consuntivo ?? t.consuntivo;
  if (prev > 0.005 && cons > 0.005) {
    const delta = Math.round((cons - prev) * 100) / 100;
    cards.push({
      id: 'scostamento',
      label: 'Scostamento consuntivo',
      value: (delta >= 0 ? '+' : '') + formatEuro(delta),
      hint: 'Consuntivo vs preventivo',
      tone: Math.abs(delta) < 0.01 ? 'positive' : delta > 0 ? 'warn' : 'positive',
      linkSubview: 'situazione'
    });
  }

  const allTotals = totals(house);
  if (allTotals.debtYears > 0) {
    cards.push({
      id: 'esercizi-debito',
      label: 'Esercizi in debito',
      value: String(allTotals.debtYears),
      hint: allTotals.debtYears === 1 ? '1 esercizio non saldato' : `${allTotals.debtYears} esercizi non saldati`,
      tone: 'negative',
      linkSubview: 'situazione'
    });
  }

  const periodLinks = summary
    .filter(p => p.id !== focusPeriodId)
    .sort((a, b) => {
      const aDebit = a.balanceConsuntivo < -0.005 && !a.consuntivoSettledInNext ? 0 : 1;
      const bDebit = b.balanceConsuntivo < -0.005 && !b.consuntivoSettledInNext ? 0 : 1;
      if (aDebit !== bDebit) return aDebit - bDebit;
      return String(b.startDate || b.label).localeCompare(String(a.startDate || a.label));
    })
    .slice(0, 5)
    .map(item => {
      const b = item.balanceConsuntivo;
      const status = item.consuntivoSettledInNext
        ? ['Saldato', 'success']
        : b > 0.005 ? ['Eccedenza', 'success'] : b < -0.005 ? ['In debito', 'error'] : ['Pareggio', 'warn'];
      return {
        periodId: item.id,
        label: item.label,
        statusLabel: status[0],
        statusCls: status[1],
        saldo: formatEuro(b),
        saldoCls: b >= 0 ? 'positive' : 'negative'
      };
    });

  return { focusPeriodId, focusPeriodLabel, cards: cards.slice(0, 8), periodLinks };
}
