/** @typedef {'preventivo'|'consuntivo'} DocumentKind */

/**
 * @typedef {object} ExtractedInstallment
 * @property {string} [label]
 * @property {string} periodStart YYYY-MM-DD
 * @property {string} [periodEnd]
 * @property {number} amount
 */

/**
 * @typedef {object} ExtractedRow
 * @property {string} label
 * @property {string} [unit]
 * @property {number} [millesimi]
 * @property {number} total
 * @property {ExtractedInstallment[]} [installments]
 * @property {number} [confidence]
 */

/**
 * @typedef {object} ExtractedSection
 * @property {DocumentKind} documentKind
 * @property {number} [confidence]
 * @property {number} [totalAmount]
 * @property {ExtractedRow[]} rows
 * @property {{ description: string, amount: number }[]} [costLines]
 */

/**
 * @typedef {object} DocumentExtractionResult
 * @property {string} [fiscalYearLabel]
 * @property {Record<string, number>} [fieldConfidence]
 * @property {string} [extractionNotes]
 * @property {ExtractedSection[]} sections
 */

export const CONFIDENCE_WARN = 0.7;
export const CONFIDENCE_PRESELECT = 0.85;
export const AMOUNT_TOLERANCE = 0.01;

export const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

/** Limite dimensione totale per singolo import (tutti i file sommati). */
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_FILE_BYTES = MAX_IMPORT_BYTES;
export const MAX_BATCH_FILES = 40;

export function normalizeExtraction(raw) {
  if (!raw || typeof raw !== 'object') return emptyExtraction('Risposta non valida');
  const sections = Array.isArray(raw.sections) ? raw.sections.map(normalizeSection).filter(Boolean) : [];
  if (!sections.length && raw.documentKind) {
    sections.push(normalizeSection(raw));
  }
  return {
    fiscalYearLabel: String(raw.fiscalYearLabel || raw.fiscal_year_label || '').trim(),
    fieldConfidence: raw.fieldConfidence || raw.field_confidence || {},
    extractionNotes: String(raw.extractionNotes || raw.extraction_notes || '').trim(),
    sections
  };
}

function normalizeSection(s) {
  if (!s || typeof s !== 'object') return null;
  const kind = s.documentKind === 'consuntivo' ? 'consuntivo' : 'preventivo';
  const rows = Array.isArray(s.rows) ? s.rows.map(normalizeRow).filter(Boolean) : [];
  return {
    documentKind: kind,
    confidence: num(s.confidence, 0.5),
    totalAmount: num(s.totalAmount ?? s.total_amount, null),
    rows,
    costLines: Array.isArray(s.costLines) ? s.costLines.map(c => ({
      description: String(c.description || '').trim(),
      amount: num(c.amount, 0)
    })).filter(c => c.description) : []
  };
}

function normalizeRow(r) {
  if (!r) return null;
  const installments = Array.isArray(r.installments)
    ? r.installments.map(normalizeInstallment).filter(Boolean)
    : [];
  return {
    label: String(r.label || r.name || '—').trim(),
    unit: r.unit ? String(r.unit).trim() : '',
    millesimi: r.millesimi != null ? num(r.millesimi, null) : null,
    total: num(r.total ?? r.amount, 0),
    installments,
    confidence: num(r.confidence, 0.5)
  };
}

function normalizeInstallment(i) {
  if (!i) return null;
  const periodStart = String(i.periodStart || i.period_start || '').slice(0, 10);
  if (!periodStart) return null;
  return {
    label: i.label ? String(i.label).trim() : '',
    periodStart,
    periodEnd: i.periodEnd || i.period_end ? String(i.periodEnd || i.period_end).slice(0, 10) : undefined,
    amount: num(i.amount, 0)
  };
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function emptyExtraction(note = '') {
  return {
    fiscalYearLabel: '',
    fieldConfidence: {},
    extractionNotes: note,
    sections: []
  };
}

export function fieldConfidence(extraction, field) {
  const c = extraction?.fieldConfidence?.[field];
  return Number.isFinite(c) ? c : 0.5;
}
