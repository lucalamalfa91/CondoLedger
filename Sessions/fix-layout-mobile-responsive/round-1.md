# Round 1 — Fix layout mobile responsive

## Responses

### Requirements Planner
**Vote**: PROPOSE
**Reasoning**: "3/4 di layout" = overflow orizzontale di pagina su iPhone 15 (~393×852). Requisito reso binario: `documentElement.scrollWidth - clientWidth <= 1` e nessun elemento con `right > innerWidth + 1`, su tutte le viste autenticate.
**Details**: 12 user story (US-001 globale, US-002 Panoramica, US-003 Dovuti, US-004 Versamenti, US-005 Immobili/Impostazioni, US-006 Import, US-007 tabelle dense, US-008 form, US-009 modali/sheet/drawer, US-010 touch target ≥44px, US-011 non-regressione desktop, US-012 reflow iOS/safe-area) con AC misurabili a 393×852. Open questions: card vs scroll interno (OQ-1), scope file render.js/index.html (OQ-3), viewport secondari (OQ-2), gate non-regressione desktop (OQ-6).

### Task Architect
**Vote**: PROPOSE
**Reasoning**: Layout già in gran parte responsive (bottom-nav, card list, wrapper scroll). L'overflow nasce da pochi punti non "blindati" + assenza di rete di sicurezza globale. Fix CSS-first, additivi, reversibili.
**Details** (root-cause con evidenze):
1. Nessuna rete anti-overflow globale: solo `body.authenticated{overflow:hidden}` (app.css:25) e `.main{overflow-x:hidden}` (:35); `html`/`.dashboard` senza vincolo; nessun `img/svg/table{max-width:100%}`.
2. Header non blindato: `.header`/`.topbar-left` senza `min-width:0`, figli `flex-shrink:0` (`.house-bar`, `.add-house-btn`).
3. Catena contenuto `.view`→`.subview`→`.situazione-section` senza `min-width:0`; tabelle `min-width:36rem` (576px).
4. Audit tabelle: Dovuti/Versamenti/Dashboard→card; Situazione/Import→`.data-table-wrap`; movementsAdv→`display:none` mobile. **Nessuna tabella scoperta** → solo verifica.
5. Celle/`.data-card-*` senza `overflow-wrap`.
Task: T-001 rete globale → T-002 header → T-003 catena contenuto → T-004 wrapping testo → T-005 audit read-only → T-006 verifica 393×852 + desktop.

## Coordinator Synthesis
**Consensus**: Sì (entrambi PROPOSE, allineati; nessun OBJECT/REJECT).

**Agreements**:
- Causa = overflow orizzontale di pagina, non necessità di redesign.
- Fix CSS-first in `css/app.css`, additivi e reversibili.
- Lo scroll **interno** alle tabelle dense (`min-width:36rem` dentro `overflow:auto`) è accettabile; vietato solo lo scroll orizzontale dell'**intera pagina**.
- Criteri di successo binari a 393×852 (e secondari 390×844 / 360px).

**Outstanding objections**: nessuna.

**Decisioni del coordinatore sulle open questions**:
- OQ-1: mantenere lo stato attuale — card list dove già presente (Dovuti/Versamenti/Panoramica), scroll interno al wrapper per tabelle dense (Situazione/Import). Nessuna conversione aggiuntiva in questo round.
- OQ-2/OQ-5: viewport primario 393×852, secondari 390×844 e 360px; tolleranza overflow 1px.
- OQ-3: fix **prioritariamente in `css/app.css`**; `index.html`/`js/render.js` solo se T-005 rivela una tabella/elemento non contenuto (l'audit attuale non ne trova).
- OQ-6: non-regressione desktop verificata con misure overflow a 1440/1280 + check visivo, senza gate screenshot-diff formale.

**Esito**: pronto per gate umano su `plan.md`.
