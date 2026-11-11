import type { Ctx } from '../app/ctx';
import { presetEntries } from '../ui/choosers';
import type { Panel } from '../ui/dock';
import { el, patchList, q, setClass, setHidden, setHtml, setText, setTitle } from '../ui/dom';
import { fmtBytes, fmtDuration } from '../ui/format';
import { icon } from '../ui/icons';
import { contextMenu } from '../ui/popup';
import { readLocal, writeLocal } from '../ui/storage';
import { DND_PATHS } from './queue';

interface Entry {
  name: string;
  path: string;
  dir: boolean;
  kind?: string;
  size?: number;
  frames?: number;
  card?: string | null;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
}

const KIND_ICON: Record<string, string> = { video: 'film', audio: 'audio', image: 'image', sequence: 'sequence', link: 'link' };

export class MediaPanel implements Panel {
  readonly id = 'media';
  readonly title = 'Media Browser';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private path = '';
  private parent: string | null = null;
  private history: string[] = [];
  private selected = new Set<string>();
  private entries: Entry[] = [];
  private loaded = false;
  private thumbs = new IntersectionObserver((rows) => this.loadThumbs(rows), { rootMargin: '120px' });

  constructor(private readonly ctx: Ctx) {
    this.el = el(`<div class="fe-media">
      <div class="fe-bar">
        <button class="cv-icon-btn" type="button" data-a="back" title="Back">${icon('chevronLeft', 15)}</button>
        <button class="cv-icon-btn" type="button" data-a="up" title="Up one folder">${icon('chevronUp', 15)}</button>
        <select class="fx-select fe-m-roots" title="Locations"></select>
        <select class="fx-select fe-m-filter" title="Show">
          <option value="media">Media</option><option value="video">Video</option><option value="audio">Audio</option><option value="image">Images</option><option value="all">All files</option>
        </select>
        <input class="cv-input fe-m-search" placeholder="Search this folder" spellcheck="false">
        <button class="cv-icon-btn" type="button" data-a="view" title="Thumbnails or list">${icon('image', 15)}</button>
      </div>
      <div class="fe-m-path"></div>
      <div class="fe-m-list is-grid" tabindex="0" data-automation-id="media.list"></div>
      <div class="fe-m-foot"><span class="fe-m-count"></span><span class="fx-flex"></span><button class="cv-btn" type="button" data-a="queue">${icon('plus', 13)}Add to Queue</button></div>
    </div>`);
    this.list = q(this.el, '.fe-m-list');
    q(this.el, '[data-a="back"]').addEventListener('click', () => {
      const prev = this.history.pop();
      if (prev) void this.go(prev, false);
    });
    q(this.el, '[data-a="up"]').addEventListener('click', () => {
      if (this.parent && this.parent !== this.path) void this.go(this.parent);
    });
    q(this.el, '[data-a="view"]').addEventListener('click', () => setClass(this.list, 'is-grid', !this.list.classList.contains('is-grid')));
    q(this.el, '[data-a="queue"]').addEventListener('click', () => this.addSelected());
    q<HTMLSelectElement>(this.el, '.fe-m-roots').addEventListener('change', (e) => void this.go((e.target as HTMLSelectElement).value));
    q<HTMLSelectElement>(this.el, '.fe-m-filter').addEventListener('change', () => void this.go(this.path, false));
    let t = 0;
    q<HTMLInputElement>(this.el, '.fe-m-search').addEventListener('input', () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void this.go(this.path, false), 220);
    });
    this.list.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addSelected();
    });
  }

  shown(): void {
    if (!this.loaded) {
      this.loaded = true;
      void this.init();
    }
  }

  private async init(): Promise<void> {
    const r = await this.ctx.run<{ roots: Array<{ name: string; path: string; volume?: boolean }> }>('media.roots', {}, true);
    const sel = q<HTMLSelectElement>(this.el, '.fe-m-roots');
    for (const root of r?.roots ?? []) sel.appendChild(Object.assign(document.createElement('option'), { value: root.path, textContent: root.volume ? `${root.name} (volume)` : root.name }));
    await this.go(readLocal('formencoder.media.path') || r?.roots?.[0]?.path || '/', false);
  }

  async go(path: string, push = true): Promise<void> {
    const filter = q<HTMLSelectElement>(this.el, '.fe-m-filter').value;
    const query = q<HTMLInputElement>(this.el, '.fe-m-search').value.trim();
    const r = await this.ctx.run<{ path: string; parent: string | null; entries: Entry[] }>('media.browse', { path, filter, ...(query ? { query } : {}) });
    if (!r) return;
    if (push && this.path && this.path !== r.path) this.history.push(this.path);
    if (this.path !== r.path) this.selected.clear();
    this.path = r.path;
    this.parent = r.parent;
    writeLocal('formencoder.media.path', r.path);
    this.entries = r.entries;
    setText(q(this.el, '.fe-m-path'), r.path);
    setTitle(q(this.el, '.fe-m-path'), r.path);
    const files = r.entries.filter((e) => !e.dir).length;
    setText(q(this.el, '.fe-m-count'), `${files} item${files === 1 ? '' : 's'}${r.entries.length >= 5000 ? ' (first 5000)' : ''}`);
    patchList(this.list, r.entries, {
      key: (e) => e.path,
      create: () => this.create(),
      update: (n, e) => this.update(n, e),
    });
    this.list.scrollTop = 0;
  }

  private create(): HTMLElement {
    const n = el(`<div class="fe-m-row" draggable="true"><span class="fe-m-thumb"><img alt="" loading="lazy" decoding="async" hidden><span class="fe-m-ic"></span></span><span class="fe-m-name"></span><span class="fe-m-sub"></span></div>`);
    n.addEventListener('click', (ev) => this.click(n.dataset.key as string, ev));
    n.addEventListener('dblclick', () => {
      const en = this.entries.find((x) => x.path === n.dataset.key);
      if (!en) return;
      if (en.dir) void this.go(en.path);
      else void this.ctx.run('queue.addSource', this.sourceParams([en]));
    });
    n.addEventListener('dragstart', (ev) => {
      const key = n.dataset.key as string;
      if (!this.selected.has(key)) this.select([key]);
      const picked = this.entries.filter((x) => this.selected.has(x.path) && !x.dir);
      if (!picked.length) {
        ev.preventDefault();
        return;
      }
      ev.dataTransfer?.setData(DND_PATHS, JSON.stringify(picked.map((x) => x.path)));
      ev.dataTransfer?.setData('text/plain', picked.map((x) => x.path).join('\n'));
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
    });
    n.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      const key = n.dataset.key as string;
      if (!this.selected.has(key)) this.select([key]);
      const picked = this.entries.filter((x) => this.selected.has(x.path));
      const files = picked.filter((x) => !x.dir);
      const paths = picked.map((x) => x.path);
      contextMenu(ev.clientX, ev.clientY, [
        { label: 'Add to Queue', enabled: files.length > 0, run: () => void this.ctx.run('queue.addSource', this.sourceParams(files)) },
        { label: 'Add to Queue With Preset', enabled: files.length > 0, children: () => presetEntries(this.ctx, null, (p) => void this.ctx.run('queue.addSource', { ...this.sourceParams(files), preset: p })) },
        { label: 'Stitch Clips Together', enabled: files.length > 1, run: () => void this.ctx.run('queue.stitch', { paths: files.map((f) => f.path) }) },
        '-',
        { label: 'Ingest...', run: () => void this.ctx.invoke('ingest.copy', { paths }) },
        { label: 'Create Proxies', enabled: files.length > 0, run: () => void this.ctx.run('proxy.create', { paths: files.map((f) => f.path) }) },
        { label: 'Analyze Media', enabled: files.length > 0, run: () => void this.ctx.run('analyze.media', { paths: files.map((f) => f.path) }) },
        { label: 'Watch This Folder', enabled: picked.length === 1 && picked[0].dir, run: () => void this.ctx.invoke('watch.add', { folder: picked[0].path }) },
        '-',
        { label: 'Media Info', enabled: files.length === 1, run: () => this.ctx.ui.emit('inspect', { path: files[0].path, name: files[0].name }) },
        { label: 'Copy Path', run: () => void navigator.clipboard?.writeText(paths.join('\n')) },
      ]);
    });
    this.thumbs.observe(n);
    return n;
  }

  private sourceParams(files: Entry[]): Record<string, unknown> {
    const seq = files.find((f) => f.kind === 'sequence');
    return seq ? { paths: [seq.path], frameRate: 25 } : { paths: files.map((f) => f.path) };
  }

  private update(n: HTMLElement, e: Entry): void {
    setClass(n, 'is-dir', e.dir);
    setHtml(q(n, '.fe-m-ic'), icon(e.dir ? (e.card ? 'ingest' : 'folder') : KIND_ICON[e.kind ?? ''] ?? 'file', 18), e.dir ? `d${e.card ?? ''}` : e.kind ?? 'f');
    setText(q(n, '.fe-m-name'), e.name);
    setTitle(n, e.path);
    const sub = e.dir ? (e.card ? `Camera card · ${e.card}` : 'Folder') : e.kind === 'sequence' ? `${e.frames} frames` : [fmtDuration(e.duration), e.width ? `${e.width}x${e.height}` : '', fmtBytes(e.size)].filter(Boolean).join(' · ');
    setText(q(n, '.fe-m-sub'), sub);
    n.dataset.thumb = !e.dir && (e.kind === 'video' || e.kind === 'image' || e.kind === 'sequence') ? '1' : '';
    setClass(n, 'is-selected', this.selected.has(e.path));
  }

  private loadThumbs(rows: IntersectionObserverEntry[]): void {
    for (const r of rows) {
      if (!r.isIntersecting) continue;
      const n = r.target as HTMLElement;
      this.thumbs.unobserve(n);
      if (n.dataset.thumb !== '1') continue;
      const img = q<HTMLImageElement>(n, 'img');
      const probe = new Image();
      probe.onload = () => {
        img.src = probe.src;
        setHidden(img, false);
        setClass(n, 'has-thumb', true);
      };
      probe.src = `/api/fs/thumb?path=${encodeURIComponent(n.dataset.key as string)}&at=1&width=200${n.dataset.key?.includes('%0') ? '&rate=25' : ''}`;
    }
  }

  private click(key: string, ev: MouseEvent): void {
    if (ev.metaKey || ev.ctrlKey) {
      if (this.selected.has(key)) this.selected.delete(key);
      else this.selected.add(key);
      this.select([...this.selected]);
    } else if (ev.shiftKey && this.selected.size) {
      const keys = this.entries.map((e) => e.path);
      const last = keys.indexOf([...this.selected].pop() as string);
      const at = keys.indexOf(key);
      this.select(keys.slice(Math.min(last, at), Math.max(last, at) + 1));
    } else this.select([key]);
    const en = this.entries.find((x) => x.path === key);
    if (en && !en.dir && this.selected.size === 1) this.ctx.ui.emit('inspect', { path: en.path, name: en.name });
  }

  private select(keys: string[]): void {
    this.selected = new Set(keys);
    for (const n of Array.from(this.list.children) as HTMLElement[]) setClass(n, 'is-selected', this.selected.has(n.dataset.key as string));
  }

  private addSelected(): void {
    const files = this.entries.filter((x) => this.selected.has(x.path) && !x.dir);
    if (files.length) void this.ctx.run('queue.addSource', this.sourceParams(files));
  }
}
