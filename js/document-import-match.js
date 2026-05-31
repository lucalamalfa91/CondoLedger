import {
  normalizePartyName,
  partyDisplayName,
  PARTY_MATCH_PRESELECT,
  PARTY_MATCH_WARN
} from './house-import-parties.js';

/** Rimuove interno, (PR)/(IN) e prefissi numerici dal testo riga documento. */
export function sanitizeRowLabel(label) {
  return String(label ?? '')
    .replace(/^\d+\s*[-–—]?\s*/g, '')
    .replace(/\(\s*[^)]+\s*\)\s*/gi, ' ')
    .replace(/^#\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Interno/unità da prefisso numerico (es. "111 - (PR) ..."). */
export function rowUnitKey(label) {
  const m = String(label ?? '').match(/^(\d+)\s*[-–—]/);
  return m ? m[1] : '';
}

function isSubEntryLabel(label) {
  return /#\s/.test(String(label ?? ''));
}

/** Spezza righe combinate tipo "La Malfa Luca / Andreazza". */
export function expandLabelVariants(label) {
  const cleaned = sanitizeRowLabel(label);
  if (!cleaned) return [];
  const parts = cleaned.split('/').map(p => sanitizeRowLabel(p)).filter(Boolean);
  return [...new Set([cleaned, ...parts])];
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function fuzzyTokenMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  // Nomi simili ma distinti (es. Giulio ≠ Giulia)
  if (a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1) {
    if (levenshtein(a, b) <= 1) return true;
  }
  return false;
}

/** Cognome del nominativo configurato (ultimo token se ≥2 parole). */
function partySurname(partyNorm) {
  const t = partyNorm.split(' ').filter(Boolean);
  return t.length >= 2 ? t[t.length - 1] : '';
}

function tokenSet(name) {
  const n = normalizePartyName(name);
  return n ? n.split(' ').filter(Boolean) : [];
}

function partyNameVariants(party) {
  const variants = new Set();
  const fn = normalizePartyName(party.firstName);
  const ln = normalizePartyName(party.lastName);
  const full = normalizePartyName(partyDisplayName(party));
  if (full) variants.add(full);
  if (fn && ln) {
    variants.add(`${fn} ${ln}`);
    variants.add(`${ln} ${fn}`);
    variants.add(ln);
  } else if (ln) {
    variants.add(ln);
  } else if (fn) {
    variants.add(fn);
  }
  return [...variants];
}

function scoreNormalizedPair(labelNorm, partyNorm) {
  if (!labelNorm || !partyNorm) return 0;
  if (labelNorm === partyNorm) return 1;
  if (labelNorm.includes(partyNorm) || partyNorm.includes(labelNorm)) return 0.95;

  const lt = labelNorm.split(' ').filter(Boolean);
  const pt = partyNorm.split(' ').filter(Boolean);
  if (!lt.length || !pt.length) return 0;

  const surname = pt.length >= 2 ? pt[pt.length - 1] : '';
  if (surname) {
    const surnameHit = lt.some(t => fuzzyTokenMatch(t, surname));
    if (!surnameHit) return 0;
  }

  let matched = 0;
  for (const p of pt) {
    if (lt.some(t => fuzzyTokenMatch(t, p))) matched += 1;
  }
  const coverage = matched / pt.length;
  const union = new Set([...lt, ...pt]).size;
  let inter = 0;
  for (const p of pt) if (lt.some(t => fuzzyTokenMatch(t, p))) inter += 1;
  const jaccard = union ? inter / union : 0;

  return Math.max(coverage * 0.95, jaccard);
}

/** Score 0–1 tra label riga e nominativo. */
export function scoreRowToParty(rowLabel, party) {
  let best = 0;
  for (const variant of expandLabelVariants(rowLabel)) {
    const labelNorm = normalizePartyName(variant);
    for (const partyNorm of partyNameVariants(party)) {
      best = Math.max(best, scoreNormalizedPair(labelNorm, partyNorm));
    }
  }
  return best;
}

function rowsSameCondomino(labelA, labelB) {
  const unitA = rowUnitKey(labelA);
  const unitB = rowUnitKey(labelB);
  if (unitA && unitB && unitA !== unitB) return false;

  const variantsA = expandLabelVariants(labelA).map(normalizePartyName);
  const variantsB = expandLabelVariants(labelB).map(normalizePartyName);
  for (const va of variantsA) {
    for (const vb of variantsB) {
      if (!va || !vb) continue;
      if (va === vb) return true;
      if (va.includes(vb) || vb.includes(va)) return true;
      const ta = va.split(' ').filter(Boolean);
      const tb = vb.split(' ').filter(Boolean);
      if (ta.length === tb.length && ta.every((t, i) => fuzzyTokenMatch(t, tb[i]))) return true;
    }
  }
  return false;
}

/** Stessa riga ripetuta su più pagine JPEG: unisci, non sommare. */
function mergeDuplicateCondominoRows(picked) {
  if (!picked.length) return null;
  return picked.reduce((best, row) => pickRicherRow(best, row));
}

/** Esclude sotto-righe "# Altro nominativo" sullo stesso interno se c'è già una riga principale. */
function filterOwnerMatches(ownerMatches, rows, tenantMatches) {
  const tenantIdx = new Set(tenantMatches.map(m => m.rowIndex));
  const byUnit = new Map();
  for (const m of ownerMatches) {
    const label = rows[m.rowIndex]?.label;
    const unit = rowUnitKey(label);
    if (!unit) continue;
    if (!byUnit.has(unit)) byUnit.set(unit, []);
    byUnit.get(unit).push(m);
  }
  const dropIdx = new Set();
  for (const ms of byUnit.values()) {
    const primary = ms.filter(m => !isSubEntryLabel(rows[m.rowIndex]?.label));
    const sub = ms.filter(m => isSubEntryLabel(rows[m.rowIndex]?.label));
    if (!primary.length || !sub.length) continue;
    for (const m of sub) {
      if (!tenantIdx.has(m.rowIndex)) dropIdx.add(m.rowIndex);
    }
  }
  return ownerMatches.filter(m => !dropIdx.has(m.rowIndex));
}

/**
 * Più pagine JPEG ripetono lo stesso condomino: tieni la riga più completa.
 * @param {object[]} rows
 */
export function dedupeExtractedRows(rows) {
  const out = [];
  for (const row of rows || []) {
    const idx = out.findIndex(prev => rowsSameCondomino(prev.label, row.label));
    if (idx < 0) {
      out.push(row);
      continue;
    }
    out[idx] = pickRicherRow(out[idx], row);
  }
  return out;
}

function rowQualityScore(row) {
  let score = 0;
  const inst = row.installments?.length || 0;
  score += inst * 100;
  const total = effectivePreventivoTotal(row);
  if (inst && row.installments) {
    const sum = row.installments.reduce((s, i) => s + Number(i.amount || 0), 0);
    if (Math.abs(sum - total) <= 1.5) score += 80;
    else if (Math.abs(sum - total) <= 50) score += 20;
  }
  if (row.saldoPrecedente != null) score += 15;
  if (row.totaleDaVersare != null) score += 10;
  score += total / 10000;
  return score;
}

/** Totale preventivo (escluso saldo precedente). */
export function effectivePreventivoTotal(row) {
  if (!row) return 0;
  const explicit = row.preventivoAmount ?? row.preventivo_amount;
  if (explicit != null && Number(explicit) > 0) return Number(explicit);
  const total = Number(row.total ?? row.amount ?? 0);
  const tdv = row.totaleDaVersare != null ? Number(row.totaleDaVersare) : null;
  const saldo = row.saldoPrecedente != null ? Number(row.saldoPrecedente) : null;
  if (tdv != null && saldo != null && Math.abs(total - tdv) < 1.5) {
    return Math.round((tdv - saldo) * 100) / 100;
  }
  return total || 0;
}

function pickRicherRow(a, b) {
  return rowQualityScore(a) >= rowQualityScore(b) ? a : b;
}

/**
 * @param {object[]} rows
 * @param {import('./house-import-parties.js').ImportParty[]} parties
 */
export function matchRowsToParties(rows, parties) {
  const matches = [];
  const owners = parties.filter(p => p.role === 'owner');
  const tenants = parties.filter(p => p.role === 'tenant');

  rows.forEach((row, rowIndex) => {
    parties.forEach((party, partyIndex) => {
      const score = scoreRowToParty(row.label, party);
      if (score >= PARTY_MATCH_WARN) {
        matches.push({
          rowIndex,
          partyIndex,
          party,
          score,
          role: party.role
        });
      }
    });
  });

  const ownerMatches = matches.filter(m => m.role === 'owner');
  const tenantMatches = matches.filter(m => m.role === 'tenant');

  return {
    matches,
    ownerMatches,
    tenantMatches,
    owners,
    tenants,
    hasOwner: ownerMatches.length > 0,
    hasTenant: tenantMatches.length > 0 && tenants.length > 0
  };
}

function mergeInstallments(lists) {
  const byStart = new Map();
  for (const list of lists) {
    for (const inst of list || []) {
      const key = inst.periodStart || inst.label || '';
      if (!key) continue;
      const prev = byStart.get(key);
      if (prev) {
        prev.amount = Number(prev.amount) + Number(inst.amount || 0);
        if (!prev.label && inst.label) prev.label = inst.label;
      } else {
        byStart.set(key, {
          label: inst.label || '',
          periodStart: inst.periodStart,
          periodEnd: inst.periodEnd || null,
          amount: Number(inst.amount || 0)
        });
      }
    }
  }
  return [...byStart.values()].sort((a, b) =>
    String(a.periodStart).localeCompare(String(b.periodStart))
  );
}

/** @param {object[]} rows @param {number[]} indices */
export function aggregateMatchedRows(rows, indices, meta = {}) {
  const uniqueIndices = [...new Set(indices)];
  const picked = uniqueIndices.map(i => rows[i]).filter(Boolean);
  if (!picked.length) return null;
  if (picked.length === 1) {
    return normalizeAggregatedRow({
      ...picked[0],
      label: meta.label || picked[0].label,
      confidence: Math.max(...picked.map(r => r.confidence ?? 0.5))
    });
  }
  const allSamePerson = picked.every(r => rowsSameCondomino(r.label, picked[0].label));
  if (allSamePerson) {
    const best = mergeDuplicateCondominoRows(picked);
    return normalizeAggregatedRow({
      ...best,
      label: meta.label || best.label,
      confidence: Math.max(...picked.map(r => r.confidence ?? 0.5)),
      _aggregatedFrom: picked.map(r => r.label)
    });
  }
  const labels = picked.map(r => r.label).join(' + ');
  const total = picked.reduce((s, r) => s + effectivePreventivoTotal(r), 0);
  const installments = mergeInstallments(picked.map(r => r.installments));
  return normalizeAggregatedRow({
    label: meta.label || labels,
    unit: picked.map(r => r.unit).filter(Boolean).join(' / ') || '',
    millesimi: picked[0].millesimi,
    total,
    preventivoAmount: total,
    installments,
    confidence: Math.min(...picked.map(r => r.confidence ?? 0.5)),
    _aggregatedFrom: picked.map(r => r.label)
  });
}

function sumNullable(a, b) {
  const na = a != null ? Number(a) : null;
  const nb = b != null ? Number(b) : null;
  if (na == null && nb == null) return null;
  return (na ?? 0) + (nb ?? 0);
}

function buildOwnerTenantSynthetic(ownerAgg, tenantAgg) {
  return normalizeAggregatedRow({
    label: `${ownerAgg.label} + ${tenantAgg.label}`,
    unit: [ownerAgg.unit, tenantAgg.unit].filter(Boolean).join(' / ') || '',
    millesimi: ownerAgg.millesimi,
    total: Number(ownerAgg.total) + Number(tenantAgg.total),
    preventivoAmount:
      Number(ownerAgg.preventivoAmount ?? ownerAgg.total) +
      Number(tenantAgg.preventivoAmount ?? tenantAgg.total),
    saldoPrecedente: sumNullable(ownerAgg.saldoPrecedente, tenantAgg.saldoPrecedente),
    totaleDaVersare: sumNullable(ownerAgg.totaleDaVersare, tenantAgg.totaleDaVersare),
    installments: mergeInstallments([ownerAgg.installments, tenantAgg.installments]),
    confidence: Math.min(ownerAgg.confidence ?? 1, tenantAgg.confidence ?? 1),
    _aggregatedFrom: [
      ...(ownerAgg._aggregatedFrom || [ownerAgg.label]),
      ...(tenantAgg._aggregatedFrom || [tenantAgg.label])
    ]
  });
}

function normalizeAggregatedRow(row) {
  fixSaldoPrecedenteMisread(row);
  const total = effectivePreventivoTotal(row);
  const out = {
    ...row,
    total,
    preventivoAmount: row.preventivoAmount ?? total
  };
  alignInstallmentsToPreventivo(out);
  return out;
}

/** L'AI confonde spesso SALDO PREC. con importo rata 1. */
function fixSaldoPrecedenteMisread(row) {
  const saldo = row.saldoPrecedente;
  const tdv = row.totaleDaVersare != null ? Number(row.totaleDaVersare) : null;
  const prevExplicit = row.preventivoAmount ?? row.preventivo_amount;
  const inst = row.installments || [];
  const firstAmt = inst.length ? Number(inst[0]?.amount || 0) : null;
  if (prevExplicit != null && tdv != null) {
    const expectedSaldo = Math.round((tdv - Number(prevExplicit)) * 100) / 100;
    if (saldo == null || Math.abs(saldo - firstAmt) < 0.02 || Math.abs(saldo - expectedSaldo) > 5) {
      row.saldoPrecedente = expectedSaldo;
    }
    return;
  }
  if (saldo == null || firstAmt == null) return;
  if (Math.abs(saldo - firstAmt) < 0.02 && inst.length > 1) {
    const guess = Math.round((firstAmt - Number(inst[1]?.amount || 0)) * 100) / 100;
    if (guess > 0 && guess < firstAmt) row.saldoPrecedente = guess;
  }
}

/** Se le rate sommano al totale da versare, la prima rata include spesso il saldo precedente. */
function alignInstallmentsToPreventivo(row) {
  const inst = row.installments;
  if (!inst?.length) return;
  const total = effectivePreventivoTotal(row);
  const sum = inst.reduce((s, i) => s + Number(i.amount || 0), 0);
  if (Math.abs(sum - total) <= 1.5) return;
  const tdv = Number(row.totaleDaVersare ?? 0);
  const saldo = Number(row.saldoPrecedente ?? 0);
  if (!saldo || !tdv || Math.abs(sum - tdv) > 1.5 || tdv <= total) return;
  const sorted = [...inst].sort((a, b) =>
    String(a.periodStart || '').localeCompare(String(b.periodStart || ''))
  );
  const first = sorted[0];
  if (!first) return;
  const adjusted = Number(first.amount || 0) - saldo;
  if (adjusted > 0 && adjusted < Number(first.amount || 0)) {
    first.amount = Math.round(adjusted * 100) / 100;
    row.installments = sorted;
  }
}

/**
 * Applica filtro automatico al preview dopo estrazione.
 * @param {object} preview
 * @param {object} house
 */
export function applyAutoFilterToPreview(preview, house) {
  const parties = house?.importParties || [];
  if (!parties.some(p => p.role === 'owner' && (p.firstName?.trim() || p.lastName?.trim()))) {
    preview.filterMode = 'manual';
    return preview;
  }

  preview.filterMode = 'auto';
  preview.showAllRows = false;
  preview.matchMeta = {};

  for (const section of preview.extraction.sections || []) {
    const deduped = dedupeExtractedRows(section.rows || []);
    section._allRows = deduped;
    const { matches, ownerMatches: rawOwnerMatches, tenantMatches, tenants } =
      matchRowsToParties(deduped, parties);
    const ownerMatches = filterOwnerMatches(rawOwnerMatches, deduped, tenantMatches);

    const ownerIdx = [...new Set(ownerMatches.map(m => m.rowIndex))];
    const tenantIdx = [...new Set(tenantMatches.map(m => m.rowIndex))];
    const ownerRowsDistinct = ownerIdx
      .map(i => deduped[i])
      .filter(Boolean);
    const sameCondomino =
      ownerRowsDistinct.length <= 1 ||
      ownerRowsDistinct.every((r, _, arr) => rowsSameCondomino(r.label, arr[0].label));
    const useIndices = [...new Set([...ownerIdx, ...tenantIdx])];

    preview.matchMeta[section.documentKind] = {
      matches,
      ownerIdx,
      tenantIdx,
      matchedRowCount: useIndices.length,
      partyMatchCount: new Set([
        ...ownerMatches.map(m => m.partyIndex),
        ...tenantMatches.map(m => m.partyIndex)
      ]).size,
      extractedLabels: deduped.map(r => r.label),
      warning: matches.some(m => m.score < PARTY_MATCH_PRESELECT)
        ? 'Alcuni match da verificare'
        : null,
      noMatch: useIndices.length === 0
    };

    if (useIndices.length === 0) {
      section.rows = deduped;
      preview.filterMode = 'manual';
      preview.autoFilterFailed = true;
      continue;
    }

    const ownerRows = ownerIdx.map(i => deduped[i]);
    const tenantRows = tenantIdx.map(i => deduped[i]);
    let synthetic;

    if (tenants.length && tenantRows.length && ownerRows.length && ownerIdx[0] !== tenantIdx[0]) {
      const ownerAgg = aggregateMatchedRows(deduped, ownerIdx);
      const tenantAgg = aggregateMatchedRows(deduped, tenantIdx);
      synthetic = buildOwnerTenantSynthetic(ownerAgg, tenantAgg);
    } else if (ownerIdx.length > 1 && sameCondomino) {
      synthetic = normalizeAggregatedRow(aggregateMatchedRows(deduped, ownerIdx));
    } else if (ownerIdx.length > 1) {
      const bestIdx = ownerIdx.reduce((best, idx) => {
        const row = deduped[idx];
        const score = ownerMatches
          .filter(m => m.rowIndex === idx)
          .reduce((s, m) => s + m.score, 0);
        return score > best.score ? { idx, score } : best;
      }, { idx: ownerIdx[0], score: -1 }).idx;
      synthetic = normalizeAggregatedRow(aggregateMatchedRows(deduped, [bestIdx]));
    } else {
      synthetic = normalizeAggregatedRow(aggregateMatchedRows(deduped, useIndices));
    }

    section.rows = [synthetic];
    preview.selectedRowIndex[section.documentKind] = 0;
    preview.confirmedSections[section.documentKind] = true;
  }

  return preview;
}

export { PARTY_MATCH_PRESELECT, PARTY_MATCH_WARN };

/**
 * Unisce estrazioni da più chiamate (es. una per pagina JPEG).
 * @param {object} base
 * @param {object} incoming
 */
export function mergeExtractions(base, incoming) {
  const a = base && typeof base === 'object' ? base : emptyExtraction();
  const b = incoming && typeof incoming === 'object' ? incoming : emptyExtraction();
  const out = {
    fiscalYearLabel: a.fiscalYearLabel || b.fiscalYearLabel || '',
    fieldConfidence: { ...(a.fieldConfidence || {}), ...(b.fieldConfidence || {}) },
    extractionNotes: [a.extractionNotes, b.extractionNotes].filter(Boolean).join(' ').trim(),
    summary: a.summary || b.summary || null,
    sections: (a.sections || []).map(s => ({ ...s, rows: [...(s.rows || [])] }))
  };

  for (const sec of b.sections || []) {
    let target = out.sections.find(s => s.documentKind === sec.documentKind);
    if (!target) {
      out.sections.push({ ...sec, rows: [...(sec.rows || [])] });
      continue;
    }
    target.rows = dedupeExtractedRows([...(target.rows || []), ...(sec.rows || [])]);
    if (target.confidence == null || (sec.confidence ?? 0) > target.confidence) {
      target.confidence = sec.confidence;
    }
    if (!target.totalAmount && sec.totalAmount) target.totalAmount = sec.totalAmount;
  }
  return out;
}

function emptyExtraction(note = '') {
  return { fiscalYearLabel: '', fieldConfidence: {}, extractionNotes: note, summary: null, sections: [] };
}
