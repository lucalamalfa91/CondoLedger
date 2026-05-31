---
pattern: plan-execute-verify
protocol: deliberative-voting
topic: "Nome e cognome proprietario (e affittuario) per casa: filtrare righe in import documenti, resoconto estrazione (saldi, esercizio precedente, preventivo/consuntivo, rate) con conferma e persistenza sui dovuti. Supporto multi-proprietario e somma voci proprietario+affittuario."
max_rounds: 4
output_style: standard
devils_advocate: true
setup_date: 2026-05-31
agents:
  - slug: requirements-planner
    role: Requirements Planner
    skill_path: .claude/skills/council-requirements-planner/SKILL.md
    archetype: product-analyst
  - slug: task-architect
    role: Task Architect
    skill_path: .claude/skills/council-task-architect/SKILL.md
    archetype: architect
  - slug: fullstack-implementer
    role: Full-Stack Implementer
    skill_path: .claude/skills/council-fullstack-implementer/SKILL.md
    archetype: custom
  - slug: quality-verifier
    role: Quality Verifier
    skill_path: .claude/skills/council-quality-verifier/SKILL.md
    archetype: qa-strategist
---

# Council configuration (snapshot)

## Scenario

Estendere il modello **casa/immobile** con anagrafica proprietario (nome, cognome; opzionalmente più proprietari e/o affittuario). Durante **import documenti amministratore** (preventivo, consuntivo, elenchi rate):

1. Filtrare automaticamente le righe estratte che corrispondono ai nominativi configurati per la casa selezionata.
2. Se è configurato un affittuario, **sommare** le voci affittuario + proprietario (stessa unità condominiale).
3. Al termine dell'estrazione mostrare un **resoconto** strutturato: saldi precedenti, totali esercizio precedente, nuovo preventivo, nuovo consuntivo, distribuzione rate — con revisione HITL.
4. Dopo **conferma** del resoconto, applicare i valori nei campi/tabelle dovuti corretti (`fiscal_periods`, `dues`, rate).

Pattern esistente da riusare: import Intesa e import preventivo/consuntivo AI (`references/document-import.md`, sessione `import-preventivo-consuntivo-ai`).

## Session slug

`proprietario-case-resoconto-import`
