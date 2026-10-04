// Floating toolbar: Full Page, Full Width, Fit Left/Right/Top/Bottom, Capture.
// Lives inside the overlay root (above the dim panels, never blurred).

const ICONS = {
  fullPage: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  fullWidth: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  fitLeft: '<path d="M4 4v16M20 12H8M12 8l-4 4 4 4"/>',
  fitRight: '<path d="M20 4v16M4 12h12M12 8l4 4-4 4"/>',
  fitTop: '<path d="M4 4h16M12 20V8M8 12l4-4 4 4"/>',
  fitBottom: '<path d="M4 20h16M12 4v12M8 12l4 4 4-4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
};

function svg(paths) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const BUTTONS = [
  { id: 'full-page', label: 'Full Page', icon: ICONS.fullPage, title: 'Capture the entire page' },
  { id: 'full-width', label: 'Full Width', icon: ICONS.fullWidth, title: 'Stretch selection to the full page width' },
  { id: 'fit-left', label: 'Fit Left', icon: ICONS.fitLeft, title: 'Move left edge to the page edge' },
  { id: 'fit-right', label: 'Fit Right', icon: ICONS.fitRight, title: 'Move right edge to the page edge' },
  { id: 'fit-top', label: 'Fit Top', icon: ICONS.fitTop, title: 'Move top edge to the page top' },
  { id: 'fit-bottom', label: 'Fit Bottom', icon: ICONS.fitBottom, title: 'Move bottom edge to the page bottom' },
];

let selMod = null;

export async function attachToolbar(api) {
  if (!api.root) return;
  selMod = await import(chrome.runtime.getURL('content/selection.js'));

  const bar = api.el('div', 'toolbar no-select');
  bar.setAttribute('role', 'toolbar');
  for (const b of BUTTONS) {
    const btn = api.el('button', 'tb-btn');
    btn.type = 'button';
    btn.dataset.action = b.id;
    btn.title = b.title;
    btn.innerHTML = `${svg(b.icon)}<span>${b.label}</span>`;
    bar.appendChild(btn);
  }
  bar.appendChild(api.el('div', 'tb-divider'));
  const cap = api.el('button', 'tb-btn tb-capture');
  cap.type = 'button';
  cap.dataset.action = 'capture';
  cap.title = 'Capture (Enter)';
  cap.innerHTML = `${svg(ICONS.camera)}<span>Capture</span>`;
  bar.appendChild(cap);

  bar.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    runAction(api, btn.dataset.action);
  });

  api.root.appendChild(bar);
  api.onClose(() => bar.remove());
}

function currentOrViewport(api) {
  return api.getSelection() || {
    x: window.scrollX,
    y: window.scrollY,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function applyPreset(api, action) {
  const doc = selMod.docSize();
  let sel;
  switch (action) {
    case 'full-page':
      sel = { x: 0, y: 0, width: doc.width, height: doc.height };
      break;
    case 'full-width': {
      const s = currentOrViewport(api);
      sel = { x: 0, y: s.y, width: doc.width, height: s.height };
      break;
    }
    case 'fit-left': {
      const s = currentOrViewport(api);
      sel = { x: 0, y: s.y, width: s.x + s.width, height: s.height };
      break;
    }
    case 'fit-right': {
      const s = currentOrViewport(api);
      sel = { x: s.x, y: s.y, width: doc.width - s.x, height: s.height };
      break;
    }
    case 'fit-top': {
      const s = currentOrViewport(api);
      sel = { x: s.x, y: 0, width: s.width, height: s.y + s.height };
      break;
    }
    case 'fit-bottom': {
      const s = currentOrViewport(api);
      sel = { x: s.x, y: s.y, width: s.width, height: doc.height - s.y };
      break;
    }
    default:
      return;
  }
  api.setSelection(selMod.clampRect ? selMod.clampRect(sel) : sel);
  selMod.render?.();
}

function runAction(api, action) {
  if (action === 'capture') {
    api.capture();
    return;
  }
  applyPreset(api, action);
}
