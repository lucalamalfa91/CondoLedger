# Plan — Verifica finale UX/prodotto

**Sessione:** `verifica-finale-ux-prodotto`  
**Data:** 2026-05-31  
**Pattern:** Plan / Execute / Verify  
**Gate:** approvazione operatore prima di implementazione codice (Execute = solo analisi)

## Obiettivo

Produrre `analysis-report.md` (sezioni A–G, italiano) con review spietata orientata a release per utenti finali. Priorità assoluta: **mobile**.

## Metodo Execute

| Task | Metodo | Output |
|------|--------|--------|
| T-001 | Mappa view da `index.html`, `js/config.js`, `js/main.js` | §D |
| T-002 | Audit CSS breakpoint 520/860/1100 | §B, §C |
| T-003 | DevTools mobile 390×844 (login + ispezione statica autenticata) | §C |
| T-004 | Flussi F-01…F-07 | §D |
| T-005 | IA mobile-first vs `design_bundle` | §C, §E |
| T-006 | Debito TD-01…TD-14 | §B, §C |
| T-007 | Opportunità P-01…P-10 | §E |
| T-008 | Roadmap feature | §F |
| T-009 | Prioritizzazione | §G |

**Vincolo:** nessuna modifica a codice in questa fase.

## Deliverable

- `analysis-report.md` — AC operator-input + sezioni A–G
- `execution.md` — evidenze raccolte
- `verification.md` — post-report (Quality Verifier)

## HITL

- **Plan:** approve / revise / stop
- **Post-report:** Devil's Advocate yes/skip
