/**
 * Serializzazione delle righe verso il client.
 *
 * Il formato di trasporto resta lo **snake_case** che PostgREST restituiva: `mapHouseFromDb()`
 * in js/state.js è l'unico punto di traduzione DB→dominio del frontend, e lasciandolo intatto
 * si evita di riscrivere sei mapping annidati.
 *
 * Unica differenza rispetto alle righe grezze di SQLite: le colonne JSON vengono
 * deserializzate (mapHouseFromDb fa `Array.isArray(d.split_custom)`, e riceverne la stringa
 * grezza romperebbe il mapping in silenzio) e i booleani tornano 0/1 come in SQLite —
 * `Boolean(p.is_carry_forward)` lato client li normalizza già.
 */
import { fromJsonColumn } from './db.js';

export function serializeHouse(row) {
  return {
    ...row,
    import_parties: fromJsonColumn(row.import_parties, [])
  };
}

export function serializeDue(row) {
  return {
    ...row,
    split_custom: fromJsonColumn(row.split_custom, null),
    split_amounts: fromJsonColumn(row.split_amounts, null)
  };
}

export const serializePayment = (row) => row;
export const serializeFiscalPeriod = (row) => row;
export const serializePriorBalance = (row) => row;
export const serializeBankMovement = (row) => row;

/**
 * Ordinamenti identici a quelli che api.js chiedeva a PostgREST: render.js non riordina,
 * quindi una differenza qui si vedrebbe direttamente a schermo.
 *
 * Su `payments.date` (nullable) Postgres con DESC mette i NULL per primi; in SQLite NULL è
 * il valore minimo, quindi anche DESC li mette per primi. Coincidono: nessun NULLS LAST.
 */
const QUERIES = {
  fiscalPeriods:
    'SELECT * FROM fiscal_periods WHERE house_id = ? ORDER BY start_date DESC, id ASC',
  dues: 'SELECT * FROM dues WHERE house_id = ? ORDER BY id ASC',
  payments: 'SELECT * FROM payments WHERE house_id = ? ORDER BY date DESC, id ASC',
  bankMovements:
    'SELECT * FROM bank_movements WHERE house_id = ? ORDER BY movement_date DESC, id ASC',
  priorBalances: 'SELECT * FROM prior_balances WHERE house_id = ? ORDER BY id ASC'
};

/** Albero completo di una casa, nella forma che loadFromSupabase() consuma. */
export function houseTree(db, houseRow) {
  const hid = houseRow.id;
  return {
    house: serializeHouse(houseRow),
    fiscalPeriods: db.prepare(QUERIES.fiscalPeriods).all(hid).map(serializeFiscalPeriod),
    dues: db.prepare(QUERIES.dues).all(hid).map(serializeDue),
    payments: db.prepare(QUERIES.payments).all(hid).map(serializePayment),
    bankMovements: db.prepare(QUERIES.bankMovements).all(hid).map(serializeBankMovement),
    priorBalances: db.prepare(QUERIES.priorBalances).all(hid).map(serializePriorBalance)
  };
}

export function allHouseTrees(db, userId) {
  const houses = db
    .prepare('SELECT * FROM houses WHERE user_id = ? ORDER BY created_at ASC, id ASC')
    .all(userId);
  return houses.map((h) => houseTree(db, h));
}
