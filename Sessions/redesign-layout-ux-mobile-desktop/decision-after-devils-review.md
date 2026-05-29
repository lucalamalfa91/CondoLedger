# Decision after Devil's Review — Redesign UX/UI

**Session:** `Sessions/redesign-layout-ux-mobile-desktop/`  
**Date:** 2026-05-29  
**Base document:** `decision.md` (non modificato)  
**Review:** `devils-advocate-review.md`

---

## Amendments applied

| Challenge | Action | Files |
|-----------|--------|-------|
| Backup JSON regression | Ripristinato import `exportBackup`, `parseBackup` | `js/main.js` |
| Empty state US-008 | CTA "+ Nuova casa" in panoramica vuota | `js/render.js` |
| Touch target US-010 | `min-height: 44px` su user chip | `css/app.css` |
| Escape overlay | Chiude sheet, drawer, menu utente | `js/main.js` |
| Duplicate DOM key | Rimosso `userChip` duplicato | `js/render.js` |
| Nav aria-label | Bottom nav → "Navigazione mobile" | `index.html` |

---

## Deferred to v1.1

- Tab keyboard roving (ArrowLeft/ArrowRight)
- `aria-controls` / `aria-hidden` su tab panels
- Smoke test T-019 documentato con esito reale post-login

---

## Updated recommendation

**Ship** dopo un rapido test manuale:

1. Login → Panoramica
2. Dati → Esporta JSON (verifica download)
3. Mobile: bottom nav + FAB + drawer immobili
4. Menu utente → Esci

Council session **chiusa** con consenso post-Devil's Advocate.
