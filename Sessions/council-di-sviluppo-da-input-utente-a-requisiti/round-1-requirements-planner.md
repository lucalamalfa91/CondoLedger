## Requirements Planner — Round 1 Response

**Vote**: PROPOSE

**Reasoning**:
L'input operatore copre tre epic distinte ma collegate: ristrutturazione del monolite HTML, introduzione di annualità fiscali configurabili (oggi `year int` calendario su `dues`/`payments`), e import Excel Banca Intesa con matching semi-automatico. Lo stato attuale non modella né periodi fiscali né rate/installment: ogni casa ha un importo dovuto per anno e versamenti legati allo stesso intero. Le user story sotto preservano il valore attuale (multi-immobile, auth Supabase, RLS), estendono il dominio in modo incrementale e separano esplicitamente ciò che va chiarito prima dell'implementazione.

**Details**: 14 user stories (US-001–US-014) in 3 epic: modularizzazione, fiscalità, import Intesa. 12 open questions documentate. Out of scope: multi-condomino, API banca diretta, multi-banca v1, contabilità completa, build obbligatorio.
