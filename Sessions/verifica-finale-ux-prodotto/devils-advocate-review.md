# Devil's Advocate Review — Verifica finale UX/prodotto

**Sessione:** `verifica-finale-ux-prodotto`  
**Input:** `analysis-report.md`  
**Operatore:** ha chiesto critica esplicita su §F (“non vedo grandi proposte”)

---

## Devil's Advocate — Review Response

**Vote**: **OBJECT**

**Reasoning:** Il report è solido su UX/mobile e flussi (B–D, G). La sezione **F è debole**: lista generica da “app qualsiasi”, confusione tra **fix prodotto** e **feature nuove**, nessun vantaggio competitivo legato al dominio condominiale (preventivo/consuntivo, riconciliazione con amministratore, esercizio Giugno–Maggio). Senza riscrittura di F, il deliverable non soddisfa l’area operatore 5 “feature realistiche e motivate” nel senso di **differenziazione**, non solo quantità.

---

## Challenges

### Challenge 1: §F confonde miglioramenti UX con “future feature”

**Category:** contradiction  
**Reference:** §F “Onboarding guidato in-app” (Alta) vs §G “Wizard onboarding 3 step” (Subito)  
**Issue:** Lo stesso lavoro è sia roadmap futura sia azione immediata. Il lettore non sa se comprare un prodotto o eseguire un fix. Onboarding non è una feature: è prerequisito di release.

**Coordinator disposition:** **Accettato** — rimuovere da F; resta solo in G/E.

---

### Challenge 2: “Dashboard Sei in regola” non è una feature

**Category:** vagueness  
**Reference:** §F riga 1  
**Issue:** È la definizione corretta della **Home** già richiesta in §C/D (FLOW-005). Chiamarla “feature” maschera il fatto che il prodotto oggi non ha una schermata principale chiara. Nessun requisito aggiuntivo (regole? dati? stati?) — impossibile stimare o implementare.

**Coordinator disposition:** **Accettato** — assorbito in “Home task-first”; sostituito in F da feature misurabile.

---

### Challenge 3: Roadmap omessa il differenziatore esistente (import AI)

**Category:** completeness-gap  
**Reference:** §F non menziona estensioni su `extract-document`, HITL, `split_amounts`, confronto riga amministratore  
**Issue:** L’unico moat tecnico dell’app è **allineamento col documento dell’amministratore**. La roadmap parla di “template estrazione” (vago) ma non di: verifica scostamenti, storico versioni import, conguaglio preventivo/consuntivo, bonifico guidato da dati estratti. Feature generiche (notifiche, PWA widget) competono con ciò che nessun foglio Excel fa per te.

**Coordinator disposition:** **Accettato** — F riscritta con cluster “Dominio condominio”.

---

### Challenge 4: Notifiche scadenze senza specifica

**Category:** unspecified-element  
**Reference:** §F “Notifiche scadenze rate”  
**Issue:** Push PWA? Email? Solo in-app? Da quale data (scadenza rata da `split_amounts` o data versamento)? Senza canale e trigger, complessità “Media” è arbitraria. Su stack statico + Supabase serve architettura (cron Edge, Resend, ecc.) non discussa.

**Coordinator disposition:** **Parzialmente accettato** — mantenuta come feature v2 con canale esplicito; v1 = “promemoria in-app” più leggero.

---

### Challenge 5: Multi-banca e accesso familiare prematuri

**Category:** assumption  
**Reference:** §F priorità Media con complessità Alta  
**Issue:** Assumono prodotto già usabile su mobile e import documento discoverable. Fino ad allora sono distrazioni di roadmap. Multi-banca = N parser; familiare = RLS/ruoli/inviti — scope prodotto diverso.

**Coordinator disposition:** **Accettato** — spostati in **Backlog esplicito / v2+** con gate “dopo release mobile”.

---

### Challenge 6: “Registrazione self-service” disallineata al dominio

**Category:** assumption  
**Reference:** §F, domain-context (app privata, un account = case utente)  
**Issue:** Il contesto è repo privato / utenti registrati manualmente. Self-service è crescita B2C, non risolve JTBD condominio. Priorità Bassa senza strategia go-to-market è rumore.

**Coordinator disposition:** **Accettato** — **rimossa** da roadmap attiva; nota opzionale “solo se prodotto pubblico”.

---

### Challenge 7: Verdetto “NO release” senza criterio misurabile

**Category:** vagueness  
**Reference:** §A “Verdetto release: NO”  
**Issue:** Non definisce “release”: famiglia? 10 utenti? Nessun testo su cosa deve passare (es. completare J4–J8 su 390px senza scroll orizzontale). Operatore non può sapere quando il NO diventa SÌ.

**Coordinator disposition:** **Accettato** — aggiunti **release criteria** in §A del report emendato.

---

### Challenge 8: Audit mobile non validato su app autenticata

**Category:** honesty / unspecified-element  
**Reference:** Nota metodologica fine report  
**Issue:** Corretto dichiararlo, ma severità Critical su MOB-* poggia su inferenza CSS. Alcuni finding potrebbero essere mitigati da contenuto reale (poche righe in tabella). Rischio over-confidence.

**Coordinator disposition:** **Accettato** — mantenuta severità (CSS `min-width: 36rem` è hard blocker), nota rafforzata con **smoke test obbligatorio** prima di ship.

---

### Challenge 9: §E e §F sovrapposti

**Category:** contradiction  
**Reference:** P-10 “Match automatico Intesa” in E vs “Riconciliazione semi-automatica” in F  
**Issue:** Stessa capability in due sezioni con priorità diverse. Roadmap non è ordinata per dipendenze.

**Coordinator disposition:** **Accettato** — unificato in F con dipendenze; E resta solo miglioramenti **senza** nuovo schema dati.

---

### Challenge 10: Mancano feature “grandi” ma realistiche sullo stack attuale

**Category:** completeness-gap  
**Reference:** Operatore: “non vedo grandi proposte”  
**Issue:** Nessuna proposta che sfrutti dati già in DB (`dues`, `payments`, `document_imports`, `bank_movements`, `fiscal_periods`) per **valore che Excel non dà**: conguaglio, confronto amministratore, split versamento, dossier esercizio, timeline rate.

**Coordinator disposition:** **Accettato** — §F ampliata con 12 feature domain-specific + kill list + fasi v1/v2.

---

## Sintesi per il Coordinator

| Esito | Azione |
|-------|--------|
| B–D, G (fix) | Confermati; pochi aggiustamenti |
| F | **Riscrittura completa** |
| A | Aggiungere release criteria |
| Operatore | Ha ragione: §F originale era debole |

**File emendato:** `analysis-report-after-devils-review.md` (originale `analysis-report.md` invariato).
