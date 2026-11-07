import type { Ctx } from '../app/ctx';
import { el, setClass } from './dom';
import { closeAllMenus, PopupMenu, type PopupEntry } from './popup';

interface MenuRow {
  id: string;
  label: string;
  shortcut: string;
}

export interface MenuExtras {
  before?: Record<string, PopupEntry[]>;
  after?: Record<string, () => PopupEntry[]>;
}

const ORDER = ['File', 'Edit', 'Queue', 'Preset', 'Watch', 'Effects', 'Extensions', 'Window', 'Help'];
const HIDDEN = new Set([
  'family.resolved', 'publish.result', 'queue.select', 'family.queue', 'settings.apply', 'ui.toast', 'ui.panel', 'ui.workspace',
  'ui.exportSettings', 'queue.getSettings', 'history.list', 'queue.list', 'encode.status', 'preset.list', 'watch.list', 'media.browse',
  'media.roots', 'format.list', 'format.describe', 'app.status', 'queue.setFormat', 'watch.setOutput', 'watch.removeOutput', 'watch.setActive',
  'watch.remove', 'watch.addOutput', 'queue.reorder', 'preset.get', 'preset.update', 'preset.delete', 'preset.alias', 'log.clear',
]);
const GROUPS: Record<string, string[][]> = {
  File: [['queue.addSource', 'queue.addFolder', 'queue.stitch'], ['watch.add', 'ingest.copy', 'proxy.create', 'analyze.media'], ['queue.open', 'queue.save'], ['media.probe', 'captions.convert'], ['log.read']],
  Edit: [['edit.undo', 'edit.redo'], ['queue.duplicate', 'queue.remove', 'queue.skip', 'queue.resetStatus'], ['queue.setSettings'], ['prefs.get', 'prefs.reset']],
  Queue: [['queue.start', 'queue.pause', 'queue.stop', 'queue.stopCurrent'], ['queue.autoEncodeWatch'], ['queue.addOutput', 'queue.setOutput', 'queue.setRange', 'queue.interpret'], ['encode.estimate', 'encode.command', 'encode.verify', 'encode.report'], ['queue.clearDone']],
  Preset: [['queue.setPreset'], ['preset.create', 'preset.duplicate', 'preset.newGroup'], ['preset.import', 'preset.export', 'preset.reveal']],
  Watch: [['watch.scan']],
  Effects: [['lut.list', 'lut.install']],
  Extensions: [],
  Window: [],
  Help: [['app.capabilities']],
};

export class MenuBar {
  readonly el: HTMLElement;
  private readonly menus = new Map<string, { btn: HTMLButtonElement; menu: PopupMenu }>();
  private rows: Record<string, MenuRow[]> = {};
  private open: string | null = null;

  constructor(private readonly ctx: Ctx, private readonly extras: MenuExtras, private readonly shortcut: (id: string) => string) {
    this.el = el('<nav class="cv-menubar" role="menubar" data-automation-id="menubar"></nav>');
    for (const t of ORDER) {
      const btn = el<HTMLButtonElement>('<button class="cv-menu-btn" type="button" aria-haspopup="menu"></button>');
      btn.textContent = t;
      btn.dataset.automationId = `menu.${t.toLowerCase()}`;
      const menu = new PopupMenu();
      menu.onClose = () => {
        if (this.open === t) {
          this.open = null;
          setClass(btn, 'is-open', false);
        }
      };
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (this.open === t) this.close();
        else this.show(t);
      });
      btn.addEventListener('pointerenter', () => {
        if (this.open && this.open !== t) this.show(t);
      });
      this.el.appendChild(btn);
      this.menus.set(t, { btn, menu });
    }
    ctx.client.events.on('open', () => void this.load());
    window.addEventListener('blur', () => this.close());
  }

  private async load(): Promise<void> {
    try {
      this.rows = await this.ctx.client.call<Record<string, MenuRow[]>>('menu.bar');
    } catch {
      this.rows = {};
    }
  }

  private entries(title: string): PopupEntry[] {
    const all = new Map<string, MenuRow>();
    for (const rows of Object.values(this.rows)) for (const r of rows) all.set(r.id, r);
    const used = new Set<string>();
    const out: PopupEntry[] = [];
    const item = (r: MenuRow): PopupEntry => ({ label: r.label, shortcut: this.shortcut(r.id) || r.shortcut, id: `menu.cmd.${r.id}`, run: () => void this.ctx.invoke(r.id) });
    for (const group of GROUPS[title] ?? []) {
      const rows = group.map((id) => all.get(id)).filter((r): r is MenuRow => !!r);
      if (!rows.length) continue;
      if (out.length) out.push('-');
      for (const r of rows) {
        used.add(r.id);
        out.push(item(r));
      }
    }
    const rest = (this.rows[title] ?? []).filter((r) => !used.has(r.id) && !HIDDEN.has(r.id) && !Object.values(GROUPS).some((gs) => gs.some((g) => g.includes(r.id))));
    if (rest.length) {
      if (out.length) out.push('-');
      for (const r of rest) out.push(item(r));
    }
    return out;
  }

  show(title: string): void {
    const m = this.menus.get(title);
    if (!m) return;
    closeAllMenus();
    this.open = title;
    setClass(m.btn, 'is-open', true);
    const before = this.extras.before?.[title] ?? [];
    const after = this.extras.after?.[title]?.() ?? [];
    const body = this.entries(title);
    const items: PopupEntry[] = [...before, ...(before.length && body.length ? ['-' as const] : []), ...body, ...(after.length && body.length ? ['-' as const] : []), ...after];
    m.menu.setItems(items.length ? items : [{ label: 'The engine is not answering', enabled: false }]);
    const r = m.btn.getBoundingClientRect();
    m.menu.openAt(r.left, r.bottom + 4);
  }

  close(): void {
    if (!this.open) return;
    const m = this.menus.get(this.open);
    this.open = null;
    if (m) {
      setClass(m.btn, 'is-open', false);
      m.menu.close();
    }
  }
}
