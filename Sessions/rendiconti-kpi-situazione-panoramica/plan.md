# Plan — Rendiconti KPI, Situazione e Panoramica

**Session**: `Sessions/rendiconti-kpi-situazione-panoramica/`  
**Pattern**: Plan / Execute / Verify  
**Round**: 1 — synthesis  
**Status**: ✅ Approved — Execute complete

---

## Obiettivo

Rendere **consultabili e immediatamente leggibili** i rendiconti condominiali:

- **Situazione**: totali in evidenza; tabelle preventivo/consuntivo/versamenti in **accordion chiusi di default**.
- **Panoramica**: **solo KPI** (niente elenchi); link verso Situazione per il dettaglio.
- **KPI**: set ristretto allineato alla pratica di mercato (stato pagamenti, saldo, da pagare, copertura, prossima rata).

Stack invariato: HTML/JS vanilla + Supabase. Nessuna migrazione DB.

---

## User stories

### US-001 — Accordion tabelle in Situazione

**As a** proprietario, **I want** tabelle di dettaglio chiuse di default, **so that** mi concentro sui totali.

| AC | Criterio |
|----|----------|
| AC-US001-01 | Blocchi preventivo, consuntivo, versamenti, riporti, saldi precedenti collapsed con titolo + totali in header |
| AC-US001-02 | Click/header toggle con `aria-expanded` |
| AC-US001-03 | Tastiera Enter/Space + annuncio screen reader |
| AC-US001-04 | Cambio esercizio → tutte le sezioni tornano collapsed |
| AC-US001-05 | PDF export invariato (contenuto completo) |

### US-002 — Totali leggibili in Situazione

**As a** proprietario, **I want** box totali con gerarchia visiva, **so that** capisco subito la mia posizione.

| AC | Criterio |
|----|----------|
| AC-US002-01 | Max 6 chip: primari (Saldo consuntivo, Stato) vs secondari (Preventivo, Consuntivo, Versato, Saldo rate) |
| AC-US002-02 | Saldi anno precedente con hint formula («Preventivo + saldo precedente») |
| AC-US002-03 | Saldo negativo con classe semantica e etichetta «Debito» |
| AC-US002-04 | Header accordion collapsed mostra totale sezione in EUR |

### US-003 — Panoramica solo KPI

**As a** proprietario, **I want** Panoramica senza tabelle/liste, **so that** capisco in pochi secondi se devo agire.

| AC | Criterio |
|----|----------|
| AC-US003-01 | Rimossi `#annualTableWrap`, `#annualCards`, `#dashboardPayments` |
| AC-US003-02 | Hero compliance + griglia KPI (4–8 card) + opzionale mini-lista «Altri esercizi» (badge + saldo, max 5 righe) |
| AC-US003-03 | Filtro esercizio (se mantenuto) aggiorna KPI senza elenchi |
| AC-US003-04 | Empty state senza placeholder tabella |

### US-004 — Link Panoramica → Situazione

**As a** proprietario, **I want** CTA verso Situazione con esercizio preselezionato, **so that** approfondisco senza cercare nel menu.

| AC | Criterio |
|----|----------|
| AC-US004-01 | «Vedi situazione» → movimenti/situazione con `#situazionePeriod` corretto |
| AC-US004-02 | «Altri esercizi» → deep link per `fiscalPeriodId` |
| AC-US004-03 | (Opzionale v1) Deep link espande sezione rate via hash interno |

### US-005 — Coerenza KPI

**As a** proprietario, **I want** stessi numeri tra Panoramica, hero e Situazione, **so that** non vedo contraddizioni.

| AC | Criterio |
|----|----------|
| AC-US005-01 | Stato e saldo da `computeComplianceStatus` / `periodSummary` / `buildSituazioneReport` allineati |
| AC-US005-02 | Reload/cambio casa → KPI aggiornati da Supabase |

---

## KPI set (ricerca mercato)

| # | KPI | Etichetta IT | Fonte dati |
|---|-----|--------------|------------|
| 1 | Stato pagamenti | In regola / Attenzione / Intervento richiesto | `computeComplianceStatus` |
| 2 | Saldo consuntivo | Saldo consuntivo | `periodSummary.balanceConsuntivo` |
| 3 | Da pagare | Da pagare | `totalToPayConsuntivo` o preventivo + prior balance |
| 4 | Copertura | Copertura pagamenti (%) | `paid / totalToPay` |
| 5 | Prossima rata | Prossima rata / Rate scadute | `installments.js`, `compliance-status.js` |
| 6 | Scostamento | Scostamento consuntivo | `consuntivo − preventivo` (se entrambi presenti) |
| 7 | Multi-anno | Esercizi in debito | `totals(house).debtYears` |

**Esclusi**: delinquency ratio condominio, fondo riserva, NOI — non rilevanti per singolo proprietario.

---

## Task breakdown

| ID | Title | Files | Depends |
|----|-------|-------|---------|
| T-001 | Spec KPI | `Sessions/.../kpi-spec.md` | — |
| T-002 | Modulo `kpi-metrics.js` | `js/kpi-metrics.js` | T-001 |
| T-003 | Helper collapse `<details>` | `js/render.js` | — |
| T-004 | Collapse su tutte le tabelle Situazione + fix bug `house` | `js/render.js` | T-003 |
| T-005 | Redesign chip totali Situazione | `js/render.js`, `css/app.css` | T-001 |
| T-006 | Markup Panoramica KPI-only | `index.html` | T-001 |
| T-007 | Render KPI + link Situazione | `js/render.js` | T-002, T-006 |
| T-008 | Deep link periodo | `js/main.js` | T-007 |
| T-009 | CSS collapse + KPI grid | `css/app.css` | T-003–T-006 |
| T-010 | Empty state / render pipeline | `js/render.js` | T-006, T-007 |
| T-011 | Verifica manuale | — | T-004–T-010 |

---

## Decisioni proposte (default se non specifichi diversamente)

1. **Filtro esercizio Panoramica**: mantenuto, scope KPI sul periodo selezionato.
2. **Altri esercizi**: mini-lista compatta (max 5 righe, badge + saldo) con link a Situazione.
3. **Saldi anno precedente**: collapsed come le altre tabelle; totali critici restano nei chip primari in cima.
4. **Deep link accordion**: v1 solo periodo preselezionato; hash sezione rate in iterazione successiva se serve.
5. **Da pagare senza consuntivo**: mostra totale su preventivo (+ saldo precedente se presente).

---

## Out of scope

- Modifica logica contabile (`fiscal.js`, regole saldi)
- Redesign PDF
- Persistenza stato collapse
- Grafici / trend
- Nuove API Supabase

---

## Rischi

| Rischio | Mitigazione |
|---------|-------------|
| Re-render chiude accordion | Accettabile in v1; id stabili per sezione |
| Ridondanza hero vs KPI grid | Rimuovere/fondere `#metrics` legacy |
| Perdita lista versamenti Panoramica | Link «Storico versamenti» → subview versamenti |

---

## Open questions per l'operatore

Rispondi a **approve** (accetti i default sopra) oppure **revise: …** con preferenze su:

1. Filtro esercizio in Panoramica — mantenerlo o fisso su esercizio corrente?
2. Mini-lista «Altri esercizi» — sì (max 5) o solo link unico «Vedi tutti in Situazione»?
3. Saldi anno precedente — collapsed o sempre aperto?
