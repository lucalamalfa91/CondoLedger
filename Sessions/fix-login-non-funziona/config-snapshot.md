---
pattern: plan-execute-verify
protocol: deliberative-voting
topic: "Non sta funzionando la login"
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

La **login** dell'applicazione Gestione Spese Condominiali non funziona. Diagnosticare la causa (frontend auth, Supabase session, redirect, configurazione env, RLS, ecc.), definire un piano di fix, implementare la correzione e verificare il flusso end-to-end.

Stack: HTML/JS vanilla + Supabase (`js/auth.js`, `js/api.js`, `index.html`).

## Pattern: Plan / Execute / Verify

| Phase | Owner primario | Artifact |
|-------|----------------|----------|
| **Plan** | Requirements Planner + Task Architect | `plan.md` (gate umano prima di Execute) |
| **Execute** | Full-Stack Implementer | `execution.md` + codice |
| **Verify** | Quality Verifier | `verification.md` |
| **Final** | Coordinator | `plan-and-verification.md` |
| **Devil's Advocate** | devils-advocate | `devils-advocate-review.md` + eventuale `plan-and-verification-after-devils-review.md` |

## Session slug

`fix-login-non-funziona`

## HITL

- Plan approval prima dell'implementazione.
- Devil's Advocate: checkpoint yes/skip (default: yes).

## Launch

`Sessions/fix-login-non-funziona/`
