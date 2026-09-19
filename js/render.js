import { partyDisplayName } from './house-import-parties.js';
import { resolveView, viewHeading, viewMeta } from './config.js';
import {
  computeConguaglio,
  defaultFiscalLabel,
  findPeriodByDate,
  getNextPeriod,
  periodLabel,
  periodSummary,
  sumOrdinarioDue,
  sumPaid,
  sumStraordinariDue,
  totals
} from './fiscal.js';
import {
  findInstallment,
  listInstallmentsForDue,
  ordinarioDueForPeriod,
  inferInstallmentKey,
  installmentSummaryForPeriod,
  listInstallmentsForPeriod,
  listAllInstallments,
  paymentsSummaryForList,
  straordinariDuesForPeriod
} from './installments.js';
import {
  CADENCES,
  generateRows,
  isOutsidePeriod,
  monthEndIso,
  monthsOfYear,
  planRows,
  planStatus,
  planTargets,
  planTotals,
  round2,
  rowTotal,
  splitEqually
} from './rate-plan.js';
import { getPriorBalanceForPeriod, sumPaidForPriorBalance } from './situazione-report.js';
import { resolveFocusPeriod } from './compliance-status.js';
import { emptyListHtml } from './mobile-cards.js';
import { computeNextPaymentGuide, formatPaymentGuideSummary } from './payment-guide.js';
import { activeHouse, state } from './state.js';
import { isStraordinarioDue, VOCI, VOCI_RATA, voceBadge } from './voci.js';
import { fmt, today } from './utils.js';

function rowActions(kind, id, extraHtml = '') {
  const safeId = String(id ?? '').replace(/"/g, '&quot;');
  return `<div class="row-actions">${extraHtml}<button type="button" class="btn btn-secondary" data-record-action="edit" data-record-kind="${kind}" data-id="${safeId}">Modifica</button><button type="button" class="btn btn-secondary" data-record-action="delete" data-record-kind="${kind}" data-id="${safeId}">Elimina</button></div>`;
}

export function createRenderer(els) {
  function defaultSubview(view) {
    return viewMeta[view]?.defaultSubview ?? null;
  }

  function syncNavActive(view, subview) {
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
    // Barra del titolo e schede valgono solo per alcune sotto-viste: le pagine
    // «Registra», «Importa» e i documenti hanno la loro intestazione con il ritorno.
    viewPanel?.querySelectorAll('[data-show-subview]').forEach(el => {
      const allowed = String(el.dataset.showSubview || '').split(/\s+/).filter(Boolean);
      el.classList.toggle('hidden', !allowed.includes(subview));
    });
  }

  /**
   * Titolo e sottotitolo della pagina. Sul desktop stanno dentro la pagina, in
   * cima e accanto alle sue azioni; su telefono nell'intestazione dell'app. Il
   * testo è uno solo — viewHeading — e viene scritto in entrambi i posti.
   */
  function updateHeader(view, subview) {
    const [title, subtitle] = viewHeading(view, subview);
    els.viewTitle.textContent = title;
    els.viewSubtitle.textContent = subtitle;
    const panel = els.viewPanels.find(p => p.dataset.viewPanel === view);
    panel?.querySelectorAll('[data-page-title]').forEach(el => { el.textContent = title; });
    panel?.querySelectorAll('[data-page-sub]').forEach(el => { el.textContent = subtitle; });
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

    syncNavActive(view, subview);
    els.viewPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view));
    syncSubviewUI(view, subview);
    updateHeader(view, subview);
    closeOverlays();
    els.main?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHouseCurrentName() {
    const current = state.data.houses.find(h => h.id === state.selectedHouseId);
    const isNew = state.houseFormMode === 'new';
    const name = isNew ? 'Nuova casa…' : (current ? current.name : 'Nessuna casa');
    const location = isNew ? '' : (current?.location || '');
    if (els.houseCurrentName) els.houseCurrentName.textContent = name;
    document.querySelectorAll('[data-house-name]').forEach(el => { el.textContent = name; });
    document.querySelectorAll('[data-house-location]').forEach(el => { el.textContent = location; });
  }

  function renderHousesManageList() {
    if (!els.housesManageList) return;
    if (!state.data.houses.length) {
      els.housesManageList.innerHTML = '<div class="empty">Nessun immobile registrato. Usa + Nuova casa per iniziare.</div>';
      return;
    }
    els.housesManageList.innerHTML = '';
    for (const h of state.data.houses) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `house-btn ${h.id === state.selectedHouseId && state.houseFormMode === 'edit' ? 'active' : ''}`;
      btn.dataset.houseId = h.id;
      btn.innerHTML = `<strong>${h.name}</strong>`;
      els.housesManageList.appendChild(btn);
    }
  }

  function syncHouseFormChrome(mode) {
    const isNew = mode === 'new';
    if (els.houseFormTitle) els.houseFormTitle.textContent = isNew ? 'Nuova casa' : 'Modifica immobile';
    if (els.houseFormSubtitle) {
      els.houseFormSubtitle.textContent = isNew
        ? 'Compila i dati e i nominativi per l\'import documenti.'
        : 'Dati, esercizio fiscale e nominativi per l\'import documenti.';
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
      `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.label} · ${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}</option>`
    ).join('');
  }

  function syncPaymentPeriodSelect(house) {
    if (!els.paymentDate || !els.paymentPeriod) return;
    const date = els.paymentDate.value || today;
    const period = findPeriodByDate(house, date);
    let existingId = period.id || house.fiscalPeriods.find(p => p.label === period.label)?.id || '';

    // L'anno della data può non avere ancora niente da pagare (tipico a inizio anno
    // nuovo, quando il preventivo non è ancora stato approvato): in quel caso si parte
    // dall'anno che ha ancora rate aperte, invece che da un modulo senza scelte.
    const openHere = existingId
      && (pendingInstallments(house, existingId).length || getPriorBalanceForPeriod(house, existingId));
    if (!openHere) {
      const withOpen = [...house.fiscalPeriods]
        .sort((a, b) => String(b.startDate || b.label).localeCompare(String(a.startDate || a.label)))
        .find(p => pendingInstallments(house, p.id).length);
      if (withOpen) existingId = withOpen.id;
    }

    let html = periodOptions(house, existingId);
    if (!existingId && period.label) {
      html = `<option value="" selected>${period.label} (creato al salvataggio)</option>` + html;
    } else if (period.label && !house.fiscalPeriods.some(p => p.label === period.label)) {
      html += `<option value="">${period.label} (creato al salvataggio)</option>`;
    }
    if (!html) html = '<option value="">— registra prima il preventivo dell’anno —</option>';
    els.paymentPeriod.innerHTML = html;
    if (existingId) els.paymentPeriod.value = existingId;
    syncPaymentInstallmentSelect(house);
    syncPaymentPriorBalanceInfo(house);
  }

  function syncPaymentInstallmentSelect(house, preferredKey = null) {
    if (!els.paymentInstallment || !els.paymentPeriod) return;
    const periodId = els.paymentPeriod.value;
    const slots = periodId ? listInstallmentsForPeriod(house, periodId) : listAllInstallments(house);
    if (!slots.length) {
      els.paymentInstallment.innerHTML = '<option value="">— registra prima il preventivo dell’anno —</option>';
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

  function syncPaymentPriorBalanceInfo(house) {
    if (!els.paymentPriorBalanceInfo || !els.paymentPriorBalanceId) return;
    const periodId = els.paymentPeriod?.value;
    const balance = periodId ? getPriorBalanceForPeriod(house, periodId) : null;
    const isDebt = balance && Number(balance.amount) > 0.005;
    if (!isDebt) {
      els.paymentPriorBalanceId.value = '';
      els.paymentPriorBalanceInfo.textContent = 'Nessun saldo iniziale a debito per quest’anno.';
      return;
    }
    const paid = sumPaidForPriorBalance(house, balance.id);
    const residuo = Math.round((Number(balance.amount) - paid) * 100) / 100;
    els.paymentPriorBalanceId.value = balance.id;
    els.paymentPriorBalanceInfo.textContent = `Saldo anno precedente ${periodLabel(house, periodId)} — residuo ${fmt(residuo)}`;
    const isPriorMode = els.paymentTarget?.value === 'prior';
    if (isPriorMode && els.paymentAmount && !els.paymentEditId?.value && residuo > 0.01) {
      els.paymentAmount.value = String(residuo);
    }
  }

  function renderPaymentFilterOptions(house) {
    if (!els.paymentFilterPeriod) return;
    const cur = els.paymentFilterPeriod.value;
    const sorted = [...house.fiscalPeriods].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    els.paymentFilterPeriod.innerHTML = '<option value="">Tutti</option>' + sorted.map(p =>
      `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${p.label}</option>`
    ).join('');
  }

  function getFilteredPayments(house) {
    const periodId = els.paymentFilterPeriod?.value || '';
    const sorted = [...house.payments].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return periodId ? sorted.filter(p => String(p.fiscalPeriodId) === String(periodId)) : sorted;
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

  /**
   * Carica nell'editor le rate del dovuto in modifica (o quelle generate dal totale).
   * Il nome resta quello storico perché è il punto in cui main.js entra.
   */
  function syncDuePeriodSelect(house, preferredId = null) {
    if (!els.duePeriod) return;
    const suggested = defaultFiscalLabel(house);
    // Di solito il preventivo che si sta scrivendo è quello dell'anno che l'app sta
    // già mostrando: proporre «nuovo anno» a chi ne ha già uno aperto è un invito a
    // sbagliare. L'anno nuovo resta la prima voce dell'elenco.
    const sel = preferredId || els.duePeriod.value || String(resolveFocusPeriod(house)?.id || '');
    let html = periodOptions(house, sel);
    if (!house.fiscalPeriods.length) {
      html = `<option value="__new__" selected>Nuovo anno condominiale…</option>`;
      els.duePeriodNewWrap?.classList.remove('hidden');
    } else {
      html = `<option value="__new__">+ Nuovo anno condominiale…</option>` + html;
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
    els.duePeriodNewWrap?.classList.toggle('hidden', els.duePeriod.value !== '__new__');
    // Il nome dell'anno nuovo arriva già scritto: è quello che l'app propone, e le
    // scadenze delle rate si calcolano da lì.
    if (els.duePeriodNew && !els.duePeriodNew.value.trim()) els.duePeriodNew.value = suggested;
    if (els.duePeriodHint) {
      if (!house.fiscalPeriods.length || els.duePeriod.value === '__new__') {
        els.duePeriodHint.textContent = `Scrivilo così: ${suggested}. L’anno inizia a ${MONTH_SHORT[(house.fiscalStartMonth || 6) - 1]}.`;
      } else {
        els.duePeriodHint.textContent = '';
      }
    }
  }

  function renderPeriodSelects(house) {
    syncDuePeriodSelect(house);
    syncConsPeriodSelect(house);
    if (els.paymentDate) els.paymentDate.value ||= today;
    syncPaymentPeriodSelect(house);
  }

  /** L'anno del consuntivo: si propone il più recente che ne è ancora senza. */
  function syncConsPeriodSelect(house) {
    if (!els.consPeriod) return;
    const summary = periodSummary(house);
    if (!summary.length) {
      els.consPeriod.innerHTML = '<option value="">— nessun anno registrato —</option>';
      return;
    }
    const current = els.consPeriod.value;
    const suggested = summary.find(p => !(Number(p.consuntivo) > 0.005)) || summary[0];
    const selected = current && summary.some(p => String(p.id) === String(current)) ? current : String(suggested.id);
    els.consPeriod.innerHTML = summary.map(p =>
      `<option value="${p.id}"${String(p.id) === String(selected) ? ' selected' : ''}>${p.label}${Number(p.consuntivo) > 0.005 ? ' · consuntivo già registrato' : ''}</option>`).join('');
    els.consPeriod.value = selected;
    if (els.consPeriodHint) {
      const row = summary.find(p => String(p.id) === String(selected));
      els.consPeriodHint.textContent = row && Number(row.consuntivo) > 0.005
        ? 'Questo anno ha già un consuntivo: salvando lo sostituisci.'
        : 'Il consuntivo si registra quando l’amministratore lo pubblica.';
    }
  }

  function renderHouseList() {
    renderHouseCurrentName();
    renderHousesManageList();
  }

  function activePeriodFilterId() {
    const v = els.periodFilter?.value;
    return v && v !== 'all' ? v : null;
  }

  const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  const MONTH_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  function fmtDate(iso) {
    const parts = String(iso || '').slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || !parts[0]) return '—';
    return DATE_FMT.format(new Date(parts[0], parts[1] - 1, parts[2]));
  }

  function daysBetween(fromIso, toIso) {
    const a = new Date(`${String(fromIso).slice(0, 10)}T00:00:00`);
    const b = new Date(`${String(toIso).slice(0, 10)}T00:00:00`);
    return Math.round((b - a) / 86400000);
  }

  function monthShortFromIso(iso) {
    const m = Number(String(iso || '').slice(5, 7));
    return MONTH_SHORT[m - 1] || '—';
  }

  function fmtShort(value) {
    const n = Math.round(Number(value || 0));
    return `€ ${n.toLocaleString('it-IT')}`;
  }

  /** Rate non ancora coperte, ordinate per scadenza. */
  function pendingInstallments(house, periodId) {
    if (!periodId) return [];
    const { slots } = installmentSummaryForPeriod(house, periodId);
    return slots
      .map(slot => ({ slot, gap: Math.round((slot.amountDue - slot.paid) * 100) / 100, dueBy: slot.periodEnd }))
      .filter(row => row.gap > 0.01)
      .sort((a, b) => String(a.dueBy).localeCompare(String(b.dueBy)));
  }

  const MONTH_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  /** «Rata 4 · settembre 2025»: come la chiama chi paga, non come la salva il database. */
  function installmentTitle(slot) {
    if (!slot) return 'Rata';
    const month = Number(String(slot.periodStart || '').slice(5, 7));
    const year = String(slot.periodStart || '').slice(0, 4);
    const when = month ? ` · ${MONTH_LONG[month - 1]} ${year}` : '';
    return `Rata ${Number(slot.slotIndex ?? 0) + 1}${when}`;
  }

  function recommendedInstallment(house, periodId) {
    const pending = pendingInstallments(house, periodId);
    if (!pending.length) return null;
    return pending.find(r => r.dueBy < today) || pending[0];
  }

  function priorBalanceResidual(house, periodId) {
    const balance = periodId ? getPriorBalanceForPeriod(house, periodId) : null;
    if (!balance || Number(balance.amount) <= 0.005) return null;
    const paid = sumPaidForPriorBalance(house, balance.id);
    const residuo = Math.round((Number(balance.amount) - paid) * 100) / 100;
    return residuo > 0.01 ? { balance, residuo } : null;
  }

  function syncPaymentMethodPills() {
    if (!els.paymentMethodPills) return;
    const current = (els.paymentMethod?.value || '').trim();
    const known = [...els.paymentMethodPills.querySelectorAll('[data-method]')];
    const match = known.find(b => b.dataset.method && b.dataset.method === current);
    // «Altro» resta premuto anche a campo vuoto: è una scelta, non l'assenza di scelta.
    const other = !match && (els.paymentMethodPills.dataset.other === '1' || Boolean(current));
    known.forEach(b => {
      const on = b.dataset.method ? b === match : other;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('pill--on', on);
    });
    els.paymentMethod?.classList.toggle('hidden', !other);
  }


  // ══════════════════════════════════════════════════════════════════════════
  //  v3 · Le quattro voci: quanto c'è da pagare, per quale voce, entro quando
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Scadenza del conguaglio quando non è stato messo dentro le rate.
   *
   * Il conguaglio non ha una data sua nei dati: per convenzione si salda entro la
   * fine del quarto mese dell'anno condominiale — l'assemblea che approva il
   * consuntivo cade lì — ed è la stessa data che l'app mostra ovunque.
   */
  function conguaglioDueDate(house, periodId) {
    const period = house.fiscalPeriods.find(p => String(p.id) === String(periodId));
    if (!period?.startDate) return null;
    const [y, m] = period.startDate.split('-').map(Number);
    const d = new Date(y, m - 1 + 4, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Quanto del conguaglio dell'anno è stato messo dentro le rate. */
  function conguaglioInRate(house, periodId) {
    return round2(installmentSummaryForPeriod(house, periodId).slots
      .reduce((sum, slot) => sum + Number(slot.parts?.conguaglio || 0), 0));
  }

  /**
   * La chiave di un pagamento su uno straordinario non ancora messo nelle rate.
   * Senza i due punti non è una chiave rata (`dueId:slotIndex`): i conteggi delle
   * rate la ignorano, ma l'importo entra lo stesso nel pagato dell'anno.
   */
  function straordinarioKey(due) {
    return `straordinario#${due.id}`;
  }

  /** Il dovuto straordinario a cui punta una chiave di pagamento, se è una di quelle. */
  function straordinarioFromKey(house, key) {
    if (!key || !String(key).startsWith('straordinario#')) return null;
    const id = String(key).slice('straordinario#'.length);
    return house.dues.find(d => String(d.id) === id && isStraordinarioDue(d)) || null;
  }

  /**
   * Tutto quello che resta da pagare in un anno, voce per voce: le rate aperte e,
   * se non è finito dentro una rata, il conguaglio che arriva dall'anno prima.
   */
  function openItems(house, periodId) {
    if (!periodId) return [];
    const items = pendingInstallments(house, periodId).map(row => ({
      kind: 'rata',
      id: row.slot.key,
      key: row.slot.key,
      voice: dominantVoice(row.slot.parts),
      parts: row.slot.parts,
      title: installmentTitle(row.slot),
      sub: `Preventivo ${periodLabel(house, periodId)}`,
      amount: row.gap,
      dueBy: row.dueBy
    }));

    // Uno straordinario deliberato ma non ancora messo in nessuna rata resterebbe
    // invisibile: qui compare come voce a sé, così non si perde per strada. Quello
    // che è già dentro le rate lo si paga con le rate, e non va contato due volte.
    const straordinariInRate = round2(installmentSummaryForPeriod(house, periodId).slots
      .reduce((sum, slot) => sum + Number(slot.parts?.straordinari || 0), 0));
    let coperto = Math.max(0, straordinariInRate);
    for (const due of straordinariDuesForPeriod(house, periodId)) {
      const totale = round2(Number(due.amount || 0));
      const inRate = round2(Math.min(coperto, totale));
      coperto = round2(coperto - inRate);
      const key = straordinarioKey(due);
      const pagato = round2(house.payments
        .filter(p => p.installmentKey === key)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0));
      const residuo = round2(totale - inRate - pagato);
      if (residuo <= 0.01) continue;
      items.push({
        kind: 'straordinario',
        id: key,
        key,
        voice: 'straordinari',
        title: due.description || 'Spesa straordinaria',
        sub: 'Straordinario, non ancora in una rata',
        amount: residuo,
        dueBy: conguaglioDueDate(house, periodId)
      });
    }

    const prior = priorBalanceResidual(house, periodId);
    if (prior) {
      const inRate = conguaglioInRate(house, periodId);
      const separate = round2(prior.residuo - Math.max(0, inRate));
      if (separate > 0.01) {
        const source = prior.balance.sourcePeriodId ? periodLabel(house, prior.balance.sourcePeriodId) : null;
        items.push({
          kind: 'prior',
          id: `prior:${prior.balance.id}`,
          priorBalanceId: prior.balance.id,
          voice: 'conguaglio',
          title: `Conguaglio ${source || periodLabel(house, periodId)}`,
          sub: 'Differenza del consuntivo, a debito',
          amount: separate,
          dueBy: conguaglioDueDate(house, periodId)
        });
      }
    }
    return items.sort((a, b) => String(a.dueBy || '').localeCompare(String(b.dueBy || '')));
  }

  /** La voce che dà il segno a una rata: l'ordinario se c'è, altrimenti la più grossa. */
  function dominantVoice(parts) {
    if (!parts) return 'ordinario';
    if (Number(parts.ordinario || 0) > 0.005) return 'ordinario';
    if (Number(parts.conguaglio || 0) > 0.005) return 'conguaglio';
    if (Number(parts.straordinari || 0) > 0.005) return 'straordinari';
    return 'ordinario';
  }

  /** Le voci non nulle di una rata, come pastiglie «P 200 · S 200». */
  function partsChips(parts) {
    return VOCI_RATA
      .filter(voice => Math.abs(Number(parts?.[voice] || 0)) > 0.005)
      .map(voice => `<span class="voce-chip voce--${voice}">${VOCI[voice].badge} ${fmtShort(parts[voice]).replace('€ ', '')}</span>`)
      .join('');
  }

  /** Il gruppo in scadenza: quello che si paga entro la prima data utile. */
  function dueNow(house, periodId) {
    const items = openItems(house, periodId);
    if (!items.length) return null;
    const overdue = items.filter(i => i.dueBy && i.dueBy < today);
    if (overdue.length) {
      return { late: true, dueBy: overdue[overdue.length - 1].dueBy, items: overdue, total: round2(overdue.reduce((s, i) => s + i.amount, 0)) };
    }
    const firstDate = items[0].dueBy;
    const group = items.filter(i => i.dueBy === firstDate);
    return { late: false, dueBy: firstDate, items: group, total: round2(group.reduce((s, i) => s + i.amount, 0)) };
  }

  /** I numeri dell'anno, nell'ordine in cui il disegno li racconta. */
  function yearFigures(house, periodId) {
    if (!periodId) return null;
    const row = periodSummary(house).find(p => String(p.id) === String(periodId));
    const prior = getPriorBalanceForPeriod(house, periodId);
    const { slots } = installmentSummaryForPeriod(house, periodId);
    const paid = Number(row?.paid || 0);
    const ordinario = Number(row?.ordinario || 0);
    const straordinari = Number(row?.straordinari || 0);
    const conguaglioIn = round2(prior?.amount || 0);
    const consuntivo = Number(row?.consuntivo || 0);
    const dovuto = round2(ordinario + straordinari + conguaglioIn);
    return {
      periodId,
      label: periodLabel(house, periodId),
      row,
      slots,
      paidSlots: slots.filter(s => s.paid >= s.amountDue - 0.01).length,
      ordinario,
      straordinari,
      conguaglioIn,
      consuntivo,
      hasConsuntivo: consuntivo > 0.005,
      conguaglioOut: computeConguaglio(house, periodId),
      dovuto,
      pagato: paid,
      residuo: round2(Math.max(dovuto - paid, 0)),
      progress: dovuto > 0.005 ? Math.min(100, Math.max(0, (paid / dovuto) * 100)) : 0
    };
  }

  function voceRowHtml({ voice, title, sub, amount, size = 'md', muted = false, parts = null }) {
    // Una rata che porta più voci lo dice sotto il titolo, con le sue pastiglie:
    // il segno grande mostra la voce principale, le pastiglie come si compone.
    const mixed = parts && VOCI_RATA.filter(v => Math.abs(Number(parts[v] || 0)) > 0.005).length > 1;
    return `<div class="voce-row voce-row--${size}${muted ? ' voce-row--muted' : ''}">
      ${voceBadge(voice, size)}
      <span class="voce-row-main">
        <span class="voce-row-title">${title}</span>
        ${sub ? `<span class="voce-row-sub">${sub}</span>` : ''}
        ${mixed ? `<span class="voce-chips">${partsChips(parts)}</span>` : ''}
      </span>
      <span class="voce-row-amount">${amount}</span>
    </div>`;
  }

  function deadlineBadge(group) {
    if (!group) return '';
    if (group.late) return '<span class="badge error">In ritardo</span>';
    const days = daysBetween(today, group.dueBy);
    const text = days <= 0 ? 'Scade oggi' : `Fra ${days} giorn${days === 1 ? 'o' : 'i'}`;
    return `<span class="badge neutral"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>${text}</span>`;
  }

  // ─────────────────────────────── Panoramica ───────────────────────────────

  function renderPanoramicaDue(house, periodId) {
    if (!els.panoramicaDue) return;
    const group = dueNow(house, periodId);
    if (!group) {
      const hasPlan = periodId ? listInstallmentsForPeriod(house, periodId).length > 0 : false;
      els.panoramicaDue.innerHTML = `
        <div class="panel-head"><div><h2>Da pagare</h2></div></div>
        <p class="muted">${hasPlan
          ? 'Non hai scadenze aperte: tutte le rate di quest’anno risultano pagate.'
          : 'Registra il preventivo dell’anno per vedere qui le rate e le loro scadenze.'}</p>
        <div class="form-actions" style="margin-top:var(--space-4);">
          <button class="btn ${hasPlan ? 'btn-secondary' : 'btn-primary'}" type="button"
            data-nav-target="${hasPlan ? 'pagamenti' : 'resoconti'}" data-nav-subview="${hasPlan ? 'registra' : 'preventivo'}">
            ${hasPlan ? 'Registra un pagamento' : 'Aggiungi il preventivo'}
          </button>
        </div>`;
      return;
    }
    els.panoramicaDue.innerHTML = `
      <div class="panel-head">
        <div><h2>${group.late ? 'In ritardo' : `Da pagare entro il ${fmtDate(group.dueBy)}`}</h2></div>
        ${deadlineBadge(group)}
      </div>
      <div class="big-amount">${fmt(group.total)}</div>
      <div class="voce-rows">
        ${group.items.map(i => voceRowHtml({
          voice: i.voice,
          title: i.title,
          sub: i.sub,
          amount: fmt(i.amount),
          parts: i.parts
        })).join('')}
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" type="button" data-nav-target="pagamenti" data-nav-subview="registra">Registra pagamento</button>
        <button class="btn btn-secondary" type="button" data-nav-target="pagamenti" data-nav-subview="importa">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9.5 9-6 9 6"/><path d="M5 10v8"/><path d="M9.7 10v8"/><path d="M14.3 10v8"/><path d="M19 10v8"/><path d="M3 21h18"/></svg>
          Importa estratto conto
        </button>
      </div>`;
  }

  function renderPanoramicaYear(house, periodId) {
    if (!els.panoramicaYear) return;
    const f = yearFigures(house, periodId);
    if (!f) {
      els.panoramicaYear.innerHTML = '';
      return;
    }
    const straordinariDues = straordinariDuesForPeriod(house, periodId);
    const straordinariNote = straordinariDues.length
      ? straordinariDues.map(d => d.description || 'Spesa straordinaria').join(' · ')
      : 'Nessuna spesa straordinaria';
    const priorSource = getPriorBalanceForPeriod(house, periodId);
    const congResidual = priorBalanceResidual(house, periodId);

    const rows = [
      voceRowHtml({
        voice: 'ordinario',
        title: `Ordinario ${f.label}`,
        sub: f.slots.length ? `Preventivo · ${f.paidSlots} rate su ${f.slots.length} pagate` : 'Preventivo dell’anno',
        amount: f.ordinario > 0.005 ? fmt(f.ordinario) : '—',
        size: 'sm'
      }),
      f.straordinari > 0.005 ? voceRowHtml({
        voice: 'straordinari',
        title: 'Straordinari',
        sub: straordinariNote,
        amount: fmt(f.straordinari),
        size: 'sm'
      }) : '',
      f.conguaglioIn !== 0 ? voceRowHtml({
        voice: 'conguaglio',
        title: `Conguaglio ${priorSource?.sourcePeriodId ? periodLabel(house, priorSource.sourcePeriodId) : ''}`.trim(),
        sub: congResidual ? 'Dall’anno prima · da pagare' : 'Dall’anno prima · saldato',
        amount: fmt(f.conguaglioIn),
        size: 'sm'
      }) : '',
      voceRowHtml({
        voice: 'consuntivo',
        title: `Consuntivo ${f.label}`,
        sub: f.hasConsuntivo
          ? (f.conguaglioOut ? `Conguaglio ${fmt(Math.abs(f.conguaglioOut.amount))} a ${f.conguaglioOut.direction}` : 'Registrato')
          : `Arriva dopo il ${fmtDate(f.row?.endDate)}`,
        amount: f.hasConsuntivo ? fmt(f.consuntivo) : '—',
        size: 'sm',
        muted: !f.hasConsuntivo
      })
    ].filter(Boolean).join('');

    els.panoramicaYear.innerHTML = `
      <div class="panel-head">
        <div><h2>Anno ${f.label}</h2></div>
        <button type="button" class="link-more" data-nav-target="resoconti" data-nav-subview="anno" data-situazione-period="${String(periodId).replace(/"/g, '&quot;')}">
          Resoconto
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
        </button>
      </div>
      <div class="stack" style="gap:.6rem;">
        <div class="progress-caption">
          <span>Pagato <strong class="big-inline">${fmt(f.pagato)}</strong></span>
          <span class="muted">di ${fmt(f.dovuto)}</span>
        </div>
        <div class="progress" role="img" aria-label="Pagato ${Math.round(f.progress)}% del dovuto">
          <div class="progress-bar" style="width:${f.progress.toFixed(1)}%"></div>
        </div>
      </div>
      <div class="voce-rows">${rows}</div>`;
  }

  function paymentVoiceMeta(house, payment) {
    if (payment.priorBalanceId) {
      return { voice: 'conguaglio', title: 'Conguaglio', sub: 'Differenza del consuntivo' };
    }
    const stra = straordinarioFromKey(house, payment.installmentKey);
    if (stra) {
      return { voice: 'straordinari', title: stra.description || 'Spesa straordinaria', sub: `Straordinario ${periodLabel(house, payment.fiscalPeriodId)}` };
    }
    const key = payment.installmentKey || inferInstallmentKey(house, payment);
    const slot = key ? findInstallment(house, key) : null;
    if (!slot) return { voice: 'ordinario', title: 'Pagamento', sub: periodLabel(house, payment.fiscalPeriodId) };
    return {
      voice: dominantVoice(slot.parts),
      title: installmentTitle(slot),
      sub: `Preventivo ${periodLabel(house, payment.fiscalPeriodId)}`,
      parts: slot.parts
    };
  }

  function renderPanoramicaPayments(house) {
    if (!els.panoramicaPayments) return;
    const rows = [...house.payments]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 3);
    els.panoramicaPayments.innerHTML = `
      <div class="panel-head">
        <div><h2>Ultimi pagamenti</h2></div>
        <button type="button" class="link-more" data-nav-target="pagamenti" data-nav-subview="pagati">
          Tutti i pagamenti
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
        </button>
      </div>
      ${rows.length ? `<div class="pay-list">${rows.map(p => {
        const meta = paymentVoiceMeta(house, p);
        return `<div class="pay-row">
          <span class="pay-date">${p.date ? fmtDate(p.date) : '—'}</span>
          <span class="pay-main">${voceBadge(meta.voice, 'sm')}<span>${meta.title} <span class="muted">· ${meta.sub}</span></span></span>
          <span class="pay-method">${p.method || '—'}</span>
          <span class="pay-amount">${fmt(p.amount)}</span>
        </div>`;
      }).join('')}</div>` : '<p class="muted">Nessun pagamento registrato per questa casa.</p>'}`;
  }

  // ─────────────────────────────── Pagamenti ────────────────────────────────

  function renderPagamentiDue(house, periodId) {
    if (!els.pagamentiDueCard) return;
    const group = dueNow(house, periodId);
    if (!group) {
      els.pagamentiDueCard.innerHTML = `
        <div class="panel-head"><div><h2>In scadenza</h2></div></div>
        <p class="muted">Niente da pagare adesso.</p>`;
      return;
    }
    els.pagamentiDueCard.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>${group.late ? 'In ritardo' : `Entro il ${fmtDate(group.dueBy)}`}</h2>
          <p class="subtle">${group.late ? 'Scadute e non pagate' : deadlineText(group)}</p>
        </div>
        <span class="panel-amount">${fmt(group.total)}</span>
      </div>
      <div class="voce-rows">
        ${group.items.map(i => voceRowHtml({ voice: i.voice, title: i.title, sub: i.sub, amount: fmt(i.amount), parts: i.parts })).join('')}
      </div>
      <button class="btn btn-primary" type="button" style="width:100%;" data-nav-target="pagamenti" data-nav-subview="registra">Registra pagamento · ${fmt(group.total)}</button>`;
  }

  function deadlineText(group) {
    const days = daysBetween(today, group.dueBy);
    return days <= 0 ? 'Scade oggi' : `Fra ${days} giorn${days === 1 ? 'o' : 'i'}`;
  }

  function renderPagamentiNext(house, periodId) {
    if (!els.pagamentiNextCard) return;
    const group = dueNow(house, periodId);
    const groupIds = new Set((group?.items || []).map(i => i.id));
    const rest = openItems(house, periodId).filter(i => !groupIds.has(i.id));
    if (!rest.length) {
      els.pagamentiNextCard.innerHTML = `
        <div class="panel-head"><div><h2>Prossime rate</h2></div></div>
        <p class="muted">Non ci sono altre rate aperte in quest’anno.</p>`;
      return;
    }
    const total = round2(rest.reduce((s, i) => s + i.amount, 0));
    const visible = state.pagamentiShowAllRate ? rest : rest.slice(0, 3);
    const hidden = rest.length - visible.length;
    els.pagamentiNextCard.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>Prossime rate</h2>
          <p class="subtle">${rest.length} ${rest.length === 1 ? 'voce' : 'voci'} · ${voicesSummary(rest)}</p>
        </div>
        <span class="panel-amount">${fmt(total)}</span>
      </div>
      <div class="next-rate-list">
        ${visible.map(i => `<div class="next-rate-row">
          <span class="next-rate-date">${i.dueBy ? fmtDate(i.dueBy) : '—'}</span>
          <span class="next-rate-main">
            <span class="next-rate-title">${i.title}</span>
            <span class="voce-chips">${i.parts ? partsChips(i.parts) : `<span class="voce-chip voce--${i.voice}">${VOCI[i.voice].badge} ${fmtShort(i.amount).replace('€ ', '')}</span>`}</span>
          </span>
          <span class="next-rate-amount">${fmt(i.amount)}</span>
        </div>`).join('')}
      </div>
      ${hidden > 0 || state.pagamentiShowAllRate ? `<button class="btn btn-secondary" type="button" id="pagamentiToggleRate" style="width:100%;">
        ${state.pagamentiShowAllRate ? 'Mostra meno' : `Mostra le altre ${hidden} rate`}
      </button>` : ''}`;
  }

  function voicesSummary(items) {
    const totals = { ordinario: 0, conguaglio: 0, straordinari: 0 };
    for (const i of items) {
      if (i.parts) for (const v of VOCI_RATA) totals[v] += Number(i.parts[v] || 0);
      else totals[i.voice] = (totals[i.voice] || 0) + i.amount;
    }
    return VOCI_RATA.filter(v => totals[v] > 0.005).map(v => VOCI[v].label.toLowerCase()).join(' e ') || 'da pagare';
  }

  function renderPagamentiCounts(house, periodId) {
    if (els.countDaPagare) els.countDaPagare.textContent = String(openItems(house, periodId).length);
    if (els.countPagati) els.countPagati.textContent = String(house.payments.length);
  }

  // ───────────────────────── Registra un pagamento ──────────────────────────

  /** Le voci selezionabili: quelle aperte, con in cima il gruppo in scadenza. */
  function paymentOptionItems(house, periodId) {
    const items = openItems(house, periodId);
    const group = dueNow(house, periodId);
    const groupIds = new Set((group?.items || []).map(i => i.id));
    const first = items.filter(i => groupIds.has(i.id));
    const others = items.filter(i => !groupIds.has(i.id)).slice(0, 2);
    return [...first, ...others];
  }

  function renderPaymentTargetOptions(house, { preselect = null } = {}) {
    if (!els.paymentTargetOptions) return;
    const periodId = els.paymentPeriod?.value || null;
    const items = paymentOptionItems(house, periodId);
    const group = dueNow(house, periodId);
    const groupIds = new Set((group?.items || []).map(i => i.id));
    const checkedIds = preselect || state.paymentSelection || [...groupIds];

    if (!items.length) {
      els.paymentTargetOptions.innerHTML = '<p class="muted">Non c’è niente di aperto in quest’anno: usa «un altro importo» qui sotto.</p>';
      state.paymentSelection = [];
      return;
    }
    els.paymentTargetOptions.innerHTML = items.map(i => {
      const on = checkedIds.includes(i.id);
      return `<label class="option-row${on ? ' option-row--on' : ''}">
        <input type="checkbox" data-pay-item="${esc(i.id)}"${on ? ' checked' : ''} />
        ${voceBadge(i.voice, 'md')}
        <span class="option-main">
          <span class="option-title">${i.title}</span>
          <span class="option-sub">${i.sub}${i.dueBy ? ` · ${i.dueBy < today ? 'scaduta il' : 'scade il'} ${fmtDate(i.dueBy)}` : ''}</span>
          ${i.parts && VOCI_RATA.filter(v => Math.abs(Number(i.parts[v] || 0)) > 0.005).length > 1
            ? `<span class="voce-chips">${partsChips(i.parts)}</span>` : ''}
        </span>
        <span class="option-amount">${fmt(i.amount)}</span>
      </label>`;
    }).join('');
    state.paymentSelection = checkedIds.filter(id => items.some(i => i.id === id));
  }

  /** Quello che il modulo sta per registrare: una riga per voce selezionata. */
  function paymentSelection(house) {
    const periodId = els.paymentPeriod?.value || null;
    const items = paymentOptionItems(house, periodId);
    const checked = [...(els.paymentTargetOptions?.querySelectorAll('[data-pay-item]:checked') || [])]
      .map(input => input.dataset.payItem);
    const out = items.filter(i => checked.includes(i.id)).map(i => ({ ...i }));

    const extraKey = els.paymentInstallment?.value;
    if (extraKey && !out.some(i => i.key === extraKey)) {
      const slot = findInstallment(house, extraKey);
      if (slot) {
        const { slots } = installmentSummaryForPeriod(house, slot.fiscalPeriodId);
        const row = slots.find(s => s.key === extraKey);
        const gap = row ? round2(row.amountDue - row.paid) : slot.amountDue;
        out.push({
          kind: 'rata',
          id: extraKey,
          key: extraKey,
          voice: dominantVoice(slot.parts),
          title: installmentTitle(slot),
          sub: `Preventivo ${periodLabel(house, slot.fiscalPeriodId)}`,
          amount: gap > 0.01 ? gap : slot.amountDue
        });
      }
    }
    const free = Number(els.paymentFreeAmount?.value || 0);
    if (Number.isFinite(free) && free > 0.005) {
      out.push({ kind: 'free', id: 'free', voice: 'ordinario', title: 'Un altro importo', sub: 'Senza rata', amount: round2(free) });
    }
    return out;
  }

  function renderPaymentTotal(house) {
    const selection = paymentSelection(house);
    const total = round2(selection.reduce((s, i) => s + i.amount, 0));
    if (els.paymentTotal) els.paymentTotal.textContent = fmt(total);
    if (els.paymentSubmitBtn) els.paymentSubmitBtn.disabled = total <= 0.005 && !els.paymentEditId?.value;
    els.paymentTargetOptions?.querySelectorAll('.option-row').forEach(row => {
      row.classList.toggle('option-row--on', Boolean(row.querySelector('input')?.checked));
    });
    return { selection, total };
  }

  /** «Cosa cambia»: cosa risulterà pagato e quanto resta dopo il salvataggio. */
  function renderPaymentAfterCard(house) {
    if (!els.paymentAfterCard) return;
    const periodId = els.paymentPeriod?.value || null;
    const f = periodId ? yearFigures(house, periodId) : null;
    const { selection, total } = renderPaymentTotal(house);
    if (!f) {
      els.paymentAfterCard.innerHTML = '';
      return;
    }
    const { slots } = installmentSummaryForPeriod(house, periodId);
    const coveredAfter = f.paidSlots + selection.filter(i => {
      if (i.kind !== 'rata') return false;
      const row = slots.find(s => s.key === i.key);
      return row && i.amount >= round2(row.amountDue - row.paid) - 0.01;
    }).length;

    const lines = selection.map(i => {
      let note = 'Registrato';
      if (i.kind === 'rata') note = `Pagata · ${coveredAfter} rate su ${slots.length}`;
      if (i.kind === 'prior') note = `Saldato · il ${i.title.replace('Conguaglio ', '')} si chiude`;
      return `<div class="after-line">
        ${voceBadge(i.voice, 'sm')}
        <span>
          <span class="after-line-title">${i.title}</span>
          <span class="after-line-note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>${note}</span>
        </span>
      </div>`;
    }).join('');

    const residuo = round2(Math.max(f.residuo - total, 0));
    const restItems = openItems(house, periodId).filter(i => !selection.some(s => s.id === i.id));
    els.paymentAfterCard.innerHTML = `
      <div class="panel-head"><div><h2>Cosa cambia</h2></div></div>
      ${lines || '<p class="muted">Scegli cosa stai pagando.</p>'}
      <div class="after-amount">
        <span class="residual-label">Restano da pagare nel ${f.label}</span>
        <span class="after-value">${fmt(residuo)}</span>
        <span class="hint">${restItems.length
          ? `${restItems.length} ${restItems.length === 1 ? 'voce' : 'voci'} · ${voicesSummary(restItems)}`
          : 'Non resta niente da pagare'}</span>
      </div>`;
  }

  function syncPaymentEditMode(house) {
    const editing = Boolean(els.paymentEditId?.value);
    els.paymentChoiceBlock?.classList.toggle('hidden', editing);
    els.paymentEditBlock?.classList.toggle('hidden', !editing);
    if (els.paymentSubmitLabel) els.paymentSubmitLabel.textContent = editing ? 'Aggiorna pagamento' : 'Salva pagamento';
    if (editing && els.paymentSubmitBtn) els.paymentSubmitBtn.disabled = false;
  }


  // ══════════════════════════════════════════════════════════════════════════
  //  v3 · Resoconti: anno per anno, voce per voce
  // ══════════════════════════════════════════════════════════════════════════

  function resocontoPeriodId(house) {
    const summary = periodSummary(house);
    if (!summary.length) return null;
    const wanted = state.pendingSituazionePeriodId || els.situazionePeriod?.value || state.resocontoPeriodId;
    if (wanted && summary.some(p => String(p.id) === String(wanted))) return String(wanted);
    return String(resolveFocusPeriod(house)?.id || summary[0].id);
  }

  function yearStateBadge(house, f) {
    if (!f) return '';
    if (f.hasConsuntivo) {
      const cong = f.conguaglioOut;
      if (!cong || cong.direction === 'pari') return '<span class="badge success">Chiuso in pari</span>';
      const residual = priorBalanceResidualForSource(house, f.periodId);
      if (residual === 0) return '<span class="badge success">Chiuso</span>';
      const dueDate = conguaglioDueDateForSource(house, f.periodId);
      return `<span class="badge warn">Da saldare${dueDate ? ` entro il ${fmtDate(dueDate)}` : ''}</span>`;
    }
    if (f.slots.length) return `<span class="badge neutral">In corso · ${f.paidSlots} rate su ${f.slots.length}</span>`;
    return '<span class="badge neutral">Senza preventivo</span>';
  }

  /** Il conguaglio di un anno chiuso vive come saldo iniziale dell'anno dopo. */
  function nextPeriodPrior(house, periodId) {
    const next = getNextPeriod(house, periodId);
    if (!next) return null;
    const prior = getPriorBalanceForPeriod(house, next.id);
    if (!prior || String(prior.sourcePeriodId || '') !== String(periodId)) return null;
    return { next, prior };
  }

  function priorBalanceResidualForSource(house, periodId) {
    const link = nextPeriodPrior(house, periodId);
    if (!link) return 0;
    const res = priorBalanceResidual(house, link.next.id);
    return res ? res.residuo : 0;
  }

  function conguaglioDueDateForSource(house, periodId) {
    const link = nextPeriodPrior(house, periodId);
    return link ? conguaglioDueDate(house, link.next.id) : null;
  }

  function renderResocontiYears(house) {
    if (!els.resocontiYears) return;
    const summary = periodSummary(house);
    if (!summary.length) {
      els.resocontiYears.innerHTML = '<div class="empty">Nessun anno condominiale registrato.</div>';
      return;
    }
    const selected = resocontoPeriodId(house);
    const head = `<div class="years-head">
      <span>Anno</span>
      <span>${voceBadge('ordinario', 'xs')}Preventivo</span>
      <span>${voceBadge('straordinari', 'xs')}Straordinari</span>
      <span>${voceBadge('consuntivo', 'xs')}Consuntivo</span>
      <span>${voceBadge('conguaglio', 'xs')}Conguaglio</span>
      <span>Stato</span>
    </div>`;
    const rows = summary.map(p => {
      const f = yearFigures(house, p.id);
      const cong = f.conguaglioOut;
      const congTxt = cong && cong.direction !== 'pari'
        ? `${fmt(Math.abs(cong.amount))} <span class="muted">a ${cong.direction}</span>`
        : (f.hasConsuntivo ? '<span class="muted">in pari</span>' : '<span class="muted">—</span>');
      return `<button type="button" class="year-row${String(p.id) === String(selected) ? ' year-row--on' : ''}" data-resoconto-period="${String(p.id).replace(/"/g, '&quot;')}" aria-pressed="${String(p.id) === String(selected)}">
        <span class="year-name"><strong>${p.label}</strong><span class="muted">${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}</span></span>
        <span class="year-num">${f.ordinario > 0.005 ? fmt(f.ordinario) : '<span class="muted">—</span>'}</span>
        <span class="year-num">${f.straordinari > 0.005 ? fmt(f.straordinari) : '<span class="muted">—</span>'}</span>
        <span class="year-num">${f.hasConsuntivo ? fmt(f.consuntivo) : '<span class="muted">a fine anno</span>'}</span>
        <span class="year-num">${congTxt}</span>
        <span class="year-state">${yearStateBadge(house, f)}</span>
      </button>`;
    }).join('');
    els.resocontiYears.innerHTML = head + rows;
  }

  function renderResocontoCycle(house, periodId) {
    if (!els.resocontoCycle) return;
    const f = yearFigures(house, periodId);
    if (!f) { els.resocontoCycle.innerHTML = ''; return; }
    const cong = f.conguaglioOut;
    const steps = [
      {
        voice: 'ordinario',
        title: 'Preventivo',
        value: f.ordinario > 0.005 ? fmt(f.ordinario) : 'Da aggiungere',
        note: f.slots.length
          ? `${f.paidSlots} rate su ${f.slots.length} pagate`
          : '<button type="button" class="link-more" data-nav-target="resoconti" data-nav-subview="preventivo">Aggiungi</button>',
        muted: f.ordinario <= 0.005
      },
      {
        voice: 'consuntivo',
        title: 'Consuntivo',
        value: f.hasConsuntivo ? fmt(f.consuntivo) : 'In attesa',
        note: f.hasConsuntivo
          ? 'Registrato'
          : `Dopo il ${fmtDate(f.row?.endDate)} · <button type="button" class="link-more" data-nav-target="resoconti" data-nav-subview="consuntivo">Aggiungi</button>`,
        muted: !f.hasConsuntivo
      },
      {
        voice: 'conguaglio',
        title: 'Conguaglio',
        value: cong && cong.direction !== 'pari' ? `${fmt(Math.abs(cong.amount))}` : (f.hasConsuntivo ? 'In pari' : 'Da calcolare'),
        note: cong
          ? (cong.direction === 'pari' ? 'Niente da saldare' : `A ${cong.direction} · consuntivo − pagato`)
          : 'Uscirà dal consuntivo.',
        muted: !f.hasConsuntivo
      }
    ];
    els.resocontoCycle.innerHTML = `
      <div class="panel-head"><div><h2>Il ciclo dell’anno</h2></div></div>
      <ol class="cycle">
        ${steps.map((s, i) => `<li class="cycle-step">
          <span class="cycle-mark">${voceBadge(s.voice, 'md')}${i < steps.length - 1 ? '<span class="cycle-line"></span>' : ''}</span>
          <span class="cycle-body">
            <span class="cycle-title">${s.title}</span>
            <span class="cycle-value${s.muted ? ' cycle-value--muted' : ''}">${s.value}</span>
            <span class="cycle-note">${s.note}</span>
          </span>
        </li>`).join('')}
      </ol>`;
  }

  function renderResocontoAccount(house, periodId) {
    if (!els.resocontoAccount) return;
    const f = yearFigures(house, periodId);
    if (!f) { els.resocontoAccount.innerHTML = ''; return; }
    const straordinariDues = straordinariDuesForPeriod(house, periodId);
    const prior = getPriorBalanceForPeriod(house, periodId);
    const effettivo = f.hasConsuntivo;

    const row = (label, previsto, effettivoCell, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}>
      <th scope="row">${label}</th>
      <td class="col-previsto">${previsto}</td>
      <td>${effettivoCell}</td>
    </tr>`;

    const totaleEffettivo = effettivo ? round2(f.consuntivo + f.straordinari + f.conguaglioIn) : null;
    els.resocontoAccount.innerHTML = `
      <div class="panel-head">
        <div><h2>Il conto del ${f.label}</h2></div>
        <span class="hint">${effettivo ? 'Con il consuntivo, l’effettivo prende il posto del previsto' : 'Senza consuntivo, il conto si basa sul preventivo'}</span>
      </div>
      <table class="account-table">
        <thead>
          <tr><th scope="col">Voce</th><th scope="col" class="col-previsto">Previsto</th><th scope="col">Effettivo</th></tr>
        </thead>
        <tbody>
          ${row(`<span class="cell-voce">${voceBadge('ordinario', 'xs')}Ordinario</span>`,
                f.ordinario > 0.005 ? fmt(f.ordinario) : '—',
                effettivo ? fmt(f.consuntivo) : '<span class="muted">in attesa</span>')}
          ${f.straordinari > 0.005 ? row(
            `<span class="cell-voce">${voceBadge('straordinari', 'xs')}Straordinari <span class="muted">· ${straordinariDues.map(d => d.description || 'spesa').join(', ')}</span></span>`,
            fmt(f.straordinari),
            '<span class="muted">a fine lavori</span>') : ''}
          ${f.conguaglioIn !== 0 ? row(
            `<span class="cell-voce">${voceBadge('conguaglio', 'xs')}Dall’anno prima <span class="muted">· conguaglio ${prior?.sourcePeriodId ? periodLabel(house, prior.sourcePeriodId) : ''}</span></span>`,
            fmt(f.conguaglioIn),
            fmt(f.conguaglioIn)) : ''}
          ${row('Totale dovuto', fmt(f.dovuto), totaleEffettivo != null ? fmt(totaleEffettivo) : '—', 'row-strong')}
          ${row(`Pagato <span class="muted">· ${f.row?.paid ? f.paidSlots : 0} rate</span>`, `− ${fmt(f.pagato)}`, `− ${fmt(f.pagato)}`)}
          ${row('Da pagare', fmt(f.residuo),
                totaleEffettivo != null ? fmt(round2(totaleEffettivo - f.pagato)) : '—', 'row-total')}
        </tbody>
      </table>`;
  }

  function renderResocontoRate(house, periodId) {
    if (!els.resocontoRate) return;
    const { slots } = installmentSummaryForPeriod(house, periodId);
    if (!slots.length) {
      els.resocontoRate.innerHTML = `
        <div class="panel-head"><div><h2>Rate e cosa contengono</h2></div></div>
        <p class="muted">Nessuna rata: aggiungi il preventivo dell’anno per crearle.</p>`;
      return;
    }
    const totalRow = { ordinario: 0, conguaglio: 0, straordinari: 0, tot: 0 };
    const paidRow = { ordinario: 0, conguaglio: 0, straordinari: 0, tot: 0 };
    const rows = slots.map((slot, i) => {
      const parts = slot.parts || {};
      const covered = slot.paid >= slot.amountDue - 0.01;
      for (const v of VOCI_RATA) {
        totalRow[v] += Number(parts[v] || 0);
        // Una rata pagata copre tutte le sue voci: non se ne paga mezza.
        if (covered) paidRow[v] += Number(parts[v] || 0);
      }
      totalRow.tot += slot.amountDue;
      paidRow.tot += slot.paid;
      const late = !covered && slot.periodEnd < today;
      const stato = covered
        ? `<span class="state-ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>Pagata</span>`
        : late
          ? '<span class="state-late">Scaduta</span>'
          : `<span class="muted">Da pagare${slot.paid > 0.005 ? ` · versati ${fmt(slot.paid)}` : ''}</span>`;
      return `<div class="plan-row">
        <span>Rata ${i + 1}</span>
        <span class="muted">${fmtDate(slot.periodEnd)}</span>
        ${VOCI_RATA.map(voice => {
          const value = Number(parts[voice] || 0);
          return `<span class="num plan-cell plan-cell--num${value ? '' : ' num--empty'}">${voceBadge(voice, 'xs')}${value ? fmt(value) : '—'}</span>`;
        }).join('')}
        <span class="num num--total">${fmt(slot.amountDue)}</span>
        <span class="plan-state">${stato}</span>
      </div>`;
    }).join('');

    els.resocontoRate.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>Rate e cosa contengono</h2>
          <p class="subtle">Per ogni rata: quanto è ordinario, quanto conguaglio e quanto straordinari.</p>
        </div>
        <button type="button" class="link-more" data-nav-target="resoconti" data-nav-subview="rate" data-resoconto-period="${String(periodId).replace(/"/g, '&quot;')}">Modifica piano rate</button>
      </div>
      <div class="plan-table plan-table--read">
        <div class="plan-head">
          <span>Rata</span><span>Scadenza</span>
          <span class="num">${voceBadge('ordinario', 'xs')}Ordinario</span>
          <span class="num">${voceBadge('conguaglio', 'xs')}Conguaglio</span>
          <span class="num">${voceBadge('straordinari', 'xs')}Straordinari</span>
          <span class="num">Totale</span><span>Stato</span>
        </div>
        ${rows}
        <div class="plan-row plan-row--total">
          <span class="plan-name">Totale</span><span></span>
          ${VOCI_RATA.map(voice => `<span class="num plan-cell plan-cell--num">${voceBadge(voice, 'xs')}${fmt(totalRow[voice])}</span>`).join('')}
          <span class="num num--total">${fmt(totalRow.tot)}</span><span></span>
        </div>
        <div class="plan-row plan-row--paid">
          <span class="plan-name">Pagato</span><span></span>
          ${VOCI_RATA.map(voice => `<span class="num plan-cell plan-cell--num">${paidRow[voice] ? fmt(paidRow[voice]) : '—'}</span>`).join('')}
          <span class="num num--total">${fmt(paidRow.tot)}</span><span></span>
        </div>
        <div class="plan-row plan-row--todo">
          <span class="plan-name">Da pagare</span><span></span>
          ${VOCI_RATA.map(voice => `<span class="num plan-cell plan-cell--num">${fmt(round2(totalRow[voice] - paidRow[voice]))}</span>`).join('')}
          <span class="num num--total">${fmt(round2(totalRow.tot - paidRow.tot))}</span><span></span>
        </div>
      </div>`;
  }

  function renderResocontoMovements(house, periodId) {
    if (!els.resocontoMovements) return;
    const payments = house.payments
      .filter(p => String(p.fiscalPeriodId) === String(periodId))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const total = round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
    els.resocontoMovements.innerHTML = `
      <div class="panel-head">
        <div><h2>Pagamenti del ${periodLabel(house, periodId)}</h2></div>
        <span class="hint">${payments.length} ${payments.length === 1 ? 'pagamento' : 'pagamenti'} · <strong>${fmt(total)}</strong></span>
      </div>
      ${payments.length ? `<div class="pay-list">${payments.map(p => {
        const meta = paymentVoiceMeta(house, p);
        return `<div class="pay-row pay-row--actions">
          <span class="pay-date">${p.date ? fmtDate(p.date) : '—'}</span>
          <span class="pay-main">${voceBadge(meta.voice, 'sm')}<span>${meta.title}${p.note ? ` <span class="muted">· ${esc(p.note)}</span>` : ''}</span></span>
          <span class="pay-method">${p.method || '—'}</span>
          <span class="pay-amount">${fmt(p.amount)}</span>
          <span class="pay-actions">${rowActions('payment', p.id)}</span>
        </div>`;
      }).join('')}</div>` : '<p class="muted">Nessun pagamento registrato per quest’anno.</p>'}`;
  }

  function renderResoconti(house) {
    const periodId = resocontoPeriodId(house);
    state.resocontoPeriodId = periodId;
    if (els.situazionePeriod) {
      const summary = periodSummary(house);
      els.situazionePeriod.innerHTML = summary.map(p =>
        `<option value="${p.id}"${String(p.id) === String(periodId) ? ' selected' : ''}>${p.label}</option>`).join('');
      if (periodId) els.situazionePeriod.value = periodId;
    }
    state.pendingSituazionePeriodId = null;
    renderResocontiYears(house);
    if (!periodId) {
      if (els.resocontoDetail) els.resocontoDetail.classList.add('hidden');
      return;
    }
    els.resocontoDetail?.classList.remove('hidden');
    renderResocontoCycle(house, periodId);
    renderResocontoAccount(house, periodId);
    renderResocontoRate(house, periodId);
    renderResocontoMovements(house, periodId);
  }

  // ═══════════════════════ Preventivo (P) e consuntivo (C) ═══════════════════

  function dueFormPeriodId(house) {
    const id = els.duePeriod?.value;
    if (id && id !== '__new__') return id;
    return null;
  }

  function dueFormPeriodStart(house) {
    const id = dueFormPeriodId(house);
    if (id) {
      const period = house.fiscalPeriods.find(p => String(p.id) === String(id));
      return period?.startDate || null;
    }
    const label = String(els.duePeriodNew?.value || defaultFiscalLabel(house) || '');
    const year = Number(label.slice(0, 4));
    if (!Number.isFinite(year) || year < 1900) return null;
    return `${year}-${String(house.fiscalStartMonth || 6).padStart(2, '0')}-01`;
  }

  const dueCadence = { id: 'monthly' };

  function renderDueCadenceButtons(house) {
    if (!els.dueCadenceButtons) return;
    const total = Number(els.dueAmount?.value || 0);
    els.dueCadenceButtons.innerHTML = CADENCES.map(c => {
      const on = dueCadence.id === c.id;
      const each = total > 0
        ? (c.slots === 1 ? fmt(total) : `${fmt(round2(total / c.slots))} l’una`)
        : '—';
      return `<button type="button" class="cadence-btn${on ? ' cadence-btn--on' : ''}" data-cadence="${c.id}" aria-pressed="${on}">
        <span class="cadence-label">${c.label}</span>
        <span class="cadence-sub">${each}</span>
      </button>`;
    }).join('') + `<button type="button" class="cadence-btn cadence-btn--custom" data-nav-target="resoconti" data-nav-subview="rate">
        <span class="cadence-label">Personalizza</span>
        <span class="cadence-sub">Mesi, conguaglio, straordinari</span>
      </button>`;
  }

  function renderDueRateCells(house) {
    if (!els.dueRateCells) return;
    const start = dueFormPeriodStart(house);
    const months = monthsOfYear(start);
    const spec = CADENCES.find(c => c.id === dueCadence.id) || CADENCES[0];
    const total = Number(els.dueAmount?.value || 0);
    if (!months.length || !total) {
      els.dueRateCells.innerHTML = '';
      if (els.dueRateCount) els.dueRateCount.textContent = 'Scrivi l’importo per vedere le rate';
      if (els.dueRateRange) els.dueRateRange.textContent = '';
      return;
    }
    const amounts = splitEqually(total, spec.slots);
    const cells = amounts.map((amount, i) => {
      const m = months[i * spec.step] || months[0];
      const end = monthEndIso(m.value);
      return `<span class="rate-cell">
        <span class="rate-cell-month">${m.label.split(' ')[0]}</span>
        <span class="rate-cell-day">${Number(end.slice(8, 10))}/${Number(end.slice(5, 7))}</span>
      </span>`;
    }).join('');
    els.dueRateCells.innerHTML = cells;
    if (els.dueRateCount) {
      els.dueRateCount.textContent = spec.slots === 1
        ? `Una rata da ${fmt(total)}`
        : `${spec.slots} rate da ${fmt(round2(total / spec.slots))}`;
    }
    if (els.dueRateRange) {
      const first = monthEndIso(months[0].value);
      const last = monthEndIso((months[(spec.slots - 1) * spec.step] || months[0]).value);
      els.dueRateRange.textContent = spec.slots === 1
        ? `Il ${fmtDate(first)} · scadenza a fine mese`
        : `Dal ${fmtDate(first)} al ${fmtDate(last)} · scadenza a fine mese`;
    }
  }

  function renderDueRail(house) {
    if (!els.dueRail) return;
    const periodId = dueFormPeriodId(house);
    const prior = periodId ? getPriorBalanceForPeriod(house, periodId) : null;
    const straordinari = periodId ? straordinariDuesForPeriod(house, periodId) : [];
    const congCard = prior && Math.abs(Number(prior.amount)) > 0.005 ? `
      <section class="panel panel--conguaglio">
        <div class="panel-accent-head">${voceBadge('conguaglio', 'sm')}<h2>Dall’anno prima</h2></div>
        <div class="rail-row">
          <span>Conguaglio ${prior.sourcePeriodId ? periodLabel(house, prior.sourcePeriodId) : ''}</span>
          <span class="rail-amount">${fmt(Math.abs(prior.amount))} <span class="muted">${Number(prior.amount) >= 0 ? 'a debito' : 'a credito'}</span></span>
        </div>
        <p class="hint">Per ora è una rata a parte, entro il ${fmtDate(conguaglioDueDate(house, periodId))}. Puoi spostarlo con
          <button type="button" class="link-more" data-nav-target="resoconti" data-nav-subview="rate">Personalizza</button>.</p>
      </section>` : '';
    const straCard = straordinari.length ? `
      <section class="panel panel--straordinari">
        <div class="panel-accent-head">${voceBadge('straordinari', 'sm')}<h2>Straordinari approvati</h2></div>
        ${straordinari.map(d => `<div class="rail-row"><span>${esc(d.description || 'Spesa straordinaria')}</span><span class="rail-amount">${fmt(d.amount)}</span></div>`).join('')}
        <p class="hint">Scegli in quali rate pagarli con
          <button type="button" class="link-more" data-nav-target="resoconti" data-nav-subview="rate">Personalizza</button>.</p>
      </section>` : '';

    els.dueRail.innerHTML = `${congCard}${straCard}
      <section class="panel">
        <div class="panel-head"><div><h2>Come funziona ogni anno</h2></div></div>
        <ol class="voci-legend">
          <li>${voceBadge('ordinario', 'md')}<span><strong>Preventivo <span class="badge info">Sei qui</span></strong><span class="muted">A inizio anno: stabilisce la quota e le rate.</span></span></li>
          <li>${voceBadge('consuntivo', 'md')}<span><strong>Consuntivo</strong><span class="muted">A fine anno: quanto hai speso davvero.</span></span></li>
          <li>${voceBadge('conguaglio', 'md')}<span><strong>Conguaglio</strong><span class="muted">Lo calcola l’app: consuntivo − pagato. Passa all’anno dopo.</span></span></li>
          <li class="voci-legend-sep">${voceBadge('straordinari', 'md')}<span><strong>Straordinari</strong><span class="muted">Spese decise a parte, come i lavori: le metti nelle rate che vuoi.</span></span></li>
        </ol>
      </section>`;
  }

  /**
   * Se l'anno scelto ha già il suo preventivo, il modulo lo apre invece di
   * proporne un secondo: due preventivi per lo stesso anno non vogliono dire
   * niente, e un doppione si nota solo quando i conti non tornano più.
   */
  function loadDueForPeriod(house) {
    if (!els.dueForm || els.dueVoice?.value === 'straordinario') return;
    const periodId = dueFormPeriodId(house);
    const existing = periodId ? ordinarioDueForPeriod(house, periodId) : null;
    if (existing) {
      if (els.dueAmount) els.dueAmount.value = String(existing.amount);
      if (els.dueForm.description) els.dueForm.description.value = existing.description || '';
      if (els.dueEditId) els.dueEditId.value = existing.id;
      // Le rate salvate sono sempre «custom»: la cadenza si rilegge da quante sono.
      const count = listInstallmentsForDue(house, existing).length;
      dueCadence.id = (CADENCES.find(c => c.slots === count) || CADENCES[0]).id;
      dueCadence.touched = false;
    } else {
      if (els.dueAmount) els.dueAmount.value = '';
      if (els.dueForm.description) els.dueForm.description.value = '';
      if (els.dueEditId) els.dueEditId.value = '';
      dueCadence.touched = false;
    }
  }

  /**
   * Il modulo dei documenti dell'anno serve due voci: il preventivo ordinario,
   * che porta con sé le rate, e una spesa straordinaria, che invece si decide nel
   * piano rate. Cambia quello che chiede — etichette, passi, riquadri — ma resta
   * un modulo solo: per chi compila è sempre «un importo deliberato».
   */
  function syncDueForm(house) {
    if (!els.dueForm) return;
    const voice = els.dueVoice?.value || 'ordinario';
    const straordinario = voice === 'straordinario';
    const periodId = dueFormPeriodId(house);
    const label = periodId ? periodLabel(house, periodId) : (els.duePeriodNew?.value || defaultFiscalLabel(house));
    const period = periodId ? house.fiscalPeriods.find(p => String(p.id) === String(periodId)) : null;

    document.querySelectorAll('[data-due-voice]').forEach(btn => {
      const active = els.dueForm.closest('[data-subview-panel]')?.classList.contains('active')
        && btn.dataset.dueVoice === voice;
      btn.classList.toggle('active', Boolean(active));
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (els.dueFormTitle) {
      els.dueFormTitle.textContent = straordinario
        ? 'Aggiungi una spesa straordinaria'
        : (els.dueEditId?.value ? 'Modifica il preventivo' : 'Aggiungi il preventivo');
    }
    if (els.dueFormPeriodLine) {
      els.dueFormPeriodLine.textContent = period
        ? `Anno ${label} · ${fmtDate(period.startDate)} – ${fmtDate(period.endDate)}`
        : `Nuovo anno ${label}`;
    }
    if (els.dueAmountLabel) {
      els.dueAmountLabel.textContent = straordinario
        ? `Quanto ti spetta della spesa straordinaria?`
        : `Quanto è previsto per te nel ${label}?`;
    }
    if (els.dueAmountHint) {
      els.dueAmountHint.textContent = straordinario
        ? 'La tua quota dei lavori, come nel riparto della delibera.'
        : 'La tua quota, come nel preventivo approvato in assemblea.';
    }
    if (els.dueSubmitLabel) {
      const editing = Boolean(els.dueEditId?.value);
      els.dueSubmitLabel.textContent = straordinario
        ? (editing ? 'Aggiorna la spesa' : 'Salva spesa straordinaria')
        : (editing ? 'Aggiorna preventivo' : 'Salva preventivo');
    }
    if (els.dueFormFootHint) {
      els.dueFormFootHint.textContent = straordinario
        ? 'Poi scegli in quali rate pagarla, dal piano rate dell’anno.'
        : 'Ogni rata comparirà in Panoramica con la sua scadenza.';
    }
    // Una spesa straordinaria non ha una cadenza sua: i passi 2 e 3 spariscono.
    els.dueSplitStep?.classList.toggle('hidden', straordinario);
    els.dueRateStep?.classList.toggle('hidden', straordinario);
    if (!straordinario) {
      renderDueCadenceButtons(house);
      renderDueRateCells(house);
    }
    renderDueRail(house);
  }

  // ───────────────────────────── Consuntivo (C) ─────────────────────────────

  const consSettle = { mode: 'aparte' };

  function consFormPeriodId(house) {
    return els.consPeriod?.value || null;
  }

  /** Il conguaglio che uscirebbe dal consuntivo scritto nel modulo. */
  function consPreview(house) {
    const periodId = consFormPeriodId(house);
    if (!periodId) return null;
    const typed = Number(els.consAmount?.value || 0);
    const consuntivo = Number.isFinite(typed) && typed > 0 ? round2(typed) : 0;
    const paid = round2(sumPaid(house, periodId));
    const amount = round2(consuntivo - paid);
    const direction = amount > 0.005 ? 'debito' : amount < -0.005 ? 'credito' : 'pari';
    const preventivo = round2(sumOrdinarioDue(house, periodId) + sumStraordinariDue(house, periodId));
    return { periodId, label: periodLabel(house, periodId), consuntivo, paid, amount, direction, preventivo };
  }

  function renderConsSettleOptions(house) {
    if (!els.consSettleOptions) return;
    const p = consPreview(house);
    if (!p || !p.consuntivo) {
      els.consSettleOptions.innerHTML = '<p class="muted">Scrivi il consuntivo: da lì l’app calcola il conguaglio.</p>';
      return;
    }
    if (p.direction === 'pari') {
      els.consSettleOptions.innerHTML = `<p class="note-ok">Sei in pari: non c’è niente da saldare. Il ${p.label} si chiude subito.</p>`;
      return;
    }
    const next = getNextPeriod(house, p.periodId);
    const options = p.direction === 'debito'
      ? [
        { id: 'aparte', title: 'Con un pagamento a parte', sub: `Scadenza ${fmtDate(conguaglioDueDate(house, next?.id || p.periodId))} · lo trovi tra i pagamenti` },
        { id: 'prossima', title: 'Insieme alla prossima rata', sub: `Si somma alla prossima rata del ${next?.label || 'prossimo anno'}` },
        { id: 'diviso', title: 'Diviso sulle rate che restano', sub: `Una quota uguale su ogni rata del ${next?.label || 'prossimo anno'}` }
      ]
      : [
        { id: 'scalato', title: 'Scalato dalla prossima rata', sub: `La prossima rata del ${next?.label || 'prossimo anno'} si riduce` },
        { id: 'aparte', title: 'Rimborsato dall’amministratore', sub: 'Lo segni come incassato quando arriva' }
      ];
    if (!options.some(o => o.id === consSettle.mode)) consSettle.mode = options[0].id;
    els.consSettleOptions.innerHTML = options.map(o => `
      <label class="option-row${consSettle.mode === o.id ? ' option-row--on' : ''}">
        <input type="radio" name="consSettle" value="${o.id}"${consSettle.mode === o.id ? ' checked' : ''} />
        <span class="option-main">
          <span class="option-title">${o.title}</span>
          <span class="option-sub">${o.sub}</span>
        </span>
      </label>`).join('');
  }

  function renderConsRail(house) {
    if (!els.consRail) return;
    const p = consPreview(house);
    if (!p) { els.consRail.innerHTML = ''; return; }
    if (!p.consuntivo) {
      // Senza consuntivo non c'è nessun conguaglio: mostrarne uno «a credito» pari a
      // tutto il pagato sarebbe una cifra inventata.
      els.consRail.innerHTML = `
        <section class="panel" aria-live="polite">
          <div class="panel-accent-head">${voceBadge('conguaglio', 'md')}<h2>Il tuo conguaglio ${p.label}</h2></div>
          <p class="muted">Scrivi quanto hai speso davvero e qui compare il conguaglio: consuntivo meno quello che hai già pagato (${fmt(p.paid)} nel ${p.label}).</p>
        </section>`;
      return;
    }
    const abs = Math.abs(p.amount);
    const dirLabel = p.direction === 'debito' ? 'a debito' : p.direction === 'credito' ? 'a credito' : 'in pari';
    const max = Math.max(p.preventivo, p.consuntivo, 1);
    const diff = round2(p.consuntivo - p.preventivo);
    els.consRail.innerHTML = `
      <section class="panel" aria-live="polite">
        <div class="panel-accent-head">${voceBadge('conguaglio', 'md')}<h2>Il tuo conguaglio ${p.label}</h2></div>
        <div class="cong-amount">
          <span class="after-value">${fmt(abs)}</span>
          <span class="badge ${p.direction === 'debito' ? 'warn' : p.direction === 'credito' ? 'success' : 'neutral'}">${dirLabel}</span>
        </div>
        <div class="summary-dl">
          <div class="summary-row"><dt><span class="cell-voce">${voceBadge('consuntivo', 'xs')}Consuntivo ${p.label}</span></dt><dd>${fmt(p.consuntivo)}</dd></div>
          <div class="summary-row"><dt>− Già pagato</dt><dd>${fmt(p.paid)}</dd></div>
          <div class="summary-row summary-row--total"><dt>= Conguaglio</dt><dd>${fmt(abs)} <span class="muted">${dirLabel}</span></dd></div>
        </div>
        <div class="cong-compare">
          <span class="hint">Rispetto al preventivo</span>
          <div class="cong-bar-row">${voceBadge('ordinario', 'xs')}<span class="cong-bar"><span style="width:${(p.preventivo / max * 100).toFixed(1)}%;background:var(--voce-ordinario-fg);"></span></span><span class="cong-bar-num">${fmt(p.preventivo)}</span></div>
          <div class="cong-bar-row">${voceBadge('consuntivo', 'xs')}<span class="cong-bar"><span style="width:${(p.consuntivo / max * 100).toFixed(1)}%;background:var(--voce-consuntivo-fg);"></span></span><span class="cong-bar-num">${fmt(p.consuntivo)}</span></div>
          <span class="hint">${Math.abs(diff) < 0.01
            ? 'Speso esattamente quanto previsto.'
            : diff > 0 ? `Speso ${fmt(diff)} in più del preventivo.` : `Speso ${fmt(Math.abs(diff))} in meno del preventivo.`}</span>
        </div>
      </section>`;
  }

  /**
   * @param {object} house
   * @param {{keepOptions?: boolean}} opts  keepOptions lascia stare le opzioni di
   *   saldo: servono quando è stato l'utente a sceglierne una, perché ridisegnarle
   *   sotto il dito gli toglierebbe il fuoco dal radio appena premuto.
   */
  function syncConsForm(house, { keepOptions = false } = {}) {
    if (!els.consForm) return;
    const p = consPreview(house);
    if (els.consFormPeriodLine && p) {
      const period = house.fiscalPeriods.find(x => String(x.id) === String(p.periodId));
      els.consFormPeriodLine.textContent = period
        ? `Anno ${p.label} · ${fmtDate(period.startDate)} – ${fmtDate(period.endDate)}`
        : `Anno ${p.label}`;
    }
    if (els.consAmountLabel && p) els.consAmountLabel.textContent = `Quanto hai speso davvero nel ${p.label}?`;
    if (keepOptions) {
      els.consSettleOptions?.querySelectorAll('.option-row').forEach(row => {
        row.classList.toggle('option-row--on', Boolean(row.querySelector('input')?.checked));
      });
    } else {
      renderConsSettleOptions(house);
    }
    renderConsRail(house);
  }

  // ─────────────────────────── Rate personalizzate ───────────────────────────

  const ratePlan = { periodId: null, rows: [], dirty: false };

  function ratePlanPeriodId(house) {
    const summary = periodSummary(house);
    if (!summary.length) return null;
    const wanted = els.ratePlanPeriod?.value || ratePlan.periodId || state.resocontoPeriodId;
    if (wanted && summary.some(p => String(p.id) === String(wanted))) return String(wanted);
    return String(resolveFocusPeriod(house)?.id || summary[0].id);
  }

  function loadRatePlan(house, periodId, { force = false } = {}) {
    if (!force && ratePlan.dirty && String(ratePlan.periodId) === String(periodId)) return;
    ratePlan.periodId = periodId;
    const existing = planRows(house, periodId);
    ratePlan.rows = existing.length
      ? existing
      : generateRows({ periodStart: house.fiscalPeriods.find(p => String(p.id) === String(periodId))?.startDate, targets: planTargets(house, periodId) });
    ratePlan.dirty = false;
  }

  function renderRatePlanTargets(house) {
    if (!els.ratePlanTargets) return;
    const periodId = ratePlan.periodId;
    const targets = planTargets(house, periodId);
    const status = planStatus(targets, ratePlan.rows);
    const subs = {
      ordinario: `Preventivo ${periodLabel(house, periodId)}`,
      conguaglio: targets.priorBalance?.sourcePeriodId
        ? `${periodLabel(house, targets.priorBalance.sourcePeriodId)}, a ${Number(targets.conguaglio) >= 0 ? 'debito' : 'credito'}`
        : 'Dall’anno prima',
      straordinari: targets.straordinariDues.map(d => d.description || 'Spesa straordinaria').join(' · ') || 'Nessuna spesa deliberata'
    };
    els.ratePlanTargets.innerHTML = status.map(st => `
      <section class="panel voce-card">
        <div class="voce-card-head">${voceBadge(st.voice, 'md')}
          <span><strong>${VOCI[st.voice].label}</strong><span class="muted">${subs[st.voice]}</span></span>
        </div>
        <span class="voce-card-amount">${fmt(st.target)}</span>
        <span class="${st.ok ? 'state-ok' : 'state-warn'}">
          ${st.ok
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>Tutto nelle rate'
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5"/><path d="M12 16h.01"/></svg>${st.message}`}
        </span>
      </section>`).join('');
  }

  /** L'importo come si scrive in una casella: virgola decimale, niente valuta. */
  function amountField(value) {
    return Number(value || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Come si chiama una riga del piano, in base a cosa contiene. */
  function planRowName(row, nextRata) {
    const p = Number(row.ordinario || 0);
    const c = Number(row.conguaglio || 0);
    const s = Number(row.straordinari || 0);
    if (p > 0.005) return { label: `Rata ${nextRata()}`, voice: 'ordinario' };
    if (c > 0.005) return { label: s > 0.005 ? 'Extra' : 'Conguaglio', voice: 'conguaglio' };
    if (s > 0.005) return { label: 'Straordinario', voice: 'straordinari' };
    return { label: 'Vuota', voice: 'vuota' };
  }

  function renderRatePlanTable(house) {
    if (!els.ratePlanTable) return;
    const periodId = ratePlan.periodId;
    const period = house.fiscalPeriods.find(p => String(p.id) === String(periodId));
    const years = period ? [Number(period.startDate.slice(0, 4)), Number(period.endDate.slice(0, 4))] : [];
    const uniqueYears = [...new Set(years)];
    const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const totals = planTotals(ratePlan.rows);

    const head = `<div class="plan-head plan-head--edit">
      <span>Rata</span><span>Mese</span><span>Anno</span>
      <span class="num">${voceBadge('ordinario', 'xs')}Ordinario</span>
      <span class="num">${voceBadge('conguaglio', 'xs')}Conguaglio</span>
      <span class="num">${voceBadge('straordinari', 'xs')}Straordinari</span>
      <span class="num">Totale</span><span></span>
    </div>`;

    let rataCount = 0;
    const rows = ratePlan.rows.map((row, i) => {
      const month = Number(String(row.start).slice(5, 7)) - 1;
      const year = Number(String(row.start).slice(0, 4));
      const outside = isOutsidePeriod(house, periodId, row.start);
      // Il nome della riga dice cosa contiene: una rata del preventivo si numera,
      // una riga che porta solo il conguaglio o solo uno straordinario si chiama
      // con la sua voce. Così il piano si legge senza aprire le colonne.
      const name = planRowName(row, () => ++rataCount);
      return `<div class="plan-row plan-row--edit${outside ? ' plan-row--out' : ''}">
        <span class="plan-name voce-name--${name.voice}">${name.label}${outside ? '<span class="plan-out">Fuori dall’anno</span>' : ''}</span>
        <select class="plan-input" data-plan-month="${i}" aria-label="Mese di ${name.label}">
          ${months.map((m, mi) => `<option value="${mi}"${mi === month ? ' selected' : ''}>${m}</option>`).join('')}
        </select>
        <select class="plan-input" data-plan-year="${i}" aria-label="Anno di ${name.label}">
          ${uniqueYears.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('')}
        </select>
        ${VOCI_RATA.map(voice => `<span class="plan-cell">
          ${voceBadge(voice, 'xs')}
          <input class="plan-input plan-num" type="text" inputmode="decimal" placeholder="—"
            data-plan-amount="${i}" data-plan-voice="${voice}"
            aria-label="${VOCI[voice].label} di ${name.label}"
            value="${Number(row[voice] || 0) ? amountField(row[voice]) : ''}" />
        </span>`).join('')}
        <span class="num num--total">${fmt(rowTotal(row))}</span>
        <button type="button" class="icon-btn icon-btn--sm" data-plan-remove="${i}" aria-label="Elimina ${name.label}"${ratePlan.rows.length < 2 ? ' disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>
        </button>
      </div>`;
    }).join('');

    const totalRow = `<div class="plan-row plan-row--edit plan-row--total">
      <span class="plan-name">Totale</span><span></span><span></span>
      ${VOCI_RATA.map(voice => `<span class="num plan-cell plan-cell--num">${voceBadge(voice, 'xs')}${fmt(totals[voice])}</span>`).join('')}
      <span class="num num--total">${fmt(totals.total)}</span><span></span>
    </div>`;

    els.ratePlanTable.innerHTML = head + rows + totalRow;
    if (els.ratePlanSummary) {
      els.ratePlanSummary.textContent = `${ratePlan.rows.length} rate · totale ${fmt(totals.total)}`;
    }
    if (els.ratePlanHint) {
      const status = planStatus(planTargets(house, periodId), ratePlan.rows);
      const bad = status.filter(st => !st.ok);
      els.ratePlanHint.textContent = bad.length
        ? bad.map(st => `${VOCI[st.voice].label}: ${st.message.toLowerCase()}`).join(' · ')
        : 'Tutto quello che c’è da pagare è dentro le rate.';
      els.ratePlanHint.classList.toggle('hint--warn', bad.length > 0);
    }
  }

  function renderRatePlan(house, { reload = true } = {}) {
    if (!els.ratePlanTable) return;
    const periodId = ratePlanPeriodId(house);
    if (!periodId) {
      els.ratePlanTable.innerHTML = '<div class="empty">Nessun anno condominiale registrato.</div>';
      if (els.ratePlanTargets) els.ratePlanTargets.innerHTML = '';
      return;
    }
    if (els.ratePlanPeriod) {
      els.ratePlanPeriod.innerHTML = periodSummary(house).map(p =>
        `<option value="${p.id}"${String(p.id) === String(periodId) ? ' selected' : ''}>${p.label}</option>`).join('');
      els.ratePlanPeriod.value = periodId;
    }
    if (reload) loadRatePlan(house, periodId);
    const period = house.fiscalPeriods.find(p => String(p.id) === String(periodId));
    if (els.ratePlanPeriodLine && period) {
      els.ratePlanPeriodLine.textContent = `Anno ${period.label} · ${fmtDate(period.startDate)} – ${fmtDate(period.endDate)}. Per ogni rata scegli mese, anno e cosa contiene.`;
    }
    renderRatePlanTargets(house);
    renderRatePlanTable(house);
  }

  /**
   * I pagamenti registrati, raggruppati per anno condominiale: nella lista si legge
   * data, voce e rata, come nel resoconto. Un anno alla volta, perché è così che si
   * controlla un estratto conto — non in una tabella unica lunga tre anni.
   */
  function renderPayments(house) {
    renderPaymentFilterOptions(house);
    if (!els.paymentsTable) return;
    const payments = getFilteredPayments(house);
    const summary = paymentsSummaryForList(payments, house);
    const periodId = els.periodFilter?.value !== 'all' ? els.periodFilter?.value : null;
    const coverage = countCoveredInstallments(house, payments, periodId);
    if (els.paymentsSummary) {
      const ratio = coverage.total ? `${coverage.covered} rate coperte su ${coverage.total}` : 'nessuna rata';
      els.paymentsSummary.textContent = `${payments.length} ${payments.length === 1 ? 'pagamento' : 'pagamenti'} · ${ratio} · ${fmt(summary.total)} in tutto`;
    }
    if (!house.payments.length) {
      els.paymentsTable.innerHTML = emptyListHtml('Nessun pagamento registrato.');
      return;
    }
    if (!payments.length) {
      els.paymentsTable.innerHTML = emptyListHtml('Nessun pagamento per l’anno selezionato.');
      return;
    }

    const byPeriod = new Map();
    for (const p of payments) {
      const key = String(p.fiscalPeriodId);
      if (!byPeriod.has(key)) byPeriod.set(key, []);
      byPeriod.get(key).push(p);
    }
    const groups = periodSummary(house)
      .filter(period => byPeriod.has(String(period.id)))
      .map(period => {
        const rows = byPeriod.get(String(period.id))
          .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        const total = round2(rows.reduce((sum, p) => sum + Number(p.amount || 0), 0));
        return `<section class="panel">
          <div class="panel-head">
            <div><h2>Anno ${period.label}</h2></div>
            <span class="hint">${rows.length} ${rows.length === 1 ? 'pagamento' : 'pagamenti'} · <strong>${fmt(total)}</strong></span>
          </div>
          <div class="pay-list">${rows.map(p => paymentListRowHtml(house, p)).join('')}</div>
        </section>`;
      }).join('');
    els.paymentsTable.innerHTML = groups;
  }

  function paymentListRowHtml(house, payment) {
    const meta = paymentVoiceMeta(house, payment);
    const note = (payment.note || '').trim();
    return `<div class="pay-row pay-row--actions">
      <span class="pay-date">${payment.date ? fmtDate(payment.date) : '—'}</span>
      <span class="pay-main">${voceBadge(meta.voice, 'sm')}<span>${meta.title} <span class="muted">· ${meta.sub}</span></span></span>
      <span class="pay-method">${payment.method || '—'}${note ? `<span class="row-sub">${esc(note)}</span>` : ''}</span>
      <span class="pay-amount">${fmt(payment.amount)}</span>
      <span class="pay-actions">${rowActions('payment', payment.id)}</span>
    </div>`;
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

  function renderHouseImportParties(house) {
    const fields = els.houseImportPartiesFields || els.houseImportParties;
    if (!fields) return;
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
    els.houseImportPartiesFields.innerHTML = html;

    els.houseImportPartiesFields.querySelector('#houseAddOwnerBtn')?.addEventListener('click', () => {
      const list = els.houseImportPartiesFields.querySelector('#houseOwnersList');
      const n = list.querySelectorAll('[data-party-row]').length + 1;
      const row = document.createElement('div');
      row.className = 'field-grid';
      row.dataset.partyRow = '';
      row.dataset.role = 'owner';
      row.innerHTML = `<div><label>Proprietario ${n} — Nome</label><input type="text" data-party-first placeholder="Nome" /></div>
        <div><label>Cognome</label><input type="text" data-party-last placeholder="Cognome" /></div>`;
      list.appendChild(row);
    });
    els.houseImportPartiesFields.querySelector('#houseTenantEnabled')?.addEventListener('change', e => {
      els.houseImportPartiesFields.querySelector('#houseTenantFields')?.classList.toggle('hidden', !e.target.checked);
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
    // Il sottotitolo della Panoramica: casa e anno in una riga sola, come nel
    // disegno — «Via dei Tigli 4 · anno 2026/27 in corso».
    const focus = resolveFocusPeriod(house);
    if (els.currentHouseMeta) {
      els.currentHouseMeta.textContent = [
        house.name,
        house.location || null,
        focus?.label ? `anno ${focus.label}` : 'nessun anno condominiale registrato'
      ].filter(Boolean).join(' · ');
    }
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

    els.bankImportPreview.innerHTML = `<table><thead><tr><th></th><th>Data</th><th>Operazione</th><th>Importo</th><th>Match</th><th>Anno</th></tr></thead><tbody>${preview.map((row, idx) => {
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
    const movementCount = house.bankMovements?.length || 0;
    if (els.bankImportDeleteAll) els.bankImportDeleteAll.disabled = movementCount === 0;
    const batches = listBankImportBatches(house);
    if (!batches.length) {
      els.bankImportBatches.innerHTML = movementCount
        ? '<div class="empty">Movimenti banca presenti ma senza batch di import riconosciuto.</div>'
        : '<div class="empty">Nessun import banca salvato per questo immobile.</div>';
      return;
    }
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
    const optsFor = suggestedId => `<option value="">— Seleziona esercizio —</option>` + house.fiscalPeriods.map(p =>
      `<option value="${p.id}"${suggestedId && String(suggestedId) === String(p.id) ? ' selected' : ''}>${p.label}</option>`
    ).join('');
    els.unlinkedMovements.innerHTML = `<table><thead><tr><th>Data</th><th>Dettaglio</th><th>Importo</th><th>Anno</th><th></th></tr></thead><tbody>${rows.map(r =>
      `<tr><td>${r.movementDate}</td><td>${r.operation}<div class="hint">${r.details}</div></td><td class="amount">${fmt(r.amount)}</td><td><select class="link-period" data-id="${r.id}">${optsFor(r.suggestedFiscalPeriodId)}</select></td><td><button class="btn btn-secondary link-btn" data-id="${r.id}">Associa</button></td></tr>`
    ).join('')}</tbody></table>`;
  }

  function renderEmptyState() {
    if (els.currentHouseMeta) {
      els.currentHouseMeta.textContent = 'Aggiungi una casa dal pulsante accanto al menu o da Impostazioni.';
    }
    const message = state.houseDataLoadError
      ? `<div class="empty empty--error"><strong>Errore di caricamento dei dati.</strong><br/>${state.houseDataLoadError}<br/><button type="button" class="btn btn-primary" id="retryLoadHouseDataBtn" style="margin-top:1rem;">Riprova</button></div>`
      : '<div class="empty">Nessuna casa registrata.<br/><button type="button" class="btn btn-primary" id="emptyAddHouseBtn" style="margin-top:1rem;">Aggiungi una casa</button></div>';
    if (els.panoramicaDue) els.panoramicaDue.innerHTML = message;
    for (const el of [els.panoramicaYear, els.panoramicaPayments, els.pagamentiDueCard,
      els.pagamentiNextCard, els.paymentAfterCard, els.resocontiYears, els.resocontoCycle,
      els.resocontoAccount, els.resocontoRate, els.resocontoMovements, els.ratePlanTargets,
      els.ratePlanTable, els.panoramicaKpis, els.panoramicaPeriodLinks, els.dueRail, els.consRail]) {
      if (el) el.innerHTML = '';
    }
    els.panoramicaOtherYears?.classList.add('hidden');
    if (els.paymentsTable) els.paymentsTable.innerHTML = '<div class="empty">Nessun pagamento registrato.</div>';
    if (els.paymentsSummary) els.paymentsSummary.textContent = '';
    if (state.houseFormMode === 'new') renderNewHouseForm();
    else {
      els.houseForm?.reset();
      syncHouseFormChrome('edit');
      els.deleteHouseBtn?.classList.add('hidden');
      renderHouseImportParties({ importParties: [] });
    }
    els.panoramicaDue?.querySelector('#emptyAddHouseBtn')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('app:start-new-house'));
    });
    els.panoramicaDue?.querySelector('#retryLoadHouseDataBtn')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('app:retry-load-house-data'));
    });
  }

  function render(authRenderAccount) {
    if (!state.selectedHouseId && state.data.houses[0]) state.selectedHouseId = state.data.houses[0].id;
    if (!state.data.houses.length) state.houseFormMode = 'new';
    renderHouseList();
    if (state.houseFormMode === 'new') {
      renderNewHouseForm();
      if (state.currentView === 'impostazioni' && state.currentSubview === 'account') authRenderAccount?.();
      return;
    }
    const house = activeHouse();
    if (!house) { renderEmptyState(); return; }
    const safe = (label, fn) => { try { fn(); } catch (e) { console.error('[render]', label, e); } };

    const focusId = panoramicaPeriodId(house);
    safe('panoramica', () => {
      renderPanoramicaPeriodFilter(house);
      renderPanoramicaDue(house, focusId);
      renderPanoramicaYear(house, focusId);
      renderPanoramicaPayments(house);
      renderOtherYears(house, focusId);
    });
    safe('pagamenti', () => {
      renderPagamentiCounts(house, focusId);
      renderPagamentiDue(house, focusId);
      renderPagamentiNext(house, focusId);
    });
    safe('registra', () => {
      syncPaymentEditMode(house);
      if (!els.paymentEditId?.value) renderPaymentTargetOptions(house);
      syncPaymentMethodPills();
      renderPaymentAfterCard(house);
    });
    safe('resoconti', () => renderResoconti(house));
    safe('documenti', () => { syncDueForm(house); syncConsForm(house); });
    safe('ratePlan', () => renderRatePlan(house));
    safe('houseDrawerList', () => renderHouseDrawerList());
    safe('paymentGuide', () => renderPaymentGuide(house));
    safe('postImportBanner', () => renderPostImportBanner());
    safe('payments', () => renderPayments(house));
    safe('houseForm', () => renderHouseForm(house));
    safe('periodSelects', () => renderPeriodSelects(house));
    safe('bankImportPreview', () => renderBankImportPreview(house));
    safe('bankImportBatches', () => renderBankImportBatches(house));
    safe('unlinkedMovements', () => renderUnlinkedMovements(house));
    if (state.currentView === 'impostazioni' && state.currentSubview === 'account') authRenderAccount?.();
  }

  /** L'anno che la Panoramica racconta: quello scelto nel filtro, o quello in corso. */
  function panoramicaPeriodId(house) {
    const chosen = els.periodFilter?.value;
    if (chosen && chosen !== 'all' && house.fiscalPeriods.some(p => String(p.id) === String(chosen))) {
      return String(chosen);
    }
    return String(resolveFocusPeriod(house)?.id || house.fiscalPeriods[0]?.id || '') || null;
  }

  function renderPanoramicaPeriodFilter(house) {
    if (!els.periodFilter) return;
    const summary = periodSummary(house);
    const current = els.periodFilter.value || 'all';
    els.periodFilter.innerHTML = '<option value="all">Anno in corso</option>' +
      summary.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
    els.periodFilter.value = summary.some(p => String(p.id) === String(current)) ? current : 'all';
  }

  /** Il confronto con gli altri anni: sparisce quando ce n'è uno solo. */
  function renderOtherYears(house, focusId) {
    if (!els.panoramicaPeriodLinks) return;
    const others = periodSummary(house).filter(p => String(p.id) !== String(focusId));
    els.panoramicaOtherYears?.classList.toggle('hidden', !others.length);
    if (els.panoramicaScopeNote) {
      els.panoramicaScopeNote.textContent = focusId
        ? `Stai guardando il ${periodLabel(house, focusId)}.`
        : 'Nessun anno selezionato.';
    }
    if (els.panoramicaKpis) els.panoramicaKpis.innerHTML = '';
    els.panoramicaPeriodLinks.innerHTML = others.map(p => {
      const f = yearFigures(house, p.id);
      return `<button type="button" class="panoramica-period-row" data-nav-target="resoconti" data-nav-subview="anno" data-resoconto-period="${String(p.id).replace(/"/g, '&quot;')}">
        <span><strong>${p.label}</strong> ${yearStateBadge(house, f)}</span>
        <span class="amount">${fmt(f.residuo)} da pagare</span>
      </button>`;
    }).join('');
  }

  return {
    setView,
    render,
    // Panoramica e pagamenti
    renderPaymentTargetOptions,
    renderPaymentTotal,
    renderPaymentAfterCard,
    syncPaymentMethodPills,
    syncPaymentEditMode,
    paymentSelection,
    openItems,
    // Documenti dell'anno
    syncDueForm,
    loadDueForPeriod,
    syncConsForm,
    consPreview,
    dueCadenceState: () => dueCadence,
    consSettleState: () => consSettle,
    // Piano rate
    renderRatePlan,
    renderRatePlanTable,
    renderRatePlanTargets,
    ratePlanState: () => ratePlan,
    loadRatePlan,
    ratePlanPeriodId,
    // Selettori e liste
    renderBankImportPreview,
    renderUnlinkedMovements,
    syncPaymentPeriodSelect,
    syncPaymentInstallmentSelect,
    syncPaymentPriorBalanceInfo,
    syncDuePeriodSelect,
    applyPaymentSmartAmount,
    renderNewHouseForm,
    renderResoconti
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
    houseCurrentName: document.getElementById('houseCurrentName'),
    headerAddHouseBtn: document.getElementById('headerAddHouseBtn'),
    housesManageList: document.getElementById('housesManageList'),
    addHouseSettingsBtn: document.getElementById('addHouseSettingsBtn'),
    houseFormTitle: document.getElementById('houseFormTitle'),
    houseFormSubtitle: document.getElementById('houseFormSubtitle'),
    houseSubmitBtn: document.getElementById('houseSubmitBtn'),
    main: document.getElementById('mainContent'),
    panoramicaOtherYears: document.getElementById('panoramicaOtherYears'),
    paymentTargetOptions: document.getElementById('paymentTargetOptions'),
    paymentMethodPills: document.getElementById('paymentMethodPills'),
    paymentNote: document.getElementById('paymentNote'),
    paymentAfterCard: document.getElementById('paymentAfterCard'),
    dueSubmitLabel: document.getElementById('dueSubmitLabel'),
    paymentSubmitLabel: document.getElementById('paymentSubmitLabel'),
    dueAmount: document.getElementById('dueAmount'),
    dueAmountLabel: document.getElementById('dueAmountLabel'),
    dueAmountHint: document.getElementById('dueAmountHint'),
    dueFormFootHint: document.getElementById('dueFormFootHint'),
    dueCadenceButtons: document.getElementById('dueCadenceButtons'),
    dueRateCount: document.getElementById('dueRateCount'),
    panoramicaDue: document.getElementById('panoramicaDue'),
    panoramicaYear: document.getElementById('panoramicaYear'),
    panoramicaPayments: document.getElementById('panoramicaPayments'),
    pagamentiDueCard: document.getElementById('pagamentiDueCard'),
    pagamentiNextCard: document.getElementById('pagamentiNextCard'),
    countDaPagare: document.getElementById('countDaPagare'),
    countPagati: document.getElementById('countPagati'),
    paymentChoiceBlock: document.getElementById('paymentChoiceBlock'),
    paymentEditBlock: document.getElementById('paymentEditBlock'),
    paymentEditInstallment: document.getElementById('paymentEditInstallment'),
    paymentExtra: document.getElementById('paymentExtra'),
    paymentExtraToggle: document.getElementById('paymentExtraToggle'),
    paymentFreeAmount: document.getElementById('paymentFreeAmount'),
    paymentTotal: document.getElementById('paymentTotal'),
    resocontiYears: document.getElementById('resocontiYears'),
    resocontoDetail: document.getElementById('resocontoDetail'),
    resocontoCycle: document.getElementById('resocontoCycle'),
    resocontoAccount: document.getElementById('resocontoAccount'),
    resocontoRate: document.getElementById('resocontoRate'),
    resocontoMovements: document.getElementById('resocontoMovements'),
    dueVoice: document.getElementById('dueVoice'),
    dueFormTitle: document.getElementById('dueFormTitle'),
    dueSplitStep: document.getElementById('dueSplitStep'),
    dueRateStep: document.getElementById('dueRateStep'),
    dueFormPeriodLine: document.getElementById('dueFormPeriodLine'),
    dueRateCells: document.getElementById('dueRateCells'),
    dueRateRange: document.getElementById('dueRateRange'),
    dueRail: document.getElementById('dueRail'),
    consForm: document.getElementById('consForm'),
    consPeriod: document.getElementById('consPeriod'),
    consPeriodHint: document.getElementById('consPeriodHint'),
    consAmount: document.getElementById('consAmount'),
    consAmountLabel: document.getElementById('consAmountLabel'),
    consFormPeriodLine: document.getElementById('consFormPeriodLine'),
    consSettleOptions: document.getElementById('consSettleOptions'),
    consRail: document.getElementById('consRail'),
    consEditId: document.getElementById('consEditId'),
    consSubmitBtn: document.getElementById('consSubmitBtn'),
    consSubmitLabel: document.getElementById('consSubmitLabel'),
    consFormCancel: document.getElementById('consFormCancel'),
    ratePlanPeriod: document.getElementById('ratePlanPeriod'),
    ratePlanPeriodLine: document.getElementById('ratePlanPeriodLine'),
    ratePlanTargets: document.getElementById('ratePlanTargets'),
    ratePlanTable: document.getElementById('ratePlanTable'),
    ratePlanSummary: document.getElementById('ratePlanSummary'),
    ratePlanHint: document.getElementById('ratePlanHint'),
    ratePlanAdd: document.getElementById('ratePlanAdd'),
    ratePlanReset: document.getElementById('ratePlanReset'),
    ratePlanSave: document.getElementById('ratePlanSave'),
    sideHouseBtn: document.getElementById('sideHouseBtn'),
    sideLogoutBtn: document.getElementById('sideLogoutBtn'),
    sideAvatar: document.getElementById('sideAvatar'),
    sideAccountEmail: document.getElementById('sideAccountEmail'),
    panoramicaKpis: document.getElementById('panoramicaKpis'),
    panoramicaScopeNote: document.getElementById('panoramicaScopeNote'),
    panoramicaPeriodLinks: document.getElementById('panoramicaPeriodLinks'),
    panoramicaSituazioneLink: document.getElementById('panoramicaSituazioneLink'),
    currentHouseMeta: document.getElementById('currentHouseMeta'),
    deleteHouseBtn: document.getElementById('deleteHouseBtn'),
    periodFilter: document.getElementById('periodFilter'),
    dueForm: document.getElementById('dueForm'),
    paymentForm: document.getElementById('paymentForm'),
    houseForm: document.getElementById('houseForm'),
    houseImportParties: document.getElementById('houseImportParties'),
    houseImportPartiesFields: document.getElementById('houseImportPartiesFields'),
    fiscalStartMonth: document.getElementById('fiscalStartMonth'),
    exportBtn: document.getElementById('exportBtnAdv'),
    importFile: document.getElementById('importFileAdv'),
    bankImportFile: document.getElementById('bankImportFile'),
    bankImportConfirm: document.getElementById('bankImportConfirm'),
    bankImportPreview: document.getElementById('bankImportPreview'),
    bankImportBatches: document.getElementById('bankImportBatches'),
    bankImportDeleteAll: document.getElementById('bankImportDeleteAll'),
    unlinkedMovements: document.getElementById('unlinkedMovements'),
    duePeriod: document.getElementById('duePeriod'),
    duePeriodNew: document.getElementById('duePeriodNew'),
    duePeriodNewWrap: document.getElementById('duePeriodNewWrap'),
    duePeriodHint: document.getElementById('duePeriodHint'),
    paymentGuidePanel: document.getElementById('paymentGuidePanel'),
    houseDrawer: document.getElementById('houseDrawer'),
    houseDrawerBackdrop: document.getElementById('houseDrawerBackdrop'),
    houseDrawerList: document.getElementById('houseDrawerList'),
    openHouseDrawerBtn: document.getElementById('openHouseDrawerBtn'),
    houseDrawerClose: document.getElementById('houseDrawerClose'),
    houseDrawerAdd: document.getElementById('houseDrawerAdd'),
    dueEditId: document.getElementById('dueEditId'),
    dueSubmitBtn: document.getElementById('dueSubmitBtn'),
    dueFormCancel: document.getElementById('dueFormCancel'),
    paymentPeriod: document.getElementById('paymentPeriod'),
    paymentAmount: document.getElementById('paymentAmount'),
    paymentMethod: document.getElementById('paymentMethod'),
    paymentDate: document.getElementById('paymentDate'),
    paymentEditId: document.getElementById('paymentEditId'),
    paymentSubmitBtn: document.getElementById('paymentSubmitBtn'),
    paymentFormCancel: document.getElementById('paymentFormCancel'),
    paymentsTable: document.getElementById('paymentsTable'),
    paymentInstallment: document.getElementById('paymentInstallment'),
    paymentTarget: document.getElementById('paymentTarget'),
    paymentPriorBalanceId: document.getElementById('paymentPriorBalanceId'),
    paymentFilterPeriod: document.getElementById('paymentFilterPeriod'),
    paymentsSummary: document.getElementById('paymentsSummary'),
    situazionePeriod: document.getElementById('situazionePeriod'),
    situazionePdfBtn: document.getElementById('situazionePdfBtn'),
    dueSplitMode: document.getElementById('dueSplitMode'),
    dueKind: document.getElementById('dueKind'),
    navButtons: [...document.querySelectorAll('.nav-rail [data-view], .bottom-nav [data-view]')],
    subviewTabs: [...document.querySelectorAll('[data-subview]')],
    subviewPanels: [...document.querySelectorAll('[data-subview-panel]')],
    viewPanels: [...document.querySelectorAll('[data-view-panel]')],
    viewTitle: document.getElementById('viewTitle'),
    viewSubtitle: document.getElementById('viewSubtitle'),
    authStatus: document.getElementById('authStatus'),
    logoutBtn: document.getElementById('logoutBtn'),
    calendarFeedStatus: document.getElementById('calendarFeedStatus'),
    calendarFeedPreview: document.getElementById('calendarFeedPreview'),
    openCalendarWizardBtn: document.getElementById('openCalendarWizardBtn'),
    downloadCalendarIcsBtn: document.getElementById('downloadCalendarIcsBtn'),
    calendarWizardDialog: document.getElementById('calendarWizardDialog'),
    calendarWizardForm: document.getElementById('calendarWizardForm'),
    calendarWizardStepper: document.getElementById('calendarWizardStepper'),
    calendarLeadDays: document.getElementById('calendarLeadDays'),
    calendarWizardPreviewSummary: document.getElementById('calendarWizardPreviewSummary'),
    calendarWizardPreviewTable: document.getElementById('calendarWizardPreviewTable'),
    calendarWizardDownloadBtn: document.getElementById('calendarWizardDownloadBtn'),
    calendarWizardError: document.getElementById('calendarWizardError'),
    calendarWizardClose: document.getElementById('calendarWizardClose'),
    calendarWizardBack: document.getElementById('calendarWizardBack'),
    calendarWizardNext: document.getElementById('calendarWizardNext')
  };
}
