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
  bankImportPreview: []
};

export function activeHouse() {
  return state.data.houses.find(h => h.id === state.selectedHouseId) || null;
}

export function createLocalHouse() {
  return {
    id: uid('house'),
    name: `Casa ${state.data.houses.length + 1}`,
    location: '',
    notes: '',
    fiscalStartMonth: 6,
    fiscalPeriods: [],
    dues: [],
    payments: [],
    bankMovements: []
  };
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function mapHouseFromDb(house, dues, payments, periods, movements) {
  return {
    id: String(house.id),
    name: house.name,
    location: house.location || '',
    notes: house.notes || '',
    fiscalStartMonth: house.fiscal_start_month ?? 6,
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
      date: d.created_at?.slice(0, 10) || today
    })),
    payments: (payments || []).map(p => ({
      id: String(p.id),
      fiscalPeriodId: String(p.fiscal_period_id),
      amount: Number(p.amount),
      date: p.date || '',
      method: p.method || '',
      bankMovementId: p.bank_movement_id ? String(p.bank_movement_id) : null
    })),
    bankMovements: (movements || []).map(m => ({
      id: String(m.id),
      movementDate: m.movement_date,
      operation: m.operation || '',
      details: m.details || '',
      amount: Number(m.amount),
      status: m.status,
      fiscalPeriodId: m.fiscal_period_id ? String(m.fiscal_period_id) : null,
      suggestedFiscalPeriodId: m.suggested_fiscal_period_id ? String(m.suggested_fiscal_period_id) : null,
      matchConfidence: m.match_confidence,
      matchReason: m.match_reason || '',
      linkedPaymentId: m.linked_payment_id ? String(m.linked_payment_id) : null
    }))
  };
}
