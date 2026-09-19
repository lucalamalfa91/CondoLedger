/**
 * Entry point per le funzioni serverless di Vercel.
 *
 * Vercel non avvia un processo che resta in ascolto: importa questo modulo e invoca
 * l'handler esportato a ogni richiesta. L'app Express funziona come handler perché è
 * essa stessa una funzione `(req, res)`.
 *
 * I file statici (index.html, js/, css/) NON passano di qui: li serve Vercel
 * direttamente dalla CDN, che è più veloce e non consuma invocazioni. Il routing è in
 * vercel.json.
 *
 * Il modulo viene valutato una volta per istanza, non per richiesta: l'app si costruisce
 * al primo avvio a freddo e viene riusata finché l'istanza resta calda.
 */
import { createApp } from '../server/app.js';
import { maybeBootstrapUser, maybeMigrateOnBoot } from '../server/bootstrap.js';
import { getDb } from '../server/db.js';

const app = createApp();

/**
 * Migrazione e primo utente girano una volta per istanza, non a ogni richiesta, e solo
 * se le rispettive variabili sono impostate. Entrambe si autoproteggono: la migrazione
 * non parte se il database contiene già delle case.
 *
 * `ready` è una promessa condivisa: le richieste che arrivano durante l'avvio a freddo
 * aspettano lo stesso lavoro invece di avviarne una copia per ciascuna.
 */
const ready = (async () => {
  const db = await getDb();
  await maybeMigrateOnBoot(db);
  await maybeBootstrapUser(db);
})();

export default async function handler(req, res) {
  try {
    await ready;
  } catch (err) {
    console.error('[avvio]', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'unavailable', message: 'Servizio non disponibile.' } }));
    return;
  }
  return app(req, res);
}
