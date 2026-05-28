## Task Architect — Round 1 Response

**Vote**: PROPOSE

**Reasoning**:
I tre obiettivi toccano layer distinti ma accoppiati: ristrutturazione prerequisito per fiscalità e import; schema DB va oltre `year int`. SPA statica ES modules, entry `index.html`, migrazioni Supabase, SheetJS CDN, matching con soglia confidenza e default non associato sotto soglia.

**Details**: 22 task ordinati (T-001–T-022) in 5 fasi: refactor, fiscalità backend/frontend, import bancario, verifica. Schema: `fiscal_settings`, `fiscal_periods`, `bank_movements`, FK `fiscal_period_id` su dues/payments. Migration backfill calendario-safe.
