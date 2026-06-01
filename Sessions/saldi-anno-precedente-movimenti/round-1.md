# Round 1 — Saldi anno precedente in Movimenti

## Responses

### Requirements Planner
**Vote**: PROPOSE
**Reasoning**: Nuova entità distinta da dovuti/versamenti; impatto UI, persistenza, Situazione, PDF.
**Details**: 8 user story (US-001–US-008), AC testabili, out of scope e 8 open questions.

### Task Architect
**Vote**: PROPOSE
**Reasoning**: Tabella `prior_balances` separata; non inquinare aggregati dues/payments.
**Details**: 11 task T-001–T-011, migrazione SQL, CRUD, subview Movimenti, box Situazione/PDF, backup v5.

## Coordinator Synthesis

**Consensus**: Yes (entrambi PROPOSE; nessun REJECT/OBJECT)

**Agreements**:
- Entità dedicata `prior_balances`, non mescolata con `dues`/`payments`
- Nuovo tab Movimenti "Saldi precedenti" con CRUD
- Box dedicato in Situazione e PDF (preventivo e consuntivo)
- Un saldo per esercizio/immobile (upsert)
- Riporti esistenti (`carryFromPeriodId`) restano; warning se coesistenza
- Import documento e migrazione automatica fuori scope iniziale

**Outstanding objections**: Nessuna obiezione bloccante; open questions risolte con default proposti nel piano.

**Revised proposal**: Procedere con `plan.md` e gate umano prima dell'Execute.
