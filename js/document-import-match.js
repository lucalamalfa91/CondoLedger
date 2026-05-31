import {
  normalizePartyName,
  partyDisplayName,
  PARTY_MATCH_PRESELECT,
  PARTY_MATCH_WARN
} from './house-import-parties.js';

function tokenSet(name) {
  const n = normalizePartyName(name);
  return n ? new Set(n.split(' ').filter(Boolean)) : new Set();
}

/** Score 0–1 tra label riga e nominativo. */
export function scoreRowToParty(rowLabel, party) {
  const label = normalizePartyName(rowLabel);
  const full = normalizePartyName(partyDisplayName(party));
  if (!label || !full) return 0;
  if (label === full) return 1;
  if (label.includes(full) || full.includes(label)) return 0.95;

  const lt = tokenSet(rowLabel);
  const pt = tokenSet(partyDisplayName(party));
  if (!lt.size || !pt.size) return 0;

  let inter = 0;
  for (const t of pt) if (lt.has(t)) inter += 1;
  const union = new Set([...lt, ...pt]).size;
  const jaccard = union ? inter / union : 0;

  const rev = normalizePartyName(`${party.lastName} ${party.firstName}`);
  if (label === rev || label.includes(rev)) return Math.max(jaccard, 0.92);

  return jaccard;
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
    let best = { score: 0, party: null, partyIndex: -1 };
    parties.forEach((party, partyIndex) => {
      const score = scoreRowToParty(row.label, party);
      if (score > best.score) best = { score, party, partyIndex };
    });
    if (best.score >= PARTY_MATCH_WARN) {
      matches.push({
        rowIndex,
        partyIndex: best.partyIndex,
        party: best.party,
        score: best.score,
        role: best.party?.role
      });
    }
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
  if (!parties.some(p => p.role === 'owner' && p.firstName && p.lastName)) {
    preview.filterMode = 'manual';
    return preview;
  }

  preview.filterMode = 'auto';
  preview.showAllRows = false;
  preview.matchMeta = {};

  for (const section of preview.extraction.sections || []) {
    const allRows = [...(section.rows || [])];
    section._allRows = allRows;
    const { matches, ownerMatches, tenantMatches, tenants } = matchRowsToParties(allRows, parties);

    const ownerIdx = ownerMatches.map(m => m.rowIndex);
    const tenantIdx = tenantMatches.map(m => m.rowIndex);
    const useIndices = [...new Set([...ownerIdx, ...tenantIdx])];

    preview.matchMeta[section.documentKind] = {
      matches,
      ownerIdx,
      tenantIdx,
      warning: matches.some(m => m.score < PARTY_MATCH_PRESELECT)
        ? 'Alcuni match da verificare'
        : null,
      noMatch: useIndices.length === 0
    };

    if (useIndices.length === 0) {
      section.rows = allRows;
      preview.filterMode = 'manual';
      preview.autoFilterFailed = true;
      continue;
    }

    const ownerRows = ownerIdx.map(i => allRows[i]);
    const tenantRows = tenantIdx.map(i => allRows[i]);
    let synthetic;

    if (tenants.length && tenantRows.length && ownerRows.length) {
      const ownerAgg = aggregateMatchedRows(allRows, ownerIdx);
      const tenantAgg = aggregateMatchedRows(allRows, tenantIdx);
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
      synthetic = aggregateMatchedRows(allRows, ownerIdx);
    } else {
      synthetic = aggregateMatchedRows(allRows, useIndices);
    }

    section.rows = [synthetic];
    preview.selectedRowIndex[section.documentKind] = 0;
    preview.confirmedSections[section.documentKind] = true;
  }

  return preview;
}

export { PARTY_MATCH_PRESELECT, PARTY_MATCH_WARN };
