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
  if (a.length >= 5 && b.length >= 5 && levenshtein(a, b) <= 1) return true;
  return false;
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
  }
  if (ln) variants.add(ln);
  if (fn) variants.add(fn);
  return [...variants];
}

function scoreNormalizedPair(labelNorm, partyNorm) {
  if (!labelNorm || !partyNorm) return 0;
  if (labelNorm === partyNorm) return 1;
  if (labelNorm.includes(partyNorm) || partyNorm.includes(labelNorm)) return 0.95;

  const lt = labelNorm.split(' ').filter(Boolean);
  const pt = partyNorm.split(' ').filter(Boolean);
  if (!lt.length || !pt.length) return 0;

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

function pickRicherRow(a, b) {
  const aInst = a.installments?.length || 0;
  const bInst = b.installments?.length || 0;
  if (aInst !== bInst) return aInst > bInst ? a : b;
  const aTotal = Number(a.total || 0);
  const bTotal = Number(b.total || 0);
  if (aTotal !== bTotal) return aTotal > bTotal ? a : b;
  return (a.confidence ?? 0) >= (b.confidence ?? 0) ? a : b;
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
  const picked = indices.map(i => rows[i]).filter(Boolean);
  if (!picked.length) return null;
  if (picked.length === 1) {
    return {
      ...picked[0],
      label: meta.label || picked[0].label,
      confidence: Math.max(...picked.map(r => r.confidence ?? 0.5))
    };
  }
  const labels = picked.map(r => r.label).join(' + ');
  const total = picked.reduce((s, r) => s + Number(r.total || 0), 0);
  const installments = mergeInstallments(picked.map(r => r.installments));
  return {
    label: meta.label || labels,
    unit: picked.map(r => r.unit).filter(Boolean).join(' / ') || '',
    millesimi: picked[0].millesimi,
    total,
    installments,
    confidence: Math.min(...picked.map(r => r.confidence ?? 0.5)),
    _aggregatedFrom: picked.map(r => r.label)
  };
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
    const { matches, ownerMatches, tenantMatches, tenants } = matchRowsToParties(deduped, parties);

    const ownerIdx = ownerMatches.map(m => m.rowIndex);
    const tenantIdx = tenantMatches.map(m => m.rowIndex);
    const useIndices = [...new Set([...ownerIdx, ...tenantIdx])];

    preview.matchMeta[section.documentKind] = {
      matches,
      ownerIdx,
      tenantIdx,
      extractedLabels: deduped.map(r => r.label).slice(0, 12),
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

    if (tenants.length && tenantRows.length && ownerRows.length) {
      const ownerAgg = aggregateMatchedRows(deduped, ownerIdx);
      const tenantAgg = aggregateMatchedRows(deduped, tenantIdx);
      synthetic = {
        label: `${ownerAgg.label} + ${tenantAgg.label}`,
        unit: [ownerAgg.unit, tenantAgg.unit].filter(Boolean).join(' / '),
        millesimi: ownerAgg.millesimi,
        total: Number(ownerAgg.total) + Number(tenantAgg.total),
        installments: mergeInstallments([ownerAgg.installments, tenantAgg.installments]),
        confidence: Math.min(ownerAgg.confidence ?? 1, tenantAgg.confidence ?? 1),
        _aggregatedFrom: [...(ownerAgg._aggregatedFrom || [ownerAgg.label]), ...(tenantAgg._aggregatedFrom || [tenantAgg.label])]
      };
    } else if (ownerIdx.length > 1) {
      synthetic = aggregateMatchedRows(deduped, ownerIdx);
    } else {
      synthetic = aggregateMatchedRows(deduped, useIndices);
    }

    section.rows = [synthetic];
    preview.selectedRowIndex[section.documentKind] = 0;
    preview.confirmedSections[section.documentKind] = true;
  }

  return preview;
}

export { PARTY_MATCH_PRESELECT, PARTY_MATCH_WARN };
