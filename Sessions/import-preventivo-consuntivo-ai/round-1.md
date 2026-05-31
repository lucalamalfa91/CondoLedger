# Round 1 — Import preventivo/consuntivo con estrazione AI

## Responses

### Requirements Planner

**Vote**: PROPOSE

**Reasoning**: Pattern import Intesa applicabile; MVP su campi obbligatori; HITL su confidenza < 0,70 e mismatch aritmetici.

**Details**: 10 user stories MVP (US-001–US-010), 3 estensioni Later (US-011–US-013). Gap aperto: rate con importi non uniformi vs `installments.js` equo.

### Task Architect

**Vote**: PROPOSE

**Reasoning**: Edge Function Supabase + LLM vision; nessun cambio schema obbligatorio MVP; migration opzionale `document_imports` per audit.

**Details**: 13 task ordinati T-001–T-013; rifiuto client-only per API key.

## Coordinator Synthesis

**Consensus**: No (Plan phase — synthesis for HITL, not final APPROVE)

**Agreements**:
- Flusso: upload → estrazione server-side → anteprima HITL → commit esplicito (no auto-persist)
- MVP: anno fiscale, totale, tipo preventivo/consuntivo, riga unità, rate preventivo
- Riuso API fiscali esistenti; pattern analogo import Intesa
- Fallback manuale sempre disponibile

**Outstanding objections**: Nessuna REJECT/OBJECT formale.

**Revised proposal for next round**: Piano unificato in `plan.md` — in attesa approvazione operatore prima di Execute.
