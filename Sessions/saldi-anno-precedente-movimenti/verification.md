# Verification — Saldi anno precedente + URL credentials

**Verifier**: Quality Verifier (post-DA)  
**Date**: 2026-06-01

## Checklist

| ID | Check | Status |
|----|-------|--------|
| V-01 | Tab Movimenti → Saldi prec. visibile | Manual |
| V-02 | CRUD saldo → Network `prior_balances` | Manual (post-migrazione) |
| V-03 | Reload → saldo persistito | Manual |
| V-04 | Situazione: box dedicato, preventivo iniziale invariato, totale da pagare = somma | Manual |
| V-05 | PDF: sezione Saldi anno precedente | Manual |
| V-06 | Assenza in Dovuti/Versamenti/Registro | Manual |
| V-07 | URL dopo login/navigazione **senza** `email`/`password` in query | **Fix code review OK** — verify in browser |
| V-08 | Inline sanitizer rimuove credenziali al primo paint | **Fix code review OK** |

## URL security fix

- Root cause: `history.replaceState` includeva `location.search` nel routing hash.
- Fix: `js/url-sanitize.js`, sanitizer inline in `index.html`, `syncRouteHash` usa solo pathname + hash.
- **Critico**: password esposta in URL → cambiare password account.

## Verdict

**PASS with conditions**: deploy codice + migrazione DB + verifica manuale V-01–V-07 in produzione.
