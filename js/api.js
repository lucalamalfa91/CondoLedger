import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './config.js';
import { legacyCalendarPeriod, periodFromLabel } from './backup.js';
import { serializeImportParties } from './house-import-parties.js';
import { mapHouseFromDb, state } from './state.js';
import { ensurePeriodPayload, parseFiscalLabel } from './fiscal.js';
import { findInstallmentForDate } from './installments.js';
import { hashText, today, uid } from './utils.js';

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

export async function loadFromSupabase() {
  const user = await ensureAuthenticated();
  if (!user) return;

  const { data: houses, error } = await state.supabase.from('houses').select('*').order('created_at', { ascending: true });
  if (error) throw error;

  const mapped = [];
  for (const house of houses || []) {
    const hid = house.id;
    const [{ data: periods }, { data: dues }, { data: payments }, { data: movements }, { data: priorBalances }] = await Promise.all([
      state.supabase.from('fiscal_periods').select('*').eq('house_id', hid).order('start_date', { ascending: false }),
      state.supabase.from('dues').select('*').eq('house_id', hid),
      state.supabase.from('payments').select('*').eq('house_id', hid).order('date', { ascending: false }),
      state.supabase.from('bank_movements').select('*').eq('house_id', hid).order('movement_date', { ascending: false }),
      state.supabase.from('prior_balances').select('*').eq('house_id', hid)
    ]);
    mapped.push(mapHouseFromDb(house, dues, payments, periods, movements, priorBalances));
  }

  const previousId = state.selectedHouseId || sessionStorage.getItem('app:selectedHouseId');
  state.data = { houses: mapped };
  const stillSelected = previousId && mapped.some(h => h.id === previousId);
  state.selectedHouseId = stillSelected ? previousId : (mapped[0]?.id || null);
  if (state.selectedHouseId) {
    sessionStorage.setItem('app:selectedHouseId', state.selectedHouseId);
  } else {
    sessionStorage.removeItem('app:selectedHouseId');
  }
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
    const { error } = await state.supabase.from('prior_balances').update({
      fiscal_period_id: payload.fiscal_period_id,
      source_period_id: payload.source_period_id,
      amount: payload.amount,
      description: payload.description
    }).eq('id', Number(priorBalance.id)).eq('house_id', Number(house.id));
    if (error) throw error;
    return;
  }
  const existing = (house.priorBalances || []).find(b => String(b.fiscalPeriodId) === String(periodId));
  if (existing && Number.isFinite(Number(existing.id))) {
    const { error } = await state.supabase.from('prior_balances').update({
      source_period_id: payload.source_period_id,
      amount: payload.amount,
      description: payload.description
    }).eq('id', Number(existing.id)).eq('house_id', Number(house.id));
    if (error) throw error;
    priorBalance.id = existing.id;
    return;
  }
  const { data, error } = await state.supabase.from('prior_balances').insert(payload).select('id').single();
  if (error) throw error;
  if (data?.id) priorBalance.id = String(data.id);
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
    carry_from_period_id: payment.carryFromPeriodId ? Number(payment.carryFromPeriodId) : null,
    is_carry_forward: Boolean(payment.isCarryForward),
    bank_movement_id: payment.bankMovementId ? Number(payment.bankMovementId) : null
  };
  if (Number.isFinite(Number(payment.id))) {
    const { error } = await state.supabase.from('payments').update({
      fiscal_period_id: payload.fiscal_period_id,
      amount: payload.amount,
      date: payload.date,
      method: payload.method,
      installment_key: payload.installment_key,
      carry_from_period_id: payload.carry_from_period_id,
      is_carry_forward: payload.is_carry_forward
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

async function deletePaymentsForBankMovements(house, movements) {
  if (!movements?.length) return 0;
  const movementIds = movements.map(m => Number(m.id));
  const linkedPayIds = [...new Set(
    movements.map(m => m.linked_payment_id).filter(id => Number.isFinite(Number(id)))
  )];

  const { error: pErr } = await state.supabase.from('payments')
    .delete()
    .eq('house_id', Number(house.id))
    .in('bank_movement_id', movementIds);
  if (pErr) throw pErr;

  if (linkedPayIds.length) {
    const { error: pErr2 } = await state.supabase.from('payments')
      .delete()
      .eq('house_id', Number(house.id))
      .in('id', linkedPayIds);
    if (pErr2) throw pErr2;
  }

  return movementIds.length;
}

export async function deleteBankImportBatch(house, batchId) {
  await ensureAuthenticated();
  const { data: movements, error: mErr } = await state.supabase.from('bank_movements')
    .select('id, linked_payment_id')
    .eq('house_id', Number(house.id))
    .eq('import_batch_id', batchId);
  if (mErr) throw mErr;
  if (!movements?.length) return { deletedMovements: 0, deletedPayments: 0 };

  await deletePaymentsForBankMovements(house, movements);

  const { error: bmErr } = await state.supabase.from('bank_movements')
    .delete()
    .eq('house_id', Number(house.id))
    .eq('import_batch_id', batchId);
  if (bmErr) throw bmErr;

  return { deletedMovements: movements.length };
}

export async function deleteAllBankImports(house) {
  await ensureAuthenticated();
  const { data: movements, error: mErr } = await state.supabase.from('bank_movements')
    .select('id, linked_payment_id')
    .eq('house_id', Number(house.id));
  if (mErr) throw mErr;
  if (!movements?.length) return { deletedMovements: 0 };

  await deletePaymentsForBankMovements(house, movements);

  const { error: bmErr } = await state.supabase.from('bank_movements')
    .delete()
    .eq('house_id', Number(house.id));
  if (bmErr) throw bmErr;

  return { deletedMovements: movements.length };
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

export function createLocalPayment(formData, fiscalPeriodId, installmentKey) {
  const carryFrom = String(formData.get('carryFromPeriodId') || '').trim() || null;
  return {
    id: uid('pay'),
    fiscalPeriodId: fiscalPeriodId || null,
    installmentKey: installmentKey || null,
    amount: Number(formData.get('amount')),
    date: String(formData.get('date') || today),
    method: String(formData.get('method') || '').trim(),
    isCarryForward: Boolean(carryFrom),
    carryFromPeriodId: carryFrom
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
