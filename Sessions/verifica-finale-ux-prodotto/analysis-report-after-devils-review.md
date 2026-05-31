# Report — Verifica finale UX/UI e prodotto (post Devil's Advocate)

**App:** Gestione Spese Condominiali  
**Sessione:** `verifica-finale-ux-prodotto`  
**Data:** 2026-05-31  
**Base:** `analysis-report.md` (invariato)  
**Review:** `devils-advocate-review.md`  
**Emendamenti:** §A (release criteria), §F (roadmap riscritta), §G (allineamento), nota metodologica

---

## A. Executive summary (emendato)

### Stato del prodotto

Invariato rispetto al report base: dominio coperto bene, **shell UX ancora da back-office**, mobile non utilizzabile per i flussi quotidiani. Il redesign precedente ha migliorato la navigazione, non la **leggibilità dei dati** né la **scoperta dell’import documento**.

### Release criteria (quando il verdetto diventa SÌ)

Tutti obbligatori su **viewport 390×844, Safari iOS o Chrome Android**, con almeno una casa e dati realistici (dovuti + versamenti + 1 import documento):

| # | Criterio | Riferimento issue |
|---|----------|-------------------|
| R1 | Nessuno scroll orizzontale su Dovuti, Versamenti, Panoramica pagamenti | MOB-001, MOB-002 |
| R2 | Import documento raggiungibile in ≤2 tap da Home (non sotto label “Import banca”) | UX-005, FLOW-003 |
| R3 | Inserimento versamento senza `alert` bloccante; resta in contesto Versamenti | UX-008, FLOW-004 |
| R4 | Onboarding primo utilizzo completabile in &lt;3 min (casa + 1 azione dati) | FLOW-001 |
| R5 | Touch target ≥44px su Modifica/Elimina riga | MOB-008 |

**Verdetto attuale:** **NO** (0/5).  
**Verdetto condizionato:** **SÌ per beta chiusa** dopo R1–R5; **SÌ per utenti finali ampi** solo dopo almeno 2 feature dominio **v1** in §F (verifica amministratore + bonifico guidato o equivalente).

### Top 5 blocker

Invariati — vedi `analysis-report.md` §A.

### Nota su §F (risposta all’operatore)

La roadmap originale era **generica e poco ambiziosa**. Non proponeva “grandi” novità perché mescolava fix (Home, onboarding) con idee da qualsiasi fintech. La **§F sotto** è riscritta attorno al **moat**: allineamento con il documento dell’amministratore e ciclo preventivo → rate → versamenti → consuntivo → conguaglio.

---

## B–E, G (sezioni B–E e G)

**Nessuna modifica sostanziale** alle sezioni B (UX/UI), C (mobile), D (flussi), E (miglioramenti processo senza nuovo schema).

**§G — aggiunta esplicita:** la fase “Successivo” non deve partire prima del completamento R1–R5. Le feature §F **v1** iniziano solo dopo release criteria (o in parallelo se team ≥2, ma non al posto dei Critical).

Per il dettaglio completo di B–E e G originale → `analysis-report.md`.

---

## F. Future feature roadmap (riscritta post-DA)

### Legenda

- **v1** = dopo fix Critical (valore dominio, stack compatibile: HTML/JS + Supabase + Edge esistenti)  
- **v2** = richiede notifiche esterne, ruoli multi-utente o parser banca aggiuntivi  
- **Kill** = non fare finché mobile non è usabile  

### Kill list (non sono “grandi idee”, sono distrazioni)

| Proposta originale | Perché kill / defer |
|--------------------|---------------------|
| ~~Dashboard “Sei in regola”~~ | **Implementata** come hero dedicato (`compliance-hero`) — non ridotta a KPI generici |
| Onboarding guidato | Già in action plan Subito |
| Widget PWA prossima rata | Valore basso vs costo; Home + notifica in-app basta in v1 |
| Registrazione self-service | Prodotto privato; strategia GTM assente |
| Multi-banca | Parser N formati; dopo Intesa perfetta e mobile OK |
| Accesso familiare read-only | RLS + inviti = altro prodotto; v2+ |

---

### Cluster 1 — Verifica e fiducia (il differenziatore)

| Nome | Problema | Valore utente | Priorità | Complessità | Fase |
|------|----------|---------------|----------|-------------|------|
| **Centro verifica vs amministratore** | Dopo import, non so se i numeri dell’app coincidono con la mia riga nel PDF | Confronto side-by-side: totale riga, rate estratte, totale dovuti salvati; badge “OK / Scostamento €X” | **Alta** | Media | v1 |
| **Storico import versionato** | Ricarico consuntivo rivisto; perdo traccia | Salva PDF + snapshot estrazione + diff tra import successivi sullo stesso esercizio | **Alta** | Media | v1 |
| **Alert conguaglio preventivo/consuntivo** | Consuntivo diverso da quanto pagato in rate | Calcola delta automatico; propone dovuto conguaglio o nota credito | **Alta** | Media | v1 |
| **Template / profilo amministratore** | PDF sempre diversi, AI sbaglia campi | Profilo “Studio Rossi”: layout tipico, sinonimi colonne, migliora prompt senza “ML magico” | Media | Alta | v2 |

---

### Cluster 2 — Azioni quotidiane (JTBD pagare e registrare)

| Nome | Problema | Valore utente | Priorità | Complessità | Fase |
|------|----------|---------------|----------|-------------|------|
| **Bonifico guidato per rata** | Devo aprire PDF per importo e causale | Schermata “Prossima rata”: importo, scadenza, causale suggerita, copia negli appunti | **Alta** | Bassa | v1 |
| **Split versamento su più rate** | Un bonifico copre 2–3 rate | Un versamento → ripartizione su N rate con validazione totale | **Alta** | Media | v1 |
| **Match Intesa → rata (P-10)** | Associazione manuale lunga | Regole importo±tolleranza, data, testo causale; review in coda | **Alta** | Media | v1 |
| **Quietanza allegata** | Nessuna prova del pagamento | Foto/PDF ricevuta su `payments` (Storage Supabase) | Media | Media | v1 |
| **Promemoria in-app scadenze** | Dimentico la rata | Badge Home + elenco “in scadenza / scadute” (no push in v1) | Media | Bassa | v1 |
| **Notifiche push/email scadenze** | Promemoria fuori app | Push PWA o email 3gg prima scadenza rata | Media | Alta | v2 |

---

### Cluster 3 — Chiusura esercizio e terze parti

| Nome | Problema | Valore utente | Priorità | Complessità | Fase |
|------|----------|---------------|----------|-------------|------|
| **Checklist chiusura esercizio** | Fine anno: cosa manca? | Wizard: consuntivo importato? rate saldate? PDF situazione generato? | Media | Bassa | v1 |
| **Dossier esercizio (ZIP)** | Commercialista/amministratore chiede pacchetto | Export ZIP: PDF situazione + movimenti CSV + copia doc amministratore | Media | Media | v1 |
| **Timeline esercizio** | Numeri sparsi in tabelle | Vista cronologica: preventivo → rate → versamenti → consuntivo | Media | Media | v2 |
| **Export commercialista** | Dichiarazione redditi | CSV/Excel standard (non solo JSON backup) | Media | Bassa | v1 |

---

### Cluster 4 — Crescita (solo dopo mobile OK)

| Nome | Problema | Valore utente | Priorità | Complessità | Fase |
|------|----------|---------------|----------|-------------|------|
| **Archivio documenti per esercizio** | PDF persi in email | Libreria per casa/anno con ricerca | Media | Media | v1 |
| **Multi-banca** | Solo Intesa | Import CSV/Excel altre banche | Bassa | Alta | v2+ |
| **Accesso familiare read-only** | Coniuge consulta | Invito read-only per casa | Bassa | Alta | v2+ |

---

### Feature “Sei in regola” (hero Panoramica) — specifica prodotto

Non è un alias della Home: è un **motore di stato** visibile sopra tutto il resto.

| Livello | Headline | Trigger |
|---------|----------|---------|
| `in_regola` | Sei in regola | Nessuna rata scaduta; consuntivo non in debito |
| `attenzione` | Rata in scadenza / Consuntivo mancante | Rata entro 14 gg o preventivo senza consuntivo |
| `azione` | Intervento richiesto | Rate scadute non coperte o consuntivo in debito |
| `vuoto` | Inizia da qui | Nessun dato per l’immobile |

**UI:** card a bordo colorato, icona, headline grande, fatto chiave (esercizio, saldo consuntivo, prossima rata), **2 CTA contestuali** (es. Registra versamento / Importa documento). File: `js/compliance-status.js`, `renderComplianceHero()` in `render.js`.

---

### Priorità strategica (cosa rende l’app “grande”)

Se hai budget per **tre** investimenti oltre ai fix UX:

1. **Centro verifica vs amministratore** — nessun competitor consumer fa bene il “trust loop” col PDF dell’amministratore.  
2. **Bonifico guidato + split versamento** — riduce errori reali ogni mese.  
3. **Alert conguaglio preventivo/consuntivo** — valore annuale percepito altissimo, usa dati già nel modello.

Le notifiche push e il multi-banca sono **commodity**; utili solo dopo che l’app si usa davvero su telefono.

---

### Dipendenze tecniche (oneste)

| Feature | Dipende da |
|---------|------------|
| Centro verifica | Import documento stabile + `document_imports` popolato |
| Storico versionato | Storage file + metadati estrazione in DB |
| Conguaglio | Dovuti preventivo + consuntivo stesso esercizio |
| Bonifico guidato | `installments.js` + rate da `split_amounts` |
| Quietanza | Supabase Storage bucket + RLS |
| Notifiche v2 | Edge cron o servizio email + consenso utente |

---

## G. Action plan (emendamento)

### Subito — invariato

Vedi `analysis-report.md` §G Subito.

### Breve termine — invariato + nota

Non avviare **Centro verifica** o **Storico import** prima di UX-005 (tab Import) e MOB-001 (card list).

### Fase successiva — sostituisce voce generica “Feature §F”

| Ordine | Feature v1 | Perché dopo fix |
|--------|------------|-----------------|
| 1 | Bonifico guidato | Bassa complessità, alto uso mensile |
| 2 | Match Intesa (P-10) | Completa flusso banca già presente |
| 3 | Centro verifica vs amministratore | Moat prodotto |
| 4 | Alert conguaglio | Valore annuale |
| 5 | Split versamento | Caso reale frequente |
| 6 | Dossier esercizio / Export commercialista | Stagionalità dichiarazioni |

---

## Deliberation trail (aggiornato)

| Fase | Esito |
|------|-------|
| Plan | **Approvato** dall’operatore |
| Execute | `execution.md` + `analysis-report.md` |
| Devil's Advocate | **OBJECT** — 10 challenge; `devils-advocate-review.md` |
| Consolidation | `analysis-report-after-devils-review.md` (questo file) |
| Verify | Raccomandato: smoke test R1–R5 con account reale |

**Risposta operatore:** critica su §F **fondata** — roadmap originale deprioritizzata e sostituita da feature dominio condominio.
