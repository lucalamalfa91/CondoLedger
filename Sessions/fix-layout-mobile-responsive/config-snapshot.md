---
pattern: plan-execute-verify
protocol: deliberative-voting
topic: "Fix layout mobile responsive — il layout si vede solo per 3/4 su iPhone 15 (overflow orizzontale); deve adattarsi a qualsiasi schermo senza scroll orizzontale né contenuti tagliati."
max_rounds: 4
output_style: detailed
devils_advocate: true
setup_date: 2026-05-31
session_slug: fix-layout-mobile-responsive
parent_session: verifica-finale-ux-prodotto
agents:
  - slug: requirements-planner
    role: Requirements Planner
  - slug: task-architect
    role: Task Architect
  - slug: fullstack-implementer
    role: Full-Stack Implementer
  - slug: quality-verifier
    role: Quality Verifier
---

# Config snapshot — Fix layout mobile responsive

Snapshot congelato per audit/riproducibilità. Derivato da `council/config.md` (pattern Plan/Execute/Verify, protocol deliberative-voting, devils_advocate=true), con topic ristretto alla richiesta operatore specifica (fix overflow mobile iPhone 15).

- Execute phase: **modifiche al codice consentite** dopo approvazione `plan.md` (gate umano).
- Output finale: `Sessions/fix-layout-mobile-responsive/plan-and-verification.md`.
