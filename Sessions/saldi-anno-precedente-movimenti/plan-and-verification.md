# Council Output — Plan and Verification

**Topic**: Saldi anno precedente in Movimenti, Situazione e PDF  
**Date**: 2026-06-01  
**Pattern**: Plan / Execute / Verify  
**Session**: `Sessions/saldi-anno-precedente-movimenti/`

---

## Executive summary

Implementata la gestione autonoma dei **saldi anno precedente** (tab Movimenti, tabella `prior_balances`, box Situazione/PDF con distinzione extra/sconto e **totale da pagare** senza alterare il preventivo iniziale). Durante il review è emerso e corretto un bug di sicurezza: **email e password restavano nella URL** per preservazione errata della query string nel routing.

## Context

App statica HTML/JS + Supabase. Requisito operatore: saldo separato da dovuti/versamenti; somma al totale da pagare; evidente se extra o sconto.

## Approved plan (summary)

- Tabella `prior_balances`, CRUD dedicato, box Situazione + PDF
- Un saldo per esercizio/immobile
- Preventivo/consuntivo invariati; totale da pagare informativo

## Execution summary

- Migrazione SQL, API, UI, report, PDF, backup v5
- Fix post-review: `url-sanitize.js`, routing hash, listener tabella saldi
- Artifact: `execution.md`

## Verification results

- Code review: PASS su logica totali e sanitizzazione URL
- Manual gate: migrazione Supabase + smoke test produzione (vedi `verification.md`)

## Deviations and resolutions

| Deviation | Resolution |
|-----------|------------|
| Credenziali in URL (produzione) | Fix routing + sanitizer; **cambiare password** |
| Listener CRUD saldi mancante | Aggiunto in `main.js` |
| Import documento → prior_balances | Rimandato (out of scope) |

## Recommendation

**Deploy** dopo: (1) push Vercel, (2) migrazione `20260601120000_prior_balances.sql`, (3) reset password account esposto, (4) smoke test Situazione/PDF e URL pulita.

## Risks and mitigations

| Rischio | Mitigazione |
|---------|-------------|
| Password in log/history | Reset password; sanitizer URL |
| Doppio conteggio con riporti | Warning UI |
| Migrazione non applicata | Checklist deploy |

## Open questions

- Integrare import documento → `prior_balances` in fase 2?
- Mostrare saldo prec. in Panoramica?

## Next steps

1. Deploy + migrazione DB  
2. Cambiare password  
3. Verificare URL `#movimenti/situazione` senza query sensibili  

## Deliberation trail

- Round 1: Planner + Architect PROPOSE → piano approvato con precisazione totali
- Execute: implementazione completata
- Devil's Advocate: OBJECT (6 challenge) → fix URL + listener; altri accettati/dismissed
- Final: `plan-and-verification.md` (questo file)
