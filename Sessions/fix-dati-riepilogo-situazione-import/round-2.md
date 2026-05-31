# Round 2 (revise) — Nuovo scope: layout Movimenti, separazione import, mobile

## Trigger
Risposta operatore al gate Plan: **approve con ampliamento di scope** →
> "verifica anche il layout della sezione movimenti, separi le due tipologie di import documenti e fixa i problemi di visualizzazione, soprattutto da mobile. per il resto procedi"
- Sezione "Dati": **Opzione A** scelta.
- Hardening T-003: **sì**.

## Responses

### Task Architect
**Vote**: PROPOSE
**Reasoning**: Trovato secondo bug critico mobile (import Banca in drawer non apribile). Sub-nav annidata import confusa. Tabelle Situazione/import non collassano in card su mobile.
**Details**: nuovi task T-005 (P1 critico), T-006 (separazione import, opzione A), T-007 (mobile tabelle), T-008 (fallback).

## Coordinator Synthesis

**Verifica diretta**: confermato `css/app.css:231–244` (drawer per `.split-layout--list-first .split-form-pane`, apribile solo con `.form-sheet--open`) e che il pane Banca (`index.html:296-305`) non ha `form-sheet-open-btn` → controlli upload inaccessibili da mobile. Confermato `mobile-cards.js:9` converte in card solo dues/payments/dashboard.

**Consensus**: sì (PROPOSE; nessuna obiezione). L'operatore ha già approvato l'esecuzione ("per il resto procedi").

**Decisioni adottate dal Coordinator**:
- Separazione import: **Opzione A** (subview di primo livello), come raccomandato.
- Sezione "Dati": **Opzione A** (rimozione), come da operatore.
- Hardening **T-003**: incluso.

**Piano aggiornato → fase Execute**. Set di task approvati: T-001, T-002, T-003, T-004 (A), T-005, T-006 (A), T-007. T-008 escluso (si adotta A, non B). Vincolo: non rinominare ID DOM upload/tabelle.
