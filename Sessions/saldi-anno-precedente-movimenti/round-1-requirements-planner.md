## Requirements Planner — Round 1 Response

**Vote**: **PROPOSE**

**Reasoning**: Il topic chiede una nuova entità di dominio distinta da dovuti e versamenti, con impatto su UI Movimenti, persistenza, Situazione e PDF. Dall'analisi del codebase oggi il saldo precedente viene trattato come voce preventivo con `carryFromPeriodId` (import documento) o come versamento che salda il consuntivo precedente — non come concetto autonomo.

**Details**: US-001–US-008 con AC completi. Open questions su cardinalità, impatto totali, coesistenza riporti, import documento.
