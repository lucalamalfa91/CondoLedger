import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  createLocalDue,
  createLocalPayment,
  createSupabaseClient,
  deleteAllBankImports,
  deleteBankImportBatch,
  previewBankImportDelete,
  deleteDueFromSupabase,
  deleteHouseRemote,
  deletePaymentFromSupabase,
  deletePriorBalanceFromSupabase,
  ensureFiscalPeriod,
  ensureFiscalPeriodByLabel,
  linkBankMovement,
  loadFromSupabase,
  reloadHouseFromSupabase,
  saveBankImport,
  saveDueToSupabase,
  saveHouseToSupabase,
  savePaymentToSupabase,
  savePriorBalanceToSupabase,
  saveUnlinkedBankMovements,
  syncBackupToSupabase
} from './api.js';
import { createAuthHandlers } from './auth.js';
import { exportBackup, parseBackup } from './backup.js';
import { resolveView, viewMeta } from './config.js';
import { suggestCarryover } from './carryover.js';
import { periodLabel } from './fiscal.js';
import { findInstallmentForDate } from './installments.js';
import { exportSituazionePdf } from './pdf-situazione.js';
import { getPreviousPeriod } from './fiscal.js';
import { applyAutoFilterToPreview, mergeExtractions } from './document-import-match.js';
import { applyResocontoToPreview, buildResoconto, ensureResoconto } from './document-import-resoconto.js';
import { buildDuesFromPreview, initPreviewFromExtraction } from './document-import-map.js';
import { collectImportPartiesFromDom, hasConfiguredParties, validateParties } from './house-import-parties.js';
import { emptyExtraction } from './document-import-schema.js';
import {
  deleteDuesByIds,
  extractFromDocument,
  findDuplicateImport,
  findExistingDuesForImport,
  hashFiles,
  recordDocumentImport,
  sourceLabelFromFiles
} from './document-import-api.js';
import { collectLowConfidenceIssues, validateCommitPreview } from './document-import-validate.js';
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
  setView, render: baseRender, syncPaymentPeriodSelect,
  syncPaymentInstallmentSelect, syncDueKindFields, syncDuePeriodSelect, applyPaymentSmartAmount,
  syncPriorBalancePeriodSelect, syncPriorBalanceSourceSelect
} = createRenderer(els);
let renderedHouseId = null;
function render(...args) {
  const house = activeHouse();
  if (String(house?.id ?? '') !== String(renderedHouseId ?? '')) {
    resetDueForm();
    resetPaymentForm(house);
    resetPriorBalanceForm(house);
    renderedHouseId = house?.id != null ? String(house.id) : null;
  }
  baseRender(...args);
  maybeShowOnboarding();
}

const onboardingDialog = document.getElementById('onboardingDialog');
const onboardingTitle = document.getElementById('onboardingTitle');
const onboardingBody = document.getElementById('onboardingBody');
const onboardingStepLabel = document.getElementById('onboardingStepLabel');
const onboardingFields = document.getElementById('onboardingFields');
const onboardingNext = document.getElementById('onboardingNext');
const onboardingSkip = document.getElementById('onboardingSkip');
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

function showOnboardingStep() {
  const hasHouse = state.data.houses.length > 0;
  const steps = [
    {
      label: 'Passo 1 di 3',
      title: 'Gestisci le spese di condominio',
      body: 'Importa preventivo e consuntivo dall’amministratore, registra i versamenti e controlla se sei in regola — anche da telefono.',
      fields: '',
      next: 'Avanti'
    },
    {
      label: 'Passo 2 di 3',
      title: hasHouse ? 'Immobile pronto' : 'Aggiungi il tuo immobile',
      body: hasHouse
        ? `${state.data.houses[0].name} è configurato. Puoi modificarlo da Impostazioni.`
        : 'Serve almeno un appartamento o ufficio per iniziare.',
      fields: hasHouse ? '' : `
        <label for="onbHouseName">Nome immobile</label>
        <input id="onbHouseName" type="text" required placeholder="es. Appartamento via Roma" />
        <label for="onbFiscalMonth">Inizio esercizio fiscale</label>
        <select id="onbFiscalMonth"><option value="6">Giugno (standard)</option><option value="1">Gennaio</option></select>`,
      next: hasHouse ? 'Avanti' : 'Salva e continua'
    },
    {
      label: 'Passo 3 di 3',
      title: 'Prossimo passo',
      body: 'Carica il PDF o la foto del preventivo dall’amministratore: l’app estrae importi e rate.',
      fields: '',
      next: 'Importa documento'
    }
  ];
  const s = steps[onboardingStep];
  if (onboardingStepLabel) onboardingStepLabel.textContent = s.label;
  if (onboardingTitle) onboardingTitle.textContent = s.title;
  if (onboardingBody) onboardingBody.textContent = s.body;
  if (onboardingFields) onboardingFields.innerHTML = s.fields;
  if (onboardingNext) onboardingNext.textContent = s.next;
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
  if (els.paymentPeriod) els.paymentPeriod.value = g.periodId;
  syncPaymentInstallmentSelect(house, g.installmentKey);
  if (els.paymentAmount) els.paymentAmount.value = String(g.gap);
  if (els.paymentDate) els.paymentDate.value = today;
  showToast('Versamento precompilato.');
}

async function ensureHousePersisted(house) {
  if (state.supabase && state.user && !Number.isFinite(Number(house.id))) {
    await saveHouseToSupabase(house);
    state.selectedHouseId = String(house.id);
    sessionStorage.setItem('app:selectedHouseId', String(house.id));
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

function resetPriorBalanceForm(house) {
  els.priorBalanceForm?.reset();
  if (els.priorBalanceEditId) els.priorBalanceEditId.value = '';
  if (els.priorBalanceSubmitBtn) els.priorBalanceSubmitBtn.textContent = 'Salva saldo';
  els.priorBalanceFormCancel?.classList.add('hidden');
  if (els.priorBalancePeriod) els.priorBalancePeriod.disabled = false;
  if (house) syncPriorBalancePeriodSelect(house);
}

function openFormSheet(paneId) {
  const pane = document.getElementById(paneId);
  const backdrop = document.getElementById(`${paneId}Backdrop`);
  pane?.classList.add('form-sheet--open');
  backdrop?.classList.remove('hidden');
  document.body.classList.add('form-sheet-open');
}

function closeFormSheet(paneId) {
  const pane = document.getElementById(paneId);
  const backdrop = document.getElementById(`${paneId}Backdrop`);
  pane?.classList.remove('form-sheet--open');
  backdrop?.classList.add('hidden');
  if (!document.querySelector('.split-form-pane.form-sheet--open')) {
    document.body.classList.remove('form-sheet-open');
  }
}

function closeAllFormSheets() {
  closeFormSheet('dueFormPane');
  closeFormSheet('paymentFormPane');
  closeFormSheet('priorBalanceFormPane');
}

function startEditDue(house, due) {
  syncDuePeriodSelect(house, due.fiscalPeriodId);
  if (els.duePeriodNew) els.duePeriodNew.value = periodLabel(house, due.fiscalPeriodId);
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
  navigate('registra', 'dovuti');
  if (window.matchMedia('(max-width: 860px)').matches) openFormSheet('dueFormPane');
  else els.dueForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  navigate('registra', 'versamenti');
  if (window.matchMedia('(max-width: 860px)').matches) openFormSheet('paymentFormPane');
  else els.paymentForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function startEditPriorBalance(house, priorBalance) {
  navigate('registra', 'apertura-esercizio');
  syncPriorBalancePeriodSelect(house, priorBalance.fiscalPeriodId, priorBalance.sourcePeriodId);
  if (els.priorBalanceAmount) els.priorBalanceAmount.value = String(priorBalance.amount);
  if (els.priorBalanceDescription) els.priorBalanceDescription.value = priorBalance.description || '';
  if (els.priorBalanceEditId) els.priorBalanceEditId.value = priorBalance.id;
  if (els.priorBalanceSubmitBtn) els.priorBalanceSubmitBtn.textContent = 'Aggiorna saldo';
  els.priorBalanceFormCancel?.classList.remove('hidden');
  if (els.priorBalancePeriod) els.priorBalancePeriod.disabled = true;
  if (window.matchMedia('(max-width: 860px)').matches) openFormSheet('priorBalanceFormPane');
  else els.priorBalanceForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deletePriorBalance(house, priorBalanceId) {
  const item = (house.priorBalances || []).find(b => String(b.id) === String(priorBalanceId));
  if (!item || !await confirmDialog('Eliminare questo saldo precedente?', { title: 'Elimina saldo', confirmLabel: 'Elimina', danger: true })) return;
  try {
    if (state.supabase && state.user && Number.isFinite(Number(priorBalanceId))) {
      await deletePriorBalanceFromSupabase(house, priorBalanceId);
      await reloadHouseFromSupabase(house.id);
    } else {
      house.priorBalances = (house.priorBalances || []).filter(b => String(b.id) !== String(priorBalanceId));
    }
    if (String(els.priorBalanceEditId?.value) === String(priorBalanceId)) resetPriorBalanceForm(activeHouse());
    render();
    showToast('Saldo precedente eliminato.');
  } catch (err) {
    toastError(err.message);
  }
}

async function deleteDue(house, dueId) {
  const due = house.dues.find(d => d.id === dueId);
  if (!due || !await confirmDialog('Eliminare questo dovuto?', { title: 'Elimina dovuto', confirmLabel: 'Elimina', danger: true })) return;
  try {
    if (state.supabase && state.user && Number.isFinite(Number(dueId))) {
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
    if (state.supabase && state.user && Number.isFinite(Number(paymentId))) {
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

  if (kind === 'prior') {
    if (action === 'edit') {
      const item = (house.priorBalances || []).find(b => String(b.id) === String(id));
      if (item) startEditPriorBalance(house, item);
    } else if (action === 'delete') {
      deletePriorBalance(house, id);
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

function askDuplicateImportChoice(dup) {
  return new Promise(resolve => {
    const dlg = els.documentImportDupDialog;
    if (!dlg) {
      resolve(null);
      return;
    }
    const when = dup.created_at ? new Date(dup.created_at).toLocaleString('it-IT') : '—';
    els.documentImportDupMsg.textContent =
      `Import precedente: «${dup.source_label}» (${when}). Come vuoi procedere?`;
    const finish = v => {
      dlg.close();
      resolve(v);
    };
    els.documentImportDupAdd.onclick = () => finish('add');
    els.documentImportDupReplace.onclick = () => finish('replace');
    els.documentImportDupCancel.onclick = () => finish(null);
    dlg.addEventListener('cancel', () => finish(null), { once: true });
    dlg.showModal();
  });
}

async function runDocumentExtraction(house, files) {
  const fileHash = await hashFiles(files);
  const dup = await findDuplicateImport(house.id, fileHash);
  if (dup) {
    const choice = await askDuplicateImportChoice(dup);
    if (!choice) return false;
    state.documentImportDuplicateAction = choice === 'replace' ? 'replace' : 'add';
    state.documentImportReplaceDueIds = dup.committed_due_ids || [];
  } else {
    state.documentImportDuplicateAction = null;
    state.documentImportReplaceDueIds = [];
  }

  const meta = {
    sourceLabel: sourceLabelFromFiles(files),
    fileHash,
    fiscalStartMonth: house.fiscalStartMonth ?? 6,
    mimeTypes: files.map(f => f.type).join(',')
  };
  const parties = house.importParties || [];

  let extraction = await extractFromDocument(house.id, files, parties);
  let preview = initPreviewFromExtraction(extraction, meta);
  preview = applyAutoFilterToPreview(preview, house);

  if (preview.autoFilterFailed && hasConfiguredParties(house) && files.length > 0) {
    let merged = emptyExtraction('Estrazione mirata per pagina');
    for (let i = 0; i < files.length; i++) {
      state.documentImportProgressText = `Estrazione mirata pagina ${i + 1}/${files.length}…`;
      render();
      try {
        const part = await extractFromDocument(house.id, [files[i]], parties);
        merged = mergeExtractions(merged, part);
      } catch {
        /* pagina non leggibile */
      }
    }
    if (merged.sections?.some(s => s.rows?.length)) {
      extraction = merged;
      preview = initPreviewFromExtraction(extraction, meta);
      preview = applyAutoFilterToPreview(preview, house);
      if (preview.extraction) {
        preview.extraction.extractionNotes = [
          preview.extraction.extractionNotes,
          'Estrazione per pagina (nominativi configurati).'
        ].filter(Boolean).join(' ');
      }
    }
  }

  ensureResoconto(preview, house);
  state.documentImportPreview = preview;
  navigate('importa', 'import-doc');
  return true;
}

async function handleDocumentFiles(fileList) {
  const house = ensureHouse();
  if (!house) return;
  if (!Number.isFinite(Number(house.id))) {
    toastError('Salva prima la casa su Supabase.');
    return;
  }
  const files = [...fileList];
  if (!files.length) return;
  state.documentImportLastFiles = files;
  state.documentImportBusy = true;
  state.documentImportProgressText = null;
  render();
  try {
    await runDocumentExtraction(house, files);
  } catch (err) {
    toastError(err.message || 'Errore estrazione documento');
  } finally {
    state.documentImportBusy = false;
    state.documentImportProgressText = null;
    if (els.documentImportFile) els.documentImportFile.value = '';
    render();
  }
}

async function retryDocumentImport() {
  const files = state.documentImportLastFiles;
  if (!files?.length) return;
  await handleDocumentFiles(files);
}

async function confirmDocumentImport() {
  const house = ensureHouse();
  const preview = state.documentImportPreview;
  if (!house || !preview) return;

  applyResocontoToPreview(preview);

  const warnings = validateCommitPreview(preview);
  const blocking = warnings.filter(w =>
    w.includes('Seleziona') ||
    w.includes('Indica') ||
    w.includes('Conferma almeno') ||
    w.includes('Conferma il resoconto') ||
    w.includes('nessuna riga')
  );
  if (blocking.length) {
    toastError(blocking.join(' '));
    return;
  }
  const lowFields = collectLowConfidenceIssues(preview);
  if (lowFields.length && !preview.lowConfidenceAck?.all) {
    if (!await confirmDialog(
      `Estrazione incerta su: ${lowFields.join(', ')}.\n\nConfermi comunque i valori in anteprima?`,
      { title: 'Estrazione incerta' }
    )) return;
    preview.lowConfidenceAck.all = true;
  }
  if (warnings.length && !await confirmDialog(`${warnings.join('\n')}\n\nProcedere con l'import?`, { title: 'Avvisi import' })) return;

  const summary = buildDuesFromPreview(preview, preview.sourceLabel, house);
  if (!summary.length) {
    toastError('Nessun dato da importare. Attiva almeno una scheda Preventivo o Consuntivo.');
    return;
  }

  const fiscalLabel = (preview.resoconto?.fiscalYearLabel || preview.extraction.fiscalYearLabel).trim();
  preview.extraction.fiscalYearLabel = fiscalLabel;
  const kinds = summary.map(d => d.dueKind);
  const existing = findExistingDuesForImport(house, fiscalLabel, kinds);
  if (existing.length && state.documentImportDuplicateAction !== 'replace') {
    const labels = existing.map(d => `${d.dueKind} ${fmt(d.amount)}`).join(', ');
    if (!await confirmDialog(
      `Per l'esercizio ${fiscalLabel} esistono già dovuti: ${labels}.\n\nAggiungere comunque quelli dell'import?`,
      { title: 'Dovuti esistenti' }
    )) return;
  }

  const { period, isNew } = await ensureFiscalPeriodByLabel(house, fiscalLabel);
  const r = preview.resoconto;
  if (r?.applyCarryover && !r.carryFromPeriodId) {
    const prev = getPreviousPeriod(house, period.id);
    if (prev) r.carryFromPeriodId = prev.id;
  }
  if (!isNew && !state.documentImportDuplicateAction) {
    if (!await confirmDialog(
      `L'esercizio ${period.label} esiste già. Associare i nuovi dovuti a questo esercizio?`,
      { title: 'Esercizio esistente' }
    )) return;
  }

  const recap = summary.map(d => `${d.dueKind}: ${fmt(d.amount)} (${d.description.slice(0, 60)}…)`).join('\n');
  if (!await confirmDialog(`Riepilogo import:\nEsercizio ${fiscalLabel}\n\n${recap}\n\nConfermi?`, { title: 'Conferma import' })) return;

  const oldIds =
    state.documentImportDuplicateAction === 'replace' ? [...(state.documentImportReplaceDueIds || [])] : [];

  try {
    const savedIds = [];
    for (const due of summary) {
      await saveDueToSupabase(house, due);
      if (due.id) savedIds.push(due.id);
    }
    if (oldIds.length) await deleteDuesByIds(house, oldIds);
    await recordDocumentImport(house, {
      sourceLabel: preview.sourceLabel,
      fileHash: preview.fileHash,
      mimeTypes: preview.mimeTypes
    }, preview.extraction, savedIds);
    state.documentImportPreview = null;
    state.documentImportDuplicateAction = null;
    state.documentImportReplaceDueIds = [];
    await loadFromSupabase();
    const houseAfter = activeHouse();
    state.postImportPaymentHint = houseAfter ? computeNextPaymentGuide(houseAfter) : true;
    render();
    showToast('Import documento completato.');
    navigate('registra', 'versamenti');
  } catch (err) {
    toastError(err.message || 'Errore salvataggio import');
  }
}

function cancelDocumentImport() {
  state.documentImportPreview = null;
  state.documentImportBusy = false;
  render();
}

function goManualDueEntry() {
  cancelDocumentImport();
  navigate('registra', 'dovuti');
  if (window.matchMedia('(max-width: 860px)').matches) openFormSheet('dueFormPane');
  else els.dueForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleBankFile(file) {
  const house = ensureHouse();
  if (!house) return;
  if (!Number.isFinite(Number(house.id))) {
    toastError('Salva prima la casa su Supabase.');
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
    await saveBankImport(house, batchId, state.bankImportPreview);
    await saveUnlinkedBankMovements(house, batchId, state.bankImportPreview);
    state.bankImportPreview = [];
    await loadFromSupabase();
    render();
    showToast('Import banca completato.');
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
      if (state.supabase && state.user) {
        if (!await confirmDialog('Importare il backup su Supabase? Le case verranno aggiunte al tuo account.', { title: 'Import backup' })) return;
        await syncBackupToSupabase(parsed);
        render();
        showToast('Backup importato su Supabase.');
        return;
      }
      toastError('Accedi per importare il backup su Supabase.');
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
  closeAllFormSheets();
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
    if (btn.dataset.situazionePeriod) {
      state.pendingSituazionePeriodId = btn.dataset.situazionePeriod;
    }
    if (btn.dataset.houseMode === 'new') startNewHouseForm();
    else {
      navigate(btn.dataset.navTarget, btn.dataset.navSubview || null);
      if (btn.dataset.navSubview === 'dovuti' && window.matchMedia('(max-width: 860px)').matches) {
        openFormSheet('dueFormPane');
      }
      if (btn.dataset.navSubview === 'versamenti' && window.matchMedia('(max-width: 860px)').matches) {
        openFormSheet('paymentFormPane');
      }
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
els.demoBtn?.addEventListener('click', () => toastError('Demo locale disabilitata con fiscalità Supabase.'));
els.openHouseDrawerBtn?.addEventListener('click', openHouseDrawer);
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
});
els.openDueFormSheet?.addEventListener('click', () => openFormSheet('dueFormPane'));
els.closeDueFormSheet?.addEventListener('click', () => closeFormSheet('dueFormPane'));
els.dueFormPaneBackdrop?.addEventListener('click', () => closeFormSheet('dueFormPane'));
els.openPaymentFormSheet?.addEventListener('click', () => openFormSheet('paymentFormPane'));
els.closePaymentFormSheet?.addEventListener('click', () => closeFormSheet('paymentFormPane'));
els.paymentFormPaneBackdrop?.addEventListener('click', () => closeFormSheet('paymentFormPane'));
els.openPriorBalanceFormSheet?.addEventListener('click', () => {
  resetPriorBalanceForm(activeHouse());
  openFormSheet('priorBalanceFormPane');
});
els.closePriorBalanceFormSheet?.addEventListener('click', () => closeFormSheet('priorBalanceFormPane'));
els.priorBalanceFormPaneBackdrop?.addEventListener('click', () => closeFormSheet('priorBalanceFormPane'));
els.priorBalancePeriod?.addEventListener('change', () => {
  const house = activeHouse();
  if (house) syncPriorBalanceSourceSelect(house);
});
els.priorBalanceForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const house = ensureHouse();
  if (!house) return;
  try {
    await ensureHousePersisted(house);
    const fd = new FormData(els.priorBalanceForm);
    const editId = String(els.priorBalanceEditId?.value || fd.get('editId') || '').trim();
    const periodId = String(els.priorBalancePeriod?.value || fd.get('fiscalPeriodId') || '').trim();
    const sourcePeriodId = String(els.priorBalanceSourcePeriod?.value || fd.get('sourcePeriodId') || '').trim() || null;
    if (!periodId) {
      toastError('Seleziona l\'esercizio fiscale.');
      return;
    }
    const amount = Number(els.priorBalanceAmount?.value ?? fd.get('amount'));
    if (!Number.isFinite(amount)) {
      toastError('Inserisci un importo valido.');
      return;
    }
    const priorBalance = {
      id: editId || uid('prior'),
      fiscalPeriodId: periodId,
      sourcePeriodId,
      amount,
      description: String(els.priorBalanceDescription?.value ?? fd.get('description') ?? '').trim()
    };
    if (!editId) {
      const existingBalance = (house.priorBalances || []).find(b => String(b.fiscalPeriodId) === String(periodId));
      if (existingBalance) {
        const overwrite = await confirmDialog(
          'Esiste già un saldo precedente per questo esercizio. Salvando, il valore attuale verrà sovrascritto.',
          { title: 'Sovrascrivere il saldo esistente?', confirmLabel: 'Sovrascrivi', danger: true }
        );
        if (!overwrite) return;
      }
    }
    const duesBefore = house.dues?.length || 0;
    if (state.supabase && state.user) {
      await savePriorBalanceToSupabase(house, priorBalance);
      resetPriorBalanceForm(house);
      if (Number.isFinite(Number(house.id))) {
        await reloadHouseFromSupabase(house.id);
        const houseAfter = activeHouse();
        if (duesBefore > 0 && (houseAfter?.dues?.length || 0) === 0) {
          toastError(`Attenzione: i dovuti non risultano più visibili per questo immobile. Verifica di aver selezionato "${house.name}" dal menu immobili.`);
        }
      }
    } else if (editId) {
      const existing = (house.priorBalances || []).find(b => String(b.id) === String(editId));
      if (existing) Object.assign(existing, priorBalance);
    } else {
      if (!house.priorBalances) house.priorBalances = [];
      const dup = house.priorBalances.find(b => b.fiscalPeriodId === periodId);
      if (dup) Object.assign(dup, priorBalance, { id: dup.id });
      else house.priorBalances.push({ ...priorBalance, id: uid('prior') });
    }
    render();
    closeFormSheet('priorBalanceFormPane');
    showToast(editId ? 'Saldo precedente aggiornato.' : 'Saldo precedente salvato.');
  } catch (err) {
    toastError(err.message);
  }
});
els.priorBalanceFormCancel?.addEventListener('click', () => {
  resetPriorBalanceForm(activeHouse());
  closeFormSheet('priorBalanceFormPane');
  render();
});
els.paymentInstallment?.addEventListener('change', () => {
  const house = activeHouse();
  if (house) applyPaymentSmartAmount(house);
});
document.addEventListener('click', e => {
  if (e.target.id === 'paymentGuideApply') applyPaymentGuideToForm();
  if (e.target.id === 'paymentGuideCopyCausale') {
    const code = document.getElementById('paymentGuideCausale')?.textContent;
    if (code) navigator.clipboard?.writeText(code).then(() => showToast('Causale copiata.')).catch(() => toastError('Copia non riuscita.'));
  }
  if (e.target.id === 'postImportRegisterPay') {
    navigate('registra', 'versamenti');
    applyPaymentGuideToForm();
    openFormSheet('paymentFormPane');
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
  if (onboardingStep === 1 && !state.data.houses.length) {
    const name = document.getElementById('onbHouseName')?.value?.trim();
    if (!name) { toastError('Inserisci un nome per l’immobile.'); return; }
    const month = Number(document.getElementById('onbFiscalMonth')?.value || 6);
    const house = await createAndSaveHouse({ name, fiscalStartMonth: month });
    if (!house) return;
    showToast('Immobile creato.');
  }
  if (onboardingStep >= 2) {
    finishOnboarding();
    navigate('importa', 'import-doc');
    return;
  }
  onboardingStep += 1;
  showOnboardingStep();
});

els.periodFilter.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.paymentFilterYear?.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.paymentFilterMonth?.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.paymentPeriod?.addEventListener('change', () => {
  const house = activeHouse();
  if (!house) return;
  syncPaymentInstallmentSelect(house);
});
els.situazionePeriod?.addEventListener('change', () => { const h = activeHouse(); if (h) render(); });
els.situazionePdfBtn?.addEventListener('click', async () => {
  const house = ensureHouse();
  if (!house || !els.situazionePeriod?.value) return;
  try {
    await exportSituazionePdf(house, els.situazionePeriod.value, els.situazionePdfKind?.value);
  } catch (err) {
    toastError(err.message || 'Errore export PDF');
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
  house.importParties = collectImportPartiesFromDom(els.houseImportParties);
  const partyWarnings = validateParties(house.importParties);
  if (partyWarnings.length) {
    toastError(partyWarnings[0]);
    return;
  }
  try {
    if (state.supabase && state.user) await saveHouseToSupabase(house);
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
    if (state.supabase && state.user && Number.isFinite(Number(house.id))) await deleteHouseRemote(house.id);
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

els.dueForm.addEventListener('submit', async e => {
  e.preventDefault();
  const house = ensureHouse();
  if (!house) return;
  try {
    await ensureHousePersisted(house);
    const fd = new FormData(els.dueForm);
    const editId = String(fd.get('editId') || els.dueEditId?.value || '').trim();
    const due = createLocalDue(fd);
    if (due.splitMode === 'custom') {
      const cleaned = Array.isArray(due.splitCustom)
        ? [...new Set(due.splitCustom)].filter(n => Number.isInteger(n) && n >= 0 && n < 12)
        : [];
      if (!cleaned.length) {
        toastError('Inserisci almeno un mese valido (0-11) per la ripartizione personalizzata.');
        return;
      }
      due.splitCustom = cleaned;
    }
    const periodSel = els.duePeriod?.value;
    if (periodSel && periodSel !== '__new__') {
      due.fiscalPeriodId = periodSel;
      due.fiscalPeriodLabel = periodLabel(house, periodSel);
    } else {
      due.fiscalPeriodLabel = String(fd.get('fiscalPeriodLabel') || els.duePeriodNew?.value || '').trim();
      if (!due.fiscalPeriodLabel) {
        toastError('Seleziona o inserisci l\'esercizio fiscale.');
        return;
      }
    }
    if (editId) {
      due.id = editId;
      const existingDue = house.dues.find(d => d.id === editId);
      if (existingDue?.splitAmounts) due.splitAmounts = existingDue.splitAmounts;
    }
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
    closeFormSheet('dueFormPane');
    showToast(editId ? 'Dovuto aggiornato.' : 'Dovuto salvato.');
  } catch (err) {
    toastError(err.message);
  }
});

els.dueFormCancel?.addEventListener('click', () => {
  resetDueForm();
  closeFormSheet('dueFormPane');
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
      toastError('Seleziona la rata da associare al versamento.');
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
    closeFormSheet('paymentFormPane');
    showToast(editId ? 'Versamento aggiornato.' : 'Versamento registrato.');
  } catch (err) {
    toastError(err.message);
  }
});

els.paymentFormCancel?.addEventListener('click', () => {
  const house = activeHouse();
  resetPaymentForm(house);
  closeFormSheet('paymentFormPane');
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
  if (!await confirmDialog(msg, { title: 'Riporto consuntivo' })) return;
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
    showToast('Riporto consuntivo registrato.');
  } catch (err) {
    toastError(err.message);
  }
}

els.dueSuggestCarryoverBtn?.addEventListener('click', async () => {
  const house = ensureHouse();
  if (!house) return;
  const sorted = [...house.fiscalPeriods].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  const target = sorted.find(p => suggestCarryover(house, p.id));
  if (!target) { toastError('Nessun riporto suggerito al momento: serve un consuntivo con saldo non ancora riportato sull\'esercizio successivo.'); return; }
  await offerCarryoverDue(house, target.id);
});

els.main?.addEventListener('click', handleRecordAction);

els.documentImportFile?.addEventListener('change', e => handleDocumentFiles(e.target.files));
els.documentImportConfirm?.addEventListener('click', confirmDocumentImport);
els.documentImportCancel?.addEventListener('click', cancelDocumentImport);
els.documentImportRetry?.addEventListener('click', retryDocumentImport);
els.documentImportManual?.addEventListener('click', goManualDueEntry);

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
    createSupabaseClient(createClient);
    if (await auth.handleAuthCallbackError()) return;
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
