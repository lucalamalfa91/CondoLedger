# Council Output (post Devil's Advocate) — Plan and Verification

**Topic**: Fix layout mobile responsive — su iPhone 15 il layout si vede solo per 3/4 (overflow orizzontale); deve adattarsi a qualsiasi schermo senza scroll orizzontale né contenuti tagliati.
**Date**: 2026-05-31 · **Pattern**: Plan / Execute / Verify
**Session**: fix-layout-mobile-responsive
**Base**: `plan-and-verification.md` (invariato) · **Review**: `devils-advocate-review.md`
**Emendamenti**: verdetto (APPROVE → APPROVE condizionato), §Verification (chiarimento metrica clip vs geometria), §Risks (clip/ellissi), §Next steps (prerequisiti sign-off)

---

## A. Executive summary (emendato)

Il "3/4 di layout" su iPhone 15 era **overflow orizzontale di pagina**. Sono state applicate 5 correzioni CSS additive e reversibili in `css/app.css`. Sulle viste testate (Panoramica, Dovuti, Versamenti, Import, Situazione, Impostazioni) **non c'è più overflow orizzontale di pagina**, con evidenza **geometrica** (scan `getBoundingClientRect`, immune al meccanismo di clip) oltre a `scrollWidth=clientWidth`; il desktop a 1440×900 è invariato.

**Verdetto rivisto: APPROVE condizionato.** Il fix risolve il sintomo specifico nelle condizioni testate, ma il **sign-off finale** richiede i controlli al §Next steps (dati densi, Safari iOS reale, stati overlay, larghezze 360/1280). Motivo della revisione: la review DA ha evidenziato che 16/30 AC erano PARTIAL/NOT-TESTED e che la campagna è avvenuta su casa senza dati e in sola emulazione Chrome.

## B. Approved plan / Execution

Invariati rispetto a `plan-and-verification.md`: T-001 rete globale, T-002 header, T-003 catena contenuto, T-004 wrapping testo, T-005 audit (nessun gap). Modifiche confermate via `git diff` (+14/-9, solo `css/app.css`), additive e reversibili.

## C. Verification results (emendato)

**Evidenza primaria = geometrica.** La prova di "nessun overflow di pagina" è lo scan degli elementi con `getBoundingClientRect().right > innerWidth+1`: su tutte le viste testate a 393×852 nessun elemento eccede a livello pagina (unico eccedente `.sub-nav-btn`, dentro `.sub-nav{overflow-x:auto}` → scroll interno **preesistente**, non introdotto dal fix). Questa metrica è **immune** all'eventuale mascheramento di `overflow-x:clip`; `scrollWidth - clientWidth = 0` la corrobora.

| Viewport | Esito |
|----------|-------|
| 393×852 — 6 viste (sessione reale, **dati sparsi**) | offender di pagina = 0 |
| 1440×900 — 4 viste | overflow 0; nav-rail `flex`, bottom-nav `none`, grid `240px 1200px` |

AC matrix (`verification.md`): **PASS 14 · PARTIAL 12 · NOT-TESTED 4 · FAIL 0**. I PARTIAL/NOT-TESTED non sono difetti ma copertura mancante (vedi §Next steps).

**Limiti dichiarati (dalla review DA):** (1) misure su casa senza dati → scenario meno capace di riprodurre il sintomo; (2) nessuna baseline pre-fix con overflow>0; (3) solo emulazione Chrome, mai Safari iOS reale; (4) modali/sheet/drawer/form non aperti; (5) larghezze 360/390/1280 non misurate.

## D. Risks and mitigations (emendato)

- **`overflow-x:clip` può mascherare un overflow reale invece di adattarlo** (rischio "contenuto tagliato silenzioso"). Mitigazione: l'adattamento effettivo è dato da `min-width:0` (T-002/T-003), `max-width:100%` e `overflow-wrap:anywhere` (T-004); il clip è solo rete di sicurezza. La verifica geometrica conferma che, sulle viste testate, non c'è eccedenza mascherata. **Da riconfermare su dati densi.**
- **Ellissi del titolo non confinata a mobile** (`.page-title` taglia con "…" su ogni viewport). Rischio attuale basso (titoli sono stringhe corte fisse: "Panoramica", "Movimenti", …). Mitigazione consigliata: confinare la regola a `@media (max-width:860px)` o confermare che i titoli restino corti.
- **IBAN/`code`**: già spezzati da `word-break:break-all` (`css/app.css:382`) → nessun taglio.
- **Touch-target**: `.row-actions .btn{min-width:44px}` (`:124`) e `.icon-btn{44px}` (`:126`) garantiti da CSS; misura runtime della larghezza ancora da fare (basso rischio).
- Sticky `thead` non rotto (`clip` su `html`, non sui wrapper). Importi restano `nowrap`.

## E. Next steps — prerequisiti per il sign-off finale

**Bloccanti per dichiarare il fix completo:**
1. **Dati densi**: casa con ≥3 dovuti, ≥3 versamenti, import documento + Intesa con righe → ri-misurare offender a 393×852 (baseline before/after se possibile).
2. **Safari iOS reale** su iPhone 15 (non solo emulazione): verificare clip + sticky + backdrop-filter dell'header.
3. **Stati overlay**: aprire e misurare form-sheet, house-drawer, onboarding, confirm, dup-import a 393px.
4. **Larghezze aggiuntive**: 360px (Android), 390×844, e desktop 1280×800 + split-layout a 2 colonne.

**Consigliati (basso rischio):**
5. Confinare l'ellissi `.page-title` a mobile (o confermare titoli corti).
6. Misura runtime larghezza touch-target ≥44×44.

## F. Deliberation trail (aggiornato)

| Fase | Esito |
|------|-------|
| Plan | Planner + Architect → PROPOSE; `plan.md`; **approvato dall'operatore** |
| Execute | Implementer → APPROVE; `execution.md` + diff `css/app.css` |
| Verify | Quality Verifier → APPROVE; `verification.md`; overflow di pagina = 0 (geometria) su viste testate; desktop intatto; 0 FAIL |
| Consensus | Raggiunto (tutti APPROVE) → `plan-and-verification.md` |
| Devil's Advocate | **OBJECT** — 11 challenge; `devils-advocate-review.md` |
| Consolidation | Verdetto rivisto in **APPROVE condizionato**; questo file (originale invariato) |

**Risposta alla review DA:** overclaim corretto — il fix elimina l'overflow di pagina nelle condizioni testate (evidenza geometrica), ma il sign-off finale resta subordinato ai prerequisiti §E. Challenge 10/11 respinte/ridimensionate con evidenza CSS.
