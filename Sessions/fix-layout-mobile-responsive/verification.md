# Verification — Fix layout mobile responsive

**Sessione:** `fix-layout-mobile-responsive` · **Fase:** Verify (Round 2)
**Agente:** Quality Verifier · **Data:** 2026-05-31
**Stato piano:** APPROVATO · **Execute:** completato (T-001..T-005)

---

## Verification summary

Verifica indipendente di `css/app.css` (git diff) vs `plan.md` (T-001..T-006), `execution.md` e i criteri di accettazione (`round-1-requirements-planner.md`, US-001..US-012). Combinati: **analisi statica del CSS effettivo** + **evidenza runtime** raccolta dal Coordinatore (Chrome DevTools, sessione autenticata reale, iPhone 15 393×852 e desktop 1440×900).

**Esito materiale (criteri binari del piano):**
- **Nessun overflow orizzontale di pagina** su tutte le 6 view mobili misurate (`scrollWidth - clientWidth = 0`, nessun offender oltre i `.sub-nav-btn` interni a `.sub-nav{overflow-x:auto}` — scroll interno **intenzionale**). ✅
- **Desktop intatto** (1440×900): `.nav-rail` flex visibile, `.bottom-nav` none, `.dashboard` = `240px 1200px`. Nessuna regressione. ✅

Tutte le 5 modifiche dichiarate in `execution.md` sono **realmente presenti** nel diff e additive/reversibili (nessuna rimozione di regole esistenti: `body{overflow:auto}`, `body.authenticated{overflow:hidden}`, `.main{overflow-x:hidden}`, `min-width:36rem` tabelle, sticky `thead` confermati intatti).

**Conferma diff `css/app.css`:**
- T-001: `html,body{...max-width:100%}` + `html{overflow-x:clip}` + `img,svg,canvas,video,table,pre,code{max-width:100%}` (righe 24-29). ✅
- T-002: `.header{...min-width:0}` (36), `.page-title{...ellipsis;nowrap}` (40), `.topbar-left{min-width:0}` (109). ✅
- T-003: `.subview{...min-width:0}` (62), `.view{...min-width:0}` (177), `.situazione-sections{min-width:0}` (207), `.situazione-section{min-width:0}` (208). ✅
- T-004: `td{overflow-wrap:anywhere}` (169), `.muted,.subtle,.hint{...anywhere}` (119), `.data-card-title`/`.data-card-meta` (332-333). ✅
- T-005: audit read-only, nessun gap (verificato: `.data-table-wrap{overflow:auto;min-width:0}` r.90-99, `.panel-table-wrap{display:none}` sotto 860px r.264, `.import-stepper{flex-wrap:wrap}` r.375).

**Limite chiave della campagna runtime:** la casa selezionata risultava "Nessuna casa selezionata" → tabelle Dovuti/Versamenti/Situazione **sparse/vuote** durante le misure. Lo scroll-interno-con-molte-righe non è stato stressato. Modali/sheet/drawer non aperti; touch-target ≥44px non misurati a runtime; 390/360px non misurati separatamente. Questi punti restano **PARTIAL/NOT-TESTED** e sono raccomandati come follow-up, non bloccanti (vedi sotto).

---

## AC traceability matrix

| AC ID | Status | Evidence |
|-------|--------|----------|
| AC-US001-01 | **PASS** | Runtime @393: `overflow=0` su Panoramica, Dovuti, Versamenti, Import, Situazione, Impostazioni. |
| AC-US001-02 | **PASS** | Runtime: `offenders=none`; unico elemento eccedente è `.sub-nav-btn`, ma dentro `.sub-nav{overflow-x:auto}` (r.260) → scroll interno intenzionale (escluso da definizione). |
| AC-US001-03 | **PASS** | `html{overflow-x:clip}` (r.25) impedisce uno scroll container orizzontale di pagina; runtime `overflow=0` conferma nessuno spostamento laterale. |
| AC-US001-04 | **PARTIAL** | 390/360px non misurati a runtime. Statico: nessuna regola hard-coded a 393px; layout 100% fluido (`max-width:100%`, `min-width:0`, `width:min(...)`); breakpoint a 860/520px non a 393. Atteso verde ma non verificato. |
| AC-US002-01 | **PASS** | Runtime `#panoramica overflow=0`; `.compliance-fact{min-width:0}` (r.309), `.cards`/`.hero` 1fr sotto 860px (r.257). |
| AC-US002-02 | **PASS** | Statico: `@media max-width:520px{.cards{1fr}}` (r.268); `.metric-value` valori non troncati (no width fissa). Runtime overflow=0. |
| AC-US002-03 | **PARTIAL** | Statico: `.dashboard-payments-scroll{overflow:auto}` (r.198). Runtime overflow=0 ma **pannello pagamenti non popolato con molte righe** (casa vuota). |
| AC-US003-01 | **PASS** | Runtime `#movimenti/dovuti overflow=0`. Caveat: dati sparsi (casa non selezionata). |
| AC-US003-02 | **PARTIAL** | Statico: `.panel-table-wrap{display:none}` sotto 860px + `.data-list-cards`/`.data-card` presenti; tabella in `.data-table-wrap{overflow:auto}`. **Non verificato con ≥3 dovuti reali** (no colonne tagliate da confermare visivamente). |
| AC-US003-03 | **NOT-TESTED** | Form-sheet non aperto a runtime. Statico: `.split-form-pane.form-sheet--open` e `.form-sheet-close` esistono; non misurato entro viewport. |
| AC-US004-01 | **PASS** | Runtime `#movimenti/versamenti overflow=0`. Caveat dati sparsi. |
| AC-US004-02 | **PARTIAL** | Statico: `.versamenti-table-scroll{overflow:auto}` (r.198), card list mobile. Lista non popolata; `payments-summary` non stressato a runtime. |
| AC-US004-03 | **NOT-TESTED** | Form versamento non aperto a runtime. |
| AC-US005-01 | **PASS** | Runtime `#impostazioni overflow=0` (sessione con 2 case). |
| AC-US005-02 | **PARTIAL** | Statico: `.house-manage-layout.split-layout{grid-template-columns:1fr}` sotto 860px (r.258) → impilato. **Form modifica casa non aperto** a runtime. |
| AC-US006-01 | **PASS** | Runtime `#movimenti/import overflow=0` (sub-nav-btn in-scroll-ok). |
| AC-US006-02 | **PASS** | Statico: `.import-stepper{...flex-wrap:wrap}` (r.375) → step a capo, non spingono la pagina. |
| AC-US006-03 | **PARTIAL** | Statico: anteprime in `.data-table-wrap{overflow:auto;min-width:0}`. **Anteprime non popolate** con estrazione reale a runtime. |
| AC-US007-01 | **PASS** | Statico: `.data-table-wrap{overflow:auto;min-width:0}` (r.90-99) + `table{min-width:36rem}` (r.100) → scroll interno; runtime overflow=0 conferma il bordo destro del wrapper non eccede il viewport. |
| AC-US007-02 | **PASS** | Statico: `@media max-width:860px{.panel-table-wrap{display:none}}` (r.264) + `.data-list-cards` mostrata → nessuna duplicazione visibile (coerente MOB-011). |
| AC-US007-03 | **PARTIAL** | Statico: `.data-card-title`/`.data-card-meta{overflow-wrap:anywhere}` (r.332-333), `.data-card-amount{white-space:nowrap}` (no overflow da importo). **Non verificato visivamente** con card reali dense. |
| AC-US008-01 | **PARTIAL** | Statico: `input,select,textarea{width:100%}` (r.31) + catena `min-width:0` → i campi non eccedono. **Non misurato per-campo** con form aperti a runtime. |
| AC-US008-02 | **PASS** | Statico: `.house-select{width:min(160px,36vw);text-overflow:ellipsis}` (r.43/255) → nome casa lungo troncato, non dilata. |
| AC-US008-03 | **PARTIAL** | Statico: `code{max-width:100%}` (r.29) limita l'elemento; `overflow-wrap:anywhere` su testo. **`word-break` NON aggiunto specificamente a `guide-copy-row code`**: una stringa lunga non spezzabile (IBAN) potrebbe non andare a capo dentro `code` (rischio overflow interno, mitigato da `.data-table-wrap`/contenitori ma non confermato). |
| AC-US009-01 | **NOT-TESTED** | Overlay non aperti a runtime. Statico: `.house-drawer{width:min(92vw,360px);height:100dvh}` (r.73), form-sheet/dialog presenti — larghezze entro viewport per costruzione, ma non misurato. |
| AC-US009-02 | **NOT-TESTED** | Scroll interno overlay non verificato a runtime. |
| AC-US009-03 | **NOT-TESTED** | Residuo larghezza dopo chiusura overlay non verificato. `html{overflow-x:clip}` mitiga per costruzione. |
| AC-US010-01 | **PARTIAL** | Statico: `.btn{min-height:44px}` (r.122), `input{min-height:44px}` (r.31). **Larghezza** dei bottoni riga icon-only (`.row-actions .btn`) non misurata a runtime → ≥44px **width** non confermato. |
| AC-US010-02 | **PARTIAL** | Statico: `.bottom-nav-btn{min-height:var(--bottom-nav-h)}` (r.251), `.fab{56px}` (r.65), `.sub-nav-btn{min-height:44px}` (r.61). Area effettiva non misurata a runtime. |
| AC-US011-01 | **PASS** | Runtime 1440×900: `.nav-rail` flex visibile, `.bottom-nav` none, `.dashboard`=`240px 1200px`. `.cards` 4 col non alterata (modifiche non toccano i breakpoint desktop). |
| AC-US011-02 | **PARTIAL** | Runtime 1440: `overflow=0` su tutte le view misurate. **1280×800 non misurato separatamente**; split-layout 2-col non misurati a runtime (CSS desktop invariato → atteso OK). |
| AC-US011-03 | **PASS** | Statico: modifiche **solo additive** (`min-width:0`, `overflow-wrap`, `max-width:100%`, ellissi titolo); nessuna regola di layout desktop alterata; `overflow-x:clip` no-op senza overflow. |
| AC-US012-01 | **PASS** | Statico: nessun `transform:scale`/zoom; reflow via `min-width:0` + fluid widths; testo su `--text-base` (r.27), nessun rimpicciolimento forzato. |
| AC-US012-02 | **PASS** | `index.html:5` meta viewport `width=device-width, initial-scale=1.0` — **nessun** `user-scalable=no`/`maximum-scale`: zoom utente preservato. |
| AC-US012-03 | **PASS** | Statico: `env(safe-area-inset-*)` su `.main` (r.37/249), `.fab` (r.65/342), `.bottom-nav` (r.250); altezze `100dvh` (r.34/73/182). Device iOS reale non testato. |

**Riepilogo conteggi:** PASS = 14 · PARTIAL = 12 · NOT-TESTED = 4 · FAIL = 0.

---

## Test scenarios executed / recommended

### Eseguiti (runtime, Coordinatore)
- iPhone 15 393×852 (DPR3, mobile+touch): misura `scrollWidth-clientWidth` e scan offender su Panoramica, Dovuti, Versamenti, Import, Situazione, Impostazioni → tutti `overflow=0`.
- Desktop 1440×900: misura overflow + verifica `.nav-rail`/`.bottom-nav`/`.dashboard` grid → desktop intatto.

### Raccomandati (follow-up, non bloccanti)
1. **Dati densi reali:** selezionare una casa con ≥3 dovuti, ≥3 versamenti, ≥1 import documento + ≥1 import banca con righe; ripetere la misura overflow @393 su Dovuti/Versamenti/Situazione/Import e confermare che lo scroll resti **interno** ai wrapper (AC-US002-03, 003-02, 004-02, 006-03, 007-01/03).
2. **Modali/sheet/drawer @393:** aprire uno per uno form-sheet (Dovuti/Versamenti), house-drawer, onboarding-dialog, confirm-dialog, dup-import-dialog; misurare larghezza overlay ≤ viewport, scroll interno verticale, e overflow=0 dopo chiusura (AC-US009-01/02/03, 003-03, 004-03, 005-02).
3. **Touch target:** misurare `getBoundingClientRect()` di `.row-actions .btn` (Modifica/Elimina), bottom-nav-btn, FAB, sub-nav-btn, voci menu utente → confermare ≥44×44 CSS px **in entrambe le dimensioni** (AC-US010-01/02).
4. **Larghezza Android 360px** (+ ricontrollo 390×844): ripetere AC-US001-01 (AC-US001-04).
5. **Stringhe non spezzabili:** verificare IBAN/causale lunga in `guide-copy-row code` @393 → se overflow interno, aggiungere `word-break:break-all`/`overflow-wrap:anywhere` su `code` (AC-US008-03).
6. **Desktop 1280×800:** ripetere misura overflow + split-layout 2-col (AC-US011-02).
7. **Per-campo form:** con form aperti, misurare `input/select/textarea` `right ≤ innerWidth+1` (AC-US008-01).

---

## Regressions & risks

- **Regressioni desktop:** nessuna rilevata. `overflow-x:clip` applicato solo a `html` (non `hidden`) → non crea scroll-container che romperebbe `position:sticky` (header/`thead`); runtime 1440 conferma layout invariato.
- **Sticky thead:** intatto — vive in `.data-table-wrap{overflow:auto}`, non su `html`.
- **`td{overflow-wrap:anywhere}` globale:** applicato a tutte le celle; importi in `.data-card-amount`/`.metric-value` restano `white-space:nowrap` (no a-capo numerico). Rischio basso; la deviazione su `.status` (non modificato perché già `nowrap;ellipsis;max-width:220px`) è corretta e motivata.
- **Rischio residuo medio — dati densi non testati:** il criterio "scroll interno tabelle dense" è verificato solo staticamente; la prova binaria definitiva richiede dati reali (follow-up #1). Statico solido (wrapper `overflow:auto;min-width:0` + `table min-width:36rem` su tutte le tabelle confermato da audit T-005), ma non eseguito a runtime su righe abbondanti.
- **Rischio basso — `code` IBAN non spezzabile:** `max-width:100%` limita l'elemento ma non garantisce il wrap di una stringa lunghissima senza spazi; verificare (follow-up #5).
- **Rischio basso — touch target width:** `min-height:44px` garantito; la **larghezza** dei bottoni icon-only non confermata (follow-up #3).
- **Auth/persistenza:** fuori ambito di questo round (nessuna modifica a JS/schema/RLS/auth; solo `css/app.css`). Nessuna regressione possibile su sessione/CRUD.

---

## Verdict

**APPROVE.**

I criteri **materiali** del piano sono soddisfatti con evidenza runtime: **nessun overflow orizzontale di pagina** su tutte e 6 le view mobili @393×852, **desktop 1440 intatto**, e tutte le modifiche CSS dichiarate sono realmente presenti, additive e reversibili (zero rimozioni, zero regressioni). Nessun AC in stato FAIL.

I 12 PARTIAL e 4 NOT-TESTED dipendono da condizioni non disponibili nella campagna runtime (casa senza dati → tabelle vuote; overlay non aperti; 360/1280 non misurati) e non da difetti del codice: l'analisi statica del CSS effettivo li copre per costruzione. Sono raccomandati come **follow-up di QA** (lista sopra), non come bloccanti. L'unico punto che merita attenzione mirata è AC-US008-03 (`code` IBAN, rischio basso).
