/**
 * Apertura e inizializzazione del database SQLite.
 *
 * better-sqlite3 è sincrono: ogni query ritorna direttamente il risultato. Questo rende
 * naturale l'uso di db.transaction(), ma impone una regola: dentro il corpo di una
 * transazione non ci deve mai essere un `await`, altrimenti l'atomicità salta in silenzio.
 */
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { config, rootDir } from './env.js';

const SCHEMA_VERSION = 1;

let db = null;

function applyPragmas(connection) {
  // WAL: letture concorrenti mentre una scrittura è in corso.
  connection.pragma('journal_mode = WAL');
  // NON è persistente nel file: va impostato su ogni connessione. Senza, tutti gli
  // ON DELETE CASCADE vengono ignorati in silenzio.
  connection.pragma('foreign_keys = ON');
  // Evita SQLITE_BUSY immediato quando due scritture si accavallano.
  connection.pragma('busy_timeout = 5000');
  // Sicuro in combinazione con WAL, molto più veloce di FULL.
  connection.pragma('synchronous = NORMAL');
}

function applySchema(connection) {
  const schema = readFileSync(resolve(rootDir, 'server/schema.sql'), 'utf8');
  connection.exec(schema);

  const row = connection.prepare('SELECT version FROM schema_version LIMIT 1').get();
  if (!row) {
    connection.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  }
}

export function openDatabase(dbPath = config.dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const connection = new Database(dbPath);
  applyPragmas(connection);
  applySchema(connection);
  return connection;
}

export function getDb() {
  if (!db) db = openDatabase();
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/** Arrotonda a 2 decimali, come faceva implicitamente il cast a numeric(12,2) in Postgres. */
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/** Serializza una colonna JSON (jsonb in Postgres). `null`/`undefined` restano NULL. */
export function toJsonColumn(value) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

/**
 * Deserializza una colonna JSON prima di rispondere al client.
 * Serve perché mapHouseFromDb() in js/state.js fa `Array.isArray(d.split_custom)`:
 * riceverne la stringa grezza romperebbe il mapping in silenzio.
 */
export function fromJsonColumn(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Timestamp nello stesso formato del default dello schema (ISO-8601 con Z). */
export function nowIso() {
  return new Date().toISOString();
}
