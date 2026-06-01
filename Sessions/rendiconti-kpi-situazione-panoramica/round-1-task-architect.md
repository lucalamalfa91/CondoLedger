## Task Architect — Round 1 Response

**Vote**: PROPOSE

**Reasoning**:
Panoramica oggi è una dashboard “ibrida”: hero di conformità (`compliance-status.js`) + 4 metriche aggregate + **tre elenchi** (tabella annualità, scadenzario a card, ultimi versamenti). Situazione è il contrario: **summary sempre visibile** (`metric-chip`) e **7 blocchi tabellari sempre espansi** generati da helper in `render.js` su dati di `buildSituazioneReport()` (`situazione-report.js`) e `periodSummary()` (`fiscal.js`). Non esiste ancora un pattern collapse/accordion nel repo; l’unico precedente interattivo simile è `aria-expanded` sul menu utente. L’obiettivo operator è coerente con l’architettura attuale (moduli puri + render HTML string-based): estrarre KPI riusabili, rendere Situazione “summary-first + dettaglio on demand”, e trasformare Panoramica in vista KPI-only con deep link verso Situazione (riusando `data-nav-target` + `state.pendingSituazionePeriodId` già usato post-import banca). Nessuna migrazione Supabase né cambio schema: tutto deriva da `house` in memoria.

**Details**:

### Architectural notes

| Area | Stato attuale | File / funzioni |
|------|---------------|-----------------|
| **Panoramica** | Hero conformità + metriche + 3 liste | `index.html`; `renderComplianceHero`, `renderMetrics`, `renderAnnualBlocks`, `renderDashboardPayments` in `js/render.js` |
| **Situazione** | Select esercizio + chip summary + sezioni tabellari flat | `renderSituazione`, `renderSituazioneSummaryChips`, `renderRateTable`, `renderConsuntivoSection`, … in `js/render.js`; `buildSituazioneReport` in `js/situazione-report.js` |
| **Dati KPI** | Già calcolati ma sparsi | `periodSummary`, `totals` (`fiscal.js`); slot/rate (`installments.js`); stato regola (`computeComplianceStatus` in `compliance-status.js`) |
| **Nav deep link** | View/subview via `data-nav-target`; periodo Situazione via `state.pendingSituazionePeriodId` | `js/main.js`, `renderSituazione` |
| **CSS** | Chip summary, sezioni, compliance card | `css/app.css` |

**Decisioni tecniche proposte**

1. **Collapse Situazione**: `<details>/<summary>` nativo con CSS custom; summary mostra titolo + totali chiave; default closed.
2. **Box totali**: `situazioneSummary` in 2 tier — primario (Saldo consuntivo, Tot. da pagare, % versato) e secondario (Preventivo, Consuntivo, Versato, Saldo rate).
3. **KPI Panoramica**: nuovo modulo `js/kpi-metrics.js` (funzioni pure); hero `compliance-status.js` resta KPI narrativa.
4. **Deep link periodo**: `data-situazione-period="{periodId}"` → `state.pendingSituazionePeriodId` prima di `navigate('movimenti','situazione')`.

### Task breakdown (T-###)

| ID | Title | Files | Depends on | Done when |
|----|-------|-------|------------|-----------|
| **T-001** | Definire set KPI e mapping dati | `Sessions/.../kpi-spec.md`, lettura `fiscal.js`, `compliance-status.js`, `installments.js` | — | 5–7 KPI approvati, formula, fallback, tono colore |
| **T-002** | Modulo calcolo KPI riusabile | `js/kpi-metrics.js` (nuovo) | T-001 | Esporta `computePanoramicaKpis(house, focusPeriodId?)` |
| **T-003** | Helper HTML collapse per sezioni Situazione | `js/render.js` | — | Wrapper `<details class="situazione-collapse">` accessibile |
| **T-004** | Applicare collapse a tabelle preventivo/consuntivo/versamenti/riporti | `js/render.js` | T-003 | Tutte le tabelle collassabili; fix bug `house` undefined in `renderConsuntivoSection` |
| **T-005** | Ridisegnare box totali Situazione | `js/render.js`, `css/app.css` | T-001 | Tier primario/secondario visibile |
| **T-006** | Ristrutturare markup Panoramica (solo KPI) | `index.html` | T-001 | Rimossi elenchi; aggiunti `#panoramicaKpis`, `#panoramicaPeriodLinks` |
| **T-007** | Render KPI Panoramica + link Situazione | `js/render.js`, `js/kpi-metrics.js` | T-002, T-006 | Solo hero + KPI cards + link Situazione |
| **T-008** | Deep link navigazione con periodo | `js/main.js`, `js/render.js` | T-007 | Click imposta `pendingSituazionePeriodId` |
| **T-009** | Stili collapse, KPI grid, empty states | `css/app.css` | T-003, T-005, T-006 | Responsive, focus ring, KPI card |
| **T-010** | Aggiornare empty state e render pipeline | `js/render.js` | T-006, T-007 | Nessun riferimento DOM a elementi rimossi |
| **T-011** | Verifica manuale (checklist council) | — | T-004–T-010 | Panoramica KPI-only → link Situazione → collapse → reload → mobile |

### Risks & mitigations

| Rischio | Mitigazione |
|---------|-------------|
| Re-render resetta stato `<details>` | Id stabile per sezione+periodo; no sessionStorage in v1 |
| Duplicazione KPI hero/metrics/griglia | Fondere/rimuovere `#metrics` ridondante |
| Bug `house` undefined | Fix in T-004 |
| Perdita «ultimi versamenti» | Link «Storico versamenti» → subview versamenti |

### Non-goals

- Nuovi framework UI, chart library, build step
- Modifiche schema Supabase
- KPI avanzati (cashflow, ML, benchmarking)
- Riscrittura PDF Situazione
- Automazione test E2E
