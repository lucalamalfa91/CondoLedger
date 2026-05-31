## Task Architect — Round 1 Response

**Vote**: PROPOSE

**Reasoning**: Estensione flusso import esistente con `houses.import_parties` JSONB, moduli client match/resoconto, estensione schema AI; commit riusa `buildDuesFromPreview` e duplicate detection.

**Details**: T-001–T-016 (vedi plan.md). Architettura: match client-side post-estrazione, resoconto HITL, fallback legacy senza nominativi.
