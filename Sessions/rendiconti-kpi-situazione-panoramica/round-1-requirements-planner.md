## Requirements Planner — Round 1 Response

**Vote**: PROPOSE

**Reasoning**:
L'operatore chiede due livelli di informazione distinti: **Panoramica** = risposta immediata «sono in regola? quanto devo?»; **Situazione** = rendiconto completo su richiesta. Oggi entrambe le viste sovrappongono elenchi tabellari (annualità, versamenti, rate, consuntivo) che competono con i totali e duplicano informazioni già presenti nel compliance hero e nei metric-chip. La base dati e la logica (`buildSituazioneReport`, `computeComplianceStatus`, `periodSummary`) sono già adatte a KPI semplici; manca principalmente riorganizzazione UI e pattern collapse. La ricerca di mercato (portali HOA/condominio, attestazione art. 1130 c.c.) conferma che per il condomino i segnali attesi sono: **stato regolarità**, **saldo/residuo**, **prossima scadenza**, **copertura versamenti** — non ratio di morosità aggregati (utili al consiglio, non al singolo proprietario).

**Details**:

### Requirements summary

1. **Situazione**: trasformare ogni blocco tabellare preventivo/consuntivo/versamenti/riporti in sezioni **accordion collapsed di default**; i totali restano sempre visibili nell'header di sezione e nei chip riepilogativi in cima.
2. **Situazione — box totali**: ridisegnare i chip e i footer «Totale da pagare» con gerarchia visiva chiara (primario vs secondario), etichette in italiano plain-language e raggruppamento per preventivo / consuntivo / saldo precedente.
3. **Panoramica**: rimuovere elenchi (tabella annualità, scadenzario a lista, ultimi versamenti); mostrare solo **KPI card** + compliance hero; link espliciti verso Situazione (con esercizio preselezionato dove possibile).
4. **KPI set**: adottare un set ristretto di indicatori riconoscibili, derivati da dati già calcolati, allineati al linguaggio dell'attestazione di pagamento condominiale.

---

### User stories (US-###) with As a / I want / so that

#### US-001 — Accordion tabelle in Situazione

**As a** proprietario che consulta il rendiconto di un esercizio,  
**I want** che le tabelle di dettaglio (preventivo, consuntivo, versamenti, riporti) siano chiuse di default e apribili una alla volta,  
**so that** la pagina non mi sommerga con righe e possa concentrarmi sui totali.

#### US-002 — Totali sempre leggibili in Situazione

**As a** proprietario,  
**I want** box/chip di riepilogo con totali chiave ben distinti (saldo consuntivo, totale da pagare, versato, stato),  
**so that** capisco la mia posizione senza scorrere tabelle o interpretare footnote sparse.

#### US-003 — Panoramica solo KPI

**As a** proprietario che apre l'app,  
**I want** vedere in Panoramica solo indicatori sintetici e lo stato «Sei in regola», senza tabelle o liste di movimenti,  
**so that** in pochi secondi capisco se devo agire o posso andare avanti.

#### US-004 — Collegamenti Panoramica → Situazione

**As a** proprietario che vuole approfondire un numero visto in Panoramica,  
**I want** link/CTA «Vedi dettaglio in Situazione» (e opzionalmente «Vedi versamenti») che mi portano alla sezione giusta,  
**so that** non devo cercare manualmente la stessa informazione nel menu Movimenti.

#### US-005 — KPI coerenti tra Panoramica e compliance

**As a** proprietario,  
**I want** che i KPI in Panoramica usino le stesse definizioni del banner «Sei in regola» e della Situazione,  
**so that** non vedo cifre o stati contraddittori tra le schermate.

---

### Acceptance criteria (AC-US###-##)

#### US-001 — Accordion tabelle in Situazione

- **AC-US001-01**: Given un esercizio con preventivo e consuntivo, When apro Situazione, Then i blocchi «Preventivo — dettaglio rate», «Consuntivo», «Versamenti esercizio», «Riporti su preventivo», «Versamenti senza rata» e «Saldi anno precedente» (tabella interna) sono **collapsed** e mostrano solo titolo + riga totali sintetica nell'header.
- **AC-US001-02**: Given una sezione collapsed, When clicco sull'header (o pulsante dedicato con `aria-expanded="false"`), Then la tabella si espande e `aria-expanded` passa a `true`; un secondo click la richiude.
- **AC-US001-03**: Given navigazione da tastiera, When la sezione ha focus, Then posso aprire/chiudere con Enter/Space e lo stato è annunciato agli screen reader (titolo + expanded/collapsed).
- **AC-US001-04**: Given cambio esercizio dal select, When il render si aggiorna, Then tutte le sezioni tornano **collapsed** (stato non ereditato dall'esercizio precedente).
- **AC-US001-05**: Given export PDF, When genero il PDF da Situazione, Then il contenuto del PDF **non** è influenzato dal collapse UI (resta completo come oggi).

#### US-002 — Totali sempre leggibili in Situazione

- **AC-US002-01**: Given un esercizio con dati, When visualizzo la fascia `#situazioneSummary`, Then vedo al massimo **6 chip** con gerarchia: primari (Saldo consuntivo, Stato pagamento) evidenziati visivamente; secondari (Preventivo, Consuntivo, Versato, Saldo rate prev.) in stile subdued.
- **AC-US002-02**: Given presenza di saldo anno precedente, When è attivo `priorBalance`, Then compaiono chip/footer distinti «Totale da pagare (preventivo)» e/o «Totale da pagare (consuntivo)» con formula esplicita in hint («Preventivo + saldo precedente»), non solo l'importo nudo.
- **AC-US002-03**: Given saldo consuntivo negativo, When il chip «Saldo consuntivo» è mostrato, Then il valore usa classe semantica negativa e etichetta stato «Debito» (o «Saldato in esercizio successivo» se `consuntivoSettledInNext`).
- **AC-US002-04**: Given header di sezione accordion, When la sezione è collapsed, Then l'header mostra almeno: **totale di sezione** (es. totale rate preventivo, totale consuntivo, totale versato) formattato in EUR, allineato al footer della tabella espansa.

#### US-003 — Panoramica solo KPI

- **AC-US003-01**: Given casa selezionata con dati, When apro Panoramica, Then **non** sono renderizzati: tabella «Riepilogo annualità» (`#annualTableWrap`), lista «Scadenzario sintetico» (`#annualCards`), pannello «Versamenti» (`#dashboardPayments`).
- **AC-US003-02**: Given casa con esercizio corrente, When apro Panoramica, Then vedo: (a) compliance hero, (b) griglia KPI card (min 4, max 8 indicatori), (c) al massimo un riquadro compatto «Altri esercizi» con **solo** badge stato + saldo per riga (no tabella multi-colonna), opzionale se più di un esercizio.
- **AC-US003-03**: Given filtro esercizio, When cambio il selettore periodo in Panoramica (se mantenuto), Then i KPI si aggiornano sullo scope selezionato senza mostrare elenchi di movimenti.
- **AC-US003-04**: Given casa senza dati, When apro Panoramica, Then resta il compliance hero «Inizia da qui» con CTA verso import/dovuti; nessun placeholder di tabella vuota.

#### US-004 — Collegamenti Panoramica → Situazione

- **AC-US004-01**: Given KPI «Saldo consuntivo» o compliance hero con CTA secondaria, When clicco «Vedi situazione» / «Dettaglio esercizio», Then navigo a `movimenti` → subview `situazione` con l'esercizio focus preselezionato in `#situazionePeriod`.
- **AC-US004-02**: Given riquadro «Altri esercizi» con esercizio in debito, When clicco la riga o link «Apri in Situazione», Then Situazione si apre su quell'`fiscalPeriodId`.
- **AC-US004-03**: Given KPI «Prossima rata» o stato «Rata in scadenza», When clicco il link associato, Then arrivo a Situazione con sezione «Preventivo — dettaglio rate» **espansa** (deep link opzionale via hash/query interno, es. `#situazione-rate`).

#### US-005 — KPI coerenti tra Panoramica e compliance

- **AC-US005-01**: Given stesso immobile ed esercizio focus, When confronto headline compliance (`computeComplianceStatus`) e KPI «Stato pagamenti», Then il livello (`in_regola` / `attenzione` / `azione`) e il saldo consuntivo mostrato coincidono con `periodSummary` / `buildSituazioneReport`.
- **AC-US005-02**: Given reload pagina o cambio casa, When i dati sono ricaricati da Supabase, Then i KPI riflettono i dati persistiti (nessun valore stale rispetto a Situazione).

---

### KPI recommendations (from market research)

| KPI | Rationale | Etichetta UI (IT) | Dove |
|-----|-----------|-------------------|------|
| Stato regolarità pagamenti | Attestazione art. 1130 c.c. | **Stato pagamenti** | Compliance hero |
| Saldo consuntivo esercizio | Ledger per unità | **Saldo consuntivo** | Panoramica + chip Situazione |
| Totale da pagare | Amount due | **Da pagare** | Panoramica + header accordion |
| Copertura versamenti | Collection rate semplificato | **Copertura pagamenti** | Panoramica KPI |
| Prossima rata / scadenze | Reminder mensili | **Prossima rata** / **Rate scadute** | Panoramica KPI |
| Varianza preventivo → consuntivo | Budget vs actual | **Scostamento consuntivo** | Panoramica (condizionale) |
| Esercizi con debito aperto | Multi-year arrears | **Esercizi in debito** | Panoramica (multi-anno) |
| Credito / eccedenza | Positive balance | **Credito consuntivo** | Panoramica KPI |

---

### Out of scope

- Modifica logica di calcolo saldi, saldi precedenti o regole `consuntivoSettledInNext`
- Nuovi KPI che richiedono dati non presenti
- Redesign PDF Situazione
- Persistenza preferenze collapse tra sessioni
- Multi-immobile aggregato in Panoramica
- Grafici/trend storici o export KPI

---

### Open questions

1. Filtro esercizio in Panoramica: mantenerlo o fissare sull'esercizio corrente?
2. Riquadro «Altri esercizi»: mini-lista (max 5 righe) o solo link «Vedi tutti in Situazione»?
3. Sezione «Saldi anno precedente»: collapsed o sempre espansa?
4. Deep link sezione espansa: serve aprire accordion specifica?
5. KPI «Da pagare»: in assenza di consuntivo, mostrare preventivo, consuntivo, o entrambi?
