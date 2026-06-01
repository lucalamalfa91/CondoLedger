---
pattern: plan-execute-verify
protocol: deliberative-voting
topic: "Sistemare le visualizzazioni sui rendiconti per renderle più chiare e leggibili: nella sezione Situazione rendere a scomparsa (collapse) tutte le tabelle consuntivo/preventivo; chiarire i box con i totali; ricerca di mercato su KPI utili e semplici per dimostrare il pagamento delle spese condominiali; nella Panoramica visualizzare solo KPI (non elenchi), al massimo puntatori alla sezione Situazione, per capire subito la propria situazione."
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

Migliorare **chiarezza e leggibilità** delle visualizzazioni sui rendiconti condominiali:

1. **Situazione**: tabelle consuntivo/preventivo in box a scomparsa (collapse); box totali più chiari e consultabili.
2. **KPI**: ricerca di mercato su indicatori semplici e immediatamente identificabili per lo stato di pagamento delle spese condominiali.
3. **Panoramica**: solo KPI (no elenchi); eventuali link/puntatori verso Situazione per il dettaglio.

Stack: HTML/JS vanilla + Supabase.

## Session slug

`rendiconti-kpi-situazione-panoramica`
