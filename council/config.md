---
pattern: plan-execute-verify
protocol: deliberative-voting
topic: "Verifica finale completa UX/UI, mobile, processi e roadmap prodotto — rendere l'app molto più facile da usare, chiara e pronta per utenti finali (review spietata in italiano, report strutturato A–G)."
max_rounds: 4
output_style: detailed
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

# Council configuration

## Scenario

Review finale orientata al miglioramento reale del prodotto (non solo estetica). Obiettivo: usabilità, chiarezza, valore per utenti finali.

**Aree obbligatorie:** (1) UX/UI completa, (2) mobile approfondito (priorità assoluta — app attualmente inutilizzabile su mobile), (3) processi e flussi, (4) miglioramento processo di prodotto, (5) future feature, (6) prioritizzazione Critical/High/Medium/Low.

**Deliverable:** `Sessions/verifica-finale-ux-prodotto/analysis-report.md` con sezioni A–G come da brief operatore (`operator-input.md`).

**Execute phase:** solo analisi (browser DevTools, code review UI/CSS/JS) — **nessuna modifica al codice** senza approvazione esplicita post-review.

## Pattern: Plan / Execute / Verify

| Phase | Owner primario | Artifact |
|-------|----------------|----------|
| **Plan** | Requirements Planner + Task Architect | `plan.md` (gate umano prima di Execute) |
| **Execute** | Tutti i teammate (map per area) | `execution.md` + evidenze per area |
| **Verify** | Quality Verifier | `verification.md` |
| **Final** | Coordinator | `analysis-report.md` |
| **Devil's Advocate** | devils-advocate | `devils-advocate-review.md` + eventuale `analysis-report-after-devils-review.md` |

## Session slug

`verifica-finale-ux-prodotto`

## HITL

- Plan approval prima dell'analisi approfondita.
- Devil's Advocate: checkpoint yes/skip (default: yes).

## Launch

`Sessions/verifica-finale-ux-prodotto/`
