import { Router } from 'express';

import { getDb, money } from '../db.js';
import { asyncRoute, badRequest, notFound } from '../errors.js';
import { serializeBankMovement } from '../serialize.js';

export const bankRouter = Router({ mergeParams: true });

// SQLite limita il numero di variabili per statement (999 su build datate): le DELETE
// multiple vanno spezzate. Sostituisce chunkArray() lato client, che qui non serve più
// perché non c'è un limite di lunghezza URL da rispettare.
const CHUNK = 500;

function chunk(list, size = CHUNK) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Import di un estratto conto, in una sola transazione.
 *
 * Oggi saveBankImport (api.js:414-450) fa tre round-trip per riga senza transazione: se
 * l'insert del versamento fallisce, resta un movimento `status='linked'` con
 * `linked_payment_id` NULL — cioè proprio la classe di stati inconsistenti che
 * enrichMovement()/resolveMovementPayment() devono poi tollerare a valle.
 *
 * `movementHash` e il calcolo di `installment_key` restano nel browser: dipendono dalla
 * logica rate di installments.js, e duplicarla qui introdurrebbe due verità divergenti.
 */
bankRouter.post(
  '/import',
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const batchId = String(body.import_batch_id || '').trim();
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!batchId) throw badRequest('import_batch_id mancante.');
    if (!rows) throw badRequest('Nessuna riga da importare.');

    const db = await getDb();

    const INSERT_MOVEMENT = `
      INSERT INTO bank_movements (house_id, import_batch_id, movement_date, operation, details,
                                  amount, currency, source_hash, fiscal_period_id,
                                  suggested_fiscal_period_id, match_confidence, match_reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (house_id, source_hash) DO NOTHING`;
    const INSERT_PAYMENT = `
      INSERT INTO payments (house_id, fiscal_period_id, amount, date, method, bank_movement_id,
                            installment_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const BACK_LINK = 'UPDATE bank_movements SET linked_payment_id = ? WHERE id = ?';

    const run = db.transaction(async (tx) => {
      let inserted = 0;
      let skipped = 0;
      let linked = 0;

      for (const row of rows) {
        const wantsLink = Boolean(row.link);
        const periodId = row.fiscal_period_id ? Number(row.fiscal_period_id) : null;
        if (wantsLink && !Number.isInteger(periodId)) {
          throw badRequest('Movimento da associare senza esercizio fiscale.');
        }

        const info = await tx.prepare(INSERT_MOVEMENT).run(
          req.houseId,
          batchId,
          row.movement_date,
          row.operation ?? null,
          row.details ?? null,
          money(row.amount),
          row.currency || 'EUR',
          row.source_hash,
          wantsLink ? periodId : null,
          row.suggested_fiscal_period_id ? Number(row.suggested_fiscal_period_id) : null,
          row.match_confidence ?? null,
          row.match_reason ?? null,
          wantsLink ? 'linked' : 'unlinked'
        );

        // Già importato in passato (vincolo house_id + source_hash): si salta in silenzio,
        // come faceva il ramo `if (code === '23505') continue`.
        if (info.changes === 0) {
          skipped += 1;
          continue;
        }
        inserted += 1;

        if (!wantsLink) continue;

        const movementId = Number(info.lastInsertRowid);
        const payInfo = await tx.prepare(INSERT_PAYMENT).run(
          req.houseId,
          periodId,
          money(row.payment_amount),
          row.movement_date,
          'Import Intesa',
          movementId,
          row.installment_key || null
        );
        await tx.prepare(BACK_LINK).run(Number(payInfo.lastInsertRowid), movementId);
        linked += 1;
      }

      return { inserted, skipped, linked };
    });

    res.status(201).json(await run());
  })
);

/** Usata da deleteBankImportBatch/deleteAllBankImports per classificare lato client. */
bankRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const batchId = req.query.import_batch_id;
    const db = await getDb();
    const rows = batchId
      ? await db
          .prepare(
            `SELECT id, linked_payment_id, status FROM bank_movements
              WHERE house_id = ? AND import_batch_id = ? ORDER BY id ASC`
          )
          .all(req.houseId, String(batchId))
      : await db
          .prepare(
            `SELECT id, linked_payment_id, status FROM bank_movements
              WHERE house_id = ? ORDER BY id ASC`
          )
          .all(req.houseId);
    res.json(rows.map(serializeBankMovement));
  })
);

/**
 * Cancellazione di movimenti e dei versamenti orfani collegati, in una transazione.
 * La classificazione di cosa sia cancellabile resta lato client (dipende da
 * isPaymentLinkedToDue → installments.js); qui si valida solo l'appartenenza alla casa.
 */
bankRouter.post(
  '/delete',
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const movementIds = (Array.isArray(body.movement_ids) ? body.movement_ids : [])
      .map(Number)
      .filter(Number.isInteger);
    const paymentIds = (Array.isArray(body.payment_ids) ? body.payment_ids : [])
      .map(Number)
      .filter(Number.isInteger);

    const db = await getDb();
    const run = db.transaction(async (tx) => {
      let deletedPayments = 0;
      let deletedMovements = 0;

      for (const part of chunk(paymentIds)) {
        const placeholders = part.map(() => '?').join(',');
        const info = await tx
          .prepare(`DELETE FROM payments WHERE house_id = ? AND id IN (${placeholders})`)
          .run(req.houseId, ...part);
        deletedPayments += info.changes;
      }
      for (const part of chunk(movementIds)) {
        const placeholders = part.map(() => '?').join(',');
        const info = await tx
          .prepare(`DELETE FROM bank_movements WHERE house_id = ? AND id IN (${placeholders})`)
          .run(req.houseId, ...part);
        deletedMovements += info.changes;
      }

      return { deletedMovements, deletedPayments };
    });

    res.json(await run());
  })
);

/**
 * Associazione manuale di un movimento a un esercizio.
 *
 * Il movimento è letto con `AND house_id = ?`: oggi linkBankMovement (api.js:630) lo carica
 * per solo id, ed è la policy RLS a impedire di raggiungere il movimento di un altro utente.
 */
bankRouter.post(
  '/:movementId/link',
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const periodId = Number(body.fiscal_period_id);
    if (!Number.isInteger(periodId)) throw badRequest('Esercizio fiscale mancante.');

    const db = await getDb();
    const movementId = Number(req.params.movementId);

    const run = db.transaction(async (tx) => {
      const movement = await tx
        .prepare('SELECT * FROM bank_movements WHERE id = ? AND house_id = ?')
        .get(movementId, req.houseId);
      if (!movement) return null;

      const payInfo = await tx
        .prepare(
          `INSERT INTO payments (house_id, fiscal_period_id, amount, date, method,
                                 bank_movement_id, installment_key)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          req.houseId,
          periodId,
          money(Math.abs(Number(movement.amount))),
          movement.movement_date,
          'Import Intesa (manuale)',
          movement.id,
          body.installment_key || null
        );

      await tx
        .prepare(
          `UPDATE bank_movements
              SET fiscal_period_id = ?, linked_payment_id = ?, status = 'linked'
            WHERE id = ? AND house_id = ?`
        )
        .run(periodId, Number(payInfo.lastInsertRowid), movement.id, req.houseId);

      return { payment_id: Number(payInfo.lastInsertRowid) };
    });

    const out = await run();
    if (!out) throw notFound('Movimento bancario non trovato.');
    res.status(201).json(out);
  })
);
