# Decision — Redesign UX/UI Gestione Spese Condominiali

**Session:** `Sessions/redesign-layout-ux-mobile-desktop/`  
**Date:** 2026-05-29  
**Pattern:** Plan / Execute / Verify

---

## Executive summary

Il council ha riorganizzato l'interfaccia da **7 viste piatte** a **4 aree principali** con sotto-navigazione, shell responsive desktop/mobile, selettore immobile in header e menu utente consolidato. Tutte le funzionalità esistenti (CRUD, import Intesa, backup JSON) sono preservate.

---

## Agreed proposal

### Information architecture

- **Panoramica** — dashboard KPI + scadenzario
- **Movimenti** — tab: Dovuti · Versamenti · Import banca · Situazione
- **Dati** — tab: Backup · Registro
- **Impostazioni** — tab: Immobile · Account

### Shell UX

- Desktop: nav rail 240px
- Mobile: bottom nav + FAB quick-add + drawer immobili
- Menu utente: Account, Tema, Esci
- Alias legacy (`dashboard`, `annualita`, …) via `resolveView()`

---

## User stories delivered

| ID | Delivered |
|----|-----------|
| US-001 | 4 voci menu |
| US-002 | Movimenti unificati |
| US-003 | Context switcher immobile |
| US-004 | Menu utente |
| US-005 | Panoramica gerarchica |
| US-006 | Responsive layout |
| US-007 | Design tokens coerenti |
| US-008 | Empty state con CTA (post-DA) |
| US-009 | Navigazione contestuale |
| US-010 | A11y base (skip link, focus, 44px) |

---

## Architectural decisions

- **AD-001:** Router `setView(view, subview?)` in `render.js` — no framework
- **AD-002:** `viewMeta` + `VIEW_ALIASES` in `config.js` — backward compat
- **AD-003:** Form ID invariati — zero regressioni CRUD
- **AD-004:** Nessuna modifica Supabase/RLS

---

## Tests

- Static code review: PASS post-fix backup import
- T-019 smoke manuale: consigliato post-deploy con login Supabase

---

## Deliberation trail

1. **Plan (Round 1):** Requirements Planner + Task Architect → PROPOSE  
2. **HITL:** Operatore **procedi** — piano approvato  
3. **Execute:** T-001..T-018 implementati (`execution.md`)  
4. **Verify:** Quality Verifier OBJECT → fix critico backup import  
5. **Devil's Advocate:** Review completata → `devils-advocate-review.md`  
6. **Post-DA:** Fix applicati → `decision-after-devils-review.md`

---

## Recommendation

**Ship** dopo smoke test manuale su login, backup JSON e viewport mobile.

## Risks

| Risk | Mitigation |
|------|------------|
| Regressioni navigazione | Alias legacy + grep setView |
| Backup JSON | Import ripristinato e da ritestare |
| A11y tab keyboard | Backlog v1.1 |

## Next steps

1. Smoke test locale con account Supabase
2. Deploy Vercel
3. (Opzionale) v1.1: keyboard roving su tab, `aria-controls` completi
