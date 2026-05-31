# Plan — Fix layout mobile responsive (gate umano richiesto)

**Sessione:** `fix-layout-mobile-responsive`
**Pattern:** Plan / Execute / Verify · **Data:** 2026-05-31
**Stato:** in attesa di approvazione operatore (Execute = modifiche al codice)

---

## Problema

Su iPhone 15 (viewport CSS ~393×852, Safari iOS) il layout si vede solo per ~3/4: sintomo di **overflow orizzontale dell'intera pagina** (un elemento più largo del viewport dilata la pagina). Il layout deve adattarsi a qualunque schermo, senza scroll orizzontale di pagina né contenuti tagliati, **senza regressioni desktop**.

## Diagnosi (root-cause, con evidenze)

1. **Manca una rete di sicurezza globale anti-overflow.** Solo `body.authenticated{overflow:hidden}` (`css/app.css:25`) e `.main{overflow-x:hidden}` (`:35`); `html` e `.dashboard` (`:32`/`:241`) senza vincolo; nessun `img/svg/table/pre/code {max-width:100%}`. Su iOS un singolo discendente troppo largo dilata l'Initial Containing Block → effetto "3/4".
2. **Header non blindato.** `.header`/`.topbar-left` (`:34`/`:107`) senza `min-width:0`; figli `flex-shrink:0` (`.house-bar`, `.add-house-btn` `:42-45`) possono dilatare la traccia `1fr`.
3. **Catena contenuto non blindata.** `.view`→`.subview`→`.situazione-section` (`:173`/`:60`) senza `min-width:0`; tabelle `min-width:36rem`=576px (`:98`).
4. **Wrapping testo.** Celle generiche e `.data-card-title`/`.data-card-meta` (`:327-328`) senza `overflow-wrap`.
5. **Audit tabelle:** nessuna tabella visibile su mobile risulta priva di card/wrapper di scroll → punto di sola verifica.

## Requisiti (sintesi, dettaglio in `round-1-requirements-planner.md`)

Criterio di successo **binario** su 393×852 (secondari 390×844, 360px; tolleranza 1px):
`documentElement.scrollWidth - clientWidth <= 1` **e** nessun elemento con `getBoundingClientRect().right > innerWidth + 1`, su Panoramica, Dovuti, Versamenti, Immobili/Impostazioni, Import — incluse tabelle (scroll **interno**), form, modali/sheet/drawer, touch target ≥44×44. Desktop (1440/1280) invariato.

## Task breakdown (Execute)

| ID | Titolo | File | Dipende da | Done quando |
|----|--------|------|------------|-------------|
| T-001 | Rete di sicurezza globale: `html, body { max-width:100%; overflow-x:clip }` + `img, svg, canvas, table, pre, code { max-width:100% }` | `css/app.css` | — | A 393px su tutte le view nessuno scroll orizzontale di pagina; niente tagliato |
| T-002 | Blindatura header: `min-width:0` su `.header` e `.topbar-left`; ellissi/shrink del titolo | `css/app.css` | T-001 | Topbar non dilata la pagina a 393px |
| T-003 | Blindatura catena contenuto: `min-width:0` su `.view`, `.subview`, `.situazione-sections`, `.situazione-section` | `css/app.css` | T-001 | Tabelle scrollano **internamente** al wrapper, mai a livello pagina |
| T-004 | Wrapping difensivo testo: `overflow-wrap:anywhere` su `td`, `.data-card-title`, `.data-card-meta`, `.muted` (escluso `.amount`/numeri) | `css/app.css` | T-001 | Stringhe lunghe vanno a capo senza spingere la larghezza |
| T-005 | Audit read-only tabelle visibili su mobile; flag se emerge elemento non contenuto → eventuale fix mirato | `js/render.js`, `index.html` (audit) | T-003 | Ogni tabella mobile è card o dentro `overflow:auto`; findings documentati |
| T-006 | Verifica manuale a 393×852 (+390/360) su tutte le view e check desktop ≥1100px | — (Verify) | T-001..T-005 | Nessun overflow di pagina mobile; nessuna regressione desktop |

## Rischi & mitigazioni

- Regressione desktop da `overflow-x` globale → applicare solo a `html`/`body`, preferire `clip`; verificare ≥1100px.
- `overflow-x` vs `position:sticky` → lo sticky `thead` vive in `.data-table-wrap{overflow:auto}`, non su `html` → non rotto.
- `min-width:0` solo su item-contenitore della catena, non su bottoni/chip con larghezza intenzionale.
- `overflow-wrap:anywhere` limitato a testo, escluso importi/numeri (`white-space:nowrap`).

## Non-goals

Redesign/ristrutturazione viste; rimozione scroll **interno** tabelle; refactor JS (salvo gap T-005); modifiche schema/RLS/auth; cambio breakpoint esistenti; PWA/gesti/animazioni; sostituzione `alert`/redirect/onboarding.

## Decisioni del coordinatore (open questions)

- Card list dove già presente + scroll interno per tabelle dense (nessuna conversione extra ora).
- Scope: prioritariamente `css/app.css`; `index.html`/`render.js` solo su gap T-005.
- Non-regressione desktop: misure overflow 1440/1280 + check visivo (no gate screenshot-diff).

---

## Gate umano

**Approvi questo piano?** Rispondi:
- **approve** → procedo con Execute (modifiche a `css/app.css`).
- **revise: …** → indico cosa cambiare (conta verso i max round).
- **stop** → mi fermo.
