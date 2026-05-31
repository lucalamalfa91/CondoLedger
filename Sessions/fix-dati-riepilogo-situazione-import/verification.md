# Verify Phase — Quality Verifier

Sessione: `fix-dati-riepilogo-situazione-import`
Data: 2026-05-31
Metodo: verifica statica (Grep/Read) + `node --check` sui moduli JS modificati. Verifica runtime browser/Supabase **non** eseguita in questo ambiente.

## Verification summary

Le modifiche implementate corrispondono al piano approvato e a tutti i task (T-001…T-007).
Il bug critico (`today()` chiamato come funzione) è stato eliminato in entrambi i moduli;
`render()` è ora difensivo; la sezione "Dati" è stata rimossa (Opzione A) senza perdita di
funzioni; l'import Banca non usa più il layout a drawer su mobile; gli import sono separati in
due subview di primo livello con alias legacy; gli ID DOM upload/tabelle sono invariati.
`node --check` → `ALL_OK` (nessun errore di sintassi).

Resta da confermare con **smoke test runtime in browser** (vedi sezione test manuali) gli AC
che dipendono da dati reali / DOM live / mobile reale.

## AC traceability matrix

| AC ID | Status | Evidence |
|-------|--------|----------|
| AC-US001-01/02/03 (Riepilogo mostra dati) | **NEEDS-MANUAL** | Causa rimossa (vedi T-001/T-003); rendering corretto dipende da dati reali — verifica runtime con casa popolata |
| AC-US001-04 (nessun errore console / REST 200) | **NEEDS-MANUAL** | `today(` assente in `js/` (0 match); `render()` con try/catch → da confermare console pulita su reload |
| AC-US002-01/02/03 (Situazione popolata + cambio esercizio + coerenza) | **NEEDS-MANUAL** | `renderSituazione` raggiunta (non più bloccata dall'eccezione); valori reali da verificare a runtime |
| AC-US003-01/02 (root cause `today()`) | **PASS** | `js/utils.js:2` `today` è stringa ISO; tutte le call-site corrette a `today` (compliance-status `48`,`158`; payment-guide `12`,`17`) |
| AC-US004-01 (Dati ospita funzioni reali o rimossa) | **PASS** | nav-rail (`index.html:79-81`) e bottom-nav (`414-418`) non contengono più "Dati"; nessun `data-view="dati"` né `data-subview-panel="dati"` |
| AC-US004-02 (no placeholder "Apri Avanzate") | **PASS** | section `dati` rimossa interamente; `viewMeta.dati` assente in `js/config.js` |
| AC-US004-03 (Export/Import + Registro raggiungibili senza duplicazione) | **PASS** | Impostazioni → Avanzate (`index.html:372-385`): `importFileAdv`, `exportBtnAdv`, `movementsAdv` presenti; alias `archivio → ['impostazioni','avanzate']` (`config.js:16`) |
| T-003 (hardening render) | **PASS** | `render.js:1052-1069`: helper `safe()` con try/catch + `console.error`; ordine preservato; copre complianceHero, metrics, annualBlocks, dashboardPayments, situazione (+ tutte le altre sotto-render) |
| T-005 (import Banca mobile) | **PASS (statico)** / **NEEDS-MANUAL (mobile reale)** | pane `data-subview-panel="import-banca"` (`index.html:291-310`) usa `split-layout` **senza** `--list-first` → niente drawer `position:fixed`; collassa a 1 colonna ≤1100px (`app.css:227`) |
| T-006 (separazione import Opzione A) | **PASS** | due tab `import-doc`/`import-banca` (`index.html:156-157`) e due pannelli (`250`,`291`); `import-sub-nav`/`data-import-tab`/`data-import-panel`/`setImportTab` assenti dal codice; `SUBVIEW_ALIASES` + `remapSubview()` in `config.js:22-29,61-73`; alias `importbanca` ridiretto |
| T-006 (ID DOM invariati) | **PASS** | `documentImportFile`,`bankImportFile`,`bankImportPreview`,`unlinkedMovements`,`bankImportBatches`,`documentImportPreview` tutti presenti (`index.html:266,297,305,307,300,288`); raccolti da `collectDom` |
| T-007 (leggibilità mobile, no regressione desktop/PDF) | **PASS (statico)** / **NEEDS-MANUAL (visivo)** | affordance scroll (gradienti, `app.css:100-108`) dentro `@media (max-width:860px)`; `min-width:36rem` mantenuto (`110`); CSS-only → nessun impatto su jsPDF/desktop |

## Verifiche statiche eseguite

- `today(` in `js/` → **0 match** (bug eliminato). `today` è stringa (`utils.js:2`); call-site: `compliance-status.js:48,158`, `payment-guide.js:12,17` usano la stringa.
- Marcatori orfani (`data-view="dati"`, `data-subview-panel="dati"`, `viewMeta.dati`, `import-sub-nav`, `data-import-tab`, `data-import-panel`, `setImportTab`, `data-subview="import"`, `data-subview-panel="import"`) → **0 match** nel codice applicativo (solo nei doc di sessione).
- `setImportTab` in `main.js` → assente; `navigate('movimenti', …)` ridiretti a `import-doc` (`430`,`778`) e `import-banca` (`568`).
- CTA compliance: 4× `subview: 'import-doc'` (`compliance-status.js:27,40,109,138`); `render.js:341` usa `cta.subview` (nessuna iniezione `data-import-tab`).
- `els.demoBtn`: `render.js:1164` ritorna `null`; `main.js:702` usa optional chaining (`els.demoBtn?.addEventListener`) → nessun crash.
- `node --check` su config, compliance-status, payment-guide, render, main, utils, mobile-cards → `ALL_OK`.

## Regressioni & rischi

- **Basso** — `sessionStorage 'movimenti-tab' = 'import'` stantio: il remap agisce in `resolveView`, non sul path sessionStorage → la subview ricade su `dovuti` (default) anziché `import-doc`. Auto-correggibile al primo click; impatto trascurabile.
- **Basso** — classe `.import-stack` (CSS `app.css:175`) ancora usata dal div interno del pane Banca (`index.html:303`): non è orfana, nessuna regressione.
- **Da confermare a runtime** — coerenza valori Riepilogo↔Situazione e cambio esercizio: il fix sblocca il render ma non altera i calcoli; basso rischio.

## Test scenari raccomandati (runtime manuale)

1. Login con casa **che ha dati** → reload → **console senza `TypeError`** (REST 200). [AC-US001-04]
2. Panoramica: metriche + tabella annualità + versamenti visibili e coerenti con `periodSummary`/`totals`. [AC-US001-01/02]
3. Casa **vuota**: empty-state corretto. [AC-US001-03]
4. Situazione: `#situazioneSummary`/`#situazioneSections` popolati; cambio esercizio aggiorna; coerenza con Panoramica. [AC-US002-*]
5. Hero compliance + bonifico guidato coerenti con data odierna.
6. **Mobile**: import Banca accessibile (upload/conferma/lista/anteprima visibili, niente drawer invisibile). [T-005]
7. **Deep-link legacy**: `#importbanca` e `#movimenti/import` → subview `import-banca`/`import-doc`. [T-006]
8. **Mobile**: tabelle Situazione/anteprime con affordance scroll leggibile; export **PDF** invariato. [T-007]

## Verdict

**APPROVE** — implementazione conforme al piano e agli AC; nessun gap materiale né riferimento
orfano; sintassi OK. Gli AC funzionali (US-001/US-002) e gli aspetti mobile/PDF restano
**NEEDS-MANUAL**: richiedono smoke test runtime in browser (dati reali, console, mobile, deep-link)
prima del rilascio.
