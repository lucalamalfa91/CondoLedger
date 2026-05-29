# Devil's Advocate Review — Redesign UX/UI

**Session:** `Sessions/redesign-layout-ux-mobile-desktop/`  
**Date:** 2026-05-29  
**Phase 1 artifact reviewed:** `decision.md` + `execution.md` + codebase

---

## Review response

**Vote:** OBJECT (substantive issues — risolti dal coordinator)

**Reasoning:**  
Il redesign IA/shell è solido e allineato al brief operatore, ma la fase Execute ha introdotto una **regressione critica** (backup JSON) e lasciato gap su empty state, touch target e chiusura overlay. Questi punti avrebbero impattato l'utente reale nonostante la narrativa "completato" in execution.md.

---

## Challenges

### Challenge 1: Regressione backup JSON non dichiarata
**Category:** error  
**Reference:** `execution.md` — "Logica API … backup invariata"  
**Issue:** Durante il refactor, l'import di `exportBackup`/`parseBackup` è stato rimosso da `main.js`. Export/import JSON fallisce con `ReferenceError`. Contraddice execution.md e AC backup.

**Resolution:** **Accepted** — ripristinato `import { exportBackup, parseBackup } from './backup.js'`.

---

### Challenge 2: Verifica T-019 assente ma dichiarata "completata"
**Category:** completeness-gap  
**Reference:** `execution.md` — "T-019 da eseguire con login Supabase"  
**Issue:** Nessun smoke browser eseguito; execution.md non distingue chiaramente "implementato" vs "verificato". Rischio false confidence.

**Resolution:** **Accepted** — `verification.md` documenta gap; smoke manuale rimane prerequisito pre-ship.

---

### Challenge 3: Empty state senza percorso d'azione
**Category:** completeness-gap  
**Reference:** US-008 — "empty state con CTA chiare"  
**Issue:** Panoramica senza immobili mostrava solo testo; operatore nuovo bloccato.

**Resolution:** **Accepted** — aggiunto bottone "+ Nuova casa" che apre drawer immobili.

---

### Challenge 4: Menu utente sotto soglia touch 44px
**Category:** error  
**Reference:** AC-US010-02  
**Issue:** `.user-chip` con padding insufficiente.

**Resolution:** **Accepted** — `min-height: 44px` su `.user-chip`.

---

### Challenge 5: Overlay senza dismiss Escape
**Category:** unspecified-element  
**Reference:** Piano T-017 accessibilità  
**Issue:** Sheet FAB e drawer immobili chiudibili solo via backdrop/click; no Escape.

**Resolution:** **Accepted** — listener `Escape` chiude sheet, drawer e menu utente.

---

### Challenge 6: Pattern tab ARIA incompleto
**Category:** vagueness  
**Reference:** AC-US010-04  
**Issue:** Tab senza `aria-controls`, pannelli senza `aria-hidden` esplicito; no keyboard roving.

**Resolution:** **Partially dismissed for v1** — accettabile come debito tecnico; backlog v1.1. Non bloccante ship.

---

### Challenge 7: execution.md sovrastima "completamento"
**Category:** assumption  
**Reference:** "T-001 … T-018 del piano. T-019 … da eseguire"  
**Issue:** Formulazione ambigua — lettore potrebbe credere council chiuso senza verify.

**Resolution:** **Accepted** — decision trail aggiornato con Verify + DA espliciti.

---

## Final assessment post-amendments

Dopo fix coordinator (backup, empty CTA, touch, Escape, verification docs): output **accettabile per ship** con smoke test manuale residuo.

**Coordinator vote post-review:** APPROVE with noted backlog (tab keyboard ARIA).
