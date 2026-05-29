import { resolveView, viewHeading, viewMeta } from './config.js';
import { DUE_KINDS, periodLabel, periodSummary, totals, findPeriodByDate, defaultFiscalLabel } from './fiscal.js';
import {
  SPLIT_MODES,
  filterPaymentsByInstallmentPeriod,
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
  hasPreventivoReport,
  resolveSituazionePdfKind,
  situazioneStatusLabel
} from './situazione-report.js';
import { activeHouse, state } from './state.js';
import { fmt, today } from './utils.js';

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

  function syncNavActive(view) {
    els.navButtons.forEach(btn => {
      const active = btn.dataset.view === view;
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

    syncNavActive(view);
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
  }

  function periodOptions(house, selectedId) {
    if (!house.fiscalPeriods.length) return '';
    return house.fiscalPeriods.map(p =>
      `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.label} (${p.startDate} → ${p.endDate})</option>`
    ).join('');
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

  function renderDueFormDefaults(house) {
    if (!els.duePeriodLabel) return;
    const suggested = defaultFiscalLabel(house);
    if (!els.duePeriodLabel.value) els.duePeriodLabel.placeholder = `es. ${suggested}`;
    if (els.duePeriodHint) {
      els.duePeriodHint.textContent = `Formato: ${suggested} (mese inizio ${house.fiscalStartMonth ?? 6})`;
    }
  }

  function renderPeriodSelects(house) {
    renderDueFormDefaults(house);
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

  function renderMetrics(house) {
    const periodId = activePeriodFilterId();
    const t = totals(house, periodId);
    const scope = periodId ? periodLabel(house, periodId) : 'Tutti gli esercizi';
    const metricData = [
      ['Preventivo', fmt(t.preventivo), scope],
      ['Consuntivo', fmt(t.consuntivo), periodId ? 'Addebiti consuntivi' : `${t.dueCount} voci dovuto`],
      ['Versato', fmt(t.paid), `${t.paymentCount} versamenti`],
      ['Saldo consuntivo', fmt(t.balanceConsuntivo), t.balanceConsuntivo >= 0 ? 'Eccedenza su consuntivo' : 'Debito su consuntivo', t.balanceConsuntivo >= 0 ? 'positive' : 'negative']
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
        const status = b > 0 ? ['Eccedenza', 'success'] : b < 0 ? ['In debito', 'error'] : ['Pareggio', 'warn'];
        return `<tr><td>${item.label}<div class="hint">${item.startDate || ''} → ${item.endDate || ''}</div></td><td class="amount">${fmt(item.preventivo)}</td><td class="amount">${fmt(item.consuntivo)}</td><td class="amount">${fmt(item.paid)}</td><td class="amount ${b >= 0 ? 'positive' : 'negative'}">${fmt(b)}</td><td><span class="badge ${status[1]}">${status[0]}</span></td></tr>`;
      }).join('')}</tbody></table>`;
    }
    const cardsSource = els.periodFilter.value === 'all' ? summary : filtered;
    const cards = cardsSource.length
      ? `<div class="annual-list">${cardsSource.map(item => {
        const b = item.balanceConsuntivo;
        const cls = b > 0 ? 'success' : b < 0 ? 'error' : 'warn';
        const label = b > 0 ? 'Eccedenza' : b < 0 ? 'Debito' : 'Pareggio';
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
      els.duesTable.innerHTML = '<div class="empty">Nessun dovuto registrato.</div>';
      return;
    }
    els.duesTable.innerHTML = `<table><thead><tr><th>Esercizio</th><th>Tipo</th><th>Descrizione</th><th>Ripartizione</th><th>Importo</th><th></th></tr></thead><tbody>${dues.map(item => {
      const kind = DUE_KINDS[item.dueKind || 'preventivo']?.label || item.dueKind;
      const splitLabel = item.dueKind === 'consuntivo' ? '—' : (SPLIT_MODES[item.splitMode]?.label || (item.splitMode === 'custom' ? 'Custom' : 'Mensile'));
      const carry = item.carryFromPeriodId ? ' <span class="badge warn">Riporto</span>' : '';
      const amtCls = Number(item.amount) < 0 ? 'negative' : '';
      return `<tr><td>${periodLabel(house, item.fiscalPeriodId)}</td><td>${kind}${carry}</td><td>${item.description || '—'}</td><td>${splitLabel}</td><td class="amount ${amtCls}">${fmt(item.amount)}</td><td>${rowActions('due', item.id)}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  function paymentRowHtml(house, item) {
    const key = item.installmentKey || inferInstallmentKey(house, item);
    const rata = installmentShortLabel(house, key);
    const inferred = !item.installmentKey && key;
    const amt = Number(item.amount || 0);
    const amtCls = amt >= 0 ? 'positive' : 'negative';
    const carry = item.isCarryForward ? ' <span class="badge warn">Riporto</span>' : '';
    const rataCell = inferred ? `${rata} <span class="hint">(stimata)</span>` : rata;
    return `<tr><td>${periodLabel(house, item.fiscalPeriodId)}</td><td>${rataCell}${carry}</td><td>${item.date || '—'}</td><td>${item.method || '—'}</td><td class="amount ${amtCls}">${fmt(amt)}</td><td>${rowActions('payment', item.id)}</td></tr>`;
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
      els.paymentsTable.innerHTML = '<div class="empty">Nessun versamento registrato.</div>';
      return;
    }
    if (!payments.length) {
      els.paymentsTable.innerHTML = '<div class="empty">Nessun versamento per il periodo rata selezionato.</div>';
      return;
    }
    els.paymentsTable.innerHTML = `<table><thead><tr><th>Esercizio</th><th>Rata</th><th>Data vers.</th><th>Metodo</th><th>Importo</th><th></th></tr></thead><tbody>${payments.map(item => paymentRowHtml(house, item)).join('')}</tbody></table>`;
  }

  function renderDashboardPayments(house) {
    if (!els.dashboardPayments) return;
    const periodId = els.periodFilter?.value;
    let payments = [...house.payments].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (periodId && periodId !== 'all') {
      payments = payments.filter(p => p.fiscalPeriodId === periodId);
    }
    if (!payments.length) {
      els.dashboardPayments.innerHTML = '<div class="empty">Nessun versamento nel contesto selezionato.</div>';
      return;
    }
    els.dashboardPayments.innerHTML = `<table><thead><tr><th>Esercizio</th><th>Rata</th><th>Data vers.</th><th>Importo</th></tr></thead><tbody>${payments.map(item => {
      const key = item.installmentKey || inferInstallmentKey(house, item);
      const amt = Number(item.amount || 0);
      const amtCls = amt >= 0 ? 'positive' : 'negative';
      return `<tr><td>${periodLabel(house, item.fiscalPeriodId)}</td><td>${installmentShortLabel(house, key)}</td><td>${item.date || '—'}</td><td class="amount ${amtCls}">${fmt(amt)}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  function renderSituazioneSummaryChips(totalsRow, report) {
    const cons = situazioneStatusLabel(totalsRow?.balanceConsuntivo ?? 0);
    const prev = situazioneStatusLabel(totalsRow?.balancePreventivo ?? 0);
    const chips = [
      ['Preventivo', fmt(totalsRow?.preventivo ?? 0), 'Totale voci'],
      ['Consuntivo', fmt(totalsRow?.consuntivo ?? 0), 'Addebiti consuntivi'],
      ['Versato', fmt(totalsRow?.paid ?? 0), `${report.periodPayments.length} movimenti`],
      ['Saldo consuntivo', fmt(totalsRow?.balanceConsuntivo ?? 0), cons.text, cons.cls],
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
    return `<div class="situazione-section"><h3 class="situazione-section-title">Consuntivo</h3><div class="data-table-wrap"><table><thead><tr><th>Descrizione</th><th>Importo</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th>Totale consuntivo</th><td class="amount">${fmt(report.consuntivoTotal)}</td></tr><tr><th>Saldo (versato − consuntivo)</th><td class="amount ${balCls}">${fmt(b)}</td></tr></tfoot></table></div></div>`;
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
    const current = els.situazionePeriod.value;
    els.situazionePeriod.innerHTML = summary.map(s =>
      `<option value="${s.id}" ${s.id === current ? 'selected' : ''}>${s.label}</option>`
    ).join('');
    const periodId = els.situazionePeriod.value || summary[0].id;
    if (!els.situazionePeriod.value) els.situazionePeriod.value = periodId;

    const report = buildSituazioneReport(house, periodId);
    const totalsRow = report.totalsRow;
    syncSituazionePdfKind(house, periodId);
    if (!hasConsuntivoReport(report) && !hasPreventivoReport(report)) {
      if (els.situazioneSummary) els.situazioneSummary.innerHTML = '';
      els.situazioneSections.innerHTML = '<div class="empty">Nessun preventivo/consuntivo per questo esercizio.</div>';
      return;
    }

    if (els.situazioneSummary) {
      els.situazioneSummary.innerHTML = renderSituazioneSummaryChips(totalsRow, report);
    }
    els.situazioneSections.innerHTML = [
      renderRateTable(report.slots),
      renderConsuntivoSection(report, totalsRow),
      renderConsuntivoPaymentsSection(house, report),
      renderCarrySection(house, report.carryDues),
      renderUnlinkedSection(report.unlinkedPayments)
    ].filter(Boolean).join('');
  }

  function syncDueKindFields() {
    const isCons = els.dueKind?.value === 'consuntivo';
    els.dueSplitFields?.classList.toggle('hidden', isCons);
    els.dueSplitCustomWrap?.classList.toggle('hidden', isCons || els.dueSplitMode?.value !== 'custom');
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

  function renderHouseForm(house) {
    state.houseFormMode = 'edit';
    syncHouseFormChrome('edit');
    els.houseForm.name.value = house.name || '';
    els.houseForm.location.value = house.location || '';
    els.houseForm.notes.value = house.notes || '';
    if (els.fiscalStartMonth) els.fiscalStartMonth.value = String(house.fiscalStartMonth || 6);
    els.currentHouseTitle.textContent = house.name;
    els.currentHouseMeta.textContent = [house.location || 'Località non indicata', house.notes || 'Nessuna nota'].join(' · ');
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
    renderMetrics(house);
    renderAnnualBlocks(house);
    renderDues(house);
    renderPayments(house);
    renderDashboardPayments(house);
    renderSituazione(house);
    renderMovements(house);
    renderHouseForm(house);
    renderPeriodSelects(house);
    renderBankImportPreview(house);
    renderBankImportBatches(house);
    renderUnlinkedMovements(house);
    if (state.currentView === 'impostazioni' && state.currentSubview === 'account') authRenderAccount?.();
  }

  return {
    setView,
    render,
    renderBankImportPreview,
    renderUnlinkedMovements,
    syncPaymentPeriodSelect,
    syncPaymentInstallmentSelect,
    syncDueKindFields,
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
    metrics: document.getElementById('metrics'),
    annualTableWrap: document.getElementById('annualTableWrap'),
    annualCards: document.getElementById('annualCards'),
    annualPageCards: document.getElementById('annualPageCards'),
    movements: document.getElementById('movements'),
    currentHouseTitle: document.getElementById('currentHouseTitle'),
    currentHouseMeta: document.getElementById('currentHouseMeta'),
    deleteHouseBtn: document.getElementById('deleteHouseBtn'),
    periodFilter: document.getElementById('periodFilter'),
    dueForm: document.getElementById('dueForm'),
    paymentForm: document.getElementById('paymentForm'),
    houseForm: document.getElementById('houseForm'),
    fiscalStartMonth: document.getElementById('fiscalStartMonth'),
    exportBtn: document.getElementById('exportBtn'),
    importFile: document.getElementById('importFile'),
    bankImportFile: document.getElementById('bankImportFile'),
    bankImportConfirm: document.getElementById('bankImportConfirm'),
    bankImportPreview: document.getElementById('bankImportPreview'),
    bankImportBatches: document.getElementById('bankImportBatches'),
    bankImportDeleteAll: document.getElementById('bankImportDeleteAll'),
    unlinkedMovements: document.getElementById('unlinkedMovements'),
    demoBtn: document.getElementById('demoBtn'),
    duePeriodLabel: document.getElementById('duePeriodLabel'),
    duePeriodHint: document.getElementById('duePeriodHint'),
    dueEditId: document.getElementById('dueEditId'),
    dueSubmitBtn: document.getElementById('dueSubmitBtn'),
    dueFormCancel: document.getElementById('dueFormCancel'),
    duesTable: document.getElementById('duesTable'),
    paymentPeriod: document.getElementById('paymentPeriod'),
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
