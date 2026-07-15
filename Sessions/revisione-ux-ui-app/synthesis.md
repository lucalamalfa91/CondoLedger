# Sintesi product owner — Revisione UX/UI CondoLedger

## Executive summary
CondoLedger ha fatto progressi reali dall'ultima verifica: gli `alert()`/`confirm()` nativi sono spariti ovunque (sostituiti da toast e `confirmDialog` custom), le tabelle di Dovuti/Versamenti/Saldi precedenti/Panoramica si convertono correttamente in card su mobile, l'import documento è ora raggiungibile in 1-2 tap, l'onboarding guidato esiste, e il drawer immobili è stato implementato. Ma la revisione dei 9 cluster mostra che questi fix non hanno chiuso i problemi originali quanto sembrava: in diversi casi la soluzione è stata applicata solo a un sottoinsieme di schermate (le tabelle-a-card mancano ancora su Situazione, Registro movimenti Avanzate e nella tabella di selezione riga import documento) o ha spostato il problema senza risolverlo concettualmente (il Registro movimenti "di sola consultazione" in Avanzate permette in realtà modifica/eliminazione, replicando esattamente il dubbio "dove sono i dati veri?" che dovrebbe aver chiuso). A questo si aggiungono tre bug Critical con impatto finanziario o di credibilità molto concreto (messaggio d'errore con nome di casa hardcoded, associazione banca-esercizio senza default esplicito, registro movimenti invisibile su mobile) e un pattern strutturale CSS (breakpoint 861-1100px) che riporta "il form sopra la lista" esattamente sulle tre schermate a più alto uso quotidiano/mensile. Il prodotto è quindi in una fase di consolidamento più che di prima bonifica: il grosso del debito UX è ormai in dettagli specifici, ripetizioni di uno stesso gap (terminologia tecnica non spiegata, pattern ARIA/focus incoerenti) e alcune decisioni di prodotto rimaste sospese, non in problemi strutturali nuovi.

## Confronto con l'ultima verifica UX (31/05/2026)
Su circa 115 finding registrati nei 9 cluster: **~70 NUOVO**, **~19 PARZIALMENTE RISOLTO**, **~7 IRRISOLTO** (+1 citato narrativamente, MOB-012), **~10 RISOLTO** (4 righe esplicite — SET-008, SET-103, SHELL-016, SHELL-017 — più ~6 conferme narrative nei testi introduttivi dei cluster: UX-008 alert nativi, MOB-001/002 tabelle-a-card, MOB-008 touch target, UX-012 CTA post-import, FLOW-004 permanenza in subview, UX-005/MOB-009/FLOW-003 visibilità import documento) e **0 tag REGREDITO espliciti**. La lettura: la maggioranza assoluta dei problemi rilevati oggi è nuova (spesso nei dettagli di flussi già "sistemati" a grandi linee, es. Dovuti/Versamenti/Onboarding/Import), non un ritorno di vecchi bug. Tuttavia diversi "PARZIALMENTE RISOLTO" nascondono una regressione sostanziale non taggata come tale: ADV-002 (registro "auditoria" reso modificabile), AUTH-009/AUTH-011 (bug introdotti dalla *nuova* modale di onboarding), LEDGER-004/007/015 (il fix mobile ha semplicemente spostato il problema di breakpoint da ≤860px in su, senza eliminarlo tra 861-1100px). Il gap più insistente resta IRRISOLTO da tempo: la terminologia tecnica (preventivo/consuntivo/rata/riporto/esercizio fiscale), segnalata già come UX-010 e ripetuta identica in 5 punti diversi dell'app.

## Top 10 priorità
| Rango | Titolo | Cluster/ID di riferimento | Perché ora | Sforzo |
|---|---|---|---|---|
| 1 | Messaggio d'errore hardcoded con nome di una casa specifica ("Condominio Anziani") mostrato a tutti | LEDGER-012 | Bug Critical, su schermata (Saldi precedenti/Dovuti) usata regolarmente; mina la credibilità del prodotto proprio quando l'utente ha già un problema; fix a riga singola | S |
| 2 | Select associazione movimento banca senza opzione vuota/default: può assegnare silenziosamente il movimento all'esercizio sbagliato | BANKIMP-001 | Critical, corrompe la riconciliazione contabile senza alcun segnale d'errore visibile; il guard esistente non scatta mai in pratica | S |
| 3 | Form/pannello resta sopra la lista tra 861-1100px su Dovuti, Versamenti, Saldi precedenti | LEDGER-004, LEDGER-007, LEDGER-015 | Un solo problema CSS (media query disallineate) che penalizza le 3 schermate più usate quotidianamente/mensilmente su tablet/laptop ridimensionati; un fix unico risolve 3 finding contemporaneamente | S |
| 4 | Registro movimenti (Avanzate) completamente invisibile su mobile, nessun fallback né messaggio | ADV-001 | Critical: l'utente non vede nulla, non un errore, non uno stato vuoto — solo un vuoto silenzioso; il gap è passato inosservato a una verifica precedente che dichiarava il fix generale completo | M |
| 5 | Vicolo cieco per nuovi utenti che vogliono creare la prima casa da Impostazioni (perdita dati silenziosa) | SET-001 | Colpisce il primissimo utilizzo reale del prodotto per chi salta l'onboarding; messaggio contraddittorio + perdita dati senza alcuna via d'uscita | S |
| 6 | Onboarding che si riapre "fantasma" (ESC) o perde dati (Invio) senza passare dall'handler di chiusura | AUTH-009, AUTH-011 | Stesso bug di ciclo di vita del `<dialog>` in due varianti; danneggia la primissima impressione del prodotto, percepito come "non si chiude mai" | S |
| 7 | Saldo anno precedente sovrascritto silenziosamente se si ripete il salvataggio per lo stesso esercizio | LEDGER-013 | High, rischio concreto di alterare dati finanziari già registrati senza alcuna conferma, a differenza di ogni altra azione distruttiva dell'app | S |
| 8 | Nessun controllo incrociato tra "Saldo anno precedente" e "Riporto" su dovuto per lo stesso esercizio | LEDGER-014 | Rischio di doppio conteggio nei totali di fine esercizio/PDF; era già stato pianificato e mai eseguito — decisione di prodotto già presa, solo da implementare | M |
| 9 | Ordine CTA/contenuto invertito nell'import banca su tablet/mobile (conferma prima della tabella da rivedere) | BANKIMP-005 | High, sulla schermata di riconciliazione periodica; l'utente conferma "alla cieca" scorrendo dopo aver già premuto il bottone sbagliato concettualmente in cima | M |
| 10 | Contrasto testo "muted" sotto soglia WCAG AA in tema chiaro, sistemico su tutta l'app | SHELL-013 | High, un solo token CSS da correggere migliora leggibilità di etichette/hint su ogni schermata (login, KPI, nav, hint di campo) in un colpo solo | S |

## Pattern trasversali deduplicati
- **Form/pannello sopra la lista tra 861-1100px**: LEDGER-004, LEDGER-007, LEDGER-015 sono lo stesso bug CSS (media query `max-width:1100px` per il collasso a colonna singola disallineata dalla media query `max-width:860px` che attiva lo swap d'ordine e il form-sheet), non tre problemi indipendenti. Un solo fix su `css/app.css` (allineare le soglie) risolve Dovuti, Versamenti e Saldi precedenti insieme.
- **Tabelle non convertite in card su mobile**: SIT-001 (7 sezioni di Situazione), ADV-001 (Registro movimenti), DOCIMP-002 (tabella selezione riga import, percorso manuale/fallback) sono la stessa lacuna di copertura del pattern `dataListHtml()`/`js/mobile-cards.js`, già usato correttamente per Dovuti/Versamenti/Panoramica/Saldi precedenti ma mai esteso a queste tre superfici.
- **Errori di validazione solo via toast, non vicino al campo**: LEDGER-005 (form Dovuti) e LEDGER-010 (form Versamenti) sono lo stesso pattern mancante (assenza di `aria-invalid`/bordo errore/testo accanto al campo); concettualmente imparentato anche a DASH-006 (toast transitorio come unico segnale di un errore di caricamento) e ADV-006 (toast di errore con priorità `polite` invece di `assertive`) — il toast, da solo, non basta mai per un errore che l'utente deve agire.
- **Terminologia tecnica non spiegata** (preventivo/consuntivo/rata/riporto/esercizio fiscale, rif. UX-010): LEDGER-006, DOCIMP-004, SIT-005, SET-005, SET-007 sono la stessa lacuna di prodotto irrisolta da tempo, ripetuta in 5 punti diversi dell'app senza alcun glossario/tooltip mai implementato.
- **`<label>` che attiva `<input type="file">` nascosto, non raggiungibile da tastiera**: BANKIMP-009 (upload estratto conto) e ADV-005 (import JSON) sono lo stesso bug di pattern replicato su due upload diversi (`css/app.css` `.file-input{display:none}` applicato a un elemento non nativamente focalizzabile).
- **Confusione su "dove sono i dati veri"**: ADV-002 (registro dichiarato "vista auditoria" ma pienamente editabile, con navigazione a sorpresa fuori da Impostazioni) è concettualmente la stessa incertezza già notata per Saldi precedenti/Riporti in LEDGER-014 (due meccanismi paralleli per lo stesso concetto economico, senza un unico punto di verità comunicato).
- **Chiusura nativa del `<dialog>` di onboarding che bypassa l'handler di completamento**: AUTH-009 (tasto ESC) e AUTH-011 (Invio su campo unico obbligatorio) sono due inneschi diversi dello stesso bug di ciclo di vita (nessun listener su `close`/`cancel`, nessun guard sul submit implicito).
- **Tre superfici per selezionare/gestire la casa attiva**: SET-002 e SHELL-007 descrivono lo stesso identico problema (header `#houseSelect`, drawer `#houseDrawer`, Impostazioni→Immobili) da due cluster diversi — è un solo finding di IA, non due.
- **Accessibilità da tastiera/ARIA incoerente in modo trasversale**: SHELL-004 (focus-visible mancante su icon-btn/drawer/sheet-close), DOCIMP-003 (radio senza label), SET-003 (label dinamiche senza `for`/`id`), SET-004 (tab senza `aria-controls`) e SHELL-008/SHELL-015 (dialog/menu senza ARIA completa) non sono bug isolati ma sintomi di un'unica lacuna sistemica: il design system dichiara "focus visibile per tutti i controlli interattivi" ma l'implementazione non lo rispetta ovunque.

## Inconsistenze cross-page
- **Terminologia del segno del saldo**: "Eccedenza/In debito/Pareggio" (KPI, `js/kpi-metrics.js`) vs "Saldo positivo/Saldo negativo" (hero conformità, `js/compliance-status.js`) per lo stesso concetto nella stessa schermata Panoramica (DASH-002).
- **Naming CTA per la stessa destinazione**: "Rendiconto completo" (pulsante chiusura pannello Panoramica) vs "Vedi situazione" (3 altri CTA) vs "Situazione" (nome reale della tab) — tre nomi per una sola destinazione (DASH-003).
- **Tre superfici per la stessa azione** (selezione casa attiva): header select, drawer, Impostazioni→Immobili, tutte visibili contemporaneamente su mobile (SET-002/SHELL-007, deduplicato sopra).
- **Due pattern ARIA diversi per overlay bloccanti simili**: sheet quick-add (`role="dialog" aria-labelledby`, senza `aria-modal`) vs drawer immobili (`<aside aria-label aria-hidden>`, senza `role="dialog"`) — stesso concetto funzionale, markup semantico incoerente (SHELL-006).
- **Versioni di schema JSON incoerenti nello stesso flusso di backup**: UI dice "v4", il nome file scaricato dice "v3", lo schema realmente prodotto è v5 (ADV-003).
- **Stato "audit/sola consultazione" dichiarato ma non rispettato**: Registro movimenti in Avanzate si autodefinisce "vista auditoria" ma espone Modifica/Elimina pienamente funzionanti con redirect a sorpresa (ADV-002) — incoerenza tra copy e comportamento.
- **Validazione nativa del browser non disattivata in modo uniforme**: `loginForm` ha `novalidate`, `recoveryForm` (schermata gemella per stile) no — il messaggio custom di errore password corta diventa irraggiungibile su Recovery (AUTH-006).

## Piano d'azione
### Subito (quick win, basso sforzo/alto impatto)
- LEDGER-012 — generalizzare il messaggio d'errore hardcoded (rimuovere nome casa specifico)
- BANKIMP-001 — aggiungere opzione vuota/default esplicito al select di associazione esercizio
- LEDGER-004, LEDGER-007, LEDGER-015 — allineare le media query 860px/1100px (fix unico)
- SET-001 — forzare `houseFormMode='new'` quando non esistono ancora case
- AUTH-009, AUTH-011 — gestire `close`/`cancel` del dialog onboarding e bloccare il submit implicito
- LEDGER-013 — richiedere conferma esplicita su sovrascrittura saldo precedente esistente
- SHELL-013 — scurire il token `--color-text-muted` in tema chiaro
- BANKIMP-009, ADV-005 — rendere gli input file raggiungibili da tastiera (label pattern comune)
- LEDGER-001, LEDGER-002 — validare `splitCustom` prima del submit invece di ricadere silenziosamente su 12 rate
- DOCIMP-001 — non far sovrascrivere il messaggio di progresso multi-pagina dal render generico

### Breve termine
- ADV-001 — estendere `dataListHtml()`/card-fallback al Registro movimenti (Avanzate)
- SIT-001 — estendere lo stesso pattern alle 7 sezioni di Situazione
- DOCIMP-002 — avvolgere la tabella di selezione riga import nel wrapper scrollabile standard
- BANKIMP-005 — riordinare CTA/tabella nell'import banca sotto i 1100px (adottare `split-layout--list-first`)
- LEDGER-014 — implementare il controllo incrociato Saldo precedente/Riporto già pianificato e mai eseguito
- LEDGER-005, LEDGER-010 — errori di validazione inline accanto al campo, non solo via toast
- ADV-002 — decidere e rendere coerente lo stato del Registro movimenti (o davvero sola-lettura, o rinominare la sezione)
- SET-002/SHELL-007 — consolidare le tre superfici di selezione casa in un percorso coerente
- SHELL-004, SET-003, SET-004, DOCIMP-003 — chiudere il debito ARIA/focus trasversale (focus-visible esteso, label-for, aria-controls)
- BANKIMP-002 — riusare il badge/suggerimento di match anche nella coda "da associare manualmente"

### Successivo
- **UX-010 (terminologia tecnica non spiegata)** — LEDGER-006, DOCIMP-004, SIT-005, SET-005, SET-007: richiede una decisione di prodotto unica (glossario/tooltip trasversale o copy semplificata) applicata in tutti e 5 i punti insieme, non patch isolate
- DOCIMP-011 — "Centro verifica" e storico import versionato (richiede feature nuova, L)
- AUTH-001 — flusso self-service di recupero password end-to-end (link + `resetPasswordForEmail`, L)
- DASH-001 — decisione di prodotto su come fondere/ridurre la ridondanza hero vs KPI grid in Panoramica
- SHELL-005, SHELL-006 — uniformare i pattern di overlay (drawer/sheet) su `<dialog>` nativo con focus trap, coerente con quanto già fatto per confirm/onboarding
- SHELL-014 — sostituire i 25 valori `rgba(0,0,0,.XX)` hardcoded con token theme-aware (richiede audit CSS più ampio)
- SET-006 — decisione di prodotto su mese di inizio esercizio libero vs 4 opzioni fisse
- ADV-007 — ripensare l'etichettatura di navigazione di primo livello per Backup/Registro (bassa scopribilità)
