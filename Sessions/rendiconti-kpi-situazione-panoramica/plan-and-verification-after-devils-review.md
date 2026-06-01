# Council Output — Plan and Verification (after Devil's Review)

**Topic**: Sistemare visualizzazioni rendiconti — Situazione collapse, KPI Panoramica  
**Date**: 2026-06-01  
**Session**: rendiconti-kpi-situazione-panoramica  
**Status**: Conditional merge-ready (browser smoke test pending)

---

## Executive summary

Panoramica è una **dashboard KPI-only** con nota di scope esplicita (`#panoramicaScopeNote`) che indica l'esercizio degli indicatori e avvisa se il hero «Sei in regola» si riferisce a un esercizio diverso. Situazione usa **chip a 2 tier (max 6)** e **accordion** per il dettaglio. Post-review: hint «Da pagare» unificati, link esercizi prioritizzati per debito, card credito duplicata rimossa, copertura mostra eccedenza.

---

## Amendments from Devil's Advocate

| Area | Change |
|------|--------|
| Scope clarity | `#panoramicaScopeNote` con esercizio + avviso disallineamento hero |
| KPI dedup | Rimossa card «Credito consuntivo» ridondante |
| Hints | `resolveToPayInfo()` condiviso Panoramica/Situazione |
| Altri esercizi | Sort debit-first; titolo «Collegamenti rapidi» |
| Filter | «Esercizio in corso (auto)» |
| Copertura | >100% + hint eccedenza |
| Robustness | Guard `annualPageCards` in empty state |
| CTA | «Vedi situazione» (ex Panoramica esercizi) |

---

## Recommendation

**Conditional merge-ready**: implementazione completa; eseguire smoke test browser prima del deploy.

### Smoke test minimo

1. Panoramica → verificare nota scope con filtro su esercizio passato
2. KPI «Da pagare» / chip Situazione → stesso hint
3. Situazione → accordion chiusi, expand, cambio esercizio
4. PDF export invariato

---

## Deliberation trail

| Step | Outcome |
|------|---------|
| Plan | Operator **approve** |
| Execute | Code + `execution.md` |
| Verify | APPROVE post chip-count fix |
| Devil's Advocate | OBJECT → 10 fixes applied → conditional approve |
| Final artifact | This file |

See also: `devils-advocate-review.md`, original `plan-and-verification.md`
