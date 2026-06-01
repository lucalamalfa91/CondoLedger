# Verification — Rendiconti KPI, Situazione e Panoramica

**Vote**: APPROVE (after fix)

---

## AC summary

| US | Result |
|----|--------|
| US-001 Accordion Situazione | PASS (a11y NEEDS-MANUAL) |
| US-002 Totali Situazione | PASS after chip count fix (2+4 max) |
| US-003 Panoramica KPI-only | PASS |
| US-004 Link → Situazione | PASS |
| US-005 Coerenza KPI | NEEDS-MANUAL (browser + reload) |

---

## Fix applied post-verify

- **AC-US002-01**: «Da pagare» sostituisce chip «Stato» nel tier primario (max 2 primari + 4 secondari = 6).
- **Debit styling**: `error` → `negative` su chip saldo consuntivo.

---

## Manual test checklist

1. Panoramica: solo KPI + hero, niente tabelle
2. Filtro esercizio aggiorna KPI
3. Link «Dettaglio» / «Rendiconto completo» → Situazione con esercizio corretto
4. Situazione: sezioni chiuse, totali in header
5. Chip: max 6, primari evidenziati
6. PDF export invariato
7. Reload Supabase aggiorna KPI

---

## Risks accepted (v1)

- Hero compliance usa esercizio corrente; KPI grid segue filtro (se filtro ≠ corrente, numeri possono differire — by design)
- Stato accordion non persistito al re-render
