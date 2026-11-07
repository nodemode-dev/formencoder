import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setHidden, setStyleVar, setText, setValue } from '../../../../frontend/src/ui/dom';
import { fmtClock } from '../../../../frontend/src/ui/format';
import { icon } from '../../../../frontend/src/ui/icons';
import { lumaStats } from '../engine/dsp';
import { fmt } from '../engine/meter';
import { timecode } from '../engine/overlay';
import { job } from '../job';
import { player } from '../player';

export class ProgrammePanel implements Panel {
  readonly id = 'programme';
  readonly title = 'Programme';
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly scope: HTMLCanvasElement;
  private readonly probe: HTMLCanvasElement;
  private readonly probeG: CanvasRenderingContext2D;
  private readonly slider: HTMLInputElement;
  private lastScope = 0;
  private boundVideo: HTMLVideoElement | null = null;

  constructor() {
    this.el = el(`<div class="fb-prog">
      <div class="fe-bar">
        <span class="fe-bar-title">${icon('film', 14)}<span>Programme</span></span>
        <span class="fb-name fx-note"></span>
        <span class="fx-flex"></span>
        <span class="fe-seg" role="group" aria-label="Listen to">
          <button type="button" data-m="source" class="is-active" title="Listen to the programme as it was delivered to the page">Source</button>
          <button type="button" data-m="delivery" title="Listen to the programme after loudness normalisation">Delivery</button>
        </span>
      </div>
      <div class="fb-stage">
        <canvas class="fb-canvas" width="1280" height="720"></canvas>
        <div class="fb-loading fe-es-busy">Loading programme</div>
      </div>
      <div class="fb-transport">
        <button class="cv-icon-btn fb-playbtn" type="button" data-a="play" title="Play or pause (Space)">${icon('play', 16)}${icon('pause', 16)}</button>
        <span class="fb-clock fb-mono">00:00.00</span>
        <div class="fb-track"><input class="fe-range fb-slider" type="range" min="0" max="17.4" step="0.01" value="0"><div class="fb-ticks"></div></div>
        <span class="fb-clock fb-mono fb-tc"></span>
      </div>
      <div class="fb-readout">
        <div class="fb-meters">
          <div class="fb-m"><span>Momentary</span><b class="fb-mono" data-k="m">-inf</b><i class="fe-bar-track"><span class="fe-bar-fill" data-k="mbar"></span></i></div>
          <div class="fb-m"><span>Short-term</span><b class="fb-mono" data-k="s">-inf</b><i class="fe-bar-track"><span class="fe-bar-fill" data-k="sbar"></span></i></div>
          <div class="fb-m"><span>Target</span><b class="fb-mono" data-k="t">-23.0</b><i class="fb-m-note" data-k="tn">LUFS</i></div>
        </div>
        <div class="fb-scope">
          <canvas width="360" height="64"></canvas>
          <div class="fb-scope-note fx-note"></div>
        </div>
      </div>
    </div>`);
    this.canvas = q<HTMLCanvasElement>(this.el, '.fb-canvas');
    this.g = this.canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    this.scope = q<HTMLCanvasElement>(this.el, '.fb-scope canvas');
    this.probe = document.createElement('canvas');
    this.probe.width = 256;
    this.probe.height = 144;
    this.probeG = this.probe.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    this.slider = q<HTMLInputElement>(this.el, '.fb-slider');
    this.slider.addEventListener('input', () => player.seek(Number(this.slider.value)));
    q(this.el, '[data-a="play"]').addEventListener('click', () => player.toggle());
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-m]'))) b.addEventListener('click', () => player.setMode(b.dataset.m as 'source' | 'delivery'));
    this.el.tabIndex = 0;
    this.el.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement && e.target.type === 'text')) { e.preventDefault(); player.toggle(); }
      if (e.code === 'ArrowRight') player.seek(player.time + 1 / job.fps);
      if (e.code === 'ArrowLeft') player.seek(player.time - 1 / job.fps);
    });
    player.on(() => this.paint(true));
    job.on('source', () => this.onSource());
    job.on('settings', () => this.paint(false));
    job.on('audio', () => this.paint(false));
    job.on('cues', () => { this.ticks(); this.paint(false); });
    this.ticks();
    this.paint(false);
  }

  private onSource(): void {
    setHidden(q(this.el, '.fb-loading'), job.ready);
    setText(q(this.el, '.fb-name'), job.name);
    this.slider.max = String(job.duration);
    if (job.hasPicture && (this.canvas.width !== (job.source?.width ?? 1280) || this.canvas.height !== (job.source?.height ?? 720))) {
      this.canvas.width = job.source?.width ?? 1280;
      this.canvas.height = job.source?.height ?? 720;
    }
    if (job.video && job.video !== this.boundVideo) {
      this.boundVideo = job.video;
      job.video.addEventListener('seeked', () => { this.paint(false); job.emit('frame'); });
      job.video.addEventListener('loadeddata', () => this.paint(false));
    }
    player.seek(Math.min(1.2, job.duration / 2));
    this.ticks();
  }

  private ticks(): void {
    const dur = job.duration || 17.4;
    patchList(q(this.el, '.fb-ticks'), job.cues.map((c, i) => ({ c, i })), {
      key: ({ i }) => String(i),
      create: () => el('<span class="fb-tick"></span>'),
      update: (n, { c }) => {
        setStyleVar(n, '--l', `${(c.start / dur) * 100}%`);
        setStyleVar(n, '--w', `${((c.end - c.start) / dur) * 100}%`);
      },
    });
  }

  private meters(t: number): void {
    const l = job.settings.loudness;
    const a = player.mode === 'delivery' && job.processed ? job.processed.analysis : job.original;
    const off = player.mode === 'delivery' && job.processed ? job.processedOffset : 0;
    let m = NaN, s = NaN;
    if (a) {
      const i = Math.floor((t - off) / a.step) - 1;
      if (i >= 0 && i < a.momentary.length) { m = a.momentary[i]; s = a.short[i]; }
    }
    const bar = (v: number): string => String(Number.isFinite(v) ? Math.max(0, Math.min(1, (v + 40) / 30)) : 0);
    setText(q(this.el, '[data-k="m"]'), fmt(m));
    setText(q(this.el, '[data-k="s"]'), fmt(s));
    setStyleVar(q(this.el, '[data-k="mbar"]'), '--p', bar(m));
    setStyleVar(q(this.el, '[data-k="sbar"]'), '--p', bar(s));
    setText(q(this.el, '[data-k="t"]'), fmt(l.target));
    setText(q(this.el, '[data-k="tn"]'), player.mode === 'delivery' && job.processed ? 'LUFS, delivery' : 'LUFS, source');
  }

  private paintScope(): void {
    const g = this.scope.getContext('2d');
    if (!g || !job.video) return;
    const vl = job.settings.videoLimiter;
    this.probeG.drawImage(job.video, 0, 0, this.probe.width, this.probe.height);
    const st = lumaStats(this.probeG.getImageData(0, 0, this.probe.width, this.probe.height).data, vl.min, vl.max);
    const w = this.scope.width, h = this.scope.height;
    const css = getComputedStyle(document.documentElement);
    g.clearRect(0, 0, w, h);
    g.fillStyle = css.getPropertyValue('--surface-1').trim() || '#1a1a1a';
    g.fillRect(0, 0, w, h);
    const peak = Math.max(1, ...Array.from(st.histogram));
    const bw = w / 100;
    const accent = css.getPropertyValue('--accent-color').trim();
    const warn = css.getPropertyValue('--warn').trim();
    for (let i = 0; i < 100; i++) {
      const bh = Math.sqrt(st.histogram[i] / peak) * (h - 6);
      g.fillStyle = vl.enabled && i + 0.5 > vl.max ? warn : accent;
      g.fillRect(i * bw, h - bh, Math.max(1, bw - 0.5), bh);
    }
    if (vl.enabled) {
      g.fillStyle = 'rgba(251, 191, 36, 0.14)';
      g.fillRect(vl.max * bw, 0, w - vl.max * bw, h);
      g.fillStyle = warn;
      g.fillRect(vl.max * bw, 0, 1, h);
    }
    setText(q(this.el, '.fb-scope-note'), vl.enabled ? `Luma 0 to 100 %. ${st.above.toFixed(1)} % of pixels above the ${vl.max} % limit are pulled down on output.` : 'Luma 0 to 100 %. Video limiter is off.');
  }

  private paint(fromPlayer: boolean): void {
    const t = player.time;
    const playing = player.playing;
    setText(q(this.el, '.fb-clock'), fmtClock(t));
    const tc = timecode(Math.floor(t * job.fps + 1e-6), job.fps, job.settings.overlays.timecode.start, job.settings.overlays.timecode.drop);
    setText(q(this.el, '.fb-tc'), tc);
    setValue(this.slider, String(t));
    setClass(q(this.el, '[data-a="play"]'), 'is-active', playing);
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-m]'))) setClass(b, 'is-active', b.dataset.m === player.mode);
    this.meters(t);
    if (job.video && job.video.readyState >= 2) {
      job.drawFrame(this.g, job.video, this.canvas.width, this.canvas.height, t);
      const now = performance.now();
      if (!fromPlayer || now - this.lastScope > 400) { this.lastScope = now; this.paintScope(); }
    } else if (!job.hasPicture && job.ready) {
      this.g.fillStyle = '#000';
      this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}
