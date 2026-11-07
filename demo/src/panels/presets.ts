import type { Panel } from '../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setHidden, setText, setTitle } from '../../../frontend/src/ui/dom';
import { icon } from '../../../frontend/src/ui/icons';
import { toast } from '../../../frontend/src/ui/toast';
import { FORMAT_LABEL, PRESETS, TARGET_LABEL, presetBitrate, presetRate, presetSize, type Preset } from '../engine/presets';
import { store } from '../state';
import { DND_PRESET } from './queue';

type Row = { kind: 'group'; name: string; count: number; runs: number; collapsed: boolean } | { kind: 'preset'; preset: Preset };

export class PresetsPanel implements Panel {
  readonly id = 'presets';
  readonly title = 'Preset Browser';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly comment: HTMLElement;
  private readonly collapsed = new Set<string>();
  private selected = '';
  private filter = '';

  constructor() {
    this.el = el(`<div class="fe-presets">
      <div class="fe-bar">
        <input class="cv-input fe-p-search" placeholder="Search presets" spellcheck="false">
        <label class="fe-check-label" title="Show only the presets this browser demo can write"><input type="checkbox" class="fx-check" data-a="runs"><span>Runs here</span></label>
        <button class="cv-btn fe-p-apply" type="button" data-a="apply" title="Add an output to the selected source">${icon('plus', 13)}Add Output</button>
      </div>
      <div class="fe-p-head"><span>Name</span><span>Format</span><span>Frame Size</span><span>Frame Rate</span><span>Target Rate</span></div>
      <div class="fe-p-list" tabindex="0"></div>
      <div class="fe-p-comment"></div>
    </div>`);
    this.list = q(this.el, '.fe-p-list');
    this.comment = q(this.el, '.fe-p-comment');
    let t = 0;
    q(this.el, '.fe-p-search').addEventListener('input', (e) => {
      window.clearTimeout(t);
      const v = (e.target as HTMLInputElement).value;
      t = window.setTimeout(() => { this.filter = v.trim().toLowerCase(); this.render(); }, 120);
    });
    q(this.el, '[data-a="runs"]').addEventListener('change', () => this.render());
    q(this.el, '[data-a="apply"]').addEventListener('click', () => this.apply());
    this.render();
  }

  private rows(): Row[] {
    const onlyRuns = q<HTMLInputElement>(this.el, '[data-a="runs"]').checked;
    const groups = new Map<string, Preset[]>();
    for (const p of PRESETS) {
      if (onlyRuns && !p.target) continue;
      if (this.filter && !`${p.name} ${p.category} ${p.format}`.toLowerCase().includes(this.filter)) continue;
      if (!groups.has(p.category)) groups.set(p.category, []);
      groups.get(p.category)?.push(p);
    }
    const out: Row[] = [];
    for (const [name, ps] of groups) {
      const collapsed = this.collapsed.has(name) && !this.filter;
      out.push({ kind: 'group', name, count: ps.length, runs: ps.filter((p) => p.target).length, collapsed });
      if (!collapsed) for (const p of ps) out.push({ kind: 'preset', preset: p });
    }
    return out;
  }

  private render(): void {
    const rows = this.rows();
    patchList(this.list, rows, {
      key: (r) => (r.kind === 'group' ? `g:${r.name}` : `p:${r.preset.id}`),
      create: (r) => (r.kind === 'group' ? this.createGroup(r.name) : this.createPreset(r.preset)),
      update: (n, r) => (r.kind === 'group' ? this.updateGroup(n, r) : this.updatePreset(n, r.preset)),
    });
    this.paintComment();
  }

  private createGroup(name: string): HTMLElement {
    const n = el(`<div class="fe-p-group"><button class="fe-twirl" type="button">${icon('chevronDown', 12)}</button><span class="fe-p-gname"></span><span class="fe-p-gcount"></span></div>`);
    n.addEventListener('click', () => {
      if (this.collapsed.has(name)) this.collapsed.delete(name);
      else this.collapsed.add(name);
      this.render();
    });
    return n;
  }

  private updateGroup(n: HTMLElement, r: Extract<Row, { kind: 'group' }>): void {
    setText(q(n, '.fe-p-gname'), r.name);
    setText(q(n, '.fe-p-gcount'), `${r.count} · ${r.runs} run here`);
    setClass(n, 'is-collapsed', r.collapsed);
  }

  private createPreset(p: Preset): HTMLElement {
    const n = el('<div class="fe-p-row" draggable="true"><span></span><span></span><span></span><span></span><span></span></div>');
    n.addEventListener('click', () => { this.selected = p.id; this.paintSelection(); this.paintComment(); });
    n.addEventListener('dblclick', () => { this.selected = p.id; this.apply(); });
    n.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData(DND_PRESET, p.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });
    return n;
  }

  private updatePreset(n: HTMLElement, p: Preset): void {
    const c = n.children;
    setText(c[0], p.name);
    setText(c[1], p.target ? TARGET_LABEL[p.target] : FORMAT_LABEL[p.format] ?? p.format);
    setText(c[2], presetSize(p));
    setText(c[3], presetRate(p));
    setText(c[4], presetBitrate(p));
    setClass(n, 'is-selected', p.id === this.selected);
    setClass(n, 'fd-desk', !p.target);
    setTitle(n, p.target ? `Runs in this page as ${TARGET_LABEL[p.target]}` : 'Needs the desktop engine');
  }

  private paintSelection(): void {
    for (const n of Array.from(this.list.querySelectorAll<HTMLElement>('.fe-p-row'))) {
      setClass(n, 'is-selected', n.dataset.key === `p:${this.selected}`);
    }
  }

  private paintComment(): void {
    const p = PRESETS.find((x) => x.id === this.selected);
    setHidden(this.comment, !p);
    if (!p) return;
    setText(this.comment, p.target
      ? `${p.name}: the demo writes ${TARGET_LABEL[p.target]} for this preset${p.target === 'webm' ? ' (VP9 or VP8 with Opus audio, at the preset frame size and rate)' : ''}.`
      : `${p.name}: the desktop engine writes this format through FFmpeg or its delivery tools. A browser cannot, so the demo skips it.`);
  }

  private apply(): void {
    if (!this.selected) { toast('Select a preset first'); return; }
    const itemId = store.selectedItem || store.items[0]?.id;
    if (!itemId) { toast('Add a source first'); return; }
    store.addOutput(itemId, this.selected);
  }
}
