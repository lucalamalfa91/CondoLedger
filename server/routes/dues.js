import { Router } from 'express';

import { getDb, money, toJsonColumn } from '../db.js';
import { asyncRoute, badRequest, notFound } from '../errors.js';

export const duesRouter = Router({ mergeParams: true });

function duePayload(body) {
  const fiscalPeriodId = Number(body.fiscal_period_id);
  if (!Number.isInteger(fiscalPeriodId)) throw badRequest('Esercizio fiscale mancante.');

  const amount = money(body.amount);
  if (amount === null) throw badRequest('Importo non valido.');

  return {
    fiscal_period_id: fiscalPeriodId,
    amount,
    description: body.description ?? null,
    split_mode: body.split_mode || 'monthly',
    split_custom: toJsonColumn(body.split_custom ?? null),
    split_amounts: toJsonColumn(body.split_amounts ?? null),
    due_kind: body.due_kind || 'preventivo',
    carry_from_period_id: body.carry_from_period_id ? Number(body.carry_from_period_id) : null
  };
}

duesRouter.post(
  '/',
  asyncRoute((req, res) => {
    const p = duePayload(req.body || {});
    const info = getDb()
      .prepare(
        `INSERT INTO dues (house_id, fiscal_period_id, amount, description, split_mode,
                           split_custom, split_amounts, due_kind, carry_from_period_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.houseId,
        p.fiscal_period_id,
        p.amount,
        p.description,
        p.split_mode,
        p.split_custom,
        p.split_amounts,
        p.due_kind,
        p.carry_from_period_id
      );
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  })
);

duesRouter.put(
  '/:dueId',
  asyncRoute((req, res) => {
    const p = duePayload(req.body || {});
    // `AND house_id = ?` anche qui: difesa in profondità oltre al middleware di ownership.
    const info = getDb()
      .prepare(
        `UPDATE dues
            SET fiscal_period_id = ?, amount = ?, description = ?, split_mode = ?,
                split_custom = ?, split_amounts = ?, due_kind = ?, carry_from_period_id = ?
          WHERE id = ? AND house_id = ?`
      )
      .run(
        p.fiscal_period_id,
        p.amount,
        p.description,
        p.split_mode,
        p.split_custom,
        p.split_amounts,
        p.due_kind,
        p.carry_from_period_id,
        Number(req.params.dueId),
        req.houseId
      );

    if (info.changes === 0) throw notFound('Dovuto non trovato.');
    res.status(204).end();
  })
);

duesRouter.delete(
  '/:dueId',
  asyncRoute((req, res) => {
    getDb()
      .prepare('DELETE FROM dues WHERE id = ? AND house_id = ?')
      .run(Number(req.params.dueId), req.houseId);
    res.status(204).end();
  })
);
