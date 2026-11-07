/**
 * Snapshot condo-export-v1.
 *
 * Copia consistente, a senso unico, per lo staging di CasaZen. Non è un backup
 * dell'app e non ha un import corrispondente: lo stesso database, finché non
 * cambia, produce lo stesso JSON e lo stesso contentHash.
 *
 * Gli id sono stabili perché derivano dalla chiave primaria (AUTOINCREMENT non
 * riusa i valori). Gli importi sono centesimi interi. Le rate sono la
 * normalizzazione di `split_amounts` del preventivo ordinario: ordinario,
 * saldo precedente (conguaglio in rata) e straordinario.
 */
import { createHash } from 'node:crypto';

import { toCents } from './cents.js';
import { fromJsonColumn } from './db.js';

export const EXPORT_FORMAT = 'condo-export-v1';

const QUERIES = {
  houses: 'SELECT * FROM houses WHERE user_id = ? ORDER BY id ASC',
  housesAll: 'SELECT * FROM houses ORDER BY id ASC',
  fiscalPeriods: 'SELECT * FROM fiscal_periods WHERE house_id = ? ORDER BY id ASC',
  dues: 'SELECT * FROM dues WHERE house_id = ? ORDER BY id ASC',
  priorBalances: 'SELECT * FROM prior_balances WHERE house_id = ? ORDER BY id ASC',
  payments: 'SELECT * FROM payments WHERE house_id = ? ORDER BY id ASC',
  bankMovements: 'SELECT * FROM bank_movements WHERE house_id = ? ORDER BY id ASC'
};

function entityId(kind, sourceId) {
  return `${kind}:${sourceId}`;
}

function ref(kind, sourceId) {
  if (sourceId === null || sourceId === undefined || sourceId === '') return null;
  const n = Number(sourceId);
  if (!Number.isInteger(n)) return null;
  return entityId(kind, n);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function contentHashOf(snapshot) {
  const body = { ...snapshot };
  delete body.contentHash;
  const hex = createHash('sha256').update(canonicalJson(body)).digest('hex');
  return `sha256:${hex}`;
}

function dueVoice(kind, sourceVoice) {
  if (kind !== 'budget') return null;
  if (sourceVoice === 'straordinario') return 'extraordinary';
  if (sourceVoice === 'ordinario' || sourceVoice === null || sourceVoice === '') return 'ordinary';
  return null;
}

function splitAmountRow(row) {
  const voices = ['ordinario', 'conguaglio', 'straordinari'];
  const hasVoice = voices.some((key) => {
    const n = Number(row?.[key]);
    return Number.isFinite(n) && n !== 0;
  });

  const parts = hasVoice
    ? {
        ordinaryCents: toCents(row.ordinario ?? 0) ?? 0,
        priorSettlementCents: toCents(row.conguaglio ?? 0) ?? 0,
        extraordinaryCents: toCents(row.straordinari ?? 0) ?? 0
      }
    : {
        ordinaryCents: toCents(row?.amount ?? 0) ?? 0,
        priorSettlementCents: 0,
        extraordinaryCents: 0
      };

  const totalCents = parts.ordinaryCents + parts.priorSettlementCents + parts.extraordinaryCents;
  return {
    periodStart: row?.periodStart ? String(row.periodStart).slice(0, 10) : null,
    periodEnd: row?.periodEnd ? String(row.periodEnd).slice(0, 10) : null,
    label: row?.label ?? null,
    ...parts,
    totalCents
  };
}

function mapSplitAmounts(value) {
  const rows = fromJsonColumn(value, null);
  if (!Array.isArray(rows)) return [];
  return rows.map(splitAmountRow);
}

function installmentIdForKey(key) {
  if (typeof key !== 'string') return null;
  const match = key.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  return `installment:due:${match[1]}:${match[2]}`;
}

function mapDue(row) {
  const sourceKind = row.due_kind || 'preventivo';
  const kind = sourceKind === 'consuntivo' ? 'final' : 'budget';
  const sourceVoice = row.voice ?? null;
  const voice = dueVoice(kind, sourceVoice);
  const id = entityId('due', row.id);
  const splitAmounts = mapSplitAmounts(row.split_amounts);
  return {
    id,
    sourceId: row.id,
    houseId: entityId('house', row.house_id),
    fiscalPeriodId: entityId('fiscal-period', row.fiscal_period_id),
    kind,
    voice,
    sourceKind,
    sourceVoice,
    amountCents: toCents(row.amount) ?? 0,
    description: row.description ?? null,
    splitMode: row.split_mode || 'monthly',
    splitCustom: fromJsonColumn(row.split_custom, null),
    carryFromPeriodId: ref('fiscal-period', row.carry_from_period_id),
    splitAmounts,
    createdAt: row.created_at
  };
}

function installmentsOf(due) {
  if (due.kind !== 'budget' || due.voice !== 'ordinary') return [];
  return due.splitAmounts.map((row, slotIndex) => ({
    id: `installment:${due.id}:${slotIndex}`,
    dueId: due.id,
    houseId: due.houseId,
    fiscalPeriodId: due.fiscalPeriodId,
    slotIndex,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    label: row.label,
    ordinaryCents: row.ordinaryCents,
    priorSettlementCents: row.priorSettlementCents,
    extraordinaryCents: row.extraordinaryCents,
    totalCents: row.totalCents
  }));
}

async function mapHouse(db, house) {
  const houseId = house.id;
  const [periods, dues, priors, payments, movements] = await Promise.all([
    db.prepare(QUERIES.fiscalPeriods).all(houseId),
    db.prepare(QUERIES.dues).all(houseId),
    db.prepare(QUERIES.priorBalances).all(houseId),
    db.prepare(QUERIES.payments).all(houseId),
    db.prepare(QUERIES.bankMovements).all(houseId)
  ]);

  const mappedDues = dues.map(mapDue);
  const installments = mappedDues.flatMap(installmentsOf);

  return {
    id: entityId('house', houseId),
    sourceId: houseId,
    ownerId: house.user_id,
    name: house.name,
    location: house.location ?? null,
    notes: house.notes ?? null,
    fiscalStartMonth: house.fiscal_start_month,
    createdAt: house.created_at,
    fiscalPeriods: periods.map((row) => ({
      id: entityId('fiscal-period', row.id),
      sourceId: row.id,
      houseId: entityId('house', row.house_id),
      label: row.label,
      startDate: row.start_date,
      endDate: row.end_date,
      createdAt: row.created_at
    })),
    dues: mappedDues,
    priorBalances: priors.map((row) => ({
      id: entityId('prior-balance', row.id),
      sourceId: row.id,
      houseId: entityId('house', row.house_id),
      fiscalPeriodId: entityId('fiscal-period', row.fiscal_period_id),
      sourcePeriodId: ref('fiscal-period', row.source_period_id),
      amountCents: toCents(row.amount) ?? 0,
      description: row.description ?? null,
      createdAt: row.created_at
    })),
    payments: payments.map((row) => ({
      id: entityId('payment', row.id),
      sourceId: row.id,
      houseId: entityId('house', row.house_id),
      fiscalPeriodId: entityId('fiscal-period', row.fiscal_period_id),
      amountCents: toCents(row.amount) ?? 0,
      paidOn: row.date ?? null,
      method: row.method ?? null,
      note: row.note ?? null,
      installmentKey: row.installment_key ?? null,
      installmentId: installmentIdForKey(row.installment_key),
      carryFromPeriodId: ref('fiscal-period', row.carry_from_period_id),
      isCarryForward: Boolean(row.is_carry_forward),
      priorBalanceId: ref('prior-balance', row.prior_balance_id),
      bankMovementId: ref('bank-movement', row.bank_movement_id),
      createdAt: row.created_at
    })),
    bankMovements: movements.map((row) => ({
      id: entityId('bank-movement', row.id),
      sourceId: row.id,
      houseId: entityId('house', row.house_id),
      importBatchId: row.import_batch_id,
      movementDate: row.movement_date,
      operation: row.operation ?? null,
      details: row.details ?? null,
      amountCents: toCents(row.amount) ?? 0,
      currency: row.currency || 'EUR',
      sourceHash: row.source_hash,
      fiscalPeriodId: ref('fiscal-period', row.fiscal_period_id),
      suggestedFiscalPeriodId: ref('fiscal-period', row.suggested_fiscal_period_id),
      matchConfidence: row.match_confidence ?? null,
      matchReason: row.match_reason ?? null,
      linkedPaymentId: ref('payment', row.linked_payment_id),
      status: row.status,
      createdAt: row.created_at
    })),
    installments
  };
}

/**
 * @param {object} db handle di server/db.js
 * @param {{ userId?: string }} [options] se userId è valorizzato, solo le sue case
 */
export async function buildCondoExport(db, options = {}) {
  const houses = options.userId
    ? await db.prepare(QUERIES.houses).all(options.userId)
    : await db.prepare(QUERIES.housesAll).all();

  const snapshot = {
    format: EXPORT_FORMAT,
    currency: 'EUR',
    amountUnit: 'cents',
    houses: await Promise.all(houses.map((house) => mapHouse(db, house)))
  };
  snapshot.contentHash = contentHashOf(snapshot);
  return snapshot;
}
