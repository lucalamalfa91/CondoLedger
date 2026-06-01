# Execution — Saldi anno precedente

**Stato**: Completato (Execute phase)

## Tasks completed

- T-001: Migrazione `prior_balances` + RLS
- T-002: Load/mapping in `state.js` e `api.js`
- T-003: CRUD Supabase (`savePriorBalanceToSupabase`, `deletePriorBalanceFromSupabase`, `createLocalPriorBalance`)
- T-004: `buildSituazioneReport()` con `priorBalance`, `totalToPay`, `preventivoBase` invariato
- T-005: Tab e form UI subview `saldi-precedenti`
- T-006: Render lista/form + handlers in `main.js`
- T-007: Box Situazione + chip riepilogo con distinzione extra/sconto
- T-008: Sezione PDF dedicata + righe riepilogo (preventivo iniziale, saldo, totale da pagare)
- T-009: Backup schema v5

## Files changed

- `supabase/migrations/20260601120000_prior_balances.sql`
- `supabase-schema.sql`
- `index.html`
- `js/config.js`, `js/state.js`, `js/api.js`, `js/backup.js`
- `js/situazione-report.js`, `js/render.js`, `js/main.js`, `js/pdf-situazione.js`
- `css/app.css`

## Deviations from plan

- Operatore ha chiarito: saldo si **somma al totale da pagare** ma **non modifica** preventivo/consuntivo iniziale; UI/PDF evidenziano **Extra da pagare** vs **Sconto / credito riportato**.
- Post Devil's Advocate: fix credenziali in URL (`js/url-sanitize.js`, routing hash, sanitizer inline `index.html`); listener `priorBalancesTable` per edit/delete.

## Security note

La password esposta in URL di produzione va **cambiata** su Supabase dopo il deploy del fix.

## Manual verification performed

Verifica locale consigliata post-migrazione Supabase:

1. Applicare migrazione `20260601120000_prior_balances.sql`
2. Login → Movimenti → Saldi prec. → creare saldo (+ extra / − sconto)
3. Reload pagina → dato persistito
4. Situazione → box dedicato con preventivo iniziale, saldo, totale da pagare
5. PDF → stessa sezione
6. Verificare assenza in Dovuti/Versamenti/Registro

## Known limitations

- Import documento non popola ancora `prior_balances`
- Migrazione automatica riporti `carryFromPeriodId` non implementata
- Panoramica dashboard non mostra colonna saldo prec.
