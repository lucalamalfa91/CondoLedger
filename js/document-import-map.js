import { parseFiscalLabel } from './fiscal.js';

/**
 * Build due payload(s) from HITL preview for Supabase save.
 * @param {object} preview state.documentImportPreview
 * @param {string} sourceLabel
 */
export function buildDuesFromPreview(preview, sourceLabel, house) {
  const label = (preview.resoconto?.fiscalYearLabel || preview.extraction.fiscalYearLabel || '').trim();
  const dues = [];
  const stamp = `Import: ${sourceLabel} (${new Date().toISOString().slice(0, 10)})`;
  const matchNote = preview.filterMode === 'auto' && preview.resoconto?.matchSummary
    ? ` — ${preview.resoconto.matchSummary}`
    : '';

  for (const { section, row } of activeSectionsFromPreview(preview)) {
    if (!row) continue;
    const kind = section.documentKind;
    const descBase = kind === 'consuntivo' ? 'Consuntivo' : 'Preventivo';
    const due = {
      fiscalPeriodLabel: label,
      amount: row.total,
      description: `${descBase} ${label} — ${row.label}${row.unit ? ` (${row.unit})` : ''} — ${stamp}${matchNote}`,
      dueKind: kind,
      splitMode: 'custom',
      splitCustom: null,
      splitAmounts: null,
      carryFromPeriodId: null
    };
    if (kind === 'preventivo' && row.installments?.length) {
      const sorted = sortInstallments(row.installments);
      due.splitAmounts = sorted.map(inst => ({
        label: inst.label || '',
        periodStart: inst.periodStart,
        periodEnd: inst.periodEnd || null,
        amount: Number(inst.amount)
      }));
      due.splitMode = 'custom';
      const fiscalHouse = house || { fiscalStartMonth: preview.fiscalStartMonth ?? 6 };
      try {
        const spec = parseFiscalLabel(fiscalHouse, label);
        due.splitCustom = sorted.map(inst => {
          const start = new Date(spec.startDate);
          const target = new Date(inst.periodStart);
          const diff = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
          return Math.max(0, Math.min(11, diff));
        });
      } catch {
        due.splitCustom = sorted.map((_, idx) => idx);
      }
    } else if (kind === 'preventivo') {
      due.splitMode = 'monthly';
    }
    dues.push(due);
  }

  const r = preview.resoconto;
  if (r?.applyCarryover && r.carryoverAmount != null && Math.abs(r.carryoverAmount) >= 0.005) {
    const carryDesc = r.carryFromPeriodLabel
      ? `Riporto da esercizio ${r.carryFromPeriodLabel}`
      : 'Riporto saldo precedente';
    dues.push({
      fiscalPeriodLabel: label,
      amount: Number(r.carryoverAmount),
      description: `${carryDesc} — ${stamp}${matchNote}`,
      dueKind: 'preventivo',
      splitMode: 'monthly',
      splitCustom: null,
      splitAmounts: null,
      carryFromPeriodId: r.carryFromPeriodId || null
    });
  }

  return dues;
}

function activeSectionsFromPreview(preview) {
  const out = [];
  const ext = preview.extraction;
  if (!ext?.sections) return out;
  for (const section of ext.sections) {
    const key = section.documentKind;
    if (!preview.confirmedSections?.[key]) continue;
    const rowIdx = preview.selectedRowIndex?.[key] ?? 0;
    const row = section.rows?.[rowIdx];
    out.push({ section, row });
  }
  return out;
}

export function applyRowSelection(preview, documentKind, rowIndex) {
  if (!preview.selectedRowIndex || typeof preview.selectedRowIndex !== 'object') {
    preview.selectedRowIndex = {};
  }
  preview.selectedRowIndex[documentKind] = rowIndex;
  const section = preview.extraction.sections.find(s => s.documentKind === documentKind);
  if (!section?.rows?.[rowIndex]) return;
  const row = section.rows[rowIndex];
  if (section.documentKind === 'preventivo' && row.installments?.length) {
    section._editedTotal = row.total;
  }
}

function sortInstallments(installments) {
  return [...installments].sort((a, b) =>
    String(a.periodStart || '').localeCompare(String(b.periodStart || ''))
  );
}

export function getSelectedRow(preview, kind) {
  const section = preview.extraction.sections.find(s => s.documentKind === kind);
  if (!section) return null;
  const idx = preview.selectedRowIndex?.[kind] ?? 0;
  return section.rows?.[idx] || null;
}

export function initPreviewFromExtraction(extraction, meta) {
  const confirmedSections = {};
  for (const s of extraction.sections || []) {
    confirmedSections[s.documentKind] = extraction.sections.length === 1;
  }
  const selectedRowIndex = {};
  for (const s of extraction.sections || []) {
    const best = (s.rows || []).reduce((bi, r, i) => (r.confidence > (s.rows[bi]?.confidence ?? 0) ? i : bi), 0);
    selectedRowIndex[s.documentKind] = best;
  }
  return {
    extraction,
    sourceLabel: meta.sourceLabel,
    fileHash: meta.fileHash,
    fiscalStartMonth: meta.fiscalStartMonth ?? 6,
    confirmedSections,
    selectedRowIndex,
    lowConfidenceAck: {},
    filterMode: 'manual',
    showAllRows: false,
    resocontoConfirmed: false,
    status: 'review'
  };
}
