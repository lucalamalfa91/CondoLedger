# Config snapshot — fix-dati-riepilogo-situazione-import

> Snapshot congelato al lancio (audit/reproducibility). Il `topic` è stato **sovrascritto** rispetto a `council/config.md` per riflettere la richiesta esplicita dell'operatore via `/council-launch` (task focalizzato di bug-fix, non la review UX broad in config).

```yaml
pattern: plan-execute-verify
protocol: deliberative-voting
topic: "Verifica e fix: dati non visibili nella schermata Riepilogo e nel tab Situazione (sezione Movimenti), e revisione/razionalizzazione della sezione Dati/Import-Export. Verificare le segnalazioni dell'operatore e produrre un piano di fix."
topic_slug: fix-dati-riepilogo-situazione-import
max_rounds: 4
output_style: detailed
output_template: plan-and-verification
output_file: Sessions/fix-dati-riepilogo-situazione-import/plan-and-verification.md
devils_advocate: true
launch_date: 2026-05-31
agents:
  - slug: requirements-planner
    role: Requirements Planner
  - slug: task-architect
    role: Task Architect
  - slug: fullstack-implementer
    role: Full-Stack Implementer
  - slug: quality-verifier
    role: Quality Verifier
```

## Nota di override

- `council/config.md` topic originale: "Verifica finale completa UX/UI, mobile, processi e roadmap prodotto…" (sessione `verifica-finale-ux-prodotto`, già esistente).
- Questo lancio usa lo stesso pattern/agenti/protocollo ma topic focalizzato sul bug-fix richiesto.
