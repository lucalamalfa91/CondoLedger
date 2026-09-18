#!/usr/bin/env node
/**
 * Migrazione una-tantum dei dati da Supabase a SQLite.
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   DB_PATH=./data/condoledger.db \
 *   npm run migrate:supabase -- [--dry-run]
 *
 * Legge via PostgREST con la service_role key, che scavalca le policy RLS: senza, si
 * vedrebbero solo le righe dell'utente autenticato e la migrazione sarebbe parziale e
 * silenziosamente incompleta. La chiave sta solo nell'ambiente, mai nel repo.
 *
 * Dopo la migrazione serve `npm run set-password -- tua@email.it`: gli hash bcrypt di
 * GoTrue non sono esportabili, quindi la password va reimpostata.
 */
import { closeDb, getDb } from '../server/db.js';
import { newUserId } from '../server/auth-core.js';

const DRY_RUN = process.argv.includes('--dry-run');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PAGE = 1000;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nell\'ambiente.');
  console.error('Le trovi in Supabase → Project Settings → API (service_role, non anon).');
  process.exit(1);
}

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} su ${url}\n${await res.text()}`);
  }
  return res.json();
}

/** Legge una tabella intera, a pagine: alcune possono superare le 1000 righe. */
async function fetchTable(table) {
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await fetchJson(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc&limit=${PAGE}&offset=${offset}`
    );
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/** auth.users non è esposta da PostgREST: si passa dall'Admin API. */
async function fetchUsers() {
  const out = [];
  for (let page = 1; ; page += 1) {
    const body = await fetchJson(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${PAGE}`
    );
    const users = Array.isArray(body) ? body : (body.users ?? []);
    out.push(...users);
    if (users.length < PAGE) break;
  }
  return out;
}

// --- conversioni ----------------------------------------------------------

/**
 * PostgREST serializza numeric come STRINGA ("1234.56"), non come numero: senza questa
 * conversione finirebbe una stringa in una colonna REAL.
 */
const num = (v) => (v === null || v === undefined ? null : Number(v));
const bool = (v) => (v ? 1 : 0);
const json = (v) => (v === null || v === undefined ? null : JSON.stringify(v));

/** timestamptz arriva come 2026-05-28T10:00:00.123456+00:00: si normalizza al formato dello schema. */
function ts(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const TABLES = ['houses', 'fiscal_periods', 'dues', 'prior_balances', 'bank_movements', 'payments'];

async function main() {
  console.log(`Sorgente: ${SUPABASE_URL}`);
  console.log(DRY_RUN ? 'Modalità --dry-run: nessuna scrittura.\n' : '');

  console.log('Lettura da Supabase...');
  const users = await fetchUsers();
  const data = {};
  for (const t of TABLES) {
    data[t] = await fetchTable(t);
    console.log(`  ${t.padEnd(16)} ${data[t].length} righe`);
  }
  console.log(`  ${'auth.users'.padEnd(16)} ${users.length} utenti`);

  if (DRY_RUN) {
    console.log('\n--dry-run: niente è stato scritto.');
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT count(*) AS c FROM houses').get().c;
  if (existing > 0) {
    throw new Error(
      `Il database di destinazione contiene già ${existing} case. ` +
        'La migrazione va eseguita su un database vuoto: cancella il file .db e riprova.'
    );
  }

  // foreign_keys OFF durante l'import: payments.bank_movement_id e
  // bank_movements.linked_payment_id sono circolari e nessun ordine di inserimento le
  // soddisfa entrambe. L'integrità viene verificata alla fine con foreign_key_check.
  db.pragma('foreign_keys = OFF');

  const run = db.transaction(() => {
    for (const u of users) {
      db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
        u.id || newUserId(),
        u.email,
        // Gli hash bcrypt di GoTrue non sono riutilizzabili: password da reimpostare.
        'da-reimpostare',
        ts(u.created_at) || new Date().toISOString()
      );
    }

    for (const h of data.houses) {
      db.prepare(
        `INSERT INTO houses (id, user_id, name, location, notes, fiscal_start_month,
                             import_parties, calendar_reminder_cadence,
                             calendar_reminder_lead_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        h.id,
        h.user_id,
        h.name,
        h.location,
        h.notes,
        h.fiscal_start_month ?? 6,
        json(h.import_parties) ?? '[]',
        h.calendar_reminder_cadence || 'monthly',
        h.calendar_reminder_lead_days ?? 3,
        ts(h.created_at)
      );
    }

    for (const p of data.fiscal_periods) {
      db.prepare(
        `INSERT INTO fiscal_periods (id, house_id, label, start_date, end_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(p.id, p.house_id, p.label, p.start_date, p.end_date, ts(p.created_at));
    }

    for (const d of data.dues) {
      db.prepare(
        `INSERT INTO dues (id, house_id, fiscal_period_id, amount, description, split_mode,
                           split_custom, split_amounts, due_kind, carry_from_period_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        d.id,
        d.house_id,
        d.fiscal_period_id,
        num(d.amount),
        d.description,
        d.split_mode || 'monthly',
        json(d.split_custom),
        json(d.split_amounts),
        d.due_kind || 'preventivo',
        d.carry_from_period_id ?? null,
        ts(d.created_at)
      );
    }

    for (const b of data.prior_balances) {
      db.prepare(
        `INSERT INTO prior_balances (id, house_id, fiscal_period_id, source_period_id, amount,
                                     description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        b.id,
        b.house_id,
        b.fiscal_period_id,
        b.source_period_id ?? null,
        num(b.amount),
        b.description,
        ts(b.created_at)
      );
    }

    for (const m of data.bank_movements) {
      db.prepare(
        `INSERT INTO bank_movements (id, house_id, import_batch_id, movement_date, operation,
                                     details, amount, currency, source_hash, fiscal_period_id,
                                     suggested_fiscal_period_id, match_confidence, match_reason,
                                     linked_payment_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        m.id,
        m.house_id,
        m.import_batch_id,
        m.movement_date,
        m.operation,
        m.details,
        num(m.amount),
        m.currency || 'EUR',
        m.source_hash,
        m.fiscal_period_id ?? null,
        m.suggested_fiscal_period_id ?? null,
        num(m.match_confidence),
        m.match_reason,
        m.linked_payment_id ?? null,
        m.status || 'unlinked',
        ts(m.created_at)
      );
    }

    for (const p of data.payments) {
      db.prepare(
        `INSERT INTO payments (id, house_id, fiscal_period_id, amount, date, method,
                               installment_key, carry_from_period_id, is_carry_forward,
                               prior_balance_id, bank_movement_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        p.id,
        p.house_id,
        p.fiscal_period_id,
        num(p.amount),
        p.date,
        p.method,
        p.installment_key ?? null,
        p.carry_from_period_id ?? null,
        bool(p.is_carry_forward),
        p.prior_balance_id ?? null,
        p.bank_movement_id ?? null,
        ts(p.created_at)
      );
    }

    // Gli id sono stati inseriti espliciti: senza riallineare le sequenze, il primo
    // inserimento fatto dall'applicazione collide con una riga esistente.
    //
    // Va fatto con UPDATE e non con INSERT OR REPLACE: sqlite_sequence non ha un vincolo
    // unique su `name`, quindi OR REPLACE non sostituisce la riga, ne aggiunge una seconda
    // e la tabella resta con due valori per lo stesso nome.
    for (const t of TABLES) {
      const max = db.prepare(`SELECT COALESCE(MAX(id), 0) AS m FROM ${t}`).get().m;
      const updated = db
        .prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?')
        .run(max, t).changes;
      if (updated === 0) {
        db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(t, max);
      }
    }
  });

  run();
  db.pragma('foreign_keys = ON');

  const violations = db.pragma('foreign_key_check');
  if (violations.length) {
    console.error('\nVincoli di integrità violati dopo la migrazione:');
    console.error(violations.slice(0, 10));
    throw new Error(`${violations.length} violazioni di foreign key. Il database non è integro.`);
  }

  console.log('\nScritto in SQLite (letto → scritto):');
  let mismatch = false;
  for (const t of TABLES) {
    const written = db.prepare(`SELECT count(*) AS c FROM ${t}`).get().c;
    const read = data[t].length;
    const ok = written === read;
    if (!ok) mismatch = true;
    console.log(`  ${ok ? ' ' : '!'} ${t.padEnd(16)} ${read} → ${written}`);
  }
  const writtenUsers = db.prepare('SELECT count(*) AS c FROM users').get().c;
  console.log(`    ${'users'.padEnd(16)} ${users.length} → ${writtenUsers}`);

  if (mismatch) throw new Error('I conteggi non coincidono: la migrazione è incompleta.');

  console.log('\nIntegrità referenziale verificata, nessuna violazione.');
  console.log('\nUltimo passo obbligatorio — le password non sono migrabili:');
  for (const u of users) console.log(`  npm run set-password -- ${u.email}`);
}

try {
  await main();
} catch (err) {
  console.error(`\nMigrazione interrotta: ${err.message}`);
  process.exitCode = 1;
} finally {
  closeDb();
}
