/**
 * Migrazione dei dati all'avvio, per host dove non c'è modo di aprire una shell.
 *
 * Si attiva solo con MIGRATE_FROM_SUPABASE=true ed è pensata per essere usata una volta
 * sola: si impostano le tre variabili nel pannello dell'host, si lascia partire il deploy,
 * si controlla il diario nei log, e poi si rimuovono. Tre reti di sicurezza la rendono
 * innocua se una variabile resta impostata per distrazione:
 *
 *  - non parte se il database contiene già delle case;
 *  - scrive dentro una transazione, quindi o entra tutto o non entra niente;
 *  - se fallisce lascia il database vuoto e il server parte comunque, perché un'app che
 *    non si avvia affatto è più difficile da diagnosticare di un'app vuota con i log in
 *    bella vista.
 */
import { hashPassword, newUserId } from './auth-core.js';
import { migrateFromSupabase } from './migrate-from-supabase.js';
import { applicaConguagli, esaminaConguagli, euro, righeCorrezione } from './ricalcola-conguagli.js';

const RULE = '─'.repeat(72);

function banner(lines) {
  console.log(`\n${RULE}`);
  for (const l of lines) console.log(l);
  console.log(`${RULE}\n`);
}

export async function maybeMigrateOnBoot(db) {
  if (process.env.MIGRATE_FROM_SUPABASE !== 'true') return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    banner([
      'MIGRAZIONE NON ESEGUITA',
      '',
      'MIGRATE_FROM_SUPABASE=true ma mancano SUPABASE_URL e/o',
      'SUPABASE_SERVICE_ROLE_KEY. Le trovi in Supabase →',
      'Project Settings → API: serve la service_role, non la anon.'
    ]);
    return;
  }

  const { c: houses } = await db.prepare('SELECT count(*) AS c FROM houses').get();
  if (houses > 0) {
    banner([
      'MIGRAZIONE SALTATA',
      '',
      `Il database contiene già ${houses} case: non viene toccato.`,
      'Se la migrazione è andata a buon fine, rimuovi ora le variabili',
      'MIGRATE_FROM_SUPABASE, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'
    ]);
    return;
  }

  console.log(`\n${RULE}\nMIGRAZIONE DA SUPABASE — avvio\n${RULE}`);

  try {
    const result = await migrateFromSupabase({ supabaseUrl, serviceKey, db });
    banner([
      'MIGRAZIONE COMPLETATA',
      '',
      'Prossimi passi, in quest\'ordine:',
      '',
      ' 1. Imposta una password per ogni utente — gli hash di Supabase',
      '    non sono esportabili, quindi nessuno può ancora accedere:',
      ...result.emails.map((e) => `       npm run set-password -- ${e}`),
      '',
      ' 2. Rimuovi le variabili MIGRATE_FROM_SUPABASE, SUPABASE_URL e',
      '    SUPABASE_SERVICE_ROLE_KEY dalle impostazioni dell\'host.',
      '',
      ' 3. Verifica i saldi in Situazione: devono coincidere al centesimo',
      '    con quelli che vedi oggi su Supabase.'
    ]);
  } catch (err) {
    // Non si interrompe l'avvio: la transazione ha già fatto rollback, il database è
    // vuoto e non corrotto. Un server che parte lascia leggere i log e riprovare.
    banner([
      'MIGRAZIONE FALLITA — il database è rimasto vuoto',
      '',
      err.message,
      '',
      'Nulla è stato scritto a metà: la migrazione è transazionale.',
      'Correggi la causa e riavvia il servizio per riprovare.'
    ]);
  }
}

/**
 * Imposta la password di un utente all'avvio, creandolo se non esiste.
 *
 * Serve sugli host dove non si può aprire una shell: senza questo, dopo la migrazione
 * nessuno potrebbe accedere, perché gli hash di Supabase non sono riutilizzabili e
 * `npm run set-password` richiede un terminale.
 *
 * Come la migrazione, è pensata per essere usata una volta e poi rimossa. Non viene mai
 * registrata la password nei log, solo l'indirizzo.
 */
export async function maybeBootstrapUser(db) {
  const email = (process.env.BOOTSTRAP_USER_EMAIL || '').trim();
  const password = process.env.BOOTSTRAP_USER_PASSWORD || '';

  if (!email && !password) return;

  if (!email || !password) {
    banner([
      'UTENTE NON CONFIGURATO',
      '',
      'Servono entrambe BOOTSTRAP_USER_EMAIL e BOOTSTRAP_USER_PASSWORD.'
    ]);
    return;
  }

  if (password.length < 6) {
    banner([
      'UTENTE NON CONFIGURATO',
      '',
      'La password deve avere almeno 6 caratteri.'
    ]);
    return;
  }

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  if (existing) {
    await db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(password), existing.id);
    // Come il cambio password dall'app: le sessioni aperte decadono.
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
    banner([
      `PASSWORD AGGIORNATA per ${email}`,
      '',
      'Ora puoi accedere. Rimuovi subito BOOTSTRAP_USER_EMAIL e',
      'BOOTSTRAP_USER_PASSWORD dalle variabili dell\'host.'
    ]);
    return;
  }

  await db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(
    newUserId(),
    email,
    hashPassword(password)
  );
  banner([
    `UTENTE CREATO: ${email}`,
    '',
    'Ora puoi accedere. Rimuovi subito BOOTSTRAP_USER_EMAIL e',
    'BOOTSTRAP_USER_PASSWORD dalle variabili dell\'host.'
  ]);
}

/**
 * Il ricalcolo dei conguagli all'avvio, per gli stessi host senza shell.
 *
 * Fa quello che fa `npm run ricalcola-conguagli`, con le stesse due marce:
 *
 *   RICALCOLA_CONGUAGLI=true      → guarda e basta, scrive il diario nei log
 *   RICALCOLA_CONGUAGLI=applica   → corregge, in una transazione sola
 *
 * A differenza della migrazione qui non serve una rete di sicurezza che lo
 * fermi al secondo giro: il ricalcolo è idempotente per costruzione, perché
 * ricava il valore giusto dai dati e non dal valore che trova. Rieseguirlo su
 * un database già corretto non trova niente da fare e lo dice.
 */
export async function maybeRicalcolaConguagliOnBoot(db) {
  const modo = (process.env.RICALCOLA_CONGUAGLI || '').trim().toLowerCase();
  if (modo !== 'true' && modo !== 'applica') return;
  const applica = modo === 'applica';

  try {
    const { saldi, daCorreggere, saltati } = await esaminaConguagli(db);

    if (!saldi.length) {
      banner(['RICALCOLO CONGUAGLI', '', 'Nessun saldo riportato: non c\'è niente da ricalcolare.']);
      return;
    }

    const diario = [
      applica ? 'RICALCOLO CONGUAGLI — applicato' : 'RICALCOLO CONGUAGLI — prova a vuoto',
      '',
      `Saldi riportati trovati: ${saldi.length}`
    ];
    if (saltati.length) {
      diario.push('', 'Lasciati come sono:');
      for (const s of saltati) diario.push(`  ${s.casa} · ${s.anno}: ${euro(s.amount)} — ${s.perche}`);
    }

    if (!daCorreggere.length) {
      diario.push('', 'Nessuna cifra da correggere.', '', 'Puoi rimuovere RICALCOLA_CONGUAGLI dalle variabili dell\'host.');
      banner(diario);
      return;
    }

    diario.push('', 'Da correggere:');
    for (const c of daCorreggere) diario.push(...righeCorrezione(c));

    if (!applica) {
      diario.push('', 'Non ho scritto niente. Per applicare davvero:',
        'RICALCOLA_CONGUAGLI=applica');
      banner(diario);
      return;
    }

    const { rateAggiornate } = await applicaConguagli(db, daCorreggere, (riga) => diario.push(riga));
    diario.push('',
      `Fatto: ${daCorreggere.length} ${daCorreggere.length === 1 ? 'saldo corretto' : 'saldi corretti'}` +
      `${rateAggiornate ? `, ${rateAggiornate} ${rateAggiornate === 1 ? 'piano rate riallineato' : 'piani rate riallineati'}` : ''}.`,
      '', 'Rimuovi ora RICALCOLA_CONGUAGLI dalle variabili dell\'host.');
    banner(diario);
  } catch (err) {
    // Come la migrazione: la transazione ha già fatto rollback e il server parte
    // comunque, perché un'app che non si avvia è più difficile da diagnosticare.
    banner([
      'RICALCOLO CONGUAGLI FALLITO — niente è stato scritto a metà',
      '',
      err.message
    ]);
  }
}
