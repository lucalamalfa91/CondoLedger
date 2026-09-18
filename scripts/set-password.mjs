#!/usr/bin/env node
/**
 * Reimposta la password di un utente. Uso: npm run set-password -- tua@email.it
 *
 * È il sostituto del "password dimenticata" via email: senza SMTP, il reset si fa da qui,
 * sulla macchina che ospita il database.
 */
import { requireEmailArg, runCli, setPassword } from './user-cli.mjs';

await runCli(async () => {
  const email = requireEmailArg('Uso: npm run set-password -- tua@email.it');
  const { closedSessions } = await setPassword(email);
  console.log(`\nPassword aggiornata per ${email}.`);
  if (closedSessions > 0) {
    console.log(`Sessioni chiuse: ${closedSessions}. Sarà necessario accedere di nuovo.`);
  }
});
