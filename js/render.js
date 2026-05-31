import { ensureResoconto, resocontoHtml } from './document-import-resoconto.js';
import { partyDisplayName } from './house-import-parties.js';
import { resolveView, viewHeading, viewMeta } from './config.js';
import {
  DUE_KINDS,
  consuntivoBalanceFootnote,
  periodLabel,
  periodSummary,
  totals,
  findPeriodByDate,
  defaultFiscalLabel
} from './fiscal.js';
import {
  SPLIT_MODES,
  filterPaymentsByInstallmentPeriod,
  findInstallment,
  inferInstallmentKey,
  installmentShortLabel,
  listInstallmentsForPeriod,
  listAllInstallments,
  paymentsSummaryForList
} from './installments.js';
import {
  buildSituazioneReport,
  carryFromLabel,
  defaultSituazionePdfKind,
  hasConsuntivoReport,
  hasPaymentsOnlyReport,
  hasPreventivoReport,
  resolveSituazionePdfKind,
  situazioneStatusLabel
} from './situazione-report.js';
import { computeComplianceStatus } from './compliance-status.js';
import { dataListHtml, emptyListHtml } from './mobile-cards.js';
import { computeNextPaymentGuide, formatPaymentGuideSummary } from './payment-guide.js';
import { activeHouse, state } from './state.js';
import { fmt, today } from './utils.js';

const COMPLIANCE_ICONS = {
  in_regola: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
  attenzione: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
  azione: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  vuoto: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V8.5L12 4l8 4.5V20"/><path d="M8 20v-6h8v6"/></svg>'
};

const MONTH_FILTER_LABELS = [
  ['', 'Tutti'], ['1', 'Gennaio'], ['2', 'Febbraio'], ['3', 'Marzo'], ['4', 'Aprile'],
  ['5', 'Maggio'], ['6', 'Giugno'], ['7', 'Luglio'], ['8', 'Agosto'], ['9', 'Settembre'],
  ['10', 'Ottobre'], ['11', 'Novembre'], ['12', 'Dicembre']
];

function rowActions(kind, id) {
  return `<div class="row-actions"><button type="button" class="btn btn-secondary edit-${kind}" data-id="${id}">Modifica</button><button type="button" class="btn btn-secondary delete-${kind}" data-id="${id}">Elimina</button></div>`;
}

export function createRenderer(els) {
  function defaultSubview(view) {
    if (view === 'movimenti') {
      return sessionStorage.getItem('movimenti-tab') || viewMeta.movimenti.defaultSubview;
    }
    return viewMeta[view]?.defaultSubview ?? null;
  }

  function syncNavActive(view, subview) {
    els.navButtons.forEach(btn => {
      const btnView = btn.dataset.view;
      const mobileSub = btn.dataset.navMobileSubview;
      let active;
      if (btn.closest('.bottom-nav')) {
        if (mobileSub) {
          active = view === btnView && subview === mobileSub;
        } else if (btnView === 'movimenti') {
          active = view === 'movimenti' && subview !== 'situazione';
        } else {
          active = view === btnView;
        }
      } else {
        active = btnView === view;
      }
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  function syncSubviewUI(view, subview) {
    const meta = viewMeta[view];
    if (!meta?.subviews || !subview) {
      els.subviewTabs?.forEach(tab => tab.classList.remove('active'));
      els.subviewPanels?.forEach(panel => panel.classList.remove('active'));
      return;
    }
    els.subviewTabs?.forEach(tab => {
      const active = tab.dataset.view === view && tab.dataset.subview === subview;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const viewPanel = els.viewPanels.find(p => p.dataset.viewPanel === view);
    viewPanel?.querySelectorAll('[data-subview-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.subviewPanel === subview);
    });
  }

  function updateHeader(view, subview) {
    const [title, subtitle] = viewHeading(view, subview);
    els.viewTitle.textContent = title;
    els.viewSubtitle.textContent = subtitle;
  }

  function closeOverlays() {
    els.userMenu?.classList.add('hidden');
    els.userMenuBtn?.setAttribute('aria-expanded', 'false');
  }

  function setView(rawView, rawSubview = null) {
    const { view, subview: resolvedSub } = resolveView(rawView, rawSubview);
    let subview = resolvedSub ?? defaultSubview(view);
    if (viewMeta[view]?.subviews && subview && !viewMeta[view].subviews[subview]) {
      subview = viewMeta[view].defaultSubview;
    }
    state.currentView = view;
    state.currentSubview = subview;
    if (view === 'movimenti' && subview) sessionStorage.setItem('movimenti-tab', subview);

    syncNavActive(view, subview);
    els.viewPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view));
    syncSubviewUI(view, subview);
    updateHeader(view, subview);
    closeOverlays();
    els.main?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHouseSelect() {
    if (!els.houseSelect) return;
    if (state.houseFormMode === 'new') {
      els.houseSelect.disabled = true;
      els.houseSelect.innerHTML = '<option value="">Nuova casa…</option>';
      return;
    }
    const current = state.selectedHouseId || '';
    if (!state.data.houses.length) {
      els.houseSelect.innerHTML = '<option value="">Nessun immobile</option>';
      els.houseSelect.disabled = true;
      return;
    }
    els.houseSelect.disabled = false;
    els.houseSelect.innerHTML = state.data.houses.map(h =>
      `<option value="${h.id}" ${h.id === current ? 'selected' : ''}>${h.name}</option>`
    ).join('');
    if (current) els.houseSelect.value = current;
  }

  function renderHousesManageList() {
    if (!els.housesManageList) return;
    if (!state.data.houses.length) {
      els.housesManageList.innerHTML = '<div class="empty">Nessun immobile registrato. Usa + Nuova casa per iniziare.</div>';
      return;
    }
    els.housesManageList.innerHTML = '';
    for (const h of state.data.houses) {
      const t = totals(h);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `house-btn ${h.id === state.selectedHouseId && state.houseFormMode === 'edit' ? 'active' : ''}`;
      btn.dataset.houseId = h.id;
      btn.innerHTML = `<strong>${h.name}</strong><span class="muted">${h.location || 'Località non indicata'}</span><span class="muted">Saldo cons.: ${fmt(t.balanceConsuntivo)}</span>`;
      els.housesManageList.appendChild(btn);
    }
  }

  function syncHouseFormChrome(mode) {
    const isNew = mode === 'new';
    if (els.houseFormTitle) els.houseFormTitle.textContent = isNew ? 'Nuova casa' : 'Modifica immobile';
    if (els.houseFormSubtitle) {
      els.houseFormSubtitle.textContent = isNew
        ? 'Compila i dati e salva per aggiungere un immobile.'
        : 'Dati e configurazione esercizio fiscale.';
    }
    if (els.houseSubmitBtn) els.houseSubmitBtn.textContent = isNew ? 'Crea casa' : 'Salva modifiche';
    els.deleteHouseBtn?.classList.toggle('hidden', isNew || !state.data.houses.length);
    els.houseForm?.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = false; });
  }

  function renderNewHouseForm() {
    syncHouseFormChrome('new');
    els.houseForm?.reset();
    if (els.fiscalStartMonth) els.fiscalStartMonth.value = '6';
    renderHouseImportParties({ importParties: [] });
  }

  function periodOptions(house, selectedId) {
    if (!house.fiscalPeriods.length) return '';
    return house.fiscalPeriods.map(p =>
      `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.label} (${p.startDate} → ${p.endDate})</option>`
    ).join('');
  }

  function syncPaymentCarryFromSelect(house) {
    if (!els.paymentCarryFrom) return;
    const paymentPeriodId = els.paymentPeriod?.value || '';
    const current = els.paymentCarryFrom.value || '';
    const sorted = [...house.fiscalPeriods].sort((a, b) =>
      String(a.startDate).localeCompare(String(b.startDate))
    );
    const paymentIdx = sorted.findIndex(p => String(p.id) === String(paymentPeriodId));
    const candidates = paymentIdx > 0 ? sorted.slice(0, paymentIdx) : sorted.filter(p => String(p.id) !== String(paymentPeriodId));
    const opts = candidates.map(p =>
      `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${p.label}</option>`
    ).join('');
    els.paymentCarryFrom.innerHTML = '<option value="">— Nessuno (versamento ordinario) —</option>' + opts;
    if (current && candidates.some(p => p.id === current)) els.paymentCarryFrom.value = current;
  }

  function syncPaymentPeriodSelect(house) {
    if (!els.paymentDate || !els.paymentPeriod) return;
    const date = els.paymentDate.value || today;
    const period = findPeriodByDate(house, date);
    const existingId = period.id || house.fiscalPeriods.find(p => p.label === period.label)?.id || '';
    let html = periodOptions(house, existingId);
    if (!existingId && period.label) {
      html = `<option value="" selected>${period.label} (creato al salvataggio)</option>` + html;
    }
    if (!html) html = '<option value="">— registra un dovuto o importa movimenti —</option>';
    els.paymentPeriod.innerHTML = html;
    if (existingId) els.paymentPeriod.value = existingId;
    syncPaymentInstallmentSelect(house);
    syncPaymentCarryFromSelect(house);
  }

  function syncPaymentInstallmentSelect(house, preferredKey = null) {
    if (!els.paymentInstallment || !els.paymentPeriod) return;
    const periodId = els.paymentPeriod.value;
    const slots = periodId ? listInstallmentsForPeriod(house, periodId) : listAllInstallments(house);
    if (!slots.length) {
      els.paymentInstallment.innerHTML = '<option value="">— registra un dovuto per l’esercizio —</option>';
      return;
    }
    const date = els.paymentDate?.value || today;
    let selected = preferredKey || els.paymentInstallment.value;
    if (!selected) {
      const match = slots.find(s => date >= s.periodStart && date <= s.periodEnd);
      selected = match?.key || slots[0].key;
    }
    els.paymentInstallment.innerHTML = slots.map(s =>
      `<option value="${s.key}" ${s.key === selected ? 'selected' : ''}>${s.label}${s.dueDescription ? ` · ${s.dueDescription}` : ''} (${fmt(s.amountDue)})</option>`
    ).join('');
    applyPaymentSmartAmount(house);
  }

  function applyPaymentSmartAmount(house) {
    if (!els.paymentAmount || !els.paymentInstallment || els.paymentEditId?.value) return;
    const key = els.paymentInstallment.value;
    if (!key) return;
    const periodId = els.paymentPeriod?.value;
    const rows = periodId ? installmentSummaryForPeriod(house, periodId).slots : [];
    const row = rows.find(s => s.key === key);
    if (!row) return;
    const gap = Math.round((row.amountDue - row.paid) * 100) / 100;
    if (gap > 0.01) els.paymentAmount.value = String(gap);
  }

  function renderPaymentFilterOptions(house) {
    if (!els.paymentFilterYear || !els.paymentFilterMonth) return;
    const years = new Set();
    for (const slot of listAllInstallments(house)) {
      years.add(Number(slot.periodStart.slice(0, 4)));
    }
    const yCur = els.paymentFilterYear.value;
    const mCur = els.paymentFilterMonth.value;
    els.paymentFilterYear.innerHTML = '<option value="">Tutti</option>' + [...years].sort((a, b) => b - a).map(y =>
      `<option value="${y}" ${String(y) === yCur ? 'selected' : ''}>${y}</option>`
    ).join('');
    els.paymentFilterMonth.innerHTML = MONTH_FILTER_LABELS.map(([v, label]) =>
      `<option value="${v}" ${v === mCur ? 'selected' : ''}>${label}</option>`
    ).join('');
  }

  function getFilteredPayments(house) {
    const year = els.paymentFilterYear?.value || '';
    const month = els.paymentFilterMonth?.value || '';
    const sorted = [...house.payments].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return filterPaymentsByInstallmentPeriod(sorted, house, year || null, month || null);
  }

  function countCoveredInstallments(house, payments, periodId) {
    const allSlots = periodId
      ? listInstallmentsForPeriod(house, periodId)
      : listAllInstallments(house);
    const keys = new Set();
    for (const p of payments) {
      const k = p.installmentKey || inferInstallmentKey(house, p);
      if (k) keys.add(k);
    }
    return { covered: keys.size, total: allSlots.length };
  }

  function syncDuePeriodSelect(house, preferredId = null) {
    if (!els.duePeriod) return;
    const suggested = defaultFiscalLabel(house);
    const sel = preferredId || els.duePeriod.value;
    let html = periodOptions(house, sel);
    if (!house.fiscalPeriods.length) {
      html = `<option value="__new__" selected>Nuovo esercizio…</option>`;
      els.duePeriodNewWrap?.classList.remove('hidden');
    } else {
      html = `<option value="__new__">+ Nuovo esercizio…</option>` + html;
      if (!sel || sel === '__new__') {
        els.duePeriodNewWrap?.classList.toggle('hidden', els.duePeriod.value !== '__new__');
      } else {
        els.duePeriodNewWrap?.classList.add('hidden');
      }
    }
    els.duePeriod.innerHTML = html;
    if (sel && sel !== '__new__' && house.fiscalPeriods.some(p => p.id === sel)) {
      els.duePeriod.value = sel;
    }
    if (els.duePeriodHint) {
      els.duePeriodHint.textContent = house.fiscalPeriods.length
        ? `Suggerito per nuovo: ${suggested}`
        : `Inserisci es. ${suggested} (mese inizio ${house.fiscalStartMonth ?? 6})`;
    }
  }

  function renderPeriodSelects(house) {
    syncDuePeriodSelect(house);
    if (els.dueSplitMode && !els.dueEditId?.value) els.dueSplitMode.value = 'monthly';
    if (els.dueKind && !els.dueEditId?.value) els.dueKind.value = 'preventivo';
    syncDueKindFields();
    if (els.paymentDate) els.paymentDate.value ||= today;
    syncPaymentPeriodSelect(house);
  }

  function renderHouseList() {
    renderHouseSelect();
    renderHousesManageList();
  }

  function activePeriodFilterId() {
    const v = els.periodFilter?.value;
    return v && v !== 'all' ? v : null;
  }

  function complianceCtaBtn(cta, className = 'btn btn-primary') {
    if (!cta) return '';
    return `<button class="${className}" type="button" data-nav-target="${cta.view}" data-nav-subview="${cta.subview}">${cta.label}</button>`;
  }

  function renderComplianceHero(house) {
    if (!els.complianceHero) return;
    if (!house) {
      els.complianceHero.innerHTML = '';
      return;
    }
    const s = computeComplianceStatus(house);
    const factsHtml = s.facts.length
      ? `<div class="compliance-facts">${s.facts.map(f =>
        `<div class="compliance-fact"><div class="compliance-fact-label">${f.label}</div><div class="compliance-fact-value ${f.tone || ''}">${f.value}</div></div>`
      ).join('')}</div>`
      : '';
    els.complianceHero.innerHTML = `
      <article class="compliance-card compliance-card--${s.level}" role="status" aria-label="${s.headline}">
        <div class="compliance-head">
          <div class="compliance-icon" aria-hidden="true">${COMPLIANCE_ICONS[s.level] || COMPLIANCE_ICONS.vuoto}</div>
          <div>
            <h2 class="compliance-headline">${s.headline}</h2>
            <p class="compliance-subline">${s.subline}</p>
            ${s.detail ? `<p class="compliance-detail">${s.detail}</p>` : ''}
          </div>
        </div>
        ${factsHtml}
        <div class="compliance-actions">
          ${complianceCtaBtn(s.primaryCta)}
          ${complianceCtaBtn(s.secondaryCta, 'btn btn-secondary')}
        </div>
      </article>`;
  }

  function renderMetrics(house) {
    const periodId = activePeriodFilterId();
    const t = totals(house, periodId);
    const scope = periodId ? periodLabel(house, periodId) : 'Tutti gli esercizi';
    const periodRow = periodId ? periodSummary(house).find(p => p.id === periodId) : null;
    const consFoot = periodRow
      ? consuntivoBalanceFootnote(house, periodRow)
      : (t.debtYears ? `${t.debtYears} esercizi in debito (non saldati)` : 'Nessun debito consuntivo aperto');
    const metricData = [
      ['Preventivo', fmt(t.preventivo), scope],
      ['Consuntivo', fmt(t.consuntivo), periodId ? 'Addebiti consuntivi' : `${t.dueCount} voci dovuto`],
      ['Versato', fmt(t.paid), `${t.paymentCount} versamenti`],
      ['Saldo consuntivo', fmt(t.balanceConsuntivo), consFoot, t.balanceConsuntivo >= 0 ? 'positive' : 'negative']
    ];
    els.metrics.innerHTML = metricData.map(([label, value, foot, status]) =>
      `<article class="card"><div class="metric-label">${label}</div><div class="metric-value ${status || ''}">${value}</div><div class="metric-foot">${foot}</div></article>`
    ).join('');
  }

  function renderPeriodFilter(summary) {
    const current = els.periodFilter.value || 'all';
    els.periodFilter.innerHTML = '<option value="all">Tutti</option>' + summary.map(s =>
      `<option value="${s.id}">${s.label}</option>`
    ).join('');
    els.periodFilter.value = summary.some(s => s.id === current) || current === 'all' ? current : 'all';
  }

  function renderAnnualBlocks(house) {
    const summary = periodSummary(house);
    renderPeriodFilter(summary);
    const filtered = els.periodFilter.value === 'all' ? summary : summary.filter(x => x.id === els.periodFilter.value);
    if (!filtered.length) {
      els.annualTableWrap.innerHTML = '<div class="empty">Nessuna annualità da mostrare.</div>';
    } else {
      els.annualTableWrap.innerHTML = `<table><thead><tr><th>Esercizio</th><th>Preventivo</th><th>Consuntivo</th><th>Versato</th><th>Saldo cons.</th><th>Stato</th></tr></thead><tbody>${filtered.map(item => {
        const b = item.balanceConsuntivo;
        const status = item.consuntivoSettledInNext
          ? ['Saldato', 'success']
          : b > 0.005 ? ['Eccedenza', 'success'] : b < -0.005 ? ['In debito', 'error'] : ['Pareggio', 'warn'];
        const saldoHint = item.consuntivoSettledInNext && Math.abs(item.balanceConsuntivoRaw - b) > 0.005
          ? `<div class="hint">Lordo ${fmt(item.balanceConsuntivoRaw)}</div>` : '';
        return `<tr><td>${item.label}<div class="hint">${item.startDate || ''} → ${item.endDate || ''}</div></td><td class="amount">${fmt(item.preventivo)}</td><td class="amount">${fmt(item.consuntivo)}</td><td class="amount">${fmt(item.paid)}</td><td class="amount ${b >= 0 ? 'positive' : 'negative'}">${fmt(b)}${saldoHint}</td><td><span class="badge ${status[1]}">${status[0]}</span></td></tr>`;
      }).join('')}</tbody></table>`;
    }
    const cardsSource = els.periodFilter.value === 'all' ? summary : filtered;
    const cards = cardsSource.length
      ? `<div class="annual-list">${cardsSource.map(item => {
        const b = item.balanceConsuntivo;
        const cls = item.consuntivoSettledInNext ? 'success' : b > 0.005 ? 'success' : b < -0.005 ? 'error' : 'warn';
        const label = item.consuntivoSettledInNext ? 'Saldato' : b > 0.005 ? 'Eccedenza' : b < -0.005 ? 'Debito' : 'Pareggio';
        return `<div class="annual-item"><div><strong>${item.label}</strong><div class="hint">Prev. ${fmt(item.preventivo)} · Cons. ${fmt(item.consuntivo)} · Vers. ${fmt(item.paid)}</div></div><div><span class="badge ${cls}">${label}</span></div><strong class="${b >= 0 ? 'positive' : 'negative'}">${fmt(b)}</strong></div>`;
      }).join('')}</div>`
      : '<div class="empty">Nessuna annualità registrata.</div>';
    els.annualCards.innerHTML = summary.length ? cards : '<div class="empty">Nessun saldo disponibile.</div>';
    if (els.annualPageCards) els.annualPageCards.innerHTML = cards;
  }

  function renderDues(house) {
    if (!els.duesTable) return;
    const dues = [...house.dues].sort((a, b) => {
      const la = periodLabel(house, a.fiscalPeriodId);
      const lb = periodLabel(house, b.fiscalPeriodId);
      return lb.localeCompare(la) || String(b.date || '').localeCompare(String(a.date || ''));
    });
    if (!dues.length) {
      els.duesTable.innerHTML = emptyListHtml('Nessun dovuto registrato.');
      return;
    }
    const rows = dues.map(item => {
      const kind = DUE_KINDS[item.dueKind || 'preventivo']?.label || item.dueKind;
      const splitLabel = item.dueKind === 'consuntivo' ? '—' : (SPLIT_MODES[item.splitMode]?.label || (item.splitMode === 'custom' ? 'Custom' : 'Mensile'));
      const carry = item.carryFromPeriodId ? ' <span class="badge warn">Riporto</span>' : '';
      const amtCls = Number(item.amount) < 0 ? 'negative' : '';
      const ex = periodLabel(house, item.fiscalPeriodId);
      const tableRow = `<tr><td>${ex}</td><td>${kind}${carry}</td><td>${item.description || '—'}</td><td>${splitLabel}</td><td class="amount ${amtCls}">${fmt(item.amount)}</td><td>${rowActions('due', item.id)}</td></tr>`;
      const card = `<article class="data-card"><div class="data-card-head"><div><div class="data-card-title">${ex} · ${kind}${carry}</div><div class="data-card-meta">${item.description || '—'} · ${splitLabel}</div></div><div class="data-card-amount amount ${amtCls}">${fmt(item.amount)}</div></div><div class="data-card-actions">${rowActions('due', item.id)}</div></article>`;
      return { tableRow, card };
    });
    const tableHtml = `<table><thead><tr><th>Esercizio</th><th>Tipo</th><th>Descrizione</th><th>Ripartizione</th><th>Importo</th><th></th></tr></thead><tbody>${rows.map(r => r.tableRow).join('')}</tbody></table>`;
    const cardsHtml = rows.map(r => r.card).join('');
    els.duesTable.innerHTML = dataListHtml(tableHtml, cardsHtml);
  }

  function paymentRowMeta(house, item) {
    const key = item.installmentKey || inferInstallmentKey(house, item);
    const rata = installmentShortLabel(house, key);
    const inferred = !item.installmentKey && key;
    const amt = Number(item.amount || 0);
    const amtCls = amt >= 0 ? 'positive' : 'negative';
    const carry = item.isCarryForward ? ' <span class="badge warn">Riporto</span>' : '';
    const rataCell = inferred ? `${rata} <span class="hint">(stimata)</span>` : rata;
    const settle = item.carryFromPeriodId
      ? ` <span class="badge success">Saldo ${periodLabel(house, item.carryFromPeriodId)}</span>` : '';
    return { ex: periodLabel(house, item.fiscalPeriodId), rataCell, carry, settle, date: item.date || '—', method: item.method || '—', amt, amtCls, id: item.id };
  }

  function paymentRowHtml(house, item) {
    const m = paymentRowMeta(house, item);
    return `<tr><td>${m.ex}</td><td>${m.rataCell}${m.carry}${m.settle}</td><td>${m.date}</td><td>${m.method}</td><td class="amount ${m.amtCls}">${fmt(m.amt)}</td><td>${rowActions('payment', m.id)}</td></tr>`;
  }

  function paymentCardHtml(house, item) {
    const m = paymentRowMeta(house, item);
    return `<article class="data-card"><div class="data-card-head"><div><div class="data-card-title">${m.ex} · ${m.rataCell}${m.carry}</div><div class="data-card-meta">${m.date} · ${m.method}${m.settle}</div></div><div class="data-card-amount amount ${m.amtCls}">${fmt(m.amt)}</div></div><div class="data-card-actions">${rowActions('payment', m.id)}</div></article>`;
  }

  function renderPayments(house) {
    renderPaymentFilterOptions(house);
    const payments = getFilteredPayments(house);
    const summary = paymentsSummaryForList(payments, house);
    const periodId = els.periodFilter?.value !== 'all' ? els.periodFilter?.value : null;
    const coverage = countCoveredInstallments(house, payments, periodId);
    if (els.paymentsSummary) {
      const ratio = coverage.total ? `${coverage.covered}/${coverage.total} rate coperte` : '— rate';
      els.paymentsSummary.textContent = `${summary.count} versamenti · ${ratio} · Totale ${fmt(summary.total)}`;
    }
    if (!house.payments.length) {
      els.paymentsTable.innerHTML = emptyListHtml('Nessun versamento registrato.');
      return;
    }
    if (!payments.length) {
      els.paymentsTable.innerHTML = emptyListHtml('Nessun versamento per il periodo rata selezionato.');
      return;
    }
    const tableHtml = `<table><thead><tr><th>Esercizio</th><th>Rata</th><th>Data vers.</th><th>Metodo</th><th>Importo</th><th></th></tr></thead><tbody>${payments.map(item => paymentRowHtml(house, item)).join('')}</tbody></table>`;
    const cardsHtml = payments.map(item => paymentCardHtml(house, item)).join('');
    els.paymentsTable.innerHTML = dataListHtml(tableHtml, cardsHtml);
  }

  function renderDashboardPayments(house) {
    if (!els.dashboardPayments) return;
    const periodId = els.periodFilter?.value;
    let payments = [...house.payments].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (periodId && periodId !== 'all') {
      payments = payments.filter(p => p.fiscalPeriodId === periodId);
    }
    if (!payments.length) {
      els.dashboardPayments.innerHTML = emptyListHtml('Nessun versamento nel contesto selezionato.');
      return;
    }
    const slice = payments.slice(0, 8);
    const tableHtml = `<table><thead><tr><th>Esercizio</th><th>Rata</th><th>Data vers.</th><th>Importo</th></tr></thead><tbody>${slice.map(item => {
      const key = item.installmentKey || inferInstallmentKey(house, item);
      const amt = Number(item.amount || 0);
      const amtCls = amt >= 0 ? 'positive' : 'negative';
      return `<tr><td>${periodLabel(house, item.fiscalPeriodId)}</td><td>${installmentShortLabel(house, key)}</td><td>${item.date || '—'}</td><td class="amount ${amtCls}">${fmt(amt)}</td></tr>`;
    }).join('')}</tbody></table>`;
    const cardsHtml = slice.map(item => {
      const key = item.installmentKey || inferInstallmentKey(house, item);
      const amt = Number(item.amount || 0);
      const amtCls = amt >= 0 ? 'positive' : 'negative';
      return `<article class="data-card"><div class="data-card-head"><div><div class="data-card-title">${periodLabel(house, item.fiscalPeriodId)} · ${installmentShortLabel(house, key)}</div><div class="data-card-meta">${item.date || '—'}</div></div><div class="data-card-amount amount ${amtCls}">${fmt(amt)}</div></div></article>`;
    }).join('');
    els.dashboardPayments.innerHTML = dataListHtml(tableHtml, cardsHtml);
  }

  function renderSituazioneSummaryChips(house, totalsRow, report) {
    const consBal = totalsRow?.balanceConsuntivo ?? 0;
    const cons = totalsRow?.consuntivoSettledInNext
      ? { text: consuntivoBalanceFootnote(house, totalsRow), cls: 'success' }
      : situazioneStatusLabel(consBal);
    const consFoot = totalsRow?.consuntivoSettledInNext && Math.abs((totalsRow.balanceConsuntivoRaw ?? 0) - consBal) > 0.005
      ? `${cons.text} (lordo ${fmt(totalsRow.balanceConsuntivoRaw)})`
      : cons.text;
    const chips = [
      ['Preventivo', fmt(totalsRow?.preventivo ?? 0), 'Totale voci'],
      ['Consuntivo', fmt(totalsRow?.consuntivo ?? 0), 'Addebiti consuntivi'],
      ['Versato', fmt(totalsRow?.paid ?? 0), `${report.periodPayments.length} movimenti`],
      ['Saldo consuntivo', fmt(consBal), consFoot, cons.cls],
      ['Saldo rate prev.', fmt(report.slotsBalance), 'Versato − rate', report.slotsBalance >= 0 ? 'positive' : 'negative']
    ];
    return chips.map(([label, value, foot, status]) =>
      `<div class="metric-chip"><span class="muted">${label}</span><strong class="${status || ''}">${value}</strong><span class="hint">${foot}</span></div>`
    ).join('');
  }

  function renderRateTable(slots) {
    if (!slots.length) return '';
    const body = slots.map(slot => {
      const balCls = slot.balance >= 0 ? 'positive' : 'negative';
      const payRows = slot.payments.map(p =>
        `<tr class="situazione-pay-row"><td colspan="2" class="hint">↳ ${p.date || '—'} · ${p.method || '—'}${p.isCarryForward ? ' · Riporto' : ''}</td><td></td><td class="amount ${Number(p.amount) >= 0 ? 'positive' : 'negative'}">${fmt(p.amount)}</td><td></td></tr>`
      ).join('');
      return `<tr><td>${slot.label}</td><td>${slot.dueDescription || '—'}</td><td class="amount">${fmt(slot.amountDue)}</td><td class="amount">${fmt(slot.paid)}</td><td class="amount ${balCls}">${fmt(slot.balance)}</td></tr>${payRows}`;
    }).join('');
    return `<div class="situazione-section"><h3 class="situazione-section-title">Preventivo — dettaglio rate</h3><div class="data-table-wrap"><table><thead><tr><th>Rata</th><th>Voce</th><th>Dovuto</th><th>Versato</th><th>Saldo</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }

  function renderConsuntivoSection(report, totalsRow) {
    if (!report.consuntivoDues.length) return '';
    const rows = report.consuntivoDues.map(d =>
      `<tr><td>${d.description || 'Consuntivo'}</td><td class="amount">${fmt(d.amount)}</td></tr>`
    ).join('');
    const b = totalsRow?.balanceConsuntivo ?? 0;
    const balCls = b >= 0 ? 'positive' : 'negative';
    const saldoNote = totalsRow?.consuntivoSettledInNext
      ? `<div class="hint">${consuntivoBalanceFootnote(house, totalsRow)}</div>` : '';
    return `<div class="situazione-section"><h3 class="situazione-section-title">Consuntivo</h3><div class="data-table-wrap"><table><thead><tr><th>Descrizione</th><th>Importo</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th>Totale consuntivo</th><td class="amount">${fmt(report.consuntivoTotal)}</td></tr><tr><th>Saldo (versato − consuntivo)</th><td class="amount ${balCls}">${fmt(b)}${saldoNote}</td></tr></tfoot></table></div></div>`;
  }

  function renderPeriodPaymentsSection(house, report, title = 'Versamenti esercizio') {
    if (!report.periodPayments.length) return '';
    const rows = [...report.periodPayments]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .map(p => {
        const key = p.installmentKey || inferInstallmentKey(house, p);
        const rata = installmentShortLabel(house, key);
        const cls = Number(p.amount) >= 0 ? 'positive' : 'negative';
        return `<tr><td>${p.date || '—'}</td><td>${p.method || '—'}</td><td>${rata}</td><td class="amount ${cls}">${fmt(p.amount)}</td></tr>`;
      }).join('');
    return `<div class="situazione-section"><h3 class="situazione-section-title">${title}</h3><div class="data-table-wrap"><table><thead><tr><th>Data vers.</th><th>Metodo</th><th>Rata preventivo</th><th>Importo</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="3">Totale versato</th><td class="amount">${fmt(report.paidTotal)}</td></tr></tfoot></table></div></div>`;
  }

  function renderConsuntivoPaymentsSection(house, report) {
    if (!report.consuntivoDues.length || !report.periodPayments.length) return '';
    const rows = [...report.periodPayments]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .map(p => {
        const key = p.installmentKey || inferInstallmentKey(house, p);
        const rata = installmentShortLabel(house, key);
        const cls = Number(p.amount) >= 0 ? 'positive' : 'negative';
        return `<tr><td>${p.date || '—'}</td><td>${p.method || '—'}</td><td>${rata}</td><td class="amount ${cls}">${fmt(p.amount)}</td></tr>`;
      }).join('');
    return `<div class="situazione-section"><h3 class="situazione-section-title">Versamenti esercizio</h3><p class="hint subtle">Contano sul consuntivo dell'esercizio; la rata preventivo resta invariata.</p><div class="data-table-wrap"><table><thead><tr><th>Data vers.</th><th>Metodo</th><th>Rata preventivo</th><th>Importo</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="3">Totale versato</th><td class="amount">${fmt(report.paidTotal)}</td></tr></tfoot></table></div></div>`;
  }

  function renderCarrySection(house, carryDues) {
    if (!carryDues.length) return '';
    const rows = carryDues.map(d => {
      const amtCls = Number(d.amount) < 0 ? 'negative' : '';
      return `<tr><td>${d.description || 'Riporto'}</td><td>${carryFromLabel(house, d)}</td><td class="amount ${amtCls}">${fmt(d.amount)}</td></tr>`;
    }).join('');
    return `<div class="situazione-section"><h3 class="situazione-section-title">Riporti su preventivo</h3><div class="data-table-wrap"><table><thead><tr><th>Descrizione</th><th>Da esercizio</th><th>Importo</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function renderUnlinkedSection(unlinked) {
    if (!unlinked.length) return '';
    const rows = unlinked.map(p => {
      const cls = Number(p.amount) >= 0 ? 'positive' : 'negative';
      return `<tr><td>${p.date || '—'}</td><td>${p.method || '—'}</td><td class="amount ${cls}">${fmt(p.amount)}</td></tr>`;
    }).join('');
    return `<div class="situazione-section"><h3 class="situazione-section-title">Versamenti senza rata</h3><div class="data-table-wrap"><table><thead><tr><th>Data vers.</th><th>Metodo</th><th>Importo</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function syncSituazionePdfKind(house, periodId) {
    if (!els.situazionePdfKind) return;
    const report = buildSituazioneReport(house, periodId);
    const hasCons = hasConsuntivoReport(report);
    const hasPrev = hasPreventivoReport(report);
    const both = hasCons && hasPrev;
    els.situazionePdfKind.classList.toggle('hidden', !both);
    els.situazionePdfBtn?.toggleAttribute('disabled', !hasCons && !hasPrev);

    const resolved = resolveSituazionePdfKind(report, els.situazionePdfKind.value);
    els.situazionePdfKind.value = resolved || defaultSituazionePdfKind(report) || 'consuntivo';
  }

  function renderSituazione(house) {
    if (!els.situazioneSections || !els.situazionePeriod) return;
    const summary = periodSummary(house);
    if (!summary.length) {
      els.situazionePeriod.innerHTML = '';
      if (els.situazioneSummary) els.situazioneSummary.innerHTML = '';
      els.situazioneSections.innerHTML = '<div class="empty">Nessun esercizio registrato.</div>';
      els.situazionePdfKind?.classList.add('hidden');
      els.situazionePdfBtn?.setAttribute('disabled', '');
      return;
    }
    const pending = state.pendingSituazionePeriodId;
    const current = pending || els.situazionePeriod.value;
    els.situazionePeriod.innerHTML = summary.map(s =>
      `<option value="${s.id}" ${s.id === current ? 'selected' : ''}>${s.label}</option>`
    ).join('');
    const periodId = summary.some(s => s.id === current) ? current : summary[0].id;
    els.situazionePeriod.value = periodId;
    if (pending) state.pendingSituazionePeriodId = null;

    const report = buildSituazioneReport(house, periodId);
    const totalsRow = report.totalsRow;
    syncSituazionePdfKind(house, periodId);
    const paymentsOnly = hasPaymentsOnlyReport(report);
    if (!hasConsuntivoReport(report) && !hasPreventivoReport(report) && !paymentsOnly) {
      if (els.situazioneSummary) els.situazioneSummary.innerHTML = '';
      els.situazioneSections.innerHTML = '<div class="empty">Nessun preventivo/consuntivo per questo esercizio.</div>';
      return;
    }

    if (els.situazioneSummary) {
      els.situazioneSummary.innerHTML = renderSituazioneSummaryChips(house, totalsRow, report);
    }
    els.situazioneSections.innerHTML = [
      renderRateTable(report.slots),
      renderConsuntivoSection(report, totalsRow),
      renderConsuntivoPaymentsSection(house, report),
      paymentsOnly ? renderPeriodPaymentsSection(house, report, 'Versamenti registrati') : '',
      renderCarrySection(house, report.carryDues),
      renderUnlinkedSection(report.unlinkedPayments)
    ].filter(Boolean).join('');
  }

  function syncDueKindFields() {
    const isCons = els.dueKind?.value === 'consuntivo';
    els.dueSplitFields?.classList.toggle('hidden', isCons);
    els.dueSplitCustomWrap?.classList.toggle('hidden', isCons || els.dueSplitMode?.value !== 'custom');
  }

  function renderHouseDrawerList() {
    if (!els.houseDrawerList) return;
    if (!state.data.houses.length) {
      els.houseDrawerList.innerHTML = '<div class="empty">Nessun immobile. Creane uno nuovo.</div>';
      return;
    }
    els.houseDrawerList.innerHTML = state.data.houses.map(h => {
      const t = totals(h);
      const active = h.id === state.selectedHouseId ? 'active' : '';
      return `<button type="button" class="house-btn ${active}" data-house-id="${h.id}"><strong>${h.name}</strong><span class="muted">${h.location || '—'}</span><span class="muted">Saldo cons. ${fmt(t.balanceConsuntivo)}</span></button>`;
    }).join('');
  }

  function renderPaymentGuide(house) {
    if (!els.paymentGuidePanel) return;
    const g = computeNextPaymentGuide(house);
    if (!g) {
      els.paymentGuidePanel.innerHTML = '';
      return;
    }
    els.paymentGuidePanel.innerHTML = `
      <div class="guide-card stack">
        <div><strong>Bonifico guidato</strong><p class="hint">${formatPaymentGuideSummary(g)}</p></div>
        <div class="guide-amount amount">${fmt(g.gap)}</div>
        <div class="guide-copy-row"><code id="paymentGuideCausale">${g.causale}</code>
          <button type="button" class="btn btn-secondary btn-sm" id="paymentGuideCopyCausale">Copia causale</button></div>
        <div class="form-actions">
          <button type="button" class="btn btn-primary" id="paymentGuideApply">Precompila versamento</button>
        </div>
      </div>`;
  }

  function renderPostImportBanner() {
    const el = document.getElementById('postImportBanner');
    if (!el) return;
    const hint = state.postImportPaymentHint;
    if (!hint) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div><strong>Import completato.</strong> <span class="muted">Registra il versamento sulla prima rata?</span></div>
      <div class="form-actions" style="margin:0;">
        <button type="button" class="btn btn-primary" id="postImportRegisterPay">Registra versamento</button>
        <button type="button" class="btn btn-secondary" id="postImportDismiss">Chiudi</button>
      </div>`;
  }

  function updateDocumentImportStepper(phase) {
    const steps = document.querySelectorAll('#documentImportStepper .import-step');
    const order = ['upload', 'resoconto', 'review', 'confirm'];
    const idx = order.indexOf(phase);
    steps.forEach(li => {
      const i = order.indexOf(li.dataset.step);
      li.classList.toggle('active', li.dataset.step === phase);
      li.classList.toggle('done', i >= 0 && i < idx);
    });
  }

  function renderMovements(house) {
    const items = [
      ...house.dues.map(item => ({ ...item, type: 'Dovuto', detail: item.description, kind: 'due' })),
      ...house.payments.map(item => ({ ...item, type: 'Versamento', detail: item.method, kind: 'payment' }))
    ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (!items.length) {
      els.movements.innerHTML = '<div class="empty">Nessun movimento registrato per questa casa.</div>';
      return;
    }
    els.movements.innerHTML = `<table><thead><tr><th>Tipo</th><th>Esercizio</th><th>Data</th><th>Dettaglio</th><th>Importo</th><th></th></tr></thead><tbody>${items.map(item =>
      `<tr><td>${item.type}</td><td>${periodLabel(house, item.fiscalPeriodId)}</td><td>${item.date || '—'}</td><td>${item.detail || '—'}</td><td class="amount ${item.type === 'Versamento' ? 'positive' : ''}">${fmt(item.amount)}</td><td>${rowActions(item.kind, item.id)}</td></tr>`
    ).join('')}</tbody></table>`;
  }

  function renderHouseImportParties(house) {
    if (!els.houseImportParties) return;
    const parties = house?.importParties?.length
      ? [...house.importParties]
      : [{ role: 'owner', firstName: '', lastName: '' }];
    const owners = parties.filter(p => p.role === 'owner');
    const tenant = parties.find(p => p.role === 'tenant') || { role: 'tenant', firstName: '', lastName: '' };
    const hasTenant = parties.some(p => p.role === 'tenant');

    let html = '<div id="houseOwnersList" class="stack">';
    owners.forEach((o, i) => {
      html += `<div class="field-grid" data-party-row data-role="owner">
        <div><label>Proprietario ${owners.length > 1 ? i + 1 : ''} — Nome</label>
          <input type="text" data-party-first value="${esc(o.firstName)}" placeholder="Mario" /></div>
        <div><label>Cognome</label>
          <input type="text" data-party-last value="${esc(o.lastName)}" placeholder="Rossi" /></div>
      </div>`;
    });
    html += '</div>';
    html += '<button type="button" class="btn btn-secondary" id="houseAddOwnerBtn">+ Aggiungi proprietario</button>';
    html += `<label class="document-section-toggle" style="margin-top:0.75rem">
      <input type="checkbox" id="houseTenantEnabled" ${hasTenant ? 'checked' : ''} /> Affittuario (somma voci con proprietario in import)
    </label>`;
    html += `<div id="houseTenantFields" class="field-grid ${hasTenant ? '' : 'hidden'}" data-party-row data-role="tenant">
      <div><label>Nome affittuario</label><input type="text" data-party-first value="${esc(tenant.firstName)}" /></div>
      <div><label>Cognome affittuario</label><input type="text" data-party-last value="${esc(tenant.lastName)}" /></div>
    </div>`;
    els.houseImportParties.innerHTML = html;

    els.houseImportParties.querySelector('#houseAddOwnerBtn')?.addEventListener('click', () => {
      const list = els.houseImportParties.querySelector('#houseOwnersList');
      const n = list.querySelectorAll('[data-party-row]').length + 1;
      const row = document.createElement('div');
      row.className = 'field-grid';
      row.dataset.partyRow = '';
      row.dataset.role = 'owner';
      row.innerHTML = `<div><label>Proprietario ${n} — Nome</label><input type="text" data-party-first placeholder="Nome" /></div>
        <div><label>Cognome</label><input type="text" data-party-last placeholder="Cognome" /></div>`;
      list.appendChild(row);
    });
    els.houseImportParties.querySelector('#houseTenantEnabled')?.addEventListener('change', e => {
      els.houseImportParties.querySelector('#houseTenantFields')?.classList.toggle('hidden', !e.target.checked);
    });
  }

  function renderHouseForm(house) {
    state.houseFormMode = 'edit';
    syncHouseFormChrome('edit');
    els.houseForm.name.value = house.name || '';
    els.houseForm.location.value = house.location || '';
    els.houseForm.notes.value = house.notes || '';
    if (els.fiscalStartMonth) els.fiscalStartMonth.value = String(house.fiscalStartMonth || 6);
    renderHouseImportParties(house);
    els.currentHouseTitle.textContent = house.name;
    els.currentHouseMeta.textContent = [house.location || 'Località non indicata', house.notes || 'Nessuna nota'].join(' · ');
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderDocumentImportPreview(house) {
    if (!els.documentImportPreview) return;
    const preview = state.documentImportPreview;
    const busy = state.documentImportBusy;
    const needsResoconto = preview?.filterMode === 'auto' && !preview.resocontoConfirmed;
    if (els.documentImportConfirm) {
      els.documentImportConfirm.disabled = !preview || busy || needsResoconto;
      els.documentImportConfirm.textContent = needsResoconto ? 'Conferma import (dopo resoconto)' : 'Conferma import';
    }
    if (els.documentImportCancel) els.documentImportCancel.classList.toggle('hidden', !preview);
    if (els.documentImportRetry) {
      els.documentImportRetry.classList.toggle('hidden', !state.documentImportLastFiles?.length);
    }
    if (els.documentImportStatus) {
      els.documentImportStatus.textContent = busy
        ? 'Elaborazione documento in corso…'
        : preview
          ? preview.filterMode === 'auto'
            ? `Anteprima: ${preview.sourceLabel}. Verifica il resoconto e conferma.`
            : `Anteprima: ${preview.sourceLabel}. Seleziona la riga che ti riguarda e conferma.`
          : '';
    }
    if (busy) updateDocumentImportStepper('upload');
    else if (!preview) updateDocumentImportStepper('upload');
    else if (preview.filterMode === 'auto' && !preview.resocontoConfirmed) updateDocumentImportStepper('resoconto');
    else if (preview && els.documentImportConfirm && !els.documentImportConfirm.disabled) updateDocumentImportStepper('confirm');
    else updateDocumentImportStepper('review');

    if (!preview) {
      els.documentImportPreview.innerHTML =
        '<div class="empty">Carica un preventivo o consuntivo (PDF, DOCX o foto). Dopo l\'estrazione scegli la tua riga nella tabella.</div>';
      return;
    }
    const ext = preview.extraction;
    ensureResoconto(preview, house);
    const fyConf = ext.fieldConfidence?.fiscalYearLabel;
    const fyLow = fyConf != null && fyConf < 0.7;
    let html = `<div class="document-import-review stack">`;

    if (preview.autoFilterFailed) {
      html += `<div class="banner warn">Nessuna riga corrisponde ai nominativi configurati (${(house.importParties || []).map(partyDisplayName).join(', ')}). Seleziona la riga manualmente o aggiorna i nominativi in Impostazioni → Casa.</div>`;
    }

    html += resocontoHtml(preview.resoconto, {
      editable: true,
      filterMode: preview.filterMode || 'manual'
    });

    const hideTables = preview.filterMode === 'auto' && !preview.showAllRows;
    html += `<div class="field-grid"><div><label for="docImportFiscalLabel">Esercizio fiscale</label>`;
    html += `<input id="docImportFiscalLabel" type="text" value="${esc(ext.fiscalYearLabel)}" class="${fyLow ? 'warn-field' : ''}" /></div></div>`;
    if (ext.extractionNotes) {
      html += `<p class="hint">${esc(ext.extractionNotes)}</p>`;
    }
    if (hideTables) {
      html += `<p class="hint">Righe filtrate automaticamente. Usa «Mostra tutte le righe» nel resoconto per modificare la selezione.</p></div>`;
      els.documentImportPreview.innerHTML = html;
      bindDocumentImportPreviewEvents(house, preview, ext);
      return;
    }

    for (const section of ext.sections || []) {
      const rowsSource = section._allRows?.length ? section._allRows : section.rows;
      const kind = section.documentKind;
      const kindLabel = kind === 'consuntivo' ? 'Consuntivo' : 'Preventivo';
      const checked = preview.confirmedSections?.[kind] ? 'checked' : '';
      const rowIdx = preview.selectedRowIndex?.[kind] ?? 0;
      if (!section.rows?.length) {
        if (!preview.manualRows) preview.manualRows = {};
        if (!preview.manualRows[kind]) {
          preview.manualRows[kind] = {
            label: 'Inserimento manuale',
            unit: '',
            total: 0,
            installments: [],
            confidence: 1
          };
        }
        section.rows = [preview.manualRows[kind]];
      }
      const secLow = section.confidence != null && section.confidence < 0.7;
      html += `<div class="card stack document-import-section" data-kind="${kind}">`;
      html += `<label class="document-section-toggle"><input type="checkbox" class="doc-section-confirm" data-kind="${kind}" ${checked} /> <strong>${kindLabel}</strong>`;
      if (secLow) html += ` <span class="badge warn">estrazione incerta</span>`;
      html += `</label>`;
      html += `<table><thead><tr><th></th><th>Condomino / unità</th><th>Millesimi</th><th>Totale</th><th>Rate</th></tr></thead><tbody>`;
      rowsSource.forEach((row, i) => {
        const sel = i === rowIdx ? 'checked' : '';
        const rowLow = row.confidence != null && row.confidence < 0.7;
        const inst = row.installments?.length
          ? row.installments.map(x => `${esc(x.label || x.periodStart)}: ${fmt(x.amount)}`).join('<br/>')
          : '—';
        html += `<tr class="doc-row-selectable ${i === rowIdx ? 'row-selected' : ''} ${rowLow ? 'row-warn' : ''}" data-kind="${kind}" data-idx="${i}">`;
        html += `<td><input type="radio" name="docRow-${kind}" class="doc-row-radio" data-kind="${kind}" data-idx="${i}" ${sel} /></td>`;
        html += `<td><strong>${esc(row.label)}</strong>${row.unit ? `<div class="hint">${esc(row.unit)}</div>` : ''}</td>`;
        html += `<td>${row.millesimi != null ? row.millesimi : '—'}</td>`;
        html += `<td class="amount">${fmt(row.total)}</td>`;
        html += `<td class="hint">${inst}</td></tr>`;
      });
      html += `</tbody></table>`;
      const selected = rowsSource[rowIdx];
      if (selected) {
        html += `<div class="doc-row-edit stack" data-kind="${kind}">`;
        html += `<p class="hint">Modifica i valori della riga selezionata prima di confermare.</p>`;
        html += `<div class="field-grid"><div><label>Totale (€)</label>`;
        html += `<input type="number" step="0.01" class="doc-edit-total" data-kind="${kind}" value="${Number(selected.total || 0)}" /></div></div>`;
        if (kind === 'preventivo' && selected.installments?.length) {
          html += `<table class="doc-installments-edit"><thead><tr><th>Rata</th><th>Data inizio</th><th>Importo (€)</th></tr></thead><tbody>`;
          selected.installments.forEach((inst, ii) => {
            html += `<tr><td><input type="text" class="doc-edit-inst-label" data-kind="${kind}" data-ii="${ii}" value="${esc(inst.label || '')}" /></td>`;
            html += `<td><input type="date" class="doc-edit-inst-date" data-kind="${kind}" data-ii="${ii}" value="${esc(inst.periodStart || '')}" /></td>`;
            html += `<td><input type="number" step="0.01" class="doc-edit-inst-amount" data-kind="${kind}" data-ii="${ii}" value="${Number(inst.amount || 0)}" /></td></tr>`;
          });
          html += `</tbody></table>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    els.documentImportPreview.innerHTML = html;
    bindDocumentImportPreviewEvents(house, preview, ext);
  }

  function bindResocontoFields(preview, house) {
    const r = preview.resoconto;
    if (!r) return;
    const bind = (sel, key, parser = v => v) => {
      els.documentImportPreview.querySelectorAll(sel).forEach(el => {
        el.addEventListener('input', e => {
          r[key] = parser(e.target.value);
        });
      });
    };
    bind('.resoconto-field[data-field="resocontoPrevBalance"]', 'previousBalance', v => (v === '' ? null : Number(v)));
    bind('.resoconto-field[data-field="resocontoPrevExerciseLabel"]', 'previousExerciseLabel', v => String(v).trim());
    bind('.resoconto-field[data-field="resocontoPrevExerciseTotal"]', 'previousExerciseTotal', v => (v === '' ? null : Number(v)));
    bind('.resoconto-field[data-field="resocontoPreventivo"]', 'preventivoTotal', v => (v === '' ? null : Number(v)));
    bind('.resoconto-field[data-field="resocontoConsuntivo"]', 'consuntivoTotal', v => (v === '' ? null : Number(v)));
    els.documentImportPreview.querySelector('#resocontoApplyCarryover')?.addEventListener('change', e => {
      r.applyCarryover = e.target.checked;
    });
    els.documentImportPreview.querySelectorAll('.resoconto-inst-amount').forEach(el => {
      el.addEventListener('input', e => {
        const ii = Number(e.target.dataset.ii);
        if (r.installments?.[ii]) r.installments[ii].amount = Number(e.target.value);
      });
    });
    els.documentImportPreview.querySelectorAll('.resoconto-inst-date').forEach(el => {
      el.addEventListener('input', e => {
        const ii = Number(e.target.dataset.ii);
        if (r.installments?.[ii]) r.installments[ii].periodStart = e.target.value;
      });
    });
    els.documentImportPreview.querySelectorAll('.resoconto-inst-label').forEach(el => {
      el.addEventListener('input', e => {
        const ii = Number(e.target.dataset.ii);
        if (r.installments?.[ii]) r.installments[ii].label = e.target.value;
      });
    });
    els.documentImportPreview.querySelector('#docResocontoConfirmBtn')?.addEventListener('click', () => {
      preview.resocontoConfirmed = true;
      renderDocumentImportPreview(house);
    });
    els.documentImportPreview.querySelector('#docShowAllRowsBtn')?.addEventListener('click', () => {
      preview.showAllRows = true;
      renderDocumentImportPreview(house);
    });
  }

  function bindDocumentImportPreviewEvents(house, preview, ext) {
    bindResocontoFields(preview, house);

    els.documentImportPreview.querySelector('#docImportFiscalLabel')?.addEventListener('change', e => {
      preview.extraction.fiscalYearLabel = e.target.value;
      if (preview.resoconto) preview.resoconto.fiscalYearLabel = e.target.value;
    });
    els.documentImportPreview.querySelector('#docImportFiscalLabel')?.addEventListener('input', e => {
      preview.extraction.fiscalYearLabel = e.target.value;
      if (preview.resoconto) preview.resoconto.fiscalYearLabel = e.target.value;
    });
    els.documentImportPreview.querySelectorAll('.doc-section-confirm').forEach(el => {
      el.addEventListener('change', e => {
        const kind = e.target.dataset.kind;
        preview.confirmedSections[kind] = e.target.checked;
      });
    });
    els.documentImportPreview.querySelectorAll('.doc-row-radio').forEach(el => {
      el.addEventListener('change', e => {
        const kind = e.target.dataset.kind;
        const idx = Number(e.target.dataset.idx);
        preview.selectedRowIndex[kind] = idx;
        const section = ext.sections.find(s => s.documentKind === kind);
        const rowsSource = section?._allRows?.length ? section._allRows : section?.rows;
        if (section && rowsSource?.[idx] && preview.filterMode === 'auto') {
          section.rows = [rowsSource[idx]];
          preview.selectedRowIndex[kind] = 0;
          ensureResoconto(preview, house);
        }
        renderDocumentImportPreview(house);
      });
    });
    els.documentImportPreview.querySelectorAll('.doc-edit-total').forEach(el => {
      el.addEventListener('input', e => {
        const kind = e.target.dataset.kind;
        const section = ext.sections.find(s => s.documentKind === kind);
        const row = section?.rows?.[preview.selectedRowIndex?.[kind] ?? 0];
        if (row) row.total = Number(e.target.value);
      });
    });
    els.documentImportPreview.querySelectorAll('.doc-edit-inst-amount, .doc-edit-inst-date, .doc-edit-inst-label').forEach(el => {
      el.addEventListener('input', e => {
        const kind = e.target.dataset.kind;
        const ii = Number(e.target.dataset.ii);
        const section = ext.sections.find(s => s.documentKind === kind);
        const row = section?.rows?.[preview.selectedRowIndex?.[kind] ?? 0];
        const inst = row?.installments?.[ii];
        if (!inst) return;
        if (e.target.classList.contains('doc-edit-inst-amount')) inst.amount = Number(e.target.value);
        if (e.target.classList.contains('doc-edit-inst-date')) inst.periodStart = e.target.value;
        if (e.target.classList.contains('doc-edit-inst-label')) inst.label = e.target.value;
      });
    });
  }

  function renderBankImportPreview(house) {
    if (!els.bankImportPreview) return;
    const preview = state.bankImportPreview;
    if (!preview.length) {
      els.bankImportPreview.innerHTML = '<div class="empty">Carica un file Excel Intesa per vedere l\'anteprima.</div>';
      return;
    }
    const periodOpts = (selected) => house.fiscalPeriods.map(p =>
      `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.label}</option>`
    ).join('') || '<option value="">—</option>';

    els.bankImportPreview.innerHTML = `<table><thead><tr><th></th><th>Data</th><th>Operazione</th><th>Importo</th><th>Match</th><th>Esercizio</th></tr></thead><tbody>${preview.map((row, idx) => {
      const cls = row.ineligible ? 'error' : row.status === 'suggested' ? 'success' : 'warn';
      const periodCell = row.ineligible
        ? `<span class="muted">—</span>`
        : row.manualPeriodId || row.suggestedFiscalPeriodId
          ? `<select class="import-period" data-idx="${idx}">${periodOpts(row.manualPeriodId || row.suggestedFiscalPeriodId)}</select>`
          : `<span class="hint">${row.suggestedLabel || '—'} (al conferma)</span>`;
      return `<tr data-idx="${idx}" class="${row.ineligible ? 'row-ineligible' : ''}"><td><input type="checkbox" class="import-select" data-idx="${idx}" ${row.selected ? 'checked' : ''} ${row.ineligible ? 'disabled' : ''} /></td><td>${row.movementDate}</td><td><strong>${row.operation || '—'}</strong><div class="hint">${row.details || ''}</div></td><td class="amount">${fmt(row.amount)}</td><td><span class="badge ${cls}">${row.matchConfidence ?? 0} · ${row.status}</span><div class="hint">${row.matchReason || ''}</div></td><td>${periodCell}</td></tr>`;
    }).join('')}</tbody></table>`;

    els.bankImportPreview.querySelectorAll('.import-select').forEach(el => {
      el.addEventListener('change', e => {
        const i = Number(e.target.dataset.idx);
        state.bankImportPreview[i].selected = e.target.checked;
      });
    });
    els.bankImportPreview.querySelectorAll('.import-period').forEach(el => {
      el.addEventListener('change', e => {
        const i = Number(e.target.dataset.idx);
        state.bankImportPreview[i].manualPeriodId = e.target.value || null;
        state.bankImportPreview[i].selected = !!e.target.value;
        const cb = els.bankImportPreview.querySelector(`.import-select[data-idx="${i}"]`);
        if (cb) cb.checked = state.bankImportPreview[i].selected;
      });
    });
  }

  function listBankImportBatches(house) {
    const byBatch = new Map();
    for (const m of house.bankMovements) {
      if (!m.importBatchId) continue;
      let batch = byBatch.get(m.importBatchId);
      if (!batch) {
        batch = {
          id: m.importBatchId,
          movements: [],
          linked: 0,
          unlinked: 0,
          importedAt: m.createdAt
        };
        byBatch.set(m.importBatchId, batch);
      }
      batch.movements.push(m);
      if (m.status === 'linked') batch.linked += 1;
      else if (m.status === 'unlinked') batch.unlinked += 1;
      if (m.createdAt && (!batch.importedAt || m.createdAt < batch.importedAt)) {
        batch.importedAt = m.createdAt;
      }
    }
    return [...byBatch.values()]
      .map(b => {
        const dates = b.movements.map(m => m.movementDate).filter(Boolean).sort();
        return {
          ...b,
          count: b.movements.length,
          periodFrom: dates[0] || '—',
          periodTo: dates[dates.length - 1] || '—'
        };
      })
      .sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')));
  }

  function renderBankImportBatches(house) {
    if (!els.bankImportBatches) return;
    const batches = listBankImportBatches(house);
    if (!batches.length) {
      els.bankImportBatches.innerHTML = '<div class="empty">Nessun import banca salvato per questo immobile.</div>';
      if (els.bankImportDeleteAll) els.bankImportDeleteAll.disabled = true;
      return;
    }
    if (els.bankImportDeleteAll) els.bankImportDeleteAll.disabled = false;
    const importedLabel = iso => {
      if (!iso) return '—';
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    };
    els.bankImportBatches.innerHTML = `<table><thead><tr><th>Importato il</th><th>Periodo movimenti</th><th>Movimenti</th><th>Collegati</th><th></th></tr></thead><tbody>${batches.map(b =>
      `<tr><td>${importedLabel(b.importedAt)}</td><td>${b.periodFrom === b.periodTo ? b.periodFrom : `${b.periodFrom} – ${b.periodTo}`}</td><td>${b.count}</td><td>${b.linked}</td><td><button type="button" class="btn btn-danger delete-batch-btn" data-batch="${b.id}">Elimina import</button></td></tr>`
    ).join('')}</tbody></table>`;
  }

  function renderUnlinkedMovements(house) {
    if (!els.unlinkedMovements) return;
    const rows = house.bankMovements.filter(m => m.status === 'unlinked');
    if (!rows.length) {
      els.unlinkedMovements.innerHTML = '<div class="empty">Nessun movimento in attesa di associazione.</div>';
      return;
    }
    const opts = house.fiscalPeriods.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
    els.unlinkedMovements.innerHTML = `<table><thead><tr><th>Data</th><th>Dettaglio</th><th>Importo</th><th>Esercizio</th><th></th></tr></thead><tbody>${rows.map(r =>
      `<tr><td>${r.movementDate}</td><td>${r.operation}<div class="hint">${r.details}</div></td><td class="amount">${fmt(r.amount)}</td><td><select class="link-period" data-id="${r.id}">${opts}</select></td><td><button class="btn btn-secondary link-btn" data-id="${r.id}">Associa</button></td></tr>`
    ).join('')}</tbody></table>`;
  }

  function renderEmptyState() {
    els.currentHouseTitle.textContent = 'Nessuna casa selezionata';
    els.currentHouseMeta.textContent = 'Aggiungi un immobile con il pulsante accanto al menu o da Impostazioni → Immobili.';
    els.metrics.innerHTML = '<div class="empty" style="grid-column:1 / -1;">Nessun immobile registrato.<br/><button type="button" class="btn btn-primary" id="emptyAddHouseBtn" style="margin-top:1rem;">Aggiungi immobile</button></div>';
    els.annualTableWrap.innerHTML = '<div class="empty">Nessuna annualità disponibile.</div>';
    els.annualCards.innerHTML = '<div class="empty">Nessun saldo disponibile.</div>';
    els.annualPageCards.innerHTML = '<div class="empty">Nessuna annualità registrata.</div>';
    els.paymentsTable.innerHTML = '<div class="empty">Nessun versamento registrato.</div>';
    if (els.paymentsSummary) els.paymentsSummary.textContent = '';
    if (els.dashboardPayments) els.dashboardPayments.innerHTML = '<div class="empty">Nessun versamento.</div>';
    if (els.situazioneSummary) els.situazioneSummary.innerHTML = '';
    if (els.situazioneSections) els.situazioneSections.innerHTML = '<div class="empty">Nessuna situazione disponibile.</div>';
    if (els.duesTable) els.duesTable.innerHTML = '<div class="empty">Nessun dovuto registrato.</div>';
    els.movements.innerHTML = '<div class="empty">Nessun movimento da mostrare.</div>';
    if (state.houseFormMode === 'new') renderNewHouseForm();
    else {
      els.houseForm?.reset();
      syncHouseFormChrome('edit');
      els.deleteHouseBtn?.classList.add('hidden');
    }
    renderComplianceHero({ fiscalPeriods: [], dues: [], payments: [] });
    els.metrics.querySelector('#emptyAddHouseBtn')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('app:start-new-house'));
    });
  }

  function render(authRenderAccount) {
    if (!state.selectedHouseId && state.data.houses[0]) state.selectedHouseId = state.data.houses[0].id;
    renderHouseList();
    if (state.houseFormMode === 'new') {
      renderNewHouseForm();
      if (state.currentView === 'impostazioni' && state.currentSubview === 'account') authRenderAccount?.();
      return;
    }
    const house = activeHouse();
    if (!house) { renderEmptyState(); return; }
    const safe = (label, fn) => { try { fn(); } catch (e) { console.error('[render]', label, e); } };
    safe('complianceHero', () => renderComplianceHero(house));
    safe('metrics', () => renderMetrics(house));
    safe('annualBlocks', () => renderAnnualBlocks(house));
    safe('houseDrawerList', () => renderHouseDrawerList());
    safe('paymentGuide', () => renderPaymentGuide(house));
    safe('postImportBanner', () => renderPostImportBanner());
    safe('dues', () => renderDues(house));
    safe('payments', () => renderPayments(house));
    safe('dashboardPayments', () => renderDashboardPayments(house));
    safe('situazione', () => renderSituazione(house));
    safe('movements', () => renderMovements(house));
    safe('houseForm', () => renderHouseForm(house));
    safe('periodSelects', () => renderPeriodSelects(house));
    safe('documentImportPreview', () => renderDocumentImportPreview(house));
    safe('bankImportPreview', () => renderBankImportPreview(house));
    safe('bankImportBatches', () => renderBankImportBatches(house));
    safe('unlinkedMovements', () => renderUnlinkedMovements(house));
    if (state.currentView === 'impostazioni' && state.currentSubview === 'account') authRenderAccount?.();
  }

  return {
    setView,
    render,
    renderDocumentImportPreview,
    renderBankImportPreview,
    renderUnlinkedMovements,
    syncPaymentPeriodSelect,
    syncPaymentCarryFromSelect,
    syncPaymentInstallmentSelect,
    syncDueKindFields,
    syncDuePeriodSelect,
    applyPaymentSmartAmount,
    renderNewHouseForm
  };
}

export function collectDom() {
  return {
    loginScreen: document.getElementById('loginScreen'),
    recoveryScreen: document.getElementById('recoveryScreen'),
    appShell: document.getElementById('appShell'),
    loginForm: document.getElementById('loginForm'),
    recoveryForm: document.getElementById('recoveryForm'),
    accountPasswordForm: document.getElementById('accountPasswordForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    recoveryPassword: document.getElementById('recoveryPassword'),
    recoveryPasswordConfirm: document.getElementById('recoveryPasswordConfirm'),
    accountPassword: document.getElementById('accountPassword'),
    accountPasswordConfirm: document.getElementById('accountPasswordConfirm'),
    loginSubmitBtn: document.getElementById('loginSubmitBtn'),
    recoverySubmitBtn: document.getElementById('recoverySubmitBtn'),
    accountPasswordSubmitBtn: document.getElementById('accountPasswordSubmitBtn'),
    loginError: document.getElementById('loginError'),
    recoveryError: document.getElementById('recoveryError'),
    recoverySuccess: document.getElementById('recoverySuccess'),
    accountPasswordError: document.getElementById('accountPasswordError'),
    accountPasswordSuccess: document.getElementById('accountPasswordSuccess'),
    accountEmail: document.getElementById('accountEmail'),
    recoverySubtitle: document.getElementById('recoverySubtitle'),
    loginThemeToggle: document.getElementById('loginThemeToggle'),
    recoveryThemeToggle: document.getElementById('recoveryThemeToggle'),
    userChip: document.getElementById('userMenuBtn'),
    userMenuBtn: document.getElementById('userMenuBtn'),
    userMenu: document.getElementById('userMenu'),
    houseSelect: document.getElementById('houseSelect'),
    headerAddHouseBtn: document.getElementById('headerAddHouseBtn'),
    housesManageList: document.getElementById('housesManageList'),
    addHouseSettingsBtn: document.getElementById('addHouseSettingsBtn'),
    houseFormTitle: document.getElementById('houseFormTitle'),
    houseFormSubtitle: document.getElementById('houseFormSubtitle'),
    houseSubmitBtn: document.getElementById('houseSubmitBtn'),
    quickAddFab: document.getElementById('quickAddFab'),
    quickAddSheet: document.getElementById('quickAddSheet'),
    quickAddBackdrop: document.getElementById('quickAddBackdrop'),
    quickAddClose: document.getElementById('quickAddClose'),
    main: document.getElementById('mainContent'),
    complianceHero: document.getElementById('complianceHero'),
    metrics: document.getElementById('metrics'),
    annualTableWrap: document.getElementById('annualTableWrap'),
    annualCards: document.getElementById('annualCards'),
    annualPageCards: document.getElementById('annualPageCards'),
    movements: document.getElementById('movementsAdv'),
    currentHouseTitle: document.getElementById('currentHouseTitle'),
    currentHouseMeta: document.getElementById('currentHouseMeta'),
    deleteHouseBtn: document.getElementById('deleteHouseBtn'),
    periodFilter: document.getElementById('periodFilter'),
    dueForm: document.getElementById('dueForm'),
    paymentForm: document.getElementById('paymentForm'),
    houseForm: document.getElementById('houseForm'),
    houseImportParties: document.getElementById('houseImportParties'),
    fiscalStartMonth: document.getElementById('fiscalStartMonth'),
    exportBtn: document.getElementById('exportBtnAdv'),
    importFile: document.getElementById('importFileAdv'),
    documentImportFile: document.getElementById('documentImportFile'),
    documentImportConfirm: document.getElementById('documentImportConfirm'),
    documentImportManual: document.getElementById('documentImportManual'),
    documentImportCancel: document.getElementById('documentImportCancel'),
    documentImportRetry: document.getElementById('documentImportRetry'),
    documentImportDupDialog: document.getElementById('documentImportDupDialog'),
    documentImportDupMsg: document.getElementById('documentImportDupMsg'),
    documentImportDupAdd: document.getElementById('documentImportDupAdd'),
    documentImportDupReplace: document.getElementById('documentImportDupReplace'),
    documentImportDupCancel: document.getElementById('documentImportDupCancel'),
    documentImportPreview: document.getElementById('documentImportPreview'),
    documentImportStatus: document.getElementById('documentImportStatus'),
    bankImportFile: document.getElementById('bankImportFile'),
    bankImportConfirm: document.getElementById('bankImportConfirm'),
    bankImportPreview: document.getElementById('bankImportPreview'),
    bankImportBatches: document.getElementById('bankImportBatches'),
    bankImportDeleteAll: document.getElementById('bankImportDeleteAll'),
    unlinkedMovements: document.getElementById('unlinkedMovements'),
    demoBtn: document.getElementById('demoBtn'),
    duePeriod: document.getElementById('duePeriod'),
    duePeriodNew: document.getElementById('duePeriodNew'),
    duePeriodNewWrap: document.getElementById('duePeriodNewWrap'),
    duePeriodHint: document.getElementById('duePeriodHint'),
    paymentGuidePanel: document.getElementById('paymentGuidePanel'),
    houseDrawer: document.getElementById('houseDrawer'),
    houseDrawerBackdrop: document.getElementById('houseDrawerBackdrop'),
    houseDrawerList: document.getElementById('houseDrawerList'),
    openHouseDrawerBtn: document.getElementById('openHouseDrawerBtn'),
    openDueFormSheet: document.getElementById('openDueFormSheet'),
    closeDueFormSheet: document.getElementById('closeDueFormSheet'),
    dueFormPaneBackdrop: document.getElementById('dueFormPaneBackdrop'),
    openPaymentFormSheet: document.getElementById('openPaymentFormSheet'),
    closePaymentFormSheet: document.getElementById('closePaymentFormSheet'),
    paymentFormPaneBackdrop: document.getElementById('paymentFormPaneBackdrop'),
    houseDrawerClose: document.getElementById('houseDrawerClose'),
    houseDrawerAdd: document.getElementById('houseDrawerAdd'),
    paymentCarryWrap: document.getElementById('paymentCarryWrap'),
    paymentCarryToggle: document.getElementById('paymentCarryToggle'),
    dueEditId: document.getElementById('dueEditId'),
    dueSubmitBtn: document.getElementById('dueSubmitBtn'),
    dueFormCancel: document.getElementById('dueFormCancel'),
    duesTable: document.getElementById('duesTable'),
    paymentPeriod: document.getElementById('paymentPeriod'),
    paymentCarryFrom: document.getElementById('paymentCarryFrom'),
    paymentDate: document.getElementById('paymentDate'),
    paymentEditId: document.getElementById('paymentEditId'),
    paymentSubmitBtn: document.getElementById('paymentSubmitBtn'),
    paymentFormCancel: document.getElementById('paymentFormCancel'),
    paymentsTable: document.getElementById('paymentsTable'),
    paymentInstallment: document.getElementById('paymentInstallment'),
    paymentFilterYear: document.getElementById('paymentFilterYear'),
    paymentFilterMonth: document.getElementById('paymentFilterMonth'),
    paymentsSummary: document.getElementById('paymentsSummary'),
    dashboardPayments: document.getElementById('dashboardPayments'),
    situazionePeriod: document.getElementById('situazionePeriod'),
    situazioneSummary: document.getElementById('situazioneSummary'),
    situazioneSections: document.getElementById('situazioneSections'),
    situazionePdfBtn: document.getElementById('situazionePdfBtn'),
    situazionePdfKind: document.getElementById('situazionePdfKind'),
    dueSplitMode: document.getElementById('dueSplitMode'),
    dueSplitCustom: document.getElementById('dueSplitCustom'),
    dueSplitCustomWrap: document.getElementById('dueSplitCustomWrap'),
    dueKind: document.getElementById('dueKind'),
    dueSplitFields: document.getElementById('dueSplitFields'),
    navButtons: [...document.querySelectorAll('.nav-rail [data-view], .bottom-nav [data-view]')],
    subviewTabs: [...document.querySelectorAll('[data-subview]')],
    subviewPanels: [...document.querySelectorAll('[data-subview-panel]')],
    viewPanels: [...document.querySelectorAll('[data-view-panel]')],
    viewTitle: document.getElementById('viewTitle'),
    viewSubtitle: document.getElementById('viewSubtitle'),
    authStatus: document.getElementById('authStatus'),
    logoutBtn: document.getElementById('logoutBtn')
  };
}
