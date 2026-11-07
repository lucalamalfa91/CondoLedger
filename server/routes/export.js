import { Router } from 'express';

import { buildCondoExport } from '../condo-export.js';
import { getDb } from '../db.js';
import { asyncRoute } from '../errors.js';

export const exportRouter = Router();

/**
 * Snapshot dell'utente connesso. La copia completa del database, per la
 * migrazione, è il comando `npm run export:condo`: stesso formato, tutte le case.
 */
exportRouter.get(
  '/condo-export-v1',
  asyncRoute(async (req, res) => {
    const snapshot = await buildCondoExport(await getDb(), { userId: req.user.id });
    res.json(snapshot);
  })
);
