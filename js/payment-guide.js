import { findPeriodByDate } from './fiscal.js';
import { installmentSummaryForPeriod } from './installments.js';
import { fmt, today } from './utils.js';

/**
 * Prossima rata da pagare (bonifico guidato).
 * @returns {null | { periodId, periodLabel, installmentKey, installmentLabel, amountDue, paid, gap, dueBy, causale }}
 */
export function computeNextPaymentGuide(house) {
  if (!house?.fiscalPeriods?.length) return null;

  const period = findPeriodByDate(house, today());
  const periodId = period.id || house.fiscalPeriods.find(p => p.label === period.label)?.id;
  if (!periodId) return null;

  const inst = installmentSummaryForPeriod(house, periodId);
  const now = today();
  const open = inst.slots
    .map(slot => {
      const gap = Math.round((slot.amountDue - slot.paid) * 100) / 100;
      if (gap <= 0.01) return null;
      return { ...slot, gap, overdue: slot.periodEnd < now };
    })
    .filter(Boolean);

  if (!open.length) return null;

  open.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.periodEnd.localeCompare(b.periodEnd);
  });

  const next = open[0];
  const pLabel = house.fiscalPeriods.find(p => p.id === periodId)?.label || period.label;
  const causale = `Rata condominiale ${next.label} - ${pLabel}`.slice(0, 140);

  return {
    periodId,
    periodLabel: pLabel,
    installmentKey: next.key,
    installmentLabel: next.label,
    amountDue: next.amountDue,
    paid: next.paid,
    gap: next.gap,
    dueBy: next.periodEnd,
    overdue: next.overdue,
    causale
  };
}

export function formatPaymentGuideSummary(g) {
  if (!g) return '';
  const stato = g.overdue ? 'Scaduta' : `Entro il ${g.dueBy}`;
  return `${g.installmentLabel} · ${fmt(g.gap)} · ${stato}`;
}
