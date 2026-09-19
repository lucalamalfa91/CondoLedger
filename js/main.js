import {
  createLocalDue,
  deleteAllBankImports,
  deleteBankImportBatch,
  previewBankImportDelete,
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
  savePriorBalanceToSupabase,
  saveUnlinkedBankMovements,
  syncBackupToSupabase,
  updateCalendarSettings
} from './api.js';
import { createAuthHandlers } from './auth.js';
import { exportBackup, parseBackup } from './backup.js';
import { resolveView, viewMeta } from './config.js';
import { computeConguaglio, findPeriodByDate, getNextPeriod, periodLabel } from './fiscal.js';
import { listInstallmentsForPeriod, ordinarioDueForPeriod } from './installments.js';
import { exportSituazionePdf } from './pdf-situazione.js';
import {
  generateRows, planRows, planTargets, round2, rowsToSplitAmounts, splitEqually
} from './rate-plan.js';
import { getPriorBalanceForPeriod } from './situazione-report.js';
import { computeReminderPlan, REMINDER_CADENCES } from './reminder-plan.js';
import { buildIcsCalendar, downloadIcsFile } from './ics-export.js';
import { collectImportPartiesFromDom, hasConfiguredParties, validateParties } from './house-import-parties.js';
import { parseIntesaFile } from './intesa.js';
import { enrichPreview } from './matching.js';
import { collectDom, createRenderer } from './render.js';
import { activeHouse, createLocalHouse, state } from './state.js';
import { confirmDialog } from './confirm.js';
import { computeNextPaymentGuide } from './payment-guide.js';
import { showToast, toastError } from './toast.js';
import { fmt, today, uid } from './utils.js';
import { appRouteUrl, sanitizeLocationUrl } from './url-sanitize.js';

const ONBOARDING_STORAGE_KEY = 'app:onboarding:v1';

const els = collectDom();

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
}

const {
  setView, render: baseRender,
  syncPaymentPeriodSelect, syncPaymentInstallmentSelect, syncDuePeriodSelect,
  applyPaymentSmartAmount, syncPaymentPriorBalanceInfo, renderNewHouseForm,
  renderPaymentTargetOptions, renderPaymentTotal, renderPaymentAfterCard,
  syncPaymentMethodPills, syncPaymentEditMode, paymentSelection,
  syncDueForm, loadDueForPeriod, syncConsForm, consPreview, dueCadenceState, consSettleState,
  renderRatePlan, renderRatePlanTable, renderRatePlanTargets, ratePlanState,
  loadRatePlan, ratePlanPeriodId, renderResoconti,
  renderBankImportPreview, renderUnlinkedMovements
} = createRenderer(els);
let renderedHouseId = null;
function render(...args) {
  const house = activeHouse();
  if (String(house?.id ?? '') !== String(renderedHouseId ?? '')) {
    resetDueForm();
    resetPaymentForm(house);
    resetConsForm();
    renderedHouseId = house?.id != null ? String(house.id) : null;
  }
  baseRender(...args);
  maybeShowOnboarding();
  renderCalendarSettingsView();
}

const onboardingDialog = document.getElementById('onboardingDialog');
const onboardingTitle = document.getElementById('onboardingTitle');
const onboardingBody = document.getElementById('onboardingBody');
const onboardingStepLabel = document.getElementById('onboardingStepLabel');
const onboardingFields = document.getElementById('onboardingFields');
const onboardingNext = document.getElementById('onboardingNext');
const onboardingSkip = document.getElementById('onboardingSkip');
const onboardingStepper = document.getElementById('onboardingStepper');
let onboardingDraftHouse = null;
let onboardingStep = 0;

function finishOnboarding() {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
  onboardingDialog?.close();
}

onboardingDialog?.addEventListener('close', () => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
});
document.getElementById('onboardingForm')?.addEventListener('submit', e => {
  e.preventDefault();
});

function maybeShowOnboarding() {
  if (!state.user || !onboardingDialog || localStorage.getItem(ONBOARDING_STORAGE_KEY)) return;
  if (state.data.houses.length > 0 && state.data.houses.some(h => h.dues?.length)) return;
  if (onboardingDialog.open) return;
  onboardingStep = 0;
  showOnboardingStep();
  onboardingDialog.showModal();
}

function onboardingYearRangeLabel(month) {
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const now = new Date();
  const year = now.getMonth() + 1 >= month ? now.getFullYear() : now.getFullYear() - 1;
  if (month === 1) return `anno solare · gen–dic ${year}`;
  const endMonth = month === 1 ? 12 : month - 1;
  return `${MONTHS[month - 1].slice(0, 3)} ${year} – ${MONTHS[endMonth - 1].slice(0, 3)} ${year + 1}`;
}

function onboardingMonthOptions(selected) {
  const options = [
    { value: 1, label: 'Gennaio', tag: '' },
    { value: 6, label: 'Giugno', tag: 'Il più comune' },
    { value: 7, label: 'Luglio', tag: '' },
    { value: 9, label: 'Settembre', tag: '' }
  ];
  return `<div class="stack" role="radiogroup" aria-label="Mese di inizio">${options.map(o => `
    <label class="radio-option">
      <input type="radio" name="onbFiscalMonth" value="${o.value}"${o.value === selected ? ' checked' : ''} />
      <span>
        <strong>${o.label}</strong>${o.tag ? ` <span class="badge info">${o.tag}</span>` : ''}
        <span class="hint" style="display:block;">${onboardingYearRangeLabel(o.value)}</span>
      </span>
    </label>`).join('')}</div>`;
}

function showOnboardingStep() {
  const hasHouse = state.data.houses.length > 0;
  const steps = [
    {
      label: 'Passo 1 di 3',
      title: hasHouse ? 'La tua casa è pronta' : 'Qual è la tua casa?',
      body: hasHouse
        ? `${state.data.houses[0].name} è già registrata. Puoi modificarla in qualsiasi momento da Impostazioni.`
        : 'Il nome ti serve solo per riconoscerla: se ne gestisci più di una le trovi tutte nel selettore «Casa».',
      fields: hasHouse ? '' : `
        <div>
          <label for="onbHouseName">Nome della casa</label>
          <input id="onbHouseName" type="text" required placeholder="es. Appartamento via Roma" />
        </div>
        <div>
          <label for="onbHouseLocation">Località <span class="hint">(facoltativa)</span></label>
          <input id="onbHouseLocation" type="text" placeholder="es. Milano" />
        </div>`,
      next: 'Continua'
    },
    {
      label: 'Passo 2 di 3',
      title: 'Quando inizia l’anno condominiale?',
      body: 'Lo trovi sul preventivo o sul consuntivo che ti manda l’amministratore. Puoi cambiarlo quando vuoi dalle impostazioni.',
      fields: hasHouse ? '' : onboardingMonthOptions(6),
      next: hasHouse ? 'Continua' : 'Salva e continua'
    },
    {
      label: 'Passo 3 di 3',
      title: 'Registra il preventivo',
      body: 'Inserisci l’importo dell’anno approvato in assemblea e scegli in quante rate lo paghi: le scadenze compaiono da sole in Panoramica. Puoi farlo anche più tardi.',
      fields: '',
      next: 'Vai al preventivo'
    }
  ];
  const s = steps[onboardingStep];
  if (onboardingStepLabel) onboardingStepLabel.textContent = s.label;
  if (onboardingTitle) onboardingTitle.textContent = s.title;
  if (onboardingBody) onboardingBody.textContent = s.body;
  if (onboardingFields) onboardingFields.innerHTML = s.fields;
  if (onboardingNext) onboardingNext.textContent = s.next;
  if (onboardingSkip) onboardingSkip.textContent = onboardingStep === 2 ? 'Salta il preventivo' : 'Salta';
  onboardingStepper?.querySelectorAll('[data-onb-step]').forEach(li => {
    const idx = Number(li.dataset.onbStep);
    li.classList.toggle('active', idx === onboardingStep);
    li.classList.toggle('done', idx < onboardingStep);
  });
}

function parseAppRouteHash() {
  const raw = location.hash.slice(1);
  if (!raw || /[=&]/.test(raw)) return null;
  const [view, subview] = raw.split('/').filter(Boolean);
  return view ? { view, subview: subview || null } : null;
}

function syncRouteHash(view, subview) {
  const meta = viewMeta[view];
  if (!meta) return;
  const seg = subview && meta.subviews?.[subview] ? `${view}/${subview}` : view;
  const next = `#${seg}`;
  if (location.hash !== next || location.search) {
    history.replaceState(null, '', appRouteUrl(location.pathname, next));
  }
}

function navigate(view, subview = null) {
  setView(view, subview);
  const resolved = resolveView(view, subview);
  syncRouteHash(resolved.view, resolved.subview);
  if (resolved.view === 'impostazioni' && resolved.subview === 'account') {
    auth.renderAccountView();
  }
  if (resolved.view === 'impostazioni' && resolved.subview === 'calendario') {
    renderCalendarSettingsView();
  }
  // Aprendo il preventivo si riparte da quello che c'è: se l'anno ne ha già uno,
  // il modulo lo mostra, invece di offrire un foglio bianco su cui rifarlo.
  const house = activeHouse();
  if (house && resolved.view === 'resoconti' && resolved.subview === 'preventivo' && !els.dueEditId?.value) {
    loadDueForPeriod(house);
    syncDueForm(house);
  }
}

const auth = createAuthHandlers(els, {
  setView: (v, s) => navigate(v, s),
  render,
  setTheme
});

function ensureHouse() {
  const house = activeHouse();
  if (!house) {
    toastError('Crea prima una casa.');
    navigate('impostazioni', 'casa');
    return null;
  }
  return house;
}

function openHouseDrawer() {
  els.houseDrawer?.classList.remove('hidden');
  els.houseDrawerBackdrop?.classList.remove('hidden');
  els.houseDrawer?.setAttribute('aria-hidden', 'false');
  render();
}

function closeHouseDrawer() {
  els.houseDrawer?.classList.add('hidden');
  els.houseDrawerBackdrop?.classList.add('hidden');
  els.houseDrawer?.setAttribute('aria-hidden', 'true');
}

function applyPaymentGuideToForm() {
  const house = activeHouse();
  if (!house) return;
  const g = computeNextPaymentGuide(house);
  if (!g) { toastError('Nessuna rata aperta da precompilare.'); return; }
  navigate('pagamenti', 'registra');
  if (els.paymentPeriod) els.paymentPeriod.value = g.periodId;
  state.paymentSelection = [g.installmentKey];
  renderPaymentTargetOptions(house, { preselect: [g.installmentKey] });
  if (els.paymentDate) els.paymentDate.value = today;
  renderPaymentAfterCard(house);
  if (els.paymentMethodPills) els.paymentMethodPills.dataset.other = '0';
  showToast('Versamento precompilato.');
}

async function ensureHousePersisted(house) {
  if (state.user && !Number.isFinite(Number(house.id))) {
    await saveHouseToSupabase(house);
    state.selectedHouseId = String(house.id);
    sessionStorage.setItem('app:selectedHouseId', String(house.id));
  }
}

function resetDueForm() {
  els.dueForm.reset();
  if (els.dueEditId) els.dueEditId.value = '';
  if (els.dueKind) els.dueKind.value = 'preventivo';
  if (els.dueVoice) els.dueVoice.value = 'ordinario';
  dueCadenceState().id = 'monthly';
  const house = activeHouse();
  if (house) { syncDuePeriodSelect(house); loadDueForPeriod(house); syncDueForm(house); }
}

function resetConsForm() {
  els.consForm?.reset();
  if (els.consEditId) els.consEditId.value = '';
  if (els.consSubmitLabel) els.consSubmitLabel.textContent = 'Salva consuntivo';
  consSettleState().mode = 'aparte';
  const house = activeHouse();
  if (house) syncConsForm(house);
}

function resetPaymentForm(house) {
  els.paymentForm.reset();
  if (els.paymentEditId) els.paymentEditId.value = '';
  if (els.paymentSubmitLabel) els.paymentSubmitLabel.textContent = 'Salva pagamento';
  if (els.paymentDate) els.paymentDate.value = today;
  if (els.paymentMethodPills) els.paymentMethodPills.dataset.other = '0';
  els.paymentExtra?.classList.add('hidden');
  els.paymentExtraToggle?.setAttribute('aria-expanded', 'false');
  state.paymentSelection = null;
  if (house) {
    syncPaymentPeriodSelect(house);
    syncPaymentInstallmentSelect(house);
    renderPaymentTargetOptions(house);
    renderPaymentAfterCard(house);
  }
  syncPaymentEditMode(house);
  syncPaymentMethodPills();
}

function startEditDue(house, due) {
  if (due.dueKind === 'consuntivo') {
    navigate('resoconti', 'consuntivo');
    if (els.consPeriod) els.consPeriod.value = due.fiscalPeriodId;
    if (els.consAmount) els.consAmount.value = String(due.amount);
    if (els.consEditId) els.consEditId.value = due.id;
    if (els.consSubmitLabel) els.consSubmitLabel.textContent = 'Aggiorna consuntivo';
    syncConsForm(house);
    els.consForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  navigate('resoconti', 'preventivo');
  syncDuePeriodSelect(house, due.fiscalPeriodId);
  els.dueForm.amount.value = String(due.amount);
  els.dueForm.description.value = due.description || '';
  if (els.dueKind) els.dueKind.value = 'preventivo';
  if (els.dueVoice) els.dueVoice.value = due.voice || 'ordinario';
  if (els.dueSplitMode) els.dueSplitMode.value = due.splitMode || 'monthly';
  if (els.dueEditId) els.dueEditId.value = due.id;
  if (els.dueSubmitLabel) els.dueSubmitLabel.textContent = 'Aggiorna preventivo';
  syncDueForm(house);
  els.dueForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function startEditPayment(house, payment) {
  navigate('pagamenti', 'registra');
  els.paymentForm.reset();
  if (els.paymentAmount) els.paymentAmount.value = String(payment.amount);
  if (els.paymentDate) els.paymentDate.value = payment.date || today;
  if (els.paymentMethod) els.paymentMethod.value = payment.method || '';
  if (els.paymentNote) els.paymentNote.value = payment.note || '';
  if (els.paymentEditId) els.paymentEditId.value = payment.id;
  syncPaymentPeriodSelect(house);
  if (payment.fiscalPeriodId) els.paymentPeriod.value = payment.fiscalPeriodId;
  syncPaymentEditMode(house);
  syncEditInstallmentSelect(house, payment.installmentKey || '');
  if (els.paymentTarget) els.paymentTarget.value = payment.priorBalanceId ? 'prior' : 'rata';
  if (els.paymentPriorBalanceId) els.paymentPriorBalanceId.value = payment.priorBalanceId || '';
  syncPaymentMethodPills();
  renderPaymentAfterCard(house);
  els.paymentForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** L'elenco rate del modulo in modifica: solo quelle dell'anno del pagamento. */
function syncEditInstallmentSelect(house, selectedKey) {
  if (!els.paymentEditInstallment) return;
  const periodId = els.paymentPeriod?.value;
  const slots = periodId ? listInstallmentsForPeriod(house, periodId) : [];
  els.paymentEditInstallment.innerHTML = '<option value="">— nessuna rata —</option>' + slots.map(slot =>
    `<option value="${slot.key}"${slot.key === selectedKey ? ' selected' : ''}>${slot.label} · ${fmt(slot.amountDue)}</option>`
  ).join('');
  els.paymentEditInstallment.value = selectedKey || '';
}

async function deleteDue(house, dueId) {
  const due = house.dues.find(d => d.id === dueId);
  if (!due || !await confirmDialog('Eliminare questo dovuto?', { title: 'Elimina dovuto', confirmLabel: 'Elimina', danger: true })) return;
  try {
    if (state.user && Number.isFinite(Number(dueId))) {
      await deleteDueFromSupabase(house, dueId);
      await loadFromSupabase();
    } else {
      house.dues = house.dues.filter(d => d.id !== dueId);
    }
    if (els.dueEditId?.value === dueId) resetDueForm();
    render();
    showToast('Dovuto eliminato.');
  } catch (err) {
    toastError(err.message);
  }
}

async function deletePayment(house, paymentId) {
  const payment = house.payments.find(p => p.id === paymentId);
  if (!payment || !await confirmDialog('Eliminare questo versamento?', { title: 'Elimina versamento', confirmLabel: 'Elimina', danger: true })) return;
  try {
    if (state.user && Number.isFinite(Number(paymentId))) {
      await deletePaymentFromSupabase(house, payment);
      await loadFromSupabase();
    } else {
      house.payments = house.payments.filter(p => p.id !== paymentId);
    }
    if (els.paymentEditId?.value === paymentId) resetPaymentForm(activeHouse());
    render();
    showToast('Versamento eliminato.');
  } catch (err) {
    toastError(err.message);
  }
}

function handleRecordAction(e) {
  const btn = e.target.closest('[data-record-action][data-record-kind][data-id]');
  if (!btn) return;
  const house = ensureHouse();
  if (!house) return;

  const action = btn.dataset.recordAction;
  const kind = btn.dataset.recordKind;
  const id = btn.dataset.id;

  if (kind === 'due') {
    if (action === 'edit') {
      const due = house.dues.find(d => String(d.id) === String(id));
      if (due) startEditDue(house, due);
    } else if (action === 'delete') {
      deleteDue(house, id);
    }
    return;
  }

  if (kind === 'payment') {
    if (action === 'edit') {
      const payment = house.payments.find(p => String(p.id) === String(id));
      if (payment) startEditPayment(house, payment);
    } else if (action === 'delete') {
      deletePayment(house, id);
    }
    return;
  }

}

function startNewHouseForm() {
  state.houseFormMode = 'new';
  navigate('impostazioni', 'casa');
  render();
}

function selectHouse(houseId) {
  state.houseFormMode = 'edit';
  const id = houseId != null ? String(houseId) : null;
  state.selectedHouseId = id;
  if (id) sessionStorage.setItem('app:selectedHouseId', id);
  render();
}

async function createAndSaveHouse({ name, location = '', notes = '', fiscalStartMonth = 6, importParties = [] }) {
  const house = createLocalHouse();
  house.name = name || house.name;
  house.location = location;
  house.notes = notes;
  house.fiscalStartMonth = fiscalStartMonth;
  house.importParties = importParties;
  const partyWarnings = validateParties(house.importParties);
  if (partyWarnings.length) {
    toastError(partyWarnings[0]);
    return null;
  }
  state.data.houses.push(house);
  state.selectedHouseId = house.id;
  state.houseFormMode = 'edit';
  try {
    await saveHouseToSupabase(house);
    await loadFromSupabase();
    render();
    return house;
  } catch (err) {
    state.data.houses = state.data.houses.filter(h => h.id !== house.id);
    state.selectedHouseId = state.data.houses[0]?.id || null;
    state.houseFormMode = state.data.houses.length ? 'edit' : 'new';
    toastError(err.message || 'Errore salvataggio casa');
    render();
    return null;
  }
}

async function createHouseFromForm() {
  await createAndSaveHouse({
    name: els.houseForm.name.value.trim(),
    location: els.houseForm.location.value.trim(),
    notes: els.houseForm.notes.value.trim(),
    fiscalStartMonth: Number(els.fiscalStartMonth?.value || 6),
    importParties: collectImportPartiesFromDom(els.houseImportParties)
  });
}

async function handleBankFile(file) {
  const house = ensureHouse();
  if (!house) return;
  if (!Number.isFinite(Number(house.id))) {
    toastError('Salva prima la casa.');
    return;
  }
  try {
    const movements = await parseIntesaFile(file);
    state.bankImportPreview = enrichPreview(house, movements).map(row => ({
      ...row,
      manualPeriodId: row.suggestedFiscalPeriodId || null
    }));
    render();
    navigate('importa', 'import-banca');
  } catch (err) {
    toastError(err.message || 'Errore lettura file Excel');
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
    const importedCount = state.bankImportPreview.filter(row => row.selected && !row.ineligible).length;
    await saveBankImport(house, batchId, state.bankImportPreview);
    await saveUnlinkedBankMovements(house, batchId, state.bankImportPreview);
    state.bankImportPreview = [];
    await loadFromSupabase();
    const houseAfter = activeHouse();
    state.postImportPaymentHint = houseAfter ? computeNextPaymentGuide(houseAfter) : true;
    render();
    showToast(`Import banca completato: ${importedCount} versamenti registrati.`);
    navigate('registra', 'versamenti');
  } catch (err) {
    toastError(err.message || 'Errore import');
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
      if (state.user) {
        if (!await confirmDialog('Importare il backup? Le case verranno aggiunte al tuo account.', { title: 'Import backup' })) return;
        await syncBackupToSupabase(parsed);
        render();
        showToast('Backup importato.');
        return;
      }
      toastError('Accedi per importare il backup.');
    } catch (err) {
      toastError(err.message || 'File JSON non valido.');
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
  closeHouseDrawer();
  els.userMenu?.classList.add('hidden');
  els.userMenuBtn?.setAttribute('aria-expanded', 'false');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAllOverlays(); return; }
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const label = e.target.closest('label.btn[for]');
  if (!label) return;
  e.preventDefault();
  document.getElementById(label.getAttribute('for'))?.click();
});

function wireNavigation() {
  els.navButtons.forEach(btn => btn.addEventListener('click', () => {
    const sub = btn.dataset.navMobileSubview;
    navigate(btn.dataset.view, sub || null);
  }));
  els.subviewTabs?.forEach(tab => {
    tab.addEventListener('click', () => navigate(tab.dataset.view, tab.dataset.subview));
  });
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-nav-target]');
    if (!btn) return;
    if (btn.dataset.situazionePeriod) state.pendingSituazionePeriodId = btn.dataset.situazionePeriod;
    if (btn.dataset.resocontoPeriod) state.pendingSituazionePeriodId = btn.dataset.resocontoPeriod;
    if (btn.dataset.houseMode === 'new') startNewHouseForm();
    else {
      navigate(btn.dataset.navTarget, btn.dataset.navSubview || null);
    }
    if (btn.dataset.closeSheet) closeQuickAddSheet();
  });
}

let resizeRenderTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeRenderTimer);
  resizeRenderTimer = setTimeout(() => {
    if (state.user && els.appShell && !els.appShell.classList.contains('hidden')) render();
  }, 220);
});

els.loginForm.addEventListener('submit', auth.signIn);
els.recoveryForm.addEventListener('submit', auth.updatePasswordFromRecovery);
els.accountPasswordForm.addEventListener('submit', auth.updatePasswordFromAccount);
els.headerAddHouseBtn?.addEventListener('click', startNewHouseForm);
els.addHouseSettingsBtn?.addEventListener('click', startNewHouseForm);
window.addEventListener('app:start-new-house', startNewHouseForm);
window.addEventListener('app:retry-load-house-data', () => auth.retryLoadHouseData());
els.housesManageList?.addEventListener('click', e => {
  const btn = e.target.closest('.house-btn[data-house-id]');
  if (!btn) return;
  selectHouse(btn.dataset.houseId);
});
els.exportBtn?.addEventListener('click', exportJson);
els.importFile?.addEventListener('change', e => importJson(e.target.files[0]));
els.demoBtn?.addEventListener('click', () => toastError('Demo locale non disponibile.'));
els.openHouseDrawerBtn?.addEventListener('click', openHouseDrawer);
els.sideHouseBtn?.addEventListener('click', openHouseDrawer);
els.houseDrawerClose?.addEventListener('click', closeHouseDrawer);
els.houseDrawerBackdrop?.addEventListener('click', closeHouseDrawer);
els.houseDrawerAdd?.addEventListener('click', () => { closeHouseDrawer(); startNewHouseForm(); });
els.houseDrawerList?.addEventListener('click', e => {
  const btn = e.target.closest('.house-btn[data-house-id]');
  if (!btn) return;
  selectHouse(btn.dataset.houseId);
  closeHouseDrawer();
});
els.duePeriod?.addEventListener('change', () => {
  const house = activeHouse();
  if (!house) return;
  const isNew = els.duePeriod.value === '__new__';
  els.duePeriodNewWrap?.classList.toggle('hidden', !isNew);
  loadDueForPeriod(house);
  syncDueForm(house);
});
els.paymentInstallment?.addEventListener('change', () => {
  const house = activeHouse();
  if (house) renderPaymentAfterCard(house);
});

els.paymentMethodPills?.addEventListener('click', e => {
  const btn = e.target.closest('[data-method]');
  if (!btn || !els.paymentMethod) return;
  const isOther = !btn.dataset.method;
  els.paymentMethodPills.dataset.other = isOther ? '1' : '0';
  els.paymentMethod.value = btn.dataset.method;
  syncPaymentMethodPills();
  if (isOther) els.paymentMethod.focus();
});
els.paymentMethod?.addEventListener('change', syncPaymentMethodPills);
document.addEventListener('click', e => {
  if (e.target.id === 'paymentGuideApply') applyPaymentGuideToForm();
  if (e.target.id === 'paymentGuideCopyCausale') {
    const code = document.getElementById('paymentGuideCausale')?.textContent;
    if (code) navigator.clipboard?.writeText(code).then(() => showToast('Causale copiata.')).catch(() => toastError('Copia non riuscita.'));
  }
  if (e.target.id === 'postImportRegisterPay') {
    navigate('registra', 'versamenti');
    applyPaymentGuideToForm();
    state.postImportPaymentHint = null;
    render();
  }
  if (e.target.id === 'postImportDismiss') {
    state.postImportPaymentHint = null;
    render();
  }
});
els.loginThemeToggle.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
els.recoveryThemeToggle.addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
wireNavigation();

onboardingSkip?.addEventListener('click', () => finishOnboarding());
onboardingNext?.addEventListener('click', async () => {
  if (onboardingStep === 0 && !state.data.houses.length) {
    const name = document.getElementById('onbHouseName')?.value?.trim();
    if (!name) { toastError('Scrivi un nome per la casa.'); return; }
    onboardingDraftHouse = {
      name,
      location: document.getElementById('onbHouseLocation')?.value?.trim() || ''
    };
  }
  if (onboardingStep === 1 && !state.data.houses.length) {
    if (!onboardingDraftHouse) { onboardingStep = 0; showOnboardingStep(); return; }
    const month = Number(onboardingFields?.querySelector('input[name="onbFiscalMonth"]:checked')?.value || 6);
    const house = await createAndSaveHouse({ ...onboardingDraftHouse, fiscalStartMonth: month });
    if (!house) return;
    onboardingDraftHouse = null;
    showToast('Casa creata.');
  }
  if (onboardingStep >= 2) {
    finishOnboarding();
    navigate('registra', 'dovuti');
    return;
  }
  onboardingStep += 1;
  showOnboardingStep();
});

const CALENDAR_WIZARD_STEPS = ['cadenza', 'preavviso', 'anteprima', 'scarica'];
let calendarWizardStep = 0;

function activeFiscalPeriodId(house) {
  const p = findPeriodByDate(house, today);
  return p?.id ?? house.fiscalPeriods[0]?.id ?? null;
}

function currentCalendarCadence() {
  const checked = els.calendarWizardForm?.querySelector('input[name="calendarCadence"]:checked');
  return checked?.value || 'monthly';
}

function currentCalendarLeadDays() {
  return Number(els.calendarLeadDays?.value || 3);
}

function reminderPlanTableHtml(plan) {
  if (!plan.period) return '<div class="empty">Nessun esercizio fiscale configurato per questa casa.</div>';
  if (plan.fullyPaid) return `<div class="empty">Nessuna rata residua per ${plan.period.label}: risulti in regola.</div>`;
  const rows = plan.items
    .map(it => `<tr><td>${it.index}/${it.count}</td><td>${it.date}</td><td>${fmt(it.amount)}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>Rata</th><th>Data</th><th>Importo</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCalendarWizardPreview() {
  const house = activeHouse();
  if (!house || !els.calendarWizardPreviewTable) return;
  const periodId = activeFiscalPeriodId(house);
  const plan = periodId
    ? computeReminderPlan(house, periodId, { cadence: currentCalendarCadence(), leadDays: currentCalendarLeadDays() })
    : { items: [], totalRemaining: 0, count: 0, period: null, fullyPaid: false };
  if (els.calendarWizardPreviewSummary) {
    let summary = '';
    if (plan.period && !plan.fullyPaid) {
      summary = `${plan.period.label} · residuo ${fmt(plan.totalRemaining)} in ${plan.count} rate`;
      if (plan.resumedAfterPayment) summary += ` · ultimo versamento il ${plan.lastPaymentDate}: si riparte dalla rata successiva`;
    }
    els.calendarWizardPreviewSummary.textContent = summary;
  }
  els.calendarWizardPreviewTable.innerHTML = reminderPlanTableHtml(plan);
}

function downloadCalendarIcs(house, cadence, leadDays) {
  const periodId = activeFiscalPeriodId(house);
  const plan = periodId ? computeReminderPlan(house, periodId, { cadence, leadDays }) : { items: [], period: null, fullyPaid: false };
  if (!plan.period || plan.fullyPaid || !plan.items.length) {
    toastError('Nessuna rata residua da esportare per questa casa.');
    return;
  }
  const ics = buildIcsCalendar(house, plan, leadDays);
  downloadIcsFile(`rate-${house.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`, ics);
  showToast('File calendario scaricato.');
}

function showCalendarWizardStep() {
  const stepKey = CALENDAR_WIZARD_STEPS[calendarWizardStep];
  els.calendarWizardStepper?.querySelectorAll('.import-step').forEach(li => {
    li.classList.toggle('active', li.dataset.step === stepKey);
  });
  els.calendarWizardForm?.querySelectorAll('.calendar-wizard-step').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.wizardStep === stepKey);
  });
  els.calendarWizardBack?.classList.toggle('hidden', calendarWizardStep === 0);
  if (els.calendarWizardNext) els.calendarWizardNext.textContent = stepKey === 'scarica' ? 'Fine' : 'Avanti';
  els.calendarWizardError?.classList.add('hidden');
  if (stepKey === 'anteprima') renderCalendarWizardPreview();
}

function openCalendarWizard() {
  const house = ensureHouse();
  if (!house || !els.calendarWizardDialog) return;
  const cadenceInput = els.calendarWizardForm?.querySelector(
    `input[name="calendarCadence"][value="${house.calendarReminderCadence || 'monthly'}"]`
  );
  if (cadenceInput) cadenceInput.checked = true;
  if (els.calendarLeadDays) els.calendarLeadDays.value = String(house.calendarReminderLeadDays ?? 3);
  calendarWizardStep = 0;
  showCalendarWizardStep();
  els.calendarWizardDialog.showModal();
}

async function saveCalendarWizard() {
  const house = ensureHouse();
  if (!house) return;
  try {
    await updateCalendarSettings(house, {
      cadence: currentCalendarCadence(),
      leadDays: currentCalendarLeadDays()
    });
    renderCalendarSettingsView();
    els.calendarWizardDialog?.close();
  } catch (err) {
    if (els.calendarWizardError) {
      els.calendarWizardError.textContent = err.message || 'Errore salvataggio impostazioni calendario';
      els.calendarWizardError.classList.remove('hidden');
    }
  }
}

function renderCalendarSettingsView() {
  const house = activeHouse();
  if (!els.calendarFeedStatus || !els.calendarFeedPreview) return;
  if (!house) {
    els.calendarFeedStatus.innerHTML = '';
    els.calendarFeedPreview.innerHTML = '';
    return;
  }
  const cadenceLabel = REMINDER_CADENCES[house.calendarReminderCadence]?.label || 'Mensile';
  els.calendarFeedStatus.innerHTML = `<div class="metric-label">Cadenza rate</div><div class="metric-value" style="font-size:1.1rem;">${cadenceLabel} · preavviso ${house.calendarReminderLeadDays ?? 3} giorni</div>`;
  const periodId = activeFiscalPeriodId(house);
  const plan = periodId
    ? computeReminderPlan(house, periodId, {
        cadence: house.calendarReminderCadence || 'monthly',
        leadDays: house.calendarReminderLeadDays ?? 3
      })
    : { items: [], totalRemaining: 0, count: 0, period: null, fullyPaid: false };
  els.calendarFeedPreview.innerHTML = reminderPlanTableHtml(plan);
}

els.calendarWizardForm?.addEventListener('submit', e => e.preventDefault());
els.openCalendarWizardBtn?.addEventListener('click', openCalendarWizard);
els.calendarWizardClose?.addEventListener('click', () => els.calendarWizardDialog?.close());
els.calendarWizardBack?.addEventListener('click', () => {
  if (calendarWizardStep > 0) {
    calendarWizardStep -= 1;
    showCalendarWizardStep();
  }
});
els.calendarWizardNext?.addEventListener('click', () => {
  if (calendarWizardStep < CALENDAR_WIZARD_STEPS.length - 1) {
    calendarWizardStep += 1;
    showCalendarWizardStep();
  } else {
    saveCalendarWizard();
  }
});
els.calendarWizardDownloadBtn?.addEventListener('click', () => {
  const house = ensureHouse();
  if (!house) return;
  downloadCalendarIcs(house, currentCalendarCadence(), currentCalendarLeadDays());
});
els.downloadCalendarIcsBtn?.addEventListener('click', () => {
  const house = ensureHouse();
  if (!house) return;
  downloadCalendarIcs(house, house.calendarReminderCadence || 'monthly', house.calendarReminderLeadDays ?? 3);
});

els.periodFilter.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.paymentFilterPeriod?.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.paymentPeriod?.addEventListener('change', () => {
  const house = activeHouse();
  if (!house) return;
  state.paymentSelection = null;
  syncPaymentInstallmentSelect(house);
  renderPaymentTargetOptions(house);
  renderPaymentAfterCard(house);
});
els.situazionePeriod?.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.situazionePdfBtn?.addEventListener('click', async () => {
  const house = ensureHouse();
  if (!house || !els.situazionePeriod?.value) return;
  try {
    await exportSituazionePdf(house, els.situazionePeriod.value);
  } catch (err) {
    toastError(err.message || 'Errore export PDF');
  }
});
els.logoutBtn.addEventListener('click', auth.logout);
els.sideLogoutBtn?.addEventListener('click', auth.logout);

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
  house.importParties = collectImportPartiesFromDom(els.houseImportParties);
  const partyWarnings = validateParties(house.importParties);
  if (partyWarnings.length) {
    toastError(partyWarnings[0]);
    return;
  }
  try {
    if (state.user) await saveHouseToSupabase(house);
    render();
    showToast('Immobile salvato.');
  } catch (err) {
    toastError(err.message);
  }
});

els.deleteHouseBtn.addEventListener('click', async () => {
  const house = activeHouse();
  if (!house) return;
  if (!await confirmDialog(`Eliminare ${house.name}?`, { title: 'Elimina immobile', confirmLabel: 'Elimina', danger: true })) return;
  try {
    if (state.user && Number.isFinite(Number(house.id))) await deleteHouseRemote(house.id);
    state.data.houses = state.data.houses.filter(h => h.id !== house.id);
    state.selectedHouseId = state.data.houses[0]?.id || null;
    state.houseFormMode = state.data.houses.length ? 'edit' : 'new';
    render();
    if (!state.data.houses.length) startNewHouseForm();
    else navigate('panoramica');
  } catch (err) {
    toastError(err.message);
  }
});

/**
 * Salva il documento dell'anno: il preventivo ordinario (P) o una spesa
 * straordinaria (S). Le due cose vivono nello stesso modulo — cambia la voce —
 * perché per il condominio sono la stessa riga: un importo deliberato da pagare.
 *
 * Il preventivo porta con sé le sue rate, generate dalla cadenza scelta; gli
 * straordinari no: si decide nel piano rate in quali rate finiscono, e finché non
 * lo si fa restano una voce aperta a sé.
 */
els.dueForm.addEventListener('submit', async e => {
  e.preventDefault();
  const house = ensureHouse();
  if (!house) return;
  try {
    await ensureHousePersisted(house);
    const fd = new FormData(els.dueForm);
    const editId = String(fd.get('editId') || els.dueEditId?.value || '').trim();
    const due = createLocalDue(fd);
    due.voice = String(els.dueVoice?.value || 'ordinario');

    const periodSel = els.duePeriod?.value;
    if (periodSel && periodSel !== '__new__') {
      due.fiscalPeriodId = periodSel;
      due.fiscalPeriodLabel = periodLabel(house, periodSel);
    } else {
      due.fiscalPeriodLabel = String(fd.get('fiscalPeriodLabel') || els.duePeriodNew?.value || '').trim();
      if (!due.fiscalPeriodLabel) {
        toastError('Seleziona o scrivi l’anno condominiale.');
        return;
      }
    }

    if (due.voice === 'ordinario') {
      const cadence = dueCadenceState().id || 'monthly';
      const start = periodStartForDueForm(house, periodSel, due.fiscalPeriodLabel);
      const existing = editId && due.fiscalPeriodId ? planRows(house, due.fiscalPeriodId) : [];
      const keepRows = existing.length && !dueCadenceState().touched;
      const rows = keepRows
        ? redistributeOrdinario(existing, due.amount)
        : generateRows({
          periodStart: start,
          cadence,
          targets: {
            ordinario: due.amount,
            // Conguaglio e straordinari entrano nelle rate dal piano: qui non si toccano,
            // se non quando le rate nascono adesso per la prima volta.
            conguaglio: keepRows ? 0 : conguaglioTarget(house, due.fiscalPeriodId),
            straordinari: 0
          }
        });
      if (!rows.length) {
        toastError('Non riesco a costruire le rate: controlla l’importo.');
        return;
      }
      // Le rate viaggiano sempre per esteso, mese per mese e voce per voce: la
      // cadenza serve solo a generarle, e «custom» è ciò che descrive il risultato.
      due.splitAmounts = rowsToSplitAmounts(house, due.fiscalPeriodId, rows);
      due.splitMode = 'custom';
      due.splitCustom = null;
    } else {
      // Una spesa straordinaria non ha rate sue: le prende dal piano dell'anno.
      due.splitAmounts = null;
      due.splitMode = 'monthly';
      due.splitCustom = null;
    }

    if (editId) due.id = editId;
    if (state.user) {
      if (!due.fiscalPeriodId && due.fiscalPeriodLabel) {
        const { period } = await ensureFiscalPeriodByLabel(house, due.fiscalPeriodLabel);
        due.fiscalPeriodId = period.id;
      }
      await saveDueToSupabase(house, due);
      resetDueForm();
      await loadFromSupabase();
    } else if (editId) {
      const prev = house.dues.find(d => d.id === editId);
      if (prev) Object.assign(prev, due, { id: editId, fiscalPeriodId: due.fiscalPeriodId || due.fiscalPeriodLabel });
    } else {
      house.dues.push({ ...due, id: uid('due'), fiscalPeriodId: due.fiscalPeriodId || due.fiscalPeriodLabel });
    }
    ratePlanState().dirty = false;
    render();
    const straordinaria = due.voice === 'straordinario';
    const what = straordinaria ? 'Spesa straordinaria' : 'Preventivo';
    showToast(`${what} ${editId ? 'aggiornat' : 'salvat'}${straordinaria ? 'a' : 'o'}.`);
    navigate('resoconti', 'anno');
  } catch (err) {
    toastError(err.message);
  }
});

/** La data d'inizio dell'anno a cui si riferisce il modulo, anche se l'anno non esiste ancora. */
function periodStartForDueForm(house, periodSel, label) {
  if (periodSel && periodSel !== '__new__') {
    const period = house.fiscalPeriods.find(p => String(p.id) === String(periodSel));
    if (period?.startDate) return period.startDate;
  }
  const year = Number(String(label || '').slice(0, 4));
  if (!Number.isFinite(year) || year < 1900) return null;
  return `${year}-${String(house.fiscalStartMonth || 6).padStart(2, '0')}-01`;
}

/** Il conguaglio dell'anno precedente che va messo nelle rate appena nascono. */
function conguaglioTarget(house, periodId) {
  if (!periodId) return 0;
  return round2(getPriorBalanceForPeriod(house, periodId)?.amount || 0);
}

/**
 * Cambiare l'importo del preventivo non deve buttare via le rate già decise: si
 * ridistribuisce solo la colonna dell'ordinario, lasciando conguaglio e
 * straordinari dove sono.
 */
function redistributeOrdinario(rows, total) {
  const amounts = splitEqually(total, rows.length);
  return rows.map((row, i) => ({ ...row, ordinario: amounts[i] }));
}

els.dueFormCancel?.addEventListener('click', () => {
  resetDueForm();
  render();
});

/**
 * Il consuntivo chiude l'anno: dice quanto si è speso davvero. Da lì l'app ricava
 * il conguaglio — consuntivo meno pagato — e lo porta all'anno dopo, perché è lì
 * che si salda. L'utente sceglie solo *come* saldarlo; il numero non si scrive.
 */
els.consForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const house = ensureHouse();
  if (!house) return;
  try {
    await ensureHousePersisted(house);
    const periodId = els.consPeriod?.value;
    if (!periodId) { toastError('Scegli l’anno condominiale.'); return; }
    const amount = Number(els.consAmount?.value || 0);
    if (!Number.isFinite(amount) || amount <= 0) { toastError('Scrivi quanto hai speso davvero.'); return; }

    const editId = String(els.consEditId?.value || '').trim();
    const existing = editId
      ? house.dues.find(d => String(d.id) === editId)
      : house.dues.find(d => String(d.fiscalPeriodId) === String(periodId) && d.dueKind === 'consuntivo');
    const due = {
      id: existing?.id,
      fiscalPeriodId: periodId,
      fiscalPeriodLabel: periodLabel(house, periodId),
      amount,
      description: existing?.description || `Consuntivo ${periodLabel(house, periodId)}`,
      splitMode: 'monthly',
      splitCustom: null,
      splitAmounts: null,
      dueKind: 'consuntivo',
      voice: null,
      carryFromPeriodId: null,
      date: today
    };

    if (state.user) {
      await saveDueToSupabase(house, due);
      await loadFromSupabase();
    } else if (existing) {
      Object.assign(existing, due, { id: existing.id });
    } else {
      house.dues.push({ ...due, id: uid('due') });
    }

    const message = await applyConguaglio(activeHouse() || house, periodId, consSettleState().mode);
    resetConsForm();
    render();
    showToast(message);
    navigate('resoconti', 'anno');
  } catch (err) {
    toastError(err.message);
  }
});

els.consFormCancel?.addEventListener('click', () => {
  resetConsForm();
  render();
});

/**
 * Porta il conguaglio all'anno successivo, nel modo scelto.
 *
 * Il saldo resta sempre registrato come saldo dell'anno dopo — è lì che si paga —
 * e in più, se si è scelto di metterlo nelle rate, entra nella colonna conguaglio
 * del piano rate di quell'anno: una rata sola («insieme alla prossima») o tutte
 * («diviso sulle rate»). Così quello che si vede in «da pagare» e quello che dice
 * il consuntivo sono sempre la stessa cifra.
 *
 * @returns {Promise<string>} il messaggio da mostrare
 */
async function applyConguaglio(house, periodId, mode) {
  const c = computeConguaglio(house, periodId);
  const label = periodLabel(house, periodId);
  if (!c || c.direction === 'pari') return `Consuntivo ${label} salvato: sei in pari.`;

  const next = await ensureNextPeriod(house, periodId);
  if (!next) {
    return `Consuntivo ${label} salvato. Crea l’anno successivo per registrare il conguaglio.`;
  }

  const balance = {
    ...(getPriorBalanceForPeriod(house, next.id) || {}),
    fiscalPeriodId: next.id,
    sourcePeriodId: periodId,
    amount: c.amount,
    description: `Conguaglio ${label}`
  };
  if (state.user) await savePriorBalanceToSupabase(house, balance);
  else {
    house.priorBalances = (house.priorBalances || []).filter(b => String(b.fiscalPeriodId) !== String(next.id));
    house.priorBalances.push({ ...balance, id: balance.id || uid('prior') });
  }

  const verso = c.direction === 'debito' ? 'a debito' : 'a credito';
  const inRate = mode === 'prossima' || mode === 'diviso' || mode === 'scalato';
  if (!inRate) return `Conguaglio di ${fmt(Math.abs(c.amount))} ${verso}: lo trovi tra le cose da pagare del ${next.label}.`;

  const placed = await allocateConguaglioInRate(house, next.id, c.amount, mode === 'diviso' ? 'diviso' : 'prima');
  if (!placed) {
    return `Conguaglio di ${fmt(Math.abs(c.amount))} ${verso}: il ${next.label} non ha ancora un preventivo, resta un pagamento a parte.`;
  }
  return mode === 'diviso'
    ? `Conguaglio di ${fmt(Math.abs(c.amount))} ${verso}, diviso sulle rate del ${next.label}.`
    : `Conguaglio di ${fmt(Math.abs(c.amount))} ${verso}, messo sulla prima rata del ${next.label}.`;
}

/** L'anno successivo, creandolo se ancora non c'è. */
async function ensureNextPeriod(house, periodId) {
  const existing = getNextPeriod(house, periodId);
  if (existing) return existing;
  const period = house.fiscalPeriods.find(p => String(p.id) === String(periodId));
  if (!period?.startDate) return null;
  const nextLabel = house.fiscalStartMonth === 1
    ? String(Number(period.startDate.slice(0, 4)) + 1)
    : `${Number(period.startDate.slice(0, 4)) + 1}/${Number(period.startDate.slice(0, 4)) + 2}`;
  if (!state.user) return null;
  const { period: created } = await ensureFiscalPeriodByLabel(house, nextLabel);
  return created;
}

/** Scrive il conguaglio nella colonna ± del piano rate dell'anno. */
async function allocateConguaglioInRate(house, periodId, amount, how) {
  const due = ordinarioDueForPeriod(house, periodId);
  const rows = planRows(house, periodId);
  if (!due || !rows.length) return false;
  const quote = how === 'diviso' ? splitEqually(amount, rows.length) : rows.map((_, i) => (i === 0 ? round2(amount) : 0));
  const updated = rows.map((row, i) => ({ ...row, conguaglio: quote[i] }));
  const payload = {
    ...due,
    splitAmounts: rowsToSplitAmounts(house, periodId, updated),
    splitMode: 'custom',
    splitCustom: null
  };
  if (state.user) {
    await saveDueToSupabase(house, payload);
    await loadFromSupabase();
  } else {
    Object.assign(due, payload);
  }
  return true;
}

/**
 * Registra un versamento.
 *
 * Un bonifico solo può coprire più cose: due rate, una rata e il conguaglio, un
 * acconto libero. Qui ogni voce selezionata diventa un pagamento suo — è l'unico
 * modo perché «quanto manca» resti giusto voce per voce — e il totale che l'utente
 * vede nel modulo è la somma di quelli che sta per salvare.
 *
 * In modifica si torna invece a un pagamento solo: si cambia l'importo e la rata
 * a cui è agganciato, niente di più.
 */
els.paymentForm.addEventListener('submit', async e => {
  e.preventDefault();
  const house = ensureHouse();
  if (!house) return;
  try {
    await ensureHousePersisted(house);
    const fd = new FormData(els.paymentForm);
    const editId = String(fd.get('editId') || els.paymentEditId?.value || '').trim();
    let periodId = els.paymentPeriod?.value;
    if (!periodId) {
      const { period } = await ensureFiscalPeriod(house, els.paymentDate?.value || today);
      periodId = period.id;
    }
    const date = String(fd.get('date') || today);
    const method = String(fd.get('method') || '').trim();
    const note = String(fd.get('note') || '').trim();

    if (editId) {
      const amount = Number(fd.get('amount'));
      if (!Number.isFinite(amount) || amount === 0) { toastError('Scrivi l’importo del pagamento.'); return; }
      const before = house.payments.find(p => String(p.id) === editId);
      const payment = {
        id: editId,
        fiscalPeriodId: periodId,
        installmentKey: els.paymentEditInstallment?.value || null,
        priorBalanceId: before?.priorBalanceId || null,
        amount,
        date,
        method,
        note,
        isCarryForward: false,
        carryFromPeriodId: null,
        bankMovementId: before?.bankMovementId || null
      };
      if (state.user) {
        await savePaymentToSupabase(house, payment);
        resetPaymentForm(house);
        await loadFromSupabase();
      } else if (before) {
        Object.assign(before, payment);
      }
      render();
      showToast('Pagamento aggiornato.');
      return;
    }

    const selection = paymentSelection(house);
    if (!selection.length) {
      toastError('Scegli cosa stai pagando, o scrivi un altro importo.');
      return;
    }

    const payments = selection.map(item => ({
      id: uid('pay'),
      fiscalPeriodId: periodId,
      installmentKey: item.key || null,
      priorBalanceId: item.kind === 'prior' ? item.priorBalanceId : null,
      amount: round2(item.amount),
      date,
      method,
      note,
      isCarryForward: false,
      carryFromPeriodId: null
    }));

    if (state.user) {
      for (const payment of payments) await savePaymentToSupabase(house, payment);
      resetPaymentForm(house);
      await loadFromSupabase();
    } else {
      house.payments.push(...payments);
      resetPaymentForm(house);
    }
    render();
    const total = round2(payments.reduce((sum, p) => sum + p.amount, 0));
    showToast(payments.length > 1
      ? `${payments.length} voci pagate · ${fmt(total)}.`
      : `Pagamento di ${fmt(total)} registrato.`);
    navigate('pagamenti', 'da-pagare');
  } catch (err) {
    toastError(err.message);
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

els.main?.addEventListener('click', handleRecordAction);

// ───────────────────── Il documento dell'anno: P, S e C ──────────────────────

els.dueAmount?.addEventListener('input', () => {
  const house = activeHouse();
  if (house) syncDueForm(house);
});
els.dueCadenceButtons?.addEventListener('click', e => {
  const btn = e.target.closest('[data-cadence]');
  if (!btn) return;
  dueCadenceState().id = btn.dataset.cadence;
  dueCadenceState().touched = true;
  const house = activeHouse();
  if (house) syncDueForm(house);
});
// Il selettore P / S / C: la voce decide cosa chiede il modulo.
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-due-voice]');
  if (!btn) return;
  const house = activeHouse();
  if (!house) return;
  if (els.dueVoice) els.dueVoice.value = btn.dataset.dueVoice;
  if (els.dueEditId) els.dueEditId.value = '';
  if (btn.dataset.dueVoice === 'straordinario') {
    if (els.dueAmount) els.dueAmount.value = '';
    if (els.dueForm.description) els.dueForm.description.value = '';
  } else {
    loadDueForPeriod(house);
  }
  syncDueForm(house);
});

els.consPeriod?.addEventListener('change', () => {
  const house = activeHouse();
  if (house) syncConsForm(house);
});
els.consAmount?.addEventListener('input', () => {
  const house = activeHouse();
  if (house) syncConsForm(house);
});
els.consSettleOptions?.addEventListener('change', e => {
  const input = e.target.closest('input[name="consSettle"]');
  if (!input) return;
  consSettleState().mode = input.value;
  const house = activeHouse();
  if (house) syncConsForm(house, { keepOptions: true });
});

// ───────────────────────── Registra: cosa stai pagando ───────────────────────

els.paymentTargetOptions?.addEventListener('change', () => {
  const house = activeHouse();
  if (!house) return;
  state.paymentSelection = [...els.paymentTargetOptions.querySelectorAll('[data-pay-item]:checked')]
    .map(input => input.dataset.payItem);
  renderPaymentAfterCard(house);
});
els.paymentExtraToggle?.addEventListener('click', () => {
  const open = els.paymentExtra?.classList.toggle('hidden') === false;
  els.paymentExtraToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});
els.paymentFreeAmount?.addEventListener('input', () => {
  const house = activeHouse();
  if (house) renderPaymentAfterCard(house);
});

// ─────────────────────────────── Resoconti ───────────────────────────────────

els.resocontiYears?.addEventListener('click', e => {
  const btn = e.target.closest('[data-resoconto-period]');
  if (!btn) return;
  state.resocontoPeriodId = btn.dataset.resocontoPeriod;
  state.pendingSituazionePeriodId = btn.dataset.resocontoPeriod;
  render();
});
document.getElementById('mainContent')?.addEventListener('click', e => {
  if (e.target.closest('#pagamentiToggleRate')) {
    state.pagamentiShowAllRate = !state.pagamentiShowAllRate;
    render();
  }
});

// ─────────────────────────── Le rate, una per una ────────────────────────────

els.ratePlanPeriod?.addEventListener('change', () => {
  const house = activeHouse();
  if (!house) return;
  ratePlanState().dirty = false;
  state.resocontoPeriodId = els.ratePlanPeriod.value;
  renderRatePlan(house);
});

/** Una modifica a mano: da qui in poi il piano è quello scritto, non quello generato. */
function touchRatePlan(house) {
  ratePlanState().dirty = true;
  renderRatePlanTargets(house);
  renderRatePlanTable(house);
}

els.ratePlanTable?.addEventListener('change', e => {
  const house = activeHouse();
  if (!house) return;
  const rows = ratePlanState().rows;
  const monthSel = e.target.closest('[data-plan-month]');
  const yearSel = e.target.closest('[data-plan-year]');
  const amount = e.target.closest('[data-plan-amount]');
  if (monthSel || yearSel) {
    const i = Number(monthSel ? monthSel.dataset.planMonth : yearSel.dataset.planYear);
    const row = rows[i];
    if (!row) return;
    const month = Number(monthSel ? monthSel.value : Number(String(row.start).slice(5, 7)) - 1);
    const year = Number(yearSel ? yearSel.value : String(row.start).slice(0, 4));
    row.start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    touchRatePlan(house);
    return;
  }
  if (amount) {
    const row = rows[Number(amount.dataset.planAmount)];
    if (!row) return;
    row[amount.dataset.planVoice] = parseAmount(amount.value);
    touchRatePlan(house);
  }
});

/** Un importo scritto a mano: «1.234,56», «1234.56» o vuoto. */
function parseAmount(text) {
  const clean = String(text ?? '').trim().replace(/[€\s]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? round2(n) : 0;
}
els.ratePlanTable?.addEventListener('click', e => {
  const btn = e.target.closest('[data-plan-remove]');
  if (!btn) return;
  const house = activeHouse();
  if (!house) return;
  const rows = ratePlanState().rows;
  if (rows.length < 2) return;
  rows.splice(Number(btn.dataset.planRemove), 1);
  touchRatePlan(house);
});
els.ratePlanAdd?.addEventListener('click', () => {
  const house = activeHouse();
  if (!house) return;
  const rows = ratePlanState().rows;
  const last = rows[rows.length - 1];
  const base = last ? new Date(Number(String(last.start).slice(0, 4)), Number(String(last.start).slice(5, 7)), 1) : new Date();
  rows.push({
    start: `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-01`,
    ordinario: 0,
    conguaglio: 0,
    straordinari: 0
  });
  touchRatePlan(house);
});
els.ratePlanReset?.addEventListener('click', () => {
  const house = activeHouse();
  if (!house) return;
  const periodId = ratePlanState().periodId;
  const rows = ratePlanState().rows;
  const targets = planTargets(house, periodId);
  // Le date restano quelle scelte: si ridividono solo gli importi.
  const quote = {
    ordinario: splitEqually(targets.ordinario, rows.length),
    conguaglio: splitEqually(targets.conguaglio, rows.length),
    straordinari: splitEqually(targets.straordinari, rows.length)
  };
  rows.forEach((row, i) => {
    row.ordinario = quote.ordinario[i];
    row.conguaglio = quote.conguaglio[i];
    row.straordinari = quote.straordinari[i];
  });
  touchRatePlan(house);
  showToast('Importi ridivisi in parti uguali.');
});
els.ratePlanSave?.addEventListener('click', async () => {
  const house = ensureHouse();
  if (!house) return;
  const periodId = ratePlanState().periodId;
  const due = ordinarioDueForPeriod(house, periodId);
  if (!due) {
    toastError('Questo anno non ha ancora un preventivo: aggiungilo prima di decidere le rate.');
    return;
  }
  const rows = ratePlanState().rows.filter(r => r.start);
  if (!rows.length) { toastError('Serve almeno una rata.'); return; }
  try {
    const payload = {
      ...due,
      splitAmounts: rowsToSplitAmounts(house, periodId, rows),
      splitMode: 'custom',
      splitCustom: null
    };
    if (state.user) {
      await saveDueToSupabase(house, payload);
      await loadFromSupabase();
    } else {
      Object.assign(due, payload);
    }
    ratePlanState().dirty = false;
    render();
    showToast('Piano rate salvato.');
  } catch (err) {
    toastError(err.message);
  }
});


els.bankImportFile?.addEventListener('change', e => handleBankFile(e.target.files[0]));
els.bankImportConfirm?.addEventListener('click', confirmBankImport);

els.bankImportBatches?.addEventListener('click', async e => {
  const btn = e.target.closest('.delete-batch-btn');
  if (!btn) return;
  const house = ensureHouse();
  if (!house || !Number.isFinite(Number(house.id))) return;
  const batchId = btn.dataset.batch;
  if (!batchId) return;
  const batchMovements = house.bankMovements.filter(m => m.importBatchId === batchId);
  const preview = previewBankImportDelete(house, batchMovements);
  if (!preview.deletableMovements) {
    toastError(preview.protectedMovements
      ? 'Tutti i movimenti di questo import sono collegati a un dovuto: nulla da eliminare.'
      : 'Nessun movimento da eliminare.');
    return;
  }
  const payNote = preview.deletablePayments
    ? ` e ${preview.deletablePayments} versament${preview.deletablePayments === 1 ? 'o' : 'i'} non collegat${preview.deletablePayments === 1 ? 'o' : 'i'} a un dovuto`
    : '';
  const keepNote = preview.protectedMovements
    ? `\n\n${preview.protectedMovements} moviment${preview.protectedMovements === 1 ? 'o' : 'i'} già associat${preview.protectedMovements === 1 ? 'o' : 'i'} a un dovuto verranno mantenut${preview.protectedMovements === 1 ? 'o' : 'i'}.`
    : '';
  if (!await confirmDialog(
    `Eliminare ${preview.deletableMovements} moviment${preview.deletableMovements === 1 ? 'o' : 'i'} banca non associat${preview.deletableMovements === 1 ? 'o' : 'i'} a un dovuto${payNote}?${keepNote}`,
    { title: 'Elimina import', confirmLabel: 'Elimina', danger: true }
  )) return;
  try {
    const result = await deleteBankImportBatch(house, batchId);
    await loadFromSupabase();
    render();
    showToast(result.skippedMovements
      ? `Eliminati ${result.deletedMovements} movimenti. ${result.skippedMovements} collegati a un dovuto mantenuti.`
      : `Eliminati ${result.deletedMovements} movimenti banca${result.deletedPayments ? ` e ${result.deletedPayments} versamenti` : ''}.`);
  } catch (err) {
    toastError(err.message || 'Errore eliminazione import');
  }
});

els.bankImportDeleteAll?.addEventListener('click', async () => {
  const house = ensureHouse();
  if (!house || !Number.isFinite(Number(house.id))) return;
  const count = house.bankMovements?.length || 0;
  if (!count) {
    toastError('Nessun movimento banca da eliminare.');
    return;
  }
  const preview = previewBankImportDelete(house, house.bankMovements);
  if (!preview.deletableMovements) {
    toastError(preview.protectedMovements
      ? 'Tutti i movimenti banca sono collegati a un dovuto: nulla da eliminare.'
      : 'Nessun movimento da eliminare.');
    return;
  }
  const payNote = preview.deletablePayments
    ? ` e ${preview.deletablePayments} versament${preview.deletablePayments === 1 ? 'o' : 'i'} non collegat${preview.deletablePayments === 1 ? 'o' : 'i'} a un dovuto`
    : '';
  const keepNote = preview.protectedMovements
    ? `\n\n${preview.protectedMovements} moviment${preview.protectedMovements === 1 ? 'o' : 'i'} già associat${preview.protectedMovements === 1 ? 'o' : 'i'} a un dovuto (rate/versamenti) verranno mantenut${preview.protectedMovements === 1 ? 'o' : 'i'}.`
    : '';
  if (!await confirmDialog(
    `Eliminare ${preview.deletableMovements} moviment${preview.deletableMovements === 1 ? 'o' : 'i'} banca non associat${preview.deletableMovements === 1 ? 'o' : 'i'} a un dovuto${payNote}?${keepNote}`,
    { title: 'Elimina import non associati', confirmLabel: 'Elimina', danger: true }
  )) return;
  const btn = els.bankImportDeleteAll;
  if (btn) btn.disabled = true;
  try {
    const result = await deleteAllBankImports(house);
    await loadFromSupabase();
    render();
    showToast(result.skippedMovements
      ? `Eliminati ${result.deletedMovements} movimenti. ${result.skippedMovements} collegati a un dovuto mantenuti.`
      : result.deletedMovements
        ? `Eliminati ${result.deletedMovements} movimenti banca${result.deletedPayments ? ` e ${result.deletedPayments} versamenti` : ''}.`
        : 'Nessun movimento eliminabile.');
  } catch (err) {
    toastError(err.message || 'Errore eliminazione import');
    render();
  }
});

els.unlinkedMovements?.addEventListener('click', async e => {
  const btn = e.target.closest('.link-btn');
  if (!btn) return;
  const house = ensureHouse();
  if (!house) return;
  const row = btn.closest('tr');
  const select = row?.querySelector('.link-period');
  if (!select?.value) { toastError('Seleziona un esercizio fiscale.'); return; }
  try {
    const periodId = select.value;
    await linkBankMovement(house, btn.dataset.id, periodId);
    state.pendingSituazionePeriodId = periodId;
    await loadFromSupabase();
    render();
    showToast('Movimento associato all\'esercizio.');
  } catch (err) {
    toastError(err.message);
  }
});

async function initApp() {
  sanitizeLocationUrl();
  auth.loadStoredConfig();
  setTheme(state.theme);
  auth.setAuthUI(false);
  auth.showRecoveryUI(false);
  auth.setLoginLoading(true);
  try {
    auth.bindAuthStateChange();
    const sessionResult = await auth.restoreSession();
    if (sessionResult === true) {
      const route = parseAppRouteHash();
      navigate(route?.view || 'panoramica', route?.subview);
      render();
    }
  } catch {
    els.loginError.textContent = 'Impossibile connettersi al servizio. Riprova più tardi.';
    els.loginError.classList.remove('hidden');
  } finally {
    auth.setLoginLoading(false);
  }
}

window.addEventListener('hashchange', () => {
  if (!state.user || !els.appShell || els.appShell.classList.contains('hidden')) return;
  const route = parseAppRouteHash();
  if (!route) return;
  setView(route.view, route.subview);
  render();
});

initApp();
