# Council Output — Plan and Verification

**Topic**: Sistemare visualizzazioni rendiconti — Situazione collapse, KPI Panoramica  
**Date**: 2026-06-01  
**Pattern**: plan-execute-verify  
**Session**: rendiconti-kpi-situazione-panoramica

---

## Executive summary

Panoramica ridisegnata come **dashboard KPI-only**: hero «Sei in regola» + griglia indicatori (saldo, da pagare, copertura, rate, scostamento) con link verso Situazione. **Situazione** riorganizzata con totali in evidenza (6 chip max, 2 tier) e **tabelle a scomparsa** (`<details>`) per preventivo, consuntivo, versamenti e riporti. Nessuna modifica DB o PDF.

---

## Context

App HTML/JS + Supabase per gestione spese condominiali. Logica contabile esistente (`fiscal.js`, `situazione-report.js`, `compliance-status.js`) riusata; intervento solo UI/UX.

---

## Approved plan (summary)

- US-001–US-005: accordion Situazione, chip totali, Panoramica KPI-only, deep link, coerenza dati
- KPI set: stato pagamenti, saldo consuntivo, da pagare, copertura, prossima rata, scostamento, esercizi in debito
- Default: filtro esercizio mantenuto; mini-lista altri esercizi (max 5); saldi precedenti collapsed

---

## Execution summary

| Deliverable | File |
|-------------|------|
| Modulo KPI | `js/kpi-metrics.js` |
| Render Panoramica + Situazione | `js/render.js` |
| Deep link periodo | `js/main.js` |
| CTAs con periodo | `js/compliance-status.js` |
| Markup | `index.html` |
| Stili | `css/app.css` |

---

## Verification results

- Syntax check JS: OK
- AC-US002-01 fix: chip count ≤ 6
- Browser/a11y/Supabase: checklist manuale in `verification.md`

---

## Deviations and resolutions

| Deviation | Resolution |
|-----------|------------|
| 7 chip Situazione con «Da pagare» | «Da pagare» sostituisce «Stato» nel tier primario |
| Hero non segue filtro esercizio | Accettato per design (hero = esercizio corrente) |

---

## Recommendation

**Merge-ready** dopo smoke test browser (Panoramica → Situazione → collapse → PDF).

---

## Risks and mitigations

| Rischio | Mitigazione |
|---------|-------------|
| Hero vs filtro KPI | Etichetta filtro «Esercizio corrente» + scope esplicito |
| Perdita lista versamenti Panoramica | Link «Storico versamenti» |

---

## Open questions

Nessuna — operator ha approvato default in plan gate.

---

## Next steps

1. Smoke test manuale (checklist verification.md)
2. Devil's Advocate review (opzionale)

---

## Deliberation trail

| Step | Outcome |
|------|---------|
| Round 1 Plan | Requirements Planner PROPOSE + Task Architect PROPOSE → `plan.md` |
| HITL Plan | Operator **approve** |
| Execute | Full-Stack Implementer → `execution.md` + codice |
| Verify | Quality Verifier OBJECT → fix chip count → APPROVE |
| Devil's Advocate | Operator **yes** → OBJECT → 10 amendments → `plan-and-verification-after-devils-review.md` |
