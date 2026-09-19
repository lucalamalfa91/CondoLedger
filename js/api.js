/**
 * Data layer dell'applicazione.
 *
 * Le funzioni esportate qui hanno le stesse firme e gli stessi effetti su `state` che
 * avevano nella versione Supabase: cambia solo l'implementazione, da chiamate PostgREST a
 * chiamate alla REST API del server. È per questo che render.js e la quasi totalità di
 * main.js non hanno dovuto cambiare.
 */
import { legacyCalendarPeriod, periodFromLabel } from './backup.js';
import { serializeImportParties } from './house-import-parties.js';
import { mapHouseFromDb, state } from './state.js';
import { ensurePeriodPayload, parseFiscalLabel } from './fiscal.js';
import { findInstallment, findInstallmentForDate, inferInstallmentKey } from './installments.js';
import { hashText, today, uid } from './utils.js';
import { request } from './http.js';

const houseUrl = (houseId, suffix = '') => `/api/houses/${Number(houseId)}${suffix}`;

function mapTree(entry) {
  return mapHouseFromDb(
    entry.house,
    entry.dues,
    entry.payments,
    entry.fiscalPeriods,
    entry.bankMovements,
    entry.priorBalances
  );
}

export async function ensureAuthenticated() {
  if (state.user) return state.user;
  const data = await request('GET', '/api/auth/session');
  state.user = data?.user ?? null;
  return state.user;
}

function preserveSelectedHouseId(mapped, previousId) {
  const prevStr = previousId != null ? String(previousId) : null;
  const stillSelected = prevStr && mapped.some(h => String(h.id) === prevStr);
  state.selectedHouseId = stillSelected ? prevStr : (mapped[0] ? String(mapped[0].id) : null);
  if (state.selectedHouseId) {
    sessionStorage.setItem('app:selectedHouseId', state.selectedHouseId);
  } else {
    sessionStorage.removeItem('app:selectedHouseId');
  }
}

export async function reloadHouseFromSupabase(houseId) {
  await ensureAuthenticated();
  const idStr = String(houseId);
  const numericId = Number(houseId);
  if (!Number.isFinite(numericId)) throw new Error('Immobile non valido');

  const mapped = mapTree(await request('GET', houseUrl(numericId)));
  const idx = state.data.houses.findIndex(h => String(h.id) === idStr);
  if (idx >= 0) state.data.houses[idx] = mapped;
  else state.data.houses.push(mapped);

  state.selectedHouseId = idStr;
  sessionStorage.setItem('app:selectedHouseId', idStr);
  return mapped;
}

/**
 * Una sola richiesta restituisce l'albero completo di tutte le case. La versione Supabase
 * faceva 1 + 5×N query con paginazione a 1000 righe per ciascuna relazione.
 */
export async function loadFromSupabase() {
  const user = await ensureAuthenticated();
  if (!user) return;

  const entries = await request('GET', '/api/houses');
  const previousId = state.selectedHouseId ?? sessionStorage.getItem('app:selectedHouseId');
  const mapped = (entries || []).map(mapTree);

  state.data = { houses: mapped };
  preserveSelectedHouseId(mapped, previousId);
}

export async function saveHouseToSupabase(house) {
  const user = await ensureAuthenticated();
  if (!user) throw new Error('Devi essere connesso per salvare la casa');

  // Nessun user_id nel payload: il server lo prende dalla sessione.
  const payload = {
    name: house.name,
    location: house.location,
    notes: house.notes,
    fiscal_start_month: house.fiscalStartMonth,
    import_parties: serializeImportParties(house.importParties || [])
  };

  const numericId = Number(house.id);
  if (Number.isFinite(numericId)) {
    await request('PUT', houseUrl(numericId), payload);
  } else {
    const data = await request('POST', '/api/houses', payload);
    house.id = String(data.id);
  }
}

export async function updateCalendarSettings(house, { cadence, leadDays }) {
  const user = await ensureAuthenticated();
  if (!user) throw new Error('Devi essere connesso per salvare le impostazioni calendario');
  const numericId = Number(house.id);
  if (!Number.isFinite(numericId)) throw new Error('Salva prima la casa');

  await request('PATCH', houseUrl(numericId, '/calendar'), {
    calendar_reminder_cadence: cadence,
    calendar_reminder_lead_days: leadDays
  });

  house.calendarReminderCadence = cadence;
  house.calendarReminderLeadDays = leadDays;
}

/**
 * L'endpoint è idempotente: se la label esiste già restituisce la riga esistente con
 * `isNew: false`. Sostituisce il vecchio fallback sull'errore di unique violation.
 */
export async function ensureFiscalPeriodBySpec(house, spec) {
  const existing = house.fiscalPeriods.find(p =>
    p.label === spec.label && p.startDate === spec.startDate && p.endDate === spec.endDate
  );
  if (existing) return { period: existing, isNew: false };

  const data = await request('POST', houseUrl(house.id, '/fiscal-periods'), {
    label: spec.label,
    start_date: spec.startDate,
    end_date: spec.endDate
  });

  const period = {
    id: String(data.period.id),
    label: data.period.label,
    startDate: data.period.start_date,
    endDate: data.period.end_date
  };
  if (!house.fiscalPeriods.some(p => p.id === period.id)) house.fiscalPeriods.push(period);
  return { period, isNew: data.isNew };
}

export async function ensureFiscalPeriodByLabel(house, labelText) {
  const existing = house.fiscalPeriods.find(p => p.label === String(labelText).trim());
  if (existing) return { period: existing, isNew: false };
  const spec = parseFiscalLabel(house, labelText);
  return ensureFiscalPeriodBySpec(house, spec);
}

export async function ensureFiscalPeriod(house, dateStr) {
  const existing = house.fiscalPeriods.find(p => dateStr >= p.startDate && dateStr <= p.endDate);
  if (existing) return { period: existing, isNew: false };

  const spec = ensurePeriodPayload(house, dateStr);
  if (spec.id) return { period: { id: spec.id, label: spec.label, startDate: spec.startDate, endDate: spec.endDate }, isNew: false };
  return ensureFiscalPeriodBySpec(house, spec);
}

export async function saveDueToSupabase(house, due) {
  await ensureAuthenticated();
  let periodId = due.fiscalPeriodId;
  if (!periodId && due.fiscalPeriodLabel) {
    const { period } = await ensureFiscalPeriodByLabel(house, due.fiscalPeriodLabel);
    periodId = period.id;
  }
  if (!periodId) {
    const { period } = await ensureFiscalPeriod(house, due.date || today);
    periodId = period.id;
  }

  const payload = {
    fiscal_period_id: Number(periodId),
    amount: due.amount,
    description: due.description,
    split_mode: due.splitMode || 'monthly',
    split_custom: due.splitMode === 'custom' && Array.isArray(due.splitCustom) ? due.splitCustom : null,
    split_amounts: Array.isArray(due.splitAmounts) && due.splitAmounts.length ? due.splitAmounts : null,
    due_kind: due.dueKind || 'preventivo',
    carry_from_period_id: due.carryFromPeriodId ? Number(due.carryFromPeriodId) : null
  };

  if (Number.isFinite(Number(due.id))) {
    await request('PUT', houseUrl(house.id, `/dues/${Number(due.id)}`), payload);
    return;
  }
  const data = await request('POST', houseUrl(house.id, '/dues'), payload);
  if (data?.id) due.id = String(data.id);
}

export async function deleteDueFromSupabase(house, dueId) {
  await ensureAuthenticated();
  await request('DELETE', houseUrl(house.id, `/dues/${Number(dueId)}`));
}

export async function savePriorBalanceToSupabase(house, priorBalance) {
  await ensureAuthenticated();
  let periodId = priorBalance.fiscalPeriodId;
  if (!periodId && priorBalance.fiscalPeriodLabel) {
    const { period } = await ensureFiscalPeriodByLabel(house, priorBalance.fiscalPeriodLabel);
    periodId = period.id;
  }
  if (!periodId) throw new Error('Seleziona l\'esercizio fiscale del saldo precedente.');

  const payload = {
    fiscal_period_id: Number(periodId),
    source_period_id: priorBalance.sourcePeriodId ? Number(priorBalance.sourcePeriodId) : null,
    amount: priorBalance.amount,
    description: priorBalance.description || null
  };

  if (Number.isFinite(Number(priorBalance.id))) {
    await request('PUT', houseUrl(house.id, `/prior-balances/${Number(priorBalance.id)}`), payload);
  } else {
    // L'endpoint fa upsert su (house_id, fiscal_period_id): non serve più cercare a mano
    // un saldo esistente per lo stesso esercizio.
    const data = await request('POST', houseUrl(house.id, '/prior-balances'), payload);
    if (data?.id) priorBalance.id = String(data.id);
  }

  syncPriorBalanceLocal(house, priorBalance, periodId);
}

function syncPriorBalanceLocal(house, priorBalance, periodId) {
  if (!house.priorBalances) house.priorBalances = [];
  const entry = {
    id: String(priorBalance.id),
    fiscalPeriodId: String(periodId),
    sourcePeriodId: priorBalance.sourcePeriodId ? String(priorBalance.sourcePeriodId) : null,
    amount: Number(priorBalance.amount),
    description: priorBalance.description || ''
  };
  const byId = house.priorBalances.findIndex(b => String(b.id) === String(priorBalance.id));
  if (byId >= 0) {
    house.priorBalances[byId] = entry;
    return;
  }
  const byPeriod = house.priorBalances.findIndex(b => String(b.fiscalPeriodId) === String(periodId));
  if (byPeriod >= 0) house.priorBalances[byPeriod] = entry;
  else house.priorBalances.push(entry);
}

export async function deletePriorBalanceFromSupabase(house, priorBalanceId) {
  await ensureAuthenticated();
  await request('DELETE', houseUrl(house.id, `/prior-balances/${Number(priorBalanceId)}`));
}

export async function savePaymentToSupabase(house, payment) {
  await ensureAuthenticated();
  let periodId = payment.fiscalPeriodId;
  if (!periodId) {
    const { period } = await ensureFiscalPeriod(house, payment.date || today);
    periodId = period.id;
  }

  const payload = {
    fiscal_period_id: Number(periodId),
    amount: payment.amount,
    date: payment.date,
    method: payment.method,
    note: payment.note || null,
    installment_key: payment.installmentKey || null,
    prior_balance_id: payment.priorBalanceId ? Number(payment.priorBalanceId) : null,
    carry_from_period_id: null,
    is_carry_forward: false,
    bank_movement_id: payment.bankMovementId ? Number(payment.bankMovementId) : null
  };

  if (Number.isFinite(Number(payment.id))) {
    await request('PUT', houseUrl(house.id, `/payments/${Number(payment.id)}`), payload);
    return;
  }
  await request('POST', houseUrl(house.id, '/payments'), payload);
}

/** Il server sgancia il movimento bancario collegato nella stessa transazione. */
export async function deletePaymentFromSupabase(house, payment) {
  await ensureAuthenticated();
  await request('DELETE', houseUrl(house.id, `/payments/${Number(payment.id)}`));
}

export async function deleteHouseRemote(houseId) {
  await ensureAuthenticated();
  await request('DELETE', houseUrl(houseId));
}

export async function movementHash(houseId, movement) {
  const raw = [houseId, movement.movementDate, movement.amount, movement.operation, movement.details].join('|');
  return hashText(raw.toLowerCase());
}

function bankRowPayload(row, sourceHash, extra) {
  return {
    movement_date: row.movementDate,
    operation: row.operation,
    details: row.details,
    amount: row.amount,
    currency: row.currency || 'EUR',
    source_hash: sourceHash,
    suggested_fiscal_period_id: row.suggestedFiscalPeriodId ? Number(row.suggestedFiscalPeriodId) : null,
    match_confidence: row.matchConfidence,
    match_reason: row.matchReason,
    ...extra
  };
}

/**
 * Import delle righe selezionate. Il server scrive movimento, versamento e back-link in
 * un'unica transazione; le righe già presenti (stesso source_hash) vengono ignorate.
 *
 * L'hash e il calcolo di `installment_key` restano qui perché dipendono dalla logica rate
 * di installments.js: duplicarla sul server creerebbe due verità divergenti.
 */
export async function saveBankImport(house, batchId, previewRows) {
  await ensureAuthenticated();
  const rows = [];

  for (const row of previewRows) {
    if (!row.selected || row.ineligible || Number(row.amount) >= 0) continue;

    let periodId = row.manualPeriodId || row.suggestedFiscalPeriodId;
    if (!periodId) {
      const { period } = await ensureFiscalPeriod(house, row.movementDate);
      periodId = period.id;
      row.manualPeriodId = periodId;
    }
    if (!periodId) continue;

    let installmentKey = null;
    for (const d of house.dues.filter(d => String(d.fiscalPeriodId) === String(periodId) && (d.dueKind || 'preventivo') === 'preventivo')) {
      const slot = findInstallmentForDate(house, d, row.movementDate);
      if (slot) { installmentKey = slot.key; break; }
    }

    rows.push(bankRowPayload(row, await movementHash(house.id, row), {
      fiscal_period_id: Number(periodId),
      link: true,
      payment_amount: row.paymentAmount,
      installment_key: installmentKey
    }));
  }

  if (!rows.length) return;
  await request('POST', houseUrl(house.id, '/bank-movements/import'), {
    import_batch_id: batchId,
    rows
  });
}

export async function saveUnlinkedBankMovements(house, batchId, previewRows) {
  await ensureAuthenticated();
  const rows = [];

  for (const row of previewRows) {
    if (row.selected || row.ineligible) continue;
    rows.push(bankRowPayload(row, await movementHash(house.id, row), { link: false }));
  }

  if (!rows.length) return;
  await request('POST', houseUrl(house.id, '/bank-movements/import'), {
    import_batch_id: batchId,
    rows
  });
}

async function fetchBankMovements(houseId, { importBatchId } = {}) {
  const suffix = importBatchId
    ? `/bank-movements?import_batch_id=${encodeURIComponent(importBatchId)}`
    : '/bank-movements';
  return (await request('GET', houseUrl(houseId, suffix))) || [];
}

function enrichMovement(house, movement) {
  const local = house.bankMovements?.find(m => String(m.id) === String(movement.id));
  if (!local) return movement;
  return {
    ...movement,
    status: movement.status ?? local.status,
    linked_payment_id: movement.linked_payment_id ?? local.linkedPaymentId,
    linkedPaymentId: movement.linked_payment_id ?? local.linkedPaymentId
  };
}

function resolveMovementPayment(house, movement) {
  const linkedPayId = movement.linked_payment_id ?? movement.linkedPaymentId;
  if (linkedPayId) {
    const byLink = house.payments?.find(p => String(p.id) === String(linkedPayId));
    if (byLink) return byLink;
  }
  return house.payments?.find(p => Number(p.bankMovementId) === Number(movement.id)) || null;
}

function isPaymentLinkedToDue(house, payment) {
  if (!payment) return false;
  const key = payment.installmentKey || inferInstallmentKey(house, payment);
  if (!key) return false;
  return Boolean(findInstallment(house, key));
}

function classifyMovementsForDelete(house, movements) {
  const deletable = [];
  const protectedMovements = [];
  let deletablePayments = 0;

  for (const raw of movements) {
    const movement = enrichMovement(house, raw);
    const status = movement.status || 'unlinked';
    const payment = resolveMovementPayment(house, movement);

    if (status === 'unlinked' || !payment) {
      deletable.push(movement);
      continue;
    }

    if (isPaymentLinkedToDue(house, payment)) {
      protectedMovements.push(movement);
    } else {
      deletable.push(movement);
      deletablePayments += 1;
    }
  }

  return { deletable, protectedMovements, deletablePayments };
}

export function previewBankImportDelete(house, movements) {
  const { deletable, protectedMovements, deletablePayments } = classifyMovementsForDelete(house, movements || []);
  return {
    deletableMovements: deletable.length,
    deletablePayments,
    protectedMovements: protectedMovements.length
  };
}

function orphanPaymentIds(house, deletableMovements) {
  return [...new Set(
    deletableMovements
      .map(m => resolveMovementPayment(house, m))
      .filter(p => p && !isPaymentLinkedToDue(house, p))
      .map(p => Number(p.id))
      .filter(Number.isFinite)
  )];
}

/**
 * La classificazione di cosa sia cancellabile resta qui perché dipende da
 * isPaymentLinkedToDue → installments.js. Il server riceve solo gli id già decisi e li
 * cancella in una transazione, validando che appartengano alla casa.
 */
async function deleteMovements(house, movements) {
  const { deletable, protectedMovements, deletablePayments } = classifyMovementsForDelete(house, movements);
  if (!deletable.length) {
    return { deletedMovements: 0, deletedPayments: 0, skippedMovements: protectedMovements.length };
  }

  await request('POST', houseUrl(house.id, '/bank-movements/delete'), {
    movement_ids: deletable.map(m => Number(m.id)).filter(Number.isFinite),
    payment_ids: orphanPaymentIds(house, deletable)
  });

  return {
    deletedMovements: deletable.length,
    deletedPayments: deletablePayments,
    skippedMovements: protectedMovements.length
  };
}

export async function deleteBankImportBatch(house, batchId) {
  await ensureAuthenticated();
  return deleteMovements(house, await fetchBankMovements(house.id, { importBatchId: batchId }));
}

export async function deleteAllBankImports(house) {
  await ensureAuthenticated();
  return deleteMovements(house, await fetchBankMovements(house.id));
}

export async function linkBankMovement(house, movementId, fiscalPeriodId) {
  await ensureAuthenticated();

  // La data del movimento è già nello stato in memoria (render.js disegna la tabella da lì),
  // quindi l'installment_key si calcola senza un giro aggiuntivo al server.
  const movement = house.bankMovements?.find(m => String(m.id) === String(movementId));
  let installmentKey = null;
  if (movement?.movementDate) {
    for (const d of house.dues.filter(d =>
      String(d.fiscalPeriodId) === String(fiscalPeriodId) && (d.dueKind || 'preventivo') === 'preventivo'
    )) {
      const slot = findInstallmentForDate(house, d, movement.movementDate);
      if (slot) { installmentKey = slot.key; break; }
    }
  }

  await request('POST', houseUrl(house.id, `/bank-movements/${Number(movementId)}/link`), {
    fiscal_period_id: Number(fiscalPeriodId),
    installment_key: installmentKey
  });
}

export function createLocalDue(formData) {
  const splitMode = String(formData.get('splitMode') || 'monthly');
  const dueKind = String(formData.get('dueKind') || 'preventivo');
  const customRaw = String(formData.get('splitCustom') || '').trim();
  let splitCustom = null;
  if (splitMode === 'custom' && customRaw) {
    splitCustom = customRaw.split(/[,;\s]+/).map(s => Number(s.trim())).filter(n => Number.isFinite(n));
  }
  return {
    id: uid('due'),
    amount: Number(formData.get('amount')),
    description: String(formData.get('description') || '').trim(),
    splitMode: dueKind === 'consuntivo' ? 'monthly' : splitMode,
    splitCustom: dueKind === 'consuntivo' ? null : splitCustom,
    dueKind,
    carryFromPeriodId: null,
    date: today
  };
}

export function createLocalPayment(formData, fiscalPeriodId, installmentKey, priorBalanceId = null) {
  return {
    id: uid('pay'),
    fiscalPeriodId: fiscalPeriodId || null,
    installmentKey: installmentKey || null,
    priorBalanceId: priorBalanceId || null,
    amount: Number(formData.get('amount')),
    date: String(formData.get('date') || today),
    method: String(formData.get('method') || '').trim(),
    note: String(formData.get('note') || '').trim(),
    isCarryForward: false,
    carryFromPeriodId: null
  };
}

export function createLocalPriorBalance(formData) {
  const sourcePeriodId = String(formData.get('sourcePeriodId') || '').trim() || null;
  return {
    id: uid('prior'),
    fiscalPeriodId: String(formData.get('fiscalPeriodId') || '').trim(),
    sourcePeriodId,
    amount: Number(formData.get('amount')),
    description: String(formData.get('description') || '').trim()
  };
}

/**
 * Risolve gli esercizi fiscali di un backup senza toccare il server: accumula le specifiche
 * in una mappa e etichetta ogni figlio con la label del proprio esercizio. Il server poi
 * traduce label → id dentro un'unica transazione.
 *
 * La risoluzione resta qui perché è logica di dominio (periodFromLabel, ensurePeriodPayload,
 * legacyCalendarPeriod) e dipende dal mese di inizio esercizio della casa.
 */
function buildBackupHousePayload(houseData) {
  const house = {
    name: houseData.name,
    location: houseData.location || '',
    notes: houseData.notes || '',
    fiscalStartMonth: houseData.fiscalStartMonth ?? 6,
    importParties: houseData.importParties || [],
    fiscalPeriods: []
  };

  const specs = new Map();
  const addSpec = (spec) => {
    if (!spec?.label) return null;
    const label = String(spec.label).trim();
    if (!specs.has(label)) {
      specs.set(label, { label, start_date: spec.startDate, end_date: spec.endDate });
      // Reso visibile a periodFromLabel per le risoluzioni successive.
      house.fiscalPeriods.push({ id: label, label, startDate: spec.startDate, endDate: spec.endDate });
    }
    return label;
  };

  for (const spec of houseData.fiscalPeriods || []) addSpec(spec);

  const resolveLabel = (item) => {
    let spec = periodFromLabel(house, item.fiscalPeriodLabel, item._legacyYear);
    if (!spec && item.date) spec = ensurePeriodPayload(house, item.date);
    if (!spec && item._legacyYear) spec = legacyCalendarPeriod(Number(item._legacyYear));
    return addSpec(spec);
  };

  const dues = [];
  for (const due of houseData.dues || []) {
    const label = resolveLabel(due);
    if (!label) continue;
    dues.push({
      fiscal_period_label: label,
      amount: due.amount,
      description: due.description || '',
      split_mode: due.splitMode || 'monthly',
      split_custom: due.splitCustom || null,
      split_amounts: due.splitAmounts || null,
      due_kind: due.dueKind || 'preventivo'
    });
  }

  const priorBalances = [];
  for (const prior of houseData.priorBalances || []) {
    let label = resolveLabel(prior);
    if (!label && prior.fiscalPeriodLabel) {
      label = addSpec(parseFiscalLabel(house, prior.fiscalPeriodLabel));
    }
    if (!label) continue;
    priorBalances.push({
      fiscal_period_label: label,
      source_period_label: prior.sourcePeriodLabel
        ? resolveLabel({ fiscalPeriodLabel: prior.sourcePeriodLabel })
        : null,
      amount: prior.amount,
      description: prior.description || null
    });
  }

  const payments = [];
  for (const payment of houseData.payments || []) {
    const label = resolveLabel(payment);
    if (!label) continue;
    payments.push({
      fiscal_period_label: label,
      amount: payment.amount,
      date: payment.date || null,
      method: payment.method || '',
      note: payment.note || null,
      installment_key: payment.installmentKey || null,
      is_carry_forward: Boolean(payment.isCarryForward)
    });
  }

  return {
    name: house.name,
    location: house.location,
    notes: house.notes,
    fiscal_start_month: house.fiscalStartMonth,
    import_parties: serializeImportParties(house.importParties),
    fiscal_periods: [...specs.values()],
    dues,
    prior_balances: priorBalances,
    payments
  };
}

/** Il ripristino è atomico: o entra tutto il backup, o non entra niente. */
export async function syncBackupToSupabase(backup) {
  await ensureAuthenticated();

  const houses = (backup.houses || [])
    .map(buildBackupHousePayload)
    .filter(h => h.name);

  if (houses.length) await request('POST', '/api/backup/restore', { houses });
  await loadFromSupabase();
}
