# Execution — Redesign UX/UI layout

**Session:** `Sessions/redesign-layout-ux-mobile-desktop/`  
**Status:** Execute completato  
**Data:** 2026-05-28

## Piano approvato

Operatore: **procedi** (approve implicito)

## Modifiche implementate

### Information architecture (7 → 4 voci)

| Voce | View ID | Contenuto |
|------|---------|-----------|
| Panoramica | `panoramica` | KPI, scadenzario, CTA rapide |
| Movimenti | `movimenti` | Tab: Dovuti · Versamenti · Import banca · Situazione |
| Dati | `dati` | Tab: Backup · Registro movimenti |
| Impostazioni | `impostazioni` | Tab: Immobile · Account |

### Shell UI

- **Desktop:** nav rail 240px + header con selettore immobile + menu utente
- **Mobile:** bottom navigation (4 icone) + FAB "+" + drawer immobili
- **Menu utente:** Account, Tema, Esci (logout rimosso dalla sidebar)
- **Alias legacy:** `dashboard`, `annualita`, `versamenti`, ecc. → nuove view via `resolveView()`

### File toccati

| File | Modifiche |
|------|-----------|
| `index.html` | Nuova shell, pannelli accorpati, skip link, FAB, drawer |
| `css/app.css` | Token layout, nav rail, bottom nav, sub-nav, sheet, drawer, responsive |
| `js/config.js` | `viewMeta`, `resolveView`, `viewHeading`, alias |
| `js/state.js` | `currentSubview`, default `panoramica` |
| `js/render.js` | `setView(view, subview)`, house switcher, overlay |
| `js/main.js` | `navigate()`, wiring nav/FAB/menu/drawer |
| `js/auth.js` | Redirect post-login/recovery a nuove view |

### Task completati

T-001 … T-018 del piano. T-019 (smoke test manuale) da eseguire con login Supabase.

## Non modificato

- Logica API Supabase, fiscal, import Intesa, backup
- ID form (`dueForm`, `paymentForm`, …) invariati
- Schema database

## Note verifica

Test consigliati post-deploy:

1. Login → Panoramica con metriche
2. + Dovuto / + Versamento → tab corretto in Movimenti
3. Modifica/elimina riga dovuto e versamento
4. Import Excel → tab Import banca
5. Export/import JSON → tab Backup
6. Menu utente → Account, Tema, Esci
7. Viewport 390px: bottom nav + FAB + drawer immobili
