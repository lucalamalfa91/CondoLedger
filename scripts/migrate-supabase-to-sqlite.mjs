#!/usr/bin/env node
/**
 * Migrazione una-tantum dei dati da Supabase a SQLite, da riga di comando.
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   TURSO_DATABASE_URL=libsql://xxxx.turso.io \
 *   TURSO_AUTH_TOKEN=... \
 *   npm run migrate:supabase -- [--dry-run]
 *
 * Con TURSO_DATABASE_URL impostata la scrittura va direttamente sul database remoto: lo
 * script gira sul tuo computer ma i dati finiscono su Turso, quindi non serve una shell
 * sull'host. Senza quella variabile scrive nel file locale DB_PATH.
 *
 * Il primo output dice dove sta scrivendo: è il controllo che evita di migrare per errore
 * in un file locale credendo di aver popolato il database di produzione.
 *
 * La logica vive in server/migrate-from-supabase.js perché la condivide con il bootstrap
 * del server, che può eseguire la stessa migrazione al primo avvio (MIGRATE_FROM_SUPABASE=true)
 * su un host dove non c'è modo di aprire una shell.
 */
import { closeDb, describeDatabase, getDb } from '../server/db.js';
import { migrateFromSupabase } from '../server/migrate-from-supabase.js';

const dryRun = process.argv.includes('--dry-run');

try {
  const db = await getDb();
  console.log(`Destinazione: ${describeDatabase()}\n`);

  const result = await migrateFromSupabase({
    supabaseUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    db,
    dryRun
  });

  if (!result.dryRun) {
    console.log('\nUltimo passo obbligatorio — le password non sono migrabili:');
    for (const email of result.emails) console.log(`  npm run set-password -- ${email}`);
  }
} catch (err) {
  console.error(`\nMigrazione interrotta: ${err.message}`);
  if (/SUPABASE_URL|SERVICE_ROLE/.test(err.message)) {
    console.error('Le trovi in Supabase → Project Settings → API (service_role, non anon).');
  }
  process.exitCode = 1;
} finally {
  await closeDb();
}
