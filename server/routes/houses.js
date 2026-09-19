import { Router } from 'express';

import { getDb, toJsonColumn } from '../db.js';
import { asyncRoute, badRequest, notFound } from '../errors.js';
import { loadHouse } from '../middleware.js';
import { allHouseTrees, houseTree, serializeFiscalPeriod } from '../serialize.js';

export const housesRouter = Router();

/** Sostituisce loadFromSupabase(): un'unica chiamata al posto di 1 + 5×N query. */
housesRouter.get(
  '/',
  asyncRoute((req, res) => {
    res.json(allHouseTrees(getDb(), req.user.id));
  })
);

housesRouter.post(
  '/',
  asyncRoute((req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw badRequest("Il nome dell'immobile è obbligatorio.");

    // user_id viene SOLO dalla sessione. Oggi api.js lo manda nel payload (api.js:135):
    // accettarlo dal client significherebbe permettere di scrivere case per conto d'altri.
    const info = getDb()
      .prepare(
        `INSERT INTO houses (user_id, name, location, notes, fiscal_start_month, import_parties)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user.id,
        name,
        body.location ?? null,
        body.notes ?? null,
        body.fiscal_start_month ?? 6,
        toJsonColumn(body.import_parties ?? []) ?? '[]'
      );

    res.status(201).json({ id: Number(info.lastInsertRowid) });
  })
);

housesRouter.put(
  '/:houseId',
  loadHouse,
  asyncRoute((req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw badRequest("Il nome dell'immobile è obbligatorio.");

    getDb()
      .prepare(
        `UPDATE houses
            SET name = ?, location = ?, notes = ?, fiscal_start_month = ?, import_parties = ?
          WHERE id = ? AND user_id = ?`
      )
      .run(
        name,
        body.location ?? null,
        body.notes ?? null,
        body.fiscal_start_month ?? 6,
        toJsonColumn(body.import_parties ?? []) ?? '[]',
        req.houseId,
        req.user.id
      );

    res.status(204).end();
  })
);

housesRouter.patch(
  '/:houseId/calendar',
  loadHouse,
  asyncRoute((req, res) => {
    const body = req.body || {};
    getDb()
      .prepare(
        `UPDATE houses
            SET calendar_reminder_cadence = ?, calendar_reminder_lead_days = ?
          WHERE id = ? AND user_id = ?`
      )
      .run(
        body.calendar_reminder_cadence,
        body.calendar_reminder_lead_days,
        req.houseId,
        req.user.id
      );
    res.status(204).end();
  })
);

/**
 * Cancella l'immobile e tutto ciò che ne dipende.
 *
 * Le righe figlie vengono eliminate **esplicitamente**, invece di affidarsi agli
 * ON DELETE CASCADE dello schema. Il motivo è che i CASCADE richiedono
 * `PRAGMA foreign_keys = ON` su ogni connessione, e la documentazione di libsql-js
 * elenca `pragma()` fra i metodi non supportati: verso un database remoto quel PRAGMA
 * potrebbe non applicarsi, e allora la cancellazione lascerebbe righe orfane **senza
 * alcun errore visibile**. Facendolo a mano il comportamento è identico ovunque, che il
 * database sia un file locale o Turso.
 *
 * L'ordine non è arbitrario: dues e payments referenziano fiscal_periods con
 * ON DELETE RESTRICT, quindi gli esercizi vanno cancellati per ultimi.
 */
housesRouter.delete(
  '/:houseId',
  loadHouse,
  asyncRoute((req, res) => {
    const db = getDb();

    const run = db.transaction(() => {
      for (const table of ['payments', 'bank_movements', 'dues', 'prior_balances', 'fiscal_periods']) {
        db.prepare(`DELETE FROM ${table} WHERE house_id = ?`).run(req.houseId);
      }
      // `AND user_id = ?` è indispensabile: la versione Supabase cancellava per solo id
      // ed era la policy RLS a impedire di colpire la casa di un altro utente.
      db.prepare('DELETE FROM houses WHERE id = ? AND user_id = ?').run(req.houseId, req.user.id);
    });

    run();
    res.status(204).end();
  })
);

/** Sostituisce reloadHouseFromSupabase(). */
housesRouter.get(
  '/:houseId',
  loadHouse,
  asyncRoute((req, res) => {
    res.json(houseTree(getDb(), req.house));
  })
);

/**
 * Creazione idempotente di un esercizio fiscale.
 *
 * Sostituisce ensureFiscalPeriodBySpec() insieme al suo fallback su errore 23505
 * (api.js:176-184): qui la corsa è risolta dal vincolo UNIQUE dentro una transazione.
 */
housesRouter.post(
  '/:houseId/fiscal-periods',
  loadHouse,
  asyncRoute((req, res) => {
    const body = req.body || {};
    const label = String(body.label || '').trim();
    const startDate = String(body.start_date || '').trim();
    const endDate = String(body.end_date || '').trim();
    if (!label || !startDate || !endDate) {
      throw badRequest("Esercizio fiscale incompleto (label, start_date, end_date).");
    }

    const db = getDb();
    const upsert = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO fiscal_periods (house_id, label, start_date, end_date)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (house_id, label) DO NOTHING`
        )
        .run(req.houseId, label, startDate, endDate);

      const row = db
        .prepare('SELECT * FROM fiscal_periods WHERE house_id = ? AND label = ?')
        .get(req.houseId, label);

      return { row, isNew: info.changes > 0 };
    });

    const { row, isNew } = upsert();
    if (!row) throw notFound('Esercizio fiscale non trovato dopo la creazione.');
    res.status(isNew ? 201 : 200).json({ period: serializeFiscalPeriod(row), isNew });
  })
);
