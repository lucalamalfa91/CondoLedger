---
pattern: plan-execute-verify
protocol: deliberative-voting
topic: "Nella sezione movimenti aggiungi una sezione per i saldi dell'anno precedente. Questi dovranno essere gestiti a parte, non come dovuti o come versamenti; anche nella situazione di riepilogo e nel PDF deve comparire un box dedicato ai saldi precedenti."
max_rounds: 4
output_style: standard
devils_advocate: true
setup_date: 2026-06-01
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

Aggiungere nella sezione **Movimenti** una gestione dedicata ai **saldi dell'anno precedente**, separata da dovuti e versamenti. I saldi precedenti devono comparire anche nella **situazione di riepilogo** e nel **PDF export** con un box dedicato.

Stack: HTML/JS vanilla + Supabase.

## Pattern: Plan / Execute / Verify

| Phase | Owner primario | Artifact |
|-------|----------------|----------|
| **Plan** | Requirements Planner + Task Architect | `plan.md` (gate umano prima di Execute) |
| **Execute** | Full-Stack Implementer | `execution.md` + codice |
| **Verify** | Quality Verifier | `verification.md` |
| **Final** | Coordinator | `plan-and-verification.md` |
| **Devil's Advocate** | devils-advocate | `devils-advocate-review.md` + eventuale `plan-and-verification-after-devils-review.md` |

## Session slug

`saldi-anno-precedente-movimenti`

## HITL

- Plan approval prima dell'implementazione.
- Devil's Advocate: checkpoint yes/skip (default: yes).

## Launch

`Sessions/saldi-anno-precedente-movimenti/`
