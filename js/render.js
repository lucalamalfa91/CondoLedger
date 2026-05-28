import { viewMeta } from './config.js';
import { periodLabel, periodSummary, totals, findPeriodByDate } from './fiscal.js';
import { activeHouse, state } from './state.js';
import { fmt, today } from './utils.js';

export function createRenderer(els) {
  function setView(view) {
    state.currentView = view;
    els.navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    els.viewPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view));
    els.viewTitle.textContent = viewMeta[view][0];
    els.viewSubtitle.textContent = viewMeta[view][1];
    if (window.innerWidth <= 860) els.sidebar.classList.remove('open');
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

  function renderPeriodSelects(house) {
    const current = findPeriodByDate(house, today);
    const defaultId = current.id || house.fiscalPeriods[0]?.id || '';
    if (els.duePeriod) {
      const dueHtml = periodOptions(house, defaultId)
        || '<option value="">— creato al salvataggio —</option>';
      els.duePeriod.innerHTML = dueHtml;
    }
    if (els.paymentDate) els.paymentDate.value ||= today;
    syncPaymentPeriodSelect(house);
  }

  function renderHouseList() {
    els.houseList.innerHTML = '';
    if (!state.data.houses.length) {
      els.houseList.innerHTML = '<div class="empty">Nessun immobile ancora presente.</div>';
      return;
    }
    for (const house of state.data.houses) {
      const t = totals(house);
      const btn = document.createElement('button');
      btn.className = `house-btn ${house.id === state.selectedHouseId ? 'active' : ''}`;
      btn.innerHTML = `<strong>${house.name}</strong><span class="muted">${house.location || 'Località non indicata'}</span><span class="muted">Saldo: ${fmt(t.balance)}</span>`;
      btn.addEventListener('click', () => { state.selectedHouseId = house.id; render(); });
      els.houseList.appendChild(btn);
    }
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

  function renderPayments(house) {
    const payments = [...house.payments].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (!payments.length) {
      els.paymentsTable.innerHTML = '<div class="empty">Nessun versamento registrato.</div>';
      return;
    }
    els.paymentsTable.innerHTML = `<table><thead><tr><th>Esercizio</th><th>Data</th><th>Metodo</th><th>Importo</th></tr></thead><tbody>${payments.map(item =>
      `<tr><td>${periodLabel(house, item.fiscalPeriodId)}</td><td>${item.date || '—'}</td><td>${item.method || '—'}</td><td class="amount positive">${fmt(item.amount)}</td></tr>`
    ).join('')}</tbody></table>`;
  }

  function renderMovements(house) {
    const items = [
      ...house.dues.map(item => ({ ...item, type: 'Dovuto', detail: item.description })),
      ...house.payments.map(item => ({ ...item, type: 'Versamento', detail: item.method }))
    ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (!items.length) {
      els.movements.innerHTML = '<div class="empty">Nessun movimento registrato per questa casa.</div>';
      return;
    }
    els.movements.innerHTML = `<table><thead><tr><th>Tipo</th><th>Esercizio</th><th>Data</th><th>Dettaglio</th><th>Importo</th></tr></thead><tbody>${items.map(item =>
      `<tr><td>${item.type}</td><td>${periodLabel(house, item.fiscalPeriodId)}</td><td>${item.date || '—'}</td><td>${item.detail || '—'}</td><td class="amount ${item.type === 'Versamento' ? 'positive' : ''}">${fmt(item.amount)}</td></tr>`
    ).join('')}</tbody></table>`;
  }

  function renderHouseForm(house) {
    els.houseForm.name.value = house.name || '';
    els.houseForm.location.value = house.location || '';
    els.houseForm.notes.value = house.notes || '';
    if (els.fiscalStartMonth) els.fiscalStartMonth.value = String(house.fiscalStartMonth || 6);
    els.currentHouseTitle.textContent = house.name;
    els.currentHouseMeta.textContent = [house.location || 'Località non indicata', house.notes || 'Nessuna nota'].join(' · ');
    const t = totals(house);
    els.houseSummary.innerHTML = [
      `Immobili gestiti|${state.data.houses.length}`,
      `Esercizi|${t.years}`,
      `Saldo|${fmt(t.balance)}`
    ].map(item => {
      const [l, v] = item.split('|');
      return `<div class="mini-card"><div class="metric-label">${l}</div><div class="metric-value" style="font-size:1.35rem;">${v}</div></div>`;
    }).join('');
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
    els.currentHouseMeta.textContent = 'Crea il primo immobile dalla barra laterale.';
    els.metrics.innerHTML = '<div class="empty" style="grid-column:1 / -1;">Crea la prima casa per vedere il riepilogo.</div>';
    els.annualTableWrap.innerHTML = '<div class="empty">Nessuna annualità disponibile.</div>';
    els.annualCards.innerHTML = '<div class="empty">Nessun saldo disponibile.</div>';
    els.annualPageCards.innerHTML = '<div class="empty">Nessuna annualità registrata.</div>';
    els.paymentsTable.innerHTML = '<div class="empty">Nessun versamento registrato.</div>';
    els.movements.innerHTML = '<div class="empty">Nessun movimento da mostrare.</div>';
    els.houseSummary.innerHTML = '<div class="empty" style="grid-column:1/-1;">Nessun riepilogo immobile disponibile.</div>';
    els.houseForm.reset();
  }

  function render(authRenderAccount) {
    if (!state.selectedHouseId && state.data.houses[0]) state.selectedHouseId = state.data.houses[0].id;
    renderHouseList();
    const house = activeHouse();
    if (!house) { renderEmptyState(); return; }
    renderMetrics(house);
    renderAnnualBlocks(house);
    renderPayments(house);
    renderMovements(house);
    renderHouseForm(house);
    renderPeriodSelects(house);
    renderBankImportPreview(house);
    renderUnlinkedMovements(house);
    if (state.currentView === 'account') authRenderAccount?.();
  }

  return { setView, render, renderBankImportPreview, renderUnlinkedMovements, syncPaymentPeriodSelect };
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
    userChip: document.getElementById('userChip'),
    sidebar: document.getElementById('sidebar'),
    menuToggle: document.getElementById('menuToggle'),
    houseList: document.getElementById('houseList'),
    metrics: document.getElementById('metrics'),
    annualTableWrap: document.getElementById('annualTableWrap'),
    annualCards: document.getElementById('annualCards'),
    annualPageCards: document.getElementById('annualPageCards'),
    movements: document.getElementById('movements'),
    currentHouseTitle: document.getElementById('currentHouseTitle'),
    currentHouseMeta: document.getElementById('currentHouseMeta'),
    addHouseBtn: document.getElementById('addHouseBtn'),
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
    themeToggle: document.getElementById('themeToggle'),
    duePeriod: document.getElementById('duePeriod'),
    paymentPeriod: document.getElementById('paymentPeriod'),
    paymentDate: document.getElementById('paymentDate'),
    paymentsTable: document.getElementById('paymentsTable'),
    houseSummary: document.getElementById('houseSummary'),
    navButtons: [...document.querySelectorAll('[data-view]')],
    viewPanels: [...document.querySelectorAll('[data-view-panel]')],
    viewTitle: document.getElementById('viewTitle'),
    viewSubtitle: document.getElementById('viewSubtitle'),
    authStatus: document.getElementById('authStatus'),
    logoutBtn: document.getElementById('logoutBtn')
  };
}
