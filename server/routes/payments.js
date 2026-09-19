import { Router } from 'express';

import { getDb, money } from '../db.js';
import { asyncRoute, badRequest, notFound } from '../errors.js';

export const paymentsRouter = Router({ mergeParams: true });

function paymentPayload(body) {
  const fiscalPeriodId = Number(body.fiscal_period_id);
  if (!Number.isInteger(fiscalPeriodId)) throw badRequest('Esercizio fiscale mancante.');

  const amount = money(body.amount);
  if (amount === null) throw badRequest('Importo non valido.');

  return {
    fiscal_period_id: fiscalPeriodId,
    amount,
    date: body.date ?? null,
    method: body.method ?? null,
    note: body.note ?? null,
    installment_key: body.installment_key || null,
    prior_balance_id: body.prior_balance_id ? Number(body.prior_balance_id) : null,
    carry_from_period_id: body.carry_from_period_id ? Number(body.carry_from_period_id) : null,
    is_carry_forward: body.is_carry_forward ? 1 : 0,
    bank_movement_id: body.bank_movement_id ? Number(body.bank_movement_id) : null
  };
}

paymentsRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const p = paymentPayload(req.body || {});
    const db = await getDb();
    const info = await db
      .prepare(
        `INSERT INTO payments (house_id, fiscal_period_id, amount, date, method, note,
                               installment_key, prior_balance_id, carry_from_period_id,
                               is_carry_forward, bank_movement_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.houseId,
        p.fiscal_period_id,
        p.amount,
        p.date,
        p.method,
        p.note,
        p.installment_key,
        p.prior_balance_id,
        p.carry_from_period_id,
        p.is_carry_forward,
        p.bank_movement_id
      );
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  })
);

paymentsRouter.put(
  '/:paymentId',
  asyncRoute(async (req, res) => {
    const p = paymentPayload(req.body || {});
    const db = await getDb();
    const info = await db
      .prepare(
        `UPDATE payments
            SET fiscal_period_id = ?, amount = ?, date = ?, method = ?, note = ?,
                installment_key = ?, prior_balance_id = ?, bank_movement_id = ?,
                carry_from_period_id = NULL, is_carry_forward = 0
          WHERE id = ? AND house_id = ?`
      )
      .run(
        p.fiscal_period_id,
        p.amount,
        p.date,
        p.method,
        p.note,
        p.installment_key,
        p.prior_balance_id,
        p.bank_movement_id,
        Number(req.params.paymentId),
        req.houseId
      );

    if (info.changes === 0) throw notFound('Versamento non trovato.');
    res.status(204).end();
  })
);

/**
 * Cancella il versamento e sgancia il movimento bancario collegato, in una transazione.
 *
 * Oggi (api.js:373-388) sono due round-trip separati: se il secondo fallisce, il movimento
 * resta `status='linked'` puntando a un pagamento che non esiste più.
 */
paymentsRouter.delete(
  '/:paymentId',
  asyncRoute(async (req, res) => {
    const db = await getDb();
    const paymentId = Number(req.params.paymentId);

    const run = db.transaction(async (tx) => {
      const payment = await tx
        .prepare('SELECT * FROM payments WHERE id = ? AND house_id = ?')
        .get(paymentId, req.houseId);
      if (!payment) return false;

      await tx
        .prepare('DELETE FROM payments WHERE id = ? AND house_id = ?')
        .run(paymentId, req.houseId);

      if (payment.bank_movement_id) {
        await tx
          .prepare(
            `UPDATE bank_movements
                SET status = 'unlinked', linked_payment_id = NULL, fiscal_period_id = NULL
              WHERE id = ? AND house_id = ?`
          )
          .run(payment.bank_movement_id, req.houseId);
      }
      return true;
    });

    if (!(await run())) throw notFound('Versamento non trovato.');
    res.status(204).end();
  })
);
