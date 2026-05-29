import { STORAGE_KEY } from './config.js';
import { loadFromSupabase } from './api.js';
import { state } from './state.js';

export function createAuthHandlers(els, { setView, render, setTheme }) {
  function setStatus(message) {
    els.authStatus.textContent = message;
    els.userChip.title = message;
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

  function isRecoveryUrl() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    return hash.get('type') === 'recovery' || query.get('type') === 'recovery';
  }

  function clearAuthParamsFromUrl() {
    if (!window.location.hash && !window.location.search) return;
    history.replaceState(null, '', window.location.pathname);
  }

  function validatePasswordPair(password, confirm) {
    if (password.length < 6) throw new Error('La password deve avere almeno 6 caratteri');
    if (password !== confirm) throw new Error('Le password non coincidono');
  }

  async function applyNewPassword(password, confirm) {
    validatePasswordPair(password, confirm);
    const { error } = await state.supabase.auth.updateUser({ password });
    if (error) throw error;
  }

  function renderAccountView() {
    els.accountEmail.textContent = state.user?.email || '—';
  }

  function showRecoveryUI(show) {
    state.recoveryMode = show;
    els.recoveryScreen.classList.toggle('hidden', !show);
    els.loginScreen.classList.toggle('hidden', show);
    els.appShell.classList.add('hidden');
    document.body.classList.toggle('authenticated', false);
    if (show) {
      showRecoveryError('');
      showRecoverySuccess('');
      els.recoveryForm.reset();
      els.recoverySubtitle.textContent = state.user?.email
        ? `Account: ${state.user.email}`
        : 'Scegli una password sicura per il tuo account';
    }
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

  async function handleAuthCallbackError() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const errorMessage = hash.get('error_description') || query.get('error_description') || hash.get('error') || query.get('error');
    if (!errorMessage) return false;
    showLoginError(decodeURIComponent(errorMessage.replace(/\+/g, ' ')));
    clearAuthParamsFromUrl();
    setAuthUI(false);
    return true;
  }

  async function restoreSession() {
    if (!state.supabase) return false;
    const { data, error } = await state.supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user) {
      state.user = data.session.user;
      if (isRecoveryUrl()) {
        showRecoveryUI(true);
        clearAuthParamsFromUrl();
        return 'recovery';
      }
      setStatus(state.user.email);
      setAuthUI(true);
      await loadFromSupabase();
      clearAuthParamsFromUrl();
      return true;
    }
    state.user = null;
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
      const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      state.user = data.user;
      saveStoredConfig();
      els.loginPassword.value = '';
      setStatus(state.user.email);
      setAuthUI(true);
      setView('panoramica');
      await loadFromSupabase();
      render();
    } catch (err) {
      showLoginError(err.message || 'Credenziali non valide');
    } finally {
      setLoginLoading(false);
    }
  }

  async function logout() {
    if (!state.supabase) return;
    await state.supabase.auth.signOut();
    state.user = null;
    state.recoveryMode = false;
    state.data = { houses: [] };
    state.selectedHouseId = null;
    setAuthUI(false);
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
      showRecoverySuccess('Password aggiornata. Accesso in corso...');
      const { data: sessionData } = await state.supabase.auth.getSession();
      state.user = sessionData.session?.user || state.user;
      if (state.user) {
        setStatus(state.user.email);
        setAuthUI(true);
        setView('impostazioni', 'account');
        renderAccountView();
        await loadFromSupabase();
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

  function scheduleLoadFromSupabase() {
    queueMicrotask(() => { void loadFromSupabase().then(render); });
  }

  function bindAuthStateChange() {
    state.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        state.user = session?.user ?? null;
        showRecoveryUI(true);
        clearAuthParamsFromUrl();
        return;
      }
      if (state.recoveryMode) return;
      if (event === 'INITIAL_SESSION') return;

      state.user = session?.user ?? null;
      if (state.user) {
        setStatus(state.user.email);
        setAuthUI(true);
        scheduleLoadFromSupabase();
      } else {
        state.data = { houses: [] };
        state.selectedHouseId = null;
        setAuthUI(false);
        render();
      }
    });
  }

  return {
    loadStoredConfig,
    setTheme,
    setAuthUI,
    showRecoveryUI,
    handleAuthCallbackError,
    restoreSession,
    bindAuthStateChange,
    signIn,
    logout,
    updatePasswordFromRecovery,
    updatePasswordFromAccount,
    renderAccountView,
    setLoginLoading,
    setStatus
  };
}
