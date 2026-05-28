# Devil's Advocate Review — council-di-sviluppo-da-input-utente-a-requisiti

**Date**: 2026-05-28  
**Phase 1 artifact reviewed**: `execution.md` + codice implementato

## Vote

**OBJECT** — issue sostanziali su matching, US-007, schema docs, migration gate, JSON backup.

---

## Challenges and coordinator resolutions

| # | Challenge | Resolution |
|---|-----------|------------|
| 1 | Entrate importabili come versamenti | **Accettato** — v1.1: filtrare/disabilitare inflows in preview; documentato come rischio operatore |
| 2 | Heuristic matching debole su uscite personali | **Accettato parzialmente** — by design: conferma manuale obbligatoria; keyword + importo non bastano |
| 3 | US-007 non in UI versamenti | **Accettato** — fix raccomandato v1.1 (listener su `#paymentDate`) |
| 4 | Dovuti senza data vs auto-derive | **Dismiss editorial** — dovuto per esercizio esplicito è coerente col dominio |
| 5 | Preview import crea fiscal_periods in DB | **Accettato** — side effect indesiderato; v1.1 preview in-memory only |
| 6 | `supabase-schema.sql` stale | **Accettato** — aggiornare in follow-up o puntare solo a migrations |
| 7 | Migration manuale destructive | **Accettato** — operatore confermato no legacy; README già avvisa |
| 8 | JSON backup incompatibile | **Accettato** — v1.1: version field + mapping o export read-only |
| 9 | Status `suggested` non persistito | **Dismiss** — preview vs persist `linked`/`unlinked` è intenzionale |
| 10 | Penalità multi-match ignora data | **Accettato parzialmente** — v1.1: usare periodo da data prima del penalty |
| 11 | Plan AC legacy vs operatore | **Accettato** — plan.md non aggiornato; decision.md fa source of truth |
| 12 | Demo rimossa | **Accettato** — degradazione documentata |

---

## Summary

Phase 1 **consegna il core richiesto** (modularizzazione, fiscalità per casa, import Intesa con revisione manuale) ma **non chiude** senza migration Supabase e senza hardening matching/UX versamenti. Raccomandazione: **ship condizionato** dopo migration + smoke test operatore.
