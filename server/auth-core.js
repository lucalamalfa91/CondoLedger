/**
 * Hashing password e gestione sessioni. Sostituisce Supabase Auth.
 *
 * Hashing: scrypt di node:crypto. È adeguato per questa applicazione e soprattutto evita
 * una seconda dipendenza nativa (better-sqlite3 è già un modulo nativo: aggiungere bcrypt
 * significherebbe un secondo toolchain di compilazione in Docker).
 */
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

import { config } from './env.js';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

/** Formato: scrypt$N$r$p$saltB64$hashB64 */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    hash.toString('base64')
  ].join('$');
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  let expected;
  try {
    expected = Buffer.from(hashB64, 'base64');
    const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p)
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function newUserId() {
  return randomUUID();
}

// --- Sessioni -------------------------------------------------------------

export const SESSION_COOKIE = 'sid';
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function ttlMs() {
  return config.sessionTtlDays * 24 * 60 * 60 * 1000;
}

export function createSession(db, userId, userAgent = null) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs()).toISOString();
  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)'
  ).run(token, userId, expiresAt, userAgent);
  return { token, expiresAt };
}

/**
 * Risolve una sessione valida e la rinnova quando è vicina alla scadenza (rolling refresh:
 * è ciò che faceva persistSession del client Supabase).
 * Ritorna `{ user, renewed }` oppure null.
 */
export function resolveSession(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.token, s.expires_at, u.id AS user_id, u.email
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`
    )
    .get(token);
  if (!row) return null;

  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  let renewed = null;
  if (expiresAt - Date.now() < REFRESH_THRESHOLD_MS) {
    const next = new Date(Date.now() + ttlMs()).toISOString();
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(next, token);
    renewed = next;
  }

  return { user: { id: row.user_id, email: row.email }, renewed };
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** Usata al cambio password: invalida ogni altra sessione dell'utente. */
export function destroyOtherSessions(db, userId, keepToken) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, keepToken);
}

export function purgeExpiredSessions(db) {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString())
    .changes;
}

// --- Cookie ---------------------------------------------------------------

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key) out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function setSessionCookie(res, token, expiresAt) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    expires: new Date(expiresAt)
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/'
  });
}

// --- Rate limit sul login -------------------------------------------------

/**
 * Supabase Auth limitava i tentativi di accesso; senza un equivalente, /api/auth/login
 * esposto su internet è forzabile. Contatore in memoria, sufficiente per un'istanza singola
 * (che è comunque il vincolo imposto da SQLite).
 */
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

export function loginRateLimit(key) {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return { allowed: true };
  }

  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((entry.first + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

export function resetLoginRateLimit(key) {
  attempts.delete(key);
}
