# Devil's Advocate Review — rendiconti-kpi-situazione-panoramica

**Vote**: OBJECT (substantive issues — partially resolved)  
**Date**: 2026-06-01

---

## Reasoning

The redesign delivers the operator brief (collapse Situazione, KPI Panoramica, market-aligned indicators) but overstated merge readiness while browser verification remained open. The highest-risk UX gap was **split scope** on Panoramica: hero vs KPI grid could reference different exercises without explanation. Several medium issues (duplicate KPI, misleading filter label, hint inconsistency) were fixable without scope change.

---

## Challenges and resolutions

| # | Challenge | Severity | Resolution |
|---|-----------|----------|------------|
| 1 | Hero vs KPI grid different exercises when filter changes | High | **Accepted + mitigated**: `#panoramicaScopeNote` shows exercise label and warns when hero scope differs |
| 2 | `focusPeriodLabel` never rendered | High | **Fixed**: scope note displays «Indicatori per esercizio {label}» |
| 3 | US-005 coherence overstated | High | **Partially accepted**: doc updated; hero stays on current exercise by design; mixed-scope KPI «Esercizi in debito» documented |
| 4 | Duplicate Saldo + Credito cards | Medium | **Fixed**: removed redundant «Credito consuntivo» card |
| 5 | Stato pagamenti KPI #1 only in hero | Medium | **Dismissed**: hero explicitly serves as KPI #1 «Stato pagamenti» per plan; grid holds numeric detail |
| 6 | «Altri esercizi» vs KPI-only brief | Medium | **Partially accepted**: renamed «Collegamenti rapidi — altri esercizi»; operator approved mini-list in plan gate |
| 7 | Period links hide debit years | Medium | **Fixed**: sort debit exercises first, then newest |
| 8 | Filter label «Esercizio corrente» misleading for `all` | Medium | **Fixed**: «Esercizio in corso (auto)» |
| 9 | Inconsistent «Da pagare» hints | Medium | **Fixed**: shared `resolveToPayInfo()` in `kpi-metrics.js` |
| 10 | APPROVE vs NEEDS-MANUAL gap | Medium | **Accepted**: recommendation downgraded to conditional merge pending smoke test |
| 11 | aria-expanded AC without a11y evidence | Medium | **Deferred**: native `<details>`; manual NVDA/VoiceOver pass still required |
| 12 | Accordion reset on re-render | Low | **Accepted v1** |
| 13 | `annualPageCards` empty state throw | Medium | **Fixed**: optional guard |
| 14 | CTA «Panoramica esercizi» | Low | **Fixed**: «Vedi situazione» |
| 15 | Copertura capped at 100% | Low | **Fixed**: show >100% and eccedenza hint |

---

## Remaining open items (operator)

1. Browser smoke test (`verification.md` checklist)
2. Manual a11y pass on Situazione `<details>` (AC-US001-02/03)
3. If >5 exercises with debit: consider «+ N altri in Situazione» (future)

---

## Deliberation trail pointer

Amended output: `plan-and-verification-after-devils-review.md`

Original preserved: `plan-and-verification.md`
