// History — generic undo/redo stack (max 100 entries).
//
// Each entry is a command object: { label, undo(), redo() }. Modules push a
// command *after* applying its effect (push does NOT call redo()). Later
// modules (crop, annotations) all share editor.history so Ctrl+Z crosses
// feature boundaries in strict chronological order.
import { isEditable } from './canvas-view.js';

export const HISTORY_MAX = 100;

export class History {
  constructor(max = HISTORY_MAX) {
    this.max = max;
    this.undoStack = [];
    this.redoStack = [];
    this.onChange = null;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /** Record an already-applied command. Clears the redo stack. */
  push(cmd) {
    if (!cmd || typeof cmd.undo !== 'function' || typeof cmd.redo !== 'function') {
      throw new Error('History.push expects { undo, redo }');
    }
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.max) this.undoStack.shift();
    this.redoStack.length = 0;
    this.onChange?.(this);
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChange?.(this);
    return true;
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.redo();
    this.undoStack.push(cmd);
    this.onChange?.(this);
    return true;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.onChange?.(this);
  }
}

/**
 * Create editor.history, wire #btn-undo / #btn-redo and keyboard shortcuts
 * (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y). `editor.hooks.beforeHistory` may
 * veto (return false) — e.g. while a crop drag is in progress.
 */
export function initHistory(editor) {
  const history = new History();
  editor.history = history;
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');

  const sync = () => {
    if (undoBtn) undoBtn.disabled = !history.canUndo;
    if (redoBtn) redoBtn.disabled = !history.canRedo;
  };
  history.onChange = sync;
  sync();

  const guarded = (fn) => () => {
    if (editor.hooks.beforeHistory && editor.hooks.beforeHistory() === false) return;
    fn();
  };
  const undo = guarded(() => history.undo());
  const redo = guarded(() => history.redo());
  undoBtn?.addEventListener('click', undo);
  redoBtn?.addEventListener('click', redo);

  window.addEventListener('keydown', (e) => {
    if (isEditable(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { redo(); e.preventDefault(); }
  });
  return history;
}
