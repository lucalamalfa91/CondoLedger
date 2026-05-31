# Execution — Import preventivo/consuntivo AI

**Date**: 2026-05-31  
**Phase**: Execute (post plan approval)

## Tasks completed

| ID | Status | Notes |
|----|--------|-------|
| T-000 | Done | Migration `split_amounts` + `document_imports`; `installments.js` uses exact amounts |
| T-001 | Done | `js/document-import-schema.js` |
| T-002 | Done | `supabase/functions/extract-document/index.ts` (OpenAI gpt-4o) |
| T-003 | Done | PDF/image base64 + DOCX text in Edge Function |
| T-004 | Done | `js/document-import-api.js` |
| T-005 | Done | `state.documentImportPreview`, handlers in `main.js` |
| T-006 | Done | `js/document-import-map.js` |
| T-007 | Done | UI in `index.html`, `render.js`, `css/app.css` |
| T-008 | Done | Commit via `saveDueToSupabase` + `recordDocumentImport` |
| T-009 | Done | Pulsante "Inserisci manualmente" → form dovuti |
| T-010 | Done | `js/document-import-validate.js` |
| T-011 | Done | Migration `document_imports` (in T-000) |
| T-012 | Partial | `costLines` in schema/preview only; multi-due consuntivo da voci in P1 |
| T-013 | Pending | E2E manuale con file in `Documents/Spese Condiminiali` |

## Files changed

- `supabase/migrations/20260531120000_split_amounts_document_imports.sql`
- `supabase/functions/extract-document/index.ts`
- `js/document-import-schema.js`, `document-import-api.js`, `document-import-map.js`, `document-import-validate.js`
- `js/installments.js`, `js/api.js`, `js/state.js`, `js/main.js`, `js/render.js`, `js/config.js`, `js/utils.js`
- `index.html`, `css/app.css`

## Deviations from plan

- Duplicati: scelta tramite `prompt()` (a/s/annulla) invece di modale dedicata — sufficiente per MVP.
- Edge Function richiede deploy manuale e `OPENAI_API_KEY` (non automatizzabile da CI senza secret).

## Deploy Edge Function (operatore)

```bash
supabase login
supabase link --project-ref cwvwfrrknmjwdpcnqvhv
supabase secrets set OPENAI_API_KEY=sk-...
supabase functions deploy extract-document
```

Eseguire anche la migration `20260531120000_split_amounts_document_imports.sql` nel SQL Editor.

## Manual verification performed

- [ ] Migration applicata su Supabase
- [ ] Function deployata con secret
- [ ] Upload PDF Il Parco → anteprima righe → selezione riga → conferma
- [ ] Upload batch JPEG Via Anzani → un job
- [ ] Rate con importi diversi persistite in `split_amounts`
- [ ] Duplicato → avviso e scelta
- [ ] Fallback manuale

## Documentation

- `README.md` — sezione *Import documento amministratore* + elenco migration
- `references/document-import.md` — guida utente e riferimento tecnico
- `Docs/INDEX.md`, `council/domain-context.md` — aggiornati

## Post-DA fixes (2026-05-31)

- Edge Function: base64 chunked per PDF/immagini grandi
- Client: limite 15 MB **totali**; `ensureDocumentImportReady` fail-fast
- HITL: confidence su scheda/riga; modifica totale e rate in anteprima
- Duplicati: `<dialog>` al posto di `prompt()`; avviso dovuti esistenti per esercizio
- Replace: salva nuovi dovuti prima di eliminare i vecchi
- Pulsante **Riprova estrazione**; rate ordinate per `periodStart`

## Known limitations

- Estrazione dipende da OpenAI; PDF oltre ~15 MB totali o molto grandi per singolo file possono superare limiti API vision.
- US-011–013 (voci costo estese, verifiche millesimi) solo parziali in anteprima.
- `gestione-spese-condominiali-supabase.html` non aggiornato (entry point unico `index.html`).
