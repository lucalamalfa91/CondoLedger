import { createApp } from './app.js';
import { maybeBootstrapUser, maybeMigrateOnBoot } from './bootstrap.js';
import { closeDb, describeDatabase, getDb } from './db.js';
import { config } from './env.js';

/**
 * Avvio come processo autonomo (sviluppo locale, o un host a container).
 * Su Vercel l'entry point è invece api/index.js, che esporta l'app come handler.
 */
const db = await getDb();

// Migrazione una-tantum da Supabase, se richiesta esplicitamente: va fatta prima di
// aprire la porta, così nessuna richiesta vede un database a metà.
await maybeMigrateOnBoot(db);

// Password del primo utente, sempre dopo la migrazione: se l'utente arriva da Supabase
// esiste già e va solo dotato di una password utilizzabile.
await maybeBootstrapUser(db);

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`CondoLedger in ascolto sulla porta ${config.port}`);
  console.log(`Database: ${describeDatabase()}`);
});

function shutdown(signal) {
  console.log(`\n${signal}: chiusura in corso...`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
