# Verification — council-di-sviluppo-da-input-utente-a-requisiti

**Date**: 2026-05-28  
**Verifier**: Quality Verifier (Round 1)

## Verification summary

| Area | Result | Notes |
|------|--------|-------|
| Modular frontend (US-001–003) | **PASS** | `index.html`, `css/app.css`, 10 moduli `js/` |
| Fiscal periods (US-004–007) | **PARTIAL** | DB + UI ok; sync data versamento → esercizio mancante in UI |
| Legacy migration (US-008) | **N/A** | Operatore: nessun dato legacy |
| Intesa import (US-009–014) | **PASS** (code review) | Parser, preview, hash dedup, coda unlinked |
| E2E Supabase cloud | **NOT RUN** | Migration non applicata in execution |

**Metodo**: code review + serve statico locale (login screen OK). Nessun test autenticato su DB.

## AC traceability matrix

| US | Key AC | Status | Evidence |
|----|--------|--------|----------|
| US-001 | Struttura modulare | **PASS** | `index.html`, `css/`, `js/` |
| US-002 | Parità funzionale | **PARTIAL** | Auth/CRUD ok in codice; JSON import non fiscal-aware |
| US-003 | Deploy/serve | **PASS** | `vercel.json`, redirect legacy |
| US-004 | Mese inizio esercizio per casa | **PASS** | `houses.fiscal_start_month`, UI immobile |
| US-005 | Label + intervallo date | **PASS** | `render.js` annualità |
| US-006 | Dovuti su fiscal_period_id | **PASS** | migration + `saveDueToSupabase` |
| US-007 | Versamento derivato da data | **PARTIAL** | API fallback solo se periodId vuoto; UI usa select manuale |
| US-008 | Migrazione legacy | **N/A** | Clean slate per scelta operatore |
| US-009–014 | Import Intesa | **PASS** | `intesa.js`, `matching.js`, `bank_movements` |

## Test scenarios recommended

| ID | Scenario | Status |
|----|----------|--------|
| T-004 | Applica migration su Supabase | **Pending operatore** |
| T-005–T-012 | Login, casa, dovuto, import Excel, reload | **Pending operatore** |
| T-013 | JSON export/import fiscal | **FAIL atteso** finché non migrato |

## Regressions & risks

- Migration cloud non eseguita → **blocker deploy**
- JSON backup non allineato al modello fiscal
- `supabase-schema.sql` obsoleto
- Demo locale disabilitata

## Verdict

**Vote**: **OBJECT**

Implementazione **sostanzialmente completa** rispetto al piano approvato, ma **non production-ready** senza migration cloud e fix US-007/JSON. Condizioni per APPROVE: migration applicata + test T-004–T-012 + fix periodo da data versamento (o accettazione esplicita come v1.1).
