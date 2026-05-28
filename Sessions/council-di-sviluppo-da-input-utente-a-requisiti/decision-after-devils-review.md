# Decision after Devil's Advocate Review

**Session**: council-di-sviluppo-da-input-utente-a-requisiti  
**Date**: 2026-05-28  
**Base document**: `decision.md` (non modificato)

---

## Amended recommendation

Phase 1 resta **condizionata** al deploy. Il backlog v1.1 sotto è **prioritario** prima di considerare Verify → APPROVE.

---

## Backlog v1.1 (ordered)

| P | Task | Status |
|---|------|--------|
| P0 | Applicare migration Supabase + smoke test | **Pending operatore** |
| P0 | Listener `#paymentDate` → aggiorna `#paymentPeriod` | ✅ `main.js` + `syncPaymentPeriodSelect` |
| P1 | Import preview senza `ensureFiscalPeriod` | ✅ preview in-memory |
| P1 | Disabilitare entrate in import | ✅ `matching.js` + UI disabled checkbox |
| P1 | Matching: periodo da data prima di penalità multi-importo | ✅ `matching.js` |
| P2 | JSON v2 + sync Supabase + migrazione v1 | ✅ `backup.js`, `syncBackupToSupabase` |
| P2 | `supabase-schema.sql` allineato | ✅ |

---

## Accepted as-is (no code change required now)

- Conferma manuale obbligatoria per import (US-013)
- Dedup `source_hash` (US-014)
- Clean-slate migration (US-008 N/A)
- Demo disabilitata con Supabase obbligatorio

---

## Operator checklist (immediate)

- [ ] Supabase SQL Editor → esegui `20260528100000_fiscal_and_bank.sql`
- [ ] `npx serve .` → login
- [ ] Crea casa, imposta mese inizio = Giugno
- [ ] Registra dovuto per esercizio corrente
- [ ] Import banca → carica `Lista_Operazioni_28052026.xlsx`
- [ ] Conferma solo movimenti condominio; associa manualmente i restanti

---

## Council closure

Sessione **chiusa** con deliverable Phase 1 in repo e gap documentati. Riprendere con `council-resume` o nuova sessione per v1.1.
