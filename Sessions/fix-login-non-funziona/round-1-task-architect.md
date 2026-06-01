## Task Architect — Round 1 Response

**Vote**: PROPOSE

**Reasoning**:

Causa radice più probabile: **SyntaxError** in `js/document-import-api.js` — `const hints` dichiarato due volte (righe 84 e 134) in `extractFromDocument`. Poiché `main.js` importa transitivamente questo modulo, **l'intero bundle non esegue**: niente `initApp`, niente binding submit, niente login.

**Details**:

### Task breakdown

| ID | Title | Files | Depends on |
|----|-------|-------|------------|
| T-001 | Riprodurre sintomo | Browser DevTools | — |
| T-002 | Fix duplicate `hints` | `js/document-import-api.js` | T-001 |
| T-003 | Smoke test bootstrap auth | `js/main.js`, `js/auth.js` | T-002 |
| T-004 | Verifica login E2E | Browser Network | T-003 |
| T-005 | Session restore + logout | `js/auth.js` | T-004 |
| T-006 | (Cond.) Hardening boot errors | `js/main.js` | T-004 se needed |
| T-007 | (Cond.) Auth URL / PKCE | `js/api.js` | T-006 |
| T-008 | Doc entry point | `council/domain-context.md` | T-004 |

### Proposed fix (T-002)

Rimuovere seconda dichiarazione riga ~134; riusare `hints` già calcolato a riga ~84.
