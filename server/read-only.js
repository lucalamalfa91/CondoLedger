/**
 * Interruttore di sola lettura per il periodo di controllo dopo il cutover.
 *
 * Le GET restano aperte, compresa l'esportazione. Login e logout restano aperti
 * perché sono l'unico modo di arrivare all'export autenticato: non modificano
 * case, esercizi, dovuti o versamenti. Ogni altra mutazione risponde 403.
 */
import { AppError } from './errors.js';

const ENABLED = new Set(['1', 'true', 'yes', 'on']);

export function isReadOnly() {
  return ENABLED.has(String(process.env.CONDOLEDGER_READ_ONLY || '').trim().toLowerCase());
}

function isSessionPost(req) {
  if (req.method !== 'POST') return false;
  const path = req.path || '';
  return (
    path === '/auth/login' ||
    path === '/auth/logout' ||
    path === '/api/auth/login' ||
    path === '/api/auth/logout'
  );
}

export function readOnlyGuard(req, res, next) {
  if (!isReadOnly()) {
    next();
    return;
  }

  res.set('X-CondoLedger-Read-Only', 'true');

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  if (isSessionPost(req)) {
    next();
    return;
  }

  next(
    new AppError(
      403,
      'read_only',
      "CondoLedger è in sola lettura. L'esportazione condo-export-v1 resta disponibile."
    )
  );
}
