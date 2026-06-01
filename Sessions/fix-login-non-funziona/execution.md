# Execution — Fix login non funziona

**Session**: `Sessions/fix-login-non-funziona/`  
**Date**: 2026-06-01  
**Status**: Complete

---

## Tasks executed

| ID | Status | Notes |
|----|--------|-------|
| T-001 | ✅ | SyntaxError riprodotto prima del fix |
| T-002 | ✅ | Rimossa seconda `const hints` in `extractFromDocument` |
| T-003 | ✅ | Bootstrap auth OK post-fix |
| T-004 | ✅ | Session restore + app shell visibile con dati |
| T-005 | ✅ | Logout torna a login screen |
| T-006 | — | Non necessario |
| T-008 | — | Deferred (out of scope minimo) |

---

## Change applied

**File**: `js/document-import-api.js`

Rimossa la dichiarazione duplicata `const hints = inferDocumentHintsFromFiles(sorted);` alla fine di `extractFromDocument`. La variabile `hints` calcolata all'inizio della funzione (per `FormData`) viene riutilizzata nel return:

```js
return applyDocumentHints(normalizeExtraction(body), hints);
```

**Diff**: 1 riga rimossa.

---

## Pre-fix symptoms

- Console: `Uncaught SyntaxError: Identifier 'hints' has already been declared`
- `main.js` non eseguito → form login statico, submit senza effetto
- Nessuna chiamata Supabase Auth al click "Accedi"

## Post-fix smoke test (localhost:3456)

- Console pulita al load
- Dynamic import `/js/document-import-api.js` → OK
- `initApp` completa: bottone "Accedi" abilitato
- Session restore: app caricata con case e dati (`#panoramica`)
- Logout ("Esci"): torna schermata login con email precompilata da localStorage

---

## Files modified

- `js/document-import-api.js` (1 line removed)

## Files not modified

- `js/auth.js`, `js/main.js`, `js/api.js` — auth flow invariato; il bug era upstream nel grafo moduli
