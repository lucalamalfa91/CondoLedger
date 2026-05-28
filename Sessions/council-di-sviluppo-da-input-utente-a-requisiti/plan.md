# Piano di implementazione — Session council-di-sviluppo-da-input-utente-a-requisiti

**Data**: 2026-05-28  
**Input operatore**: vedi `operator-input.md`  
**Pattern**: Plan / Execute / Verify  
**Stato**: **Approvato e eseguito** (2026-05-28)

---

## Executive summary

Refactoring del monolite HTML in moduli ES (`index.html`, `css/`, `js/`), introduzione di **esercizi fiscali configurabili** (es. 2024/2025 giugno–maggio) con migrazione dati legacy, e **import Excel Banca Intesa** con parsing client-side, matching suggerito e coda revisione manuale per movimenti non certi.

---

## User stories

| ID | Story | Priorità |
|----|-------|----------|
| US-001 | Struttura modulare frontend (HTML/CSS/JS separati) | P0 |
| US-002 | Parità funzionale post-refactor | P0 |
| US-003 | Deploy Vercel e `npx serve` invariati | P0 |
| US-004 | Configurazione esercizio fiscale (mese inizio, etichetta) | P0 |
| US-005 | UI annualità con label fiscale e intervallo date | P0 |
| US-006 | Dovuti legati a esercizio fiscale | P0 |
| US-007 | Versamenti con derivazione esercizio da data | P0 |
| US-008 | Migrazione dati `year int` → esercizio fiscale | P0 |
| US-009 | Upload file Excel Intesa | P1 |
| US-010 | Anteprima movimenti estratti | P1 |
| US-011 | Auto-associazione movimento → esercizio (con confidenza) | P1 |
| US-012 | Coda movimenti non associati | P1 |
| US-013 | Revisione e conferma manuale prima del commit | P1 |
| US-014 | Idempotenza re-import e tracciabilità origine | P1 |

Dettaglio AC completi in `round-1-requirements-planner.md` (full agent output).

---

## Decisioni architetturali proposte

### 1. Struttura progetto

```
index.html          # entry canonical
css/                # tokens, layout, components
js/                 # main, auth, api, domain, import, ui
gestione-spese-condominiali-supabase.html  # redirect transitorio
```

Nessun build step. Supabase + SheetJS via CDN (`esm.sh`).

### 2. Schema database (nuove migration)

| Entità | Scopo |
|--------|--------|
| `fiscal_settings` | `user_id`, `start_month` (1–12) |
| `fiscal_periods` | `user_id`, `label`, `start_date`, `end_date` |
| `dues` / `payments` | + `fiscal_period_id` FK; `year` deprecato |
| `bank_movements` | movimenti importati, score match, `status`, `linked_payment_id` |

RLS: stesso pattern owner su `houses`.

### 3. Fiscalità

- Esercizio corrente derivato da `start_month` + data operazione
- Etichetta es. `2024/2025` per esercizio giu 2024 – mag 2025
- Migration legacy: ogni `year` esistente → periodo calendario `YYYY-01-01` … `YYYY-12-31`
- Cambio a esercizio giu–mag **non** riallinea automaticamente lo storico migrato

### 4. Import Banca Intesa

- Parsing client-side (SheetJS)
- Parser Intesa IT con header fuzzy
- Score matching (importo, data, descrizione) — soglia ≥0.85 = suggerito, **mai auto-link silenzioso in v1**
- Score <0.50 o match multiplo → `unlinked` per revisione manuale
- Dedup via `source_hash`

---

## Task breakdown

| Fase | Task | Titolo |
|------|------|--------|
| A | T-001–T-005 | Estrazione CSS/HTML/JS, Vercel, README |
| B | T-006–T-009 | Migration fiscal + backfill + API |
| C | T-010–T-014 | UI fiscalità + aggregazioni + JSON backup |
| D | T-015–T-020 | bank_movements + SheetJS + parser + matching + UI |
| E | T-021–T-022 | Verifica manuale end-to-end |

Dipendenze e file per task: vedi `round-1-task-architect.md`.

---

## Open questions (richiedono input operatore)

1. **Layout export Intesa**: serve 1 file `.xlsx` di esempio anonimizzato per mappare le colonne.
2. **Config fiscale per casa vs per utente**: Requirements Planner propone **per casa**; Task Architect propone `fiscal_settings` **per user**. Quale preferisci?
3. **Modello "rata"**: v1 associa movimento → esercizio fiscale / versamento unico. Rate multiple per esercizio sono fuori scope?
4. **Migrazione legacy**: i `year` esistenti restano anno calendario solare (default proposto). OK?
5. **Persistenza coda non associati**: solo sessione browser o tabella Supabase?
6. **Entry point**: `index.html` canonical + redirect dal vecchio HTML. OK?

**Default proposti se non specifichi**: (2) per casa con override utente opzionale; (3) fuori scope v1; (4) sì calendario; (5) Supabase; (6) sì.

---

## Out of scope

Multi-condomino, API banca diretta, multi-banca v1, contabilità completa, bundler obbligatorio, auto-link sotto soglia confidenza.

---

## Rischi

| Rischio | Mitigazione |
|---------|-------------|
| Regressioni auth durante split | Preservare ordine init; test reload/logout |
| Variabilità Excel Intesa | Parser tollerante + fixture esempio |
| Rewrite Vercel rompe asset | Test `/js`, `/css` in preview |
| Ambiguità `year` storico | Migration calendario-safe + avviso UI |

---

## Criteri di accettazione globali

- [ ] App modulare funziona su `npx serve .` e Vercel
- [ ] Login, CRUD case/dovuti/versamenti invariati post-refactor
- [ ] Esercizio giu–mag configurabile con label `2024/2025`
- [ ] Dati legacy migrati con saldi invariati
- [ ] Import Intesa: preview → suggerimenti → revisione manuale → versamenti creati
- [ ] Movimenti dubbi restano non associati finché non confermati

---

## Prossimo passo

**Gate HITL Type C**: l'operatore deve rispondere **approve** / **revise: …** / **stop** prima di qualsiasi modifica al codice.
