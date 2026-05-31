import { getSelectedRow } from './document-import-map.js';
import { parseFiscalLabel } from './fiscal.js';
import { fmt } from './utils.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeSummary(raw) {
  if (!raw || typeof raw !== 'object') return {};
  return {
    previousBalance: num(raw.previousBalance ?? raw.previous_balance),
    previousExerciseLabel: String(raw.previousExerciseLabel ?? raw.previous_exercise_label ?? '').trim(),
    previousExerciseTotal: num(raw.previousExerciseTotal ?? raw.previous_exercise_total),
    notes: String(raw.notes ?? '').trim()
  };
}

/**
 * @param {object} preview
 * @param {object} house
 */
export function buildResoconto(preview, house) {
  const ext = preview?.extraction || {};
  const summary = normalizeSummary(ext.summary);
  const fiscalLabel = String(ext.fiscalYearLabel || '').trim();

  const preventivoRow = getSelectedRow(preview, 'preventivo');
  const consuntivoRow = getSelectedRow(preview, 'consuntivo');

  const resoconto = {
    previousBalance: summary.previousBalance,
    previousExerciseLabel: summary.previousExerciseLabel,
    previousExerciseTotal: summary.previousExerciseTotal,
    preventivoTotal: preventivoRow ? Number(preventivoRow.total) : null,
    consuntivoTotal: consuntivoRow ? Number(consuntivoRow.total) : null,
    installments: preventivoRow?.installments
      ? preventivoRow.installments.map(i => ({
        label: i.label || '',
        periodStart: i.periodStart,
        amount: Number(i.amount || 0)
      }))
      : [],
    fiscalYearLabel: fiscalLabel,
    applyCarryover: false,
    carryoverAmount: null,
    carryFromPeriodLabel: summary.previousExerciseLabel || '',
    matchSummary: preview.matchMeta ? formatMatchSummary(preview) : ''
  };

  if (resoconto.previousBalance != null && Math.abs(resoconto.previousBalance) >= 0.005) {
    resoconto.applyCarryover = true;
    resoconto.carryoverAmount = -resoconto.previousBalance;
  }

  if (house && resoconto.carryFromPeriodLabel) {
    try {
      const prevSpec = parseFiscalLabel(house, resoconto.carryFromPeriodLabel);
      const prev = house.fiscalPeriods?.find(p => p.label === prevSpec.label);
      if (prev) resoconto.carryFromPeriodId = prev.id;
    } catch {
      /* label non parsabile */
    }
  }

  return resoconto;
}

function formatMatchSummary(preview) {
  const parts = [];
  for (const [kind, meta] of Object.entries(preview.matchMeta || {})) {
    if (meta.noMatch) parts.push(`${kind}: nessuna riga trovata`);
    else if (meta.warning) parts.push(`${kind}: ${meta.warning}`);
    else parts.push(`${kind}: ${(meta.matches || []).length} riga/e abbinate`);
  }
  return parts.join(' · ');
}

export function ensureResoconto(preview, house) {
  if (!preview.resoconto) preview.resoconto = buildResoconto(preview, house);
  return preview.resoconto;
}

export function resocontoHtml(resoconto, { editable = true, filterMode = 'manual' } = {}) {
  const ro = editable ? '' : 'readonly';
  const field = (id, label, value, type = 'number') => {
    const v = value == null || value === '' ? '' : value;
    if (type === 'text') {
      return `<div><label for="${id}">${label}</label><input id="${id}" type="text" class="resoconto-field" data-field="${id}" value="${esc(String(v))}" ${ro} /></div>`;
    }
    return `<div><label for="${id}">${label}</label><input id="${id}" type="number" step="0.01" class="resoconto-field" data-field="${id}" value="${v === '' ? '' : Number(v)}" ${ro} /></div>`;
  };

  let html = `<div class="document-resoconto card stack">`;
  html += `<h3>Resoconto estrazione</h3>`;
  if (filterMode === 'auto') {
    html += `<p class="hint">Righe filtrate in base ai nominativi configurati per questo immobile. Verifica i valori prima di confermare.</p>`;
  }
  if (resoconto.matchSummary) {
    html += `<p class="hint">${esc(resoconto.matchSummary)}</p>`;
  }
  html += `<div class="field-grid">`;
  html += field('resocontoPrevBalance', 'Saldi precedenti (€)', resoconto.previousBalance);
  html += field('resocontoPrevExerciseLabel', 'Esercizio precedente (etichetta)', resoconto.previousExerciseLabel, 'text');
  html += field('resocontoPrevExerciseTotal', 'Totali esercizio precedente (€)', resoconto.previousExerciseTotal);
  html += field('resocontoPreventivo', 'Nuovo preventivo (€)', resoconto.preventivoTotal);
  html += field('resocontoConsuntivo', 'Nuovo consuntivo (€)', resoconto.consuntivoTotal);
  html += `</div>`;

  if (resoconto.installments?.length) {
    html += `<h4>Distribuzione rate (preventivo)</h4>`;
    html += `<table class="doc-installments-edit"><thead><tr><th>Rata</th><th>Data</th><th>Importo (€)</th></tr></thead><tbody>`;
    resoconto.installments.forEach((inst, ii) => {
      html += `<tr><td><input type="text" class="resoconto-inst-label" data-ii="${ii}" value="${esc(inst.label || '')}" ${ro} /></td>`;
      html += `<td><input type="date" class="resoconto-inst-date" data-ii="${ii}" value="${esc(inst.periodStart || '')}" ${ro} /></td>`;
      html += `<td><input type="number" step="0.01" class="resoconto-inst-amount" data-ii="${ii}" value="${Number(inst.amount || 0)}" ${ro} /></td></tr>`;
    });
    html += `</tbody></table>`;
  }

  if (resoconto.applyCarryover && resoconto.carryoverAmount != null) {
    html += `<label class="document-section-toggle"><input type="checkbox" id="resocontoApplyCarryover" ${resoconto.applyCarryover ? 'checked' : ''} /> `;
    html += `Riporto automatico su preventivo: <strong>${fmt(resoconto.carryoverAmount)}</strong>`;
    if (resoconto.carryFromPeriodLabel) {
      html += ` <span class="muted">(da esercizio ${esc(resoconto.carryFromPeriodLabel)})</span>`;
    }
    html += `</label>`;
  }

  if (filterMode === 'auto' && editable) {
    html += `<div class="form-actions"><button type="button" class="btn btn-primary" id="docResocontoConfirmBtn">Conferma resoconto</button>`;
    html += `<button type="button" class="btn btn-secondary" id="docShowAllRowsBtn">Mostra tutte le righe</button></div>`;
  }
  html += `</div>`;
  return html;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Applica valori resoconto editati alle righe selezionate del preview. */
export function applyResocontoToPreview(preview) {
  const r = preview.resoconto;
  if (!r) return;
  const prev = getSelectedRow(preview, 'preventivo');
  const cons = getSelectedRow(preview, 'consuntivo');
  if (prev && r.preventivoTotal != null) prev.total = Number(r.preventivoTotal);
  if (cons && r.consuntivoTotal != null) cons.total = Number(r.consuntivoTotal);
  if (prev && r.installments?.length) {
    prev.installments = r.installments.map(i => ({ ...i }));
  }
}
