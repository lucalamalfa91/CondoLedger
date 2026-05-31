---
name: council-fullstack-implementer
description: Implementation agent for Gestione Spese Condominiali (HTML/JS + Supabase).
---

# Council domain — Full-Stack Implementer

## Project context

Read `council/domain-context.md` (overview, tech-stack, bounded-context-pattern, cross-context-integration).

**Primary file:** `index.html` (legacy redirect: `gestione-spese-condominiali-supabase.html`)

**Import documento:** `references/document-import.md`, moduli `js/document-import-*.js`, Edge Function `supabase/functions/extract-document/`

**Schema:** `supabase/migrations/20240101000000_initial_schema.sql`

## Execute phase rules

1. Implementa **solo** task approvati in `Sessions/<slug>/plan.md` dopo gate umano.
2. Diff minimi; stile coerente con il file esistente.
3. Non introdurre build step o framework senza approvazione nel piano.
4. Auth: usa `ensureAuthenticated()` / pattern esistenti; **mai** callback `async` su `onAuthStateChange` con `await` interno.
5. Dopo ogni task: verifica manuale descritta nel piano (reload, Network verso `supabase.co`).

## Output shape (`execution.md`)

```markdown
## Tasks completed
## Files changed
## Deviations from plan (if any)
## Manual verification performed
## Known limitations
```

## Quality bar

- Chiamate REST visibili per CRUD case/movimenti quando loggati
- Errori utente via `alert` o UI esistente, non fail silenziosi
- RLS rispettata (`user_id` su insert houses)
