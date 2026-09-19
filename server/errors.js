/**
 * Errori applicativi e normalizzazione degli errori SQLite.
 *
 * Il client controlla ancora i codici Postgres che riceveva da PostgREST (in particolare
 * '23505' come fallback upsert in api.js). Rimapparli qui è ciò che permette di riscrivere
 * il data layer senza toccare i suoi chiamanti.
 */

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message, code = '22000') => new AppError(400, code, message);
export const unauthorized = (message = 'Sessione non valida') => new AppError(401, '42501', message);
export const notFound = (message = 'Risorsa non trovata') => new AppError(404, 'PGRST116', message);
export const conflict = (message, code = '23505') => new AppError(409, code, message);

/**
 * Traduce un errore di better-sqlite3 in AppError.
 *
 * Nota verificata sul campo: una violazione di ON DELETE RESTRICT riporta
 * SQLITE_CONSTRAINT_TRIGGER, non SQLITE_CONSTRAINT_FOREIGNKEY. Senza mappare entrambi,
 * "cancella un esercizio che ha dovuti collegati" degraderebbe a 500.
 */
export function normalizeDbError(err) {
  if (err instanceof AppError) return err;
  const code = String(err?.code || '');

  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return new AppError(409, '23505', 'Esiste già un record con questi valori.');
  }
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || code === 'SQLITE_CONSTRAINT_TRIGGER') {
    return new AppError(409, '23503', 'Operazione bloccata: esistono record collegati.');
  }
  if (code === 'SQLITE_CONSTRAINT_CHECK') {
    return new AppError(400, '23514', 'Valore non ammesso per uno dei campi.');
  }
  if (code === 'SQLITE_CONSTRAINT_NOTNULL') {
    return new AppError(400, '23502', 'Manca un campo obbligatorio.');
  }
  return null;
}

/** Error handler Express, montato per ultimo. */
export function errorHandler(err, _req, res, _next) {
  const appErr = err instanceof AppError ? err : normalizeDbError(err);

  if (appErr) {
    res.status(appErr.status).json({ error: { code: appErr.code, message: appErr.message } });
    return;
  }

  console.error('[errore non gestito]', err);
  res.status(500).json({
    error: { code: 'internal', message: 'Errore interno del server.' }
  });
}

/** Avvolge un handler async perché i throw finiscano nell'error handler di Express 4. */
export function asyncRoute(handler) {
  return (req, res, next) => {
    try {
      const out = handler(req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
    } catch (err) {
      next(err);
    }
  };
}
