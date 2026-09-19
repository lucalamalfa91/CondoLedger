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
import { describeDatabase, getDb } from '../server/db.js';

const app = createApp();

/**
 * Migrazione e primo utente girano una volta per istanza, non a ogni richiesta, e solo
 * se le rispettive variabili sono impostate. Entrambe si autoproteggono: la migrazione
 * non parte se il database contiene già delle case.
 *
 * `ready` è una promessa condivisa: le richieste che arrivano durante l'avvio a freddo
 * aspettano lo stesso lavoro invece di avviarne una copia per ciascuna.
 *
 * Si risolve SEMPRE, restituendo l'errore come valore invece di propagarlo. Questo lavoro
 * parte al caricamento del modulo, cioè prima che esista una richiesta da cui attenderlo:
 * una promessa che rifiuta in quel momento non ha ancora nessun gestore attaccato, e Node
 * abbatte il processo per unhandled rejection. Il chiamante vedrebbe
 * FUNCTION_INVOCATION_FAILED invece della risposta 503 qui sotto, che è proprio il caso
 * che questa funzione esiste per gestire.
 */
const ready = (async () => {
  const db = await getDb();
  await maybeMigrateOnBoot(db);
  await maybeBootstrapUser(db);
})().then(
  () => null,
  (err) => err
);

export default async function handler(req, res) {
  const startupError = await ready;
  if (startupError) {
    console.error(`[avvio] database: ${describeDatabase()}`);
    console.error('[avvio]', startupError);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: {
          code: 'unavailable',
          message: 'Servizio non disponibile: il database non è raggiungibile.',
          // Non il valore, solo se c'è: distingue "variabili non impostate" da un guasto
          // vero senza rivelare nulla. È la prima cosa da sapere e non sta nei log.
          turso_configured: Boolean(process.env.TURSO_DATABASE_URL)
        }
      })
    );
    return;
  }
  return app(req, res);
}
