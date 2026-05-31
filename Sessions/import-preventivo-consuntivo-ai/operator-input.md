# Operator input — launch 2026-05-31

## Obiettivo

Caricare il file del preventivo o consuntivo condominiale fornitomi dall'amministratore (DOCX, PDF o immagine, senza formato standard fisso).

Tramite AI, estrarre automaticamente tutti i dati necessari per creare l'esercizio contabile, popolando:

1. **Anno fiscale**
2. **Totale preventivo o consuntivo**
3. **Ripartizione delle rate** per una persona specifica dell'elenco

## Esempi (inventario sottocartelle)

Base: `C:\Users\luca.la-malfa\Documents\Spese Condiminiali`

### Il Parco

| Esercizio | File | Tipo |
|-----------|------|------|
| 2024-2025 | Bilancio dettagliato per conto 2024_25 post assemblea.pdf | PDF |
| 2024-2025 | Consuntivo ripartizioni per anagrafica 2024_25 pos assemblea.pdf | PDF |
| 2025-2026 | 09_06_2026 Convocazione e bilancio.pdf | PDF (multi-sezione) |
| 2025-2026 | Preventivo ripartizioni per anagrafica 2025_26.pdf | PDF |

### Via Anzani

| Esercizio | File | Tipo |
|-----------|------|------|
| 2024-2025 | IMG_3054.JPEG … IMG_3080.JPEG (27 pagine) | Scansione multi-immagine |
| 2025-2026 | IMG_3082.JPEG … IMG_3096.JPEG (15 pagine) | Scansione multi-immagine |

## Decisioni operatore (revise 2026-05-31)

1. **Documenti**: presenti nelle subfolder sopra; usarli come golden set in Execute/Verify.
2. **Identificazione unità**: **non** chiedere nome/cognome prima dell'estrazione. Estrarre tutto; HITL **conversazionale** in anteprima (operatore sceglie la riga giusta nel contesto).
3. **Rate**: ripartizione **identica al documento** (importi e scadenze), mai approssimazione equa.
4. **Privacy**: nessun vincolo aggiuntivo.
5. **Preventivo + consuntivo**: decidere in fase design la UX più semplice (un solo flusso, minima confusione nel portale).
6. **Duplicati**: se rilevato import già effettuato → **avviso** e scelta operatore (non azione automatica).

## Estensioni proposte dall'operatore

- Elenco dettagliato costi di esercizio verso il totale da ripartire
- Millesimi per condomino
- Verifiche automatiche correttezza ripartizione

## Vincoli

- Inserimento manuale sempre possibile come fallback
- Automazione completa come default
- HITL quando dati mancanti o estrazione non affidabile
