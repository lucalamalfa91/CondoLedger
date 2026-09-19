import { STORAGE_KEY } from './config.js';
import { loadFromSupabase } from './api.js';
import { request, setUnauthorizedHandler } from './http.js';
import { state } from './state.js';
import { toastError } from './toast.js';
import { clearUrlSearch, sanitizeLocationUrl } from './url-sanitize.js';

async function loadHouseData() {
  try {
    await loadFromSupabase();
    state.houseDataLoadError = null;
  } catch (err) {
    state.houseDataLoadError = err.message || 'Impossibile caricare i dati.';
    toastError(state.houseDataLoadError);
  }
}

export function createAuthHandlers(els, { setView, render, setTheme }) {
  function setStatus(message) {
    els.authStatus.textContent = message;
    els.userChip.title = message;
    if (els.sideAccountEmail) els.sideAccountEmail.textContent = state.user?.email || 'Password, backup, calendario';
    if (els.sideAvatar) els.sideAvatar.textContent = (state.user?.email || '?').trim().charAt(0).toUpperCase();
  }

  function showAuthMessage(el, message) {
    if (!message) { el.textContent = ''; el.classList.add('hidden'); return; }
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function showLoginError(message) { showAuthMessage(els.loginError, message); }
  function showRecoveryError(message) { showAuthMessage(els.recoveryError, message); }
  function showRecoverySuccess(message) { showAuthMessage(els.recoverySuccess, message); }
  function showAccountPasswordError(message) { showAuthMessage(els.accountPasswordError, message); }
  function showAccountPasswordSuccess(message) { showAuthMessage(els.accountPasswordSuccess, message); }

  function clearAuthParamsFromUrl() {
    sanitizeLocationUrl();
    clearUrlSearch();
  }

  function validatePasswordPair(password, confirm) {
    if (password.length < 6) throw new Error('La password deve avere almeno 6 caratteri');
    if (password !== confirm) throw new Error('Le password non coincidono');
  }

  async function applyNewPassword(password, confirm) {
    validatePasswordPair(password, confirm);
    await request('POST', '/api/auth/password', { password });
  }

  function renderAccountView() {
    els.accountEmail.textContent = state.user?.email || '—';
  }

  /**
   * Il recupero password via link email non esiste più: non c'è un servizio SMTP e la
   * reimpostazione si fa da CLI sul server (`npm run set-password`). La schermata resta nel
   * markup ma non viene mai attivata; il cambio password da Impostazioni → Account continua
   * a funzionare identico.
   */
  function showRecoveryUI(show) {
    state.recoveryMode = show;
    els.recoveryScreen.classList.toggle('hidden', !show);
    els.loginScreen.classList.toggle('hidden', show);
    els.appShell.classList.add('hidden');
    document.body.classList.toggle('authenticated', false);
  }

  function setLoginLoading(isLoading) {
    els.loginSubmitBtn.disabled = isLoading;
    els.loginSubmitBtn.textContent = isLoading ? 'Accesso in corso...' : 'Accedi';
    els.loginEmail.disabled = isLoading;
    els.loginPassword.disabled = isLoading;
  }

  function setRecoveryLoading(isLoading) {
    els.recoverySubmitBtn.disabled = isLoading;
    els.recoverySubmitBtn.textContent = isLoading ? 'Salvataggio...' : 'Salva nuova password';
    els.recoveryPassword.disabled = isLoading;
    els.recoveryPasswordConfirm.disabled = isLoading;
  }

  function setAccountPasswordLoading(isLoading) {
    els.accountPasswordSubmitBtn.disabled = isLoading;
    els.accountPasswordSubmitBtn.textContent = isLoading ? 'Salvataggio...' : 'Salva password';
    els.accountPassword.disabled = isLoading;
    els.accountPasswordConfirm.disabled = isLoading;
  }

  function setAuthUI(isAuthenticated) {
    if (state.recoveryMode) return;
    els.loginScreen.classList.toggle('hidden', isAuthenticated);
    els.recoveryScreen.classList.add('hidden');
    els.appShell.classList.toggle('hidden', !isAuthenticated);
    document.body.classList.toggle('authenticated', isAuthenticated);
  }

  function loadStoredConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (stored.email) els.loginEmail.value = stored.email;
    } catch { /* ignore */ }
  }

  function saveStoredConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: els.loginEmail.value.trim() }));
  }

  function resetToLoggedOut() {
    state.user = null;
    state.recoveryMode = false;
    state.data = { houses: [] };
    state.selectedHouseId = null;
    setAuthUI(false);
  }

  async function restoreSession() {
    const data = await request('GET', '/api/auth/session');
    state.user = data?.user ?? null;
    if (state.user) {
      setStatus(state.user.email);
      setAuthUI(true);
      await loadHouseData();
      clearAuthParamsFromUrl();
      return true;
    }
    setAuthUI(false);
    return false;
  }

  async function signIn(event) {
    event.preventDefault();
    showLoginError('');
    setLoginLoading(true);
    try {
      const email = els.loginEmail.value.trim();
      const password = els.loginPassword.value;
      if (!email || !password) throw new Error('Inserisci email e password');

      const data = await request('POST', '/api/auth/login', { email, password });
      state.user = data.user;
      saveStoredConfig();
      els.loginPassword.value = '';
      clearAuthParamsFromUrl();
      setStatus(state.user.email);
      setAuthUI(true);
      setView('panoramica');
      await loadHouseData();
      render();
    } catch (err) {
      showLoginError(err.message || 'Credenziali non valide');
    } finally {
      setLoginLoading(false);
    }
  }

  async function logout() {
    try {
      await request('POST', '/api/auth/logout');
    } catch { /* la sessione va comunque chiusa lato client */ }
    resetToLoggedOut();
    showLoginError('');
    render();
  }

  async function updatePasswordFromRecovery(event) {
    event.preventDefault();
    showRecoveryError('');
    showRecoverySuccess('');
    setRecoveryLoading(true);
    try {
      await applyNewPassword(els.recoveryPassword.value, els.recoveryPasswordConfirm.value);
      state.recoveryMode = false;
      clearAuthParamsFromUrl();
      showRecoverySuccess('Password aggiornata.');
      if (state.user) {
        setStatus(state.user.email);
        setAuthUI(true);
        setView('impostazioni', 'account');
        renderAccountView();
        await loadHouseData();
        render();
      }
    } catch (err) {
      showRecoveryError(err.message || 'Impossibile aggiornare la password');
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function updatePasswordFromAccount(event) {
    event.preventDefault();
    showAccountPasswordError('');
    showAccountPasswordSuccess('');
    setAccountPasswordLoading(true);
    try {
      if (!state.user) throw new Error('Devi essere connesso');
      await applyNewPassword(els.accountPassword.value, els.accountPasswordConfirm.value);
      els.accountPasswordForm.reset();
      showAccountPasswordSuccess('Password aggiornata con successo.');
    } catch (err) {
      showAccountPasswordError(err.message || 'Impossibile aggiornare la password');
    } finally {
      setAccountPasswordLoading(false);
    }
  }

  /**
   * Sostituisce supabase.auth.onAuthStateChange. Senza un evento di sessione, la scadenza
   * si scopre alla prima richiesta che risponde 401: la reazione è la stessa che aveva il
   * ramo SIGNED_OUT — svuota lo stato e riporta alla schermata di accesso.
   */
  function bindAuthStateChange() {
    setUnauthorizedHandler(() => {
      if (!state.user) return;
      resetToLoggedOut();
      render();
    });
  }

  return {
    loadStoredConfig,
    setTheme,
    setAuthUI,
    showRecoveryUI,
    restoreSession,
    bindAuthStateChange,
    signIn,
    logout,
    updatePasswordFromRecovery,
    updatePasswordFromAccount,
    renderAccountView,
    retryLoadHouseData: () => loadHouseData().then(render),
    setLoginLoading,
    setStatus
  };
}
