import { AMOUNT_TOLERANCE, CONFIDENCE_WARN } from './document-import-schema.js';

export function sumAmounts(items, key = 'amount') {
  return items.reduce((s, x) => s + Number(x[key] || 0), 0);
}

export function amountsClose(a, b, tolerance = AMOUNT_TOLERANCE) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

export function validateInstallmentsVsTotal(installments, total) {
  if (!installments?.length) return { ok: true, warnings: [] };
  const sum = sumAmounts(installments, 'amount');
  if (!amountsClose(sum, total)) {
    return {
      ok: false,
      warnings: [`Somma rate (${sum.toFixed(2)} €) ≠ totale riga (${Number(total).toFixed(2)} €)`]
    };
  }
  return { ok: true, warnings: [] };
}

export function validateSection(section, row) {
  const warnings = [];
  if (!row) warnings.push('Seleziona la riga del documento che ti riguarda.');
  if (row) {
    const inst = validateInstallmentsVsTotal(row.installments, row.total);
    if (!inst.ok) warnings.push(...inst.warnings);
  }
  if (section?.costLines?.length && row) {
    const sumLines = sumAmounts(section.costLines, 'amount');
    if (!amountsClose(sumLines, row.total, 0.05)) {
      warnings.push(`Somma voci di costo (${sumLines.toFixed(2)} €) non coincide con il totale riga.`);
    }
  }
  return warnings;
}

export function collectLowConfidenceIssues(preview) {
  const issues = [];
  const ext = preview?.extraction;
  if (!ext) return issues;
  const fy = ext.fieldConfidence?.fiscalYearLabel;
  if (fy != null && fy < CONFIDENCE_WARN) issues.push('esercizio fiscale');
  for (const section of ext.sections || []) {
    const kind = section.documentKind;
    if (!preview.confirmedSections?.[kind]) continue;
    if (section.confidence != null && section.confidence < CONFIDENCE_WARN) {
      issues.push(`scheda ${kind}`);
    }
    const idx = preview.selectedRowIndex?.[kind] ?? 0;
    const row = section.rows?.[idx];
    if (row?.confidence != null && row.confidence < CONFIDENCE_WARN) {
      issues.push(`riga «${row.label}»`);
    }
  }
  return issues;
}

export function validateCommitPreview(preview) {
  const warnings = [];
  if (!preview?.extraction?.fiscalYearLabel?.trim()) {
    warnings.push('Indica l\'esercizio fiscale (es. 2024/2025).');
  }
  const sections = getActiveSections(preview);
  if (!sections.length) warnings.push('Conferma almeno una scheda Preventivo o Consuntivo.');
  for (const { section, row } of sections) {
    warnings.push(...validateSection(section, row));
  }
  return warnings;
}

export function getActiveSections(preview) {
  const out = [];
  const ext = preview?.extraction;
  if (!ext?.sections?.length) return out;
  for (let i = 0; i < ext.sections.length; i++) {
    const section = ext.sections[i];
    const key = section.documentKind;
    if (!preview.confirmedSections?.[key]) continue;
    const rowIdx = preview.selectedRowIndex?.[key] ?? preview.selectedRowIndex ?? 0;
    const row = section.rows?.[rowIdx] || section.rows?.[0];
    out.push({ section, row, sectionIndex: i });
  }
  return out;
}
