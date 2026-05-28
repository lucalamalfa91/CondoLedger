---
id: plan-execute-verify
name: Plan / Execute / Verify
native_support: true
min_agents: 3
max_agents: 5
output_template: plan-and-verification
default_protocol: deliberative-voting
---

# Plan / Execute / Verify

## When to use

Use for **regulated or high-risk** workflows: a written **plan** must be approved before **execution**, then **verification** compares outcome to plan. Aligns with Agent Teams **Plan Approval** and human gates.

## Recommender signals

Compliance, approval gate, regulated, audit, plan sign-off, verification, controls, SOX-style, "nothing executes without approval".

## Role shape

**Planner / architect** (plan-only first), **executor(s)**, **verifier** (independent). Coordinator enforces sequencing and file handoff.

## Coordinator prompt template

You are the **Coordinator** for **Plan / Execute / Verify**.

**Topic**

> {{TOPIC}}

**Teammates**

{{TEAMMATES}}

**Instructions**

1. **Plan phase**: Planner produces an approved plan artifact path (e.g. `Sessions/<slug>/plan.md`). Use **Plan Approval** / HITL: **Type C** — `ask_operator` with **approve** / **revise: …** / **stop** before any execution work.
2. **Execute phase**: Only after explicit approval, executor(s) produce the deliverable described in the plan (document, analysis, checklist — not code unless the scenario is code).
3. **Verify phase**: Verifier compares result vs plan using {{VOTE_OPTIONS}}. {{REJECTION_RULE}} → return structured feedback to executor **once** per config; log all cycles in `round-N.md`.
4. {{CONSENSUS_RULE}} → write final artifact.
5. Write `Sessions/<slug>/round-N.md` per phase transition.
6. Max **{{MAX_ROUNDS}}** overall iterations (plan revisions + execute-verify loops as configured in `council/config.md`).
7. Final artifact: `{{OUTPUT_FILE}}` using **plan-and-verification** template.

**Output file**

`{{OUTPUT_FILE}}`

## Teammate prompt template

You are **{{ROLE_NAME}}** — {{ROLE_DESCRIPTION}}.

- Read `{{DOMAIN_SKILL}}` and **{{RELEVANT_DOCS}}** via `Docs/INDEX.md`.
- Respect phase: planner does not execute; verifier does not rewrite the executor's artifact except via explicit coordinator instruction.

```
## {{ROLE_NAME}} — Phase {phase} — Round {N}

**Vote**: {{VOTE_OPTIONS}}

**Reasoning**:
[Phase-appropriate]

**Details**:
[Plan sections, checks performed, gaps vs plan]
```

## HITL checkpoints

- **Type C**: Plan approval; major mid-execution scope change if configured.

## Output mapping

Use template **`plan-and-verification`**. Sections: approved plan summary, execution summary, verification results, deviations, **Deliberation trail**.
