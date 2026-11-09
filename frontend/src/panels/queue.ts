import type { Ctx } from '../app/ctx';
import { api } from '../engine/client';
import type { Item, Output, UiState } from '../engine/types';
import { formatEntries, presetEntries } from '../ui/choosers';
import type { Panel } from '../ui/dock';
import { el, patchList, q, setClass, setDisabled, setHidden, setHtml, setStyleVar, setText, setTitle } from '../ui/dom';
import { pickFiles } from '../ui/file-dialog';
import { basename, fmtDuration, STATUS_LABEL } from '../ui/format';
import { icon } from '../ui/icons';
import { bindDemoCards, demosHtml } from '../ui/demos';
import { contextMenu, type PopupEntry } from '../ui/popup';
import { toast } from '../ui/toast';

export const DND_PRESET = 'application/x-formencoder-preset';
export const DND_PATHS = 'application/x-formencoder-paths';

const KIND_ICON: Record<string, string> = { file: 'film', sequence: 'sequence', stitch: 'layers', family: 'family' };

export class QueuePanel implements Panel {
  readonly id = 'queue';
  readonly title = 'Queue';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private collapsed = new Set<string>();
  private anchor: string | null = null;

  constructor(private readonly ctx: Ctx) {
    this.el = el(`<div class="fe-queue">
      <div class="fe-bar">
        <button class="cv-icon-btn" type="button" data-a="add" title="Add Source (Cmd+I)">${icon('plus', 16)}</button>
        <button class="cv-icon-btn" type="button" data-a="output" title="Add Output to the selected source">${icon('queue', 16)}</button>
        <button class="cv-icon-btn" type="button" data-a="duplicate" title="Duplicate (Cmd+D)">${icon('duplicate', 16)}</button>
        <button class="cv-icon-btn" type="button" data-a="remove" title="Remove (Delete)">${icon('trash', 16)}</button>
        <span class="cv-sep"></span>
        <button class="cv-icon-btn" type="button" data-a="settings" title="Export Settings (Cmd+E)">${icon('sliders', 16)}</button>
        <span class="fx-flex"></span>
        <label class="fe-check-label" title="Encode whatever lands in an active watch folder, without starting the queue"><input type="checkbox" class="fx-check" data-a="autoWatch"><span>Auto-Encode Watch Folders</span></label>
        <span class="fe-q-auto"></span>
        <button class="fe-run" type="button" data-a="start" title="Start Queue (Enter)">${icon('play', 14)}<span class="fe-run-label">Start</span></button>
        <button class="cv-icon-btn" type="button" data-a="pause" title="Pause Queue">${icon('pause', 15)}</button>
        <button class="cv-icon-btn" type="button" data-a="stop" title="Stop Queue">${icon('stop', 15)}</button>
      </div>
      <div class="fe-q-head"><span>Format</span><span>Preset</span><span>Output File</span><span>Status</span></div>
      <div class="fe-q-list" role="tree" tabindex="0" data-automation-id="queue.list"></div>
      <div class="fe-q-empty" hidden>
        <div class="fe-drop-card">${icon('film', 28)}<strong>Drag media here, or press + to add sources</strong><span>Each source gets an output from the default preset; drop a preset on a source to add another output. Agents add sources too.</span><button class="cv-btn" type="button" data-a="add2">${icon('plus', 14)}Add Source</button></div>
        ${demosHtml()}
      </div>
    </div>`);
    this.list = q(this.el, '.fe-q-list');
    this.empty = q(this.el, '.fe-q-empty');
    bindDemoCards(ctx, this.empty);
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-a]'))) {
      b.dataset.automationId = `queue.${b.dataset.a}`;
      if (b.dataset.a === 'autoWatch') {
        b.addEventListener('change', () => void ctx.run('queue.autoEncodeWatch', { enabled: (b as HTMLInputElement).checked }));
        continue;
      }
      b.addEventListener('click', () => this.action(b.dataset.a as string));
    }
    this.bindDrop(this.el);
    this.list.addEventListener('contextmenu', (e) => {
      if (e.target === this.list) {
        e.preventDefault();
        contextMenu(e.clientX, e.clientY, [
          { label: 'Add Source...', run: () => void ctx.invoke('queue.addSource') },
          { label: 'Add Folder...', run: () => void ctx.invoke('queue.addFolder') },
          { label: 'Stitch Clips Together...', run: () => void ctx.invoke('queue.stitch') },
          '-',
          { label: 'Clear Completed', run: () => void ctx.run('queue.clearDone') },
        ]);
      }
    });
    this.list.addEventListener('dblclick', (e) => {
      if (e.target === this.list) void ctx.invoke('queue.addSource');
    });
    this.empty.addEventListener('dblclick', (e) => {
      if (!(e.target as HTMLElement).closest('button')) void ctx.invoke('queue.addSource');
    });
    ctx.store.events.on('items', (st) => this.render(st));
    ctx.store.events.on('selection', () => this.markSelection());
    ctx.store.events.on('run', (st) => this.renderRun(st));
    ctx.store.events.on('watch', (st) => {
      const c = q<HTMLInputElement>(this.el, '[data-a="autoWatch"]');
      if (c.checked !== st.autoEncodeWatch) c.checked = st.autoEncodeWatch;
    });
    ctx.store.events.on('progress', (o) => {
      const row = this.list.querySelector<HTMLElement>(`.fe-q-out[data-key="${CSS.escape(o.id)}"]`);
      if (row) this.updateStatus(row, o);
    });
  }

  shown(): void {
    if (this.ctx.store.state) {
      this.render(this.ctx.store.state);
      this.renderRun(this.ctx.store.state);
    }
  }

  private action(a: string): void {
    const sel = this.ctx.store.selection();
    switch (a) {
      case 'add':
      case 'add2':
        void this.ctx.invoke('queue.addSource');
        return;
      case 'output':
        void this.ctx.invoke('queue.addOutput');
        return;
      case 'duplicate':
        void this.ctx.invoke('queue.duplicate');
        return;
      case 'remove':
        if (sel.items.length || sel.outputs.length) void this.ctx.invoke('queue.remove');
        return;
      case 'settings':
        void this.ctx.invoke('ui.exportSettings');
        return;
      case 'start':
        void this.ctx.run('queue.start');
        return;
      case 'pause':
        void this.ctx.run('queue.pause');
        return;
      case 'stop':
        void this.ctx.run('queue.stop');
    }
  }

  private renderRun(st: UiState): void {
    const start = q<HTMLButtonElement>(this.el, '[data-a="start"]');
    setClass(start, 'is-running', st.running && !st.paused);
    setText(q(start, '.fe-run-label'), st.running && !st.paused ? 'Encoding' : st.paused ? 'Resume' : 'Start');
    setDisabled(start, st.running && !st.paused);
    setDisabled(q<HTMLButtonElement>(this.el, '[data-a="pause"]'), !st.running || st.paused);
    setDisabled(q<HTMLButtonElement>(this.el, '[data-a="stop"]'), !st.running && !st.encoding.length);
    setText(q(this.el, '.fe-q-auto'), st.autoStartIn !== null && st.autoStartIn !== undefined ? `Starts in ${Math.ceil(st.autoStartIn)} s` : '');
  }

  private render(st: UiState): void {
    setHidden(this.empty, st.items.length > 0);
    setHidden(this.list, st.items.length === 0);
    setHidden(q(this.el, '.fe-q-head'), st.items.length === 0);
    patchList(this.list, st.items, {
      key: (it) => it.id,
      create: (it) => this.createItem(it),
      update: (n, it) => this.updateItem(n, it),
    });
    this.markSelection();
  }

  private createItem(it: Item): HTMLElement {
    const n = el(`<div class="fe-q-item" role="treeitem">
      <div class="fe-q-src" draggable="false">
        <button class="fe-twirl" type="button" tabindex="-1">${icon('chevronDown', 12)}</button>
        <span class="fe-q-kind"></span>
        <span class="fe-q-name"></span>
        <span class="fe-q-meta"></span>
        <span class="fe-badge" hidden></span>
        <span class="fe-badge is-warn" data-missing hidden>Missing</span>
      </div>
      <div class="fe-q-outs" role="group"></div>
    </div>`);
    const src = q(n, '.fe-q-src');
    q(n, '.fe-twirl').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = n.dataset.key as string;
      if (this.collapsed.has(id)) this.collapsed.delete(id);
      else this.collapsed.add(id);
      setClass(n, 'is-collapsed', this.collapsed.has(id));
    });
    src.addEventListener('click', (e) => this.clickItem(n.dataset.key as string, e));
    src.addEventListener('dblclick', () => void this.ctx.invoke('queue.addOutput', { item: n.dataset.key }));
    src.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id = n.dataset.key as string;
      if (!this.ctx.store.selection().items.includes(id)) this.ctx.store.select([id], []);
      contextMenu(e.clientX, e.clientY, this.itemMenu(id));
    });
    src.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes(DND_PRESET)) return;
      e.preventDefault();
      e.stopPropagation();
      setClass(src, 'is-drop', true);
    });
    src.addEventListener('dragleave', () => setClass(src, 'is-drop', false));
    src.addEventListener('drop', (e) => {
      const preset = e.dataTransfer?.getData(DND_PRESET);
      setClass(src, 'is-drop', false);
      if (!preset) return;
      e.preventDefault();
      e.stopPropagation();
      void this.ctx.run('queue.addOutput', { item: n.dataset.key, preset });
    });
    return n;
  }

  private updateItem(n: HTMLElement, it: Item): void {
    setClass(n, 'is-collapsed', this.collapsed.has(it.id));
    setHtml(q(n, '.fe-q-kind'), icon(KIND_ICON[it.kind] ?? (it.video ? 'film' : 'audio'), 15), it.kind + (it.video ? 'v' : 'a'));
    setText(q(n, '.fe-q-name'), it.name);
    setTitle(q(n, '.fe-q-src'), it.path);
    const meta = [it.video, it.audio, fmtDuration(it.duration)].filter(Boolean).join(' · ');
    setText(q(n, '.fe-q-meta'), meta);
    const badge = q(n, '.fe-badge');
    const label = it.origin?.watch ? 'Watch Folder' : it.kind === 'family' ? String(it.family?.app ?? 'family') : it.kind === 'stitch' ? `Stitch of ${it.stitch?.length ?? 0}` : it.kind === 'sequence' ? 'Image Sequence' : '';
    setText(badge, label);
    setHidden(badge, !label);
    setHidden(q(n, '[data-missing]'), !it.missing);
    patchList(q(n, '.fe-q-outs'), it.outputs, {
      key: (o) => o.id,
      create: () => this.createOutput(),
      update: (row, o) => this.updateOutput(row, o),
    });
  }

  private createOutput(): HTMLElement {
    const row = el(`<div class="fe-q-out" role="treeitem">
      <span class="fe-q-cell"><button class="fe-link fe-q-format" type="button" data-c="format"></button></span>
      <span class="fe-q-cell"><button class="fe-link fe-q-preset" type="button" data-c="preset"></button><button class="fe-chev" type="button" data-c="presetMenu" tabindex="-1">${icon('chevronDown', 11)}</button></span>
      <span class="fe-q-cell"><button class="fe-link fe-q-file" type="button" data-c="file"></button></span>
      <span class="fe-q-status"><span class="fe-st-text"></span><span class="fe-bar-track"><span class="fe-bar-fill"></span></span></span>
    </div>`);
    row.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
      const id = row.dataset.key as string;
      if (c === 'format') {
        this.ctx.store.select([], [id]);
        const r = (e.target as HTMLElement).getBoundingClientRect();
        void formatEntries(this.ctx, this.ctx.store.output(id)?.format ?? '', (f) => void this.ctx.run('queue.setFormat', { refs: [id], format: f })).then((entries) => contextMenu(r.left, r.bottom + 2, entries));
        return;
      }
      if (c === 'preset') {
        this.ctx.store.select([], [id]);
        this.ctx.ui.emit('exportSettings', id);
        return;
      }
      if (c === 'presetMenu') {
        this.ctx.store.select([], [id]);
        const r = (e.target as HTMLElement).getBoundingClientRect();
        void presetEntries(this.ctx, this.ctx.store.output(id)?.preset ?? null, (p) => void this.ctx.run('queue.setPreset', { refs: [id], preset: p })).then((entries) => contextMenu(r.left, r.bottom + 2, entries));
        return;
      }
      if (c === 'file') {
        this.ctx.store.select([], [id]);
        void this.setFile(id);
        return;
      }
      this.clickOutput(id, e);
    });
    row.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('[data-c]')) return;
      this.ctx.ui.emit('exportSettings', row.dataset.key as string);
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id = row.dataset.key as string;
      if (!this.ctx.store.selection().outputs.includes(id)) this.ctx.store.select([], [id]);
      contextMenu(e.clientX, e.clientY, this.outputMenu(id));
    });
    row.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes(DND_PRESET)) return;
      e.preventDefault();
      e.stopPropagation();
      setClass(row, 'is-drop', true);
    });
    row.addEventListener('dragleave', () => setClass(row, 'is-drop', false));
    row.addEventListener('drop', (e) => {
      const preset = e.dataTransfer?.getData(DND_PRESET);
      setClass(row, 'is-drop', false);
      if (!preset) return;
      e.preventDefault();
      e.stopPropagation();
      void this.ctx.run('queue.setPreset', { refs: [row.dataset.key], preset });
    });
    return row;
  }

  private updateOutput(row: HTMLElement, o: Output): void {
    setText(q(row, '.fe-q-format'), o.formatLabel);
    setText(q(row, '.fe-q-preset'), o.presetName || 'Custom');
    setTitle(q(row, '.fe-q-preset'), [o.summary?.video, o.summary?.audio, o.effects?.length ? `Effects: ${o.effects.join(', ')}` : ''].filter(Boolean).join('\n'));
    setText(q(row, '.fe-q-file'), basename(o.path || ''));
    setTitle(q(row, '.fe-q-file'), o.path || '');
    setHidden(q(row, '[data-c="presetMenu"]'), o.kind !== 'encode');
    setClass(row, 'is-skip', o.skip);
    this.updateStatus(row, o);
  }

  private updateStatus(row: HTMLElement, o: Output): void {
    const s = o.skip && o.status === 'ready' ? 'skipped' : o.status;
    const pct = Math.max(0, Math.min(1, Number(o.progress) || 0));
    row.dataset.status = s;
    let text = STATUS_LABEL[s] ?? s;
    if (s === 'encoding') text = `${Math.round(pct * 100)}%`;
    if (s === 'preparing' && typeof o.fetch === 'number') text = `Fetching ${Math.round(o.fetch * 100)}%`;
    setText(q(row, '.fe-st-text'), text);
    setTitle(q(row, '.fe-q-status'), o.error || o.message || (o.notes ?? []).join('\n') || '');
    setStyleVar(q(row, '.fe-bar-fill'), '--p', String(s === 'done' ? 1 : s === 'preparing' ? Number(o.fetch) || 0 : pct));
  }

  private clickItem(id: string, e: MouseEvent): void {
    const sel = this.ctx.store.selection();
    if (e.metaKey || e.ctrlKey) {
      const items = sel.items.includes(id) ? sel.items.filter((x) => x !== id) : [...sel.items, id];
      this.ctx.store.select(items, []);
    } else this.ctx.store.select([id], []);
    const it = this.ctx.store.item(id);
    if (it && it.kind !== 'family') this.ctx.ui.emit('inspect', { path: it.path, name: it.name });
    this.anchor = null;
  }

  private clickOutput(id: string, e: MouseEvent): void {
    const sel = this.ctx.store.selection();
    const order = (this.ctx.store.state?.items ?? []).flatMap((i) => i.outputs.map((o) => o.id));
    if (e.shiftKey && this.anchor) {
      const a = order.indexOf(this.anchor);
      const b = order.indexOf(id);
      this.ctx.store.select([], order.slice(Math.min(a, b), Math.max(a, b) + 1));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      this.ctx.store.select([], sel.outputs.includes(id) ? sel.outputs.filter((x) => x !== id) : [...sel.outputs, id]);
    } else this.ctx.store.select([], [id]);
    this.anchor = id;
  }

  private markSelection(): void {
    const sel = this.ctx.store.selection();
    for (const n of Array.from(this.list.children) as HTMLElement[]) {
      setClass(q(n, '.fe-q-src'), 'is-selected', sel.items.includes(n.dataset.key as string));
      for (const r of Array.from(q(n, '.fe-q-outs').children) as HTMLElement[]) setClass(r, 'is-selected', sel.outputs.includes(r.dataset.key as string));
    }
  }

  private async setFile(id: string): Promise<void> {
    const o = this.ctx.store.output(id);
    if (!o) return;
    const got = await pickFiles({ title: 'Output File', mode: 'save', defaultName: basename(o.path || 'output') });
    if (got?.length) void this.ctx.run('queue.setOutput', { refs: [id], path: got[0] });
  }

  private itemMenu(id: string): PopupEntry[] {
    const it = this.ctx.store.item(id);
    return [
      { label: 'Add Output', run: () => void this.ctx.run('queue.addOutput', { item: id }) },
      { label: 'Add Output With Preset', children: () => presetEntries(this.ctx, null, (p) => void this.ctx.run('queue.addOutput', { item: id, preset: p })) },
      { label: 'Interpret Footage...', run: () => void this.ctx.invoke('queue.interpret', { item: id }) },
      { label: 'Set Source Range...', run: () => void this.ctx.invoke('queue.setRange', { refs: [id] }) },
      '-',
      { label: 'Apply Preset To All Outputs', children: () => presetEntries(this.ctx, null, (p) => void this.ctx.run('queue.setPreset', { refs: [id], preset: p })) },
      { label: 'Reset Status', run: () => void this.ctx.run('queue.resetStatus', { refs: [id] }) },
      { label: 'Duplicate', run: () => void this.ctx.run('queue.duplicate', { refs: [id] }) },
      { label: 'Remove', run: () => void this.ctx.run('queue.remove', { refs: [id] }) },
      '-',
      { label: 'Media Info', enabled: !!it && it.kind !== 'family', run: () => it && this.ctx.ui.emit('inspect', { path: it.path, name: it.name }) },
      { label: 'Move To Top', run: () => void this.ctx.run('queue.reorder', { item: id, to: 1 }) },
    ];
  }

  private outputMenu(id: string): PopupEntry[] {
    const o = this.ctx.store.output(id);
    const done = o?.status === 'done';
    return [
      { label: 'Export Settings...', shortcut: 'Cmd+E', run: () => this.ctx.ui.emit('exportSettings', id) },
      { label: 'Apply Preset', children: () => presetEntries(this.ctx, o?.preset ?? null, (p) => void this.ctx.run('queue.setPreset', { refs: this.refs(id), preset: p })) },
      { label: 'Format', children: () => formatEntries(this.ctx, o?.format ?? '', (f) => void this.ctx.run('queue.setFormat', { refs: this.refs(id), format: f })) },
      { label: 'Output File...', run: () => void this.setFile(id) },
      '-',
      { label: 'Reset Status', run: () => void this.ctx.run('queue.resetStatus', { refs: this.refs(id) }) },
      { label: o?.skip ? 'Unskip' : 'Skip Selection', run: () => void this.ctx.run('queue.skip', { refs: this.refs(id), skip: !o?.skip }) },
      { label: 'Stop This Output', enabled: o?.status === 'encoding' || o?.status === 'preparing', run: () => void this.ctx.run('queue.stopCurrent', { refs: [id] }) },
      { label: 'Duplicate', run: () => void this.ctx.run('queue.duplicate', { refs: this.refs(id) }) },
      { label: 'Remove', run: () => void this.ctx.run('queue.remove', { refs: this.refs(id) }) },
      '-',
      { label: 'Estimated File Size', run: () => void this.estimate(id) },
      { label: 'Show FFmpeg Command', run: () => void this.showCommand(id) },
      { label: 'Verify Output', enabled: done, run: () => void this.verify(id) },
      { label: 'Copy Output Path', enabled: !!o?.path, run: () => void navigator.clipboard?.writeText(o?.path ?? '').then(() => toast('Path copied')) },
      { label: 'Send to formcut', enabled: done && !!o?.path, run: () => void this.send('formcut', o?.path ?? '') },
      { label: 'Send to formvfx', enabled: done && !!o?.path, run: () => void this.send('formvfx', o?.path ?? '') },
      { label: 'Save Settings As Preset...', run: () => void this.ctx.invoke('preset.create', { fromOutput: id }) },
    ];
  }

  private async send(app: string, path: string): Promise<void> {
    const r = await this.ctx.client.call<{ sent?: string[] }>('family.send', { app, files: [path] }).catch((e: Error) => {
      toast(e.message, 'error');
      return null;
    });
    if (r) toast(`Sent to ${app}`, 'ok');
  }

  private refs(id: string): string[] {
    const sel = this.ctx.store.selection().outputs;
    return sel.includes(id) ? sel : [id];
  }

  private async estimate(id: string): Promise<void> {
    const r = await this.ctx.run<{ bytes: number; seconds: number; videoKbps: number; audioKbps: number }>('encode.estimate', { output: id });
    if (r) toast(`About ${(r.bytes / 1024 / 1024).toFixed(1)} MB for ${r.seconds.toFixed(2)} s (video ${r.videoKbps} kb/s, audio ${r.audioKbps} kb/s)`);
  }

  private async showCommand(id: string): Promise<void> {
    const r = await this.ctx.run<{ command: string; notes: string[] }>('encode.command', { output: id });
    if (!r) return;
    const { report } = await import('../ui/report');
    report('FFmpeg Command', r.command.split('\n').join('\n\n') + (r.notes?.length ? `\n\nNotes:\n${r.notes.join('\n')}` : ''));
  }

  private async verify(id: string): Promise<void> {
    const r = await this.ctx.run<{ checks: Array<{ check: string; want: unknown; got: unknown; ok: boolean }>; ok?: boolean; path: string }>('encode.verify', { output: id });
    if (!r) return;
    const { report } = await import('../ui/report');
    report(`Verify · ${basename(r.path)}`, r.checks.map((c) => `${c.ok ? 'OK  ' : 'FAIL'}  ${c.check}: wanted ${String(c.want)}, got ${String(c.got)}`).join('\n') || 'No checks apply to this file.');
  }

  private bindDrop(zone: HTMLElement): void {
    zone.addEventListener('dragover', (e) => {
      const t = e.dataTransfer?.types ?? [];
      if (!t.includes(DND_PATHS) && !t.includes('Files')) return;
      e.preventDefault();
      setClass(this.el, 'is-drop', true);
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget as Node)) setClass(this.el, 'is-drop', false);
    });
    zone.addEventListener('drop', async (e) => {
      setClass(this.el, 'is-drop', false);
      const raw = e.dataTransfer?.getData(DND_PATHS);
      if (raw) {
        e.preventDefault();
        void this.ctx.run('queue.addSource', { paths: JSON.parse(raw) as string[] });
        return;
      }
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      const form = new FormData();
      for (const f of files) form.append('files', f, f.name);
      try {
        toast(`Copying ${files.length} file${files.length === 1 ? '' : 's'} into formencoder's imports folder`);
        const r = await api<{ paths: string[] }>('/api/fs/upload', { method: 'POST', body: form });
        void this.ctx.run('queue.addSource', { paths: r.paths });
      } catch (err) {
        toast(String((err as Error).message), 'error');
      }
    });
  }

  addPaths(paths: string[]): void {
    if (paths.length) void this.ctx.run('queue.addSource', { paths });
  }
}
