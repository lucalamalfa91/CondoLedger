# Round 1 — Verifica e fix dati Riepilogo / Situazione / sezione Dati

## Responses

### Requirements Planner
**Vote**: PROPOSE
**Reasoning**: Verifica statica delle 3 segnalazioni. #1 e #2 condividono sorgente dati (causa comune); #3 confermata come problema UX (sezione "Dati" = guscio di soli rimandi). Cautela sulla causa esatta di #1/#2 (CSS vs dati vs JS).
**Details**: User stories US-001..US-004 con AC; 6 domande aperte all'operatore.

### Task Architect
**Vote**: PROPOSE
**Reasoning**: Root cause unica per #1 e #2 individuata e isolata: `today` è una **stringa** (`js/utils.js:2`) ma viene chiamata come **funzione** in `compliance-status.js:48,158` e `payment-guide.js:12,17`. `render()` (`render.js:1043`) senza try/catch chiama `renderComplianceHero` per primo → `TypeError` → aborta tutto il rendering (Panoramica + Situazione). Scatta solo con case che hanno dati (compliance esce prima per case vuote). #3 = duplicazione di navigazione.
**Details**: Task T-001..T-004; opzioni A/B/C per la #3; nessun impatto su schema/RLS.

## Coordinator Synthesis

**Verifica diretta del Coordinator**: confermata la root cause. `js/utils.js:2` definisce `export const today = ...slice(0,10)` (stringa). Grep conferma 4 call-site `today()` in `compliance-status.js` (48, 158) e `payment-guide.js` (12, 17). `render.js:1051-1062` chiama `renderComplianceHero(house)` (1053) prima di tutto il resto e prima di `renderSituazione` (1062), senza try/catch → un `TypeError` qui spiega in pieno entrambe le segnalazioni 1 e 2.

**Consensus**: Parziale (entrambi PROPOSE; allineati sulla diagnosi tecnica). Diagnosi #1/#2 ora **confermata** (non più "da chiarire"). Resta una **decisione operatore** sulla #3.

**Agreements**:
- #1 e #2 = stessa root cause (`today()` chiamato su una costante stringa) → fix T-001 + T-002.
- #3 = sezione "Dati" ridondante (solo rimandi) → da razionalizzare.
- Fix puramente frontend; nessun impatto su schema Supabase/RLS.
- Necessaria verifica manuale post-fix (regressioni su logica data odierna/scadenze).

**Outstanding objections**: nessuna.

**Punto aperto da decidere (HITL)**:
- **Scelta per la segnalazione 3**: Opzione A (rimuovere sezione "Dati" dalla nav, funzioni restano in Avanzate) — consigliata; Opzione B (nascondere, lascia codice morto); Opzione C (consolidare Dati+Avanzate, più invasiva).

**Revised proposal for next round**: non necessario un altro round di deliberazione; il piano è pronto per il gate di approvazione operatore (HITL Type C).
