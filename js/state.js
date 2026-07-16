import { parseImportPartiesFromDb } from './house-import-parties.js';
import { today } from './utils.js';

export const state = {
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  selectedHouseId: null,
  currentView: 'panoramica',
  currentSubview: null,
  data: { houses: [] },
  supabaseUrl: '',
  supabaseAnonKey: '',
  supabase: null,
  user: null,
  recoveryMode: false,
  bankImportPreview: [],
  documentImportPreview: null,
  documentImportBusy: false,
  documentImportProgressText: null,
  documentImportLastFiles: null,
  houseDataLoadError: null,
  documentImportDuplicateAction: null,
  documentImportReplaceDueIds: [],
  houseFormMode: 'edit',
  pendingSituazionePeriodId: null,
  postImportPaymentHint: null
};

export function activeHouse() {
  const sid = state.selectedHouseId != null ? String(state.selectedHouseId) : null;
  if (!sid) return null;
  return state.data.houses.find(h => String(h.id) === sid) || null;
}

export function createLocalHouse() {
  return {
    id: uid('house'),
    name: `Casa ${state.data.houses.length + 1}`,
    location: '',
    notes: '',
    fiscalStartMonth: 6,
    importParties: [],
    fiscalPeriods: [],
    dues: [],
    payments: [],
    priorBalances: [],
    bankMovements: []
  };
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function mapHouseFromDb(house, dues, payments, periods, movements, priorBalances) {
  return {
    id: String(house.id),
    name: house.name,
    location: house.location || '',
    notes: house.notes || '',
    fiscalStartMonth: house.fiscal_start_month ?? 6,
    importParties: parseImportPartiesFromDb(house.import_parties),
    fiscalPeriods: (periods || []).map(p => ({
      id: String(p.id),
      label: p.label,
      startDate: p.start_date,
      endDate: p.end_date
    })),
    dues: (dues || []).map(d => ({
      id: String(d.id),
      fiscalPeriodId: String(d.fiscal_period_id),
      amount: Number(d.amount),
      description: d.description || '',
      splitMode: d.split_mode || 'monthly',
      splitCustom: Array.isArray(d.split_custom) ? d.split_custom : null,
      splitAmounts: Array.isArray(d.split_amounts) ? d.split_amounts : null,
      dueKind: d.due_kind || 'preventivo',
      carryFromPeriodId: d.carry_from_period_id ? String(d.carry_from_period_id) : null,
      date: d.created_at?.slice(0, 10) || today
    })),
    payments: (payments || []).map(p => ({
      id: String(p.id),
      fiscalPeriodId: String(p.fiscal_period_id),
      amount: Number(p.amount),
      date: p.date || '',
      method: p.method || '',
      installmentKey: p.installment_key || null,
      priorBalanceId: p.prior_balance_id ? String(p.prior_balance_id) : null,
      carryFromPeriodId: p.carry_from_period_id ? String(p.carry_from_period_id) : null,
      isCarryForward: Boolean(p.is_carry_forward),
      bankMovementId: p.bank_movement_id ? String(p.bank_movement_id) : null
    })),
    priorBalances: (priorBalances || []).map(b => ({
      id: String(b.id),
      fiscalPeriodId: String(b.fiscal_period_id),
      sourcePeriodId: b.source_period_id ? String(b.source_period_id) : null,
      amount: Number(b.amount),
      description: b.description || ''
    })),
    bankMovements: (movements || []).map(m => ({
      id: String(m.id),
      importBatchId: m.import_batch_id || null,
      movementDate: m.movement_date,
      operation: m.operation || '',
      details: m.details || '',
      amount: Number(m.amount),
      status: m.status,
      fiscalPeriodId: m.fiscal_period_id ? String(m.fiscal_period_id) : null,
      suggestedFiscalPeriodId: m.suggested_fiscal_period_id ? String(m.suggested_fiscal_period_id) : null,
      matchConfidence: m.match_confidence,
      matchReason: m.match_reason || '',
      linkedPaymentId: m.linked_payment_id ? String(m.linked_payment_id) : null,
      createdAt: m.created_at || null
    }))
  };
}
