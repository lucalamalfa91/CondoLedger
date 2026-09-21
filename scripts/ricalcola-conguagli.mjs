#!/usr/bin/env node
/**
 * Rimette a posto i conguagli già riportati con la formula sbagliata.
 *
 * Il lavoro vero sta in `server/ricalcola-conguagli.js`, perché lo stesso
 * ricalcolo serve anche all'avvio, sugli host dove una shell non c'è. Qui c'è
 * solo il terminale: leggere gli argomenti e raccontare cosa succede.
 *
 * Di suo non scrive niente: stampa quello che cambierebbe e si ferma. Per
 * scrivere davvero serve dirglielo:
 *
 *   npm run ricalcola-conguagli            → prova a vuoto, non tocca niente
 *   npm run ricalcola-conguagli -- --applica  → scrive, in una transazione sola
 *
 * Prima di applicare conviene avere un backup: dall'app, Impostazioni → Backup.
 */
import { closeDb, getDb } from '../server/db.js';
import {
  applicaConguagli,
  descriviDatabase,
  esaminaConguagli,
  euro,
  righeCorrezione
} from '../server/ricalcola-conguagli.js';

const APPLICA = process.argv.includes('--applica');
const cifre = (n) => `${n} ${n === 1 ? 'cifra' : 'cifre'}`;

async function main() {
  console.log(`Database: ${descriviDatabase()}\n`);
  const db = await getDb();
  const { saldi, daCorreggere, saltati } = await esaminaConguagli(db);

  if (!saldi.length) {
    console.log('Nessun saldo riportato in questo database: non c’è niente da ricalcolare.');
    if (!process.env.TURSO_DATABASE_URL) {
      console.log('Attenzione: stai lavorando su un file locale. Per i dati veri servono');
      console.log('TURSO_DATABASE_URL e TURSO_AUTH_TOKEN nell’ambiente.');
    }
    return;
  }

  console.log(`Saldi riportati trovati: ${saldi.length}\n`);

  if (saltati.length) {
    console.log('Lasciati come sono:');
    for (const s of saltati) console.log(`  ${s.casa} · ${s.anno}: ${euro(s.amount)} — ${s.perche}`);
    console.log('');
  }

  if (!daCorreggere.length) {
    console.log('Nessuna cifra da correggere.');
    return;
  }

  console.log('Da correggere:');
  for (const c of daCorreggere) for (const riga of righeCorrezione(c)) console.log(riga);

  if (!APPLICA) {
    console.log(`\n${cifre(daCorreggere.length)} da correggere. Prova a vuoto: non ho scritto niente.`);
    console.log('Per applicare: npm run ricalcola-conguagli -- --applica');
    return;
  }

  const { rateAggiornate } = await applicaConguagli(db, daCorreggere, console.log);
  console.log(`\nFatto: ${daCorreggere.length} ${daCorreggere.length === 1 ? 'saldo corretto' : 'saldi corretti'}${rateAggiornate ? `, ${rateAggiornate} ${rateAggiornate === 1 ? 'piano rate riallineato' : 'piani rate riallineati'}` : ''}.`);
}

try {
  await main();
} finally {
  await closeDb?.();
}
