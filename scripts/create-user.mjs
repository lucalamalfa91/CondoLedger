#!/usr/bin/env node
/** Crea un utente. Uso: npm run create-user -- tua@email.it */
import { createUser, requireEmailArg, runCli } from './user-cli.mjs';

await runCli(async () => {
  const email = requireEmailArg('Uso: npm run create-user -- tua@email.it');
  const id = await createUser(email);
  console.log(`\nUtente creato: ${email} (id ${id})`);
});
