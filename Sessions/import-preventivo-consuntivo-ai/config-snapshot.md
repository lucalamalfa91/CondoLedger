---
pattern: plan-execute-verify
protocol: deliberative-voting
topic: "Caricamento preventivo/consuntivo condominiale (DOCX, PDF, immagine) con estrazione AI dei dati per creare l'esercizio contabile: anno fiscale, totale, ripartizione rate per persona; elenco costi, millesimi, verifiche ripartizione; fallback manuale e HITL su estrazioni incerte."
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

# Council configuration (snapshot at launch)

## Scenario

Importare il file del preventivo o consuntivo fornito dall'amministratore di condominio (formati: DOCX, PDF, immagine — senza schema fisso) ed estrarre automaticamente via AI i dati necessari per creare l'esercizio contabile nell'app Gestione Spese Condominiali.

**Campi obbligatori da estrarre (MVP):**
- Anno fiscale
- Totale preventivo o consuntivo
- Ripartizione delle rate per una persona specifica dell'elenco condomini

**Campi proposti (analisi esempi + estensione):**
- Elenco dettagliato costi di esercizio che compongono il totale
- Millesimi per condomino
- Verifiche automatiche sulla correttezza della ripartizione

**Principi UX:**
- Privilegiare automazione completa; consentire inserimento manuale quando necessario
- HITL: se dati mancanti o estrazione incerta → richiedere conferma operatore prima di persistere

**File di esempio (operatore):** `C:\Users\luca.la-malfa\Documents\Spese Condiminiali`
