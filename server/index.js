import { createApp, startSessionCleanup } from './app.js';
import { closeDb, getDb } from './db.js';
import { config } from './env.js';

getDb(); // apre il DB e applica lo schema prima di accettare richieste
startSessionCleanup();

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`CondoLedger in ascolto su http://localhost:${config.port}`);
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
