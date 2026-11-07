import type { Panel } from '../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setDisabled, setHidden, setStyleVar, setText, setTitle } from '../../../frontend/src/ui/dom';
import { fmtDuration, STATUS_LABEL } from '../../../frontend/src/ui/format';
import { icon } from '../../../frontend/src/ui/icons';
import { contextMenu } from '../../../frontend/src/ui/popup';
import { toast } from '../../../frontend/src/ui/toast';
import { FORMAT_LABEL, PRESET_BY_ID, TARGET_LABEL } from '../engine/presets';
import { store, type Item, type Output } from '../state';
import { openSettings } from './settings';
import { previewOutput, saveOutput } from './preview';

export const DND_PRESET = 'application/x-formencoder-preset';

export class QueuePanel implements Panel {
  readonly id = 'queue';
  readonly title = 'Queue';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly picker: HTMLInputElement;

  constructor() {
    this.el = el(`<div class="fe-queue">
      <div class="fe-bar">
        <button class="cv-icon-btn" type="button" data-a="add" title="Add Source: choose your own video or audio file">${icon('plus', 16)}</button>
        <button class="cv-icon-btn" type="button" data-a="sample" title="Add the built-in sample (generated in this page)">${icon('film', 16)}</button>
        <button class="cv-icon-btn" type="button" data-a="remove" title="Remove the selected source or output (Delete)">${icon('trash', 16)}</button>
        <span class="cv-sep"></span>
        <button class="cv-icon-btn" type="button" data-a="settings" title="Export Settings for the selected output">${icon('sliders', 16)}</button>
        <span class="fx-flex"></span>
        <span class="fe-q-auto"></span>
        <button class="fe-run" type="button" data-a="start" title="Start Queue">${icon('play', 14)}<span class="fe-run-label">Start</span></button>
        <button class="cv-icon-btn" type="button" data-a="stop" title="Stop Queue" disabled>${icon('stop', 15)}</button>
      </div>
      <div class="fe-q-head"><span>Format</span><span>Preset</span><span>Output File</span><span>Status</span></div>
      <div class="fe-q-list" role="tree" tabindex="0"></div>
      <div class="fe-q-empty" hidden>
        <div class="fe-drop-card">${icon('film', 28)}<strong>Drop a video or audio file here, or press + to choose one</strong><span>Nothing is uploaded: the file is read and encoded inside this page.</span></div>
      </div>
      <input type="file" class="fd-file" accept="video/*,audio/*,.mov,.mp4,.m4v,.webm,.mkv,.wav,.aif,.aiff,.flac,.mp3,.m4a,.ogg,.opus" multiple hidden>
    </div>`);
    this.list = q(this.el, '.fe-q-list');
    this.empty = q(this.el, '.fe-q-empty');
    this.picker = q<HTMLInputElement>(this.el, '.fd-file');
    this.picker.addEventListener('change', () => {
      for (const f of Array.from(this.picker.files ?? [])) void store.addFile(f);
      this.picker.value = '';
    });
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-a]'))) b.addEventListener('click', () => this.action(b.dataset.a as string));
    this.bindDrop(this.el);
    this.list.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); store.removeSelected(); }
    });
    this.list.addEventListener('dblclick', (e) => {
      if (e.target === this.list) this.picker.click();
    });
    store.on('items', () => this.render());
    store.on('select', () => this.paintSelection());
    store.on('run', () => this.paintRun());
    store.on('progress', (o) => this.patchOne(o as Output));
    this.render();
    this.paintRun();
  }

  openPicker(): void {
    this.picker.click();
  }

  private action(a: string): void {
    if (a === 'add') this.picker.click();
    else if (a === 'sample') void store.addSample();
    else if (a === 'remove') store.removeSelected();
    else if (a === 'settings') this.openSettingsFor(store.selectedOutput);
    else if (a === 'start') void store.start();
    else if (a === 'stop') store.stop();
  }

  private openSettingsFor(id: string): void {
    if (!id) { toast('Select an output first'); return; }
    openSettings(id);
  }

  private bindDrop(root: HTMLElement): void {
    const over = (e: DragEvent): void => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (!types.includes('Files') && !types.includes(DND_PRESET)) return;
      e.preventDefault();
      setClass(root, 'is-drop', types.includes('Files'));
    };
    root.addEventListener('dragover', over);
    root.addEventListener('dragenter', over);
    root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget as Node)) setClass(root, 'is-drop', false); });
    root.addEventListener('drop', (e) => {
      setClass(root, 'is-drop', false);
      const preset = e.dataTransfer?.getData(DND_PRESET);
      if (preset) {
        e.preventDefault();
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-item]');
        const itemId = row?.dataset.item ?? store.selectedItem;
        if (itemId) store.addOutput(itemId, preset);
        return;
      }
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      for (const f of files) void store.addFile(f);
    });
  }

  private render(): void {
    setHidden(this.empty, store.items.length > 0);
    setHidden(this.list, store.items.length === 0);
    setHidden(q(this.el, '.fe-q-head'), store.items.length === 0);
    patchList(this.list, store.items, {
      key: (i) => i.id,
      create: (i) => this.createItem(i),
      update: (n, i) => this.updateItem(n, i),
    });
    const outs = store.items.reduce((a, i) => a + i.outputs.length, 0);
    setText(q(this.el, '.fe-q-auto'), `${store.items.length} source${store.items.length === 1 ? '' : 's'} · ${outs} output${outs === 1 ? '' : 's'}`);
    this.paintSelection();
  }

  private createItem(item: Item): HTMLElement {
    const n = el(`<div class="fe-q-item" data-item="${item.id}">
      <div class="fe-q-src"><button class="fe-twirl" type="button">${icon('chevronDown', 12)}</button><span class="fe-q-kind"></span><span class="fe-q-name"></span><span class="fe-q-meta"></span></div>
      <div class="fe-q-outs"></div>
    </div>`);
    const src = q(n, '.fe-q-src');
    src.addEventListener('click', () => store.select(item.id));
    q(n, '.fe-twirl').addEventListener('click', (e) => {
      e.stopPropagation();
      const it = store.item(item.id);
      if (it) { it.collapsed = !it.collapsed; setClass(n, 'is-collapsed', it.collapsed); }
    });
    src.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      store.select(item.id);
      contextMenu(e.clientX, e.clientY, [{ label: 'Remove Source', run: () => store.removeSelected() }]);
    });
    return n;
  }

  private updateItem(n: HTMLElement, item: Item): void {
    const s = item.source;
    q(n, '.fe-q-kind').innerHTML = icon(s.kind === 'video' ? 'film' : 'audio', 14);
    setText(q(n, '.fe-q-name'), s.name);
    const bits: string[] = [];
    if (s.kind === 'video') bits.push(`${s.width}x${s.height}`, `${Number(s.fps.toFixed(3))} fps`);
    bits.push(fmtDuration(s.duration));
    if (s.sample) bits.push('generated');
    if (item.loading) bits.push('loading');
    setText(q(n, '.fe-q-meta'), bits.filter(Boolean).join(' · '));
    setClass(n, 'is-collapsed', item.collapsed);
    patchList(q(n, '.fe-q-outs'), item.outputs, {
      key: (o) => o.id,
      create: (o) => this.createOutput(o),
      update: (node, o) => this.updateOutput(node, o),
    });
  }

  private createOutput(o: Output): HTMLElement {
    const n = el(`<div class="fe-q-out" data-out="${o.id}">
      <div class="fe-q-cell"><span class="fe-q-fmt"></span></div>
      <div class="fe-q-cell"><button class="fe-link" type="button" data-a="preset"></button></div>
      <div class="fe-q-cell"><button class="fe-link" type="button" data-a="file"></button><button class="cv-icon-btn fd-act" type="button" data-a="save" title="Save the output file">${icon('ingest', 14)}</button><button class="cv-icon-btn fd-act" type="button" data-a="play" title="Preview the output">${icon('eye', 14)}</button></div>
      <div class="fe-q-status"><span class="fe-st-text"></span><span class="fe-bar-track"><span class="fe-bar-fill"></span></span></div>
    </div>`);
    n.addEventListener('click', () => {
      const hit = store.outputOf(o.id);
      if (hit) store.select(hit.item.id, o.id);
    });
    q(n, '[data-a="preset"]').addEventListener('click', () => openSettings(o.id));
    q(n, '[data-a="file"]').addEventListener('click', () => openSettings(o.id));
    q(n, '[data-a="save"]').addEventListener('click', (e) => { e.stopPropagation(); saveOutput(o.id); });
    q(n, '[data-a="play"]').addEventListener('click', (e) => { e.stopPropagation(); previewOutput(o.id); });
    n.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const hit = store.outputOf(o.id);
      if (hit) store.select(hit.item.id, o.id);
      contextMenu(e.clientX, e.clientY, [
        { label: 'Export Settings...', run: () => openSettings(o.id) },
        { label: 'Reset to Ready', enabled: !store.running, run: () => { const h = store.outputOf(o.id); if (h) store.resetOutput(h.output); } },
        '-',
        { label: 'Remove Output', enabled: !store.running, run: () => store.removeSelected() },
      ]);
    });
    return n;
  }

  private updateOutput(n: HTMLElement, o: Output): void {
    const preset = PRESET_BY_ID.get(o.presetId);
    const target = preset?.target ?? null;
    setText(q(n, '.fe-q-fmt'), target ? TARGET_LABEL[target] : FORMAT_LABEL[preset?.format ?? ''] ?? preset?.format ?? '');
    setClass(n, 'fd-desk', target === null);
    setTitle(n, target ? '' : 'Needs the desktop engine: the browser demo skips this output');
    const link = q(n, '[data-a="preset"]');
    setText(link, preset?.name ?? o.presetId);
    setTitle(link, preset?.name ?? '');
    const file = q(n, '[data-a="file"]');
    setText(file, o.fileName);
    setTitle(file, o.fileName);
    setClass(n, 'is-skip', o.status === 'skipped');
    setClass(n, 'is-done', o.status === 'done');
    this.paintStatus(n, o);
  }

  private paintStatus(n: HTMLElement, o: Output): void {
    n.dataset.status = o.status;
    const text = o.status === 'encoding' ? `${Math.round(o.progress * 100)}%` : STATUS_LABEL[o.status] ?? o.status;
    setText(q(n, '.fe-st-text'), o.status === 'done' || o.status === 'failed' || o.status === 'skipped' ? `${STATUS_LABEL[o.status]} · ${o.message}` : text);
    setTitle(q(n, '.fe-st-text'), o.message);
    setStyleVar(q(n, '.fe-bar-fill'), '--p', String(o.progress));
  }

  private patchOne(o: Output): void {
    const n = this.list.querySelector<HTMLElement>(`[data-out="${o.id}"]`);
    if (n) this.paintStatus(n, o);
  }

  private paintSelection(): void {
    for (const n of Array.from(this.list.querySelectorAll<HTMLElement>('.fe-q-item'))) {
      setClass(q(n, '.fe-q-src'), 'is-selected', n.dataset.item === store.selectedItem && !store.selectedOutput);
    }
    for (const n of Array.from(this.list.querySelectorAll<HTMLElement>('.fe-q-out'))) setClass(n, 'is-selected', n.dataset.out === store.selectedOutput);
  }

  private paintRun(): void {
    const start = q<HTMLButtonElement>(this.el, '[data-a="start"]');
    setDisabled(start, store.running);
    setClass(start, 'is-running', store.running);
    setText(q(this.el, '.fe-run-label'), store.running ? 'Running' : 'Start');
    setDisabled(q<HTMLButtonElement>(this.el, '[data-a="stop"]'), !store.running);
  }
}
