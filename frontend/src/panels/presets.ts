import type { Ctx } from '../app/ctx';
import type { PresetRow } from '../engine/types';
import { groupPresets } from '../ui/choosers';
import { confirmAction, promptName } from '../ui/dialogs';
import type { Panel } from '../ui/dock';
import { el, patchList, q, setClass, setHidden, setText, setTitle } from '../ui/dom';
import { icon } from '../ui/icons';
import { contextMenu } from '../ui/popup';
import { DND_PRESET } from './queue';

type Row = { kind: 'group'; key: string; label: string; count: number } | { kind: 'preset'; key: string; p: PresetRow };

export class PresetsPanel implements Panel {
  readonly id = 'presets';
  readonly title = 'Preset Browser';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private rows: PresetRow[] = [];
  private collapsed = new Set<string>();
  private selected = '';
  private loaded = false;

  constructor(private readonly ctx: Ctx) {
    this.el = el(`<div class="fe-presets">
      <div class="fe-bar">
        <button class="cv-icon-btn" type="button" data-a="new" title="New preset from the selected output">${icon('plus', 16)}</button>
        <button class="cv-icon-btn" type="button" data-a="delete" title="Delete user preset">${icon('minus', 16)}</button>
        <button class="cv-icon-btn" type="button" data-a="group" title="New group">${icon('folder', 15)}</button>
        <button class="cv-icon-btn" type="button" data-a="import" title="Import presets (.fepreset, JSON or Media Encoder .epr)">${icon('upload', 15)}</button>
        <input class="cv-input fe-p-search" placeholder="Search presets" spellcheck="false" data-automation-id="presets.search">
        <button class="cv-btn fe-p-apply" type="button" data-a="apply" title="Apply to the selected outputs, or add an output to the selected source">Apply</button>
      </div>
      <div class="fe-p-head"><span>Name</span><span>Format</span><span>Frame Size</span><span>Frame Rate</span><span>Target Rate</span></div>
      <div class="fe-p-list" tabindex="0" data-automation-id="presets.list"></div>
      <div class="fe-p-comment"></div>
    </div>`);
    this.list = q(this.el, '.fe-p-list');
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-a]'))) {
      b.dataset.automationId = `presets.${b.dataset.a}`;
      b.addEventListener('click', () => void this.action(b.dataset.a as string));
    }
    let t = 0;
    q(this.el, '.fe-p-search').addEventListener('input', () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => this.render(), 120);
    });
    ctx.client.events.on('activity', (ev) => {
      if (String(ev.command || '').startsWith('preset.') && this.loaded) void this.load();
    });
    ctx.ui.on('presets', () => void this.load());
  }

  shown(): void {
    if (!this.loaded) {
      this.loaded = true;
      void this.load();
    }
  }

  async load(): Promise<void> {
    this.rows = await this.ctx.presets(true).catch(() => []);
    this.render();
  }

  private flat(): Row[] {
    const query = q<HTMLInputElement>(this.el, '.fe-p-search').value.trim().toLowerCase();
    const match = (p: PresetRow): boolean => !query || `${p.name} ${p.formatLabel} ${p.category} ${p.comment} ${p.alias ?? ''} ${p.id}`.toLowerCase().includes(query);
    const out: Row[] = [];
    const users = this.rows.filter((p) => !p.system);
    const groups = groupPresets(this.rows.filter((p) => p.system));
    const userGroups = groupPresets(users);
    for (const [g, list] of [...userGroups, ...groups]) {
      const shown = list.filter(match);
      if (!shown.length) continue;
      out.push({ kind: 'group', key: `g:${g}`, label: g, count: shown.length });
      if (this.collapsed.has(g) && !query) continue;
      for (const p of shown) out.push({ kind: 'preset', key: p.id, p });
    }
    return out;
  }

  private render(): void {
    const rows = this.flat();
    patchList(this.list, rows, {
      key: (r) => r.key,
      create: (r) => (r.kind === 'group' ? this.createGroup() : this.createPreset()),
      update: (n, r) => {
        if (r.kind === 'group') {
          setText(q(n, '.fe-p-gname'), r.label);
          setText(q(n, '.fe-p-gcount'), String(r.count));
          setClass(n, 'is-collapsed', this.collapsed.has(r.label));
          n.dataset.group = r.label;
          return;
        }
        const p = r.p;
        setText(q(n, '[data-c="name"]'), p.alias ? `${p.name} (${p.alias})` : p.name);
        setText(q(n, '[data-c="format"]'), p.formatLabel);
        setText(q(n, '[data-c="size"]'), p.frameSize);
        setText(q(n, '[data-c="rate"]'), p.frameRate);
        setText(q(n, '[data-c="target"]'), p.targetRate);
        setTitle(n, [p.comment, p.summary?.video, p.summary?.audio].filter(Boolean).join('\n'));
        setClass(n, 'is-user', !p.system);
        setClass(n, 'is-selected', this.selected === p.id);
      },
    });
    this.comment();
  }

  private createGroup(): HTMLElement {
    const n = el(`<div class="fe-p-group"><span class="fe-twirl">${icon('chevronDown', 12)}</span><span class="fe-p-gname"></span><span class="fe-p-gcount"></span></div>`);
    n.addEventListener('click', () => {
      const g = n.dataset.group as string;
      if (this.collapsed.has(g)) this.collapsed.delete(g);
      else this.collapsed.add(g);
      this.render();
    });
    return n;
  }

  private createPreset(): HTMLElement {
    const n = el(`<div class="fe-p-row" draggable="true"><span data-c="name"></span><span data-c="format"></span><span data-c="size"></span><span data-c="rate"></span><span data-c="target"></span></div>`);
    n.addEventListener('click', () => {
      this.selected = n.dataset.key as string;
      for (const r of Array.from(this.list.querySelectorAll('.fe-p-row')) as HTMLElement[]) setClass(r, 'is-selected', r.dataset.key === this.selected);
      this.comment();
    });
    n.addEventListener('dblclick', () => void this.apply(n.dataset.key as string));
    n.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData(DND_PRESET, n.dataset.key as string);
      e.dataTransfer?.setData('text/plain', n.dataset.key as string);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });
    n.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id = n.dataset.key as string;
      const p = this.rows.find((x) => x.id === id);
      contextMenu(e.clientX, e.clientY, [
        { label: 'Apply to Selected', run: () => void this.apply(id) },
        { label: 'Preset Settings...', run: () => void this.showSettings(id) },
        '-',
        { label: 'Duplicate', run: () => void this.duplicate(id) },
        { label: 'Create Alias...', run: () => void this.alias(id) },
        { label: 'Rename...', enabled: !p?.system, run: () => void this.rename(id) },
        { label: 'Export...', run: () => void this.ctx.invoke('preset.export', { preset: id }) },
        '-',
        { label: 'Delete', enabled: !p?.system, run: () => void this.remove(id) },
      ]);
    });
    return n;
  }

  private comment(): void {
    const p = this.rows.find((x) => x.id === this.selected);
    const box = q(this.el, '.fe-p-comment');
    setHidden(box, !p);
    if (p) setText(box, [p.comment, p.summary?.video, p.summary?.audio].filter(Boolean).join(' · '));
  }

  private async action(a: string): Promise<void> {
    if (a === 'new') {
      const out = this.ctx.store.selection().outputs[0];
      const name = await promptName('New Encoding Preset', 'My Preset', 'Create');
      if (!name) return;
      await this.ctx.run('preset.create', out ? { name, fromOutput: out } : { name, settings: { format: 'h264' } });
      void this.load();
      return;
    }
    if (a === 'delete' && this.selected) return this.remove(this.selected);
    if (a === 'group') {
      const name = await promptName('New Preset Group', 'My Group', 'Create');
      if (name) await this.ctx.run('preset.newGroup', { name });
      return;
    }
    if (a === 'import') {
      await this.ctx.invoke('preset.import');
      void this.load();
      return;
    }
    if (a === 'apply' && this.selected) return this.apply(this.selected);
  }

  private async apply(id: string): Promise<void> {
    const sel = this.ctx.store.selection();
    if (sel.outputs.length) await this.ctx.run('queue.setPreset', { refs: sel.outputs, preset: id });
    else if (sel.items.length) for (const item of sel.items) await this.ctx.run('queue.addOutput', { item, preset: id });
    else this.ctx.ui.emit('showPanel', 'queue');
  }

  private async showSettings(id: string): Promise<void> {
    const r = await this.ctx.run<{ settings: unknown }>('preset.get', { preset: id });
    if (!r) return;
    const { report } = await import('../ui/report');
    report(`Preset · ${this.rows.find((x) => x.id === id)?.name ?? id}`, JSON.stringify(r, null, 2));
  }

  private async duplicate(id: string): Promise<void> {
    const p = this.rows.find((x) => x.id === id);
    const name = await promptName('Duplicate Preset', `${p?.name ?? 'Preset'} copy`, 'Duplicate');
    if (name) await this.ctx.run('preset.duplicate', { preset: id, name });
    void this.load();
  }

  private async alias(id: string): Promise<void> {
    const alias = await promptName('Create Alias', '', 'Save');
    if (alias !== null) await this.ctx.run('preset.alias', { preset: id, alias });
    void this.load();
  }

  private async rename(id: string): Promise<void> {
    const p = this.rows.find((x) => x.id === id);
    const name = await promptName('Rename Preset', p?.name ?? '', 'Rename');
    if (name) await this.ctx.run('preset.update', { preset: id, name });
    void this.load();
  }

  private async remove(id: string): Promise<void> {
    const p = this.rows.find((x) => x.id === id);
    if (!p || p.system) return;
    if (!(await confirmAction('Delete Preset', `Delete ${p.name}? This removes its .fepreset file.`, 'Delete', true))) return;
    await this.ctx.run('preset.delete', { preset: id });
    this.selected = '';
    void this.load();
  }
}
