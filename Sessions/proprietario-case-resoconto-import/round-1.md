# Round 1 — Proprietario in casa, filtro import e resoconto

## Responses

### Requirements Planner
**Vote**: PROPOSE  
**Reasoning**: Nominativi per casa, match fuzzy, OR multi-proprietario, somma affittuario+proprietario, resoconto HITL prima del commit; fallback legacy.  
**Details**: US-001–US-012; open questions su unità, carryover, soglia fuzzy, schema saldi.

### Task Architect
**Vote**: PROPOSE  
**Reasoning**: `import_parties` JSONB, moduli match/resoconto client, estensione extract-document, integrazione con flusso import esistente.  
**Details**: T-001–T-016 ordinati; rischi fuzzy false positive/negative, somma rate, schema AI drift.

## Coordinator Synthesis

**Consensus**: Non ancora (fase Plan — serve HITL operatore su `plan.md`)

**Agreements**:
- JSONB su `houses` per anagrafica import
- Match post-estrazione lato client
- Resoconto strutturato con conferma prima del commit
- Fallback se nominativi assenti
- Riuso pipeline commit/duplicati esistente

**Outstanding objections**: Nessuna tra teammate (entrambi PROPOSE)

**Revised proposal**: Piano in `plan.md` — in attesa **approve** / **revise** / **stop**
