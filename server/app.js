/**
 * Costruzione dell'app Express: API + file statici sulla stessa origine.
 *
 * Stessa origine significa niente CORS e cookie di sessione naturalmente same-origin —
 * cioè il motivo per cui questo server sostituisce bene il client Supabase senza che il
 * frontend debba gestire token in localStorage.
 */
import express from 'express';
import { resolve } from 'node:path';

import { purgeExpiredSessions } from './auth-core.js';
import { getDb } from './db.js';
import { rootDir } from './env.js';
import { errorHandler, notFound } from './errors.js';
import { attachSession, loadHouse, originCheck, requireAuth } from './middleware.js';
import { authRouter } from './routes/auth.js';
import { backupRouter } from './routes/backup.js';
import { bankRouter } from './routes/bank.js';
import { duesRouter } from './routes/dues.js';
import { housesRouter } from './routes/houses.js';
import { paymentsRouter } from './routes/payments.js';
import { priorBalancesRouter } from './routes/prior-balances.js';

const INDEX_HTML = resolve(rootDir, 'index.html');

export function createApp() {
  const app = express();

  // Necessario perché req.ip sia l'IP reale dietro il proxy della piattaforma di hosting:
  // il rate limit sul login si basa su quello.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '5mb' }));
  app.use(attachSession);

  // --- API ---------------------------------------------------------------
  const api = express.Router();
  api.use(originCheck);
  // Sonda per gli health check della piattaforma di hosting: non tocca il database
  // pesantemente, ma verifica che sia apribile.
  api.get('/health', (_req, res) => {
    try {
      getDb().prepare('SELECT 1').get();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  api.use('/auth', authRouter);

  // Ogni rotta dati è autenticata. `loadHouse`, montato una volta sul router figlio,
  // sostituisce le policy RLS: risolve la casa verificandone il proprietario, e le rotte
  // annidate non possono dimenticare il controllo.
  const houseScoped = express.Router({ mergeParams: true });
  houseScoped.use(loadHouse);
  houseScoped.use('/dues', duesRouter);
  houseScoped.use('/payments', paymentsRouter);
  houseScoped.use('/prior-balances', priorBalancesRouter);
  houseScoped.use('/bank-movements', bankRouter);

  api.use('/houses', requireAuth, housesRouter);
  api.use('/houses/:houseId', requireAuth, houseScoped);
  api.use('/backup', requireAuth, backupRouter);

  api.use((_req, _res, next) => next(notFound('Endpoint non trovato.')));
  app.use('/api', api);

  // --- File statici ------------------------------------------------------
  // Whitelist esplicita: servire la radice esporrebbe Sessions/, council/, design_raw.json
  // e .env. Le tre cartelle sotto sono le stesse che vercel.json escludeva dal fallback SPA.
  const staticOpts = { etag: true, maxAge: 0, index: false };
  app.use('/js', express.static(resolve(rootDir, 'js'), staticOpts));
  app.use('/css', express.static(resolve(rootDir, 'css'), staticOpts));
  app.use('/references', express.static(resolve(rootDir, 'references'), staticOpts));

  // Fallback SPA: le rotte dell'app vivono nell'hash, quindi ogni path serve index.html.
  app.get('*', (_req, res) => res.sendFile(INDEX_HTML));

  app.use(errorHandler);
  return app;
}

/** Pulizia delle sessioni scadute: all'avvio e poi ogni ora. */
export function startSessionCleanup() {
  const tick = () => {
    try {
      purgeExpiredSessions(getDb());
    } catch (err) {
      console.error('[cleanup sessioni]', err);
    }
  };
  tick();
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  return timer;
}
