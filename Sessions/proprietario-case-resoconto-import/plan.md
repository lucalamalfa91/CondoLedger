# Piano — Proprietario in casa, filtro import e resoconto

**Sessione**: `Sessions/proprietario-case-resoconto-import/`  
**Pattern**: Plan / Execute / Verify  
**Stato**: approvato operatore (2026-05-31) — Execute in corso

---

## Obiettivo

Configurare **nome/cognome** di uno o più **proprietari** e opzionalmente un **affittuario** per ogni immobile. Durante l'**import documento amministratore**:

1. Filtrare automaticamente le righe estratte che corrispondono ai nominativi (match fuzzy).
2. Con più proprietari: unione righe (OR). Con affittuario: **somma** importi e rate allineate per periodo.
3. Mostrare un **resoconto** (saldi precedenti, totali esercizio precedente, nuovo preventivo/consuntivo, distribuzione rate) editabile.
4. Dopo **conferma**, persistere su `fiscal_periods`, `dues`, `split_amounts` come oggi.

**Compatibilità**: case senza nominativi → flusso attuale (tabella completa + scelta manuale).

---

## User stories (sintesi)

| ID | Titolo |
|----|--------|
| US-001 | Configurare uno o più proprietari (nome/cognome) in impostazioni casa |
| US-002 | Configurare affittuario opzionale |
| US-003 | Persistenza Supabase + RLS |
| US-004 | Match fuzzy nominativo ↔ riga estratta |
| US-005 | Multi-proprietario (OR) |
| US-006 | Somma proprietario + affittuario (totali e rate) |
| US-007 | Resoconto strutturato HITL |
| US-008 | Conferma → dovuti/esercizio |
| US-009 | Nessun match / parziale / override manuale |
| US-010 | Omonimia / più righe stesso nome |
| US-011 | Fallback senza anagrafica |
| US-012 | Tracciabilità in description/import |

Criteri di accettazione dettagliati: `round-1-requirements-planner.md` (agente RP).

---

## Decisioni architetturali

| Decisione | Scelta |
|-----------|--------|
| Persistenza anagrafica | `houses.import_parties` JSONB: `[{ role: 'owner' \| 'tenant', firstName, lastName }]` |
| Matching | Client (`js/document-import-match.js`); normalizzazione accenti/spazi; soglia fuzzy conservativa |
| Aggregazione | OR proprietari; somma proprietario+affittuario con merge rate per `periodStart` |
| Resoconto | `js/document-import-resoconto.js` + step UI; estensione schema estrazione AI (`summary`) |
| Commit | Riuso `buildDuesFromPreview`, `confirmDocumentImport`, `document_imports` |
| Backup | `JSON_SCHEMA_VERSION` → 4 con `importParties` |

---

## Task di implementazione (ordine)

1. **T-001** Migration `import_parties` su `houses`
2. **T-003–T-006** State, API, UI form casa, backup v4
3. **T-007–T-008** Match + integrazione post-estrazione
4. **T-009** Estensione Edge Function / schema estrazione (`summary`)
5. **T-010–T-014** Resoconto UI + mapping + anteprima legacy
6. **T-013** Flusso commit con gate resoconto
7. **T-015–T-016** Docs + verifica manuale

Dettaglio file e rischi: `round-1-task-architect.md`.

---

## Decisioni operatore (HITL)

| # | Domanda | Risposta |
|---|---------|----------|
| 1 | Campo unità/interno | **No** — fuori scope MVP |
| 2 | Campioni documento | **JPEG nella stessa cartella** del progetto (non PDF); usare per allineare estrazione saldi/esercizio precedente |
| 3 | Carryover | **Automatico** se confermato nel resoconto |
| 4 | Soglia fuzzy | Default council: **0,88** preselect, **0,70** warning (non modificato) |

---

## Fuori scope (MVP)

- Tabella figlia `house_parties` / multi-utente stessa casa
- Invio nominativi all'AI prima dell'upload
- Modifiche import Intesa
- Test automatizzati (verifica manuale in Verify)

---

## Verifica manuale prevista (post-Execute)

- [ ] Salva nominativi su casa → reload → persistiti
- [ ] Import PDF con nominativi → solo righe pertinenti / resoconto
- [ ] Affittuario+proprietario → somma rate e totali
- [ ] Conferma resoconto → dovuti in Movimenti/Situazione
- [ ] Casa senza nominativi → flusso invariato

---

## Approvazione richiesta

Rispondi in chat:

- **approve** — avvia Execute (implementazione)
- **revise: …** — modifiche al piano
- **stop** — interrompi il council
