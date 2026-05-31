## Requirements Planner — Round 1 Response

**Vote**: PROPOSE

**Reasoning**:

L'input operatore ("vedo 3/4 di layout sul mio iPhone 15") descrive un sintomo classico di **overflow orizzontale dell'intera pagina**: esiste almeno un elemento più largo del viewport CSS (~393px su iPhone 15), quindi il browser mostra una barra di scroll orizzontale di pagina e l'utente percepisce solo ~75% della larghezza utile. L'aspettativa è "il layout si adatta allo schermo": tradotto in requisito misurabile significa che, a parità di contenuti, **nessun elemento deve eccedere la larghezza del viewport** e **non deve esserci scroll orizzontale di pagina** (solo eventuali scroll *interni* a contenitori dedicati, es. tabelle dense).

Il CSS attuale contiene già parecchia infrastruttura responsive (breakpoint 1100/860/520px, bottom-nav, card list `.data-card`, form-sheet, `.data-table-wrap{overflow:auto}`, `.main{overflow-x:hidden}`). Tuttavia la regola `.data-table-wrap table, .table-scroll table { min-width: 36rem }` (≈576px) e altri elementi a larghezza potenzialmente fissa restano candidati primari all'overflow se non sono contenuti correttamente. La sessione precedente aveva già marcato MOB-001/002/003 e il release criterion **R1 (no scroll orizzontale su Dovuti/Versamenti/Panoramica)** ma **senza fix applicato**. Questo round formalizza il requisito in modo testabile su **viewport 393×852** così che Execute e Verify abbiano un bersaglio oggettivo.

Definizioni operative (valide per tutti i criteri):
- **Viewport di test mobile**: 393×852 CSS px (iPhone 15, Safari iOS); secondario 390×844.
- **Viewport di test desktop (non-regressione)**: 1440×900 e 1280×800.
- **"Nessun overflow orizzontale di pagina"**: `document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1` (tolleranza 1px per arrotondamenti) **e** nessun elemento con `getBoundingClientRect().right > window.innerWidth + 1`.
- **"Adatta allo schermo"**: il contenuto si riflowa entro la larghezza; eventuali tabelle dense scorrono **dentro** il proprio contenitore `overflow:auto`, non spostano la pagina.
- **Touch target**: area cliccabile ≥ 44×44 CSS px.
- **Dati di test**: account reale autenticato, ≥1 casa selezionata, esercizio con ≥3 dovuti, ≥3 versamenti, ≥1 import documento e ≥1 import banca con righe.

**Details**:

### Requirements summary

Rendere la SPA pienamente adattiva su mobile (iPhone 15 e in generale), eliminando lo scroll orizzontale di pagina e i contenuti tagliati su tutte le viste autenticate principali — **Panoramica/Dashboard, Dovuti, Versamenti, Immobili/Impostazioni, Import (documento + banca)** — incluse tabelle, form, modali/sheet/drawer e touch target, **senza regressioni desktop**. Il successo è verificabile in modo binario tramite misure sul viewport 393×852.

### User stories (US-###)

- **US-001** — *Come* utente mobile (iPhone 15), *voglio* che nessuna pagina autenticata abbia scroll orizzontale, *così che* veda il 100% del layout e non solo ~3/4.
- **US-002** — *Come* utente, *voglio* che la **Panoramica/Dashboard** (compliance hero, cards KPI, pannello pagamenti, lista annuale) si adatti alla larghezza, *così che* tutti i dati siano leggibili senza scroll laterale.
- **US-003** — *Come* utente, *voglio* che la vista **Dovuti** (lista/tabella + form) stia nello schermo, *così che* possa consultare e gestire i dovuti senza tagli.
- **US-004** — *Come* utente, *voglio* che la vista **Versamenti** (lista + form) stia nello schermo, *così che* possa registrare e rivedere i versamenti senza scroll orizzontale.
- **US-005** — *Come* utente, *voglio* che **Immobili/Impostazioni** (gestione case: lista + form) si adatti, *così che* possa gestire le case senza overflow.
- **US-006** — *Come* utente, *voglio* che la vista **Import** (documento amministratore + banca Intesa, stepper e anteprime) si adatti, *così che* possa importare senza contenuti fuori schermo.
- **US-007** — *Come* utente mobile, *voglio* che le **tabelle dati dense** non spostino la pagina (card list o scroll interno al contenitore), *così che* la larghezza di pagina resti pari al viewport.
- **US-008** — *Come* utente, *voglio* che **form, input, select e textarea** restino entro la larghezza, *così che* nessun campo causi overflow o sia tagliato.
- **US-009** — *Come* utente, *voglio* che **modali, sheet, drawer e dialog** (form-sheet, house-drawer, onboarding, conferma, dup import) si adattino al viewport, *così che* nessun overlay ecceda lo schermo.
- **US-010** — *Come* utente touch, *voglio* **touch target ≥44×44px** su azioni riga (Modifica/Elimina) e controlli interattivi, *così che* siano usabili sul telefono.
- **US-011** — *Come* utente desktop, *voglio* che il layout desktop resti invariato dopo i fix mobile, *così che* non si introducano regressioni.
- **US-012** — *Come* utente iOS, *voglio* che il contenuto si **riflowi** (non venga rimpicciolito/scalato) e rispetti barra indirizzi e safe-area, *così che* "adatti allo schermo" significhi davvero reflow e non zoom-out.

### Acceptance criteria per story (AC-US###-##)

**US-001 — No overflow orizzontale di pagina (globale)**
- **AC-US001-01** — *Given* viewport 393×852 autenticato con dati di test, *When* apro in sequenza Panoramica, Dovuti, Versamenti, Immobili, Import, *Then* su ciascuna `documentElement.scrollWidth - documentElement.clientWidth <= 1`.
- **AC-US001-02** — *Given* le stesse viste, *When* misuro tutti gli elementi, *Then* nessuno ha `getBoundingClientRect().right > window.innerWidth + 1` né `left < -1`.
- **AC-US001-03** — *Given* viewport 393×852, *When* trascino orizzontalmente sul `body`, *Then* la pagina non si sposta lateralmente (nessuna barra/gesture di scroll orizzontale a livello pagina).
- **AC-US001-04** — *Given* secondario 390×844, *When* ripeto AC-US001-01, *Then* l'esito resta verde (nessuna regola hard-coded a 393px).

**US-002 — Panoramica/Dashboard**
- **AC-US002-01** — *Given* Panoramica a 393px, *Then* `compliance-hero`, `.cards` (KPI) e pannello pagamenti restano entro la larghezza senza overflow di pagina.
- **AC-US002-02** — *Given* Panoramica a 393px, *Then* le card KPI sono impilate a 1 colonna (coerente con `@media max-width:520px`) e i valori non vengono troncati orizzontalmente.
- **AC-US002-03** — *Given* la "Panoramica pagamenti" con molte righe a 393px, *Then* eventuale scroll è **interno** al contenitore (`.dashboard-payments-scroll`/card), non di pagina (verifica AC-US001-01 ancora verde).

**US-003 — Dovuti**
- **AC-US003-01** — *Given* Dovuti a 393px con ≥3 dovuti, *Then* nessun overflow di pagina (AC-US001-01/02 verdi).
- **AC-US003-02** — *Given* Dovuti a 393px, *Then* i dati riga sono visibili tramite card list (`.data-list-cards`/`.data-card`) **oppure** tabella con scroll interno al wrapper, senza tagliare colonne chiave (descrizione, importo, stato).
- **AC-US003-03** — *Given* Dovuti a 393px, *When* apro il form di inserimento, *Then* il form (sheet o inline) sta nel viewport e i pulsanti azione sono raggiungibili senza scroll orizzontale.

**US-004 — Versamenti**
- **AC-US004-01** — *Given* Versamenti a 393px con ≥3 versamenti, *Then* nessun overflow di pagina (AC-US001-01/02 verdi).
- **AC-US004-02** — *Given* Versamenti a 393px, *Then* la lista è consultabile (card o scroll interno `.versamenti-table-scroll`) e l'eventuale `payments-summary` non eccede la larghezza.
- **AC-US004-03** — *Given* Versamenti a 393px, *When* apro il form versamento, *Then* il form sta nel viewport e i campi importo/data/causale non escono dallo schermo.

**US-005 — Immobili/Impostazioni**
- **AC-US005-01** — *Given* gestione case a 393px con ≥2 case, *Then* nessun overflow di pagina (AC-US001-01/02 verdi).
- **AC-US005-02** — *Given* `house-manage-layout` a 393px, *Then* lista case e form sono impilati a 1 colonna senza tagli; il form di modifica casa sta nel viewport.

**US-006 — Import (documento + banca)**
- **AC-US006-01** — *Given* Import a 393px, *Then* nessun overflow di pagina su nessuna sub-view (documento, banca) (AC-US001-01/02 verdi).
- **AC-US006-02** — *Given* lo stepper import (`.import-stepper`) a 393px, *Then* gli step vanno a capo (`flex-wrap`) senza spingere la pagina oltre la larghezza.
- **AC-US006-03** — *Given* l'anteprima estrazione documento e l'anteprima Intesa (tabelle larghe) a 393px, *Then* scorrono **internamente** al proprio contenitore, mantenendo AC-US001-01 verde.

**US-007 — Tabelle dati dense**
- **AC-US007-01** — *Given* qualunque vista con tabella `min-width:36rem` a 393px, *Then* la tabella è contenuta in un wrapper `overflow:auto` il cui bordo destro **non** supera `window.innerWidth + 1` (lo scroll è interno, non di pagina).
- **AC-US007-02** — *Given* viste con card list mobile (Dovuti/Versamenti/Panoramica annuale), *Then* sotto 860px è mostrata la card list e la tabella desktop ridondante è nascosta (no duplicazione visibile, coerente MOB-011).
- **AC-US007-03** — *Given* una card riga a 393px, *Then* titolo, importo e badge stato sono leggibili e `importo` non causa overflow (gestione `white-space`/wrap).

**US-008 — Form, input, select, textarea**
- **AC-US008-01** — *Given* qualunque form a 393px, *Then* ogni `input/select/textarea` ha `getBoundingClientRect().right <= window.innerWidth + 1`.
- **AC-US008-02** — *Given* `select`/chip con testo lungo (es. nome casa) a 393px, *Then* il testo è troncato con ellissi e non allarga il contenitore oltre il viewport.
- **AC-US008-03** — *Given* un blocco con stringhe lunghe non spezzabili (es. IBAN/causale in `guide-copy-row code`) a 393px, *Then* va a capo/spezza (`word-break`) senza overflow di pagina.

**US-009 — Modali/sheet/drawer/dialog**
- **AC-US009-01** — *Given* a 393px, *When* apro form-sheet, house-drawer, onboarding-dialog, confirm-dialog, dup-dialog, *Then* ciascun overlay ha larghezza ≤ viewport e non genera scroll orizzontale di pagina.
- **AC-US009-02** — *Given* un overlay aperto a 393px, *When* scorro il suo contenuto, *Then* lo scroll è verticale e interno all'overlay; il backdrop copre l'intero viewport senza eccederlo.
- **AC-US009-03** — *Given* un overlay aperto, *When* lo chiudo, *Then* la pagina sottostante resta senza overflow orizzontale (nessun residuo di larghezza).

**US-010 — Touch target**
- **AC-US010-01** — *Given* azioni riga (`.row-actions .btn`, Modifica/Elimina) a 393px, *Then* ciascun bersaglio è ≥44×44 CSS px.
- **AC-US010-02** — *Given* bottom-nav, FAB, icon-btn, sub-nav e voci menu utente a 393px, *Then* ciascun controllo interattivo ha area ≥44×44px.

**US-011 — Non-regressione desktop**
- **AC-US011-01** — *Given* viewport 1440×900 autenticato, *Then* `nav-rail` (240px) e griglia `dashboard` 2-colonne sono invariati; `.cards` resta a 4 colonne.
- **AC-US011-02** — *Given* 1440×900 e 1280×800, *Then* nessuna delle viste introduce scroll orizzontale di pagina e gli split-layout (Dovuti/Versamenti/Immobili) restano a 2 colonne con form sticky.
- **AC-US011-03** — *Given* il confronto before/after a desktop, *Then* nessun cambiamento visivo non intenzionale sulle viste (le modifiche mobile sono confinate ai breakpoint ≤860/≤520px o a regole che non alterano il desktop).

**US-012 — Reflow iOS / viewport / safe-area**
- **AC-US012-01** — *Given* iPhone 15 Safari, *Then* il contenuto si **riflowa** alla larghezza (no pinch-to-fit / nessuno scale-down): la dimensione del testo del body resta nel range definito da `--text-base` e non è rimpicciolita per far stare il contenuto.
- **AC-US012-02** — *Given* meta viewport `width=device-width, initial-scale=1.0`, *Then* l'utente può comunque effettuare zoom (nessun `user-scalable=no` / `maximum-scale=1` introdotto): accessibilità preservata.
- **AC-US012-03** — *Given* iOS con barra indirizzi visibile e safe-area, *Then* bottom-nav/FAB/toast rispettano `env(safe-area-inset-*)` e l'altezza usa `100dvh`, senza creare overflow o contenuti coperti.

### Out of scope

- Ridisegno UX/visuale, gerarchia informativa, riduzione tab (MOB-005), rimozione CTA duplicati (MOB-006): fuori da "fix overflow/adattamento".
- Nuove feature dominio (Centro verifica, bonifico guidato, split versamento, ecc. — §F del report precedente).
- Sostituzione `alert()` con toast (UX-008), redirect post-save (FLOW-004), onboarding (FLOW-001): non legati all'overflow.
- Modifiche allo schema DB, RLS, Edge Functions o logica di import.
- PWA, gesti swipe avanzati sulle card, animazioni.
- Ottimizzazione tastiera virtuale che copre gli input (MOB-007) salvo regressione introdotta dai fix; non è obiettivo primario di questo round.
- Supporto browser legacy non basati su standard moderni (`dvh`, `env()`, `clamp()`, `color-mix`).

### Open questions

1. **OQ-1** — Per le tabelle dense su mobile: l'obiettivo è **card list** ovunque (Dovuti/Versamenti/Panoramica) o è accettabile **scroll interno** al wrapper come fallback? (Impatta US-007; la card list è già parzialmente prevista nel CSS.) → da confermare con Task Architect.
2. **OQ-2** — Viewport di accettazione canonico: confermo **393×852** (iPhone 15) come primario e **390×844** come secondario; OK includere anche un breakpoint molto stretto (es. 360px Android) nel set di verifica?
3. **OQ-3** — Il fix può toccare anche `index.html`/`js/render.js` (es. markup card, classi wrapper) oltre a `css/app.css`, come indicato nell'input operatore? Conferma scope file.
4. **OQ-4** — Esiste un elemento "colpevole" già noto dell'overflow (es. una tabella non avvolta da `.data-table-wrap`, un `width` fisso, un'immagine)? Se sì, la diagnosi runtime spetta a Quality Verifier/Implementer; qui resta requisito di esito, non di causa.
5. **OQ-5** — Soglia di tolleranza overflow: confermo **1px** (arrotondamenti subpixel) come massimo accettato per "nessun overflow".
6. **OQ-6** — Definizione "non-regressione desktop": è sufficiente confronto visivo + assenza overflow su 1440/1280, o serve uno screenshot diff formale come gate in Verify?
