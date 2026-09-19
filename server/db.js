/**
 * Apertura e inizializzazione del database.
 *
 * Due modalità, decise dall'ambiente:
 *  - **Turso** se è impostata TURSO_DATABASE_URL: il database vive sul servizio gestito e
 *    all'applicazione non serve un disco persistente, il che la rende ospitabile su
 *    qualunque host gratuito con filesystem effimero.
 *  - **File locale** altrimenti: è la modalità usata in sviluppo e dai test, che restano
 *    veloci e senza rete.
 *
 * Si usa il pacchetto `libsql` e non `@libsql/client` perché espone la stessa API
 * sincrona di better-sqlite3 — anche verso un database remoto. È la ragione per cui
 * rotte, serializzazione e migrazione non hanno dovuto cambiare nel passaggio a Turso.
 */
import Database from 'libsql';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { config, rootDir } from './env.js';

const SCHEMA_VERSION = 1;

let db = null;

/**
 * libsql aggiunge un campo `_metadata` a ogni riga restituita. Senza toglierlo finirebbe
 * in ogni risposta JSON dell'API, perché la serializzazione fa `{...row}`.
 */
function stripMetadata(row) {
  if (row && typeof row === 'object' && '_metadata' in row) {
    delete row._metadata;
  }
  return row;
}

/** Avvolge prepare() perché nessun chiamante debba ricordarsi di ripulire le righe. */
function wrapPrepare(connection) {
  const original = connection.prepare.bind(connection);
  connection.prepare = (sql) => {
    const stmt = original(sql);
    const get = stmt.get.bind(stmt);
    const all = stmt.all.bind(stmt);
    stmt.get = (...args) => stripMetadata(get(...args));
    stmt.all = (...args) => all(...args).map(stripMetadata);
    return stmt;
  };
  return connection;
}

function applyPragmas(connection, { remote }) {
  // WAL e synchronous riguardano un file su disco: su Turso non hanno senso.
  if (!remote) {
    connection.pragma('journal_mode = WAL');
    connection.pragma('synchronous = NORMAL');
    connection.pragma('busy_timeout = 5000');
  }

  // NON è persistente nel file: va impostato su ogni connessione. Senza, tutti gli
  // ON DELETE CASCADE vengono ignorati in silenzio.
  try {
    connection.pragma('foreign_keys = ON');
  } catch (err) {
    console.warn(`[db] impossibile impostare foreign_keys: ${err.message}`);
  }

  // Verifica esplicita invece di darlo per scontato: se i vincoli non fossero applicati,
  // cancellare una casa lascerebbe righe orfane senza alcun errore.
  const value = connection.pragma('foreign_keys');
  const enabled = Array.isArray(value) ? value[0]?.foreign_keys : value?.foreign_keys ?? value;
  if (Number(enabled) !== 1) {
    console.warn(
      '\n[db] ATTENZIONE: i vincoli di chiave esterna NON risultano attivi.\n' +
        "     Le cancellazioni a cascata non funzioneranno e l'eliminazione di un\n" +
        '     immobile lascerebbe righe orfane. Verifica prima di usare in produzione.\n'
    );
  }
}

function applySchema(connection) {
  const schema = readFileSync(resolve(rootDir, 'server/schema.sql'), 'utf8');
  connection.exec(schema);

  const row = connection.prepare('SELECT version FROM schema_version LIMIT 1').get();
  if (!row) {
    connection.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  }
}

export function openDatabase() {
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  let connection;

  if (remoteUrl) {
    connection = new Database(remoteUrl, { authToken: process.env.TURSO_AUTH_TOKEN });
  } else {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    connection = new Database(config.dbPath);
  }

  wrapPrepare(connection);
  applyPragmas(connection, { remote: Boolean(remoteUrl) });
  applySchema(connection);
  return connection;
}

/** Descrive la sorgente dati per i log di avvio, senza mai stampare il token. */
export function describeDatabase() {
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  return remoteUrl ? `Turso (${remoteUrl.replace(/\?.*$/, '')})` : config.dbPath;
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
