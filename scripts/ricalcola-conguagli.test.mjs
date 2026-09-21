/**
 * Lo script che rimette a posto i conguagli già riportati, provato su dati
 * sbagliati come quelli che si trovano in banca dati.
 *
 * Ogni passaggio gira in un processo suo: `config.dbPath` si fissa quando il
 * modulo dell'ambiente viene caricato, quindi due database nello stesso
 * processo finirebbero per essere lo stesso.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import test from 'node:test';

const RADICE = new URL('..', import.meta.url).pathname;

function inProcesso(dbPath, codice) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codice], {
    cwd: RADICE, env: { ...process.env, DB_PATH: dbPath, NODE_ENV: 'test' }, encoding: 'utf8'
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout;
}

/**
 * Un database col caso reale (casa A): nel 2025/2026 si è speso 2301,64 e
 * versato 2464,37, ma 77,50 di quel versato recuperava il debito del 2024/2025,
 * che infatti sta fra i saldi riportati. Il conguaglio giusto è −85,23; quello
 * scritto in banca dati dalla formula vecchia è −162,73.
 */
function dbConIlCasoSbagliato() {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'condo-ricalcolo-')), 'prova.db');
  inProcesso(dbPath, `
    const { getDb, closeDb } = await import('./server/db.js');
    const db = await getDb();
    await db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run('u1', 'a@b.it', 'x');
    await db.prepare('INSERT INTO houses (id, user_id, name) VALUES (1, ?, ?)').run('u1', 'Il Parco');
    await db.prepare("INSERT INTO fiscal_periods (id, house_id, label, start_date, end_date) VALUES (1, 1, '2025/2026', '2025-06-01', '2026-05-31')").run();
    await db.prepare("INSERT INTO fiscal_periods (id, house_id, label, start_date, end_date) VALUES (2, 1, '2026/2027', '2026-06-01', '2027-05-31')").run();
    await db.prepare("INSERT INTO dues (house_id, fiscal_period_id, amount, description, due_kind, voice) VALUES (1, 1, 2386.87, 'Preventivo', 'preventivo', 'ordinario')").run();
    await db.prepare("INSERT INTO dues (house_id, fiscal_period_id, amount, description, due_kind) VALUES (1, 1, 2301.64, 'Consuntivo', 'consuntivo')").run();
    await db.prepare("INSERT INTO payments (house_id, fiscal_period_id, amount, date) VALUES (1, 1, 2464.37, '2026-05-31')").run();
    // Il 77,50 che l'anno di origine si era portato dietro: senza questo il
    // conguaglio verrebbe −162,73, cioè l'errore che lo script deve correggere.
    await db.prepare("INSERT INTO prior_balances (house_id, fiscal_period_id, amount, description) VALUES (1, 1, 77.50, 'Conguaglio 2024/2025')").run();
    const rate = [
      { periodStart: '2026-06-01', periodEnd: '2026-06-30', ordinario: 200, conguaglio: -162.73, straordinari: 0, amount: 37.27 },
      { periodStart: '2026-07-01', periodEnd: '2026-07-31', ordinario: 200, conguaglio: 0, straordinari: 0, amount: 200 }
    ];
    await db.prepare("INSERT INTO dues (house_id, fiscal_period_id, amount, description, split_mode, split_amounts, due_kind, voice) VALUES (1, 2, 400, 'Preventivo', 'custom', ?, 'preventivo', 'ordinario')").run(JSON.stringify(rate));
    await db.prepare("INSERT INTO prior_balances (house_id, fiscal_period_id, source_period_id, amount, description) VALUES (1, 2, 1, -162.73, 'Conguaglio 2025/2026')").run();
    await closeDb();
  `);
  return dbPath;
}

function esegui(dbPath, args = []) {
  return spawnSync(process.execPath, ['scripts/ricalcola-conguagli.mjs', ...args], {
    cwd: RADICE, env: { ...process.env, DB_PATH: dbPath, NODE_ENV: 'test' }, encoding: 'utf8'
  });
}

function leggi(dbPath) {
  return JSON.parse(inProcesso(dbPath, `
    const { getDb, closeDb } = await import('./server/db.js');
    const db = await getDb();
    const saldo = await db.prepare('SELECT amount FROM prior_balances WHERE fiscal_period_id = 2').get();
    const due = await db.prepare('SELECT split_amounts FROM dues WHERE fiscal_period_id = 2').get();
    await closeDb();
    console.log(JSON.stringify({ saldo: saldo.amount, rate: JSON.parse(due.split_amounts) }));
  `));
}

test('la prova a vuoto mostra la correzione senza scrivere niente', () => {
  const dbPath = dbConIlCasoSbagliato();
  const r = esegui(dbPath);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /-€ 162,73\s*→\s*-€ 85,23/, r.stdout);
  assert.match(r.stdout, /non ho scritto niente/);
  assert.equal(leggi(dbPath).saldo, -162.73, 'la prova a vuoto non deve toccare la banca dati');
});

test('con --applica corregge il saldo e riallinea le rate', () => {
  const dbPath = dbConIlCasoSbagliato();
  const r = esegui(dbPath, ['--applica']);
  assert.equal(r.status, 0, r.stderr);
  const dopo = leggi(dbPath);
  assert.equal(dopo.saldo, -85.23, 'il saldo riportato deve diventare consuntivo − preventivo');
  assert.equal(dopo.rate[0].conguaglio, -85.23, 'il conguaglio dentro le rate segue il saldo');
  assert.equal(dopo.rate[0].amount, 114.77, 'e il totale della rata si ricalcola');
  assert.equal(dopo.rate[1].conguaglio, 0, 'le rate senza conguaglio restano come sono');
});

test('rieseguirlo non cambia più niente', () => {
  const dbPath = dbConIlCasoSbagliato();
  esegui(dbPath, ['--applica']);
  const r = esegui(dbPath, ['--applica']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Nessuna cifra da correggere/);
  assert.equal(leggi(dbPath).saldo, -85.23);
});
