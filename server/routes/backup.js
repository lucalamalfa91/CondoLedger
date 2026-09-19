import { Router } from 'express';

import { getDb, money, toJsonColumn } from '../db.js';
import { asyncRoute, badRequest } from '../errors.js';

export const backupRouter = Router();

/**
 * Ripristino di un backup JSON, in un'unica transazione.
 *
 * Oggi syncBackupToSupabase (api.js:704-793) replica l'intero albero con decine di insert
 * sequenziali: un errore a metà lascia una casa popolata a metà, senza modo di tornare
 * indietro. Qui o passa tutto o non passa niente.
 *
 * La risoluzione degli esercizi fiscali (periodFromLabel, ensurePeriodPayload,
 * legacyCalendarPeriod) resta lato client: è logica di dominio pura, e il client manda già
 * ogni figlio etichettato con la label dell'esercizio a cui appartiene. Il server si limita
 * a tradurre label → id.
 *
 * Come oggi, il ripristino **aggiunge** case: non sostituisce quelle esistenti.
 */
backupRouter.post(
  '/restore',
  asyncRoute(async (req, res) => {
    const houses = Array.isArray(req.body?.houses) ? req.body.houses : null;
    if (!houses) throw badRequest('Backup non valido: manca l\'elenco delle case.');

    const db = await getDb();

    const run = db.transaction(async (tx) => {
      let createdHouses = 0;
      let createdDues = 0;
      let createdPayments = 0;
      let createdPriorBalances = 0;

      for (const h of houses) {
        const name = String(h.name || '').trim();
        if (!name) continue;

        const houseInfo = await tx
          .prepare(
            `INSERT INTO houses (user_id, name, location, notes, fiscal_start_month, import_parties)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(
            req.user.id,
            name,
            h.location ?? null,
            h.notes ?? null,
            h.fiscal_start_month ?? 6,
            toJsonColumn(h.import_parties ?? []) ?? '[]'
          );
        const houseId = Number(houseInfo.lastInsertRowid);
        createdHouses += 1;

        // label -> id, per risolvere i riferimenti dei figli.
        const periodIdByLabel = new Map();
        const INSERT_PERIOD = `
          INSERT INTO fiscal_periods (house_id, label, start_date, end_date)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (house_id, label) DO NOTHING`;
        for (const p of h.fiscal_periods || []) {
          const label = String(p.label || '').trim();
          if (!label) continue;
          await tx.prepare(INSERT_PERIOD).run(houseId, label, p.start_date, p.end_date);
          const row = await tx
            .prepare('SELECT id FROM fiscal_periods WHERE house_id = ? AND label = ?')
            .get(houseId, label);
          if (row) periodIdByLabel.set(label, Number(row.id));
        }

        const periodId = (label) =>
          label ? (periodIdByLabel.get(String(label).trim()) ?? null) : null;

        for (const d of h.dues || []) {
          const pid = periodId(d.fiscal_period_label);
          if (!pid) continue; // come oggi: senza esercizio risolvibile la riga si salta
          await tx.prepare(
            `INSERT INTO dues (house_id, fiscal_period_id, amount, description, split_mode,
                               split_custom, split_amounts, due_kind)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            houseId,
            pid,
            money(d.amount),
            d.description ?? '',
            d.split_mode || 'monthly',
            toJsonColumn(d.split_custom ?? null),
            toJsonColumn(d.split_amounts ?? null),
            d.due_kind || 'preventivo'
          );
          createdDues += 1;
        }

        // I saldi precedenti prima dei versamenti: un versamento può puntarvi.
        const priorBalanceIdByLabel = new Map();
        for (const b of h.prior_balances || []) {
          const pid = periodId(b.fiscal_period_label);
          if (!pid) continue;
          const info = await tx
            .prepare(
              `INSERT INTO prior_balances (house_id, fiscal_period_id, source_period_id, amount, description)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (house_id, fiscal_period_id) DO UPDATE
                 SET source_period_id = excluded.source_period_id,
                     amount           = excluded.amount,
                     description      = excluded.description`
            )
            .run(
              houseId,
              pid,
              periodId(b.source_period_label),
              money(b.amount),
              b.description ?? null
            );
          if (info.changes > 0) createdPriorBalances += 1;
          const row = await tx
            .prepare('SELECT id FROM prior_balances WHERE house_id = ? AND fiscal_period_id = ?')
            .get(houseId, pid);
          if (row) priorBalanceIdByLabel.set(String(b.fiscal_period_label).trim(), Number(row.id));
        }

        for (const p of h.payments || []) {
          const pid = periodId(p.fiscal_period_label);
          if (!pid) continue;
          await tx.prepare(
            `INSERT INTO payments (house_id, fiscal_period_id, amount, date, method,
                                   installment_key, prior_balance_id, is_carry_forward)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            houseId,
            pid,
            money(p.amount),
            p.date || null,
            p.method ?? '',
            p.installment_key || null,
            p.prior_balance_label
              ? (priorBalanceIdByLabel.get(String(p.prior_balance_label).trim()) ?? null)
              : null,
            p.is_carry_forward ? 1 : 0
          );
          createdPayments += 1;
        }
      }

      return { createdHouses, createdDues, createdPayments, createdPriorBalances };
    });

    res.status(201).json(await run());
  })
);
