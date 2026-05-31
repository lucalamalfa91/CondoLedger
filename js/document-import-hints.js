/**
 * Indizi euristici da nome file / cartella (non sostituiscono l'AI, la guidano).
 * @param {string[]} names nomi file o path segment
 */
export function inferDocumentHints(names) {
  const joined = names.map(n => String(n || '')).join(' ').toLowerCase();
  const hints = {
    suggestedKind: null,
    suggestedFiscalLabel: null,
    sources: []
  };

  if (/\bconsuntiv|\brendicont|\bbilancio\s+(consuntivo|definitivo)|\bconguaglio\b/.test(joined)) {
    hints.suggestedKind = 'consuntivo';
    hints.sources.push('filename:consuntivo');
  } else if (/\bpreventiv|\bripartizioni\s+per\s+anagrafica\b/.test(joined)) {
    hints.suggestedKind = 'preventivo';
    hints.sources.push('filename:preventivo');
  }

  const slash = joined.match(/(\d{4})\s*[/_-]\s*(\d{2,4})/);
  if (slash) {
    const y1 = Number(slash[1]);
    let y2 = Number(slash[2]);
    if (y2 < 100) y2 = Math.floor(y1 / 100) * 100 + y2;
    if (y2 === y1 + 1) {
      hints.suggestedFiscalLabel = `${y1}/${y2}`;
      hints.sources.push('filename:year');
    }
  }

  const esercizio = joined.match(/esercizio[^0-9]*(\d{4})\s*[/_-]\s*(\d{4})/);
  if (esercizio) {
    hints.suggestedFiscalLabel = `${esercizio[1]}/${esercizio[2]}`;
    hints.sources.push('text:esercizio');
  }

  return hints;
}

/** @param {File[]} files */
export function inferDocumentHintsFromFiles(files) {
  return inferDocumentHints((files || []).map(f => `${f.name} ${f.webkitRelativePath || ''}`));
}

/**
 * Applica hint se l'AI non ha valorizzato o ha scelto in modo incoerente col filename.
 * @param {import('./document-import-schema.js').DocumentExtractionResult} extraction
 * @param {ReturnType<inferDocumentHints>} hints
 */
export function applyDocumentHints(extraction, hints) {
  if (!extraction || !hints) return extraction;
  const notes = [];

  if (hints.suggestedFiscalLabel && !extraction.fiscalYearLabel) {
    extraction.fiscalYearLabel = hints.suggestedFiscalLabel;
    notes.push(`Esercizio da nome file: ${hints.suggestedFiscalLabel}`);
  }

  if (hints.suggestedKind && extraction.sections?.length === 1) {
    const only = extraction.sections[0];
    if (only.documentKind !== hints.suggestedKind) {
      notes.push(
        `Attenzione: file sembra ${hints.suggestedKind}, AI ha indicato ${only.documentKind}`
      );
    }
  }

  if (notes.length) {
    extraction.extractionNotes = [extraction.extractionNotes, ...notes].filter(Boolean).join(' · ');
  }

  return extraction;
}

export function formatHintsForPrompt(hints) {
  if (!hints?.sources?.length) return '';
  const lines = ['INDIZI DA NOME FILE/CARTELLA (usa se coerenti col contenuto):'];
  if (hints.suggestedFiscalLabel) lines.push(`- Esercizio probabile: ${hints.suggestedFiscalLabel}`);
  if (hints.suggestedKind) lines.push(`- Tipo documento probabile: ${hints.suggestedKind}`);
  return lines.join('\n');
}
