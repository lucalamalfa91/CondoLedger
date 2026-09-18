/**
 * Caricamento minimale di `.env` in process.env, senza dipendenze.
 *
 * Non sovrascrive mai variabili già presenti nell'ambiente: in produzione i valori
 * arrivano dai secret della piattaforma (Fly, Railway, ...), non da un file.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

export function loadEnv(file = resolve(rootDir, '.env')) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return; // nessun .env: si usano i valori d'ambiente e i default
  }
  for (const [key, value] of Object.entries(parseEnvFile(text))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

export const config = {
  port: Number(process.env.PORT || 3000),
  isProduction: process.env.NODE_ENV === 'production',
  dbPath: resolve(rootDir, process.env.DB_PATH || './data/condoledger.db'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30)
};
