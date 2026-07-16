import {
  consuntivoBalance,
  effectiveConsuntivoBalance,
  getNextPeriod,
  getPreviousPeriod
} from './fiscal.js';
import { getPriorBalanceForPeriod } from './situazione-report.js';

export { getNextPeriod, getPreviousPeriod };

export function hasCarryDueForPeriod(house, toPeriodId, fromPeriodId) {
  return house.dues.some(d =>
    d.fiscalPeriodId === toPeriodId &&
    d.carryFromPeriodId &&
    String(d.carryFromPeriodId) === String(fromPeriodId)
  );
}

/** Esiste già un riporto automatico dall'esercizio precedente su questo esercizio? */
export function hasCarryDueTargetingPeriod(house, periodId) {
  const prev = getPreviousPeriod(house, periodId);
  return Boolean(prev && hasCarryDueForPeriod(house, periodId, prev.id));
}

/** Il conguaglio di questo esercizio è già gestito da un "Saldo anno precedente" dedicato? */
export function hasPriorBalanceForPeriod(house, periodId) {
  return Boolean(getPriorBalanceForPeriod(house, periodId));
}

/**
 * Eccedenza sul consuntivo dell'esercizio precedente → voce preventivo sull'esercizio nuovo.
 * Importo suggerito = −saldo consuntivo (eccedenza +3 → preventivo −3€, credito).
 */
export function suggestCarryover(house, newPeriodId) {
  const prev = getPreviousPeriod(house, newPeriodId);
  if (!prev) return null;
  const nextOfPrev = getNextPeriod(house, prev.id);
  if (!nextOfPrev || nextOfPrev.id !== newPeriodId) return null;

  const rawBalance = consuntivoBalance(house, prev.id);
  const outstanding = effectiveConsuntivoBalance(house, prev.id);
  if (rawBalance === null || outstanding === null || Math.abs(outstanding) < 0.005) return null;
  if (hasCarryDueForPeriod(house, newPeriodId, prev.id)) return null;
  // Se l'esercizio nuovo ha già un "Saldo anno precedente" dedicato, il conguaglio
  // è gestito da quel flusso: non proporre un secondo importo calcolato in autonomo.
  if (getPriorBalanceForPeriod(house, newPeriodId)) return null;

  return {
    fromPeriodId: prev.id,
    fromLabel: prev.label,
    consuntivoBalance: outstanding,
    consuntivoBalanceRaw: rawBalance,
    /** Voce preventivo: negativa se eccedenza, positiva se debito da recuperare */
    suggestedDueAmount: -outstanding
  };
}
