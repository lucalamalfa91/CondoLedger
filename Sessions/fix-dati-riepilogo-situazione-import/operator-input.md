# Operator Input — fix-dati-riepilogo-situazione-import

**Data**: 2026-05-31
**Lingua deliberazione**: italiano

## Richiesta verbatim dell'operatore

> nella schermata di riepilogo non vedo piu i dati come anche nel tab situazione in movimenti e la sezioni dati import ed export non ha senso in questo momonto, verifica quanto detto e crea un piano per fixare

## Interpretazione (3 segnalazioni distinte)

1. **Schermata "Riepilogo"** — i dati non sono più visibili (regressione: prima si vedevano).
2. **Tab "Situazione" → sezione "Movimenti"** — i dati non sono più visibili (stessa natura della #1?).
3. **Sezione "Dati / Import ed Export"** — "non ha senso in questo momento": da rivedere/razionalizzare (UX/contenuto), non necessariamente un bug.

## Obiettivo

Verificare nel codice se le segnalazioni 1–3 sono reali (riproducibili / confermate da analisi statica), individuarne la causa, e **produrre un piano di fix**. Nessuna modifica al codice in questa fase senza approvazione esplicita dell'operatore (gate sul `plan.md`).

## Pattern / vincoli

- Pattern: Plan / Execute / Verify.
- Execute = solo analisi/diagnosi (code review, eventuale DevTools), **nessuna modifica codice** prima dell'approvazione del piano.
- Deliverable finale: `Sessions/fix-dati-riepilogo-situazione-import/plan-and-verification.md`.
