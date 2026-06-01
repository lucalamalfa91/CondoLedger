# Round 1 — Rendiconti KPI, Situazione e Panoramica

## Responses

### Requirements Planner
**Vote**: PROPOSE

**Reasoning**: Due livelli distinti — Panoramica = risposta immediata; Situazione = dettaglio on demand. Logica dati già pronta; serve riorganizzazione UI + collapse. KPI mercato: stato regolarità, saldo, da pagare, copertura, prossima scadenza (art. 1130 c.c., portali HOA).

**Details**: 5 user stories (US-001–US-005), 18 acceptance criteria, 8 KPI raccomandati, 5 open questions.

### Task Architect
**Vote**: PROPOSE

**Reasoning**: Panoramica oggi ibrida (hero + 3 liste); Situazione tutto espanso. Proposta: `<details>/<summary>`, modulo `kpi-metrics.js`, deep link via `pendingSituazionePeriodId`. Zero migrazioni DB.

**Details**: 11 task (T-001–T-011), fix bug `house` in `renderConsuntivoSection`, rimozione elenchi Panoramica.

---

## Coordinator Synthesis

**Consensus**: No (Plan phase — awaiting operator gate)

**Agreements**:
- Situazione: summary-first + accordion collapsed default; PDF invariato
- Panoramica: KPI-only + link Situazione; compliance hero mantenuto
- KPI set ristretto da dati esistenti; nuovo `js/kpi-metrics.js`
- Collapse nativo `<details>` per a11y e semplicità
- Nessun cambio schema Supabase

**Outstanding objections**: Nessuna obiezione tecnica tra planner e architect.

**Open questions** (operator):
1. Filtro esercizio Panoramica
2. Formato «Altri esercizi»
3. Collapse su saldi anno precedente

**Revised proposal**: Piano consolidato in `plan.md` con default decisionali. Prossimo step: **HITL approve / revise / stop** prima di Execute.
