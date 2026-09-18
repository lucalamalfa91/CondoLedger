import { Router } from 'express';

import {
  clearSessionCookie,
  createSession,
  destroyOtherSessions,
  destroySession,
  hashPassword,
  loginRateLimit,
  resetLoginRateLimit,
  setSessionCookie,
  verifyPassword
} from '../auth-core.js';
import { getDb } from '../db.js';
import { AppError, asyncRoute, badRequest, unauthorized } from '../errors.js';
import { requireAuth } from '../middleware.js';

export const authRouter = Router();

/**
 * Risponde 200 anche quando non c'è sessione, con `{user: null}`: restoreSession() lato
 * client non deve distinguere "errore di rete" da "non sei connesso".
 */
authRouter.get('/session', (req, res) => {
  res.json({ user: req.user });
});

authRouter.post(
  '/login',
  asyncRoute((req, res) => {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) throw badRequest('Inserisci email e password');

    const rateKey = `${req.ip}|${email.toLowerCase()}`;
    const limit = loginRateLimit(rateKey);
    if (!limit.allowed) {
      throw new AppError(
        429,
        'rate_limited',
        `Troppi tentativi di accesso. Riprova tra ${Math.ceil(limit.retryAfterSec / 60)} minuti.`
      );
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    // Messaggio identico per utente inesistente e password errata: non rivela quali
    // indirizzi sono registrati.
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw unauthorized('Credenziali non valide');
    }

    resetLoginRateLimit(rateKey);
    const { token, expiresAt } = createSession(db, user.id, req.headers['user-agent'] || null);
    setSessionCookie(res, token, expiresAt);
    res.json({ user: { id: user.id, email: user.email } });
  })
);

authRouter.post(
  '/logout',
  asyncRoute((req, res) => {
    destroySession(getDb(), req.sessionToken);
    clearSessionCookie(res);
    res.status(204).end();
  })
);

authRouter.post(
  '/password',
  requireAuth,
  asyncRoute((req, res) => {
    const password = String(req.body?.password || '');
    if (password.length < 6) throw badRequest('La password deve avere almeno 6 caratteri');

    const db = getDb();
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(password),
      req.user.id
    );
    // Come faceva Supabase: il cambio password sfratta le altre sessioni.
    destroyOtherSessions(db, req.user.id, req.sessionToken);
    res.status(204).end();
  })
);
