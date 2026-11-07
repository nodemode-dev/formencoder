import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, patchList, q, setChecked, setClass, setText, setValue } from '../../../../frontend/src/ui/dom';
import { icon } from '../../../../frontend/src/ui/icons';
import { fmt, signed, type Analysis } from '../engine/meter';
import { STANDARDS } from '../engine/standards';
import { job } from '../job';
import { player } from '../player';

const LO = -40;
const HI = -10;

export class LoudnessPanel implements Panel {
  readonly id = 'loudness';
  readonly title = 'Loudness';
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly select: HTMLSelectElement;

  constructor() {
    this.el = el(`<div class="fe-info fb-loud">
      <div class="fb-loud-head">
        <span class="fe-bar-title">${icon('analyze', 14)}<span>Loudness</span></span>
        <span class="fx-flex"></span>
        <select class="fx-select fb-std" title="Loudness standard"></select>
        <label class="fe-check-label" title="Normalise the programme to the target on output"><input type="checkbox" class="fx-check" data-a="norm"><span>Normalise</span></label>
      </div>
      <div class="fb-stats">
        <div class="fb-stat-row fb-stat-head"><span></span><span>Source</span><span>Delivery</span></div>
        <div class="fb-stat-row" data-r="int"><span>Integrated</span><b class="fb-mono" data-c="a"></b><b class="fb-mono" data-c="b"></b></div>
        <div class="fb-stat-row" data-r="lra"><span>Loudness range</span><b class="fb-mono" data-c="a"></b><b class="fb-mono" data-c="b"></b></div>
        <div class="fb-stat-row" data-r="tp"><span>True peak</span><b class="fb-mono" data-c="a"></b><b class="fb-mono" data-c="b"></b></div>
        <div class="fb-stat-row" data-r="st"><span>Max short-term</span><b class="fb-mono" data-c="a"></b><b class="fb-mono" data-c="b"></b></div>
        <div class="fb-stat-row" data-r="gain"><span>Gain applied</span><b class="fb-mono" data-c="a"></b><b class="fb-mono" data-c="b"></b></div>
      </div>
      <div class="fb-graph"><canvas></canvas></div>
      <div class="fb-matrix">
        <div class="fb-mx-row fb-mx-head"><span>Standard</span><span>Target</span><span>Source</span><span>Gain to meet it</span></div>
        <div class="fb-mx-list"></div>
      </div>
      <p class="fx-note fb-loud-note"></p>
    </div>`);
    this.canvas = q<HTMLCanvasElement>(this.el, '.fb-graph canvas');
    this.select = q<HTMLSelectElement>(this.el, '.fb-std');
    for (const s of STANDARDS) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.label}, ${s.target} LUFS`;
      this.select.appendChild(o);
    }
    this.select.addEventListener('change', () => job.setStandard(this.select.value as never));
    q<HTMLInputElement>(this.el, '[data-a="norm"]').addEventListener('change', (e) => {
      job.settings.loudness.enabled = (e.target as HTMLInputElement).checked;
      job.changed();
    });
    new ResizeObserver(() => this.size()).observe(q(this.el, '.fb-graph'));
    job.on('audio', () => this.paint());
    job.on('settings', () => this.paintControls());
    job.on('source', () => this.paint());
    player.on(() => this.graph());
    this.paintControls();
    this.paint();
  }

  private size(): void {
    const box = q(this.el, '.fb-graph');
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(box.clientWidth * dpr), h = Math.round(box.clientHeight * dpr);
    if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.graph();
    }
  }

  private paintControls(): void {
    const l = job.settings.loudness;
    setValue(this.select, l.standard);
    setChecked(q<HTMLInputElement>(this.el, '[data-a="norm"]'), l.enabled);
    this.paint();
  }

  private cell(row: string, col: 'a' | 'b', text: string, state: 'ok' | 'bad' | ''): void {
    const c = q(this.el, `[data-r="${row}"] [data-c="${col}"]`);
    setText(c, text);
    setClass(c, 'fb-ok', state === 'ok');
    setClass(c, 'fb-bad', state === 'bad');
  }

  private paint(): void {
    const l = job.settings.loudness;
    const a = job.original;
    const d = job.processed;
    const verdict = (v: number, target: number, tol: number): 'ok' | 'bad' => (Math.abs(v - target) <= tol ? 'ok' : 'bad');
    if (a) {
      this.cell('int', 'a', `${fmt(a.integrated)} LUFS`, l.enabled ? verdict(a.integrated, l.target, l.tolerance) : '');
      this.cell('lra', 'a', `${fmt(a.lra)} LU`, '');
      this.cell('tp', 'a', `${fmt(a.truePeak)} dBTP`, l.enabled ? (a.truePeak <= l.truePeak ? 'ok' : 'bad') : '');
      this.cell('st', 'a', `${fmt(a.shortMax)} LUFS`, '');
      this.cell('gain', 'a', '', '');
    } else {
      for (const r of ['int', 'lra', 'tp', 'st', 'gain']) this.cell(r, 'a', r === 'int' ? 'no audio' : '', '');
    }
    if (d && l.enabled) {
      const x = d.analysis;
      this.cell('int', 'b', `${fmt(x.integrated)} LUFS`, verdict(x.integrated, l.target, l.tolerance));
      this.cell('lra', 'b', `${fmt(x.lra)} LU`, '');
      this.cell('tp', 'b', `${fmt(x.truePeak)} dBTP`, x.truePeak <= l.truePeak + 0.05 ? 'ok' : 'bad');
      this.cell('st', 'b', `${fmt(x.shortMax)} LUFS`, '');
      this.cell('gain', 'b', `${signed(d.gainDb)} dB`, '');
    } else {
      for (const r of ['int', 'lra', 'tp', 'st', 'gain']) this.cell(r, 'b', r === 'int' ? 'not normalised' : '', '');
    }
    const note = !a ? 'Open a file with audio to measure it.'
      : !l.enabled ? 'Normalise is off: the output keeps the source loudness.'
        : d?.held ? `The gain was held at ${d.gainDb.toFixed(1)} dB so the true peak stays at ${l.truePeak} dBTP; the target is not reached. Turn on the limiter to reach it.`
          : d?.limited ? `A look-ahead limiter (5 ms, release 50 ms) took up to ${d.reduction.toFixed(1)} dB off the peaks to keep the true peak at ${l.truePeak} dBTP.`
            : d ? `Linear gain of ${signed(d.gainDb)} dB; the true peak stays under ${l.truePeak} dBTP with no limiting.` : '';
    setText(q(this.el, '.fb-loud-note'), note);
    this.matrix(a);
    this.graph();
  }

  private matrix(a: Analysis | null): void {
    const tol = job.settings.loudness.tolerance;
    patchList(q(this.el, '.fb-mx-list'), STANDARDS, {
      key: (s) => s.id,
      create: () => el('<div class="fb-mx-row"><span class="fb-mx-name"></span><span class="fb-mono"></span><b class="fb-mono"></b><span class="fb-mono"></span></div>'),
      update: (n, s) => {
        const miss = a ? a.integrated - s.target : NaN;
        const gain = -miss;
        const limited = a ? a.truePeak + gain > s.truePeak : false;
        setText(n.children[0], `${s.label}`);
        setText(n.children[1], `${s.target} / ${s.truePeak}`);
        const ok = a ? Math.abs(miss) <= tol && a.truePeak <= s.truePeak : false;
        setText(n.children[2], a ? (ok ? 'pass' : 'fail') : '');
        setClass(n.children[2], 'fb-ok', ok);
        setClass(n.children[2], 'fb-bad', !!a && !ok);
        setText(n.children[3], a ? `${signed(gain)} dB${limited ? ', limiter' : ''}` : '');
        setClass(n, 'is-selected', s.id === job.settings.loudness.standard);
      },
    });
  }

  private graph(): void {
    const g = this.canvas.getContext('2d');
    const a = job.original;
    if (!g) return;
    const w = this.canvas.width, h = this.canvas.height;
    const dpr = window.devicePixelRatio || 1;
    const css = getComputedStyle(document.documentElement);
    const col = (n: string, d: string): string => css.getPropertyValue(n).trim() || d;
    g.clearRect(0, 0, w, h);
    g.fillStyle = col('--surface-1', '#1a1a1a');
    g.fillRect(0, 0, w, h);
    const padL = 34 * dpr, padR = 8 * dpr, padT = 8 * dpr, padB = 16 * dpr;
    const pw = w - padL - padR, ph = h - padT - padB;
    const dur = job.duration || 1;
    const X = (t: number): number => padL + (t / dur) * pw;
    const Y = (v: number): number => padT + ((HI - Math.max(LO, Math.min(HI, v))) / (HI - LO)) * ph;
    g.font = `${10 * dpr}px ${col('--font-mono', 'monospace')}`;
    g.textBaseline = 'middle';
    for (let v = LO; v <= HI; v += 10) {
      g.strokeStyle = col('--line-1', '#333');
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(padL, Y(v)); g.lineTo(w - padR, Y(v)); g.stroke();
      g.fillStyle = col('--text-muted', '#777');
      g.fillText(String(v), 4 * dpr, Y(v));
    }
    for (let t = 0; t <= dur; t += 2) {
      g.fillStyle = col('--text-muted', '#777');
      g.fillText(`${t}s`, X(t) - 6 * dpr, h - 6 * dpr);
    }
    const l = job.settings.loudness;
    const accent = col('--accent-color', '#f2545b');
    if (l.enabled) {
      g.fillStyle = col('--accent-wash', 'rgba(242,84,91,0.12)');
      g.fillRect(padL, Y(l.target + l.tolerance), pw, Y(l.target - l.tolerance) - Y(l.target + l.tolerance));
      g.strokeStyle = accent;
      g.setLineDash([4 * dpr, 4 * dpr]);
      g.beginPath(); g.moveTo(padL, Y(l.target)); g.lineTo(w - padR, Y(l.target)); g.stroke();
      g.setLineDash([]);
    }
    const line = (arr: Float32Array, step: number, off: number, color: string, width: number, alpha: number): void => {
      g.strokeStyle = color;
      g.lineWidth = width * dpr;
      g.globalAlpha = alpha;
      g.beginPath();
      let pen = false;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (!Number.isFinite(v)) continue;
        const x = X(off + (i + 1) * step), y = Y(v);
        if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
      }
      g.stroke();
      g.globalAlpha = 1;
    };
    if (a) {
      line(a.momentary, a.step, 0, col('--text-muted', '#888'), 1, 0.5);
      line(a.short, a.step, 0, col('--text-secondary', '#aaa'), 2, 1);
    }
    if (job.processed && l.enabled) {
      const p = job.processed.analysis;
      line(p.momentary, p.step, job.processedOffset, accent, 1, 0.45);
      line(p.short, p.step, job.processedOffset, accent, 2, 1);
    }
    g.strokeStyle = col('--text-primary', '#fff');
    g.lineWidth = dpr;
    g.beginPath(); g.moveTo(X(player.time), padT); g.lineTo(X(player.time), padT + ph); g.stroke();
  }
}
