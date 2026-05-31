## Requirements Planner — Plan Phase — Round 1

**Vote**: PROPOSE

**Reasoning**:
Verificati staticamente i tre flag. Nota: il file applicativo reale è `index.html` (entry `js/main.js`); `gestione-spese-condominiali-supabase.html` è solo un redirect a `/index.html`.

- **Segnalazione 1 (Riepilogo)** → DA CHIARIRE (sintomo plausibile, causa non isolabile senza runtime dal solo punto di vista requisiti).
- **Segnalazione 2 (Situazione/Movimenti)** → DA CHIARIRE (stessa dipendenza dati della #1; forte correlazione).
- **Segnalazione 3 (Dati / Import-Export)** → CONFERMATA come problema UX: sezione "Dati" guscio vuoto con soli rimandi.

Riepilogo e Situazione condividono la stessa sorgente dati (`activeHouse()` + `periodSummary(house)`): un vuoto simultaneo indica causa comune (dati non caricati/mappati oppure regressione CSS/JS).

**Details**:

**Segnalazione 1 — Riepilogo (view "panoramica")**
- Markup: `index.html:122-151` (`#metrics`, `#annualTableWrap`, `#annualCards`, `#dashboardPayments`).
- Render: `js/render.js:375-392` (`renderMetrics`), `402-430` (`renderAnnualBlocks`), `504-529` (`renderDashboardPayments`).
- Orchestrazione: `js/render.js:1043-1071` (`render`) → sotto-render solo se `activeHouse()` ≠ null, altrimenti `renderEmptyState()` (`1017-1041`).

**Segnalazione 2 — Situazione (subview di Movimenti)**
- Markup: `index.html:316-332` (`#situazioneSummary`, `#situazioneSections`).
- Render: `js/render.js:632-673` (`renderSituazione`); empty-state a `638`/`658`.
- Dipende da `periodSummary(house)` (`render.js:634`). Da trattare come unico difetto con la #1.

**Segnalazione 3 — Dati / Import-Export (UX)**
- Markup: `index.html:335-354`. Due subview ("Backup", "Registro") **entrambe placeholder** con rimandi a Impostazioni → Avanzate.
- Funzioni reali altrove: Export/Import JSON in Impostazioni → Avanzate (`index.html:397-406`), Registro in `#movementsAdv` (`408-410`), Import documento/banca in Movimenti → Import (`250-314`).
- Confermato: la sezione "Dati" non offre funzioni proprie → razionalizzare (eliminare o riempire con contenuto reale).

**User stories**

**US-001 — Ripristino dati schermata Riepilogo**
- AC-US001-01: casa con ≥1 esercizio e ≥1 dovuto/versamento → `#metrics`, `#annualTableWrap`, `#dashboardPayments` mostrano i dati (no empty-state).
- AC-US001-02: i valori coincidono con `periodSummary(house)`/`totals(house)`.
- AC-US001-03: empty-state solo quando la casa è realmente priva di dati.
- AC-US001-04: nessun errore in console al render; REST Supabase 200.

**US-002 — Ripristino dati tab Situazione (Movimenti)**
- AC-US002-01: esercizio con preventivo/consuntivo → `#situazioneSummary`/`#situazioneSections` popolati.
- AC-US002-02: cambio esercizio da `#situazionePeriod` aggiorna il contenuto.
- AC-US002-03: Riepilogo e Situazione coerenti per lo stesso esercizio.

**US-003 — Diagnosi causa comune** (dip. Task Architect)
- AC-US003-01: documentato se il dato è nel DOM ma nascosto (CSS) o assente (dati/auth/JS).
- AC-US003-02: identificata la causa precisa.

**US-004 — Razionalizzazione UX sezione "Dati"**
- AC-US004-01: "Dati" ospita realmente Backup/Export-Import e Registro **oppure** viene rimossa dalla nav (`index.html:81`).
- AC-US004-02: nessuna subview placeholder con solo bottone "Apri Avanzate".
- AC-US004-03: funzioni Import/Export JSON e Registro raggiungibili con un percorso chiaro e non duplicato.

**Out of scope**: schema DB, nuove funzioni di import, redesign nav oltre la sezione "Dati".

**Domande aperte per l'operatore**
1. Il problema è su desktop, mobile o entrambi?
2. La casa selezionata ha effettivamente dati? Compare empty-state o area vuota/tagliata?
3. Spariti anche i 4 box metriche (`#metrics`) o solo le tabelle?
4. Iniziato dopo l'ultimo deploy o già presente prima?
5. Errori in console / chiamate REST non-200?
6. Per la #3: rimuovere la sezione "Dati" o riempirla spostando lì Backup/Registro?
