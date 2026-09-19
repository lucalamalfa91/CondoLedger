-- Schema SQLite di CondoLedger.
--
-- Consolidamento delle 12 migration Postgres/Supabase (supabase/migrations/), non dello
-- snapshot supabase-schema.sql, che era stale. Ricostruito seguendo tutta la catena: alcune
-- colonne sono state aggiunte e poi rimosse e qui NON esistono —
--   dues.prior_balance_id            (20260715120000 -> rimossa da 20260716090000)
--   houses.calendar_feed_token       (20260718090000 -> rimossa da 20260718120000)
--   houses.calendar_feed_enabled     (20260718090000 -> rimossa da 20260718120000)
-- La tabella document_imports non è portata: la feature di import AI da documento è rimossa.
--
-- Le policy RLS non hanno equivalente qui: l'isolamento per utente è applicativo, imposto dal
-- middleware di ownership del server (server/ownership.js).
--
-- Convenzioni di traduzione:
--   bigint identity   -> INTEGER PRIMARY KEY AUTOINCREMENT  (gli id devono restare numerici:
--                        il client distingue i record locali da quelli persistiti con
--                        Number.isFinite(Number(id)); AUTOINCREMENT evita inoltre il riciclo
--                        dei rowid dopo la migrazione con id espliciti)
--   uuid              -> TEXT
--   jsonb             -> TEXT (JSON.stringify in scrittura, JSON.parse in lettura nel server)
--   numeric(12,2)     -> REAL (stesso double che il dominio già manipola oggi; il server
--                        arrotonda a 2 decimali in scrittura, come faceva il cast Postgres)
--   boolean           -> INTEGER 0/1
--   date              -> TEXT 'YYYY-MM-DD'
--   timestamptz now() -> TEXT ISO-8601 con 'Z' (NON CURRENT_TIMESTAMP: produce
--                        '2026-09-18 10:30:00', che new Date() legge come ora locale)

PRAGMA foreign_keys = ON;

-- Versione dello schema, per future evoluzioni incrementali.
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Autenticazione (sostituisce Supabase Auth)
-- ---------------------------------------------------------------------------

-- id è TEXT per poter conservare gli UUID di auth.users durante la migrazione:
-- è il valore referenziato da houses.user_id.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT
);

-- Tentativi di accesso falliti, per il rate limit.
--
-- Sta nel database e non in memoria perché su funzioni serverless ogni richiesta può
-- girare in un processo diverso: un contatore in memoria si azzererebbe di continuo e la
-- protezione contro i tentativi a forza bruta sarebbe solo apparente.
CREATE TABLE IF NOT EXISTS login_attempts (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Dominio
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS houses (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                        TEXT NOT NULL,
  location                    TEXT,
  notes                       TEXT,
  fiscal_start_month          INTEGER NOT NULL DEFAULT 6
                                CHECK (fiscal_start_month BETWEEN 1 AND 12),
  import_parties              TEXT NOT NULL DEFAULT '[]',
  calendar_reminder_cadence   TEXT NOT NULL DEFAULT 'monthly'
                                CHECK (calendar_reminder_cadence IN ('monthly', 'bimonthly', 'semiannual')),
  calendar_reminder_lead_days INTEGER NOT NULL DEFAULT 3
                                CHECK (calendar_reminder_lead_days >= 0 AND calendar_reminder_lead_days <= 30),
  created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS fiscal_periods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id   INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (house_id, label)
);

CREATE TABLE IF NOT EXISTS dues (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id            INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  fiscal_period_id    INTEGER NOT NULL REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  amount              REAL NOT NULL,
  description         TEXT,
  split_mode          TEXT NOT NULL DEFAULT 'monthly'
                        CHECK (split_mode IN ('monthly', 'bimonthly', 'semiannual', 'custom')),
  -- jsonb: array di numeri (quote personalizzate)
  split_custom        TEXT,
  -- jsonb: array di { periodStart, periodEnd?, amount, label? } — importi rata esatti
  split_amounts       TEXT,
  due_kind            TEXT NOT NULL DEFAULT 'preventivo'
                        CHECK (due_kind IN ('preventivo', 'consuntivo')),
  carry_from_period_id INTEGER REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS prior_balances (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id         INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  fiscal_period_id INTEGER NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  source_period_id INTEGER REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  amount           REAL NOT NULL,
  description      TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (house_id, fiscal_period_id)
);

-- Riferimento circolare con payments: SQLite risolve i nomi delle tabelle referenziate al
-- momento del DML, non del DDL, quindi l'ordine di CREATE TABLE è irrilevante (e ALTER TABLE
-- ADD CONSTRAINT, usato dalla migration Postgres, qui non esisterebbe).
CREATE TABLE IF NOT EXISTS bank_movements (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id                   INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  import_batch_id            TEXT NOT NULL,
  movement_date              TEXT NOT NULL,
  operation                  TEXT,
  details                    TEXT,
  amount                     REAL NOT NULL,
  currency                   TEXT DEFAULT 'EUR',
  source_hash                TEXT NOT NULL,
  fiscal_period_id           INTEGER REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  suggested_fiscal_period_id INTEGER REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  match_confidence           REAL,
  match_reason               TEXT,
  linked_payment_id          INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  status                     TEXT NOT NULL DEFAULT 'unlinked'
                               CHECK (status IN ('unlinked', 'suggested', 'linked', 'ignored')),
  created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (house_id, source_hash)
);

CREATE TABLE IF NOT EXISTS payments (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id             INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  fiscal_period_id     INTEGER NOT NULL REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  amount               REAL NOT NULL,
  date                 TEXT,
  method               TEXT,
  installment_key      TEXT,
  carry_from_period_id INTEGER REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  is_carry_forward     INTEGER NOT NULL DEFAULT 0,
  prior_balance_id     INTEGER REFERENCES prior_balances(id) ON DELETE SET NULL,
  bank_movement_id     INTEGER REFERENCES bank_movements(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Indici (equivalenti a quelli delle migration)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_houses_user_id                 ON houses(user_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_house_id        ON fiscal_periods(house_id);
CREATE INDEX IF NOT EXISTS idx_dues_house_id                  ON dues(house_id);
CREATE INDEX IF NOT EXISTS idx_dues_fiscal_period_id          ON dues(fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_prior_balances_house_id        ON prior_balances(house_id);
CREATE INDEX IF NOT EXISTS idx_prior_balances_fiscal_period_id ON prior_balances(fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_bank_movements_house_id        ON bank_movements(house_id);
CREATE INDEX IF NOT EXISTS idx_payments_house_id              ON payments(house_id);
CREATE INDEX IF NOT EXISTS idx_payments_fiscal_period_id      ON payments(fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_payments_prior_balance_id      ON payments(prior_balance_id);

-- Partial index, come in Postgres.
CREATE INDEX IF NOT EXISTS idx_payments_installment_key
  ON payments(house_id, installment_key)
  WHERE installment_key IS NOT NULL;
