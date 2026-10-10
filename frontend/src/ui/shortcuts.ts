import type { Ctx } from '../app/ctx';
import { confirmAction, Dialog } from './dialogs';
import { el, q, setClass, setHidden, setText } from './dom';
import { comboOf } from './keys';
import { keyLabel } from './popup';
import { toast } from './toast';

interface Row {
  id: string;
  label: string;
  menu: string;
  shortcut: string;
  default: string;
  changed: boolean;
}

export class ShortcutEditor {
  private dialog: Dialog | null = null;
  private capturing: { id: string; btn: HTMLButtonElement } | null = null;

  constructor(private readonly ctx: Ctx) {}

  async open(): Promise<void> {
    const r = await this.ctx.run<{ shortcuts: Row[]; reserved: string[] }>('shortcuts.list', {}, true);
    if (!r) return;
    if (!this.dialog) this.build(r.shortcuts);
    this.paint(r.shortcuts);
    this.dialog!.open(q<HTMLInputElement>(this.dialog!.body, '.fe-sc-filter'));
  }

  private build(rows: Row[]): void {
    const d = new Dialog('Keyboard Shortcuts', 720);
    this.dialog = d;
    const body = el('<div class="fe-sc"><input class="cv-input fe-sc-filter" type="search" placeholder="Find a command" spellcheck="false"><p class="fx-note">Click a shortcut, then press the new keys. Delete or Backspace removes it, Escape cancels.</p><div class="fe-sc-list"></div></div>');
    const list = q(body, '.fe-sc-list');
    let menu = '';
    const order = [...new Set(rows.map((r) => r.menu))];
    const sorted = [...rows].sort((a, b) => order.indexOf(a.menu) - order.indexOf(b.menu));
    for (const row of sorted) {
      if (row.menu !== menu) {
        menu = row.menu;
        const head = el('<div class="fx-prefs-section fe-sc-menu"></div>');
        head.dataset.menu = menu;
        setText(head, menu);
        list.appendChild(head);
      }
      const n = el(`<div class="fe-sc-row"><span class="fe-sc-label"></span><button class="cv-btn fe-sc-key" type="button"></button><button class="cv-btn cv-btn-ghost fe-sc-reset" type="button">Default</button></div>`);
      n.dataset.id = row.id;
      n.dataset.menu = row.menu;
      setText(q(n, '.fe-sc-label'), row.label);
      const btn = q<HTMLButtonElement>(n, '.fe-sc-key');
      btn.addEventListener('click', () => this.capture(row.id, btn));
      q(n, '.fe-sc-reset').addEventListener('click', () => void this.set(row.id, null));
      list.appendChild(n);
    }
    const filter = q<HTMLInputElement>(body, '.fe-sc-filter');
    filter.addEventListener('input', () => {
      const t = filter.value.trim().toLowerCase();
      for (const n of Array.from(list.querySelectorAll<HTMLElement>('.fe-sc-row'))) setHidden(n, !!t && !(`${n.dataset.menu} ${q(n, '.fe-sc-label').textContent} ${n.dataset.id}`.toLowerCase().includes(t)));
      for (const h of Array.from(list.querySelectorAll<HTMLElement>('.fe-sc-menu'))) setHidden(h, !Array.from(list.querySelectorAll<HTMLElement>(`.fe-sc-row[data-menu="${h.dataset.menu}"]`)).some((x) => !x.hidden));
    });
    body.addEventListener('keydown', (e) => this.key(e), true);
    d.body.appendChild(body);
    const reset = d.button('Reset All', 'ghost', async () => {
      if (!(await confirmAction('Reset Keyboard Shortcuts', 'Put every shortcut back to its default?', 'Reset'))) return;
      await this.ctx.run('shortcuts.reset');
      await this.refresh();
    });
    reset.classList.add('cv-btn-apart');
    d.button('Done', 'primary', () => d.close());
    d.onClose = () => this.stop();
  }

  private paint(rows: Row[]): void {
    const body = this.dialog?.body;
    if (!body) return;
    for (const row of rows) {
      const n = body.querySelector<HTMLElement>(`.fe-sc-row[data-id="${row.id}"]`);
      if (!n) continue;
      setText(q(n, '.fe-sc-key'), row.shortcut ? keyLabel(row.shortcut) : 'None');
      setClass(n, 'is-changed', row.changed);
      q<HTMLButtonElement>(n, '.fe-sc-reset').disabled = !row.changed;
    }
  }

  private async refresh(): Promise<void> {
    const r = await this.ctx.run<{ shortcuts: Row[] }>('shortcuts.list', {}, true);
    if (r) this.paint(r.shortcuts);
    await this.ctx.loadSpecs();
    this.ctx.ui.emit('specs', undefined);
  }

  private capture(id: string, btn: HTMLButtonElement): void {
    this.stop();
    this.capturing = { id, btn };
    setClass(btn, 'is-capturing', true);
    setText(btn, 'Press keys');
  }

  private stop(): void {
    if (!this.capturing) return;
    setClass(this.capturing.btn, 'is-capturing', false);
    this.capturing = null;
    void this.refresh();
  }

  private key(e: KeyboardEvent): void {
    if (!this.capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      this.stop();
      return;
    }
    const { id, btn } = this.capturing;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      this.capturing = null;
      setClass(btn, 'is-capturing', false);
      void this.set(id, '');
      return;
    }
    const combo = comboOf(e);
    if (!combo) return;
    this.capturing = null;
    setClass(btn, 'is-capturing', false);
    void this.set(id, combo);
  }

  private async set(id: string, shortcut: string | null, force = false): Promise<void> {
    try {
      await this.ctx.client.call('command.execute', { command: 'shortcuts.set', params: { command: id, shortcut, force } });
    } catch (e) {
      const msg = (e as Error).message;
      if (!force && /already runs/.test(msg) && (await confirmAction('Shortcut in Use', `${msg.replace(/; pass force to move it$/, '')}. Move it to this command?`, 'Move'))) {
        await this.set(id, shortcut, true);
        return;
      }
      if (!/already runs/.test(msg)) toast(msg, 'error');
    }
    await this.refresh();
  }
}
