# KPI Spec — Panoramica condominiale

## Scope

KPI per singolo immobile / esercizio focus. Fonte: dati già in `fiscal.js`, `situazione-report.js`, `compliance-status.js`, `installments.js`.

## KPI set

| ID | Label IT | Formula | Tone | Mostra se |
|----|----------|---------|------|-----------|
| saldo-consuntivo | Saldo consuntivo | `periodSummary.balanceConsuntivo` | positive/negative/success | sempre |
| da-pagare | Da pagare | `totalToPayConsuntivo` o `totalToPayPreventivo` o `max(0, -balance)` | negative/warn | importo > 0.005 |
| copertura | Copertura pagamenti | `min(100, paid/totalToPay*100)` | positive/warn | totalToPay > 0 |
| prossima-rata | Prossima rata | slot upcoming[0] label + gap | warn | gap > 0 |
| rate-scadute | Rate scadute | count overdue slots | negative | count > 0 |
| scostamento | Scostamento consuntivo | consuntivo − preventivo | neutral | entrambi > 0 |
| esercizi-debito | Esercizi in debito | `totals.debtYears` | negative | > 0 |
| credito | Credito consuntivo | balance se > 0 | positive | balance > 0.005 |

## Fallback «Da pagare»

1. Se consuntivo presente e `totalToPayConsuntivo` → usa quello (+ hint saldo precedente)
2. Altrimenti se preventivo e `totalToPayPreventivo` → usa quello
3. Altrimenti se saldo consuntivo negativo → `abs(saldo)`

## Coerenza

Stesso `periodId` scope di `computeComplianceStatus` quando filtro = «Tutti»; altrimenti periodo selezionato in `#periodFilter`.
