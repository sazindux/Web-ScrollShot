// Small shared UI helpers for the editor: dropdown menus and toasts.

/** Make every `.dropdown` open/close on its `.dropdown-toggle`; close on outside click / Esc / item click. */
export function initDropdowns() {
  const closeAll = (except) => {
    document.querySelectorAll('.dropdown.open').forEach((d) => { if (d !== except) d.classList.remove('open'); });
  };
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.dropdown-toggle');
    if (toggle) {
      const dd = toggle.closest('.dropdown');
      const willOpen = !dd.classList.contains('open');
      closeAll(dd);
      dd.classList.toggle('open', willOpen);
      return;
    }
    const inMenu = e.target.closest('.dropdown-menu');
    if (inMenu) { closeAll(); return; }   // item clicked → close
    closeAll();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
}

let toastTimer = null;
/** Show a transient message at the bottom of the editor. */
export function showToast(text, { error = false, duration = 1800 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  el.classList.toggle('error', error);
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 200);
  }, duration);
}
