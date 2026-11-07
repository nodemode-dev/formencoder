import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setHidden, setText, setTitle } from '../../../../frontend/src/ui/dom';
import { fmtBytes, fmtDuration } from '../../../../frontend/src/ui/format';
import { icon } from '../../../../frontend/src/ui/icons';
import { contextMenu } from '../../../../frontend/src/ui/popup';
import { rateLabel } from '../lib/timecode';
import type { Media } from '../model';
import { store } from '../store';
import { createProxy, openContactSheet, openConvert } from '../tools';
import { pickFiles } from '../intake';
import { runIngest } from './checksums';

function sub(m: Media): string {
  if (m.state === 'loading') return 'loading';
  if (m.state === 'failed') return 'failed to load';
  if (m.form === 'sequence' && m.seq) return `${m.seq.count} frames · ${m.width}x${m.height}`;
  return [fmtDuration(m.duration), `${m.width}x${m.height}`, m.fps ? `${rateLabel(m.fps)} fps` : ''].filter(Boolean).join(' · ');
}

export class BrowserPanel implements Panel {
  readonly id = 'browser';
  readonly title = 'Media Browser';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;

  constructor() {
    this.el = el(`<div class="fe-media ins-browser">
      <div class="fe-bar">
        <span class="fe-bar-title">${icon('folder', 14)}<span>Hike shoot</span></span>
        <span class="fx-flex"></span>
        <button class="cv-icon-btn" type="button" data-a="view" title="Thumbnails or list">${icon('image', 15)}</button>
      </div>
      <div class="fe-m-path">hike-shoot/ · 3 clips, 1 numbered sequence</div>
      <div class="fe-m-list is-grid" tabindex="0" data-automation-id="media.list"></div>
      <div class="fe-m-foot"><span class="fe-m-count"></span><span class="fx-flex"></span><button class="cv-btn" type="button" data-a="open">${icon('plus', 13)}Open Files</button></div>
    </div>`);
    this.list = q(this.el, '.fe-m-list');
    q(this.el, '[data-a="view"]').addEventListener('click', () => setClass(this.list, 'is-grid', !this.list.classList.contains('is-grid')));
    q(this.el, '[data-a="open"]').addEventListener('click', () => pickFiles());
    store.on('items', () => this.paint());
    store.on('slots', () => this.paint());
    this.paint();
  }

  private paint(): void {
    const src = store.sources();
    patchList(this.list, src, {
      key: (m) => m.id,
      create: () => this.create(),
      update: (n, m) => this.update(n, m),
    });
    const loaded = src.filter((m) => m.state === 'ready').length;
    setText(q(this.el, '.fe-m-count'), `${src.length} sources${loaded < src.length ? ` · ${src.length - loaded} loading` : ''}`);
  }

  private create(): HTMLElement {
    const n = el(`<div class="fe-m-row ins-row" tabindex="-1"><span class="fe-m-thumb"><img alt="" hidden><span class="fe-m-ic"></span><span class="ins-slot-badge"></span></span><span class="fe-m-name"></span><span class="fe-m-sub"></span></div>`);
    n.addEventListener('click', (e) => {
      const m = store.get(n.dataset.key as string);
      if (!m || m.state !== 'ready') return;
      if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) store.setSlots(store.slotA, m.id);
      else store.setSlots(m.id, store.slotB === m.id ? '' : store.slotB);
    });
    n.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const m = store.get(n.dataset.key as string);
      if (!m || m.state !== 'ready') return;
      contextMenu(e.clientX, e.clientY, [
        { label: 'Show in A', run: () => store.setSlots(m.id, store.slotB) },
        { label: 'Show in B', run: () => store.setSlots(store.slotA, m.id) },
        { label: 'Compare With A', enabled: store.slotA !== m.id, run: () => { store.setSlots(store.slotA, m.id); store.setView('compare'); } },
        '-',
        { label: 'Create Proxies', enabled: m.form === 'video', run: () => void createProxy(m) },
        { label: 'Ingest...', run: () => void runIngest([m]) },
        { label: 'Convert...', run: () => { store.setSlots(m.id, store.slotB); openConvert(); } },
        { label: 'Contact Sheet', run: () => { store.setSlots(m.id, store.slotB); openContactSheet(); } },
      ]);
    });
    return n;
  }

  private update(n: HTMLElement, m: Media): void {
    setText(q(n, '.fe-m-name'), m.name);
    setText(q(n, '.fe-m-sub'), sub(m));
    setTitle(n, `${m.name}\n${m.label}\n${fmtBytes(m.size)}\nClick shows it in A, Shift-click in B`);
    const img = q<HTMLImageElement>(n, 'img');
    if (m.thumb && img.getAttribute('src') !== m.thumb) {
      img.setAttribute('src', m.thumb);
      setHidden(img, false);
      setClass(n, 'has-thumb', true);
    }
    const ic = q(n, '.fe-m-ic');
    const want = m.form === 'sequence' ? 'sequence' : 'film';
    if (ic.dataset.k !== want) { ic.dataset.k = want; ic.innerHTML = icon(want, 22); }
    const badge = m.id === store.slotA ? 'A' : m.id === store.slotB ? 'B' : '';
    setText(q(n, '.ins-slot-badge'), badge);
    setClass(n, 'is-selected', badge !== '');
    setClass(n, 'is-loading', m.state === 'loading');
  }
}
