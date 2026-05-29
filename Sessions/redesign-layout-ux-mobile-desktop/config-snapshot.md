---
pattern: plan-execute-verify
protocol: deliberative-voting
topic: "Redesign UX/UI completo: menu rivisto, accorpamento intelligente delle funzionalità, layout fluido desktop e mobile, ispirato a best practice di grandi UX designer."
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
