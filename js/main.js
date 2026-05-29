import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  createLocalDue,
  createLocalPayment,
  createSupabaseClient,
  deleteAllBankImports,
  deleteBankImportBatch,
  deleteDueFromSupabase,
  deleteHouseRemote,
  deletePaymentFromSupabase,
  ensureFiscalPeriod,
  ensureFiscalPeriodByLabel,
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
import { resolveView } from './config.js';
import { suggestCarryover } from './carryover.js';
import { periodLabel } from './fiscal.js';
import { findInstallmentForDate } from './installments.js';
import { exportSituazionePdf } from './pdf-situazione.js';
import { parseIntesaFile } from './intesa.js';
import { enrichPreview } from './matching.js';
import { collectDom, createRenderer } from './render.js';
import { activeHouse, createLocalHouse, state } from './state.js';
import { fmt, today, uid } from './utils.js';

const els = collectDom();

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
}

const { setView, render: baseRender, syncPaymentPeriodSelect, syncPaymentInstallmentSelect, syncDueKindFields } = createRenderer(els);
let renderedHouseId = null;
function render(...args) {
  const house = activeHouse();
  if (house?.id !== renderedHouseId) {
    resetDueForm();
    resetPaymentForm(house);
    renderedHouseId = house?.id ?? null;
  }
  baseRender(...args);
}
function navigate(view, subview = null) {
  setView(view, subview);
  const resolved = resolveView(view, subview);
  if (resolved.view === 'impostazioni' && resolved.subview === 'account') {
    auth.renderAccountView();
  }
}

const auth = createAuthHandlers(els, {
  setView: (v, s) => navigate(v, s),
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

function resetDueForm() {
  els.dueForm.reset();
  if (els.dueEditId) els.dueEditId.value = '';
  if (els.dueSubmitBtn) els.dueSubmitBtn.textContent = 'Salva dovuto';
  els.dueFormCancel?.classList.add('hidden');
}

function resetPaymentForm(house) {
  els.paymentForm.reset();
  if (els.paymentEditId) els.paymentEditId.value = '';
  if (els.paymentSubmitBtn) els.paymentSubmitBtn.textContent = 'Salva versamento';
  els.paymentFormCancel?.classList.add('hidden');
  if (house) syncPaymentPeriodSelect(house);
}

function startEditDue(house, due) {
  els.duePeriodLabel.value = periodLabel(house, due.fiscalPeriodId);
  els.dueForm.amount.value = String(due.amount);
  els.dueForm.description.value = due.description || '';
  if (els.dueKind) els.dueKind.value = due.dueKind || 'preventivo';
  if (els.dueSplitMode) els.dueSplitMode.value = due.splitMode || 'monthly';
  if (els.dueSplitCustom) {
    els.dueSplitCustom.value = Array.isArray(due.splitCustom) ? due.splitCustom.join(',') : '';
  }
  syncDueKindFields();
  if (els.dueEditId) els.dueEditId.value = due.id;
  if (els.dueSubmitBtn) els.dueSubmitBtn.textContent = 'Aggiorna dovuto';
  els.dueFormCancel?.classList.remove('hidden');
  navigate('movimenti', 'dovuti');
  els.dueForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function startEditPayment(house, payment) {
  els.paymentForm.amount.value = String(payment.amount);
  els.paymentDate.value = payment.date || today;
  els.paymentForm.method.value = payment.method || '';
  if (els.paymentEditId) els.paymentEditId.value = payment.id;
  if (els.paymentSubmitBtn) els.paymentSubmitBtn.textContent = 'Aggiorna versamento';
  els.paymentFormCancel?.classList.remove('hidden');
  syncPaymentPeriodSelect(house);
  if (payment.fiscalPeriodId) els.paymentPeriod.value = payment.fiscalPeriodId;
  syncPaymentInstallmentSelect(house, payment.installmentKey || null);
  navigate('movimenti', 'versamenti');
  els.paymentForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteDue(house, dueId) {
  const due = house.dues.find(d => d.id === dueId);
  if (!due || !confirm('Eliminare questo dovuto?')) return;
  try {
    if (state.supabase && state.user && Number.isFinite(Number(dueId))) {
      await deleteDueFromSupabase(house, dueId);
      await loadFromSupabase();
    } else {
      house.dues = house.dues.filter(d => d.id !== dueId);
    }
    if (els.dueEditId?.value === dueId) resetDueForm();
    render();
  } catch (err) {
    alert(err.message);
  }
}

async function deletePayment(house, paymentId) {
  const payment = house.payments.find(p => p.id === paymentId);
  if (!payment || !confirm('Eliminare questo versamento?')) return;
  try {
    if (state.supabase && state.user && Number.isFinite(Number(paymentId))) {
      await deletePaymentFromSupabase(house, payment);
      await loadFromSupabase();
    } else {
      house.payments = house.payments.filter(p => p.id !== paymentId);
    }
    if (els.paymentEditId?.value === paymentId) resetPaymentForm(activeHouse());
    render();
  } catch (err) {
    alert(err.message);
  }
}

function handleRecordAction(e) {
  const editDue = e.target.closest('.edit-due');
  const deleteDueBtn = e.target.closest('.delete-due');
  const editPayment = e.target.closest('.edit-payment');
  const deletePaymentBtn = e.target.closest('.delete-payment');
  const house = ensureHouse();
  if (!house) return;

  if (editDue) {
    const due = house.dues.find(d => d.id === editDue.dataset.id);
    if (due) startEditDue(house, due);
    return;
  }
  if (deleteDueBtn) {
    deleteDue(house, deleteDueBtn.dataset.id);
    return;
  }
  if (editPayment) {
    const payment = house.payments.find(p => p.id === editPayment.dataset.id);
    if (payment) startEditPayment(house, payment);
    return;
  }
  if (deletePaymentBtn) {
    deletePayment(house, deletePaymentBtn.dataset.id);
  }
}

function startNewHouseForm() {
  state.houseFormMode = 'new';
  navigate('impostazioni', 'casa');
  render();
}

function selectHouse(houseId) {
  state.houseFormMode = 'edit';
  state.selectedHouseId = houseId;
  render();
}

async function createHouseFromForm() {
  const house = createLocalHouse();
  house.name = els.houseForm.name.value.trim() || house.name;
  house.location = els.houseForm.location.value.trim();
  house.notes = els.houseForm.notes.value.trim();
  house.fiscalStartMonth = Number(els.fiscalStartMonth?.value || 6);
  state.data.houses.push(house);
  state.selectedHouseId = house.id;
  state.houseFormMode = 'edit';
  try {
    await saveHouseToSupabase(house);
    await loadFromSupabase();
    render();
  } catch (err) {
    state.data.houses = state.data.houses.filter(h => h.id !== house.id);
    state.selectedHouseId = state.data.houses[0]?.id || null;
    state.houseFormMode = state.data.houses.length ? 'edit' : 'new';
    alert(err.message || 'Errore salvataggio casa');
    render();
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
    navigate('movimenti', 'import');
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
        const { period: p } = await ensureFiscalPeriod(house, row.movementDate);
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
  a.download = 'spese-condominiali-v3.json';
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

function openQuickAddSheet() {
  els.quickAddSheet?.classList.remove('hidden');
  els.quickAddBackdrop?.classList.remove('hidden');
}

function closeQuickAddSheet() {
  els.quickAddSheet?.classList.add('hidden');
  els.quickAddBackdrop?.classList.add('hidden');
}

function closeAllOverlays() {
  closeQuickAddSheet();
  els.userMenu?.classList.add('hidden');
  els.userMenuBtn?.setAttribute('aria-expanded', 'false');
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeAllOverlays();
});

function wireNavigation() {
  els.navButtons.forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.view)));
  els.subviewTabs?.forEach(tab => tab.addEventListener('click', () => navigate(tab.dataset.view, tab.dataset.subview)));
  document.querySelectorAll('[data-nav-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.houseMode === 'new') startNewHouseForm();
      else navigate(btn.dataset.navTarget, btn.dataset.navSubview || null);
      if (btn.dataset.closeSheet) closeQuickAddSheet();
    });
  });
}

els.loginForm.addEventListener('submit', auth.signIn);
els.recoveryForm.addEventListener('submit', auth.updatePasswordFromRecovery);
els.accountPasswordForm.addEventListener('submit', auth.updatePasswordFromAccount);
els.headerAddHouseBtn?.addEventListener('click', startNewHouseForm);
els.addHouseSettingsBtn?.addEventListener('click', startNewHouseForm);
window.addEventListener('app:start-new-house', startNewHouseForm);
els.houseSelect?.addEventListener('change', e => {
  if (e.target.value) selectHouse(e.target.value);
});
els.housesManageList?.addEventListener('click', e => {
  const btn = e.target.closest('.house-btn[data-house-id]');
  if (!btn) return;
  selectHouse(btn.dataset.houseId);
});
els.exportBtn.addEventListener('click', exportJson);
els.importFile.addEventListener('change', e => importJson(e.target.files[0]));
els.demoBtn?.addEventListener('click', () => alert('Demo locale disabilitata con fiscalità Supabase.'));
els.loginThemeToggle.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
els.recoveryThemeToggle.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
wireNavigation();
els.periodFilter.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.paymentFilterYear?.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.paymentFilterMonth?.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.paymentPeriod?.addEventListener('change', () => {
  const house = activeHouse();
  if (house) syncPaymentInstallmentSelect(house);
});
els.situazionePeriod?.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.situazionePdfBtn?.addEventListener('click', async () => {
  const house = ensureHouse();
  if (!house || !els.situazionePeriod?.value) return;
  try {
    await exportSituazionePdf(house, els.situazionePeriod.value, els.situazionePdfKind?.value);
  } catch (err) {
    alert(err.message || 'Errore export PDF');
  }
});
els.dueKind?.addEventListener('change', syncDueKindFields);
els.dueSplitMode?.addEventListener('change', syncDueKindFields);
els.logoutBtn.addEventListener('click', auth.logout);

els.quickAddFab?.addEventListener('click', openQuickAddSheet);
els.quickAddClose?.addEventListener('click', closeQuickAddSheet);
els.quickAddBackdrop?.addEventListener('click', closeQuickAddSheet);

els.userMenuBtn?.addEventListener('click', e => {
  e.stopPropagation();
  const hidden = els.userMenu.classList.toggle('hidden');
  els.userMenuBtn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
});
els.userMenu?.addEventListener('click', e => {
  e.stopPropagation();
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'account') navigate('impostazioni', 'account');
  if (action === 'theme') setTheme(state.theme === 'dark' ? 'light' : 'dark');
  if (action) {
    els.userMenu.classList.add('hidden');
    els.userMenuBtn.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('click', () => {
  els.userMenu?.classList.add('hidden');
  els.userMenuBtn?.setAttribute('aria-expanded', 'false');
});

els.houseForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (state.houseFormMode === 'new') {
    await createHouseFromForm();
    return;
  }
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
    state.houseFormMode = state.data.houses.length ? 'edit' : 'new';
    render();
    if (!state.data.houses.length) startNewHouseForm();
    else navigate('panoramica');
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
    const editId = String(fd.get('editId') || els.dueEditId?.value || '').trim();
    const due = createLocalDue(fd);
    due.fiscalPeriodLabel = String(fd.get('fiscalPeriodLabel') || els.duePeriodLabel?.value || '').trim();
    if (editId) due.id = editId;
    let newPeriodId = null;
    if (state.supabase && state.user) {
      if (due.fiscalPeriodLabel) {
        const { period, isNew } = await ensureFiscalPeriodByLabel(house, due.fiscalPeriodLabel);
        due.fiscalPeriodId = period.id;
        if (isNew) newPeriodId = period.id;
      }
      await saveDueToSupabase(house, due);
      resetDueForm();
      await loadFromSupabase();
      const houseAfter = activeHouse();
      if (houseAfter && newPeriodId) await offerCarryoverDue(houseAfter, newPeriodId);
    } else if (editId) {
      const existing = house.dues.find(d => d.id === editId);
      if (existing) {
        existing.amount = due.amount;
        existing.description = due.description;
        existing.splitMode = due.splitMode;
        existing.splitCustom = due.splitCustom;
        existing.dueKind = due.dueKind;
        existing.fiscalPeriodId = due.fiscalPeriodLabel;
      }
    } else {
      house.dues.push({ ...due, id: uid('due'), fiscalPeriodId: due.fiscalPeriodLabel });
    }
    render();
    navigate('panoramica');
  } catch (err) {
    alert(err.message);
  }
});

els.dueFormCancel?.addEventListener('click', () => {
  resetDueForm();
  render();
});

els.paymentForm.addEventListener('submit', async e => {
  e.preventDefault();
  const house = ensureHouse();
  if (!house) return;
  try {
    await ensureHousePersisted(house);
    const fd = new FormData(els.paymentForm);
    const editId = String(fd.get('editId') || els.paymentEditId?.value || '').trim();
    let periodId = els.paymentPeriod.value;
    if (!periodId) {
      const { period } = await ensureFiscalPeriod(house, els.paymentDate.value || today);
      periodId = period.id;
    }
    const installmentKey = String(fd.get('installmentKey') || els.paymentInstallment?.value || '').trim();
    if (!installmentKey) {
      alert('Seleziona la rata da associare al versamento.');
      return;
    }
    const payment = createLocalPayment(fd, periodId, installmentKey);
    if (editId) {
      payment.id = editId;
      const existing = house.payments.find(p => p.id === editId);
      if (existing?.bankMovementId) payment.bankMovementId = existing.bankMovementId;
    }
    if (state.supabase && state.user) {
      await savePaymentToSupabase(house, payment);
      resetPaymentForm(house);
      await loadFromSupabase();
    } else if (editId) {
      const existing = house.payments.find(p => p.id === editId);
      if (existing) Object.assign(existing, payment);
    } else {
      house.payments.push({ ...payment, id: uid('pay') });
    }
    render();
    navigate('panoramica');
  } catch (err) {
    alert(err.message);
  }
});

els.paymentFormCancel?.addEventListener('click', () => {
  const house = activeHouse();
  resetPaymentForm(house);
  render();
});

els.paymentDate?.addEventListener('change', () => {
  const house = activeHouse();
  if (house && !els.paymentEditId?.value) {
    syncPaymentPeriodSelect(house);
    syncPaymentInstallmentSelect(house);
  }
});

async function offerCarryoverDue(house, newPeriodId) {
  const suggestion = suggestCarryover(house, newPeriodId);
  if (!suggestion) return;
  const eccedenza = suggestion.consuntivoBalance > 0;
  const msg = `Consuntivo ${suggestion.fromLabel}: saldo ${fmt(suggestion.consuntivoBalance)} (${eccedenza ? 'eccedenza' : 'debito'}).\n\nInserire sul preventivo ${periodLabel(house, newPeriodId)} una voce di ${fmt(suggestion.suggestedDueAmount)} per riportare il saldo consuntivo?`;
  if (!confirm(msg)) return;
  const due = {
    id: uid('due'),
    fiscalPeriodId: newPeriodId,
    amount: suggestion.suggestedDueAmount,
    description: `Riporto saldo consuntivo da ${suggestion.fromLabel}`,
    dueKind: 'preventivo',
    splitMode: 'monthly',
    splitCustom: null,
    carryFromPeriodId: suggestion.fromPeriodId
  };
  try {
    await saveDueToSupabase(house, due);
    await loadFromSupabase();
    render();
  } catch (err) {
    alert(err.message);
  }
}

els.duesTable?.addEventListener('click', handleRecordAction);
els.paymentsTable?.addEventListener('click', handleRecordAction);
els.movements?.addEventListener('click', handleRecordAction);

els.bankImportFile?.addEventListener('change', e => handleBankFile(e.target.files[0]));
els.bankImportConfirm?.addEventListener('click', confirmBankImport);

els.bankImportBatches?.addEventListener('click', async e => {
  const btn = e.target.closest('.delete-batch-btn');
  if (!btn) return;
  const house = ensureHouse();
  if (!house || !Number.isFinite(Number(house.id))) return;
  const batchId = btn.dataset.batch;
  if (!batchId) return;
  const count = house.bankMovements.filter(m => m.importBatchId === batchId).length;
  if (!confirm(`Eliminare questo import (${count} movimenti banca e i versamenti collegati)? L'operazione non è reversibile.`)) return;
  try {
    await deleteBankImportBatch(house, batchId);
    await loadFromSupabase();
    render();
    alert('Import eliminato.');
  } catch (err) {
    alert(err.message || 'Errore eliminazione import');
  }
});

els.bankImportDeleteAll?.addEventListener('click', async () => {
  const house = ensureHouse();
  if (!house || !Number.isFinite(Number(house.id))) return;
  const count = house.bankMovements.length;
  if (!count) return;
  if (!confirm(`Eliminare TUTTI gli import banca (${count} movimenti) e i versamenti collegati? I dovuti e i versamenti inseriti manualmente non verranno toccati.`)) return;
  try {
    await deleteAllBankImports(house);
    await loadFromSupabase();
    render();
    alert('Tutti gli import banca sono stati eliminati.');
  } catch (err) {
    alert(err.message || 'Errore eliminazione import');
  }
});

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
      navigate('panoramica');
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
