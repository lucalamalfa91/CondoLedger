/**
 * Accesso al database, su Turso.
 *
 * Si usa `@libsql/client/web` — il trasporto puramente HTTP — perché l'app gira su
 * funzioni serverless Vercel, dove i moduli nativi non sono utilizzabili. Il prezzo è che
 * l'API è **asincrona**, a differenza di better-sqlite3 da cui si proviene.
 *
 * Per non riscrivere la forma di un centinaio di query, qui sotto c'è un adattatore sottile
 * che conserva l'interfaccia `prepare(sql).get()/.all()/.run()`: ai chiamanti serve solo
 * aggiungere `await`. È deliberato: mantiene le query leggibili e il diff rivedibile.
 *
 * In locale e nei test si usa un file (`file:./data/...`) tramite il client Node, così
 * non serve rete. In produzione basta TURSO_DATABASE_URL.
 */
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { config, rootDir } from './env.js';

const SCHEMA_VERSION = 1;

let db = null;
let schemaReady = null;

/**
 * libsql rifiuta `undefined` e i booleani: vanno normalizzati prima di ogni chiamata,
 * altrimenti l'errore arriva a runtime e solo su certe rotte.
 */
function normalizeArgs(args) {
  return args.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
}

/** `lastInsertRowid` arriva come BigInt: i chiamanti si aspettano un numero. */
function normalizeResult(rs) {
  return {
    changes: Number(rs.rowsAffected ?? 0),
    lastInsertRowid: rs.lastInsertRowid === undefined ? undefined : Number(rs.lastInsertRowid)
  };
}

/**
 * Avvolge un esecutore (il client, oppure una transazione aperta) nell'interfaccia
 * prepare()/exec() che il resto del server già usa.
 */
function wrapExecutor(executor) {
  return {
    prepare(sql) {
      return {
        async get(...args) {
          const rs = await executor.execute({ sql, args: normalizeArgs(args) });
          return rs.rows[0] ? { ...rs.rows[0] } : undefined;
        },
        async all(...args) {
          const rs = await executor.execute({ sql, args: normalizeArgs(args) });
          return rs.rows.map((r) => ({ ...r }));
        },
        async run(...args) {
          return normalizeResult(await executor.execute({ sql, args: normalizeArgs(args) }));
        }
      };
    },

    async exec(sql) {
      await executor.executeMultiple(sql);
    },

    /** Come `PRAGMA x` in SQLite, ma asincrono. Ritorna la prima riga. */
    async pragma(statement) {
      const rs = await executor.execute(`PRAGMA ${statement}`);
      return rs.rows.map((r) => ({ ...r }));
    }
  };
}

async function createConnection() {
  const remoteUrl = process.env.TURSO_DATABASE_URL;

  if (remoteUrl) {
    // Import statico del solo trasporto HTTP: è ciò che rende il bundle serverless valido.
    const { createClient } = await import('@libsql/client/web');
    return createClient({ url: remoteUrl, authToken: process.env.TURSO_AUTH_TOKEN });
  }

  // Sviluppo e test: file locale, nessuna rete. Il client Node non finisce mai nel
  // bundle di produzione perché questo ramo non viene raggiunto quando c'è l'URL Turso.
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const { createClient } = await import('@libsql/client');
  return createClient({ url: `file:${config.dbPath}` });
}

/**
 * Colonne aggiunte dopo il consolidamento dello schema.
 *
 * `CREATE TABLE IF NOT EXISTS` non tocca le tabelle già esistenti, quindi una colonna nuova
 * va aggiunta a parte: qui, leggendo prima `PRAGMA table_info` così l'operazione è ripetibile
 * a ogni avvio senza errori (SQLite non ha `ADD COLUMN IF NOT EXISTS`).
 */
const ADDED_COLUMNS = [
  { table: 'payments', column: 'note', definition: 'TEXT' },
  { table: 'dues', column: 'voice', definition: 'TEXT' }
];

async function applyAddedColumns(handle) {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const columns = await handle.pragma(`table_info(${table})`);
    if (columns.some((c) => c.name === column)) continue;
    await handle.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function applySchema(handle) {
  await handle.exec(readFileSync(resolve(rootDir, 'server/schema.sql'), 'utf8'));
  await applyAddedColumns(handle);
  const row = await handle.prepare('SELECT version FROM schema_version LIMIT 1').get();
  if (!row) {
    await handle.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  }
}

/**
 * Apre la connessione e applica lo schema una volta sola per istanza.
 *
 * In serverless ogni cold start ha il proprio processo: `schemaReady` fa sì che lo schema
 * venga applicato una volta per istanza, non a ogni richiesta. Le istruzioni sono
 * comunque `IF NOT EXISTS`, quindi riapplicarle è innocuo.
 */
export async function getDb() {
  if (db) {
    await schemaReady;
    return db;
  }

  const client = await createConnection();
  const handle = wrapExecutor(client);

  handle.client = client;

  /**
   * Transazione. Il callback riceve un handle legato alla transazione: le query vanno
   * eseguite su quello, non sul database globale, altrimenti uscirebbero dalla transazione.
   */
  handle.transaction = (fn) => async (...args) => {
    const tx = await client.transaction('write');
    try {
      const result = await fn(wrapExecutor(tx), ...args);
      await tx.commit();
      return result;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        /* la transazione può essere già chiusa: l'errore originale è più utile */
      }
      throw err;
    }
  };

  db = handle;
  schemaReady = applySchema(handle);
  await schemaReady;
  return db;
}

/** Descrive la sorgente dati per i log, senza mai stampare il token. */
export function describeDatabase() {
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  return remoteUrl ? `Turso (${remoteUrl.replace(/\?.*$/, '')})` : `file locale (${config.dbPath})`;
}

export async function closeDb() {
  if (db) {
    try {
      db.client?.close?.();
    } catch {
      /* ignore */
    }
    db = null;
    schemaReady = null;
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
