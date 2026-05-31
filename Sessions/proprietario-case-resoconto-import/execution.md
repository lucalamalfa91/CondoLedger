# Execution — proprietario-case-resoconto-import

## Tasks completed

- T-001 Migration `import_parties` su `houses`
- T-003–T-006 State, API save/load, UI form casa, backup v4
- T-007–T-008 Match fuzzy + filtro post-estrazione
- T-009 Schema estrazione `summary` (Edge Function)
- T-010–T-014 Resoconto UI, mapping carryover, stepper import
- T-015 Documentazione `references/document-import.md`

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260531140000_house_import_parties.sql` | Colonna JSONB |
| `supabase-schema.sql` | Snapshot schema |
| `supabase/functions/extract-document/index.ts` | Campo `summary` nel prompt/schema |
| `js/house-import-parties.js` | Nuovo |
| `js/document-import-match.js` | Nuovo |
| `js/document-import-resoconto.js` | Nuovo |
| `js/state.js`, `js/api.js`, `js/config.js`, `js/backup.js` | `importParties`, schema v4 |
| `js/document-import-schema.js` | Normalizza `summary` |
| `js/document-import-map.js` | Carryover da resoconto |
| `js/document-import-validate.js` | Gate resoconto confermato |
| `js/main.js`, `js/render.js`, `index.html` | Integrazione UI |

## Decisioni operatore applicate

- Nessun campo unità/interno
- Carryover **automatico** se confermato nel resoconto (checkbox)
- Campioni documento: JPEG multi-pagina (stesso supporto già in import)

## Manual verification (da eseguire)

1. Applicare migration SQL su Supabase (`import_parties`)
2. Rideploy Edge Function `extract-document` per campo `summary`
3. Impostazioni → Casa: salvare proprietario (+ affittuario opzionale)
4. Import JPEG: verificare resoconto, conferma resoconto, commit dovuti
5. Casa senza nominativi: flusso manuale invariato

## Known limitations

- Match nominativo solo su testo riga (no unità)
- `carryFromPeriodId` risolto se esiste già l'esercizio precedente in DB; altrimenti dovuto senza FK
- Edge Function va ridistribuita per `summary` ottimale da JPEG
