import { createApp, startSessionCleanup } from './app.js';
import { maybeMigrateOnBoot } from './bootstrap.js';
import { closeDb, getDb } from './db.js';
import { config } from './env.js';

const db = getDb(); // apre il DB e applica lo schema prima di accettare richieste

// Migrazione una-tantum da Supabase, se richiesta esplicitamente: va fatta prima di
// aprire la porta, così nessuna richiesta vede un database a metà.
await maybeMigrateOnBoot(db);

startSessionCleanup();

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`CondoLedger in ascolto sulla porta ${config.port}`);
  console.log(`Database: ${config.dbPath}`);
});

function shutdown(signal) {
  console.log(`\n${signal}: chiusura in corso...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
