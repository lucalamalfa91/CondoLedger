## Task Architect — Round 1 Response

**Vote**: PROPOSE

**Reasoning**:

Analisi diagnostica con evidenze `file:line`. Il progetto live è `index.html` + `css/app.css` (411 righe) + moduli ES in `js/` (`render.js`, `mobile-cards.js`, `main.js`). Il file `gestione-spese-condominiali-supabase.html` e `design_bundle/` non sono la build servita per questa sessione.

Il layout mobile è già in gran parte predisposto (bottom-nav, nav-rail nascosta, card lists, wrapper di scroll), quindi **non serve un redesign**: l'overflow orizzontale a 393px nasce da pochi punti dove la catena grid/flex non è "blindata" a `min-width:0` e dove manca una rete di sicurezza globale. Le correzioni sono quindi CSS-first, additive e a basso rischio.

**Root-cause più probabili (in ordine di probabilità):**

1. **Manca una rete di sicurezza globale anti-overflow.** L'unico contenimento è `body.authenticated { overflow: hidden }` (`css/app.css:25`) e `.main { overflow-x: hidden }` (`css/app.css:35`). Ma `html` non ha alcun vincolo e `.dashboard { display:grid; grid-template-columns: var(--nav-rail-w) 1fr ... }` (`css/app.css:32`, su mobile diventa `1fr` a `css/app.css:241`) **non ha `max-width`/`overflow-x`**. Su iOS Safari un singolo discendente più largo del viewport allarga l'Initial Containing Block **prima** del clipping di `.main`, producendo l'effetto "vedo 3/4 del layout" (pagina rimpicciolita/pannabile). Non esiste neppure `img/svg/table/pre/code { max-width:100% }`.

2. **Header come vettore di overflow.** `.header` (`index.html:86-119`) è `display:flex; justify-content:space-between` (`css/app.css:34`) ed è un grid-item di `.dashboard` **senza `min-width:0`** → la sua larghezza minima = min-content. Contiene `.topbar-left` (`css/app.css:107`, senza `min-width:0`) e `.house-bar` con figli `flex-shrink:0`: drawer-btn, `.house-select`, `.add-house-btn` (`css/app.css:42-45`). A 393px questi elementi possono superare la larghezza disponibile e dilatare la traccia `1fr`, allargando l'intera pagina. Su mobile `.house-select` diventa `flex:1; min-width:0` (`css/app.css:398`), ma `.topbar-left`/`.header` restano senza `min-width:0`.

3. **Catena grid/flex del contenuto non blindata a `min-width:0`.** `.view { display:grid }` (`css/app.css:173`) → `.subview` (`css/app.css:60`) → `.situazione-section` (generata in `render.js:560/572/585/598/607/616`) **non hanno `min-width:0` esplicito**. Le tabelle wrapped hanno `min-width: 36rem` = 576px (`css/app.css:98`). I wrapper `.data-table-wrap`/`.table-scroll` hanno `min-width:0; overflow:auto` (`css/app.css:88-97`) e quindi scrollano internamente, ma un item intermedio con `min-width:auto` può comunque propagare la larghezza min-content verso l'alto.

4. **Tabelle visibili su mobile → audit dei wrapper.** Risultato dell'audit: Dovuti/Versamenti/Dashboard usano card via `dataListHtml` (`render.js:455/501/528` + `mobile-cards.js:9-12`) ✓; le sezioni Situazione sono wrappate in `.data-table-wrap` (`render.js:560+`) ✓; le tabelle Import/Dati sono in `.data-table-wrap` (`index.html:293-310`) ✓; `movementsAdv` (`els.movements`, `render.js:1135` → `index.html:409`) è `panel-table-wrap` → `display:none` su mobile (`css/app.css:259`) ✓. **Nessuna tabella visibile su mobile risulta priva di wrapper/card** → questo punto diventa una verifica, non una correzione.

5. **Stringhe lunghe non spezzabili.** IBAN/codici usano `word-break:break-all` (`css/app.css:382`) ✓, ma le celle generiche (descrizione/dettaglio) e `.data-card-title`/`.data-card-meta` (`css/app.css:327-328`) non hanno `overflow-wrap`. Una descrizione lunga senza spazi può spingere la larghezza.

**Details**:

### Architectural notes / root-cause diagnosis

- Lo scroll **interno** delle tabelle (`min-width:36rem` dentro `overflow:auto`) è un comportamento **voluto e accettabile**: il requisito operatore vieta lo scroll orizzontale dell'**intera pagina**, non quello interno a un contenitore. Non rimuoviamo `min-width:36rem`.
- Le correzioni sono concentrate in `css/app.css`. Nessuna modifica a `render.js`/`index.html` risulta necessaria dall'audit (T-005 lo conferma e flagga solo eventuali gap).
- Strategia a strati: (a) rete di sicurezza globale, (b) blindatura header, (c) blindatura catena contenuto, (d) wrapping difensivo. Ogni task è isolato e reversibile.

### Task breakdown (T-###)

| ID | Title | Files | Depends on | Done when |
|----|-------|-------|------------|-----------|
| T-001 | Rete di sicurezza globale anti-overflow: `html, body { max-width:100%; overflow-x:hidden }` (o `clip`) + `img, svg, canvas, table, pre, code { max-width:100% }` | `css/app.css` | — | A 393px su tutte le view `document.scrollingElement.scrollWidth <= clientWidth` (nessuno scroll orizzontale di pagina); nessun contenuto tagliato |
| T-002 | Blindatura header: aggiungere `min-width:0` a `.header` e `.topbar-left`; consentire ellissi/shrink del titolo (`.header-titles .page-title`) così che la topbar non dilati la pagina | `css/app.css` | T-001 | A 393px header e contenuti interni stanno entro il viewport, nessuna espansione orizzontale generata dalla topbar |
| T-003 | Blindatura catena grid/flex del contenuto: `min-width:0` su `.view`, `.subview`, `.situazione-sections`, `.situazione-section` (e altri item intermedi privi) | `css/app.css` | T-001 | Gli item possono restringersi; le tabelle scrollano **internamente** al wrapper, mai a livello pagina |
| T-004 | Wrapping difensivo testo lungo: `overflow-wrap:anywhere` su celle/`td`, `.data-card-title`, `.data-card-meta`, `.muted` | `css/app.css` | T-001 | Descrizioni/email/stringhe lunghe vanno a capo senza spingere la larghezza |
| T-005 | Audit (sola lettura) di tutte le tabelle visibili su mobile: confermare card o wrapper di scroll. Flag separato se emerge una tabella non wrappata → eventuale fix in `render.js`/`index.html` | `js/render.js`, `index.html` (audit) | T-003 | Ogni tabella su mobile è card o dentro `overflow:auto`; findings documentati (al momento: nessun gap) |
| T-006 | Verifica manuale a 393×852 (DevTools device + device reale) su tutte le view/subview (Panoramica, Dovuti, Versamenti, Import, Situazione, Dati, Impostazioni) + check desktop ≥1100px | — (manuale) | T-001,T-002,T-003,T-004,T-005 | Nessuno scroll orizzontale di pagina, niente tagliato su mobile; nessuna regressione desktop |

### Risks & mitigations

- **Regressione desktop da `overflow-x:hidden` globale** → applicare solo a `html`/`body` (non a contenitori con sticky/scroll), preferire `overflow-x:clip` se necessario; verificare ≥1100px in T-006. Modifiche additive e reversibili.
- **`overflow-x:hidden` e `position:sticky`** → il `thead` sticky vive dentro `.data-table-wrap { overflow:auto }` (`css/app.css:99-105`), non su `html`, quindi non viene rotto.
- **`min-width:0` che collassa larghezze volute** → applicarlo solo a item-contenitore della catena layout, non a bottoni/chip; nessun `min-width:0` su elementi con larghezza intenzionale.
- **Scroll interno tabella vs scroll pagina** → mantenere `min-width:36rem` per leggibilità; lo scroll resta confinato al wrapper (comportamento desiderato).
- **`overflow-wrap:anywhere` troppo aggressivo** → limitato a celle/testo, non a numeri/`.amount` (che usano `white-space:nowrap`).

### Non-goals

- Redesign del layout o cambio della struttura delle view.
- Rimozione dello scroll orizzontale **interno** alle tabelle.
- Refactor del rendering JS (`render.js`/`mobile-cards.js`) salvo gap emerso in T-005.
- Modifiche allo schema Supabase / RLS / auth (nessun impatto backend).
- Cambio dei breakpoint esistenti (860/1100/520px) se non strettamente necessario.
