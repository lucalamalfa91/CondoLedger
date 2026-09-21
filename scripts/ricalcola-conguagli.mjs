#!/usr/bin/env node
/**
 * Rimette a posto i conguagli già riportati con la formula sbagliata.
 *
 * Fino alla correzione il conguaglio di un anno veniva calcolato come
 * `consuntivo − versato`. Nel versato però possono esserci quote di recupero di
 * conguagli di anni passati, e le rate ancora scoperte: roba che non dice niente
 * su quanto il condominio ha speso rispetto al preventivo. Il conguaglio giusto
 * è `consuntivo − preventivo`, e i saldi già scritti in banca dati vanno
 * riportati a quel valore.
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

const APPLICA = process.argv.includes('--applica');

/** Importo all'italiana, senza dipendere dai dati locali di Node. */
const euro = (n) => {
  const [intero, dec] = Math.abs(Number(n || 0)).toFixed(2).split('.');
  const migliaia = intero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${Number(n) < 0 ? '-' : ''}€ ${migliaia},${dec}`;
};
const cifre = (n) => `${n} ${n === 1 ? 'cifra' : 'cifre'}`;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/** Il totale di un tipo di dovuto in un anno. */
async function somma(db, periodId, dueKind) {
  const row = await db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS tot FROM dues WHERE fiscal_period_id = ? AND due_kind = ?')
    .get(periodId, dueKind);
  return round2(row?.tot ?? 0);
}

/**
 * Il conguaglio finito dentro le rate dell'anno che lo riceve. Se c'era, va
 * riscalato insieme al saldo, altrimenti il piano rate non torna più con il
 * totale e l'app segnala una differenza che non esiste.
 */
function riscalaRate(splitAmounts, vecchio, nuovo) {
  const rows = JSON.parse(splitAmounts);
  if (!Array.isArray(rows)) return null;
  const allocato = round2(rows.reduce((s, r) => s + Number(r.conguaglio || 0), 0));
  if (Math.abs(allocato) < 0.005) return null;            // niente nelle rate: non c'è da toccare
  if (Math.abs(allocato - vecchio) > 0.01) return null;   // allocazione parziale o ritoccata a mano: non ci mettiamo le mani

  const fattore = vecchio === 0 ? 0 : nuovo / vecchio;
  let resto = round2(nuovo);
  const toccate = rows.filter(r => Math.abs(Number(r.conguaglio || 0)) > 0.005);
  const aggiornate = rows.map(r => {
    if (Math.abs(Number(r.conguaglio || 0)) < 0.005) return r;
    const ultima = r === toccate[toccate.length - 1];
    // L'ultima rata si prende il resto degli arrotondamenti, così la somma torna esatta.
    const quota = ultima ? resto : round2(Number(r.conguaglio) * fattore);
    resto = round2(resto - quota);
    return { ...r, conguaglio: quota, amount: round2(Number(r.ordinario || 0) + quota + Number(r.straordinari || 0)) };
  });
  return { allocato, rows: aggiornate };
}

/**
 * Su quale database stiamo lavorando. Senza questa riga uno strumento del
 * genere è pericoloso: se le credenziali non ci sono, il client ricade su un
 * file locale vuoto e risponde «non c'è niente da ricalcolare» — che a leggerlo
 * di fretta sembra «fatto, tutto a posto».
 */
function descriviDatabase() {
  const remoto = process.env.TURSO_DATABASE_URL;
  if (remoto) return `Turso · ${remoto.replace(/\?.*$/, '')}`;
  return `file locale · ${process.env.DB_PATH || './data/condoledger.db'}`;
}

async function main() {
  console.log(`Database: ${descriviDatabase()}\n`);
  const db = await getDb();

  const saldi = await db.prepare(`
    SELECT pb.id, pb.house_id, pb.fiscal_period_id, pb.source_period_id, pb.amount, pb.description,
           h.name       AS casa,
           fp.label     AS anno,
           src.label    AS anno_origine
      FROM prior_balances pb
      JOIN houses h         ON h.id  = pb.house_id
      JOIN fiscal_periods fp ON fp.id = pb.fiscal_period_id
      LEFT JOIN fiscal_periods src ON src.id = pb.source_period_id
     ORDER BY h.name, fp.label
  `).all();

  if (!saldi.length) {
    console.log('Nessun saldo riportato in questo database: non c’è niente da ricalcolare.');
    if (!process.env.TURSO_DATABASE_URL) {
      console.log('Attenzione: stai lavorando su un file locale. Per i dati veri servono');
      console.log('TURSO_DATABASE_URL e TURSO_AUTH_TOKEN nell’ambiente.');
    }
    return;
  }

  const daCorreggere = [];
  const saltati = [];

  for (const s of saldi) {
    if (!s.source_period_id) {
      saltati.push({ ...s, perche: 'non dice da quale anno arriva' });
      continue;
    }
    const consuntivo = await somma(db, s.source_period_id, 'consuntivo');
    if (consuntivo === 0) {
      saltati.push({ ...s, perche: `il ${s.anno_origine} non ha un consuntivo` });
      continue;
    }
    const preventivo = await somma(db, s.source_period_id, 'preventivo');
    const nuovo = round2(consuntivo - preventivo);
    const vecchio = round2(s.amount);
    if (Math.abs(nuovo - vecchio) < 0.005) {
      saltati.push({ ...s, perche: 'già corretto' });
      continue;
    }
    daCorreggere.push({ ...s, vecchio, nuovo, consuntivo, preventivo });
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
  for (const c of daCorreggere) {
    console.log(`  ${c.casa} · ${c.anno}  (conguaglio del ${c.anno_origine})`);
    console.log(`      consuntivo ${euro(c.consuntivo)} − preventivo ${euro(c.preventivo)}`);
    console.log(`      ${euro(c.vecchio)}  →  ${euro(c.nuovo)}`);
  }

  if (!APPLICA) {
    console.log(`\n${cifre(daCorreggere.length)} da correggere. Prova a vuoto: non ho scritto niente.`);
    console.log('Per applicare: npm run ricalcola-conguagli -- --applica');
    return;
  }

  let rateAggiornate = 0;
  const esegui = db.transaction(async (tx) => {
    for (const c of daCorreggere) {
      await tx.prepare('UPDATE prior_balances SET amount = ? WHERE id = ?').run(c.nuovo, c.id);

      // Se il conguaglio era stato messo dentro le rate, va riscalato con lui.
      const due = await tx.prepare(`
        SELECT id, split_amounts FROM dues
         WHERE fiscal_period_id = ? AND due_kind = 'preventivo'
           AND (voice IS NULL OR voice <> 'straordinario')
           AND split_amounts IS NOT NULL
         ORDER BY id LIMIT 1
      `).get(c.fiscal_period_id);
      if (!due?.split_amounts) continue;
      const riscalate = riscalaRate(due.split_amounts, c.vecchio, c.nuovo);
      if (!riscalate) continue;
      await tx.prepare('UPDATE dues SET split_amounts = ? WHERE id = ?')
        .run(JSON.stringify(riscalate.rows), due.id);
      rateAggiornate += 1;
      console.log(`  piano rate del ${c.anno}: conguaglio nelle rate ${euro(riscalate.allocato)} → ${euro(c.nuovo)}`);
    }
  });
  await esegui();

  console.log(`\nFatto: ${daCorreggere.length} ${daCorreggere.length === 1 ? 'saldo corretto' : 'saldi corretti'}${rateAggiornate ? `, ${rateAggiornate} ${rateAggiornate === 1 ? 'piano rate riallineato' : 'piani rate riallineati'}` : ''}.`);
}

try {
  await main();
} finally {
  await closeDb?.();
}
