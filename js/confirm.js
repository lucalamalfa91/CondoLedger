/**
 * Dialog di conferma non bloccante (sostituto di confirm() per flussi critici).
 */
export function confirmDialog(message, { title = 'Conferma', confirmLabel = 'Conferma', danger = false } = {}) {
  return new Promise(resolve => {
    const dlg = document.getElementById('confirmDialog');
    if (!dlg) {
      resolve(window.confirm(message));
      return;
    }
    const titleEl = document.getElementById('confirmDialogTitle');
    const bodyEl = document.getElementById('confirmDialogBody');
    const okBtn = document.getElementById('confirmDialogOk');
    const cancelBtn = document.getElementById('confirmDialogCancel');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = message;
    if (okBtn) {
      okBtn.textContent = confirmLabel;
      okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    }

    const cleanup = result => {
      dlg.close();
      okBtn?.removeEventListener('click', onOk);
      cancelBtn?.removeEventListener('click', onCancel);
      dlg.removeEventListener('cancel', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    okBtn?.addEventListener('click', onOk);
    cancelBtn?.addEventListener('click', onCancel);
    dlg.addEventListener('cancel', onCancel);
    dlg.showModal();
  });
}
