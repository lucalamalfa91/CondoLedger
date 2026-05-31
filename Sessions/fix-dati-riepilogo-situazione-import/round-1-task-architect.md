## Task Architect — Plan Phase — Round 1

**Vote**: PROPOSE

**Reasoning**:
Confermate tutte e tre le segnalazioni via lettura codice. Le segnalazioni 1 e 2 condividono **un'unica root cause** (un `TypeError` che interrompe il rendering); la #3 è ridondanza UX reale. Nota: `gestione-spese-condominiali-supabase.html` è solo un redirect a `index.html`.

**Root cause segnalazioni 1+2 (unica):** in `js/utils.js:2` `today` è una **costante stringa** (`export const today = new Date().toISOString().slice(0,10)`), ma è invocata **come funzione**:
- `js/compliance-status.js:48` → `const now = today();`
- `js/compliance-status.js:158` → `findPeriodByDate(house, today())`
- `js/payment-guide.js:12` → `findPeriodByDate(house, today())`
- `js/payment-guide.js:17` → `const now = today();`

Flusso del guasto: `render()` (`js/render.js:1043-1071`) **non ha try/catch** e chiama `renderComplianceHero` (1053) → `computeComplianceStatus(house)` → `js/compliance-status.js:158` `today()` → **`TypeError: today is not a function`**. L'eccezione aborta tutto il rendering successivo: Panoramica (metriche, riepilogo annualità, scadenzario, versamenti) **e** Situazione (1062) restano vuote.

Conferma "solo con dati": `computeComplianceStatus` ritorna prima di `today()` se la casa è vuota (`compliance-status.js:20-30`); l'eccezione scatta solo con `fiscalPeriods`/`dues` presenti → gli utenti con dati reali vedono schermate bianche.

Introduzione del bug: `compliance-status.js` e `payment-guide.js` aggiunti nel commit `0c63eb8` ("feat: new small features"). Il commit recente `a261ec1` ("layout mobile redesign") ha toccato **solo `css/app.css`** → **non** è la causa.

**Segnalazione 3:** la view `data-view-panel="dati"` (`index.html:335-354`) è vestigiale: subview "Backup" e "Registro" mostrano solo placeholder + bottoni che rimandano a Impostazioni → Avanzate, dove le funzioni reali già esistono (`index.html:397-411`). Pura duplicazione di navigazione.

**Details**:

**Root cause segn. 1 (Riepilogo)** → effetto a valle del TypeError in `renderComplianceHero`: `renderMetrics`/`renderAnnualBlocks`/`renderDashboardPayments` mai eseguite.

**Root cause segn. 2 (Situazione)** → stessa eccezione: `renderSituazione` (`render.js:632`, chiamata a 1062) mai raggiunta. La funzione in sé è corretta.

**Segn. 3 + opzioni:**
- **Opzione A (consigliata) — Rimuovere:** eliminare nav-btn Dati (`index.html:81`) e section `data-view-panel="dati"` (`335-354`); ripuntare alias `archivio: ['dati','backup']` → `['impostazioni','avanzate']` (`js/config.js:16`). Nessuna perdita di funzione.
- **Opzione B — Nascondere:** togliere solo il nav-btn, lascia view orfana (codice morto).
- **Opzione C — Consolidare:** spostare pannelli reali (export/import + `#movementsAdv`) dentro Dati e rimuovere Avanzate. Più invasivo (ID DOM letti da `collectDom`, `render.js:1135,1144,1145`).

**Task breakdown (T-###):**

| ID | Titolo | File | Approccio | Rischi |
|----|--------|------|-----------|--------|
| **T-001** | Fix `today()` in compliance | `js/compliance-status.js` (48, 158) | Sostituire `today()` → `today` (stringa). Risolutivo per segn. 1 e 2. | Minimo (formato ISO già atteso). |
| **T-002** | Fix `today()` in payment-guide | `js/payment-guide.js` (12, 17) | Stessa correzione; evita che il bug riemerga su `renderPaymentGuide` (`render.js:1057`). | Minimo. |
| **T-003** | Hardening render (opzionale) | `js/render.js` (1053-1069) / `js/main.js` | try/catch sulle sotto-render + `console.error`. | Basso; rete di sicurezza. |
| **T-004** | Razionalizzare sezione Dati (Opz. A) | `index.html` (81, 335-354), `js/config.js` (16) | Rimuovere nav-btn + view; ripuntare alias. | Basso (`els.demoBtn` optional chaining). |

**Dipendenze / ordine:**
1. **T-001 + T-002** priorità assoluta, da fare insieme (stessa classe di bug); sbloccano Riepilogo e Situazione.
2. **T-003** dopo, non bloccante.
3. **T-004** indipendente; richiede scelta operatore tra A/B/C.
4. Rischio regressione: `today` tocca logica periodo/scadenze → verifica manuale obbligatoria (Quality Verifier).
5. Nessun impatto schema/RLS: fix puramente frontend.

**Non-goals:** nessuna modifica codice in questa fase; scelta A/B/C per la #3 rimessa all'approvazione del piano.
