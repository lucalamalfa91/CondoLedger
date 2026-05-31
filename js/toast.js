let container;

function ensureContainer() {
  if (container?.isConnected) return container;
  container = document.getElementById('toastHost');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastHost';
    container.className = 'toast-host';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} [variant]
 * @param {number} [ms]
 */
export function showToast(message, variant = 'success', ms = 4200) {
  const host = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast--${variant}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--visible'));
  const remove = () => {
    el.classList.remove('toast--visible');
    setTimeout(() => el.remove(), 280);
  };
  const timer = setTimeout(remove, ms);
  el.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
}

export function toastError(message) {
  showToast(message, 'error', 6000);
}
