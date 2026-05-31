# Plan — Import preventivo/consuntivo con estrazione AI

**Session**: `Sessions/import-preventivo-consuntivo-ai/`  
**Pattern**: Plan / Execute / Verify  
**Status**: ✅ Approvato — Execute completato (2026-05-31)  
**Date**: 2026-05-31 (rev. 2)

---

## Executive summary

Aggiungere all'app Gestione Spese Condominiali un flusso di **import documentale** (DOCX, PDF, immagine) del preventivo o consuntivo dell'amministratore, con **estrazione AI lato server** (Supabase Edge Function), **anteprima con revisione umana (HITL)** e **commit** sui modelli esistenti (`fiscal_periods`, `dues`, `split_mode`). Automazione completa come default; inserimento manuale come fallback. Fase 2: voci di costo, millesimi in anteprima, verifiche aritmetiche estese.

---

## Context

| Elemento | Stato attuale |
|----------|----------------|
| Creazione esercizio | Manuale via etichetta (`ensureFiscalPeriodByLabel`) |
| Dovuti | Form manuale preventivo/consuntivo |
| Import strutturato | Solo estratto conto Intesa (`js/intesa.js`) |
| Multi-formato admin | **Non esiste** |
| File esempio operatore | **Il Parco** (4 PDF), **Via Anzani** (42 JPEG in batch per esercizio) — vedi `operator-input.md` |

---

## User stories (MVP — P0)

### US-001 — Avviare import da immobile selezionato

- **AC-US001-01**: Con utente autenticato e casa selezionata, sezione import documento visibile.
- **AC-US001-02**: Senza auth → login, nessuna scrittura REST.
- **AC-US001-03**: Senza immobile → messaggio invito a selezionare/creare casa.

### US-002 — Caricare DOCX, PDF, immagine (≤ 15 MB)

- **AC-US002-01**: MIME/estensioni ammessi: docx, pdf, jpg, png, webp.
- **AC-US002-02**: Tipo non supportato → errore senza chiamata AI.
- **AC-US002-03**: File troppo grande → rifiuto con messaggio.

### US-003 — Estrazione AI campi obbligatori

- **AC-US003-01**: Anteprima con `fiscalYearLabel`, `documentKind`, `totalAmount`, `confidence` per campo, `extractionNotes`.
- **AC-US003-02**: Tabella multi-condomino → elenco candidati riga/unità.
- **AC-US003-03**: Nessuna scrittura DB finché operatore non conferma.

### US-004 — Selezionare riga unità (HITL conversazionale, post-estrazione)

- **AC-US004-01**: L'estrazione **non** richiede nome/cognome/alias **prima** dell'upload; la Function estrae l'intera tabella anagrafica.
- **AC-US004-02**: In anteprima, operatore **sceglie la propria riga** da elenco estratto (click/radio); totale e rate si aggiornano — equivalente a una conversazione guidata, non a un form bloccante iniziale.
- **AC-US004-03**: Nessuna riga riconosciuta → campi manuali in anteprima, sempre dopo estrazione.

### US-005 — Mappare anno su `fiscal_periods`

- **AC-US005-01**: Label compatibile → `ensureFiscalPeriodByLabel`.
- **AC-US005-02**: Periodo esistente → riuso + avviso.
- **AC-US005-03**: Label ambigua → campo evidenziato HITL, correzione manuale.

### US-006 — Creare dovuto preventivo/consuntivo

- **AC-US006-01**: Preventivo → `due_kind = 'preventivo'`, `amount`, `description` con riferimento import.
- **AC-US006-02**: Consuntivo → `due_kind = 'consuntivo'` (no split automatico).
- **AC-US006-03**: Dopo reload → dovuto visibile e persistito.

### US-007 — Ripartizione rate **identica al documento** (solo preventivo)

- **AC-US007-01**: Ogni rata estratta ha **importo e scadenza/periodo** come nel file; persistenza in `dues.split_amounts` (jsonb: `[{ label?, periodStart, amount }, …]`).
- **AC-US007-02**: `listInstallmentsForDue` usa `split_amounts` quando presente — **non** ricalcola ripartizione equa.
- **AC-US007-03**: Somma rate estratte ≠ totale riga (± €0,01) → warning HITL; commit solo dopo conferma o correzione.
- **AC-US007-04**: Se il documento indica solo modalità (mensile/bimestrale) senza importi per rata, derivare slot da date esercizio ma importi **per rata dal documento** quando disponibili.

### US-008 — HITL pre-commit

- **AC-US008-01**: `confidence < 0,70` → campo evidenziato, conferma esplicita richiesta.
- **AC-US008-02**: Tipo documento ambiguo → scelta manuale Preventivo/Consuntivo.
- **AC-US008-03**: Riepilogo modale finale prima di persistenza.

### US-009 — Fallback manuale

- **AC-US009-01**: "Inserisci manualmente" → form dovuti esistente.
- **AC-US009-02**: Errore AI → "Riprova" + "Inserisci manualmente".

### US-010 — Tracciabilità e duplicati

- **AC-US010-01**: `description` include nome file (o batch) e data import; hash file in metadato import.
- **AC-US010-02**: Import già effettuato (stesso hash o stesso nome+esercizio+tipo) → **avviso** con scelta operatore: **Annulla** | **Aggiungi nuovo dovuto** | **Sostituisci dovuto precedente** (se applicabile).

### US-014 — Upload multi-immagine (batch JPEG)

- **AC-US014-01**: Selezione multipla JPEG → un unico job di estrazione (pagine ordinate per nome file).
- **AC-US014-02**: Anteprima indica "N pagine" e consente rimuovere/riordinare prima di inviare (opzionale P1).

### US-015 — Documento misto preventivo + consuntivo

- **AC-US015-01**: Se l'AI rileva entrambi, anteprima mostra **due schede** ("Preventivo" / "Consuntivo") con totali separati; operatore conferma una, l'altra o entrambe.
- **AC-US015-02**: Un solo percorso UI **"Importa documento"** — nessuna scelta preventivo/consuntivo prima dell'upload.
- **AC-US015-03**: Commit crea 1 o 2 `dues` solo per schede confermate; etichette chiare in lista dovuti.

---

## Estensioni (P1 — post-MVP)

| Story | Scope |
|-------|--------|
| **US-011** | Voci di costo in anteprima (`costLines[]`), somma vs totale |
| **US-012** | Millesimi per riga in anteprima (non persistiti v1) |
| **US-013** | Verifica quota da millesimi, somma rate, somma voci |

---

## Architectural decisions

| ID | Decisione | Rationale |
|----|-----------|-----------|
| **AD-001** | Estrazione via **Supabase Edge Function** `extract-document` | API key sicura; JWT allineato a RLS |
| **AD-002** | **Nessun** auto-commit sotto soglia confidenza | Dati finanziari ad alto rischio |
| **AD-003** | Preview in `state.documentImportPreview` (come Intesa) | Coerenza UX, no persist fino a conferma |
| **AD-004** | Mapping su API esistenti (`fiscal.js`, `api.js`) | Minimo impatto schema |
| **AD-005** | Millesimi/anagrafica condomini **solo preview** in v1 | Domain: una casa = un immobile |
| **AD-006** | Entrypoint UI: `index.html` + subview `import-documento` | Evitare drift con file legacy |
| **AD-007** | Migration opzionale `document_imports` + Storage | Audit; traccia hash per duplicati |
| **AD-008** | Colonna `dues.split_amounts` jsonb | Rate con importi non uniformi fedeli al PDF |
| **AD-009** | HITL conversazionale post-estrazione | Nessun campo "chi sei" pre-upload |
| **AD-010** | UX: un solo entry point `Importa documento` | Sotto Movimenti o wizard creazione esercizio; no menu paralleli |
| **AD-011** | Nessun vincolo privacy extra | Upload verso Edge Function + provider LLM standard |

---

## Implementation tasks

| ID | Task | Priority |
|----|------|----------|
| T-000 | Migration `split_amounts` + aggiornare `installments.js` / `api.js` / `state.js` | P0 |
| T-001 | Schema JSON estrazione + confidence (`js/document-import-schema.js`) | P0 |
| T-002 | Edge Function `extract-document` autenticata | P0 |
| T-003 | Normalizzazione PDF/image/DOCX in Function | P0 |
| T-004 | Client wrapper `js/document-import-api.js` | P0 |
| T-005 | State + handler upload (`state.js`, `main.js`) | P0 |
| T-006 | Mapping draft → dominio fiscale (`document-import-map.js`) | P0 |
| T-007 | UI HITL review: tabella righe, schede preventivo/consuntivo, batch JPEG (html, render, config) | P0 |
| T-008 | Commit: `ensureFiscalPeriodByLabel` + `saveDueToSupabase` | P0 |
| T-009 | Fallback manuale → form dovuti | P0 |
| T-010 | Validazione aritmetica client (somma rate) | P0 |
| T-011 | Migration audit `document_imports` (opzionale) | P1 |
| T-012 | Voci consuntivo multi-riga | P1 |
| T-013 | Checklist E2E manuale (3 formati) | P0 |

---

## HITL gates

1. **Plan approval** (questo documento) — approve / revise / stop
2. **Runtime**: confidence < 0,70, mismatch aritmetici, scelta riga condomino, pre-commit modale
3. **Devil's Advocate** — dopo Verify (checkpoint yes/skip)

---

## Risks

| Risk | Mitigation |
|------|------------|
| Documenti layout variabile | JSON schema + HITL; no auto-commit |
| Rate non uniformi | **Risolto**: `split_amounts` + AD-008 |
| 42 JPEG Via Anzani | Batch multi-file → un job; ordinamento per nome |
| PDF "Convocazione e bilancio" misto | Schede duali US-015 |
| PII verso LLM | Nessun vincolo extra; opt-out = manuale |
| Costi/latency vision | Limite 15 MB; DOCX come testo quando possibile |

---

## Decisioni operatore (chiuse)

| # | Decisione |
|---|-----------|
| 1 | Esempi in subfolder Il Parco / Via Anzani — golden set per test |
| 2 | Nessuna richiesta nome pre-estrazione; HITL conversazionale in anteprima |
| 3 | Split **identico** al file → `split_amounts` (non ripartizione equa) |
| 4 | Nessun vincolo privacy aggiuntivo |
| 5 | UX minima: **un solo** flusso "Importa documento"; schede duali se doc misto |
| 6 | Duplicato → avviso + scelta operatore (annulla / aggiungi / sostituisci) |

## UX proposta (semplicità portale)

```
Movimenti → [Importa documento amministratore]
     ↓
Carica file (PDF singolo | più JPEG | DOCX)
     ↓
"Elaborazione…" (Edge Function)
     ↓
Anteprima unica:
  • Tabella tutte le righe → clic sulla tua
  • Eventuale scheda Preventivo / scheda Consuntivo
  • Rate editabili con importi dal documento
  • Badge campi incerti
     ↓
[Conferma import]  oppure  [Inserisci manualmente]
```

Nessun wizard "Sei preventivo o consuntivo?" prima dell'upload.

## Open questions (rimaste — non bloccanti)

- Voci di costo P1: solo anteprima o persistenza consultabile?

---

## Test plan (Verify phase)

- [ ] Login → upload DOCX/PDF/immagine (o mock Function)
- [ ] Anteprima con campi editabili e badge confidence
- [ ] HITL su campo < 0,70
- [ ] Commit crea `fiscal_period` + `due` corretti
- [ ] Reload → dati persistiti; RLS rispettata
- [ ] Fallback manuale senza side-effect
- [ ] Errore rete/AI → messaggio + retry/manuale
- [ ] Validazione somma rate ≠ totale blocca commit

---

## Deliberation trail (Plan)

| Round | Esito |
|-------|--------|
| 1 | Requirements Planner PROPOSE; Task Architect PROPOSE → piano sintetizzato |
| 2 | Operatore revise: HITL conversazionale, split fedele, UX unificata, duplicati con scelta, inventario esempi |
