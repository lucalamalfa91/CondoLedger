/**
 * Migrazione dei dati da Supabase a SQLite.
 *
 * Vive qui e non in scripts/ perché serve a due chiamanti: la CLI
 * (scripts/migrate-supabase-to-sqlite.mjs) e il bootstrap del server, che può eseguirla
 * al primo avvio su un host dove non c'è modo di aprire una shell.
 *
 * Legge via PostgREST con la service_role key, che scavalca le policy RLS: con la anon key
 * si esporterebbero solo le righe di un utente, senza che nulla lo segnali.
 */
import { newUserId } from './auth-core.js';

const PAGE = 1000;

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} su ${url}\n${await res.text()}`);
  }
  return res.json();
}

/** Legge una tabella intera, a pagine: alcune possono superare le 1000 righe. */
async function fetchTable(table, ctx) {
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await fetchJson(
      `${ctx.supabaseUrl}/rest/v1/${table}?select=*&order=id.asc&limit=${PAGE}&offset=${offset}`,
      ctx.headers
    );
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/** auth.users non è esposta da PostgREST: si passa dall'Admin API. */
async function fetchUsers(ctx) {
  const out = [];
  for (let page = 1; ; page += 1) {
    const body = await fetchJson(
      `${ctx.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${PAGE}`,
      ctx.headers
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

export const TABLES = ['houses', 'fiscal_periods', 'dues', 'prior_balances', 'bank_movements', 'payments'];

/**
 * Esegue la migrazione. Ritorna un riepilogo dei conteggi; lancia se qualcosa non torna,
 * senza lasciare scritture a metà (tutto dentro una transazione).
 *
 * @param {object}   opts
 * @param {string}   opts.supabaseUrl
 * @param {string}   opts.serviceKey
 * @param {Database} opts.db            connessione better-sqlite3 già aperta
 * @param {boolean}  [opts.dryRun]      legge e conta senza scrivere
 * @param {Function} [opts.log]         dove scrivere il diario dell'operazione
 */
export async function migrateFromSupabase({ supabaseUrl, serviceKey, db, dryRun = false, log = console.log }) {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }

  const ctx = {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  };

  log(`Sorgente: ${ctx.supabaseUrl}`);
  if (dryRun) log('Modalità dry-run: nessuna scrittura.');

  log('Lettura da Supabase...');
  const users = await fetchUsers(ctx);
  const data = {};
  for (const t of TABLES) {
    data[t] = await fetchTable(t, ctx);
    log(`  ${t.padEnd(16)} ${data[t].length} righe`);
  }
  log(`  ${'auth.users'.padEnd(16)} ${users.length} utenti`);

  if (dryRun) {
    log('Dry-run: niente è stato scritto.');
    return { dryRun: true, read: Object.fromEntries(TABLES.map(t => [t, data[t].length])), users: users.length };
  }

  const existing = db.prepare('SELECT count(*) AS c FROM houses').get().c;
  if (existing > 0) {
    throw new Error(
      `Il database di destinazione contiene già ${existing} case. ` +
        'La migrazione va eseguita su un database vuoto.'
    );
  }

  // foreign_keys OFF durante l'import: payments.bank_movement_id e
  // bank_movements.linked_payment_id sono circolari e nessun ordine di inserimento le
  // soddisfa entrambe. L'integrità viene verificata alla fine con foreign_key_check.
  db.pragma('foreign_keys = OFF');
  try {
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
  } finally {
    db.pragma('foreign_keys = ON');
  }

  const violations = db.pragma('foreign_key_check');
  if (violations.length) {
    log(`Vincoli di integrità violati: ${JSON.stringify(violations.slice(0, 5))}`);
    throw new Error(`${violations.length} violazioni di foreign key. Il database non è integro.`);
  }

  log('Scritto in SQLite (letto → scritto):');
  const written = {};
  let mismatch = false;
  for (const t of TABLES) {
    const w = db.prepare(`SELECT count(*) AS c FROM ${t}`).get().c;
    written[t] = w;
    const ok = w === data[t].length;
    if (!ok) mismatch = true;
    log(`  ${ok ? ' ' : '!'} ${t.padEnd(16)} ${data[t].length} → ${w}`);
  }
  const writtenUsers = db.prepare('SELECT count(*) AS c FROM users').get().c;
  log(`    ${'users'.padEnd(16)} ${users.length} → ${writtenUsers}`);

  if (mismatch) throw new Error('I conteggi non coincidono: la migrazione è incompleta.');

  log('Integrità referenziale verificata, nessuna violazione.');

  return {
    dryRun: false,
    written,
    users: writtenUsers,
    emails: users.map((u) => u.email).filter(Boolean)
  };
}
