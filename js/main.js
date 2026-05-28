import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  createLocalDue,
  createLocalPayment,
  createSupabaseClient,
  deleteHouseRemote,
  ensureFiscalPeriod,
  linkBankMovement,
  loadFromSupabase,
  saveBankImport,
  saveDueToSupabase,
  saveHouseToSupabase,
  savePaymentToSupabase,
  saveUnlinkedBankMovements,
  syncBackupToSupabase
} from './api.js';
import { createAuthHandlers } from './auth.js';
import { exportBackup, parseBackup } from './backup.js';
import { parseIntesaFile } from './intesa.js';
import { enrichPreview } from './matching.js';
import { collectDom, createRenderer } from './render.js';
import { activeHouse, createLocalHouse, state } from './state.js';
import { today, uid } from './utils.js';

const els = collectDom();

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
}

const { setView, render, syncPaymentPeriodSelect } = createRenderer(els);
const auth = createAuthHandlers(els, {
  setView: v => { setView(v); if (v === 'account') auth.renderAccountView(); },
  render,
  setTheme
});

function ensureHouse() {
  const house = activeHouse();
  if (!house) { alert('Crea prima una casa.'); return null; }
  return house;
}

async function ensureHousePersisted(house) {
  if (state.supabase && state.user && !Number.isFinite(Number(house.id))) {
    await saveHouseToSupabase(house);
  }
}

async function addHouse() {
  const house = createLocalHouse();
  state.data.houses.push(house);
  state.selectedHouseId = house.id;
  render();
  setView('immobile');
  try {
    await saveHouseToSupabase(house);
    await loadFromSupabase();
    render();
  } catch (err) {
    alert(err.message || 'Errore salvataggio casa');
  }
}

async function handleBankFile(file) {
  const house = ensureHouse();
  if (!house) return;
  if (!Number.isFinite(Number(house.id))) {
    alert('Salva prima la casa su Supabase.');
    return;
  }
  try {
    const movements = await parseIntesaFile(file);
    state.bankImportPreview = enrichPreview(house, movements).map(row => ({
      ...row,
      manualPeriodId: row.suggestedFiscalPeriodId || null
    }));
    render();
    setView('importbanca');
  } catch (err) {
    alert(err.message || 'Errore lettura file Excel');
  }
}

async function confirmBankImport() {
  const house = ensureHouse();
  if (!house || !state.bankImportPreview.length) return;
  const batchId = crypto.randomUUID();
  try {
    for (const row of state.bankImportPreview) {
      if (!row.selected || row.ineligible) continue;
      if (!row.manualPeriodId && !row.suggestedFiscalPeriodId) {
        const p = await ensureFiscalPeriod(house, row.movementDate);
        row.manualPeriodId = p.id;
      } else if (!row.manualPeriodId) {
        row.manualPeriodId = row.suggestedFiscalPeriodId;
      }
    }
    await saveBankImport(house, batchId, state.bankImportPreview);
    await saveUnlinkedBankMovements(house, batchId, state.bankImportPreview);
    state.bankImportPreview = [];
    await loadFromSupabase();
    render();
    alert('Import completato.');
  } catch (err) {
    alert(err.message || 'Errore import');
  }
}

function exportJson() {
  const payload = exportBackup(state.data);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'spese-condominiali-v2.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const parsed = parseBackup(JSON.parse(String(e.target.result || '{}')));
      if (state.supabase && state.user) {
        if (!confirm('Importare il backup su Supabase? Le case verranno aggiunte al tuo account.')) return;
        await syncBackupToSupabase(parsed);
        render();
        alert('Backup importato su Supabase.');
        return;
      }
      alert('Accedi per importare il backup su Supabase.');
    } catch (err) {
      alert(err.message || 'File JSON non valido.');
    }
  };
  reader.readAsText(file);
}

els.loginForm.addEventListener('submit', auth.signIn);
els.recoveryForm.addEventListener('submit', auth.updatePasswordFromRecovery);
els.accountPasswordForm.addEventListener('submit', auth.updatePasswordFromAccount);
els.addHouseBtn.addEventListener('click', addHouse);
els.exportBtn.addEventListener('click', exportJson);
els.importFile.addEventListener('change', e => importJson(e.target.files[0]));
els.demoBtn.addEventListener('click', () => alert('Demo locale disabilitata con fiscalità Supabase.'));
els.themeToggle.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
els.loginThemeToggle.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
els.recoveryThemeToggle.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
els.menuToggle.addEventListener('click', () => els.sidebar.classList.toggle('open'));
els.periodFilter.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.navButtons.forEach(btn => btn.addEventListener('click', () => {
  setView(btn.dataset.view);
  if (btn.dataset.view === 'account') auth.renderAccountView();
}));
document.querySelectorAll('[data-nav-target]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.navTarget)));
els.logoutBtn.addEventListener('click', auth.logout);

els.houseForm.addEventListener('submit', async e => {
  e.preventDefault();
  const house = ensureHouse();
  if (!house) return;
  house.name = els.houseForm.name.value.trim() || house.name;
  house.location = els.houseForm.location.value.trim();
  house.notes = els.houseForm.notes.value.trim();
  house.fiscalStartMonth = Number(els.fiscalStartMonth?.value || 6);
  try {
    if (state.supabase && state.user) await saveHouseToSupabase(house);
    render();
  } catch (err) {
    alert(err.message);
  }
});

els.deleteHouseBtn.addEventListener('click', async () => {
  const house = activeHouse();
  if (!house) return;
  if (!confirm(`Eliminare ${house.name}?`)) return;
  try {
    if (state.supabase && state.user && Number.isFinite(Number(house.id))) await deleteHouseRemote(house.id);
    state.data.houses = state.data.houses.filter(h => h.id !== house.id);
    state.selectedHouseId = state.data.houses[0]?.id || null;
    render();
    setView('dashboard');
  } catch (err) {
    alert(err.message);
  }
});

els.dueForm.addEventListener('submit', async e => {
  e.preventDefault();
  const house = ensureHouse();
  if (!house) return;
  try {
    await ensureHousePersisted(house);
    const fd = new FormData(els.dueForm);
    const due = createLocalDue(fd);
    due.fiscalPeriodId = els.duePeriod.value;
    if (state.supabase && state.user) {
      if (!due.fiscalPeriodId) {
        const p = await ensureFiscalPeriod(house, today);
        due.fiscalPeriodId = p.id;
      }
      await saveDueToSupabase(house, due);
      els.dueForm.reset();
      await loadFromSupabase();
    } else {
      house.dues.push({ ...due, id: uid('due'), fiscalPeriodId: els.duePeriod.value });
    }
    render();
    setView('dashboard');
  } catch (err) {
    alert(err.message);
  }
});

els.paymentForm.addEventListener('submit', async e => {
  e.preventDefault();
  const house = ensureHouse();
  if (!house) return;
  try {
    await ensureHousePersisted(house);
    const fd = new FormData(els.paymentForm);
    let periodId = els.paymentPeriod.value;
    if (!periodId) {
      const period = await ensureFiscalPeriod(house, els.paymentDate.value || today);
      periodId = period.id;
    }
    const payment = createLocalPayment(fd, periodId);
    if (state.supabase && state.user) {
      await savePaymentToSupabase(house, payment);
      els.paymentForm.reset();
      await loadFromSupabase();
    } else {
      house.payments.push({ ...payment, id: uid('pay') });
    }
    render();
    setView('dashboard');
  } catch (err) {
    alert(err.message);
  }
});

els.paymentDate?.addEventListener('change', () => {
  const house = activeHouse();
  if (house) syncPaymentPeriodSelect(house);
});

els.bankImportFile?.addEventListener('change', e => handleBankFile(e.target.files[0]));
els.bankImportConfirm?.addEventListener('click', confirmBankImport);

els.unlinkedMovements?.addEventListener('click', async e => {
  const btn = e.target.closest('.link-btn');
  if (!btn) return;
  const house = ensureHouse();
  if (!house) return;
  const row = btn.closest('tr');
  const select = row?.querySelector('.link-period');
  if (!select?.value) { alert('Seleziona un esercizio fiscale.'); return; }
  try {
    await linkBankMovement(house, btn.dataset.id, select.value);
    await loadFromSupabase();
    render();
  } catch (err) {
    alert(err.message);
  }
});

async function initApp() {
  auth.loadStoredConfig();
  setTheme(state.theme);
  auth.setAuthUI(false);
  auth.showRecoveryUI(false);
  auth.setLoginLoading(true);
  try {
    createSupabaseClient(createClient);
    if (await auth.handleAuthCallbackError()) return;
    auth.bindAuthStateChange();
    const sessionResult = await auth.restoreSession();
    if (sessionResult === true) {
      setView('dashboard');
      render();
    }
  } catch {
    els.loginError.textContent = 'Impossibile connettersi al servizio. Riprova più tardi.';
    els.loginError.classList.remove('hidden');
  } finally {
    auth.setLoginLoading(false);
  }
}

initApp();
