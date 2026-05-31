# Verification — Import preventivo/consuntivo AI

**Date**: 2026-05-31  
**Verifier**: Coordinator (Execute review)

## Plan compliance

| Requirement | Status |
|-------------|--------|
| Upload PDF/DOCX/immagini multipli | Implemented |
| Estrazione server-side (Edge Function) | Implemented — requires deploy |
| HITL post-estrazione (no nome pre-upload) | Implemented — tabella righe + radio |
| Split identico (`split_amounts`) | Implemented |
| Schede preventivo/consuntivo | Implemented — checkbox per sezione |
| Duplicati con scelta operatore | Implemented — prompt a/s/annulla |
| Fallback manuale | Implemented |
| Tracciamento `document_imports` | Implemented — needs migration |

## Gaps vs acceptance criteria

| AC | Gap |
|----|-----|
| AC-US011+ | Voci costo solo in schema, non UI dedicata |
| AC-US013 | Verifica millesimi non implementata |
| E2E automatico | Nessuno — checklist manuale in `execution.md` |

## Recommended manual test plan

1. Applicare migration SQL.
2. Deploy `extract-document` + `OPENAI_API_KEY`.
3. **Il Parco** — `Preventivo ripartizioni per anagrafica 2025_26.pdf`: verificare esercizio, riga, rate.
4. **Via Anzani** — selezionare tutti JPEG 2024-2025: un'anteprima, ordine pagine.
5. Re-import stesso file → avviso duplicato.
6. Situazione/PDF: rate con importi non uniformi riflessi correttamente.

## Vote (revisione post Devil's Advocate)

**OBJECT** — Il codice riflette il piano MVP, ma **non** si può approvare la release senza: migration + Edge Function deployate, E2E su PDF reali, fix encoding PDF in Function, allineamento limite upload. Vedi `devils-advocate-review.md`.

*Nota: il voto APPROVE iniziale era prematura (nessun test E2E eseguito).*
