# Devil's Advocate Review — Import preventivo/consuntivo AI

**Date**: 2026-05-31  
**Vote**: OBJECT  
**Phase 1 artifacts reviewed**: `plan.md`, `execution.md`, `verification.md`, `references/document-import.md`, implementation skim

## Assessment

Il deliverable è **architetturalmente coerente** con il piano, ma **non è pronto per essere considerato “completato e verificato”**: mancano deploy migration/Function, E2E su PDF reali, e diversi AC P0 sono solo parzialmente implementati. La verification **APPROVE** era prematura.

## Challenges

| # | Title | Category | Disposition |
|---|--------|----------|-------------|
| 1 | Verification APPROVE vs path critico non testato | contradiction | **Accettata** — aggiornare verification; E2E obbligatorio pre-release |
| 2 | “Execute completato” con T-013 aperto | contradiction | **Accettata** — stato sessione = Execute done, Verify/Release pending |
| 3 | HITL confidence solo su esercizio fiscale | completeness-gap | **Accettata** — backlog P0.1 |
| 4 | Rate non editabili in anteprima | completeness-gap | **Accettata** — backlog P0.2 |
| 5 | Nessun fallback manuale in anteprima senza righe | completeness-gap | **Accettata** — backlog P1 |
| 6 | Duplicati solo per hash, non nome+esercizio+tipo | completeness-gap | **Accettata** — backlog P1 |
| 7 | Limite 15 MB: per file vs totale | contradiction | **Accettata** — allineare client a totale 15 MB |
| 8 | `btoa` su PDF grandi in Edge Function | error | **Accettata** — fix encoding chunked (P0 blocker deploy) |
| 9 | “Sostituisci” non transazionale | assumption | **Accettata** — documentare rischio; backlog transazione |
| 10 | Senza migration degradazione silenziosa | assumption | **Accettata** — fail-fast se tabella/colonna assente |
| 11 | Nessun avviso riuso esercizio esistente | completeness-gap | **Accettata** — backlog P1 |
| 12 | Nessun pulsante “Riprova” | completeness-gap | **Accettata** — backlog P1 |
| 13 | `slotIndex` vs ordine rate | assumption | **Accettata** — ordinare rate per `periodStart` prima del save |
| 14 | Duplicati via `prompt()` | vagueness | **Parzialmente accettata** — MVP accettabile; modale in P1 |

## Recommended actions before production use

1. Applicare migration `20260531120000_split_amounts_document_imports.sql`
2. Deploy `extract-document` + `OPENAI_API_KEY`
3. E2E su almeno: PDF Il Parco preventivo, batch JPEG Via Anzani
4. ~~Fix P0: encoding PDF~~ → **fatto** (base64 chunked)
5. ~~Limite 15 MB totale client~~ → **fatto**
6. ~~Fail-fast migration~~ → **fatto** (`ensureDocumentImportReady`)
7. ~~Replace transazionale~~ → **migliorato** (salva nuovi, poi elimina vecchi)
8. ~~HITL confidence esteso, rate editabili, dialog duplicati, riprova~~ → **fatto** (2026-05-31)

## Post-fix status

Blocker codice P0 affrontati. Resta **validazione E2E** su documenti reali dopo deploy.

## Deliberation trail

Devil's Advocate: **OBJECT** (14 challenges). Coordinator: nessun `decision-after-devils-review.md` finché non si chiudono i P0 blocker o si accetta esplicitamente il rischio operatore.
