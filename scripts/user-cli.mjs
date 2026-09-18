/**
 * Logica condivisa da create-user.mjs e set-password.mjs.
 *
 * Sostituiscono "Authentication → Users" del dashboard Supabase: non c'è registrazione
 * dall'app (come oggi: "Accesso riservato agli utenti registrati") e non c'è SMTP, quindi
 * la password dimenticata si reimposta da qui.
 */
import { createInterface } from 'node:readline';

import { hashPassword, newUserId } from '../server/auth-core.js';
import { closeDb, getDb } from '../server/db.js';

/** Legge una password da stdin senza mostrarla a schermo. */
export function promptPassword(question) {
  return new Promise((resolvePrompt, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

    const onKeypress = () => {
      // Riscrive la riga senza gli asteriscsi: nasconde del tutto la digitazione.
      rl.output.write(`\x1B[2K\x1B[200D${question}`);
    };

    rl.output.write(question);
    rl.input.on('data', onKeypress);

    rl.question('', (answer) => {
      rl.input.removeListener('data', onKeypress);
      rl.output.write('\n');
      rl.close();
      resolvePrompt(answer);
    });

    rl.on('error', reject);
  });
}

export async function readNewPassword() {
  const password = await promptPassword('Password: ');
  if (password.length < 6) {
    throw new Error('La password deve avere almeno 6 caratteri.');
  }
  const confirm = await promptPassword('Conferma password: ');
  if (password !== confirm) {
    throw new Error('Le password non coincidono.');
  }
  return password;
}

export function requireEmailArg(usage) {
  const email = (process.argv[2] || '').trim();
  if (!email || !email.includes('@')) {
    console.error(usage);
    process.exit(1);
  }
  return email;
}

export async function createUser(email) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw new Error(`Esiste già un utente con l'email ${email}.`);

  const password = await readNewPassword();
  const id = newUserId();
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(
    id,
    email,
    hashPassword(password)
  );
  return id;
}

export async function setPassword(email) {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) throw new Error(`Nessun utente con l'email ${email}.`);

  const password = await readNewPassword();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  // Come il cambio password dall'app: le sessioni aperte vengono invalidate.
  const closed = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id).changes;
  return { id: user.id, closedSessions: closed };
}

export async function runCli(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`\nErrore: ${err.message}`);
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}
