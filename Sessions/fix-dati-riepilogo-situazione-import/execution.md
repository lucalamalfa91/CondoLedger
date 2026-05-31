# Execute Phase — Full-Stack Implementer

Sessione: `fix-dati-riepilogo-situazione-import`
Data: 2026-05-31

## Tasks completed

### T-001 — Fix `today()` in compliance (CRITICO)
- File: `js/compliance-status.js`
- Modifiche:
  - riga ~48: `const now = today();` → `const now = today;`
  - riga ~158: `findPeriodByDate(house, today())` → `findPeriodByDate(house, today)`
- `today` è già importato da `./utils.js` (riga 3) ed è una stringa ISO `YYYY-MM-DD`. La semantica resta invariata: i confronti `dueBy < now` e `slot.periodEnd < now` operano su stringhe ISO ordinabili lessicograficamente.
- Esito: risolve il `TypeError: today is not a function` che bloccava `renderComplianceHero` → l'intero render di Panoramica/Situazione.

### T-002 — Fix `today()` in payment-guide (CRITICO)
- File: `js/payment-guide.js`
- Modifiche:
  - riga ~12: `findPeriodByDate(house, today())` → `findPeriodByDate(house, today)`
  - riga ~17: `const now = today();` → `const now = today;`
- `today` già importato (riga 3). Esito: evita che il bug riemerga in `renderPaymentGuide`.

### T-003 — Hardening render() (difensivo)
- File: `js/render.js`, funzione `render(authRenderAccount)` (~1043).
- Aggiunta helper locale `const safe = (label, fn) => { try { fn(); } catch (e) { console.error('[render]', label, e); } };` e wrapping di ogni sotto-render:
  `complianceHero, metrics, annualBlocks, houseDrawerList, paymentGuide, postImportBanner, dues, payments, dashboardPayments, situazione, movements, houseForm, periodSelects, documentImportPreview, bankImportPreview, bankImportBatches, unlinkedMovements`.
- Ordine originale mantenuto. Una sotto-render che lancia non blocca più le altre; l'errore viene loggato in console.

### T-004 — Rimuovere sezione "Dati" (Opzione A)
- File: `index.html`
  - Rimosso il `nav-btn` con `data-view="dati"` nella nav-rail (~riga 81).
  - Rimossa l'intera `<section class="view" data-view-panel="dati">` (sub-nav Backup/Registro + i due pannelli, ~righe 335-354), incluso `#demoBtn`.
  - La bottom-nav mobile non conteneva "Dati" (verificato): nessuna modifica necessaria lì.
- File: `js/config.js`
  - Alias `archivio: ['dati','backup']` → `archivio: ['impostazioni','avanzate']`.
  - Rimosso il blocco `viewMeta.dati` (subviews `backup`/`registro` ora orfane).
- `els.demoBtn`: `render.js:~1165` lo recupera con `document.getElementById('demoBtn')` (ora `null`); `js/main.js` lo usa già con optional chaining (`els.demoBtn?.addEventListener`), quindi nessun crash.

### T-005 — Fix import Banca inaccessibile da mobile (CRITICO mobile)
- File: `index.html`, pannello import banca.
- Rimosso `split-layout--list-first` dal `<div>` contenitore (resta `split-layout`, che su mobile collassa a 1 colonna senza drawer `position:fixed`).
- Cambiato `<aside class="split-form-pane stack">` in `<div class="split-form-pane stack">` (contenitore neutro; `.split-form-pane` su desktop è solo `position:sticky`, su mobile diventa statico — nessun comportamento a drawer residuo perché legato a `.split-layout--list-first`).
- ID preservati: `bankImportFile`, `bankImportConfirm`, `bankImportBatches`, `bankImportDeleteAll`, `bankImportPreview`, `unlinkedMovements`.

### T-006 — Separazione import documenti (Opzione A — APPLICATA)
Promossi i due import a **subview di primo livello** della sub-nav "Movimenti", eliminando la `import-sub-nav` annidata.
- File: `index.html`
  - Sub-nav Movimenti: il singolo tab `data-subview="import"` ("Import") sostituito da due tab:
    - `data-subview="import-doc"` → "Import doc."
    - `data-subview="import-banca"` → "Import banca"
  - La subview `data-subview-panel="import"` (con `import-sub-nav` + `import-stack`) è stata divisa in due subview separate:
    - `<div class="subview" data-subview-panel="import-doc">` → pannello documento amministratore
    - `<div class="subview" data-subview-panel="import-banca">` → pannello Banca Intesa (con il fix T-005)
  - Eliminate `import-sub-nav`, gli attributi `data-import-tab`/`data-import-panel` e il wrapper `import-stack` esterno.
  - CTA "Importa documento" (hero panoramica ~131 e quick-add mobile) aggiornate: `data-nav-subview="import" data-import-tab="documento"` → `data-nav-subview="import-doc"`.
- File: `js/config.js`
  - `VIEW_ALIASES`: `importbanca: ['movimenti','import']` → `importbanca: ['movimenti','import-banca']`.
  - `viewMeta.movimenti.subviews`: rimosso `import`, aggiunti `'import-doc'` e `'import-banca'`; sottotitolo view aggiornato.
  - Aggiunto `SUBVIEW_ALIASES` per i deep-link legacy a livello di subview e `remapSubview()` integrata in `resolveView()`:
    `{ movimenti: { import: 'import-doc', importbanca: 'import-banca', documento: 'import-doc', banca: 'import-banca' } }`.
    Così vecchi link/hash a `#movimenti/import` e `#importbanca` puntano alle nuove subview.
- File: `js/render.js`
  - `complianceCtaBtn`: rimossa l'iniezione di `data-import-tab="documento"` (non più necessaria).
  - La logica subview (`defaultSubview`, `syncSubviewUI`, `setView`) è invariata e gestisce nativamente le nuove subview; `collectDom` raccoglie i tab/pannelli via `[data-subview]`/`[data-subview-panel]`.
- File: `js/compliance-status.js`
  - I 4 CTA con `subview: 'import'` aggiornati a `subview: 'import-doc'` (coerenza; comunque coperti dal remap).
- File: `js/main.js`
  - Rimossa la funzione `setImportTab` e tutte le sue chiamate (in `navigate`, in `wireNavigation`, nell'onboarding).
  - Rimosso il listener su `.import-sub-nav [data-import-tab]` e il guard `if (tab.closest('.import-sub-nav')) return;`.
  - `navigate('movimenti','import')` aggiornati: documento → `import-doc` (~430), banca Excel → `import-banca` (~568); onboarding step finale → `import-doc`.
- File: `css/app.css`
  - Rimossa la regola orfana `.import-sub-nav { margin-bottom: ... }`.

### T-007 — Leggibilità mobile tabelle Situazione + anteprime import
- File: `css/app.css`, blocco `@media (max-width:860px)`, regola `.table-scroll, .data-table-wrap`.
- Intervento **a basso rischio e CSS-only**: aggiunta un'affordance di scroll orizzontale chiara tramite tecnica "scroll shadow" (gradienti `linear`/`radial` con `background-attachment: local/scroll`). Le ombre laterali compaiono quando c'è altro contenuto fuori vista e svaniscono ai bordi: segnalano visivamente che la tabella è scrollabile orizzontalmente.
- Mantenuto `min-width:36rem` sulle tabelle e lo scroll fluido già presente. Nessuna conversione in card → **nessun impatto su PDF (jsPDF, render separato) né su desktop** (regola dentro la media query mobile).

## Files changed
- `js/compliance-status.js` — T-001, T-006 (CTA)
- `js/payment-guide.js` — T-002
- `js/render.js` — T-003, T-006 (complianceCtaBtn)
- `index.html` — T-004, T-005, T-006
- `js/config.js` — T-004, T-006
- `js/main.js` — T-006 (rimozione setImportTab + routing)
- `css/app.css` — T-006 (rimozione regola orfana), T-007 (scroll affordance)

## Deviations from plan
- Nessuna deviazione sostanziale. T-006 implementato con l'**Opzione A** (preferita), non il fallback.
- T-005: scelto di degradare `aside.split-form-pane` a `div.split-form-pane` (contenitore neutro) mantenendo la classe per lo sticky su desktop; il comportamento a drawer era legato esclusivamente a `.split-layout--list-first`, ora rimosso.

## Manual verification performed
- `node --check` su `config.js`, `compliance-status.js`, `payment-guide.js`, `render.js`, `main.js` → nessun errore di sintassi (`ALL_OK`).
- Controllo coerenza (grep) su: `today()`, `data-view="dati"`, `viewMeta.dati`, `import-sub-nav`, `data-import-tab`, `data-import-panel`, `setImportTab`, `data-subview="import"`, `data-subview-panel="import"` → **nessun riferimento residuo** nel codice applicativo (`js/`, `index.html`, `css/`).
- I `navigate('movimenti','import')` residui sono stati ridiretti a `import-doc`/`import-banca`; eventuali deep-link legacy restano comunque coperti da `SUBVIEW_ALIASES`.
- NB: `design_bundle/...` contiene ancora marcatori `data-view="dati"` ma è materiale di design, non l'app reale → non toccato.

## Known limitations
- Verifica runtime in browser (login Supabase, chiamate REST, scroll mobile reale) non eseguita in questo ambiente: si raccomanda smoke test su dispositivo/emulatore (Panoramica e Situazione popolate, accesso import banca da mobile, deep-link `#importbanca`).
- Un valore stantio `movimenti-tab='import'` in `sessionStorage` farà ricadere la subview su `dovuti` (default) anziché `import-doc` (il remap agisce in `resolveView`, non sul path `sessionStorage`); impatto trascurabile e auto-correggibile al primo click sui nuovi tab.
