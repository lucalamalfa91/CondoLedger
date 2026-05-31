# Council Output — Plan and Verification

**Topic**: Verifica e fix — dati non visibili in Riepilogo e nel tab Situazione (Movimenti), e razionalizzazione della sezione Dati/Import-Export; + layout Movimenti, separazione import e fix mobile (scope ampliato dall'operatore).
**Date**: 2026-05-31
**Pattern**: Plan / Execute / Verify (protocollo deliberative-voting)
**Session**: `fix-dati-riepilogo-situazione-import`

---

## Executive summary

Le segnalazioni dell'operatore sono state **verificate e confermate**. I dati spariti in **Riepilogo** e **Situazione** avevano un'unica root cause: `today` è una **costante stringa** (`js/utils.js:2`) ma veniva invocata come funzione `today()`, generando un `TypeError` che — in assenza di try/catch in `render()` — interrompeva l'intero rendering per le case con dati. Risolto. La sezione "Dati" era effettivamente un guscio di soli rimandi ed è stata **rimossa** (funzioni preservate in Impostazioni → Avanzate). Su richiesta dell'operatore è stato inoltre corretto un **secondo bug critico mobile** (import Banca finito in un drawer non apribile), separati i due tipi di import in subview distinte e migliorata la leggibilità mobile. Verifica statica: **APPROVE**, `node --check` ALL_OK; restano test runtime manuali raccomandati.

## Context

App statica HTML/CSS/JS (ES modules, no build) con persistenza Supabase. Entry reale `index.html` + moduli `js/` (`gestione-spese-condominiali-supabase.html` è solo un redirect). Il bug era stato introdotto dal commit `0c63eb8` ("feat: new small features") che ha aggiunto `js/compliance-status.js` e `js/payment-guide.js`; il successivo `a261ec1` (CSS mobile) **non** era la causa dei dati spariti.

## Approved plan (summary)

| ID | Task | Esito |
|----|------|-------|
| T-001 | `today()` → `today` in `js/compliance-status.js` (48, 158) | Applicato |
| T-002 | `today()` → `today` in `js/payment-guide.js` (12, 17) | Applicato |
| T-003 | Hardening: try/catch sulle sotto-render in `render()` | Applicato |
| T-004 | Rimozione sezione "Dati" (Opzione A) | Applicato |
| T-005 | Fix import Banca inaccessibile da mobile (drawer fantasma) | Applicato |
| T-006 | Separazione import in due subview (Opzione A) | Applicato |
| T-007 | Leggibilità mobile tabelle Situazione/import | Applicato |

Decisioni operatore al gate: **approva**; sezione Dati → **A**; hardening → **sì**; scope ampliato (layout Movimenti + separazione import + fix mobile).

## Execution summary

File modificati: `js/compliance-status.js`, `js/payment-guide.js`, `js/render.js`, `index.html`, `js/config.js`, `js/main.js`, `css/app.css` (+ report di sessione).

- **T-001/T-002**: rimosse tutte le invocazioni `today()`; `today` usato come stringa ISO `YYYY-MM-DD`.
- **T-003**: helper locale `safe(label, fn)` con `try/catch` + `console.error` attorno a tutte le 17 sotto-render di `render()` (ordine invariato) → un singolo errore non azzera più la pagina.
- **T-004**: rimossi nav-btn `data-view="dati"` e `<section data-view-panel="dati">`; alias `archivio` → `['impostazioni','avanzate']`; `viewMeta.dati` rimosso; Export/Import JSON e Registro restano in Impostazioni → Avanzate.
- **T-005**: rimosso `split-layout--list-first` dal pane Banca; `aside.split-form-pane` → `div` neutro; ID upload preservati.
- **T-006** (Opzione A): due subview `import-doc`/`import-banca` nella sub-nav Movimenti; eliminati `import-sub-nav`/`data-import-tab`/`data-import-panel`/`import-stack` e `setImportTab`; routing aggiornato (`config.js` con `SUBVIEW_ALIASES`/`remapSubview` per deep-link legacy, `render.js`, `main.js`); ID DOM upload/tabelle invariati.
- **T-007**: affordance di scroll orizzontale ("scroll shadow") CSS-only su `.data-table-wrap`/`.table-scroll` in media mobile; nessun impatto su desktop/PDF.

## Verification results

**Esito: APPROVE.** `today(` → 0 occorrenze in `js/`; `render()` difensivo verificato (`render.js:1052-1069`); nessun riferimento orfano a `data-view="dati"`, `viewMeta.dati`, `import-sub-nav`, `data-import-tab`, `setImportTab`; ID DOM invariati; `node --check` ALL_OK.

| AC / Task | Status |
|---|---|
| AC-US003 (root cause `today()`) | PASS |
| AC-US004 (sezione "Dati" + funzioni in Avanzate) | PASS |
| T-003 hardening | PASS |
| T-005 import Banca mobile | PASS (statico) / NEEDS-MANUAL (mobile reale) |
| T-006 separazione + alias + ID invariati | PASS |
| T-007 leggibilità mobile | PASS (statico) / NEEDS-MANUAL (visivo) |
| AC-US001/US002 (dati Riepilogo/Situazione visibili) | NEEDS-MANUAL (causa rimossa; verifica con dati reali) |

## Deviations and resolutions

- Nessuna deviazione dal piano. T-008 (fallback segmented-control) **non** applicato perché adottata l'Opzione A per T-006.

## Recommendation

Procedere con un **test runtime manuale** (vedi Next steps) prima del deploy. I fix critici (T-001/T-002) e il fix mobile Banca (T-005) sono ad alto valore e basso rischio.

## Risks and mitigations

- **Routing import (T-006)** — rischio medio: mitigato con alias legacy (`#importbanca`, `#movimenti/import`) e `node --check`. Da confermare in runtime.
- `sessionStorage 'movimenti-tab'='import'` stantio → ricade su `dovuti`; auto-correggibile.
- Modifica a `today` tocca logica periodo/scadenze → verificare hero compliance e bonifico guidato con la data odierna.

## Open questions

- Nessuna bloccante. (In Round 1 erano emerse domande su desktop/mobile e presenza dati: superate dalla root cause confermata.)

## Next steps

1. Login con casa che ha dati → reload → console **senza `TypeError`**, REST 200.
2. Panoramica: metriche / annualità / versamenti coerenti con `periodSummary`.
3. Situazione: sezioni popolate + cambio esercizio + coerenza con Panoramica.
4. **Mobile**: import Banca pienamente accessibile (niente drawer invisibile); import Documento ok.
5. Deep-link legacy `#importbanca` e `#movimenti/import`.
6. Mobile: affordance scroll tabelle Situazione/import; export PDF invariato.

## Deliberation trail

- **Round 1 (Plan)**: Requirements Planner (PROPOSE) + Task Architect (PROPOSE) → root cause `today()` confermata dal Coordinator. `round-1*.md`.
- **HITL Type C (gate Plan)**: operatore → approve + scope ampliato; Dati = A; hardening = sì.
- **Round 2 (Plan revise)**: Task Architect (PROPOSE) → secondo bug critico mobile (import Banca) + separazione import (Opzione A) + leggibilità mobile. `round-2*.md`.
- **Execute**: Full-Stack Implementer (PROPOSE) → tutti i task applicati. `execution.md`.
- **Verify**: Quality Verifier (APPROVE, nessun OBJECT). `verification.md`.
- **Devil's Advocate**: review saltata dall'operatore (skip). Output finalizzato così com'è.
