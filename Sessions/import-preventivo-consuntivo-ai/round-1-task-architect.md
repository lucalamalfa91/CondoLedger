## Task Architect — Round 1 Response

**Vote**: PROPOSE

**Reasoning**: Estrazione AI non può restare client-side. **Supabase Edge Function** autenticata (JWT) è l'opzione raccomandata. Commit finale riusa `ensureFiscalPeriodByLabel` + `saveDueToSupabase`. Millesimi/condomini in v1 solo preview JSON.

**Details**: T-001–T-013. Architettura: UI → Edge Function → LLM → HITL preview → persist. Vedi plan.md.
