# Report — Verifica finale UX/UI e prodotto

**App:** Gestione Spese Condominiali  
**Sessione:** `verifica-finale-ux-prodotto`  
**Data:** 2026-05-31  
**Metodo:** audit codice + CSS responsive + DevTools mobile (login); confronto `design_bundle`  
**Verdetto release:** **NO** — utilizzabile su desktop con attrito; **non pronta per uso mobile quotidiano**

---

## A. Executive summary

### Stato del prodotto

L’app copre bene il dominio (multi-immobile, esercizi fiscali, dovuti/versamenti, import AI documento, Intesa, situazione/PDF) ma presenta ancora un **modello UI da back-office desktop** traslato su mobile, non un prodotto **mobile-first**. Il redesign precedente (`redesign-layout-ux-mobile-desktop`) ha aggiunto bottom nav, FAB e alcuni fix tattici; **non ha risolto** i blocker strutturali: tabelle a 576px minimi, form sempre sopra i dati, import documento nascosto, feedback modale massiccio, sovraccarico in Panoramica.

### Top 5 blocker

1. **Tabelle obbligatorie con scroll orizzontale** su ogni schermata operativa (`min-width: 36rem`) — MOB-001.
2. **Tab “Import banca”** che nasconde l’import preventivo/consuntivo AI — UX-005 / FLOW-003.
3. **Split layout mobile**: form lungo **prima** dell’elenco dati — impossibile consultare/modificare righe senza scroll infinito — MOB-003.
4. **~30 `alert()` nativi** al posto di feedback inline — blocca flusso, non accessibile — UX-008.
5. **Onboarding assente** dopo login — utente non sa il primo passo — FLOW-001.

### Conteggio issue

| Priorità | N. |
|----------|-----|
| Critical | 8 |
| High | 14 |
| Medium | 11 |
| Low | 5 |

### Persona più penalizzata

**P1 — proprietario mobile-first**: consulta saldo e registra versamenti dal telefono; oggi deve scrollare tabelle illeggibili, scoprire feature per caso, tollerare redirect post-salvataggio.

### Quick win (1–2 giorni)

- Rinominare/split tab Import (UX-005).
- Card list mobile per `#duesTable` / `#paymentsTable` (MOB-002).
- Toast al posto di metà `alert` su successo (UX-008).
- Restare in subview dopo save dovuto/versamento (FLOW-004).

---

## B. Problemi UX/UI

| ID | Severità | Dove | Perché | Impatto | Soluzione |
|----|----------|------|--------|---------|-----------|
| UX-001 | High | Panoramica — `#metrics`, `#annualTableWrap`, `#dashboardPayments` | Tre blocchi ripetono concetti (KPI, tabella 6 col, versamenti) | Utente non capisce “quanto devo” in 5 secondi | Una card hero: saldo esercizio corrente + prossima scadenza; resto in “Dettaglio” |
| UX-002 | High | Header — `#viewTitle` + `#currentHouseTitle` + `#houseSelect` | Tre indicatori di contesto | Disorientamento su quale casa/pagina | Chip immobile unico (tap → drawer); titolo pagina solo in main |
| UX-003 | Medium | Dovuti — `#duePeriodLabel` testo vs Versamenti `#paymentPeriod` select | Stesso concetto, input diversi | Errori formato esercizio, dati inconsistenti | Select esercizi come versamenti; hint dinamico da `fiscal.js` |
| UX-004 | High | Movimenti → Dovuti — `#dueSplitFields` sempre visibile | Ripartizione custom è avanzata | Sovraccarico cognitivo su preventivo semplice | Mostrare split solo se preventivo; default mensile |
| UX-005 | **Critical** | Sub-nav — tab label “Import banca” (`index.html` L152) | Feature AI sopra, label fuorviante | Utenti non trovano import documento | Tab “Import” + sotto-tab “Documento” / “Banca Intesa” |
| UX-006 | Medium | Dati → Registro `#movements` | Duplica dovuti+versamenti già in Movimenti | “Dove sono i dati veri?” | Spostare in Impostazioni → Avanzate o rimuovere |
| UX-007 | Medium | Login — solo “Accesso riservato” | Nessun recupero password visibile in UI principale | Utenti bloccati | Link “Password dimenticata?” prominente |
| UX-008 | **Critical** | Globale — `js/main.js` (~30 alert) | Pattern anni ’90 | Blocco UI, no undo, screen reader pessimo | Toast + inline errors; `confirm` solo azioni distruttive |
| UX-009 | High | Import documento — anteprima tabellare | Selezione riga anagrafica in griglia wide | Errori HITL, abbandono | Step dedicato: lista card nominativi, tap per selezionare |
| UX-010 | Medium | Terminologia — preventivo/consuntivo/carry/rata | Lessico amministratore | P2 abbandona | Glossario tooltip + copy semplificata (“Quanto paghi a rate” / “Spesa reale anno”) |
| UX-011 | Low | `#demoBtn` hidden | Demo disabilitata senza alternativa | Tester/dev senza seed | Seed read-only o ambiente demo documentato |
| UX-012 | Medium | Success import — `alert('Import documento completato...')` | Nessun link all’azione successiva | Utente non registra versamento | Banner “Registra versamento” → sheet precompilato |

---

## C. Problemi mobile

| ID | Severità | Viewport | Dove | Problema | Fix consigliato |
|----|----------|----------|------|----------|-----------------|
| MOB-001 | **Critical** | ≤860px | `css/app.css` L90 — tutte `.data-table-wrap` | `table { min-width: 36rem }` forza scroll orizzontale | `@media (max-width: 860px)`: nascondere `<table>`, render card per riga in `render.js` |
| MOB-002 | **Critical** | 375–390px | `#duesTable`, `#paymentsTable`, `#annualTableWrap`, import preview | 5–8 colonne non leggibili | Card: titolo, importo, badge stato, swipe Modifica/Elimina |
| MOB-003 | **Critical** | ≤860px | Split layout Dovuti/Versamenti/Import | `grid-template-columns: 1fr` mette **form sopra** tabella | Invertire ordine DOM o `order: 2` su form; lista prima, FAB “Aggiungi” apre sheet form |
| MOB-004 | High | 390px | Header `#houseSelect` `width: min(160px, 36vw)` | Nomi immobile troncati | Chip full-width sotto titolo o drawer `.house-drawer` (CSS già definito L69, **non usato in HTML**) |
| MOB-005 | High | Mobile | Sub-nav 4 tab `.sub-nav` nowrap scroll | “Situazione” e “Import” fuori viewport iniziale | Ridurre a 3 tab visibili + menu “Altro”; o promuovere Situazione a bottom nav |
| MOB-006 | High | Mobile | `#quickAddFab` + hero `+ Dovuto/+ Versamento` | Doppia entry stessa azione | Solo FAB su mobile; nascondere hero toolbar sotto 860px |
| MOB-007 | Medium | Mobile | `body.authenticated { overflow: hidden }` | Scroll solo in `.main`; tastiera può coprire input | `visualViewport` resize padding; scroll-into-view su focus |
| MOB-008 | High | Mobile | `.row-actions .btn` padding `.35rem` | Touch target &lt; 44px | `min-height: 44px; min-width: 44px` su azioni riga |
| MOB-009 | **Critical** | Mobile | Import subview — documento + Intesa impilati | Scroll &gt; 3 schermate per arrivare a Excel | Separare in subview; documento come entry da Home |
| MOB-010 | High | Mobile | Situazione `#situazioneToolbar` | Select + PDF in riga stretta | Stack verticale; PDF full-width secondario |
| MOB-011 | Medium | Mobile | Panoramica `#annualTableWrap` + `#annualCards` | Duplicazione desktop+mobile | Solo `#annualCards` sotto 860px; nascondere tabella |
| MOB-012 | High | Mobile | Impostazioni `house-manage-layout` | Lista case + form lungo in colonna | Lista card → tap apre sheet modifica |
| MOB-013 | Medium | Mobile | Dialog `#documentImportDupDialog` | Native dialog ok ma bottoni stack stretti | `form-actions` column + safe-area |
| MOB-014 | High | Mobile | Bottom nav 72px + FAB 56px + padding main | Ultima riga tabella sotto FAB | `padding-bottom` main += 56px quando FAB visible |

### Proposta mobile-first (sintesi)

**Bottom nav (4):**

| Tab | Contenuto |
|-----|-----------|
| **Home** | Saldo, prossima rata, CTA Importa documento, 3 ultimi versamenti |
| **Registra** | Sheet: Versamento \| Dovuto \| Importa PDF \| Import banca |
| **Situazione** | Selector esercizio + rate a card + PDF |
| **Profilo** | Immobili, account, backup (secondario) |

**Pattern:** lista → dettaglio → azione; form mai affiancato a tabella su &lt;768px.

---

## D. Processi / flussi da riprogettare

### FLOW-001 — Onboarding (Critical)

| | |
|---|---|
| **Attuale** | Login → Panoramica empty → utente cerca `#headerAddHouseBtn` o Impostazioni |
| **Perché male** | Nessun percorso guidato; `alert('Crea prima una casa.')` su azioni |
| **Target** | 1) Nome immobile 2) Mese inizio esercizio (default Giugno) 3) “Importa preventivo o aggiungi dovuto” 4) Panoramica con checklist completata |

### FLOW-002 — Primo dovuto / preventivo (High)

| | |
|---|---|
| **Attuale** | Scoperta tab Dovuti → form 8+ campi → save → redirect Panoramica |
| **Perché male** | Esercizio testo libero; split esposto; perde contesto lista |
| **Target** | CTA “Importa PDF” in parallelo; se manuale: 3 campi (esercizio, tipo, importo) → espansione opzionale rate |

### FLOW-003 — Import documento amministratore (Critical)

| | |
|---|---|
| **Attuale** | Movimenti → scroll tab “Import banca” → carica file → anteprima tabella → conferma |
| **Perché male** | Discoverability zero; prerequisito casa Supabase con errore tardivo; anteprima illeggibile su mobile |
| **Target** | Home → “Importa preventivo/consuntivo” → (file) → (scegli la tua riga) → (rivedi totali) → conferma → CTA versamento |

### FLOW-004 — Registrazione versamento (High)

| | |
|---|---|
| **Attuale** | Form completo + carry sempre visibile → save → Panoramica |
| **Perché male** | Campi avanzati intimidiscono; redirect interrompe serie di inserimenti |
| **Target** | Default: esercizio corrente, rata suggerita, importo = saldo rata; carry solo se consuntivo aperto; restare in Versamenti + toast |

### FLOW-005 — Consultazione saldo (High)

| | |
|---|---|
| **Attuale** | Panoramica (4 metriche + tabella + scadenzario + versamenti) OR Situazione |
| **Perché male** | Tre posti con numeri simili; nessuna “verità” unica |
| **Target** | Home = saldo + prossima scadenza; Situazione = drill-down; eliminare tabella annualità su mobile |

### FLOW-006 — Import Intesa + riconciliazione (High)

| | |
|---|---|
| **Attuale** | Stesso subview del documento; split form Excel + 2 tabelle; associazione manuale in tabella |
| **Perché male** | Scroll infinito; checkbox in tabella mobile; messaggio successo generico |
| **Target** | Flusso dedicato: carica → lista movimenti card con toggle → conferma → “N non associati” con wizard match |

### FLOW-007 — Gestione immobili (Medium)

| | |
|---|---|
| **Attuale** | Select header 160px + Impostazioni lista/form |
| **Perché male** | Doppia UI; select illeggibile |
| **Target** | Drawer immobili (implementare markup `.house-drawer`); gestione completa solo da drawer |

### FLOW-008 — Backup JSON (Low)

| | |
|---|---|
| **Attuale** | Tab Dati allo stesso livello di uso quotidiano |
| **Target** | Impostazioni → Avanzate → Backup/restore con warning chiaro |

---

## E. Opportunità di miglioramento

| ID | Opportunità | JTBD | Sforzo |
|----|-------------|------|--------|
| P-01 | Wizard onboarding post-login | JTBD-07 | M |
| P-02 | Pre-match riga import su nome casa/note | JTBD-01 | S |
| P-03 | Esercizio select unificato dovuti/versamenti | JTBD-02 | S |
| P-04 | Versamento smart (importo/data/rata default) | JTBD-02 | M |
| P-05 | Post-import CTA “Registra versamento” | JTBD-01,04 | S |
| P-06 | Toast + banner non-blocking (no alert) | Tutti | M |
| P-07 | Ricorda ultimo filtro `#periodFilter` per casa | JTBD-06 | S |
| P-08 | Progressive disclosure carry/split custom | JTBD-02 | S |
| P-09 | Empty state checklist (“1. Casa 2. Import…” ) | JTBD-07 | S |
| P-10 | Match automatico Intesa importo+data → rata | JTBD-03 | L |

---

## F. Future feature roadmap

| Nome | Problema | Valore utente | Priorità | Complessità |
|------|----------|---------------|----------|-------------|
| Dashboard “Sei in regola” | Troppi numeri, poco chiaro | Capire stato in 1 glance | Alta | Media |
| Notifiche scadenze rate | Dimenticanza pagamenti | Pagare in tempo | Alta | Media |
| Template estrazione per amministratore | PDF eterogenei, errori AI | Meno correzioni manuali | Alta | Alta |
| Riconciliazione banca semi-automatica | Associazione manuale lunga | Meno lavoro post-estratto | Alta | Media |
| Onboarding guidato in-app | Abbandono primo utilizzo | Attivazione utenti | Alta | Bassa |
| Archivio documenti amministratore | PDF persi in email | Storico per esercizio | Media | Media |
| Multi-banca (non solo Intesa) | Lock-in formato Excel | Più utenti | Media | Alta |
| Accesso familiare read-only | Co-gestione coniuge | Condivisione senza rischio edit | Media | Alta |
| Export per commercialista | Dichiarazione/verifica | Valore annuale | Media | Media |
| Widget “prossima rata” (PWA) | Apertura app per una info | Consultazione rapida | Bassa | Media |
| Registrazione self-service | Solo utenti invitati oggi | Crescita prodotto | Bassa | Media (auth) |

---

## G. Action plan

### Subito (pre-release) — Critical + mobile blocker

| Azione | Issue |
|--------|-------|
| Card list mobile al posto delle tabelle principali | MOB-001, MOB-002 |
| Ristrutturare tab Import (documento / banca) | UX-005, MOB-009, FLOW-003 |
| Invertire ordine lista/form su mobile; form in sheet | MOB-003 |
| Implementare drawer immobile o chip leggibile | MOB-004, FLOW-007 |
| Sostituire alert successo/errori frequenti con toast | UX-008 |
| Wizard onboarding 3 step | FLOW-001, P-01 |
| Touch target azioni riga ≥44px | MOB-008 |
| Rimuovere redirect Panoramica post-save | FLOW-004 |

### Breve termine (1–2 sprint)

| Azione | Issue |
|--------|-------|
| Snellire Panoramica → Home task-first | UX-001, FLOW-005, MOB-011 |
| Stepper import documento (file → riga → conferma) | UX-009, FLOW-003 |
| Unificare input esercizio dovuti | UX-003 |
| Progressive disclosure split/carry | UX-004, P-08 |
| Separare Situazione in bottom nav mobile | MOB-005, P-05 |
| Nascondere hero CTA duplicati (solo FAB) | MOB-006 |
| Post-import CTA versamento | UX-012, P-05 |
| Spostare Backup in Avanzate | FLOW-008, UX-006 |

### Fase successiva

| Azione | Issue |
|--------|-------|
| Refactor `render()` per view parziali (no full re-render) | TD-01 |
| URL hash per view/subview | TD-06 |
| Tab keyboard roving (defer v1.1) | sessione redesign |
| Feature: notifiche scadenze, template AI | §F |
| Match automatico Intesa | P-10 |

---

## Matrice copertura operator-input

| Area operatore | Sezione report | Copertura |
|----------------|----------------|-----------|
| 1 UX/UI completa | B | ✓ |
| 2 Mobile approfondita | C | ✓ (14 issue MOB) |
| 3 Processi/flussi | D | ✓ (8 flussi) |
| 4 Miglioramento processo prodotto | E | ✓ |
| 5 Future feature | F | ✓ (11 feature) |
| 6 Prioritizzazione | A, G | ✓ |

---

## Deliberation trail

| Fase | Esito |
|------|-------|
| Plan | `plan.md` — Requirements Planner + Task Architect PROPOSE |
| Execute | `execution.md` — analisi codice + DevTools (login mobile) |
| Verify | Pending operatore / Quality Verifier |
| Devil's Advocate | Pending checkpoint operatore |

**Nota metodologica:** test runtime su schermate autenticate limitato (mancanza credenziali in sessione audit). Finding mobile basati su CSS vincolante (`min-width: 36rem`), struttura DOM e sessione redesign precedente; **conferma manuale post-login consigliata** su Safari iOS.
