# Domain Context: Gestione Spese Condominiali

> Web app per gestire spese condominiali multi-immobile, con backend Node ed SQLite.

## overview

Applicazione single-page (`index.html`) per registrare dovuti, versamenti e saldi per esercizio fiscale su più case/immobili. Autenticazione email/password gestita dal server, con sessione su cookie HttpOnly; i dati sono isolati per utente da un controllo applicativo di ownership. Flussi principali: login → selezione casa → dovuti/versamenti → import estratto conto Banca Intesa → situazione/PDF e dashboard.

Storia: fino a settembre 2026 l'app era un sito statico su Vercel che parlava direttamente con Supabase (PostgREST + Auth + una Edge Function per l'estrazione AI dei documenti). La migrazione a SQLite ha introdotto un server Express, sostituito le policy RLS con un controllo applicativo e rimosso l'import da documento.

## stakeholders

| Stakeholder | Role / Interest | Authority | Notes |
|-------------|-----------------|-----------|-------|
| Proprietario app (utente loggato) | Gestisce i propri immobili e movimenti | Decision | Un account = un insieme di case |
| Maintainer tecnico | Evoluzione codice e schema DB | Decision | Repo privato |

## services

| Service | Port | Schema | Key Components |
|---------|------|--------|----------------|
| Server Express | 3000 (locale), 8080 (container) | N/A | API REST + file statici sulla stessa origine |
| SQLite | file su disco | `server/schema.sql` | `users`, `sessions`, `houses`, `fiscal_periods`, `dues`, `payments`, `prior_balances`, `bank_movements` |

## tech-stack

- **HTML/CSS/JS (ES modules)** — UI senza build step
- **Express** — API e static serving
- **better-sqlite3** — accesso sincrono al database, transazioni con `db.transaction()`
- **node:crypto scrypt** — hashing password, per non aggiungere una seconda dipendenza nativa
- **xlsx** (CDN esm.sh) — parsing dell'estratto conto Intesa
- **Fly.io** — hosting con volume persistente (Vercel non è utilizzabile: filesystem effimero)

## bounded-context-pattern

- `state` globale nel browser (houses, selectedHouseId, user).
- `js/api.js` è l'unico data layer: mantiene le firme storiche (`loadFromSupabase`, `saveHouseToSupabase`, ...) anche se ora parla con la REST API locale. I nomi sono un residuo consapevole della migrazione.
- `js/state.js:mapHouseFromDb` è l'unico punto di traduzione DB→dominio: il server risponde in snake_case proprio per non doverlo riscrivere.
- ID casa: numerici da DB dopo l'insert; ID temporanei `house-*` prima del salvataggio.

## cross-context-integration

- Browser → `/api/auth/*`: login, sessione, cambio password.
- Browser → `/api/houses/...`: CRUD, sempre con cookie di sessione same-origin.
- Isolamento: il middleware `loadHouse` (`server/middleware.js`) risolve la casa verificandone il proprietario e risponde 404; tutte le rotte figlie lo ereditano. È il sostituto delle policy RLS.

## docker-infrastructure

`Dockerfile` su `node:22-slim` (non Alpine: better-sqlite3 ha prebuild solo per glibc). `fly.toml` monta un volume su `/data`. Una sola istanza: SQLite ammette un solo scrittore.

## testing-landscape

- `npm test` → `scripts/smoke-api.test.mjs` su `node --test`, database temporaneo, nessun servizio esterno.
- Copre: isolamento fra utenti, atomicità del collegamento movimento/versamento, idempotenza degli esercizi fiscali, upsert dei saldi, deserializzazione delle colonne JSON, cascade.
- Aree ad alto rischio: ownership sulle rotte figlie, mapping ID locali vs numerici, `PRAGMA foreign_keys` (senza il quale i cascade sono ignorati in silenzio).

## documents-index

| Document | Summary | Relevant to |
|----------|---------|-------------|
| `README.md` | Setup locale, Supabase, deploy Vercel, panoramica import documento | Tutti gli agenti tech |
| `references/document-import.md` | Flusso import preventivo/consuntivo (HITL, split_amounts, Edge Function) | Implementer, QA, Planner |
| `references/intesa-format.md` | Export Excel Banca Intesa | Implementer |
| `supabase-schema.sql` | Schema + policy RLS | Architect, Implementer, QA |
| `Docs/INDEX.md` | Indice documentazione | Tutti |
