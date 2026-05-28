---
pattern: plan-execute-verify
protocol: deliberative-voting
topic: "Council di sviluppo: da input utente a requisiti, scomposizione in task, implementazione nel progetto Gestione Spese Condominiali, review finale e Devil's Advocate."
max_rounds: 4
output_style: standard
devils_advocate: true
setup_date: 2026-05-28
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

Trasformare l'input dell'operatore (feature, bug, miglioramento) in requisiti e user story, scomporre in task tecnici ordinati, implementare nel repository **Gestione Spese Condominiali**, verificare l'esito rispetto al piano, e chiudere con review Devil's Advocate.

## Pattern: Plan / Execute / Verify

| Phase | Owner primario | Artifact |
|-------|----------------|----------|
| **Plan** | Requirements Planner + Task Architect | `Sessions/<slug>/plan.md` (approvazione umana obbligatoria prima di Execute) |
| **Execute** | Full-Stack Implementer | Codice + `Sessions/<slug>/execution.md` |
| **Verify** | Quality Verifier | `Sessions/<slug>/verification.md` |
| **Final** | Coordinator | `Sessions/<slug>/decision.md` (template plan-and-verification) |
| **Devil's Advocate** | devils-advocate (post-deliberation) | `devils-advocate-review.md` + eventuale `decision-after-devils-review.md` |

## Protocol

`deliberative-voting` — voti: PROPOSE | OBJECT | APPROVE | ABSTAIN | REJECT.

## Output template

`plan-and-verification` (standard narrative).

## Session slug convention

Kebab-case, max ~48 caratteri, es. `dev-req-to-impl-condominiali` o derivato dal topic al launch.

## HITL

- **Plan approval** (Type C): approve / revise / stop prima di qualsiasi modifica al codice.
- **Devil's Advocate**: checkpoint inline yes/skip prima della review (default: yes).

## Launch

Invoca `council-launch` con cartella sessione `Sessions/<topic-short-slug>/`.
