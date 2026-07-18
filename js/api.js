import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './config.js';
import { legacyCalendarPeriod, periodFromLabel } from './backup.js';
import { serializeImportParties } from './house-import-parties.js';
import { mapHouseFromDb, state } from './state.js';
import { ensurePeriodPayload, parseFiscalLabel } from './fiscal.js';
import { findInstallment, findInstallmentForDate, inferInstallmentKey } from './installments.js';
import { chunkArray, hashText, today, uid } from './utils.js';

export function createSupabaseClient(createClient) {
  if (!DEFAULT_SUPABASE_URL || !DEFAULT_SUPABASE_ANON_KEY) {
    throw new Error('Configurazione backend mancante');
  }
  state.supabaseUrl = DEFAULT_SUPABASE_URL;
  state.supabaseAnonKey = DEFAULT_SUPABASE_ANON_KEY;
  state.supabase = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, {
    auth: { detectSessionInUrl: true, flowType: 'pkce', persistSession: true }
  });
}

export async function ensureAuthenticated() {
  if (!state.supabase) throw new Error('Client non inizializzato');
  if (state.user) return state.user;
  const { data, error } = await state.supabase.auth.getSession();
  if (error) throw error;
  state.user = data.session?.user ?? null;
  return state.user;
}

async function fetchAllRows(buildPageQuery, pageSize = 1000) {
  const all = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await buildPageQuery(from, to);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchPriorBalancesForHouse(hid) {
  try {
    return await fetchAllRows((from, to) =>
      state.supabase.from('prior_balances').select('*').eq('house_id', hid).order('id', { ascending: true }).range(from, to)
    );
  } catch (err) {
    if (err?.code === '42P01') return [];
    throw err;
  }
}

async function fetchHouseRelations(hid) {
  return Promise.all([
    fetchAllRows((from, to) =>
      state.supabase.from('fiscal_periods').select('*').eq('house_id', hid)
        .order('start_date', { ascending: false }).order('id', { ascending: true }).range(from, to)
    ),
    fetchAllRows((from, to) =>
      state.supabase.from('dues').select('*').eq('house_id', hid).order('id', { ascending: true }).range(from, to)
    ),
    fetchAllRows((from, to) =>
      state.supabase.from('payments').select('*').eq('house_id', hid)
        .order('date', { ascending: false }).order('id', { ascending: true }).range(from, to)
    ),
    fetchAllRows((from, to) =>
      state.supabase.from('bank_movements').select('*').eq('house_id', hid)
        .order('movement_date', { ascending: false }).order('id', { ascending: true }).range(from, to)
    ),
    fetchPriorBalancesForHouse(hid)
  ]);
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

  const { data: houseRow, error } = await state.supabase.from('houses').select('*').eq('id', numericId).single();
  if (error) throw error;

  const [periods, dues, payments, movements, priorBalances] = await fetchHouseRelations(numericId);
  const mapped = mapHouseFromDb(houseRow, dues, payments, periods, movements, priorBalances);
  const idx = state.data.houses.findIndex(h => String(h.id) === idStr);
  if (idx >= 0) state.data.houses[idx] = mapped;
  else state.data.houses.push(mapped);

  state.selectedHouseId = idStr;
  sessionStorage.setItem('app:selectedHouseId', idStr);
  return mapped;
}

export async function loadFromSupabase() {
  const user = await ensureAuthenticated();
  if (!user) return;

  const { data: houses, error } = await state.supabase.from('houses').select('*').order('created_at', { ascending: true });
  if (error) throw error;

  const previousId = state.selectedHouseId ?? sessionStorage.getItem('app:selectedHouseId');
  const mapped = [];
  for (const house of houses || []) {
    const hid = house.id;
    const [periods, dues, payments, movements, priorBalances] = await fetchHouseRelations(hid);
    mapped.push(mapHouseFromDb(house, dues, payments, periods, movements, priorBalances));
  }

  state.data = { houses: mapped };
  preserveSelectedHouseId(mapped, previousId);
}

export async function saveHouseToSupabase(house) {
  const user = await ensureAuthenticated();
  if (!user) throw new Error('Devi essere connesso per salvare la casa');
  const payload = {
    name: house.name,
    location: house.location,
    notes: house.notes,
    fiscal_start_month: house.fiscalStartMonth,
    import_parties: serializeImportParties(house.importParties || []),
    user_id: user.id
  };
  const numericId = Number(house.id);
  if (Number.isFinite(numericId)) {
    const { error } = await state.supabase.from('houses').update(payload).eq('id', numericId);
    if (error) throw error;
  } else {
    const { data, error } = await state.supabase.from('houses').insert(payload).select().single();
    if (error) throw error;
    house.id = String(data.id);
  }
}

export async function updateCalendarSettings(house, { cadence, leadDays }) {
  const user = await ensureAuthenticated();
  if (!user) throw new Error('Devi essere connesso per salvare le impostazioni calendario');
  const numericId = Number(house.id);
  if (!Number.isFinite(numericId)) throw new Error('Salva prima la casa');
  const payload = {
    calendar_reminder_cadence: cadence,
    calendar_reminder_lead_days: leadDays
  };
  const { error } = await state.supabase.from('houses').update(payload).eq('id', numericId);
  if (error) throw error;
  house.calendarReminderCadence = cadence;
  house.calendarReminderLeadDays = leadDays;
}

export async function ensureFiscalPeriodBySpec(house, spec) {
  const existing = house.fiscalPeriods.find(p =>
    p.label === spec.label && p.startDate === spec.startDate && p.endDate === spec.endDate
  );
  if (existing) return { period: existing, isNew: false };

  const { data, error } = await state.supabase.from('fiscal_periods').insert({
    house_id: Number(house.id),
    label: spec.label,
    start_date: spec.startDate,
    end_date: spec.endDate
  }).select().single();
  if (error) {
    if (error.code === '23505') {
      const { data: row } = await state.supabase.from('fiscal_periods')
        .select('*').eq('house_id', Number(house.id)).eq('label', spec.label).single();
      if (row) {
        const period = { id: String(row.id), label: row.label, startDate: row.start_date, endDate: row.end_date };
        if (!house.fiscalPeriods.some(p => p.id === period.id)) house.fiscalPeriods.push(period);
        return { period, isNew: false };
      }
    }
    throw error;
  }

  const period = { id: String(data.id), label: data.label, startDate: data.start_date, endDate: data.end_date };
  house.fiscalPeriods.push(period);
  return { period, isNew: true };
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
    house_id: Number(house.id),
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
    const { error } = await state.supabase.from('dues').update({
      fiscal_period_id: payload.fiscal_period_id,
      amount: payload.amount,
      description: payload.description,
      split_mode: payload.split_mode,
      split_custom: payload.split_custom,
      split_amounts: payload.split_amounts,
      due_kind: payload.due_kind,
      carry_from_period_id: payload.carry_from_period_id
    }).eq('id', Number(due.id)).eq('house_id', Number(house.id));
    if (error) throw error;
    return;
  }
  const { data, error } = await state.supabase.from('dues').insert(payload).select('id').single();
  if (error) throw error;
  if (data?.id) due.id = String(data.id);
}

export async function deleteDueFromSupabase(house, dueId) {
  await ensureAuthenticated();
  const { error } = await state.supabase.from('dues')
    .delete()
    .eq('id', Number(dueId))
    .eq('house_id', Number(house.id));
  if (error) throw error;
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
    house_id: Number(house.id),
    fiscal_period_id: Number(periodId),
    source_period_id: priorBalance.sourcePeriodId ? Number(priorBalance.sourcePeriodId) : null,
    amount: priorBalance.amount,
    description: priorBalance.description || null
  };
  if (Number.isFinite(Number(priorBalance.id))) {
    const { data, error } = await state.supabase.from('prior_balances').update({
      fiscal_period_id: payload.fiscal_period_id,
      source_period_id: payload.source_period_id,
      amount: payload.amount,
      description: payload.description
    }).eq('id', Number(priorBalance.id)).eq('house_id', Number(house.id)).select('id').maybeSingle();
    if (error) {
      if (error.code === '23505') {
        throw new Error('Esiste già un saldo precedente per questo esercizio.');
      }
      throw error;
    }
    if (!data) throw new Error('Saldo precedente non trovato. Ricarica la pagina e riprova.');
  } else {
    const existing = (house.priorBalances || []).find(b => String(b.fiscalPeriodId) === String(periodId));
    if (existing && Number.isFinite(Number(existing.id))) {
      const { error } = await state.supabase.from('prior_balances').update({
        source_period_id: payload.source_period_id,
        amount: payload.amount,
        description: payload.description
      }).eq('id', Number(existing.id)).eq('house_id', Number(house.id));
      if (error) throw error;
      priorBalance.id = existing.id;
    } else {
      const { data, error } = await state.supabase.from('prior_balances').insert(payload).select('id').single();
      if (error) throw error;
      if (data?.id) priorBalance.id = String(data.id);
    }
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
  const { error } = await state.supabase.from('prior_balances')
    .delete()
    .eq('id', Number(priorBalanceId))
    .eq('house_id', Number(house.id));
  if (error) throw error;
}

export async function savePaymentToSupabase(house, payment) {
  await ensureAuthenticated();
  let periodId = payment.fiscalPeriodId;
  if (!periodId) {
    const { period } = await ensureFiscalPeriod(house, payment.date || today);
    periodId = period.id;
  }
  const payload = {
    house_id: Number(house.id),
    fiscal_period_id: Number(periodId),
    amount: payment.amount,
    date: payment.date,
    method: payment.method,
    installment_key: payment.installmentKey || null,
    prior_balance_id: payment.priorBalanceId ? Number(payment.priorBalanceId) : null,
    carry_from_period_id: null,
    is_carry_forward: false,
    bank_movement_id: payment.bankMovementId ? Number(payment.bankMovementId) : null
  };
  if (Number.isFinite(Number(payment.id))) {
    const { error } = await state.supabase.from('payments').update({
      fiscal_period_id: payload.fiscal_period_id,
      amount: payload.amount,
      date: payload.date,
      method: payload.method,
      installment_key: payload.installment_key,
      prior_balance_id: payload.prior_balance_id,
      bank_movement_id: payload.bank_movement_id,
      carry_from_period_id: null,
      is_carry_forward: false
    }).eq('id', Number(payment.id)).eq('house_id', Number(house.id));
    if (error) throw error;
    return;
  }
  const { error } = await state.supabase.from('payments').insert(payload);
  if (error) throw error;
}

export async function deletePaymentFromSupabase(house, payment) {
  await ensureAuthenticated();
  const bankMovementId = payment.bankMovementId;
  const { error } = await state.supabase.from('payments')
    .delete()
    .eq('id', Number(payment.id))
    .eq('house_id', Number(house.id));
  if (error) throw error;
  if (bankMovementId) {
    await state.supabase.from('bank_movements').update({
      status: 'unlinked',
      linked_payment_id: null,
      fiscal_period_id: null
    }).eq('id', Number(bankMovementId));
  }
}

export async function deleteHouseRemote(houseId) {
  await ensureAuthenticated();
  const { error } = await state.supabase.from('houses').delete().eq('id', Number(houseId));
  if (error) throw error;
}

export async function movementHash(houseId, movement) {
  const raw = [houseId, movement.movementDate, movement.amount, movement.operation, movement.details].join('|');
  return hashText(raw.toLowerCase());
}

export async function saveBankImport(house, batchId, previewRows) {
  await ensureAuthenticated();
  for (const row of previewRows) {
    if (!row.selected || row.ineligible || Number(row.amount) >= 0) continue;
    const sourceHash = await movementHash(house.id, row);
    let periodId = row.manualPeriodId || row.suggestedFiscalPeriodId;
    if (!periodId) {
      const { period } = await ensureFiscalPeriod(house, row.movementDate);
      periodId = period.id;
      row.manualPeriodId = periodId;
    }
    if (!periodId) continue;

    const { data: bm, error: bmErr } = await state.supabase.from('bank_movements').insert({
      house_id: Number(house.id),
      import_batch_id: batchId,
      movement_date: row.movementDate,
      operation: row.operation,
      details: row.details,
      amount: row.amount,
      currency: row.currency || 'EUR',
      source_hash: sourceHash,
      fiscal_period_id: Number(periodId),
      suggested_fiscal_period_id: row.suggestedFiscalPeriodId ? Number(row.suggestedFiscalPeriodId) : null,
      match_confidence: row.matchConfidence,
      match_reason: row.matchReason,
      status: 'linked'
    }).select().single();
    if (bmErr) {
      if (bmErr.code === '23505') continue;
      throw bmErr;
    }

    let installmentKey = null;
    for (const d of house.dues.filter(d => String(d.fiscalPeriodId) === String(periodId) && (d.dueKind || 'preventivo') === 'preventivo')) {
      const slot = findInstallmentForDate(house, d, row.movementDate);
      if (slot) { installmentKey = slot.key; break; }
    }
    const { data: pay, error: payErr } = await state.supabase.from('payments').insert({
      house_id: Number(house.id),
      fiscal_period_id: Number(periodId),
      amount: row.paymentAmount,
      date: row.movementDate,
      method: 'Import Intesa',
      bank_movement_id: bm.id,
      installment_key: installmentKey
    }).select().single();
    if (payErr) throw payErr;

    await state.supabase.from('bank_movements').update({ linked_payment_id: pay.id }).eq('id', bm.id);
  }
}

export async function saveUnlinkedBankMovements(house, batchId, previewRows) {
  await ensureAuthenticated();
  for (const row of previewRows) {
    if (row.selected || row.ineligible) continue;
    const sourceHash = await movementHash(house.id, row);
    const { error } = await state.supabase.from('bank_movements').insert({
      house_id: Number(house.id),
      import_batch_id: batchId,
      movement_date: row.movementDate,
      operation: row.operation,
      details: row.details,
      amount: row.amount,
      currency: row.currency || 'EUR',
      source_hash: sourceHash,
      suggested_fiscal_period_id: row.suggestedFiscalPeriodId ? Number(row.suggestedFiscalPeriodId) : null,
      match_confidence: row.matchConfidence,
      match_reason: row.matchReason,
      status: 'unlinked'
    });
    if (error && error.code !== '23505') throw error;
  }
}

async function fetchBankMovements(houseId, { importBatchId } = {}) {
  const hid = Number(houseId);
  const pageSize = 1000;
  const all = [];
  let from = 0;
  while (true) {
    let query = state.supabase.from('bank_movements')
      .select('id, linked_payment_id, status')
      .eq('house_id', hid)
      .order('id', { ascending: true });
    if (importBatchId) query = query.eq('import_batch_id', importBatchId);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
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

async function deleteOrphanImportPayments(house, deletableMovements) {
  const hid = Number(house.id);
  const payIds = [...new Set(
    deletableMovements
      .map(m => resolveMovementPayment(house, m))
      .filter(p => p && !isPaymentLinkedToDue(house, p))
      .map(p => Number(p.id))
      .filter(Number.isFinite)
  )];
  for (const chunk of chunkArray(payIds)) {
    const { error } = await state.supabase.from('payments')
      .delete()
      .eq('house_id', hid)
      .in('id', chunk);
    if (error) throw error;
  }
  return payIds.length;
}

async function deleteBankMovementsByIds(house, movementIds) {
  const ids = movementIds.filter(Number.isFinite);
  if (!ids.length) return;
  const hid = Number(house.id);
  for (const chunk of chunkArray(ids)) {
    const { error } = await state.supabase.from('bank_movements')
      .delete()
      .eq('house_id', hid)
      .in('id', chunk);
    if (error) throw error;
  }
}

export async function deleteBankImportBatch(house, batchId) {
  await ensureAuthenticated();
  const movements = await fetchBankMovements(house.id, { importBatchId: batchId });
  const { deletable, protectedMovements, deletablePayments } = classifyMovementsForDelete(house, movements);
  if (!deletable.length) {
    return { deletedMovements: 0, deletedPayments: 0, skippedMovements: protectedMovements.length };
  }

  await deleteOrphanImportPayments(house, deletable);
  await deleteBankMovementsByIds(house, deletable.map(m => Number(m.id)));

  return {
    deletedMovements: deletable.length,
    deletedPayments: deletablePayments,
    skippedMovements: protectedMovements.length
  };
}

export async function deleteAllBankImports(house) {
  await ensureAuthenticated();
  const movements = await fetchBankMovements(house.id);
  const { deletable, protectedMovements, deletablePayments } = classifyMovementsForDelete(house, movements);
  if (!deletable.length) {
    return { deletedMovements: 0, deletedPayments: 0, skippedMovements: protectedMovements.length };
  }

  await deleteOrphanImportPayments(house, deletable);
  await deleteBankMovementsByIds(house, deletable.map(m => Number(m.id)));

  return {
    deletedMovements: deletable.length,
    deletedPayments: deletablePayments,
    skippedMovements: protectedMovements.length
  };
}

export async function linkBankMovement(house, movementId, fiscalPeriodId) {
  await ensureAuthenticated();
  const { data: bm, error: bmErr } = await state.supabase.from('bank_movements').select('*').eq('id', Number(movementId)).single();
  if (bmErr) throw bmErr;

  let installmentKey = null;
  for (const d of house.dues.filter(d =>
    String(d.fiscalPeriodId) === String(fiscalPeriodId) && (d.dueKind || 'preventivo') === 'preventivo'
  )) {
    const slot = findInstallmentForDate(house, d, bm.movement_date);
    if (slot) { installmentKey = slot.key; break; }
  }
  const { data: pay, error: payErr } = await state.supabase.from('payments').insert({
    house_id: Number(house.id),
    fiscal_period_id: Number(fiscalPeriodId),
    amount: Math.abs(Number(bm.amount)),
    date: bm.movement_date,
    method: 'Import Intesa (manuale)',
    bank_movement_id: bm.id,
    installment_key: installmentKey
  }).select().single();
  if (payErr) throw payErr;

  const { error } = await state.supabase.from('bank_movements').update({
    fiscal_period_id: Number(fiscalPeriodId),
    linked_payment_id: pay.id,
    status: 'linked'
  }).eq('id', bm.id);
  if (error) throw error;
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

export async function syncBackupToSupabase(backup) {
  await ensureAuthenticated();

  for (const houseData of backup.houses || []) {
    const house = {
      id: uid('house'),
      name: houseData.name,
      location: houseData.location || '',
      notes: houseData.notes || '',
      fiscalStartMonth: houseData.fiscalStartMonth ?? 6,
      importParties: houseData.importParties || [],
      fiscalPeriods: [],
      dues: [],
      payments: [],
      priorBalances: [],
      bankMovements: []
    };
    await saveHouseToSupabase(house);

    for (const spec of houseData.fiscalPeriods || []) {
      const { period } = await ensureFiscalPeriodBySpec(house, spec);
      if (period && !house.fiscalPeriods.some(p => p.id === period.id)) house.fiscalPeriods.push(period);
    }

    const resolvePeriod = async (item) => {
      let spec = periodFromLabel(house, item.fiscalPeriodLabel, item._legacyYear);
      if (!spec && item.date) spec = ensurePeriodPayload(house, item.date);
      if (!spec && item._legacyYear) spec = legacyCalendarPeriod(Number(item._legacyYear));
      if (!spec) return null;
      const { period } = await ensureFiscalPeriodBySpec(house, spec);
      return period;
    };

    for (const due of houseData.dues || []) {
      const period = await resolvePeriod(due);
      if (!period) continue;
      await state.supabase.from('dues').insert({
        house_id: Number(house.id),
        fiscal_period_id: Number(period.id),
        amount: due.amount,
        description: due.description || '',
        split_mode: due.splitMode || 'monthly',
        split_custom: due.splitCustom || null,
        split_amounts: due.splitAmounts || null,
        due_kind: due.dueKind || 'preventivo',
        carry_from_period_id: due.carryFromPeriodId ? Number(due.carryFromPeriodId) : null
      });
    }

    for (const payment of houseData.payments || []) {
      const period = await resolvePeriod(payment);
      if (!period) continue;
      await state.supabase.from('payments').insert({
        house_id: Number(house.id),
        fiscal_period_id: Number(period.id),
        amount: payment.amount,
        date: payment.date || null,
        method: payment.method || '',
        installment_key: payment.installmentKey || null,
        carry_from_period_id: payment.carryFromPeriodId ? Number(payment.carryFromPeriodId) : null,
        is_carry_forward: Boolean(payment.isCarryForward)
      });
    }

    for (const prior of houseData.priorBalances || []) {
      let period = await resolvePeriod(prior);
      if (!period && prior.fiscalPeriodLabel) {
        const { period: p } = await ensureFiscalPeriodByLabel(house, prior.fiscalPeriodLabel);
        period = p;
      }
      if (!period) continue;
      let sourcePeriodId = null;
      if (prior.sourcePeriodLabel) {
        const src = await resolvePeriod({ fiscalPeriodLabel: prior.sourcePeriodLabel });
        sourcePeriodId = src?.id ?? null;
      } else if (prior.sourcePeriodId) {
        sourcePeriodId = Number(prior.sourcePeriodId);
      }
      await state.supabase.from('prior_balances').insert({
        house_id: Number(house.id),
        fiscal_period_id: Number(period.id),
        source_period_id: sourcePeriodId,
        amount: prior.amount,
        description: prior.description || null
      });
    }
  }

  await loadFromSupabase();
}
