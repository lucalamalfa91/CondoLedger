# Plan — Redesign UX/UI Gestione Spese Condominiali

**Session:** `Sessions/redesign-layout-ux-mobile-desktop/`  
**Pattern:** Plan / Execute / Verify  
**Status:** ✅ Approvato ed eseguito

---

## 1. Obiettivo

Rendere l'app più fruibile e invitante su **desktop e mobile**, rivedendo menu, gerarchia visiva e accorpamento funzionale — senza introdurre framework o modifiche backend.

**Riferimenti UX:** Linear (nav compatta), Notion (context switcher), Stripe Dashboard (tab secondarie, metriche), Apple HIG (44px touch, focus, sheet mobile).

---

## 2. Information Architecture (7 → 4 + menu utente)

| Voce primaria | View ID | Contenuto | Ex viste |
|---------------|---------|-----------|----------|
| **Panoramica** | `panoramica` | KPI, scadenzario, CTA + Dovuto / + Versamento | `dashboard` |
| **Movimenti** | `movimenti` | Tab: **Dovuti** · **Versamenti** · **Import banca** | `annualita`, `versamenti`, `importbanca` |
| **Banca & dati** | `banca` | Tab: **Import banca** *(opz. spostato)* · **Backup JSON** | `importbanca`*, `archivio` |
| **Impostazioni** | `impostazioni` | Tab: **Casa** · **Account** | `immobile`, `account` |

\* **Decisione proposta:** Import Intesa resta tab dentro **Movimenti** (flusso contabile); **Banca & dati** contiene solo backup/export/import JSON. Voce menu rinominata **"Dati"** con sottotitolo "Backup e archivio".

| Elemento | Posizione |
|----------|-----------|
| Selettore immobile + Nuova casa | Header (dropdown / drawer mobile) |
| Account, Tema, Esci | Menu utente (chip header) |

---

## 3. Layout shell

### Desktop (≥861px)
- Nav rail sinistra **240px** (4 voci con icona + label)
- Header: titolo sezione · **casa ▾** · menu utente · tema (opz. solo in menu utente)
- Main scrollabile, max-width contenuto opzionale

### Mobile (≤860px)
- **Bottom tab bar** (4 icone + label)
- Header compatto + hamburger **solo per immobili**
- **FAB "+"** sticky: sheet "Nuovo dovuto" / "Nuovo versamento"
- Drawer immobili si chiude dopo selezione

---

## 4. User stories

| ID | Story | Priorità |
|----|-------|----------|
| US-001 | 4 voci menu primarie invece di 7 | Must |
| US-002 | Area Movimenti unificata con tab Dovuti / Versamenti / Import | Must |
| US-003 | Context switcher immobile in header | Must |
| US-004 | Menu utente: Account, Tema, Esci | Must |
| US-005 | Panoramica con gerarchia visiva e CTA above-the-fold | Should |
| US-006 | Layout responsive desktop / tablet / mobile | Must |
| US-007 | Design system coerente (token, focus, card) | Should |
| US-008 | Empty state con CTA chiare | Should |
| US-009 | Azioni rapide (+ Dovuto, Modifica riga) navigano al tab corretto | Must |
| US-010 | Accessibilità: focus, ARIA tab, 44px touch | Must |

### Acceptance criteria (estratto)

- **AC-US001-01:** Sidebar/bottom nav mostra esattamente Panoramica, Movimenti, Impostazioni, Dati — no Account/Import separati.
- **AC-US002-02..04:** Parità funzionale CRUD dovuti, versamenti, import Intesa nei tab Movimenti.
- **AC-US003-02:** Cambio immobile aggiorna KPI e tabelle come oggi.
- **AC-US006-01:** Mobile usa bottom nav; drawer immobili non obbligatorio per navigare viste.
- **AC-US009-01/02:** "+ Dovuto" → Movimenti/tab Dovuti; "+ Versamento" → Movimenti/tab Versamenti.
- **AC-US010-02:** Hit area nav/tab/btn primari ≥ 44×44px.

*(Criteri completi in round-1 requirements output.)*

---

## 5. Task breakdown

| ID | Title | Files | Done when |
|----|-------|-------|-----------|
| T-001 | Contratto view/subview + viewMeta | `js/config.js` | 4 view + subview documentati; alias legacy |
| T-002 | Ristrutturare shell HTML | `index.html` | Nav rail + bottom nav + header casa |
| T-003 | Pannello Movimenti (tab) | `index.html` | Form/tabelle ID invariati |
| T-004 | Pannello Dati (backup) | `index.html` | Export/import JSON preservati |
| T-005 | Pannello Impostazioni (casa + account) | `index.html` | Form immobile e password intatti |
| T-006 | Panoramica (ex dashboard) | `index.html` | CTA aggiornati |
| T-007 | Design tokens + grid shell | `css/app.css` | Token nav, safe-area, z-index |
| T-008 | Stili nav rail desktop | `css/app.css` | Stati active/focus |
| T-009 | Bottom nav mobile | `css/app.css` | Padding main, 4 item |
| T-010 | Sub-tab / segment control | `css/app.css`, `index.html` | Tab responsive |
| T-011 | FAB quick-add + sheet | `index.html`, `css/app.css`, `js/main.js` | Naviga a form corretto |
| T-012 | `setView(view, subview?)` | `js/render.js`, `js/config.js` | Router panel + sub-panel |
| T-013 | `collectDom()` aggiornato | `js/render.js` | Nuovi ref nav/FAB |
| T-014 | Rewire navigazione | `js/main.js`, `js/auth.js` | Tutti setView migrati |
| T-015 | House switcher header | `render.js`, `css/app.css` | Lista case + nuova casa |
| T-016 | Responsive tabelle/card | `css/app.css` | No overflow body mobile |
| T-017 | Accessibilità | HTML/CSS/JS | Skip link, ARIA tab, focus |
| T-018 | Pulizia legacy | `index.html`, `css/app.css` | 7 voci obsolete rimosse |
| T-019 | Smoke test manuale | checklist | Login, CRUD, import, backup, 390px + 1280px |

**Ordine:** T-001 → T-002 → T-003..T-006 → T-007 → T-008..T-011 → T-012..T-015 → T-016..T-018 → T-019

---

## 6. Rischi e mitigazioni

| Rischio | Mitigazione |
|---------|-------------|
| Regressioni `setView` hardcoded | Grep + alias legacy temporanei |
| Form non agganciati | Non rinominare ID form; smoke T-019 |
| Nav doppia desincronizzata | Un solo toggle in `setView` |
| Over-scope grafico | Token incrementali; no nuove librerie |

---

## 7. Out of scope

- Nuove feature dominio, PDF, grafici, multi-condomino
- Modifiche Supabase / RLS
- React/Vue/bundler
- Routing URL hash (sessione futura)
- User research / A/B test

---

## 8. Open questions (default proposti se operatore approva senza note)

| # | Domanda | Default proposto |
|---|---------|------------------|
| 1 | Bottom nav vs drawer? | **Bottom nav** su mobile |
| 2 | Nome voce backup | **"Dati"** — sottotitolo "Backup e archivio" |
| 3 | Tab default Movimenti | **Contestuale** da CTA; altrimenti ultimo tab in `sessionStorage` |
| 4 | Posizione switcher casa | **Header**, a sinistra del titolo |
| 5 | Login/recovery redesign | **Allineamento token minimo** (stessi colori/radius) |
| 6 | Dashboard densità | Mantieni 4 KPI + doppio pannello; migliora spacing |

---

## 9. Verifica (fase Verify — post Execute)

- Checklist T-019 + confronto AC-US001..US-010
- Viewport 390×844 e 1280×800
- Network: chiamate Supabase invariati
- Devil's Advocate review (default: sì)

---

## 10. Approvazione richiesta

**Operatore:** rispondi con una delle opzioni:

- **`approve`** — procedi con Execute (Full-Stack Implementer)
- **`revise: …`** — indica modifiche al piano
- **`stop`** — interrompi il council
