import { MATCH_THRESHOLD_MIN, MATCH_THRESHOLD_SUGGEST } from './config.js';
import { findPeriodByDate, periodSummary, primaryDueAmountForPeriod } from './fiscal.js';

const KEYWORDS = ['condom', 'amministr', 'spese', 'rata', 'assemblea'];

export function isPaymentEligible(movement) {
  return Number(movement.amount) < 0;
}

export function scoreMovement(house, movement) {
  if (!isPaymentEligible(movement)) {
    return {
      suggestedFiscalPeriodId: null,
      suggestedLabel: null,
      matchConfidence: 0,
      matchReason: 'entrata — non importabile come versamento',
      status: 'ignored',
      ineligible: true
    };
  }

  const period = findPeriodByDate(house, movement.movementDate);
  const summaries = periodSummary(house);
  const periodSummaryRow = summaries.find(s => s.id === period.id || s.label === period.label);
  const expectedDue = primaryDueAmountForPeriod(periodSummaryRow);
  const payAmount = movement.paymentAmount;

  let score = 0;
  const reasons = ['uscita (possibile pagamento)'];

  if (period.id || period.computed) {
    score += 0.10;
    reasons.push(`periodo ${period.label}`);
  }

  if (expectedDue > 0 && Math.abs(payAmount - expectedDue) <= 0.01) {
    score += 0.45;
    reasons.push('importo = dovuto esercizio');
  } else if (expectedDue > 0 && Math.abs(payAmount - expectedDue) <= 5) {
    score += 0.25;
    reasons.push('importo vicino al dovuto');
  }

  const text = `${movement.operation} ${movement.details}`.toLowerCase();
  if (KEYWORDS.some(k => text.includes(k))) {
    score += 0.20;
    reasons.push('keyword condominio');
  }

  const amountCandidates = summaries.filter(s => s.due > 0 && Math.abs(payAmount - s.due) <= 0.01);
  if (amountCandidates.length > 1) {
    const dateResolved = amountCandidates.filter(c =>
      c.id === period.id || c.label === period.label
    );
    if (dateResolved.length !== 1) {
      score = Math.min(score, MATCH_THRESHOLD_MIN - 0.01);
      reasons.push('match multiplo su importo');
    }
  }

  score = Math.min(1, Math.max(0, score));

  let status = 'unlinked';
  if (score >= MATCH_THRESHOLD_SUGGEST && period.id) status = 'suggested';

  return {
    suggestedFiscalPeriodId: period.id || null,
    suggestedLabel: period.label,
    matchConfidence: Number(score.toFixed(3)),
    matchReason: reasons.join('; '),
    status,
    ineligible: false
  };
}

export function enrichPreview(house, movements) {
  return movements.map(m => {
    const match = scoreMovement(house, m);
    return {
      ...m,
      selected: match.status === 'suggested' && !match.ineligible,
      manualPeriodId: match.suggestedFiscalPeriodId,
      ...match
    };
  });
}
