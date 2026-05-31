# Domain Context: Gestione Spese Condominiali

> Web app statica per gestire spese condominiali multi-immobile con persistenza Supabase.

## overview

Applicazione single-page (`index.html`) per registrare dovuti, versamenti e saldi per esercizio fiscale su più case/immobili. Autenticazione Supabase (email/password); dati isolati per utente tramite RLS. Deploy statico su Vercel. Flussi principali: login → selezione casa → dovuti/versamenti (manuale o **import documento amministratore** con AI) → import banca Intesa → situazione/PDF e dashboard.

Problemi noti risolti di recente: deadlock `onAuthStateChange` async + `getSession()` che bloccava le chiamate REST; le case ora si caricano/salvano via API se la sessione è attiva.

## stakeholders

| Stakeholder | Role / Interest | Authority | Notes |
|-------------|-----------------|-----------|-------|
| Proprietario app (utente loggato) | Gestisce i propri immobili e movimenti | Decision | Un account = un insieme di case |
| Amministratore condominio (implicito) | Fonte PDF/DOCX/foto preventivo e consuntivo | Informed | Import estrae tabella anagrafica; l'utente sceglie la propria riga in anteprima |
| Maintainer tecnico | Evoluzione codice e schema DB | Decision | Repo privato, deploy Vercel |

## services

| Service | Port | Schema | Key Components |
|---------|------|--------|----------------|
| Static frontend | 3456 (locale `npx serve`) | N/A | `gestione-spese-condominiali-supabase.html` |
| Supabase Auth | HTTPS | `auth.users` | PKCE, session in `localStorage` |
| Supabase REST (PostgREST) | HTTPS | `public` | `houses`, `fiscal_periods`, `dues`, `payments`, `bank_movements`, `document_imports` |
| Supabase Edge Functions | HTTPS | N/A | `extract-document` (OpenAI, estrazione preventivo/consuntivo) |

## tech-stack

- **HTML/CSS/JS (ES modules)** — UI monolitica, nessun build step
- **@supabase/supabase-js@2** (CDN esm.sh) — client Auth + PostgREST
- **PostgreSQL (Supabase)** — persistenza con RLS `auth.uid() = user_id`
- **Vercel** — hosting statico, rewrite verso file HTML

## bounded-context-pattern

- Unico file applicativo con `state` globale (houses, selectedHouseId, user, supabase).
- Funzioni: `loadFromSupabase`, `saveHouseToSupabase`, `ensureAuthenticated`, rendering UI per view (`dashboard`, `immobile`, ecc.).
- ID casa: numerici da DB dopo insert; ID temporanei `house-*` prima del salvataggio.
- Schema SQL in `supabase/migrations/20240101000000_initial_schema.sql` e `supabase-schema.sql`.

## cross-context-integration

- Browser → Supabase Auth: login, session restore, password update.
- Browser → PostgREST: CRUD su `houses` / `dues` / `payments` con JWT utente.
- Policy RLS: accesso solo alle righe dove `houses.user_id = auth.uid()`; dues/payments tramite subquery su `houses`.

## docker-infrastructure

Nessun Docker in runtime. Deploy: push su Vercel; DB gestito da Supabase cloud. Setup locale: `npx serve .` per evitare limiti CORS su ES modules.

## testing-landscape

- Nessuna suite automatizzata nel repo.
- Verifica manuale: login, creazione casa, reload pagina, Network tab (`supabase.co/rest/v1/*`).
- Aree ad alto rischio: auth session sync, RLS, mapping ID locali vs numerici, form submit senza chiamate silenziose.

## documents-index

| Document | Summary | Relevant to |
|----------|---------|-------------|
| `README.md` | Setup locale, Supabase, deploy Vercel, panoramica import documento | Tutti gli agenti tech |
| `references/document-import.md` | Flusso import preventivo/consuntivo (HITL, split_amounts, Edge Function) | Implementer, QA, Planner |
| `references/intesa-format.md` | Export Excel Banca Intesa | Implementer |
| `supabase-schema.sql` | Schema + policy RLS | Architect, Implementer, QA |
| `Docs/INDEX.md` | Indice documentazione | Tutti |
