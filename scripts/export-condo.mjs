/**
 * Esporta uno snapshot condo-export-v1.
 *
 *   npm run export:condo
 *   npm run export:condo -- --out snapshot.json
 *   npm run export:condo -- --user tua@email.it --out snapshot.json
 *
 * Senza `--user` include tutte le case del database. Lo stdout è solo JSON;
 * il riepilogo va su stderr. Non scrive sul database, nemmeno in sola lettura.
 */
import { writeFileSync } from 'node:fs';

import { buildCondoExport } from '../server/condo-export.js';
import { closeDb, getDb } from '../server/db.js';

function parseArgs(argv) {
  let out = null;
  let user = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      out = argv[i + 1];
      i += 1;
      if (!out) fail('Manca il percorso dopo --out.');
    } else if (arg === '--user') {
      user = argv[i + 1];
      i += 1;
      if (!user) fail('Manca l\'email dopo --user.');
    } else if (arg === '--help' || arg === '-h') {
      console.log('Uso: npm run export:condo -- [--user email] [--out file.json]');
      process.exit(0);
    } else {
      fail(`Argomento sconosciuto: ${arg}`);
    }
  }
  return { out, user };
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

const { out, user } = parseArgs(process.argv.slice(2));
const db = await getDb();

let userId;
if (user) {
  const row = await db.prepare('SELECT id FROM users WHERE email = ?').get(user);
  if (!row) fail(`Utente non trovato: ${user}`);
  userId = row.id;
}

const snapshot = await buildCondoExport(db, userId ? { userId } : {});
const json = `${JSON.stringify(snapshot, null, 2)}\n`;
if (out) writeFileSync(out, json);
else process.stdout.write(json);

const dues = snapshot.houses.reduce((sum, house) => sum + house.dues.length, 0);
const payments = snapshot.houses.reduce((sum, house) => sum + house.payments.length, 0);
console.error(
  `condo-export-v1: ${snapshot.houses.length} case, ${dues} dovuti, ${payments} versamenti, ${snapshot.contentHash}`
);

await closeDb();
