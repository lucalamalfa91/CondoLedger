/**
 * Middleware trasversali: sessione, autenticazione, ownership della casa, origin check.
 *
 * Il middleware `loadHouse` è il sostituto delle policy RLS: le policy Postgres facevano
 * `exists (select 1 from houses where houses.id = X.house_id and houses.user_id = auth.uid())`
 * su ogni tabella figlia. Qui quel controllo è centralizzato una volta sola, montato sul
 * router `/api/houses/:houseId`, così nessuna rotta figlia può dimenticarlo.
 */
import { getDb } from './db.js';
import { notFound, unauthorized } from './errors.js';
import { parseCookies, resolveSession, SESSION_COOKIE, setSessionCookie } from './auth-core.js';

export async function attachSession(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  req.sessionToken = cookies[SESSION_COOKIE] || null;
  req.user = null;

  if (req.sessionToken) {
    const resolved = await resolveSession(await getDb(), req.sessionToken);
    if (resolved) {
      req.user = resolved.user;
      if (resolved.renewed) setSessionCookie(res, req.sessionToken, resolved.renewed);
    } else {
      req.sessionToken = null;
    }
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) {
    next(unauthorized('Devi essere connesso.'));
    return;
  }
  next();
}

/**
 * Risolve la casa del path verificando il proprietario.
 * Risponde 404 e non 403: non rivela l'esistenza di case altrui.
 */
export async function loadHouse(req, _res, next) {
  const houseId = Number(req.params.houseId);
  if (!Number.isInteger(houseId)) {
    next(notFound('Immobile non trovato.'));
    return;
  }

  const db = await getDb();
  const row = await db
    .prepare('SELECT * FROM houses WHERE id = ? AND user_id = ?')
    .get(houseId, req.user.id);

  if (!row) {
    next(notFound('Immobile non trovato.'));
    return;
  }

  req.house = row;
  req.houseId = houseId;
  next();
}

/**
 * SameSite=Lax da solo non basta a chiudere il CSRF. Per le mutazioni si verifica che
 * l'Origin coincida con l'host servito. Le richieste senza Origin (curl, script di test,
 * navigazioni dirette) passano: non provengono da un browser di terze parti.
 */
export function originCheck(req, _res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    next(unauthorized('Origine della richiesta non valida.'));
    return;
  }

  if (originHost !== req.headers.host) {
    next(unauthorized('Origine della richiesta non valida.'));
    return;
  }
  next();
}
