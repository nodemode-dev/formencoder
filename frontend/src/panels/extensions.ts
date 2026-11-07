import type { Ctx } from '../app/ctx';
import type { Panel } from '../ui/dock';
import { el, patchList, q, setClass, setDisabled, setHidden, setText, setTitle } from '../ui/dom';
import { icon } from '../ui/icons';
import { contextMenu } from '../ui/popup';
import { sourceLabel, type Extensions, type RowState } from '../ext/extensions';
import type { ExtensionRecord, Permission } from '../ext/host-bridge';

const STATE_LABEL: Record<RowState, string> = { ready: 'Ready', 'needs-permission': 'Needs Permission', refused: 'Refused' };
const CHIP: Record<string, string> = { document: 'Document', 'files-read': 'Open Files', 'files-write': 'Save Files', network: 'Network', models: 'Models', 'native-code': 'Native Code' };

export class ExtensionsPanel implements Panel {
  readonly id = 'extensions';
  readonly title = 'Extensions';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;

  constructor(private readonly ctx: Ctx, private readonly exts: Extensions) {
    this.el = el(`<div class="fe-ext">
      <div class="fe-bar">
        <span class="fe-ext-count"></span>
        <span class="fx-flex"></span>
        <button class="cv-icon-btn" type="button" data-a="reload" title="Reload Extensions" data-automation-id="extensions.reload">${icon('refresh', 15)}</button>
        <button class="cv-btn cv-btn-ghost fe-ext-manage" type="button" data-a="manage">Manage in FormPortal</button>
      </div>
      <div class="fe-ext-list" data-automation-id="extensions.list"></div>
      <div class="fe-ext-empty" hidden data-automation-id="extensions.empty">
        <p class="fx-note">No extensions yet. Find them in FormPortal or make one with form.ext.</p>
        <button class="cv-btn cv-btn-primary" type="button" data-a="manage">Manage in FormPortal</button>
      </div>
      <div class="fe-ext-foot"><span class="fe-ext-root"></span><span class="fe-ext-plugins"></span></div>
    </div>`);
    this.list = q(this.el, '.fe-ext-list');
    this.empty = q(this.el, '.fe-ext-empty');
    q(this.el, '[data-a="reload"]').addEventListener('click', () => void this.exts.refresh(true));
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-a="manage"]'))) b.addEventListener('click', () => this.exts.openManage());
    exts.events.on('list', () => this.paint());
    exts.events.on('grants', () => this.paint());
    ctx.client.events.on('open', () => void this.plugins());
    this.paint();
    void this.plugins();
  }

  shown(): void {
    this.paint();
  }

  private async plugins(): Promise<void> {
    const r = await this.ctx.run<{ plugins?: unknown[] }>('plugin.list', {}, true);
    const n = r?.plugins?.length ?? 0;
    setText(q(this.el, '.fe-ext-plugins'), n ? `${n} process plug-in${n === 1 ? '' : 's'} (plugin.list)` : '');
  }

  private paint(): void {
    const rows = this.exts.list;
    setText(q(this.el, '.fe-ext-count'), this.exts.loaded ? `${rows.length} extension${rows.length === 1 ? '' : 's'}` : 'Reading extensions');
    setHidden(this.empty, !this.exts.loaded || rows.length > 0);
    setHidden(this.list, rows.length === 0);
    const root = q(this.el, '.fe-ext-root');
    setText(root, this.exts.root ? `FormPortal folder: ${this.exts.root}` : '');
    setTitle(root, this.exts.root);
    patchList(this.list, rows, {
      key: (x) => x.id,
      create: (x) => this.row(x),
      update: (n, x) => this.update(n, x),
    });
  }

  private row(x: ExtensionRecord): HTMLElement {
    const n = el(`<div class="fe-ext-row">
      <div class="fe-ext-head"><span class="fe-ext-name"></span><span class="fe-ext-state"></span></div>
      <div class="fe-ext-meta"><span class="fe-ext-ver"></span><span class="fe-ext-src"></span></div>
      <div class="fe-ext-desc"></div>
      <div class="fe-ext-chips"></div>
      <div class="fe-ext-reason"></div>
      <div class="fe-ext-path"></div>
      <div class="fe-ext-actions"><button class="cv-btn" type="button" data-a="open">Open</button><button class="cv-btn cv-btn-ghost" type="button" data-a="grant">Allow</button></div>
    </div>`);
    n.dataset.automationId = `extensions.row.${x.id}`;
    q(n, '[data-a="open"]').addEventListener('click', (e) => {
      const cur = this.exts.find(n.dataset.key ?? '');
      if (!cur || !cur.panels.length) return;
      if (cur.panels.length === 1) {
        void this.exts.openPanel(cur, cur.panels[0].id);
        return;
      }
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      contextMenu(r.left, r.bottom + 4, cur.panels.map((p) => ({ label: p.title, run: () => void this.exts.openPanel(cur, p.id) })));
    });
    q(n, '[data-a="grant"]').addEventListener('click', () => {
      const cur = this.exts.find(n.dataset.key ?? '');
      if (!cur) return;
      if (this.exts.state(cur) === 'ready') this.exts.forget(cur);
      else void this.exts.allow(cur);
    });
    return n;
  }

  private update(n: HTMLElement, x: ExtensionRecord): void {
    const state = this.exts.state(x);
    setText(q(n, '.fe-ext-name'), x.name);
    setText(q(n, '.fe-ext-ver'), x.version);
    setText(q(n, '.fe-ext-src'), sourceLabel(x.source));
    const st = q(n, '.fe-ext-state');
    setText(st, STATE_LABEL[state]);
    for (const s of Object.keys(STATE_LABEL)) setClass(st, `is-${s}`, s === state);
    const desc = q(n, '.fe-ext-desc');
    setText(desc, x.description ?? '');
    setHidden(desc, !x.description);
    const chips = q(n, '.fe-ext-chips');
    patchList(chips, x.permissions, {
      key: (p: Permission) => p,
      create: () => el('<span class="fe-ext-chip"></span>'),
      update: (c, p) => setText(c, CHIP[p] ?? p),
    });
    setHidden(chips, x.permissions.length === 0);
    const reason = q(n, '.fe-ext-reason');
    setText(reason, x.reason ? `Refused: ${x.reason}` : '');
    setHidden(reason, !x.reason);
    const path = q(n, '.fe-ext-path');
    setText(path, x.source === 'development' && x.path ? x.path : '');
    setTitle(path, x.path ?? '');
    setHidden(path, !(x.source === 'development' && x.path));
    const open = q<HTMLButtonElement>(n, '[data-a="open"]');
    setDisabled(open, state === 'refused' || x.panels.length === 0);
    setTitle(open, x.panels.length ? x.panels.map((p) => p.title).join(', ') : 'This extension has no panel; its commands are in the Extensions menu');
    const grant = q<HTMLButtonElement>(n, '[data-a="grant"]');
    setText(grant, state === 'ready' && x.permissions.length ? 'Forget Permission' : 'Allow');
    setHidden(grant, state === 'refused' || x.permissions.length === 0);
    setClass(n, 'is-refused', state === 'refused');
  }
}
