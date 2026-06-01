# Plan — Fix login non funziona

**Session**: `Sessions/fix-login-non-funziona/`  
**Date**: 2026-06-01  
**Status**: Pending operator approval

---

## Problem statement

L'operatore segnala che **la login non funziona**. In runtime locale (`http://localhost:3456/`) la console mostra:

```
Uncaught SyntaxError: Identifier 'hints' has already been declared
```

in `js/document-import-api.js`. Poiché `main.js` importa questo modulo a top-level, **`initApp()` non viene mai eseguito**: il form login è statico, il submit non invoca `signInWithPassword`, nessuna chiamata a Supabase Auth.

---

## Root cause

In `extractFromDocument` (`js/document-import-api.js`):

- Riga 84: `const hints = inferDocumentHintsFromFiles(sorted);` (per FormData)
- Riga 134: `const hints = inferDocumentHintsFromFiles(sorted);` (duplicata, stesso scope)

JavaScript non permette due `const` con lo stesso nome → SyntaxError → intero grafo moduli da `main.js` non carica.

---

## User stories (requirements)

### US-001 — Accesso con credenziali valide
- **AC-US001-01**: Submit credenziali valide → entro 5 s app visibile, email in header.
- **AC-US001-02**: POST `auth/v1/token` → 200; opzionale GET `houses` → 200.
- **AC-US001-03**: View iniziale `panoramica` (o route hash valida).

### US-002 — Credenziali non valide
- **AC-US002-01**: Password errata → messaggio in `#loginError`, form riabilitato.
- **AC-US002-02**: Campi vuoti → "Inserisci email e password".
- **AC-US002-03**: Bottone torna "Accedi" e non resta disabled.

### US-003 — Ripristino sessione al reload
- **AC-US003-01**: Sessione valida → reload mantiene app autenticata.
- **AC-US003-02**: Sessione assente → login screen senza spinner infinito.

### US-004 — Bootstrap senza blocco UI
- **AC-US004-01**: Nessuna sessione → dopo init bottone "Accedi" abilitato.
- **AC-US004-02**: Nessun errore console auth al load.
- **AC-US004-03**: Config mancante → messaggio "Impossibile connettersi al servizio".

### US-005 — Logout e re-login
- **AC-US005-01**: Logout → torna login, dati azzerati.
- **AC-US005-02**: Re-login funzionante.

*(US-006–US-008 recovery/rete: out of scope per fix minimo; verificare se tempo disponibile.)*

---

## Task breakdown

| ID | Task | Owner | Files | Done when |
|----|------|-------|-------|-----------|
| T-001 | Confermare SyntaxError in console | Implementer | — | ✅ Già verificato dal Coordinator |
| T-002 | Rimuovere seconda `const hints` (riga 134) | Implementer | `js/document-import-api.js` | Modulo parseabile; zero errori console al load |
| T-003 | Smoke test bootstrap | Implementer/QA | `js/main.js`, `js/auth.js` | `initApp` completa; bottone "Accedi" abilitato |
| T-004 | Login E2E con credenziali reali | Implementer/QA | Browser Network | POST auth → 200; `#appShell` visibile |
| T-005 | Session restore + logout | QA | `js/auth.js` | Reload mantiene sessione; logout OK |
| T-006 | (Cond.) Hardening se login ancora rotto | Implementer | `js/main.js` | Solo se T-004 fallisce |
| T-008 | Aggiornare doc entry point | Implementer | `council/domain-context.md` | Opzionale post-fix |

---

## Proposed fix (T-002)

```js
// js/document-import-api.js — extractFromDocument
// BEFORE (line 134-135):
//   const hints = inferDocumentHintsFromFiles(sorted);
//   return applyDocumentHints(normalizeExtraction(body), hints);

// AFTER:
return applyDocumentHints(normalizeExtraction(body), hints);
```

Riutilizza `hints` già calcolato alla riga 84.

---

## Risks

| Rischio | Mitigazione |
|---------|-------------|
| Fix insufficiente | T-004 Network tab |
| Regressione import documenti | Smoke: modulo carica; import non in scope critico login |
| Cache Vercel | Hard refresh post-deploy |

---

## Out of scope

- Refactor auth / PKCE
- Modifiche RLS/schema
- Suite test automatizzata
- OAuth / signup

---

## Verification plan (post-Execute)

1. Apri `http://localhost:3456/` — console pulita
2. Submit login — Network mostra `auth/v1/token`
3. Reload — sessione ripristinata
4. Logout — torna login

---

## Operator questions (optional, for context)

1. Vedi lo stesso errore console (`hints already declared`)?
2. Ambiente: locale, Vercel, o entrambi?
3. Dopo il fix proposto, vuoi verifica anche recovery password (US-006)?

---

## Approval gate

**Reply**: `approve` | `revise: …` | `stop`
