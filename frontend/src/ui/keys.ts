import type { Ctx } from '../app/ctx';
import { anyDialogOpen } from './dialogs';
import { isMac } from './dom';

export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (isMac && e.ctrlKey) parts.push('Ctrl');
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Cmd');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let k = e.key;
  if (e.code.startsWith('Key')) k = e.code.slice(3);
  else if (e.code.startsWith('Digit')) k = e.code.slice(5);
  else if (k === ' ') k = 'Space';
  else if (k.length === 1) k = k.toUpperCase();
  if (['Meta', 'Control', 'Alt', 'Shift', 'OS'].includes(k)) return '';
  parts.push(k);
  return parts.join('+');
}

export class Keys {
  private table = new Map<string, string>();
  handlers: { palette: () => void; maximize: () => void; focused: () => string } | null = null;

  constructor(private readonly ctx: Ctx) {
    ctx.ui.on('specs', () => this.load());
    window.addEventListener('keydown', (e) => this.down(e));
  }

  load(): void {
    this.table.clear();
    for (const s of this.ctx.specs.values()) {
      if (!s.shortcut) continue;
      const parts = s.shortcut.split('+');
      const key = parts.pop() as string;
      const combo = [...parts, key.length === 1 ? key.toUpperCase() : key].join('+');
      if (!this.table.has(combo)) this.table.set(combo, s.id);
    }
    this.table.set('Backspace', 'queue.remove');
  }

  shortcutFor(command: string): string {
    for (const [k, id] of this.table) if (id === command && k !== 'Backspace') return k;
    return '';
  }

  private down(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return;
    if (t?.closest?.('.fx-term-host, .xterm')) return;
    if (anyDialogOpen() || document.querySelector('.cv-menu:not([hidden])') || document.querySelector('.fx-palette-scrim:not([hidden])')) return;
    const combo = comboOf(e);
    if (!combo) return;
    if ((combo === 'Cmd+K' || combo === 'Cmd+Shift+P') && this.handlers) {
      e.preventDefault();
      this.handlers.palette();
      return;
    }
    if (combo === '`' || combo === 'Backquote') {
      e.preventDefault();
      this.handlers?.maximize();
      return;
    }
    const id = this.table.get(combo);
    if (!id) return;
    if ((id === 'queue.remove' || id === 'queue.start' || id === 'queue.stop') && this.handlers && !['queue', 'encoding', 'watch'].includes(this.handlers.focused())) return;
    e.preventDefault();
    void this.ctx.invoke(id);
  }
}
