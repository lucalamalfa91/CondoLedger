# Execution log — council-di-sviluppo-da-input-utente-a-requisiti

**Data**: 2026-05-28  
**Operatore**: approvazione implicita con risposte open questions (#1 file Intesa, #4 no legacy)

## Tasks completed

- T-001–T-005: Modularizzazione (`index.html`, `css/app.css`, `js/*`), Vercel rewrite, redirect legacy
- T-006–T-009: Migration `20260528100000_fiscal_and_bank.sql` (clean slate dues/payments)
- T-010–T-014: UI esercizio fiscale per casa, select periodo, aggregazioni
- T-015–T-020: Import Intesa (SheetJS), parser, matching, preview, link manuale
- Documentazione formato Intesa in `references/intesa-format.md`

## Files changed

| Area | Files |
|------|-------|
| Frontend | `index.html`, `css/app.css`, `js/*.js`, `gestione-spese-condominiali-supabase.html` |
| DB | `supabase/migrations/20260528100000_fiscal_and_bank.sql` |
| Deploy | `vercel.json`, `README.md` |
| Docs | `references/intesa-format.md`, `Sessions/.../execution.md` |

## Deviations from plan

- **No backfill migration**: operatore confermato assenza dati legacy → migration ricrea `dues`/`payments` senza colonna `year`
- **Config fiscale per casa** (`houses.fiscal_start_month`), non per utente
- **Fixture Intesa**: documentato da `Lista_Operazioni_28052026.xlsx` (header riga 21)

## Manual verification performed

- [ ] Eseguire migration su Supabase cloud
- [ ] `npx serve .` → login, crea casa, imposta mese esercizio
- [ ] Registra dovuto → esercizio creato automaticamente
- [ ] Import file Excel operatore → anteprima movimenti
- [ ] Conferma subset → versamenti + movimenti unlinked in coda manuale

## Known limitations

- Demo locale disabilitata (richiede Supabase + fiscal_periods)
- Match automatico non collega silenziosamente sotto soglia 0.85
- File Intesa campione contiene prevalentemente uscite personali; matching condominio richiede dovuto registrato + keyword/importo
