/**
 * Snapshot condo-export-v1 e sola lettura.
 *
 * Le cifre sono quelle di fixtures/condo-export-v1/case-reali.json, a loro volta
 * prese dai resoconti già fissati in conguaglio.test.mjs. Il controllo è in
 * centesimi: preventivo ordinario, straordinari, consuntivo, saldo precedente,
 * versamenti e somma delle rate.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const tmpDir = mkdtempSync(join(tmpdir(), 'condoledger-export-'));
const dbPath = join(tmpDir, 'export.db');
process.env.DB_PATH = dbPath;
process.env.TURSO_DATABASE_URL = '';
process.env.TURSO_AUTH_TOKEN = '';
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.CONDOLEDGER_READ_ONLY = 'true';

const { createApp } = await import('../server/app.js');
const { toCents } = await import('../server/cents.js');
const { buildCondoExport } = await import('../server/condo-export.js');
const { closeDb, getDb, toJsonColumn } = await import('../server/db.js');
const { hashPassword, newUserId } = await import('../server/auth-core.js');

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/condo-export-v1/case-reali.json', import.meta.url), 'utf8')
);

let server;
let baseUrl;
const owner = { email: 'export@example.it', password: 'password1' };
const other = { email: 'altro@example.it', password: 'password2' };

function createClient() {
  let cookie = null;
  return {
    async request(method, path, body) {
      const headers = { Origin: baseUrl };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      for (const raw of res.headers.getSetCookie?.() ?? []) {
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
      return { status: res.status, body: json, readOnly: res.headers.get('x-condoledger-read-only') };
    }
  };
}

function euros(cents) {
  return cents / 100;
}

function splitCents(total, slots) {
  const base = Math.trunc(total / slots);
  return Array.from({ length: slots }, (_, i) => (i === slots - 1 ? total - base * (slots - 1) : base));
}

function addMonths(iso, count) {
  const [year, month] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${mm}-01`;
}

function monthEnd(iso) {
  const [year, month] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

function planRows(period) {
  const slots = 12;
  const ordinary = splitCents(period.budgetOrdinaryCents, slots);
  const extraordinary = splitCents(period.extraordinaryCents, slots);
  return ordinary.map((ordinaryCents, index) => {
    const priorSettlementCents = index === 0 ? period.priorBalanceCents : 0;
    const extraordinaryCents = extraordinary[index];
    const start = addMonths(period.startDate, index);
    return {
      periodStart: start,
      periodEnd: monthEnd(start),
      amount: euros(ordinaryCents + priorSettlementCents + extraordinaryCents),
      ordinario: euros(ordinaryCents),
      conguaglio: euros(priorSettlementCents),
      straordinari: euros(extraordinaryCents),
      label: `Rata ${index + 1}`
    };
  });
}

async function seedUser(email, password) {
  const id = newUserId();
  const db = await getDb();
  await db
    .prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
    .run(id, email, hashPassword(password));
  return id;
}

async function seedFixture(userId) {
  const db = await getDb();
  for (const house of fixture.houses) {
    const houseInfo = await db
      .prepare(
        `INSERT INTO houses (user_id, name, location, fiscal_start_month)
         VALUES (?, ?, ?, ?)`
      )
      .run(userId, house.name, house.location, house.fiscalStartMonth);
    const houseId = Number(houseInfo.lastInsertRowid);
    const periodIdByLabel = new Map();

    for (const period of house.periods) {
      const periodInfo = await db
        .prepare(
          `INSERT INTO fiscal_periods (house_id, label, start_date, end_date)
           VALUES (?, ?, ?, ?)`
        )
        .run(houseId, period.label, period.startDate, period.endDate);
      const periodId = Number(periodInfo.lastInsertRowid);
      periodIdByLabel.set(period.label, periodId);

      const dueInfo = await db
        .prepare(
          `INSERT INTO dues (house_id, fiscal_period_id, amount, description, split_mode,
                             split_amounts, due_kind, voice)
           VALUES (?, ?, ?, ?, 'monthly', ?, 'preventivo', 'ordinario')`
        )
        .run(
          houseId,
          periodId,
          euros(period.budgetOrdinaryCents),
          'Preventivo ordinario',
          toJsonColumn(planRows(period))
        );
      period.ordinaryDueId = Number(dueInfo.lastInsertRowid);

      if (period.extraordinaryCents) {
        await db
          .prepare(
            `INSERT INTO dues (house_id, fiscal_period_id, amount, description, due_kind, voice)
             VALUES (?, ?, ?, ?, 'preventivo', 'straordinario')`
          )
          .run(houseId, periodId, euros(period.extraordinaryCents), 'Lavori');
      }

      await db
        .prepare(
          `INSERT INTO dues (house_id, fiscal_period_id, amount, description, due_kind)
           VALUES (?, ?, ?, ?, 'consuntivo')`
        )
        .run(houseId, periodId, euros(period.finalCents), 'Consuntivo');

      if (period.priorBalanceCents) {
        const sourceId = periodIdByLabel.get(period.priorSourceLabel) ?? null;
        const priorInfo = await db
          .prepare(
            `INSERT INTO prior_balances (house_id, fiscal_period_id, source_period_id, amount, description)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(houseId, periodId, sourceId, euros(period.priorBalanceCents), 'Saldo esercizio precedente');
        period.priorBalanceId = Number(priorInfo.lastInsertRowid);
      }

      period.paymentIds = [];
      for (const [index, cents] of period.paymentCents.entries()) {
        const info = await db
          .prepare(
            `INSERT INTO payments (house_id, fiscal_period_id, amount, date, method, note,
                                   installment_key, prior_balance_id)
             VALUES (?, ?, ?, ?, 'Bonifico', ?, ?, ?)`
          )
          .run(
            houseId,
            periodId,
            euros(cents),
            period.startDate,
            `Versamento ${index + 1}`,
            index === 0 ? `${period.ordinaryDueId}:0` : null,
            index === 0 ? (period.priorBalanceId ?? null) : null
          );
        period.paymentIds.push(Number(info.lastInsertRowid));
      }

      if (period.bankMovement) {
        const movement = period.bankMovement;
        const movementInfo = await db
          .prepare(
            `INSERT INTO bank_movements (house_id, import_batch_id, movement_date, operation, details,
                                         amount, currency, source_hash, fiscal_period_id, status,
                                         linked_payment_id)
             VALUES (?, 'fixture', ?, ?, ?, ?, 'EUR', ?, ?, 'linked', ?)`
          )
          .run(
            houseId,
            movement.movementDate,
            movement.operation,
            movement.details,
            euros(movement.amountCents),
            movement.sourceHash,
            periodId,
            period.paymentIds[movement.linksPaymentIndex]
          );
        const movementId = Number(movementInfo.lastInsertRowid);
        await db
          .prepare('UPDATE payments SET bank_movement_id = ? WHERE id = ?')
          .run(movementId, period.paymentIds[movement.linksPaymentIndex]);
      }
    }
  }
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function slicePeriod(snapshot, houseName, label) {
  const house = snapshot.houses.find((item) => item.name === houseName);
  assert.ok(house, houseName);
  const period = house.fiscalPeriods.find((item) => item.label === label);
  assert.ok(period, `${houseName} ${label}`);
  const inPeriod = (row) => row.fiscalPeriodId === period.id;
  return {
    house,
    period,
    dues: house.dues.filter(inPeriod),
    priors: house.priorBalances.filter(inPeriod),
    payments: house.payments.filter(inPeriod),
    installments: house.installments.filter(inPeriod)
  };
}

function assertPeriod(snapshot, houseName, spec) {
  const view = slicePeriod(snapshot, houseName, spec.label);
  const budget = sum(
    view.dues.filter((due) => due.kind === 'budget' && due.voice === 'ordinary'),
    'amountCents'
  );
  const extraordinary = sum(
    view.dues.filter((due) => due.kind === 'budget' && due.voice === 'extraordinary'),
    'amountCents'
  );
  const finalAmount = sum(
    view.dues.filter((due) => due.kind === 'final'),
    'amountCents'
  );
  const prior = sum(view.priors, 'amountCents');
  const paid = sum(view.payments, 'amountCents');

  assert.equal(budget, spec.budgetOrdinaryCents, `${houseName} ${spec.label} preventivo`);
  assert.equal(extraordinary, spec.extraordinaryCents, `${houseName} ${spec.label} straordinari`);
  assert.equal(finalAmount, spec.finalCents, `${houseName} ${spec.label} consuntivo`);
  assert.equal(prior, spec.priorBalanceCents, `${houseName} ${spec.label} saldo precedente`);
  assert.equal(paid, spec.paymentCents.reduce((total, cents) => total + cents, 0), `${houseName} ${spec.label} versamenti`);
  assert.equal(
    finalAmount + extraordinary + prior - paid,
    spec.expectedSettlementCents,
    `${houseName} ${spec.label} conguaglio`
  );

  assert.equal(view.installments.length, 12, `${houseName} ${spec.label} numero rate`);
  assert.equal(sum(view.installments, 'ordinaryCents'), budget, `${houseName} ${spec.label} rate ordinarie`);
  assert.equal(
    sum(view.installments, 'extraordinaryCents'),
    extraordinary,
    `${houseName} ${spec.label} rate straordinarie`
  );
  assert.equal(
    sum(view.installments, 'priorSettlementCents'),
    prior,
    `${houseName} ${spec.label} rate del saldo precedente`
  );
  for (const row of view.installments) {
    assert.equal(
      row.totalCents,
      row.ordinaryCents + row.priorSettlementCents + row.extraordinaryCents
    );
  }
  assert.equal(
    sum(view.installments, 'totalCents'),
    budget + extraordinary + prior,
    `${houseName} ${spec.label} totale rate`
  );
}

before(async () => {
  const ownerId = await seedUser(owner.email, owner.password);
  const otherId = await seedUser(other.email, other.password);
  await seedFixture(ownerId);
  const db = await getDb();
  await db.prepare('INSERT INTO houses (user_id, name) VALUES (?, ?)').run(otherId, 'Casa altrui');

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

describe('condo-export-v1', () => {
  it('fa tornare preventivo, straordinari, consuntivo, saldo, versamenti e rate al centesimo', async () => {
    const db = await getDb();
    const ownerRow = await db.prepare('SELECT id FROM users WHERE email = ?').get(owner.email);
    const first = await buildCondoExport(db, { userId: ownerRow.id });
    const second = await buildCondoExport(db, { userId: ownerRow.id });

    assert.equal(first.format, 'condo-export-v1');
    assert.equal(first.currency, 'EUR');
    assert.equal(first.amountUnit, 'cents');
    assert.match(first.contentHash, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(second, first, 'lo stesso snapshot è identico, hash compreso');
    assert.equal(first.houses.length, 2);
    assert.equal(first.houses.some((house) => house.name === 'Casa altrui'), false);

    for (const house of fixture.houses) {
      for (const period of house.periods) assertPeriod(first, house.name, period);
    }

    const casaA = first.houses.find((house) => house.name === 'Casa A');
    const period = casaA.fiscalPeriods.find((item) => item.label === '2025/2026');
    const opening = casaA.payments.find((payment) => payment.fiscalPeriodId === period.id && payment.amountCents === 7750);
    assert.equal(opening.installmentId, `installment:due:${opening.installmentKey.split(':')[0]}:0`);
    assert.ok(casaA.installments.some((row) => row.id === opening.installmentId));
    const movement = casaA.bankMovements.find((row) => row.sourceHash === 'casa-a-2025-06-saldo');
    assert.equal(movement.amountCents, -7750);
    assert.equal(movement.linkedPaymentId, opening.id);
    assert.equal(opening.bankMovementId, movement.id);
    assert.equal(toCents(2386.87), 238687);
    assert.equal(toCents(-75.73), -7573);
  });

  it('cambia hash se cambia un importo, e il comando ristampa lo stesso snapshot', async () => {
    const db = await getDb();
    const ownerRow = await db.prepare('SELECT id FROM users WHERE email = ?').get(owner.email);
    const before = await buildCondoExport(db, { userId: ownerRow.id });
    const payment = before.houses[0].payments[0];

    await db.prepare('UPDATE payments SET amount = ? WHERE id = ?').run(euros(payment.amountCents + 1), payment.sourceId);
    const changed = await buildCondoExport(db, { userId: ownerRow.id });
    assert.notEqual(changed.contentHash, before.contentHash);
    await db.prepare('UPDATE payments SET amount = ? WHERE id = ?').run(euros(payment.amountCents), payment.sourceId);

    const restored = await buildCondoExport(db, { userId: ownerRow.id });
    assert.equal(restored.contentHash, before.contentHash);

    const run = spawnSync(process.execPath, ['scripts/export-condo.mjs', '--user', owner.email], {
      cwd: new URL('..', import.meta.url).pathname,
      env: {
        ...process.env,
        DB_PATH: dbPath,
        TURSO_DATABASE_URL: '',
        TURSO_AUTH_TOKEN: '',
        CONDOLEDGER_READ_ONLY: 'true'
      },
      encoding: 'utf8'
    });
    assert.equal(run.status, 0, run.stderr);
    const fromCli = JSON.parse(run.stdout);
    assert.equal(fromCli.contentHash, before.contentHash);
    assert.deepEqual(fromCli, restored);
  });

  it('in sola lettura blocca le scritture e consegna comunque l\'export', async () => {
    const client = createClient();
    const anon = await client.request('GET', '/api/export/condo-export-v1');
    assert.equal(anon.status, 401);

    const login = await client.request('POST', '/api/auth/login', owner);
    assert.equal(login.status, 200, 'il login resta possibile');
    assert.equal(login.readOnly, 'true');

    const health = await client.request('GET', '/api/health');
    assert.equal(health.status, 200);

    const house = await client.request('POST', '/api/houses', { name: 'Non si crea' });
    assert.equal(house.status, 403);
    assert.equal(house.body.error.code, 'read_only');

    const db = await getDb();
    const existing = await db.prepare('SELECT id FROM houses WHERE name = ?').get('Casa A');
    const due = await client.request('POST', `/api/houses/${existing.id}/dues`, {
      fiscal_period_id: 1,
      amount: 10,
      due_kind: 'preventivo'
    });
    assert.equal(due.status, 403);

    const restore = await client.request('POST', '/api/backup/restore', { houses: [] });
    assert.equal(restore.status, 403);

    const password = await client.request('POST', '/api/auth/password', { password: 'nuova-password' });
    assert.equal(password.status, 403);

    const exported = await client.request('GET', '/api/export/condo-export-v1');
    assert.equal(exported.status, 200);
    assert.equal(exported.readOnly, 'true');
    assert.equal(exported.body.format, 'condo-export-v1');

    const again = await buildCondoExport(db, {
      userId: (await db.prepare('SELECT id FROM users WHERE email = ?').get(owner.email)).id
    });
    assert.deepEqual(exported.body, again);

    const logout = await client.request('POST', '/api/auth/logout');
    assert.equal(logout.status, 204);
  });
});
