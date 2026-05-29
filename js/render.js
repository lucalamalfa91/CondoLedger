import { resolveView, viewHeading, viewMeta } from './config.js';
import { periodLabel, periodSummary, totals, findPeriodByDate, defaultFiscalLabel } from './fiscal.js';
import { activeHouse, state } from './state.js';
import { fmt, today } from './utils.js';

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
      btn.innerHTML = `<strong>${h.name}</strong><span class="muted">${h.location || 'Località non indicata'}</span><span class="muted">Saldo: ${fmt(t.balance)}</span>`;
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
    if (els.paymentDate) els.paymentDate.value ||= today;
    syncPaymentPeriodSelect(house);
  }

  function renderHouseList() {
    renderHouseSelect();
    renderHousesManageList();
  }

  function renderMetrics(house) {
    const t = totals(house);
    const metricData = [
      ['Totale dovuto', fmt(t.due), `${house.dues.length} registrazioni`],
      ['Totale versato', fmt(t.paid), `${house.payments.length} versamenti`],
      ['Saldo complessivo', fmt(t.balance), t.balance >= 0 ? 'Sei in eccedenza' : 'Sei in debito', t.balance >= 0 ? 'positive' : 'negative'],
      ['Esercizi fiscali', String(t.years), `${t.debtYears} in debito · ${t.creditYears} in eccedenza`, t.debtYears ? 'warning' : 'positive']
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
      els.annualTableWrap.innerHTML = `<table><thead><tr><th>Esercizio</th><th>Dovuto</th><th>Versato</th><th>Saldo</th><th>Stato</th></tr></thead><tbody>${filtered.map(item => {
        const status = item.balance > 0 ? ['In eccedenza', 'success'] : item.balance < 0 ? ['In debito', 'error'] : ['Pareggio', 'warn'];
        return `<tr><td>${item.label}<div class="hint">${item.startDate || ''} → ${item.endDate || ''}</div></td><td class="amount">${fmt(item.due)}</td><td class="amount">${fmt(item.paid)}</td><td class="amount ${item.balance >= 0 ? 'positive' : 'negative'}">${fmt(item.balance)}</td><td><span class="badge ${status[1]}">${status[0]}</span></td></tr>`;
      }).join('')}</tbody></table>`;
    }
    const cards = summary.length
      ? `<div class="annual-list">${summary.map(item => {
        const cls = item.balance > 0 ? 'success' : item.balance < 0 ? 'error' : 'warn';
        const label = item.balance > 0 ? 'Eccedenza' : item.balance < 0 ? 'Debito' : 'Pareggio';
        return `<div class="annual-item"><div><strong>${item.label}</strong><div class="hint">Dovuto ${fmt(item.due)} · Versato ${fmt(item.paid)}</div></div><div><span class="badge ${cls}">${label}</span></div><strong class="${item.balance >= 0 ? 'positive' : 'negative'}">${fmt(item.balance)}</strong></div>`;
      }).join('')}</div>`
      : '<div class="empty">Nessuna annualità registrata.</div>';
    els.annualCards.innerHTML = summary.length ? cards : '<div class="empty">Nessun saldo disponibile.</div>';
    els.annualPageCards.innerHTML = cards;
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
    els.duesTable.innerHTML = `<table><thead><tr><th>Esercizio</th><th>Descrizione</th><th>Importo</th><th></th></tr></thead><tbody>${dues.map(item =>
      `<tr><td>${periodLabel(house, item.fiscalPeriodId)}</td><td>${item.description || '—'}</td><td class="amount">${fmt(item.amount)}</td><td>${rowActions('due', item.id)}</td></tr>`
    ).join('')}</tbody></table>`;
  }

  function renderPayments(house) {
    const payments = [...house.payments].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (!payments.length) {
      els.paymentsTable.innerHTML = '<div class="empty">Nessun versamento registrato.</div>';
      return;
    }
    els.paymentsTable.innerHTML = `<table><thead><tr><th>Esercizio</th><th>Data</th><th>Metodo</th><th>Importo</th><th></th></tr></thead><tbody>${payments.map(item =>
      `<tr><td>${periodLabel(house, item.fiscalPeriodId)}</td><td>${item.date || '—'}</td><td>${item.method || '—'}</td><td class="amount positive">${fmt(item.amount)}</td><td>${rowActions('payment', item.id)}</td></tr>`
    ).join('')}</tbody></table>`;
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
    renderMovements(house);
    renderHouseForm(house);
    renderPeriodSelects(house);
    renderBankImportPreview(house);
    renderUnlinkedMovements(house);
    if (state.currentView === 'impostazioni' && state.currentSubview === 'account') authRenderAccount?.();
  }

  return { setView, render, renderBankImportPreview, renderUnlinkedMovements, syncPaymentPeriodSelect, renderNewHouseForm };
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
