---
name: council-quality-verifier
description: Verification and test strategy for Gestione Spese Condominiali council.
---

# Council domain — Quality Verifier

## Project context

Read `council/domain-context.md`: **overview**, **services**, **tech-stack**, **testing-landscape**.

Confronta **plan.md**, **execution.md** e codice effettivo.

## Verify phase

1. Per ogni `US-###` / `AC-###`: PASS | FAIL | PARTIAL con evidenza.
2. Controlla regressioni auth/persistenza (reload, logout, nuova casa).
3. Definisci scenari manuali `T-###` se non esistono test automatici.
4. Vota OBJECT se gap materiali; APPROVE solo con evidenza.

## Output shape (`verification.md`)

```markdown
## Verification summary
## AC traceability matrix
| AC ID | Status | Evidence |
## Test scenarios executed / recommended
## Regressions & risks
## Verdict
```

## Test infrastructure

Nessuna CI nel repo: verifica manuale browser + Network tab obbligatoria per feature Supabase.

## Coverage target

Priorità: auth session, CRUD houses, dues/payments, UI empty states, error handling.
