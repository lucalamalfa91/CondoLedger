# Council Output — Plan and Verification

**Topic**: Non sta funzionando la login  
**Date**: 2026-06-01  
**Pattern**: plan-execute-verify  
**Session**: fix-login-non-funziona

---

## Executive summary

La login non funzionava perché un **SyntaxError** in `js/document-import-api.js` (doppia dichiarazione `const hints`) impediva il caricamento di `main.js` e quindi l'intero bootstrap auth. Fix applicato: **1 riga rimossa**. Verificato in locale: console pulita, session restore, logout, app con dati.

---

## Context

App statica HTML/JS + Supabase Auth. L'operatore segnalava login non funzionante. Il council ha diagnosticato che il form login era statico — nessun listener JS — a causa di errore di parse in un modulo importato transitivamente da `main.js`.

---

## Approved plan (summary)

1. Confermare SyntaxError in console (T-001)
2. Rimuovere seconda `const hints` in `extractFromDocument` (T-002)
3. Smoke test bootstrap + login E2E + logout (T-003–T-005)

Piano approvato dall'operatore il 2026-06-01.

---

## Execution summary

- **Root cause**: `const hints` dichiarato alle righe 84 e 134 di `js/document-import-api.js`
- **Fix**: rimossa riga 134; riuso di `hints` esistente nel return
- **Scope**: 1 file, 1 riga

---

## Verification results

| Check | Pass |
|-------|------|
| Console senza SyntaxError al load | ✅ |
| `initApp` completa, bottone "Accedi" abilitato | ✅ |
| Session restore → app autenticata con dati | ✅ |
| Logout → schermata login | ✅ |

Quality Verifier vote: **APPROVE**

---

## Deviations and resolutions

Nessuna deviazione dal piano. T-006 (hardening condizionale) e T-008 (doc) non necessari per risolvere il bug.

---

## Recommendation

**Deploy** la modifica su Vercel (push su main). Hard refresh consigliato agli utenti con cache browser.

---

## Risks and mitigations

| Rischio | Mitigazione |
|---------|-------------|
| Cache CDN/browser modulo vecchio | Hard refresh; verificare hash file in Network post-deploy |
| Regressione import documenti | `hints` logic invariata; solo duplicato rimosso |

---

## Open questions

1. Confermare su **Vercel produzione** dopo deploy
2. Test esplicito submit con password errata (AC-US002-01) — opzionale

---

## Next steps

1. Commit e push (se richiesto dall'operatore)
2. Verifica produzione post-deploy
3. (Opzionale) aggiungere lint/build step che catturi SyntaxError prima del deploy

---

## Deliberation trail

| Step | Artifact | Outcome |
|------|----------|---------|
| Launch | `config-snapshot.md` | Session `fix-login-non-funziona` |
| Round 1 Plan | `round-1.md`, `plan.md` | Root cause identificata |
| HITL Plan | Operator | **approve** |
| Execute | `execution.md` | Fix 1 riga applicato |
| Verify | `verification.md` | APPROVE |
| Devil's Advocate | — | Pending operator (yes/skip) |
