import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './config.js';
import { legacyCalendarPeriod, periodFromLabel } from './backup.js';
import { mapHouseFromDb, state } from './state.js';
import { ensurePeriodPayload } from './fiscal.js';
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
  if (error) { alert(error.message); return; }

  const mapped = [];
  for (const house of houses || []) {
    const hid = house.id;
    const [{ data: periods }, { data: dues }, { data: payments }, { data: movements }] = await Promise.all([
      state.supabase.from('fiscal_periods').select('*').eq('house_id', hid).order('start_date', { ascending: false }),
      state.supabase.from('dues').select('*').eq('house_id', hid),
      state.supabase.from('payments').select('*').eq('house_id', hid).order('date', { ascending: false }),
      state.supabase.from('bank_movements').select('*').eq('house_id', hid).order('movement_date', { ascending: false })
    ]);
    mapped.push(mapHouseFromDb(house, dues, payments, periods, movements));
  }

  state.data = { houses: mapped };
  state.selectedHouseId = mapped[0]?.id || null;
}

export async function saveHouseToSupabase(house) {
  const user = await ensureAuthenticated();
  if (!user) throw new Error('Devi essere connesso per salvare la casa');
  const payload = {
    name: house.name,
    location: house.location,
    notes: house.notes,
    fiscal_start_month: house.fiscalStartMonth,
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
  if (existing) return existing;

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
        return period;
      }
    }
    throw error;
  }

  const period = { id: String(data.id), label: data.label, startDate: data.start_date, endDate: data.end_date };
  house.fiscalPeriods.push(period);
  return period;
}

export async function ensureFiscalPeriod(house, dateStr) {
  const existing = house.fiscalPeriods.find(p => dateStr >= p.startDate && dateStr <= p.endDate);
  if (existing) return existing;

  const spec = ensurePeriodPayload(house, dateStr);
  if (spec.id) return { id: spec.id, label: spec.label, startDate: spec.startDate, endDate: spec.endDate };
  return ensureFiscalPeriodBySpec(house, spec);
}

export async function saveDueToSupabase(house, due) {
  await ensureAuthenticated();
  let periodId = due.fiscalPeriodId;
  if (!periodId) {
    const period = await ensureFiscalPeriod(house, due.date || today);
    periodId = period.id;
  }
  const { error } = await state.supabase.from('dues').insert({
    house_id: Number(house.id),
    fiscal_period_id: Number(periodId),
    amount: due.amount,
    description: due.description
  });
  if (error) throw error;
}

export async function savePaymentToSupabase(house, payment) {
  await ensureAuthenticated();
  let periodId = payment.fiscalPeriodId;
  if (!periodId) {
    const period = await ensureFiscalPeriod(house, payment.date || today);
    periodId = period.id;
  }
  const { error } = await state.supabase.from('payments').insert({
    house_id: Number(house.id),
    fiscal_period_id: Number(periodId),
    amount: payment.amount,
    date: payment.date,
    method: payment.method,
    bank_movement_id: payment.bankMovementId ? Number(payment.bankMovementId) : null
  });
  if (error) throw error;
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
      const period = await ensureFiscalPeriod(house, row.movementDate);
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

    const { data: pay, error: payErr } = await state.supabase.from('payments').insert({
      house_id: Number(house.id),
      fiscal_period_id: Number(periodId),
      amount: row.paymentAmount,
      date: row.movementDate,
      method: 'Import Intesa',
      bank_movement_id: bm.id
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

export async function linkBankMovement(house, movementId, fiscalPeriodId) {
  await ensureAuthenticated();
  const { data: bm, error: bmErr } = await state.supabase.from('bank_movements').select('*').eq('id', Number(movementId)).single();
  if (bmErr) throw bmErr;

  const { data: pay, error: payErr } = await state.supabase.from('payments').insert({
    house_id: Number(house.id),
    fiscal_period_id: Number(fiscalPeriodId),
    amount: Math.abs(Number(bm.amount)),
    date: bm.movement_date,
    method: 'Import Intesa (manuale)',
    bank_movement_id: bm.id
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
  return {
    id: uid('due'),
    amount: Number(formData.get('amount')),
    description: String(formData.get('description') || '').trim(),
    date: today
  };
}

export function createLocalPayment(formData, fiscalPeriodId) {
  return {
    id: uid('pay'),
    fiscalPeriodId: fiscalPeriodId || null,
    amount: Number(formData.get('amount')),
    date: String(formData.get('date') || today),
    method: String(formData.get('method') || '').trim()
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
      fiscalPeriods: [],
      dues: [],
      payments: [],
      bankMovements: []
    };
    await saveHouseToSupabase(house);

    for (const spec of houseData.fiscalPeriods || []) {
      await ensureFiscalPeriodBySpec(house, spec);
    }

    const resolvePeriod = async (item) => {
      let spec = periodFromLabel(house, item.fiscalPeriodLabel, item._legacyYear);
      if (!spec && item.date) spec = ensurePeriodPayload(house, item.date);
      if (!spec && item._legacyYear) spec = legacyCalendarPeriod(Number(item._legacyYear));
      if (!spec) return null;
      return ensureFiscalPeriodBySpec(house, spec);
    };

    for (const due of houseData.dues || []) {
      const period = await resolvePeriod(due);
      if (!period) continue;
      await state.supabase.from('dues').insert({
        house_id: Number(house.id),
        fiscal_period_id: Number(period.id),
        amount: due.amount,
        description: due.description || ''
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
        method: payment.method || ''
      });
    }
  }

  await loadFromSupabase();
}
