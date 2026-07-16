# Revisione UX/UI page-by-page — CondoLedger (Gestione Spese Condominiali)

**Sessione:** `revisione-ux-ui-app` · **Data:** 2026-07-15 · **Metodo:** 9 agenti di revisione (uno per cluster di pagine) → 1 agente di sintesi product owner → 1 passata Devil's Advocate → questo documento (emendato)

> Nota: questo è un report di sola analisi. Nessuna modifica al codice è stata effettuata in questa sessione.

---

## A. Executive summary

CondoLedger ha fatto progressi reali dall'ultima verifica UX (31/05/2026): gli `alert()`/`confirm()` nativi sono spariti ovunque (sostituiti da toast e `confirmDialog` custom), le tabelle di Dovuti/Versamenti/Saldi precedenti/Panoramica si convertono correttamente in card su mobile, l'import documento è raggiungibile in 1-2 tap, l'onboarding guidato esiste, e il drawer immobili è stato implementato. Ma questa revisione mostra che diversi fix non hanno chiuso i problemi originali quanto sembrava: la soluzione "tabelle → card su mobile" è stata applicata solo a 4 schermate su 7 che ne avrebbero bisogno (mancano Situazione, Registro movimenti Avanzate, tabella di selezione riga in Import documento), e in un caso ha spostato il problema senza risolverlo concettualmente (il Registro movimenti "di sola consultazione" in Avanzate permette in realtà modifica/eliminazione, riproponendo esattamente il dubbio "dove sono i dati veri?" che avrebbe dovuto chiudere). A questo si aggiungono **5 bug Critical** con impatto finanziario o di credibilità concreto, un pattern strutturale CSS (breakpoint 861-1100px disallineati) che riporta "il form sopra la lista" su tre schermate ad alto uso, e un gap di terminologia tecnica mai chiuso e ripetuto in 5 punti diversi dell'app. Il prodotto è quindi in una fase di consolidamento più che di prima bonifica: il grosso del debito UX è ormai in dettagli specifici, ripetizioni di uno stesso gap, e alcune decisioni di prodotto rimaste sospese — non in problemi strutturali nuovi.

**Come leggere le priorità sotto:** la calibrazione "schermate più usate quotidianamente" (Versamenti, Dovuti) è un'**assunzione di prodotto dichiarata**, non un dato misurato — il codice non contiene alcuna telemetria/analytics (verificato via grep, nessun risultato per librerie di tracking). Va confermata con il product owner prima di usarla per decisioni di roadmap più ampie.

## Confronto con l'ultima verifica UX (31/05/2026)

Sui **107 finding** con stato tracciato nei 9 cluster (100 righe con stato esplicito nelle tabelle + ~7 conferme narrative nei testi introduttivi dei cluster): **70 NUOVO**, **19 PARZIALMENTE RISOLTO**, **7 IRRISOLTO** (+1 citato narrativamente, MOB-012), **~10-11 RISOLTO** (4 righe esplicite — SET-008, SET-103, SHELL-016, SHELL-017 — più conferme narrative: UX-008 alert nativi, MOB-001/002 tabelle-a-card sulle 4 schermate coperte, MOB-008 touch target, UX-012 CTA post-import, FLOW-004 permanenza in subview, UX-005/MOB-009/FLOW-003 visibilità import documento), e **0 tag REGREDITO espliciti**.

La lettura: la maggioranza dei problemi rilevati oggi è nuova (spesso nei dettagli di flussi già "sistemati" a grandi linee), non un ritorno di vecchi bug. Tuttavia diversi "PARZIALMENTE RISOLTO" nascondono una regressione sostanziale non taggata come tale: ADV-002 (registro "auditoria" reso modificabile), AUTH-009/AUTH-011 (bug introdotti dalla *nuova* modale di onboarding), LEDGER-004/007/015 (il fix mobile ha spostato il problema di breakpoint da ≤860px in su, senza eliminarlo tra 861-1100px). Il gap più insistente resta IRRISOLTO da tempo: la terminologia tecnica (preventivo/consuntivo/rata/riporto/esercizio fiscale, rif. UX-010), ripetuta identica in 5 punti diversi dell'app.

---

## B. Top priorità (emendata dopo revisione Devil's Advocate)

La Top 10 originale della sintesi escludeva 2 dei 5 bug Critical rilevati (AUTH-001, SIT-001) senza un criterio esplicito visibile, e non riportava la severità originale in tabella. Qui sotto la versione corretta con colonna Severità e i 5 Critical tutti visibili.

| Rango | Titolo | ID | Severità originale | Perché ora | Sforzo |
|---|---|---|---|---|---|
| 1 | Messaggio d'errore hardcoded con nome di una casa specifica ("Condominio Anziani") mostrato a tutti | LEDGER-012 | Critical | Mina la credibilità del prodotto proprio quando l'utente ha già un problema; fix a riga singola | S |
| 2 | Select associazione movimento banca senza opzione vuota/default: può assegnare silenziosamente il movimento all'esercizio sbagliato | BANKIMP-001 | Critical | Corrompe la riconciliazione contabile senza alcun segnale d'errore visibile; il guard esistente non scatta mai in pratica (verificato nel codice) | S |
| 3 | Registro movimenti (Avanzate) completamente invisibile su mobile, nessun fallback né messaggio | ADV-001 | Critical | L'utente non vede nulla, non un errore, non uno stato vuoto — solo un vuoto silenzioso; una verifica precedente dichiarava il fix generale completo senza intercettare questo gap | M |
| 4 | 7 sezioni di dettaglio di Situazione non convertite in card su mobile (scroll orizzontale forzato in un accordion) | SIT-001 | Critical | Stesso bug strutturale di ADV-001 (tabelle non estese al pattern `dataListHtml`), su una schermata consultata a fine esercizio con dati densi — merita pari priorità, non "breve termine" | M |
| 5 | Nessun flusso self-service di recupero password (link + `resetPasswordForEmail` mai invocato) | AUTH-001 | Critical | Un utente che dimentica la password resta bloccato fuori dall'app senza alcuna azione possibile; è l'unico Critical dei 5 con sforzo L, per questo va pianificato ma non può slittare a tempo indeterminato | L |
| 6 | Form/pannello resta sopra la lista tra 861-1100px su Dovuti, Versamenti, Saldi precedenti | LEDGER-004, LEDGER-007, LEDGER-015 | High (×3) | Un solo problema CSS (media query disallineate: `max-width:1100px` a riga 353 vs `max-width:860px` a riga 366 di `css/app.css`, confermato nel codice) che penalizza le 3 schermate più usate su tablet/laptop ridimensionati; un fix unico risolve 3 finding | S |
| 7 | Vicolo cieco per nuovi utenti che vogliono creare la prima casa da Impostazioni (perdita dati silenziosa) | SET-001 | High | Colpisce il primissimo utilizzo reale del prodotto per chi salta l'onboarding | S |
| 8 | Onboarding che si riapre "fantasma" (ESC) o perde dati (Invio) senza passare dall'handler di chiusura | AUTH-009 (High), AUTH-011 (Medium, **da verificare su browser reali** — il report di cluster segnala esplicita incertezza empirica su questo secondo innesco) | High/Medium | Danneggia la primissima impressione del prodotto; AUTH-009 è confermato, AUTH-011 va prima verificato cross-browser prima di considerarlo un bug certo | S |
| 9 | Saldo anno precedente sovrascritto silenziosamente se si ripete il salvataggio per lo stesso esercizio | LEDGER-013 | High | Rischio concreto di alterare dati finanziari già registrati senza alcuna conferma | S |
| 10 | Nessuno stato "errore di caricamento" distinto dallo stato vuoto in Panoramica | DASH-006 | High | Concettualmente gemello di LEDGER-012/BANKIMP-001: un fallimento temporaneo di rete/RLS produce lo stesso empty state di "nessun dato", inducendo l'utente a credere di aver perso l'immobile — non compariva nella sintesi originale, aggiunto qui perché il cluster DASH era sotto-rappresentato nel piano d'azione rispetto agli altri | M |

Voci aggiuntive di rilievo non in Top 10 ma da tenere presenti: LEDGER-014 (controllo incrociato Saldo precedente/Riporto, già pianificato in passato e mai eseguito), BANKIMP-005 (ordine CTA/tabella invertito nell'import banca), SHELL-013 (contrasto testo sotto soglia WCAG AA, sistemico).

---

## C. Pattern trasversali deduplicati

- **Form/pannello sopra la lista tra 861-1100px**: LEDGER-004, LEDGER-007, LEDGER-015 sono lo stesso bug CSS (media query disallineate), non tre problemi indipendenti — un solo fix su `css/app.css` risolve Dovuti, Versamenti e Saldi precedenti insieme.
- **Tabelle non convertite in card su mobile**: SIT-001 (7 sezioni di Situazione), ADV-001 (Registro movimenti), DOCIMP-002 (tabella selezione riga import, percorso manuale/fallback) sono la stessa lacuna di copertura del pattern `dataListHtml()`/`js/mobile-cards.js`, già usato correttamente per Dovuti/Versamenti/Panoramica/Saldi precedenti ma mai esteso a queste tre superfici.
- **Errori di validazione solo via toast, non vicino al campo**: LEDGER-005 (Dovuti) e LEDGER-010 (Versamenti) sono lo stesso pattern mancante; imparentato a DASH-006 (toast come unico segnale di un errore di caricamento) e ADV-006 (toast di errore con priorità `polite` invece di `assertive`) — il toast da solo non basta mai per un errore che l'utente deve agire.
- **Terminologia tecnica non spiegata** (preventivo/consuntivo/rata/riporto/esercizio fiscale, rif. UX-010): LEDGER-006, DOCIMP-004, SIT-005, SET-005, SET-007 — stessa lacuna di prodotto irrisolta da tempo, ripetuta in 5 punti diversi senza alcun glossario/tooltip mai implementato.
- **`<label>` che attiva `<input type="file">` nascosto, non raggiungibile da tastiera**: BANKIMP-009 e ADV-005 sono lo stesso bug di pattern replicato su due upload diversi.
- **Confusione su "dove sono i dati veri"**: ADV-002 (registro dichiarato "vista auditoria" ma pienamente editabile) è concettualmente la stessa incertezza di LEDGER-014 (due meccanismi paralleli per lo stesso concetto economico, senza un unico punto di verità comunicato).
- **Chiusura nativa del `<dialog>` di onboarding che bypassa l'handler di completamento**: AUTH-009 (ESC) e AUTH-011 (Invio) sono due inneschi diversi dello stesso bug di ciclo di vita — ma solo AUTH-009 è confermato con certezza, AUTH-011 richiede verifica cross-browser (vedi Top 10, riga 8).
- **Selezione/gestione della casa attiva su superfici multiple** — *dedup corretta rispetto alla sintesi originale*: SET-002 e SHELL-007 **non sono lo stesso identico problema**. SET-002 descrive **tre** superfici simultaneamente visibili su mobile (header select + drawer + lista Impostazioni→Immobili); SHELL-007 descrive solo **due** controlli (select + drawer) senza menzionare la terza superficie. Qualunque fix deve coprire tutte e tre le superfici descritte in SET-002, non fermarsi alla riduzione select/drawer di SHELL-007.
- **Accessibilità da tastiera/ARIA incoerente in modo trasversale**: SHELL-004 (focus-visible mancante su icon-btn/drawer/sheet-close), DOCIMP-003 (radio senza label), SET-003 (label dinamiche senza `for`/`id`), SET-004 (tab senza `aria-controls`), SHELL-008/SHELL-015 (dialog/menu senza ARIA completa) — sintomi di un'unica lacuna sistemica: il design system dichiara "focus visibile per tutti i controlli interattivi" ma l'implementazione non lo rispetta ovunque.

## D. Inconsistenze cross-page

- **Terminologia del segno del saldo**: "Eccedenza/In debito/Pareggio" (KPI) vs "Saldo positivo/Saldo negativo" (hero conformità) per lo stesso concetto nella stessa schermata Panoramica (DASH-002).
- **Naming CTA per la stessa destinazione**: "Rendiconto completo" vs "Vedi situazione" vs "Situazione" (nome reale della tab) — tre nomi per una sola destinazione (DASH-003).
- **Tre superfici per la selezione casa attiva**: header select, drawer, Impostazioni→Immobili (SET-002, vedi nota di dedup sopra).
- **Due pattern ARIA diversi per overlay bloccanti simili**: sheet quick-add (`role="dialog"`, senza `aria-modal`) vs drawer immobili (`<aside>`, senza `role="dialog"`) — stesso concetto funzionale, markup semantico incoerente (SHELL-006).
- **Versioni di schema JSON incoerenti nello stesso flusso di backup**: UI dice "v4", il nome file scaricato dice "v3", lo schema realmente prodotto è v5 (ADV-003).
- **Stato "audit/sola consultazione" dichiarato ma non rispettato**: Registro movimenti in Avanzate si autodefinisce "vista auditoria" ma espone Modifica/Elimina pienamente funzionanti con redirect a sorpresa (ADV-002).
- **Validazione nativa del browser non disattivata in modo uniforme**: `loginForm` ha `novalidate`, `recoveryForm` (schermata gemella) no — il messaggio custom di errore password corta diventa irraggiungibile su Recovery (AUTH-006).

## E. Backlog prioritizzato

### Subito (quick win, basso sforzo/alto impatto)
- LEDGER-012 — generalizzare il messaggio d'errore hardcoded
- BANKIMP-001 — aggiungere opzione vuota/default esplicito al select di associazione esercizio
- LEDGER-004, LEDGER-007, LEDGER-015 — allineare le media query 860px/1100px (fix unico)
- SET-001 — forzare `houseFormMode='new'` quando non esistono ancora case
- AUTH-009 — gestire `close`/`cancel` del dialog onboarding (AUTH-011 richiede prima verifica cross-browser, vedi sopra)
- LEDGER-013 — richiedere conferma esplicita su sovrascrittura saldo precedente esistente
- SHELL-013 — scurire il token `--color-text-muted` in tema chiaro
- BANKIMP-009, ADV-005 — rendere gli input file raggiungibili da tastiera
- LEDGER-001, LEDGER-002 — validare `splitCustom` prima del submit invece di ricadere silenziosamente su 12 rate
- DOCIMP-001 — non far sovrascrivere il messaggio di progresso multi-pagina dal render generico
- DASH-006 — distinguere uno stato "errore di caricamento" dallo stato vuoto in Panoramica *(aggiunto in emendamento — vedi Top 10 #10)*

### Breve termine
- ADV-001 e SIT-001 — estendere `dataListHtml()`/card-fallback a Registro movimenti e alle 7 sezioni di Situazione *(entrambi Critical, promossi da "breve termine" a pari priorità nella Top 10 emendata)*
- DOCIMP-002 — avvolgere la tabella di selezione riga import nel wrapper scrollabile standard
- BANKIMP-005 — riordinare CTA/tabella nell'import banca sotto i 1100px
- LEDGER-014 — implementare il controllo incrociato Saldo precedente/Riporto già pianificato e mai eseguito
- LEDGER-005, LEDGER-010 — errori di validazione inline accanto al campo, non solo via toast
- ADV-002 — decidere e rendere coerente lo stato del Registro movimenti (o davvero sola-lettura, o rinominare la sezione)
- SET-002 — consolidare le **tre** superfici di selezione casa (header select, drawer, Impostazioni→Immobili) in un percorso coerente; SHELL-007 va risolto come parte dello stesso fix, non separatamente
- SHELL-004, SET-003, SET-004, DOCIMP-003 — chiudere il debito ARIA/focus trasversale
- BANKIMP-002 — riusare il badge/suggerimento di match anche nella coda "da associare manualmente"
- DASH-002, DASH-004 — allineare la terminologia del segno del saldo e aggiungere le classi colore mancanti per i toni warn/success

### Successivo
- **UX-010 (terminologia tecnica non spiegata)** — LEDGER-006, DOCIMP-004, SIT-005, SET-005, SET-007: richiede una decisione di prodotto unica (glossario/tooltip trasversale o copy semplificata) applicata in tutti e 5 i punti insieme
- AUTH-001 — flusso self-service di recupero password end-to-end *(Critical ma sforzo L: va pianificato esplicitamente, non lasciato implicito in fondo alla lista)*
- DOCIMP-011 — "Centro verifica" e storico import versionato (feature nuova, L)
- DASH-001 — decisione di prodotto su come fondere/ridurre la ridondanza hero vs KPI grid in Panoramica
- SHELL-005, SHELL-006 — uniformare i pattern di overlay (drawer/sheet) su `<dialog>` nativo con focus trap
- SHELL-014 — sostituire i 25 valori `rgba(0,0,0,.XX)` hardcoded con token theme-aware
- SET-006 — decisione di prodotto su mese di inizio esercizio libero vs 4 opzioni fisse
- ADV-007 — ripensare l'etichettatura di navigazione di primo livello per Backup/Registro
- DASH-005, DASH-007, DASH-008, DASH-009 — papercut minori di Panoramica non ancora schedulati altrove

## F. Metodologia e limiti

- **Copertura**: 9 cluster di revisione hanno coperto le 12 view logiche dell'app (Login, Recupero password, Onboarding → cluster AUTH; Panoramica → DASH; Dovuti/Versamenti/Saldi precedenti → LEDGER; Import documento → DOCIMP; Import banca → BANKIMP; Situazione → SIT; Immobili/Account → SET; Avanzate → ADV; navigazione/shell/overlay trasversali → SHELL), più gli overlay cross-cutting (house drawer, quick-add FAB, dialog di conferma, toast).
- **Metodo**: analisi statica del codice sorgente (HTML/CSS/JS), nessun test runtime autenticato su browser reali. Alcuni finding (es. AUTH-011, la tenuta dei breakpoint a 360px) sono esplicitamente marcati "da verificare su device/browser reali" e non vanno considerati confermati al 100% finché non testati a runtime.
- **Design bundle**: `design_bundle/gestione-spese-condominiali-design-system/` è stato usato solo come riferimento stilistico (colori, tipografia, tono di voce); la sua IA (voce top-level "Dati") è stata deliberatamente ignorata — l'`index.html` live resta autoritativo per struttura e flussi.
- **Assunzione dichiarata**: la calibrazione di priorità per "frequenza d'uso" (Versamenti/Dovuti quotidiani, Situazione a fine esercizio, ecc.) è un'ipotesi di prodotto ragionevole ma non misurata — l'app non ha alcuna telemetria. Da validare con il product owner prima di usarla per decisioni di roadmap irreversibili.
- **Passata Devil's Advocate**: ha verificato indipendentemente sul codice sorgente 3 claim tecnici della sintesi (tutti confermati testualmente) e sollevato 6 challenge, recepiti in questo documento: correzione del conteggio totale finding, esposizione esplicita dei 5 Critical in Top 10 (2 mancavano), qualificazione esplicita dell'assunzione di frequenza d'uso, aggiunta di DASH-006 al piano d'azione (cluster sotto-rappresentato), correzione della deduplicazione SET-002/SHELL-007, e ripristino dell'hedge di incertezza su AUTH-011.
- **Report di dettaglio per cluster** (tabelle complete con tutti i ~107 finding, posizione precisa nel codice, fix proposto, sforzo): `Sessions/revisione-ux-ui-app/agent-reports/{auth,dash,ledger,docimp,bankimp,sit,set,adv,shell}.md`. Sintesi originale pre-emendamento: `Sessions/revisione-ux-ui-app/synthesis.md`.
