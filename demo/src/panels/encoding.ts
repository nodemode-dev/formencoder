import type { Panel } from '../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setHidden, setStyleVar, setText, setTitle } from '../../../frontend/src/ui/dom';
import { fmtClock, STATUS_LABEL } from '../../../frontend/src/ui/format';
import { icon } from '../../../frontend/src/ui/icons';
import { PRESET_BY_ID } from '../engine/presets';
import { store, type Output } from '../state';
import { previewOutput, saveOutput } from './preview';

interface Row {
  item: string;
  output: Output;
}

export class EncodingPanel implements Panel {
  readonly id = 'encoding';
  readonly title = 'Encoding';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;

  constructor() {
    this.el = el(`<div class="fe-enc">
      <div class="fe-enc-sum"><span class="fe-enc-line"></span></div>
      <div class="fe-enc-list"></div>
      <div class="fe-enc-empty">${icon('film', 26)}<span>Nothing has run yet. Press Start in the Queue.</span></div>
    </div>`);
    this.list = q(this.el, '.fe-enc-list');
    store.on('items', () => this.render());
    store.on('run', () => this.render());
    store.on('progress', (o) => this.patch(o as Output));
    this.render();
  }

  private rows(): Row[] {
    const out: Row[] = [];
    for (const item of store.items) for (const o of item.outputs) if (o.status !== 'ready') out.push({ item: item.source.name, output: o });
    return out;
  }

  private render(): void {
    const rows = this.rows();
    const done = rows.filter((r) => r.output.status === 'done').length;
    const failed = rows.filter((r) => r.output.status === 'failed').length;
    setText(q(this.el, '.fe-enc-line'), `${store.running ? 'Encoding' : 'Idle'} · ${done} done · ${failed} failed · ${rows.length} touched`);
    setHidden(q(this.el, '.fe-enc-empty'), rows.length > 0);
    setHidden(this.list, rows.length === 0);
    patchList(this.list, rows, {
      key: (r) => r.output.id,
      create: (r) => this.create(r),
      update: (n, r) => { setText(q(n, '.fe-enc-src'), r.item); this.update(n, r.output); },
    });
  }

  private create(r: Row): HTMLElement {
    const n = el(`<div class="fe-enc-row" data-out="${r.output.id}">
      <div class="fe-enc-shot"><canvas class="fd-enc-canvas" width="352" height="198"></canvas><span class="fe-enc-shot-label"></span></div>
      <div class="fe-enc-info">
        <div class="fe-enc-title"><span class="fe-enc-src"></span><span class="fe-enc-arrow">${icon('chevronRight', 12)}</span><span class="fe-enc-out"></span></div>
        <div class="fe-enc-preset"></div>
        <div class="fe-enc-progress"><span class="fe-bar-track"><span class="fe-bar-fill"></span></span><span class="fe-enc-pct"></span></div>
        <div class="fe-enc-stats"><span data-s="elapsed"></span><span data-s="left"></span><span data-s="fps"></span><span data-s="speed"></span></div>
        <div class="fe-enc-msg"></div>
      </div>
      <div class="fd-enc-btns">
        <button class="cv-icon-btn" type="button" data-a="stop" title="Stop the queue">${icon('stop', 14)}</button>
        <button class="cv-icon-btn" type="button" data-a="play" title="Preview the output">${icon('eye', 14)}</button>
        <button class="cv-icon-btn" type="button" data-a="save" title="Save the output file">${icon('ingest', 14)}</button>
      </div>
    </div>`);
    q(n, '[data-a="stop"]').addEventListener('click', () => store.stop());
    q(n, '[data-a="play"]').addEventListener('click', () => previewOutput(r.output.id));
    q(n, '[data-a="save"]').addEventListener('click', () => saveOutput(r.output.id));
    return n;
  }

  private patch(o: Output): void {
    const n = this.list.querySelector<HTMLElement>(`[data-out="${o.id}"]`);
    if (n) this.update(n, o);
    else this.render();
  }

  private update(n: HTMLElement, o: Output): void {
    const preset = PRESET_BY_ID.get(o.presetId);
    const pct = Math.max(0, Math.min(1, o.progress));
    setText(q(n, '.fe-enc-out'), o.fileName);
    setTitle(q(n, '.fe-enc-out'), o.fileName);
    setText(q(n, '.fe-enc-preset'), preset?.name ?? '');
    setStyleVar(q(n, '.fe-bar-fill'), '--p', String(pct));
    setText(q(n, '.fe-enc-pct'), o.status === 'encoding' ? `${(pct * 100).toFixed(1)}%` : STATUS_LABEL[o.status] ?? o.status);
    setText(q(n, '[data-s="elapsed"]'), `Elapsed ${fmtClock(o.elapsed)}`);
    setText(q(n, '[data-s="left"]'), `Remaining ${o.status === 'encoding' ? fmtClock(o.eta) : '--:--'}`);
    setText(q(n, '[data-s="fps"]'), o.fps && o.status === 'encoding' ? `${o.fps.toFixed(1)} fps` : '');
    setText(q(n, '[data-s="speed"]'), o.speed && o.status === 'encoding' ? `${o.speed.toFixed(2)}x` : '');
    setText(q(n, '.fe-enc-msg'), o.status === 'done' ? [o.encoder, o.note].filter(Boolean).join('. ') : o.message);
    setClass(n, 'is-preparing', o.status === 'preparing');
    setClass(n, 'is-done', o.status === 'done');
    setClass(n, 'is-active', o.status === 'encoding' || o.status === 'preparing');
    this.shot(n, o);
  }

  private shot(n: HTMLElement, o: Output): void {
    const src = store.previewFor(o.id);
    if (!src || !src.width) return;
    const canvas = q<HTMLCanvasElement>(n, '.fd-enc-canvas');
    const g = canvas.getContext('2d');
    if (!g) return;
    g.fillStyle = '#000';
    g.fillRect(0, 0, canvas.width, canvas.height);
    const k = Math.min(canvas.width / src.width, canvas.height / src.height);
    const w = src.width * k, h = src.height * k;
    g.drawImage(src, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    setText(q(n, '.fe-enc-shot-label'), `${src.width}x${src.height}`);
  }
}
