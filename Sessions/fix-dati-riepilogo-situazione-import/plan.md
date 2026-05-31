# Piano di fix — Riepilogo / Situazione / sezione Dati

**Sessione**: `fix-dati-riepilogo-situazione-import`
**Pattern**: Plan / Execute / Verify · **Stato**: APPROVATO (Round 2, revise con scope ampliato) — in Execute
**Data**: 2026-05-31

> **Decisioni operatore**: approva l'esecuzione; sezione "Dati" → **Opzione A** (rimozione); hardening **T-003** → **sì**; scope ampliato: layout Movimenti + separazione import + fix mobile.

---

## 1. Sintesi diagnosi

| # | Segnalazione | Esito verifica | Causa |
|---|--------------|----------------|-------|
| 1 | "Riepilogo" senza dati | **CONFERMATA** (bug) | `TypeError` in `renderComplianceHero` aborta tutto il render |
| 2 | "Situazione" (Movimenti) senza dati | **CONFERMATA** (bug) | Stessa eccezione: `renderSituazione` non viene mai raggiunta |
| 3 | Sezione "Dati / Import-Export" "non ha senso" | **CONFERMATA** (UX) | Sezione vestigiale: solo rimandi a Impostazioni → Avanzate |

### Root cause (segnalazioni 1 + 2) — unica
- `js/utils.js:2`: `export const today = new Date().toISOString().slice(0, 10);` → **`today` è una stringa**.
- Viene però chiamata **come funzione**:
  - `js/compliance-status.js:48` → `const now = today();`
  - `js/compliance-status.js:158` → `findPeriodByDate(house, today())`
  - `js/payment-guide.js:12` → `findPeriodByDate(house, today())`
  - `js/payment-guide.js:17` → `const now = today();`
- `js/render.js:1043-1071` (`render`) **non ha try/catch** e chiama `renderComplianceHero(house)` (1053) come prima sotto-render → `computeComplianceStatus` → `today()` → **`TypeError: today is not a function`** → l'intero render si interrompe prima di `renderMetrics`/`renderAnnualBlocks`/`renderDashboardPayments` (Riepilogo) e di `renderSituazione` (1062, Situazione).
- Si manifesta **solo per case con dati**: `computeComplianceStatus` esce prima di `today()` quando la casa è vuota (`compliance-status.js:20-30`).
- Introdotto dal commit `0c63eb8` ("feat: new small features"). Il commit `a261ec1` (CSS mobile) **non** è la causa.

### Segnalazione 3 (UX)
- `index.html:335-354` (`data-view-panel="dati"`): subview "Backup" e "Registro" sono **placeholder** con bottoni che rimandano a Impostazioni → Avanzate, dove le funzioni reali già esistono (`index.html:397-411`). Duplicazione di navigazione.

---

## 2. Requisiti (user stories + AC)

- **US-001 — Riepilogo mostra i dati**: AC-US001-01 dati visibili per casa con esercizi; AC-US001-02 valori = `periodSummary`/`totals`; AC-US001-03 empty-state solo se realmente vuoto; AC-US001-04 nessun errore console / REST 200.
- **US-002 — Situazione mostra i dati**: AC-US002-01 `#situazioneSummary`/`#situazioneSections` popolati; AC-US002-02 cambio esercizio aggiorna; AC-US002-03 coerenza Riepilogo↔Situazione.
- **US-003 — Causa isolata e documentata**: AC-US003-01/02 root cause `today()` confermata.
- **US-004 — Sezione "Dati" razionalizzata**: AC-US004-01 ospita funzioni reali o rimossa dalla nav; AC-US004-02 nessun placeholder con solo "Apri Avanzate"; AC-US004-03 Import/Export e Registro raggiungibili senza duplicazione.

---

## 3. Task breakdown

| ID | Task | File | Priorità | Rischio |
|----|------|------|----------|---------|
| **T-001** | `today()` → `today` in compliance | `js/compliance-status.js` (48, 158) | **Critica** | Minimo |
| **T-002** | `today()` → `today` in payment-guide | `js/payment-guide.js` (12, 17) | **Critica** | Minimo |
| **T-003** | Hardening: try/catch sulle sotto-render in `render()` + `console.error` (opzionale, difensivo) | `js/render.js` (1053-1069) | Media | Basso |
| **T-004** | Razionalizzare sezione "Dati" (vedi opzioni) | `index.html` (81, 335-354), `js/config.js` (16) | Media | Basso |

**Ordine**: T-001 + T-002 insieme (sbloccano #1 e #2) → T-003 → T-004 (indipendente).

### Task aggiuntivi (Round 2 — nuovo scope, approvati)

| ID | Task | File | Priorità | Rischio |
|----|------|------|----------|---------|
| **T-005** | Fix import **Banca** inaccessibile da mobile: il pane usa `split-layout--list-first` → diventa drawer fisso non apribile (`css/app.css:231-244`); rimuovere quella classe dal pane Banca (`index.html:296`) → `split-layout`/stack | `index.html` (296) | **Critica (mobile)** | Basso |
| **T-006** | **Separazione import** (Opzione A): promuovere "Documento amministratore" e "Banca Intesa" a subview di primo livello della sub-nav Movimenti (eliminando la sub-nav annidata) | `index.html`, `js/config.js`, `js/render.js`, `js/main.js`, `css/app.css` | Media | Medio |
| **T-007** | **Leggibilità mobile** tabelle Situazione + anteprime import: estendere conversione in card / affordance scroll | `js/render.js`, `js/mobile-cards.js`, `css/app.css` | Media | Medio |

**Vincolo trasversale**: in T-006 **non rinominare** gli ID DOM di upload/tabelle (`documentImportFile`, `bankImportFile`, `bankImportPreview`, `unlinkedMovements`, `bankImportBatches`, `documentImportPreview`, ecc.) — sono letti da `collectDom` (`render.js`) e dagli handler in `js/main.js`.

### Opzioni per T-004 (segnalazione 3) — da scegliere
- **A (consigliata)** — Rimuovere il nav-btn "Dati" (`index.html:81`) e la section (`335-354`); ripuntare l'alias `archivio` (`js/config.js:16`) a `['impostazioni','avanzate']`. Funzioni invariate, meno superficie.
- **B** — Nascondere solo il nav-btn (lascia codice morto).
- **C** — Consolidare: spostare Export/Import + Registro dentro "Dati" e rimuovere "Avanzate" (più invasiva, tocca ID DOM in `collectDom`).

---

## 4. Verifica prevista (Quality Verifier, post-Execute)
- Login con casa che ha dati → reload → **nessun `TypeError`** in console.
- Panoramica: metriche + tabella annualità + versamenti visibili e coerenti con `periodSummary`.
- Situazione: riepilogo/sezioni popolati; cambio esercizio funziona.
- Hero "compliance" e bonifico guidato coerenti con la data odierna.
- Sezione "Dati": comportamento conforme all'opzione scelta.

## 5. Vincoli
- **Nessuna modifica al codice finché questo piano non è approvato.**
- Fix interamente frontend; nessun impatto su schema Supabase / RLS / migrazioni.
- Max 4 round; al momento siamo a fine Round 1 (Plan).

---

## 6. Decisioni richieste all'operatore (gate)
1. **Approvi** il piano per passare alla fase Execute? (`approve` / `revise: …` / `stop`)
2. **Opzione per la sezione "Dati"** (T-004): **A**, B o C?
3. Includere **T-003** (hardening difensivo) nello stesso intervento? (consigliato: sì)
