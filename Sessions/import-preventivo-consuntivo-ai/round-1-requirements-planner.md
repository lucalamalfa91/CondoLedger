## Requirements Planner — Round 1 Response

**Vote**: PROPOSE

**Reasoning**: L'operatore vuole replicare per preventivo/consuntivo amministratore il pattern già collaudato dell'import Intesa (caricamento → anteprima → revisione → persistenza Supabase), estendendolo a formati non strutturati (DOCX/PDF/immagine) con estrazione AI. Il dominio app è chiaro: `fiscal_periods`, `dues` con `due_kind`, rate via `split_mode`. L'app modella **un solo immobile per casa**: la "persona dell'elenco" è la **riga/unità del documento** da associare al proprietario. MVP: esercizio + dovuto + rate; estensioni in fase 2 con HITL su bassa confidenza.

**Details**: US-001–US-010 (MVP), US-011–US-013 (Later). Vedi plan.md per elenco completo AC.
