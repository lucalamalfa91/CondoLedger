# Council Output — Plan and Verification

**Topic**: Ristrutturazione progetto, fiscalità configurabile, import Excel Banca Intesa  
**Date**: 2026-05-28  
**Pattern**: plan-execute-verify  
**Session**: council-di-sviluppo-da-input-utente-a-requisiti

---

## Executive summary

Il council ha prodotto una **SPA modulare** (`index.html` + `css/` + `js/`) con **esercizio fiscale per casa** (default giugno–maggio, etichetta `2024/2025`), schema Supabase esteso (`fiscal_periods`, `bank_movements`) e **import Excel Banca Intesa** con anteprima, scoring e coda manuale per movimenti non certi.

**Verdict Verify**: OBJECT (gap US-007 UI, JSON backup, migration cloud non testata).  
**Devil's Advocate**: OBJECT con 12 challenge — la maggior parte accettati come follow-up v1.1.

**Raccomandazione**: considerare Phase 1 **completata con riserve**; deploy dopo migration SQL e smoke test operatore.

---

## Context

Input operatore (vedi `operator-input.md`):

1. Struttura progetto più leggibile (non monolite HTML)
2. Annualità/fiscalità configurabile (es. 2024/2025 giu–mag)
3. Import Excel Intesa con associazione rata/esercizio; dubbi lasciati liberi

Risposte operatore al launch:

- File Intesa: `Lista_Operazioni_28052026.xlsx` → formato documentato in `references/intesa-format.md`
- Nessun dato legacy → migration destructive accettata

---

## Approved plan (summary)

| Epic | Scope |
|------|--------|
| A | Modularizzazione frontend, Vercel, redirect legacy |
| B | Schema fiscal + API Supabase |
| C | UI esercizio fiscale, aggregazioni |
| D | Import Intesa (SheetJS, matching, revisione) |

22 task (T-001–T-022). Gate HITL Plan approvato con risposte operatore.

---

## Execution summary

| Deliverable | Stato |
|-------------|--------|
| `index.html`, `css/app.css`, `js/*` (10 moduli) | ✅ |
| Migration `20260528100000_fiscal_and_bank.sql` | ✅ (da applicare su Supabase) |
| UI fiscalità + import banca | ✅ |
| `references/intesa-format.md` | ✅ |
| README aggiornato | ✅ |

**Deviazioni**: no backfill legacy; config fiscale per **casa** (`houses.fiscal_start_month`); demo disabilitata.

---

## Verification results

| Criterio | Esito |
|----------|--------|
| US-001–003 Modularità / deploy | PASS |
| US-004–006 Fiscalità | PASS |
| US-007 Versamento da data | PARTIAL |
| US-008 Legacy | N/A |
| US-009–014 Import Intesa | PASS (code review) |
| E2E cloud | NOT RUN |

Dettaglio: `verification.md`

---

## Deviations and resolutions

| Gap | Azione raccomandata |
|-----|---------------------|
| Migration non su cloud | Operatore: eseguire SQL in Supabase |
| US-007 UI | v1.1: `#paymentDate` aggiorna `#paymentPeriod` |
| JSON import | v1.1: schema version + sync Supabase |
| `supabase-schema.sql` stale | Allineare a migrations o deprecare |
| Inflows selezionabili in import | v1.1: filtrare solo uscite per versamenti |

---

## Recommendation

**Procedere al deploy** dopo:

1. Eseguire `supabase/migrations/20260528100000_fiscal_and_bank.sql`
2. Smoke test: casa → mese esercizio → dovuto → import Excel → conferma subset
3. Pianificare patch v1.1 per US-007 UI e JSON backup

---

## Risks and mitigations

| Rischio | Mitigazione |
|---------|-------------|
| DROP TABLE su DB popolato | Solo se confermato no dati (operatore OK) |
| Falsi match import | Conferma manuale; soglia 0.85 |
| Auth regression | Pattern `onAuthStateChange` preservato |

---

## Open questions

- Nessuna bloccante; follow-up v1.1 prioritizzato in DA review.

---

## Next steps

1. **Operatore**: migration Supabase + test con file Excel reale
2. **Maintainer**: fix US-007 (1 listener), filtro uscite import, aggiorna `supabase-schema.sql`
3. **Council resume**: opzionale sessione v1.1 se si vuole chiudere OBJECT → APPROVE

---

## Deliberation trail

| Step | Esito |
|------|--------|
| Plan Round 1 | PROPOSE (Requirements + Architect) |
| HITL Plan | Approvato con risposte operatore (Intesa file, no legacy) |
| Execute | `execution.md` — implementazione completata |
| Verify Round 1 | **OBJECT** — `verification.md` |
| Devil's Advocate | **OBJECT** — `devils-advocate-review.md`; resolutions consolidate |
| Final output | `decision.md` (questo file) |

Devil's Advocate review: **eseguita** (operatore ha chiesto chiusura giro). Amendments non applicati al codice in questa sessione → vedi `decision-after-devils-review.md` per backlog v1.1.

---

## User stories delivered

| ID | Status |
|----|--------|
| US-001 | ✅ |
| US-002 | ⚠️ JSON parziale |
| US-003 | ✅ |
| US-004 | ✅ |
| US-005 | ✅ |
| US-006 | ✅ |
| US-007 | ⚠️ |
| US-008 | N/A |
| US-009–014 | ✅ |

## Architectural decisions

- **T-001**: Entry `index.html`, ES modules, no bundler
- **T-006**: `fiscal_periods` per casa, non `fiscal_settings` globali
- **T-015**: `bank_movements` + `source_hash` dedup
- **T-019**: Matching client-side, soglia 0.85 suggest, no auto-link silenzioso

## Tests

Manuali raccomandati T-004–T-014 in `verification.md`. Nessuna CI automatizzata.
