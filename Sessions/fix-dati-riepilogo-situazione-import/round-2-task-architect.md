## Task Architect — Plan Phase — Round 2 (revise: nuovo scope)

**Vote**: PROPOSE

**Reasoning**:
Analizzati `index.html` (Movimenti 153–333) e `css/app.css`. La sub-nav annidata import esiste già (`index.html:251–254`); routing tab in `setImportTab` (`js/main.js:74–83`). Problemi:

1. **Bug critico mobile import Banca**: il pane `data-import-panel="banca"` (`index.html:296`) usa `split-layout split-layout--list-first`. Su mobile `@media (max-width:860px)` (`css/app.css:231–244`) rende ogni `.split-layout--list-first .split-form-pane` un drawer `position:fixed; transform:translateY(105%)`, apribile solo con `.form-sheet--open` aggiunta da `.form-sheet-open-btn`. Il pane Banca **non ha** open button (presente solo per Dovuti/Versamenti, `index.html:197,239`) → upload/conferma/lista batch finiscono in un cassetto invisibile e non apribile. Import banca inutilizzabile da mobile.
2. **Due sub-nav indistinguibili**: `.import-sub-nav` (`css/app.css:374`) eredita `.sub-nav` (59–61) → peso visivo identico alle due barre impilate; su mobile entrambe `overflow-x:auto` (260).
3. **Tabelle non in card su mobile**: `dataListHtml` (`mobile-cards.js:9`) converte solo `duesTable`/`paymentsTable`/`dashboardPayments`. Situazione (`render.js:560–616`) e tabelle import (`documentImportPreview`, `bankImportPreview`, `unlinkedMovements`, `bankImportBatches`) usano `.data-table-wrap` con `min-width:36rem` (`css/app.css:100`) → scroll orizzontale, colonne tagliate.

**Details**:

**Layout Movimenti (righe css)**: `app.css:229–243` drawer fantasma Banca; `app.css:374` `.import-sub-nav` non distinta; `app.css:100` min-width 36rem; `app.css:260` sub-nav scroll identico.

**Separazione import — opzione consigliata A**: promuovere i due import a subview di primo livello della sub-nav Movimenti ("Import doc." e "Import banca" accanto a Dovuti/Versamenti/Situazione); elimina sub-nav annidata e il contesto del drawer fantasma.
- File: `index.html` (sostituire tab "Import" 157 con due tab; spostare i panel 250–315 in due `data-subview-panel` separati), `js/config.js` (`viewMeta.movimenti.subviews` + alias legacy), `js/render.js` (logica subview + `sessionStorage 'movimenti-tab'` + CTA `data-import-tab`), `js/main.js` (snellire `setImportTab`).
- Rischio medio: tocca routing; **mantenere invariati gli ID DOM** degli upload/tabelle (`collectDom`, handler `main.js`).
- Fallback B: ridisegnare la sub-nav annidata come segmented-control distinto (solo `css/app.css`); non risolve da solo il drawer.

**Mobile fix**: pane Banca non deve usare `split-layout--list-first` (`index.html:296`) → `split-layout` semplice o stack (collassa 1-col senza `position:fixed`); estendere card-list o affordance scroll per tabelle Situazione/import.

**Task breakdown aggiuntivo:**

| ID | Titolo | File | Approccio | Rischio | Priorità |
|----|--------|------|-----------|---------|----------|
| **T-005** | Fix import Banca inaccessibile da mobile (drawer fantasma) | `index.html:296` | Togliere `split-layout--list-first` dal pane Banca → `split-layout`/stack | Basso | **P1 critico** |
| **T-006** | Separazione import documenti (Opzione A) | `index.html`, `js/config.js`, `js/render.js`, `js/main.js`, `css/app.css` | Subview di primo livello; ID upload invariati | Medio | P2 |
| **T-007** | Leggibilità mobile tabelle Situazione + import | `js/render.js:560–616`, `js/mobile-cards.js`, `css/app.css` | Card-list o affordance scroll | Medio | P2 |
| **T-008** | (solo se Opzione B) sub-nav annidata distinta | `css/app.css:374`, `index.html:251` | Segmented-control | Basso | P3 |

**Dipendenze**: T-005..T-008 indipendenti dai fix `today` (T-001/T-002), try/catch (T-003), rimozione "Dati" (T-004). Accoppiamento file: T-003/T-006/T-007 toccano `render.js`; sequenza consigliata T-001→T-004, poi T-005 (quick win), poi T-006/T-007. Non rinominare ID DOM upload/tabelle.
