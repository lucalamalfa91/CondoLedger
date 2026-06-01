## Task Architect — Round 1 Response

**Vote**: **PROPOSE**

**Reasoning**: I saldi dell'anno precedente oggi finiscono indirettamente nel modello esistente (riporto su preventivo via `dues.carry_from_period_id` o versamenti carry-forward). La richiesta chiede un'entità separata. Proposta: tabella `prior_balances` + CRUD + box Situazione/PDF.

**Details**: T-001–T-011. Schema SQL, load/save pattern, UI subview `saldi-precedenti`, estensione `buildSituazioneReport()` e `pdf-situazione.js`.
