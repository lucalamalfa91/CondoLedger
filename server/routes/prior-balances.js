import { Router } from 'express';

import { getDb, money } from '../db.js';
import { asyncRoute, badRequest, notFound } from '../errors.js';

export const priorBalancesRouter = Router({ mergeParams: true });

function priorBalancePayload(body) {
  const fiscalPeriodId = Number(body.fiscal_period_id);
  if (!Number.isInteger(fiscalPeriodId)) {
    throw badRequest("Seleziona l'esercizio fiscale del saldo precedente.");
  }

  const amount = money(body.amount);
  if (amount === null) throw badRequest('Importo non valido.');

  return {
    fiscal_period_id: fiscalPeriodId,
    source_period_id: body.source_period_id ? Number(body.source_period_id) : null,
    amount,
    description: body.description ?? null
  };
}

/**
 * Upsert su (house_id, fiscal_period_id).
 *
 * Oggi savePriorBalanceToSupabase (api.js:288-303) cerca un saldo esistente nello stato in
 * memoria e poi sceglie insert o update, con un fallback su 23505. Il vincolo UNIQUE
 * esiste già: farlo risolvere al database dentro una transazione elimina la corsa.
 */
priorBalancesRouter.post(
  '/',
  asyncRoute((req, res) => {
    const p = priorBalancePayload(req.body || {});
    const db = getDb();

    const upsert = db.transaction(() => {
      db.prepare(
        `INSERT INTO prior_balances (house_id, fiscal_period_id, source_period_id, amount, description)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (house_id, fiscal_period_id)
         DO UPDATE SET source_period_id = excluded.source_period_id,
                       amount           = excluded.amount,
                       description      = excluded.description`
      ).run(req.houseId, p.fiscal_period_id, p.source_period_id, p.amount, p.description);

      return db
        .prepare('SELECT id FROM prior_balances WHERE house_id = ? AND fiscal_period_id = ?')
        .get(req.houseId, p.fiscal_period_id);
    });

    const row = upsert();
    res.status(201).json({ id: Number(row.id) });
  })
);

priorBalancesRouter.put(
  '/:priorBalanceId',
  asyncRoute((req, res) => {
    const p = priorBalancePayload(req.body || {});
    const info = getDb()
      .prepare(
        `UPDATE prior_balances
            SET fiscal_period_id = ?, source_period_id = ?, amount = ?, description = ?
          WHERE id = ? AND house_id = ?`
      )
      .run(
        p.fiscal_period_id,
        p.source_period_id,
        p.amount,
        p.description,
        Number(req.params.priorBalanceId),
        req.houseId
      );

    if (info.changes === 0) {
      throw notFound('Saldo precedente non trovato. Ricarica la pagina e riprova.');
    }
    res.status(204).end();
  })
);

priorBalancesRouter.delete(
  '/:priorBalanceId',
  asyncRoute((req, res) => {
    getDb()
      .prepare('DELETE FROM prior_balances WHERE id = ? AND house_id = ?')
      .run(Number(req.params.priorBalanceId), req.houseId);
    res.status(204).end();
  })
);
