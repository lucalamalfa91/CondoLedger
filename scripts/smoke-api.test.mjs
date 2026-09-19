/**
 * Smoke test end-to-end della REST API.
 *
 * Gira con `node --test` (runner integrato, nessuna dipendenza): il repo non aveva un test
 * runner, e questi casi coprono esattamente ciò che la migrazione da Supabase può rompere —
 * l'isolamento fra utenti che prima era RLS, l'atomicità delle scritture in due tempi, la
 * deserializzazione delle colonne JSON e i CASCADE, che senza PRAGMA foreign_keys sarebbero
 * ignorati in silenzio.
 *
 * Uso: npm test
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const tmpDir = mkdtempSync(join(tmpdir(), 'condoledger-smoke-'));
process.env.DB_PATH = join(tmpDir, 'smoke.db');
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';

const { createApp } = await import('../server/app.js');
const { closeDb, getDb } = await import('../server/db.js');
const { hashPassword, newUserId } = await import('../server/auth-core.js');

let server;
let baseUrl;

/** Client HTTP minimale che tiene il cookie di sessione, come farebbe un browser. */
function createClient() {
  let cookie = null;
  return {
    get cookie() {
      return cookie;
    },
    clearCookie() {
      cookie = null;
    },
    async request(method, path, body) {
      const headers = { Origin: baseUrl };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      const setCookie = res.headers.getSetCookie?.() ?? [];
      for (const raw of setCookie) {
        const pair = raw.split(';')[0];
        if (pair.startsWith('sid=')) cookie = pair.endsWith('sid=') ? null : pair;
      }

      const text = await res.text();
      let json = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      return { status: res.status, body: json };
    }
  };
}

async function seedUser(email, password) {
  const id = newUserId();
  const db = await getDb();
  await db
    .prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
    .run(id, email, hashPassword(password));
  return id;
}

before(async () => {
  await getDb();
  await seedUser('primo@example.it', 'password1');
  await seedUser('secondo@example.it', 'password2');

  const app = createApp();
  await new Promise((resolveListen) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolveListen();
    });
  });
});

after(async () => {
  await new Promise((resolveClose) => server.close(resolveClose));
  await closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('CondoLedger API', () => {
  const client = createClient();
  let houseId;
  let periodId;
  let dueId;

  it('1. rifiuta credenziali errate e accetta quelle giuste', async () => {
    const bad = await client.request('POST', '/api/auth/login', {
      email: 'primo@example.it',
      password: 'sbagliata'
    });
    assert.equal(bad.status, 401);
    assert.equal(client.cookie, null, 'nessun cookie dopo un login fallito');

    const ok = await client.request('POST', '/api/auth/login', {
      email: 'primo@example.it',
      password: 'password1'
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.email, 'primo@example.it');
    assert.ok(client.cookie?.startsWith('sid='), 'cookie di sessione impostato');
  });

  it('2. nega l\'accesso ai dati senza sessione', async () => {
    const anon = createClient();
    const res = await anon.request('GET', '/api/houses');
    assert.equal(res.status, 401);
  });

  it('3. crea una casa e la restituisce in snake_case', async () => {
    const created = await client.request('POST', '/api/houses', {
      name: 'Casa Test',
      location: 'Milano',
      notes: 'note',
      fiscal_start_month: 6,
      import_parties: [{ role: 'owner', firstName: 'Mario', lastName: 'Rossi' }]
    });
    assert.equal(created.status, 201);
    houseId = created.body.id;

    const list = await client.request('GET', '/api/houses');
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);

    const entry = list.body[0];
    assert.equal(entry.house.name, 'Casa Test');
    assert.equal(entry.house.fiscal_start_month, 6);
    assert.equal(entry.house.calendar_reminder_cadence, 'monthly');
    // import_parties deve arrivare deserializzato: mapHouseFromDb lo passa a
    // parseImportPartiesFromDb, che si aspetta un array.
    assert.ok(Array.isArray(entry.house.import_parties));
    assert.equal(entry.house.import_parties[0].firstName, 'Mario');
  });

  it('4. crea l\'esercizio fiscale in modo idempotente', async () => {
    const spec = { label: '2025/2026', start_date: '2025-06-01', end_date: '2026-05-31' };

    const first = await client.request('POST', `/api/houses/${houseId}/fiscal-periods`, spec);
    assert.equal(first.status, 201);
    assert.equal(first.body.isNew, true);
    periodId = first.body.period.id;

    const second = await client.request('POST', `/api/houses/${houseId}/fiscal-periods`, spec);
    assert.equal(second.status, 200);
    assert.equal(second.body.isNew, false);
    assert.equal(second.body.period.id, periodId, 'stessa label -> stesso id');
  });

  it('5. conserva split_custom come array, non come stringa', async () => {
    const created = await client.request('POST', `/api/houses/${houseId}/dues`, {
      fiscal_period_id: periodId,
      amount: 1200,
      description: 'Preventivo',
      split_mode: 'custom',
      split_custom: [100, 200, 300],
      due_kind: 'preventivo'
    });
    assert.equal(created.status, 201);
    dueId = created.body.id;

    const tree = await client.request('GET', `/api/houses/${houseId}`);
    const due = tree.body.dues.find((d) => d.id === dueId);
    assert.ok(Array.isArray(due.split_custom), 'split_custom deserializzato');
    assert.deepEqual(due.split_custom, [100, 200, 300]);
    assert.equal(due.split_amounts, null);
    assert.equal(due.amount, 1200);
  });

  it('6. registra un versamento', async () => {
    const created = await client.request('POST', `/api/houses/${houseId}/payments`, {
      fiscal_period_id: periodId,
      amount: 100.555,
      date: '2025-07-01',
      method: 'Bonifico',
      note: 'CRO 12345'
    });
    assert.equal(created.status, 201);

    const tree = await client.request('GET', `/api/houses/${houseId}`);
    assert.equal(tree.body.payments.length, 1);
    // La nota è una colonna aggiunta dopo lo schema consolidato: se la ALTER all'avvio
    // non partisse, qui arriverebbe undefined.
    assert.equal(tree.body.payments[0].note, 'CRO 12345');
    // Arrotondamento a 2 decimali, come faceva il cast a numeric(12,2).
    assert.equal(tree.body.payments[0].amount, 100.56);
    assert.equal(tree.body.payments[0].is_carry_forward, 0);
  });

  it('7. fa upsert del saldo precedente sullo stesso esercizio', async () => {
    const first = await client.request('POST', `/api/houses/${houseId}/prior-balances`, {
      fiscal_period_id: periodId,
      amount: 50,
      description: 'Apertura'
    });
    assert.equal(first.status, 201);

    const second = await client.request('POST', `/api/houses/${houseId}/prior-balances`, {
      fiscal_period_id: periodId,
      amount: 75,
      description: 'Corretto'
    });
    assert.equal(second.status, 201);
    assert.equal(second.body.id, first.body.id, 'stesso esercizio -> stessa riga');

    const tree = await client.request('GET', `/api/houses/${houseId}`);
    assert.equal(tree.body.priorBalances.length, 1, 'una sola riga, non due');
    assert.equal(tree.body.priorBalances[0].amount, 75);
  });

  it('8. importa movimenti bancari collegando il versamento in transazione', async () => {
    const res = await client.request('POST', `/api/houses/${houseId}/bank-movements/import`, {
      import_batch_id: 'batch-1',
      rows: [
        {
          movement_date: '2025-07-10',
          operation: 'Bonifico',
          details: 'Rata luglio',
          amount: -150,
          source_hash: 'hash-linked',
          fiscal_period_id: periodId,
          link: true,
          payment_amount: 150,
          installment_key: '2025-07'
        },
        {
          movement_date: '2025-07-11',
          operation: 'Addebito',
          details: 'Non pertinente',
          amount: -20,
          source_hash: 'hash-unlinked',
          suggested_fiscal_period_id: periodId,
          link: false
        }
      ]
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { inserted: 2, skipped: 0, linked: 1 });

    const tree = await client.request('GET', `/api/houses/${houseId}`);
    const linked = tree.body.bankMovements.find((m) => m.source_hash === 'hash-linked');
    const unlinked = tree.body.bankMovements.find((m) => m.source_hash === 'hash-unlinked');

    assert.equal(linked.status, 'linked');
    assert.ok(linked.linked_payment_id, 'il back-link è stato scritto');
    assert.equal(unlinked.status, 'unlinked');
    assert.equal(unlinked.linked_payment_id, null);

    // Il back-link deve essere coerente in entrambe le direzioni: è la parte che oggi,
    // senza transazione, può restare a metà.
    const payment = tree.body.payments.find((p) => p.id === linked.linked_payment_id);
    assert.ok(payment, 'il versamento collegato esiste');
    assert.equal(payment.bank_movement_id, linked.id);
    assert.equal(payment.installment_key, '2025-07');
    assert.equal(payment.method, 'Import Intesa');
  });

  it('9. ignora il re-import dello stesso estratto conto', async () => {
    const res = await client.request('POST', `/api/houses/${houseId}/bank-movements/import`, {
      import_batch_id: 'batch-2',
      rows: [
        {
          movement_date: '2025-07-10',
          amount: -150,
          source_hash: 'hash-linked',
          fiscal_period_id: periodId,
          link: true,
          payment_amount: 150
        },
        {
          movement_date: '2025-07-11',
          amount: -20,
          source_hash: 'hash-unlinked',
          link: false
        }
      ]
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { inserted: 0, skipped: 2, linked: 0 });

    const tree = await client.request('GET', `/api/houses/${houseId}`);
    assert.equal(tree.body.bankMovements.length, 2, 'nessun duplicato');
  });

  it('10. sgancia il movimento quando si cancella il versamento collegato', async () => {
    const before = await client.request('GET', `/api/houses/${houseId}`);
    const movement = before.body.bankMovements.find((m) => m.source_hash === 'hash-linked');
    const paymentId = movement.linked_payment_id;

    const del = await client.request('DELETE', `/api/houses/${houseId}/payments/${paymentId}`);
    assert.equal(del.status, 204);

    const tree = await client.request('GET', `/api/houses/${houseId}`);
    const after_ = tree.body.bankMovements.find((m) => m.id === movement.id);
    assert.equal(after_.status, 'unlinked');
    assert.equal(after_.linked_payment_id, null);
    assert.equal(after_.fiscal_period_id, null);
    assert.equal(
      tree.body.payments.find((p) => p.id === paymentId),
      undefined
    );
  });

  it('11. isola gli utenti: la casa altrui risponde 404, non 403', async () => {
    const other = createClient();
    const login = await other.request('POST', '/api/auth/login', {
      email: 'secondo@example.it',
      password: 'password2'
    });
    assert.equal(login.status, 200);

    const list = await other.request('GET', '/api/houses');
    assert.deepEqual(list.body, [], 'non vede le case del primo utente');

    // 404 e non 403: non rivela nemmeno l'esistenza della casa.
    assert.equal((await other.request('GET', `/api/houses/${houseId}`)).status, 404);
    assert.equal((await other.request('DELETE', `/api/houses/${houseId}`)).status, 404);
    assert.equal((await other.request('GET', `/api/houses/${houseId}/bank-movements`)).status, 404);
    assert.equal(
      (await other.request('DELETE', `/api/houses/${houseId}/dues/${dueId}`)).status,
      404
    );

    // La casa del primo utente è ancora intatta.
    const mine = await client.request('GET', `/api/houses/${houseId}`);
    assert.equal(mine.status, 200);
  });

  it('12. cancella a cascata tutte le righe figlie', async () => {
    const del = await client.request('DELETE', `/api/houses/${houseId}`);
    assert.equal(del.status, 204);

    const db = await getDb();
    for (const table of [
      'fiscal_periods',
      'dues',
      'payments',
      'bank_movements',
      'prior_balances'
    ]) {
      const { c } = await db.prepare(`SELECT count(*) AS c FROM ${table} WHERE house_id = ?`).get(houseId);
      // Se PRAGMA foreign_keys non fosse ON, qui resterebbero righe orfane.
      assert.equal(c, 0, `${table} svuotata dal CASCADE`);
    }
    assert.equal((await db.pragma('foreign_key_check')).length, 0);
  });

  it('13. cambia password e invalida le altre sessioni', async () => {
    const other = createClient();
    await other.request('POST', '/api/auth/login', {
      email: 'primo@example.it',
      password: 'password1'
    });
    assert.equal((await other.request('GET', '/api/houses')).status, 200);

    const changed = await client.request('POST', '/api/auth/password', { password: 'nuova-pwd' });
    assert.equal(changed.status, 204);

    // La sessione che ha cambiato la password resta valida...
    assert.equal((await client.request('GET', '/api/houses')).status, 200);
    // ...l'altra no.
    assert.equal((await other.request('GET', '/api/houses')).status, 401);

    const relogin = await createClient().request('POST', '/api/auth/login', {
      email: 'primo@example.it',
      password: 'nuova-pwd'
    });
    assert.equal(relogin.status, 200);
  });

  it('14. termina la sessione al logout', async () => {
    assert.equal((await client.request('POST', '/api/auth/logout')).status, 204);

    const session = await client.request('GET', '/api/auth/session');
    assert.equal(session.status, 200, 'la sessione risponde 200 anche da disconnessi');
    assert.equal(session.body.user, null);
    assert.equal((await client.request('GET', '/api/houses')).status, 401);
  });
});
