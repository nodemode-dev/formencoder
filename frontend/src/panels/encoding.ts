import type { Ctx } from '../app/ctx';
import type { Output, UiState } from '../engine/types';
import type { Panel } from '../ui/dock';
import { el, patchList, q, setClass, setHidden, setStyleVar, setText, setTitle, swapMedia } from '../ui/dom';
import { basename, fmtClock, STATUS_LABEL } from '../ui/format';
import { icon } from '../ui/icons';

interface Row {
  output: Output;
  item: string;
}

export class EncodingPanel implements Panel {
  readonly id = 'encoding';
  readonly title = 'Encoding';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private previews = true;
  private lastShot = new Map<string, number>();
  private visible = false;

  constructor(private readonly ctx: Ctx) {
    this.el = el(`<div class="fe-enc">
      <div class="fe-enc-sum"><span class="fe-enc-line"></span><span class="fx-flex"></span><label class="fe-check-label"><input type="checkbox" class="fx-check" data-a="previews" checked><span>Preview while encoding</span></label></div>
      <div class="fe-enc-list" data-automation-id="encoding.list"></div>
      <div class="fe-enc-empty">${icon('clock', 22)}<span>Nothing is encoding. Start the queue and each output shows here with a preview, its speed and the time left.</span></div>
    </div>`);
    this.list = q(this.el, '.fe-enc-list');
    const box = q<HTMLInputElement>(this.el, '[data-a="previews"]');
    box.addEventListener('change', () => {
      this.previews = box.checked;
      void ctx.run('prefs.set', { values: { previewWhileEncoding: box.checked } }, true);
    });
    ctx.client.events.on('open', async () => {
      const p = await ctx.run<{ prefs: Record<string, unknown> }>('prefs.get', {}, true);
      this.previews = p?.prefs?.previewWhileEncoding !== false;
      if (box.checked !== this.previews) box.checked = this.previews;
    });
    ctx.store.events.on('run', (st) => this.render(st));
    ctx.store.events.on('items', (st) => this.render(st));
    ctx.store.events.on('progress', (o) => {
      const row = this.list.querySelector<HTMLElement>(`[data-key="${CSS.escape(o.id)}"]`);
      if (row) this.update(row, { output: o, item: '' });
      else if (this.ctx.store.state) this.render(this.ctx.store.state);
    });
  }

  shown(): void {
    this.visible = true;
    if (this.ctx.store.state) this.render(this.ctx.store.state);
  }

  hidden(): void {
    this.visible = false;
  }

  private rows(st: UiState): Row[] {
    const out: Row[] = [];
    for (const it of st.items) for (const o of it.outputs) if (o.status === 'encoding' || o.status === 'preparing' || o.status === 'paused') out.push({ output: o, item: it.name });
    return out;
  }

  private render(st: UiState): void {
    const rows = this.rows(st);
    const c = st.counts;
    setText(q(this.el, '.fe-enc-line'), `${st.running ? (st.paused ? 'Paused' : 'Encoding') : 'Idle'} · ${c.done} done · ${c.ready} ready · ${c.failed} failed · ${c.total} outputs${st.hardware?.length ? ` · hardware: ${st.hardware.join(', ')}` : ''}`);
    setHidden(q(this.el, '.fe-enc-empty'), rows.length > 0);
    patchList(this.list, rows, {
      key: (r) => r.output.id,
      create: () => {
        const n = el(`<div class="fe-enc-row">
          <div class="fe-enc-shot"><img alt="" decoding="async"><span class="fe-enc-shot-label"></span></div>
          <div class="fe-enc-info">
            <div class="fe-enc-title"><span class="fe-enc-src"></span><span class="fe-enc-arrow">${icon('chevronRight', 12)}</span><span class="fe-enc-out"></span></div>
            <div class="fe-enc-preset"></div>
            <div class="fe-enc-progress"><span class="fe-bar-track"><span class="fe-bar-fill"></span></span><span class="fe-enc-pct"></span></div>
            <div class="fe-enc-stats"><span data-s="elapsed"></span><span data-s="left"></span><span data-s="fps"></span><span data-s="speed"></span><span data-s="encoder"></span></div>
            <div class="fe-enc-msg"></div>
          </div>
          <button class="cv-icon-btn" type="button" title="Stop this output">${icon('stop', 14)}</button>
        </div>`);
        q(n, 'button').addEventListener('click', () => void this.ctx.run('queue.stopCurrent', { refs: [n.dataset.key] }));
        return n;
      },
      update: (n, r) => {
        setText(q(n, '.fe-enc-src'), r.item);
        this.update(n, r);
      },
    });
  }

  private update(n: HTMLElement, r: Row): void {
    const o = r.output;
    const pct = Math.max(0, Math.min(1, Number(o.progress) || 0));
    setText(q(n, '.fe-enc-out'), basename(o.path || ''));
    setTitle(q(n, '.fe-enc-out'), o.path || '');
    setText(q(n, '.fe-enc-preset'), `${o.formatLabel} · ${o.presetName}`);
    setStyleVar(q(n, '.fe-bar-fill'), '--p', String(o.status === 'preparing' ? Number(o.fetch) || 0 : pct));
    setText(q(n, '.fe-enc-pct'), o.status === 'encoding' ? `${(pct * 100).toFixed(1)}%` : STATUS_LABEL[o.status] ?? o.status);
    setText(q(n, '[data-s="elapsed"]'), `Elapsed ${fmtClock(o.elapsed)}`);
    setText(q(n, '[data-s="left"]'), `Remaining ${fmtClock(o.eta)}`);
    setText(q(n, '[data-s="fps"]'), o.fps ? `${Number(o.fps).toFixed(1)} fps` : '');
    setText(q(n, '[data-s="speed"]'), o.speed ? `${Number(o.speed).toFixed(2)}x` : '');
    setText(q(n, '[data-s="encoder"]'), o.encoder ?? '');
    setText(q(n, '.fe-enc-msg'), o.message ?? '');
    setClass(n, 'is-preparing', o.status === 'preparing');
    this.shot(n, o);
  }

  private shot(n: HTMLElement, o: Output): void {
    if (!this.previews || !this.visible || o.status !== 'encoding' || o.kind !== 'encode') return;
    const now = performance.now();
    if (now - (this.lastShot.get(o.id) ?? 0) < 2500) return;
    this.lastShot.set(o.id, now);
    const t = Math.max(0, Number(o.outTime) || 0);
    const img = q<HTMLImageElement>(n, 'img');
    void swapMedia(img, `/api/preview.png?output=${encodeURIComponent(o.id)}&time=${t.toFixed(2)}&width=320`).then(() => setText(q(n, '.fe-enc-shot-label'), fmtClock(t))).catch(() => undefined);
  }
}
