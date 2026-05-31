# Council Output — Plan and Verification

**Topic**: Fix layout mobile responsive — il layout si vede solo per 3/4 su iPhone 15 (overflow orizzontale); deve adattarsi a qualsiasi schermo senza scroll orizzontale né contenuti tagliati.
**Date**: 2026-05-31
**Pattern**: Plan / Execute / Verify (protocol: deliberative-voting)
**Session**: fix-layout-mobile-responsive

---

## Executive summary

Il sintomo "vedo 3/4 di layout sull'iPhone 15" era **overflow orizzontale dell'intera pagina**: pochi punti del CSS non erano "blindati" contro l'espansione orizzontale e mancava una rete di sicurezza globale. Non serviva un redesign — il sistema responsive (bottom-nav, card list, wrapper di scroll) era già presente.

Sono state applicate **5 correzioni CSS additive e reversibili** (solo `css/app.css`). Verifica runtime con Chrome DevTools su sessione autenticata reale (iPhone 15, 393×852): **nessun overflow orizzontale di pagina** su tutte le viste principali (Panoramica, Dovuti, Versamenti, Import, Situazione, Impostazioni) e **nessuna regressione desktop** (1440×900). Verdetto council: **APPROVE** (0 criteri in FAIL).

## Context

- App statica `index.html` + `css/app.css` + moduli ES in `js/` + Supabase. Nessun build step.
- La sessione precedente `verifica-finale-ux-prodotto` aveva marcato il problema (MOB-001, release criterion R1) ma **senza fix**. Questa sessione è il fix reale.
- Dispositivo target: iPhone 15, viewport CSS ~393×852, Safari iOS.

## Approved plan (summary)

CSS-first, additivo, in `css/app.css`:

| Task | Contenuto |
|------|-----------|
| T-001 | Rete di sicurezza globale anti-overflow |
| T-002 | Blindatura header (`min-width:0` + ellissi titolo) |
| T-003 | Blindatura catena contenuto (`min-width:0`) |
| T-004 | Wrapping difensivo testo lungo |
| T-005 | Audit read-only tabelle (fix mirato solo se gap) |
| T-006 | Verifica 393×852 (+390/360) e non-regressione desktop |

Criterio di successo binario: `documentElement.scrollWidth - clientWidth <= 1` e nessun elemento oltre `innerWidth+1` (escluso scroll interno a contenitori dedicati). Piano approvato dall'operatore al gate.

## Execution summary

Modifiche realmente presenti in `css/app.css` (verificate via `git diff`, +14/-9):

- **T-001**: `html, body { max-width:100% }`, `html { overflow-x: clip }`, `img, svg, canvas, video, table, pre, code { max-width:100% }`. Mantenuti `body.authenticated{overflow:hidden}` e `.main{overflow-x:hidden}`.
- **T-002**: `min-width:0` su `.header` e `.topbar-left`; `.header-titles .page-title` ora `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`.
- **T-003**: `min-width:0` su `.view`, `.subview`, `.situazione-sections`, `.situazione-section`.
- **T-004**: `overflow-wrap:anywhere` su `td`, `.muted/.subtle/.hint`, `.data-card-title`, `.data-card-meta` (esclusi `.data-card-amount`/`.metric-value`).
- **T-005 audit**: nessun gap — tutte le tabelle live sono in `.data-table-wrap`/card list; `panel-table-wrap` è `display:none` su mobile; nessun `style=` con width fissa/`100vw`.

Nessuna modifica a `index.html`, `js/`, schema, RLS o auth. Dettaglio in `execution.md`.

## Verification results

Verdetto Quality Verifier: **APPROVE** — AC matrix: **PASS 14 · PARTIAL 12 · NOT-TESTED 4 · FAIL 0** (`verification.md`).

Evidenza runtime (Chrome DevTools, sessione autenticata reale, 2 case):

| Viewport | Vista | `scrollWidth - clientWidth` | Esito |
|----------|-------|------------------------------|-------|
| 393×852 | Panoramica | 0 | PASS |
| 393×852 | Movimenti/Dovuti | 0 | PASS |
| 393×852 | Movimenti/Versamenti | 0 | PASS |
| 393×852 | Movimenti/Import | 0 | PASS |
| 393×852 | Situazione | 0 | PASS |
| 393×852 | Impostazioni | 0 | PASS |
| 1440×900 | tutte | 0; nav-rail `flex`, bottom-nav `none`, grid `240px 1200px` | PASS (no regressione) |

L'unico elemento che eccede a 393px è `.sub-nav-btn`, ma scorre **internamente** a `.sub-nav { overflow-x:auto }` → comportamento voluto, non overflow di pagina.

## Deviations and resolutions

- `.status` non modificata da T-004: già `max-width:220px` + ellissi `nowrap` (no-op, non causa overflow). Applicato invece a `.muted/.subtle/.hint`. Risolto: nessun impatto.
- `.topbar-left` gestita come regola separata per non toccare `.brand`. Risolto: equivalente al piano.

## Recommendation

**Accettare il fix.** Risolve in modo verificato il problema operatore (layout adatta allo schermo su iPhone 15, niente 3/4) senza regressioni desktop e con modifiche minime e reversibili. Consigliato eseguire i follow-up QA sotto prima del rilascio finale per copertura completa.

## Risks and mitigations

- `overflow-x:clip` su `html` → non rompe `position:sticky` (lo sticky `thead` vive in `.data-table-wrap{overflow:auto}`, non su `html`). Verificato desktop intatto.
- `min-width:0` solo su item-contenitore della catena layout → nessun collasso di larghezze intenzionali (bottoni/chip non toccati).
- `overflow-wrap:anywhere` limitato a testo → importi/numeri restano `white-space:nowrap`.
- Tutte le modifiche additive e facilmente revertibili (singolo file CSS).

## Open questions

- OQ residue chiuse dal coordinatore: card list dove già presente + scroll interno per tabelle dense; scope `css/app.css`; non-regressione desktop via misura overflow (no gate screenshot-diff).
- Da confermare in QA esteso: comportamento con dataset densi reali; larghezza touch-target effettiva; wrap IBAN in `guide-copy-row code`.

## Next steps

Follow-up QA raccomandati (non bloccanti):
1. Ri-misurare con casa popolata (≥3 dovuti, ≥3 versamenti, import con righe) per provare lo scroll interno delle tabelle dense.
2. Aprire e misurare ogni modale/sheet/drawer (form-sheet, house-drawer, onboarding, confirm, dup import) a 393px.
3. Misurare touch-target ≥44×44 su `.row-actions .btn`, bottom-nav, FAB.
4. Test su 360px (Android) + 390×844 + 1280×800.
5. Verificare wrap IBAN/causale in `guide-copy-row code` (rischio basso).

## Deliberation trail

| Fase | Esito |
|------|-------|
| Plan | Requirements Planner + Task Architect → PROPOSE; sintesi `plan.md`; **approvato dall'operatore** al gate |
| Execute | Full-Stack Implementer → APPROVE; `execution.md` + diff `css/app.css` |
| Verify | Quality Verifier → APPROVE; `verification.md`; runtime overflow=0 su tutte le viste mobile + desktop intatto; 0 FAIL |
| Consensus | Raggiunto (tutti APPROVE) → questo output |
| Devil's Advocate | da decidere al checkpoint operatore |

Artefatti: `operator-input.md`, `config-snapshot.md`, `plan.md`, `round-1.md`, `round-1-requirements-planner.md`, `round-1-task-architect.md`, `round-2.md`, `execution.md`, `verification.md`, `plan-and-verification.md`.
