#!/usr/bin/env node
/**
 * Migrazione una-tantum dei dati da Supabase a SQLite, da riga di comando.
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   DB_PATH=./data/condoledger.db \
 *   npm run migrate:supabase -- [--dry-run]
 *
 * La logica vive in server/migrate-from-supabase.js perché la condivide con il bootstrap
 * del server, che può eseguire la stessa migrazione al primo avvio su un host dove non
 * c'è modo di aprire una shell.
 *
 * Attenzione su Railway e simili: `railway run` esegue il comando sul TUO computer con le
 * variabili remote, quindi scriverebbe un .db locale che non arriva mai sul volume. Per
 * migrare sul volume serve una shell nel container (`railway ssh`) oppure la migrazione
 * all'avvio (MIGRATE_FROM_SUPABASE=true).
 */
import { closeDb, getDb } from '../server/db.js';
import { migrateFromSupabase } from '../server/migrate-from-supabase.js';

const dryRun = process.argv.includes('--dry-run');

try {
  const result = await migrateFromSupabase({
    supabaseUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    db: await getDb(),
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
