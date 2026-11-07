import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setDisabled, setHidden, setStyleVar, setText, setTitle } from '../../../../frontend/src/ui/dom';
import { fmtDuration } from '../../../../frontend/src/ui/format';
import { icon } from '../../../../frontend/src/ui/icons';
import { contextMenu } from '../../../../frontend/src/ui/popup';
import { toast } from '../../../../frontend/src/ui/toast';
import { canvasBlob, saveBlob } from '../lib/save';
import { timecode } from '../lib/timecode';
import { readFrame } from '../media/access';
import { playable, stemOf, type Media } from '../model';
import { store, type View } from '../store';
import { openContactSheet, openConvert } from '../tools';

const rootTime = (m: Media, n: number): number => m.offset + n / m.fps;

class Side {
  readonly fig: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private readonly cap: HTMLElement;
  private readonly note: HTMLElement;
  frame = -1;

  constructor(readonly slot: 'a' | 'b', root: HTMLElement) {
    this.fig = q(root, `.ins-fig[data-f="${slot}"]`);
    this.canvas = q<HTMLCanvasElement>(this.fig, 'canvas');
    this.cap = q(this.fig, 'figcaption');
    this.note = q(this.fig, '.ins-fig-note');
  }

  size(w: number, h: number): void {
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    setStyleVar(this.canvas, '--cw', `${w}px`);
    setStyleVar(this.canvas, '--ch', `${h}px`);
  }

  index(m: Media, T: number): number {
    return Math.floor((T - m.offset) * m.fps + 1e-3);
  }

  caption(m: Media | undefined, idx: number): void {
    const tag = this.slot.toUpperCase();
    if (!m) { setText(this.cap, `${tag}  No file`); return; }
    const where = m.form === 'sequence' && m.names[idx] ? m.names[idx] : idx >= 0 && idx < m.frames ? `frame ${idx} of ${m.frames}` : 'outside this file';
    setText(this.cap, `${tag}  ${m.name}  ·  ${where}`);
  }

  setNote(text: string): void {
    setText(this.note, text);
    setHidden(this.note, !text);
  }

  async draw(m: Media | undefined, T: number, still: () => boolean): Promise<void> {
    if (!m || !playable(m)) {
      this.caption(m, -1);
      this.setNote(m && m.state === 'loading' ? 'Loading' : '');
      return;
    }
    const idx = this.index(m, T);
    this.caption(m, idx);
    if (idx < 0 || idx >= m.frames) {
      const g = this.canvas.getContext('2d');
      if (this.canvas.width !== m.width) this.size(m.width, m.height);
      g?.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.frame = -1;
      this.setNote('This file does not cover this frame');
      return;
    }
    this.setNote('');
    if (idx === this.frame && this.canvas.dataset.id === m.id) return;
    const t = (idx + 0.5) / m.fps;
    await readFrame(m, t, (img, w, h) => {
      if (!still()) return;
      this.size(w, h);
      this.canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
      this.canvas.dataset.id = m.id;
      this.frame = idx;
    });
  }

  blank(): void {
    this.frame = -1;
    this.canvas.dataset.id = '';
  }
}

export class ViewerPanel implements Panel {
  readonly id = 'viewer';
  readonly title = 'Viewer';
  readonly el: HTMLElement;
  private readonly a: Side;
  private readonly b: Side;
  private readonly stage: HTMLElement;
  private busy = false;
  private again = false;
  private gen = 0;
  private playing = false;
  private pan = { x: 0, y: 0 };
  private sig = '';
  private optSig = '';

  constructor() {
    this.el = el(`<div class="ins-viewer" tabindex="0" data-automation-id="viewer">
      <div class="fe-bar ins-vbar">
        <span class="ins-slot-tag">A</span><select class="fx-select ins-slot" data-s="a" title="File shown as A"></select>
        <span class="ins-slot-tag">B</span><select class="fx-select ins-slot" data-s="b" title="File shown as B"></select>
        <div class="fe-seg ins-views"><button type="button" data-v="a">A</button><button type="button" data-v="b">B</button><button type="button" data-v="compare">Compare</button></div>
        <span class="fx-flex"></span>
        <div class="fe-seg ins-zoom"><button type="button" data-z="fit" title="Fit the stage">Fit</button><button type="button" data-z="actual" title="One source pixel per screen pixel; drag to pan both">1:1</button></div>
      </div>
      <div class="ins-stage">
        <figure class="ins-fig" data-f="a"><canvas width="16" height="9"></canvas><figcaption></figcaption><span class="ins-fig-note" hidden></span></figure>
        <figure class="ins-fig" data-f="b"><canvas width="16" height="9"></canvas><figcaption></figcaption><span class="ins-fig-note" hidden></span></figure>
      </div>
      <div class="ins-tr">
        <div class="ins-tr-btns">
          <button class="cv-icon-btn" type="button" data-a="first" title="First frame (Home)">${icon('chevronLeft', 14)}${icon('chevronLeft', 14)}</button>
          <button class="cv-icon-btn" type="button" data-a="prev" title="Back one frame (Left)">${icon('chevronLeft', 16)}</button>
          <button class="cv-icon-btn ins-play" type="button" data-a="play" title="Play or pause (Space)">${icon('play', 16)}</button>
          <button class="cv-icon-btn" type="button" data-a="next" title="Forward one frame (Right)">${icon('chevronRight', 16)}</button>
          <button class="cv-icon-btn" type="button" data-a="last" title="Last frame (End)">${icon('chevronRight', 14)}${icon('chevronRight', 14)}</button>
        </div>
        <span class="ins-tc">00:00:00:00</span>
        <div class="ins-scrub" tabindex="-1"><span class="ins-scrub-range"></span><span class="ins-scrub-head"></span></div>
        <span class="ins-fr"></span>
      </div>
      <div class="fe-es-rangebtns ins-tr2">
        <button class="cv-btn" type="button" data-a="in" title="Set In (I)">Set In</button>
        <button class="cv-btn" type="button" data-a="out" title="Set Out (O)">Set Out</button>
        <button class="cv-btn" type="button" data-a="clear">Clear</button>
        <span class="fe-es-rangelabel ins-range"></span>
        <span class="fx-flex"></span>
        <button class="cv-btn" type="button" data-a="save">${icon('image', 13)}Save Frame</button>
        <button class="cv-btn" type="button" data-a="sheet">${icon('layers', 13)}Contact Sheet</button>
        <button class="cv-btn" type="button" data-a="export">${icon('sequence', 13)}Convert</button>
      </div>
    </div>`);
    this.stage = q(this.el, '.ins-stage');
    this.a = new Side('a', this.el);
    this.b = new Side('b', this.el);
    this.wire();
    store.on('slots', () => this.slotsChanged());
    store.on('items', () => this.itemsChanged());
    store.on('view', () => this.paintView());
    store.on('frame', () => { if (!this.playing) { this.paintTransport(); this.request(); } else this.paintTransport(); });
    store.on('marks', () => this.paintTransport());
    this.paintView();
    this.syncOptions();
    this.paintTransport();
    this.request();
  }

  shown(): void {
    this.request();
  }

  resized(): void {
    this.paintTransport();
  }

  private wire(): void {
    for (const s of Array.from(this.el.querySelectorAll<HTMLSelectElement>('.ins-slot'))) {
      s.addEventListener('change', () => {
        if (s.dataset.s === 'a') store.setSlots(s.value, store.slotB);
        else store.setSlots(store.slotA, s.value);
      });
    }
    for (const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('[data-v]'))) b.addEventListener('click', () => store.setView(b.dataset.v as View));
    for (const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('[data-z]'))) b.addEventListener('click', () => { store.setZoom(b.dataset.z as 'fit' | 'actual'); this.el.focus(); });
    const act = (name: string, fn: () => void): void => q(this.el, `[data-a="${name}"]`).addEventListener('click', fn);
    act('first', () => this.go(0));
    act('last', () => this.go(Number.MAX_SAFE_INTEGER));
    act('prev', () => this.step(-1));
    act('next', () => this.step(1));
    act('play', () => void this.toggle());
    act('in', () => this.mark('in'));
    act('out', () => this.mark('out'));
    act('clear', () => store.setMarks(null, null));
    act('save', () => this.saveMenu());
    act('sheet', () => openContactSheet());
    act('export', () => openConvert());
    this.el.addEventListener('keydown', (e) => this.key(e));
    const scrub = q(this.el, '.ins-scrub');
    const seek = (e: PointerEvent): void => {
      const m = store.master();
      if (!m) return;
      const r = scrub.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      this.stop();
      store.setFrame(f * (m.frames - 1));
    };
    scrub.addEventListener('pointerdown', (e) => {
      scrub.setPointerCapture(e.pointerId);
      seek(e);
      const move = (ev: PointerEvent): void => seek(ev);
      const up = (): void => { scrub.removeEventListener('pointermove', move); scrub.removeEventListener('pointerup', up); };
      scrub.addEventListener('pointermove', move);
      scrub.addEventListener('pointerup', up);
    });
    this.stage.addEventListener('pointerdown', (e) => {
      this.el.focus();
      if (store.zoom !== 'actual') return;
      const sx = e.clientX, sy = e.clientY, px = this.pan.x, py = this.pan.y;
      this.stage.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent): void => this.setPan(px + ev.clientX - sx, py + ev.clientY - sy);
      const up = (): void => { this.stage.removeEventListener('pointermove', move); this.stage.removeEventListener('pointerup', up); };
      this.stage.addEventListener('pointermove', move);
      this.stage.addEventListener('pointerup', up);
    });
  }

  private setPan(x: number, y: number): void {
    const m = store.a() ?? store.b();
    const lx = m ? m.width / 2 : 0;
    const ly = m ? m.height / 2 : 0;
    this.pan = { x: Math.max(-lx, Math.min(lx, x)), y: Math.max(-ly, Math.min(ly, y)) };
    setStyleVar(this.stage, '--px', `${this.pan.x}px`);
    setStyleVar(this.stage, '--py', `${this.pan.y}px`);
  }

  private key(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).tagName === 'SELECT') return;
    const big = e.shiftKey ? 10 : 1;
    const map: Record<string, () => void> = {
      ArrowLeft: () => this.step(-big),
      ArrowRight: () => this.step(big),
      Home: () => this.go(0),
      End: () => this.go(Number.MAX_SAFE_INTEGER),
      ' ': () => void this.toggle(),
      i: () => this.mark('in'),
      o: () => this.mark('out'),
      '1': () => store.setZoom('actual'),
      f: () => store.setZoom('fit'),
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    fn();
  }

  private go(n: number): void {
    this.stop();
    store.setFrame(n);
  }

  private step(d: number): void {
    this.stop();
    store.setFrame(store.frame + d);
  }

  private mark(which: 'in' | 'out'): void {
    const f = store.frame;
    if (which === 'in') store.setMarks(f, store.markOut !== null && store.markOut < f ? null : store.markOut);
    else store.setMarks(store.markIn !== null && store.markIn > f ? null : store.markIn, f);
  }

  private slotsChanged(): void {
    this.syncOptions();
    this.a.blank();
    this.b.blank();
    const m = store.master();
    if (m) store.setFrame(Math.min(store.frame, m.frames - 1));
    this.paintTransport();
    this.request();
  }

  private itemsChanged(): void {
    this.syncOptions();
    const a = store.a();
    const b = store.b();
    const sig = `${a?.id}:${a?.state}:${b?.id}:${b?.state}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.paintTransport();
      this.request();
    }
  }

  private syncOptions(): void {
    const list = store.items.filter((m) => m.form === 'video' || m.form === 'sequence');
    const sig = list.map((m) => `${m.id}${m.name}${m.state}`).join('|') + store.slotA + store.slotB;
    if (sig === this.optSig) return;
    this.optSig = sig;
    for (const s of Array.from(this.el.querySelectorAll<HTMLSelectElement>('.ins-slot'))) {
      patchList(s, list, {
        key: (m) => m.id,
        create: () => document.createElement('option'),
        update: (n, m) => {
          const o = n as HTMLOptionElement;
          o.value = m.id;
          const text = `${m.role === 'source' ? '' : m.role === 'proxy' ? 'Proxy: ' : 'Output: '}${m.name}`;
          if (o.textContent !== text) o.textContent = text;
          o.disabled = m.state === 'loading';
        },
      });
      const want = s.dataset.s === 'a' ? store.slotA : store.slotB;
      if (s.value !== want) s.value = want;
    }
  }

  private paintView(): void {
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-v]'))) setClass(b, 'is-active', b.dataset.v === store.view);
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-z]'))) setClass(b, 'is-active', b.dataset.z === store.zoom);
    setClass(this.stage, 'is-compare', store.view === 'compare');
    setClass(this.stage, 'is-actual', store.zoom === 'actual');
    setHidden(this.a.fig, store.view === 'b');
    setHidden(this.b.fig, store.view === 'a');
    if (store.zoom === 'fit') this.setPan(0, 0);
  }

  private paintTransport(): void {
    const m = store.master();
    const frames = m?.frames ?? 0;
    const f = Math.min(store.frame, Math.max(0, frames - 1));
    setText(q(this.el, '.ins-tc'), m && m.fps ? timecode(f + Math.round(m.offset * m.fps), m.fps) : '--:--:--:--');
    setText(q(this.el, '.ins-fr'), m ? `Frame ${f} of ${frames}` : '');
    const span = Math.max(1, frames - 1);
    const head = q(this.el, '.ins-scrub-head');
    setStyleVar(head, '--x', String(m ? f / span : 0));
    const range = q(this.el, '.ins-scrub-range');
    const a = store.markIn;
    const b = store.markOut;
    setStyleVar(range, '--a', String(a !== null ? a / span : 0));
    setStyleVar(range, '--b', String(b !== null ? b / span : a !== null ? 1 : 0));
    setHidden(range, a === null && b === null);
    for (const n of ['first', 'prev', 'play', 'next', 'last', 'in', 'out']) setDisabled(q<HTMLButtonElement>(this.el, `[data-a="${n}"]`), !m);
    setDisabled(q<HTMLButtonElement>(this.el, '[data-a="clear"]'), a === null && b === null);
    const rl = q(this.el, '.ins-range');
    if (m && (a !== null || b !== null)) {
      const from = a ?? 0;
      const to = b ?? frames - 1;
      setText(rl, `In ${timecode(from, m.fps)} · Out ${timecode(to, m.fps)} · ${to - from + 1} frames · ${fmtDuration((to - from + 1) / m.fps)}`);
    } else setText(rl, m ? `Entire file · ${frames} frames · ${fmtDuration(m.duration)}` : '');
    const play = q(this.el, '.ins-play');
    if (play.dataset.on !== String(this.playing)) {
      play.dataset.on = String(this.playing);
      play.innerHTML = icon(this.playing ? 'pause' : 'play', 16);
      setClass(play, 'is-active', this.playing);
      setTitle(play, this.playing ? 'Pause (Space)' : 'Play (Space)');
    }
  }

  request(): void {
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    void this.run();
  }

  private async run(): Promise<void> {
    do {
      this.again = false;
      const my = ++this.gen;
      const m = store.master();
      if (!m) { this.busy = false; return; }
      const T = rootTime(m, store.frame);
      const still = (): boolean => my === this.gen;
      const note = q(this.el, '.ins-stage');
      setClass(note, 'is-busy', true);
      try {
        await Promise.all([this.a.draw(store.a(), T, still), this.b.draw(store.b(), T, still)]);
      } catch (err) {
        store.log(`Viewer: ${(err as Error).message}`, true);
      }
      setClass(note, 'is-busy', false);
    } while (this.again);
    this.busy = false;
  }

  private stop(): void {
    if (!this.playing) return;
    this.playing = false;
    for (const m of [store.a(), store.b()]) void this.videoOf(m).then((v) => v?.pause());
    this.paintTransport();
    this.a.blank();
    this.b.blank();
    this.request();
  }

  private async videoOf(m: Media | undefined): Promise<HTMLVideoElement | null> {
    if (!m || m.form !== 'video' || !m.source) return null;
    const v = await readFrame(m, 0, (img) => img);
    return v instanceof HTMLVideoElement ? v : null;
  }

  private async toggle(): Promise<void> {
    if (this.playing) { this.stop(); return; }
    const m = store.master();
    if (!m) return;
    if (store.frame >= m.frames - 1) store.setFrame(0);
    this.playing = true;
    this.paintTransport();
    const T0 = rootTime(m, store.frame);
    const vids = new Map<string, HTMLVideoElement>();
    for (const s of [store.a(), store.b()]) {
      const v = await this.videoOf(s);
      if (s && v) vids.set(s.id, v);
    }
    const began = performance.now();
    const sides: Array<[Side, Media | undefined]> = [[this.a, store.a()], [this.b, store.b()]];
    const tick = (): void => {
      if (!this.playing) return;
      const T = T0 + (performance.now() - began) / 1000;
      const n = Math.floor((T - m.offset) * m.fps);
      if (n >= m.frames) { store.frame = m.frames - 1; this.stop(); store.emit('frame'); return; }
      for (const [side, s] of sides) {
        if (!s || !playable(s)) continue;
        const mt = T - s.offset;
        const idx = side.index(s, T);
        if (mt < 0 || idx >= s.frames) { side.caption(s, idx); continue; }
        const v = vids.get(s.id);
        if (v) {
          if (v.paused) { v.currentTime = mt; void v.play().catch(() => undefined); }
          if (v.readyState >= 2 && !v.seeking) {
            side.size(v.videoWidth, v.videoHeight);
            side.canvas.getContext('2d')?.drawImage(v, 0, 0, v.videoWidth, v.videoHeight);
            side.canvas.dataset.id = s.id;
          }
          side.caption(s, idx);
        } else if (idx !== side.frame) {
          side.frame = idx;
          side.caption(s, idx);
          void readFrame(s, (idx + 0.5) / s.fps, (img, w, h) => { side.size(w, h); side.canvas.getContext('2d')?.drawImage(img, 0, 0, w, h); });
        }
      }
      if (n !== store.frame) { store.frame = Math.max(0, n); store.emit('frame'); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private saveMenu(): void {
    const r = q(this.el, '[data-a="save"]').getBoundingClientRect();
    const frame = store.frame;
    const one = async (side: Side, m: Media | undefined): Promise<void> => {
      if (!m || !side.canvas.width || side.frame < 0) { toast('Nothing to save for this side'); return; }
      saveBlob(await canvasBlob(side.canvas), `${stemOf(m.name)}_${String(frame).padStart(5, '0')}.png`);
    };
    contextMenu(r.left, r.top - 4, [
      { label: 'Save A Frame (PNG)', enabled: !!store.a(), run: () => void one(this.a, store.a()) },
      { label: 'Save B Frame (PNG)', enabled: !!store.b(), run: () => void one(this.b, store.b()) },
      '-',
      { label: 'Save A and B Side by Side (PNG)', enabled: !!store.a() && !!store.b(), run: () => void this.sideBySide() },
    ]);
  }

  private async sideBySide(): Promise<void> {
    const a = store.a();
    const b = store.b();
    if (!a || !b || this.a.frame < 0 || this.b.frame < 0) { toast('Both sides need a frame'); return; }
    const h = Math.max(this.a.canvas.height, this.b.canvas.height);
    const c = document.createElement('canvas');
    const wa = Math.round((this.a.canvas.width * h) / this.a.canvas.height);
    const wb = Math.round((this.b.canvas.width * h) / this.b.canvas.height);
    c.width = wa + wb + 8;
    c.height = h;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(this.a.canvas, 0, 0, wa, h);
    g.drawImage(this.b.canvas, wa + 8, 0, wb, h);
    saveBlob(await canvasBlob(c), `${stemOf(a.name)}_vs_${stemOf(b.name)}_${String(store.frame).padStart(5, '0')}.png`);
  }
}
