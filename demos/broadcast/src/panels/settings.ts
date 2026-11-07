import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, q, setChecked, setDisabled, setHidden, setText, setValue } from '../../../../frontend/src/ui/dom';
import { icon } from '../../../../frontend/src/ui/icons';
import { PRESET_BY_ID } from '../../../../demo/src/engine/presets';
import { POSITIONS } from '../engine/overlay';
import { job } from '../job';

type Value = string | number | boolean;

interface Control {
  section?: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'check' | 'note';
  get: () => Value;
  set?: (v: string) => void;
  options?: Array<[string, string]>;
  step?: number;
  unit?: string;
  show?: () => boolean;
  off?: () => boolean;
}

const s = (): typeof job.settings => job.settings;
const num = (fn: (n: number) => void) => (v: string): void => { const n = Number(v); if (Number.isFinite(n)) fn(n); };
const positions = POSITIONS.map(([v, l]) => [v, l] as [string, string]);
const sidecar = (): boolean => s().captions.mode === 'sidecar';
const captioned = (): boolean => s().captions.mode === 'burnin';

const CONTROLS: Control[] = [
  { section: 'Output', label: 'Preset', kind: 'note', get: () => PRESET_BY_ID.get(job.currentPreset())?.name ?? '' },
  { label: 'Render width', kind: 'select', get: () => String(s().renderWidth), set: num((n) => { s().renderWidth = n; }), options: [['1280', '1280 px (preset size, capped)'], ['960', '960 px'], ['640', '640 px, quick']] },
  { label: 'In point', kind: 'number', get: () => s().range.start, set: num((n) => { s().range.start = Math.max(0, Math.min(n, s().range.end - 1)); }), step: 0.1, unit: 'seconds' },
  { label: 'Out point', kind: 'number', get: () => s().range.end, set: num((n) => { s().range.end = Math.min(job.duration, Math.max(n, s().range.start + 1)); }), step: 0.1, unit: 'seconds' },
  { section: 'Loudness', label: 'Normalise', kind: 'check', get: () => s().loudness.enabled, set: (v) => { s().loudness.enabled = v === 'true'; } },
  { label: 'Standard', kind: 'select', get: () => s().loudness.standard, set: (v) => job.setStandard(v as never), options: [['ebu-r128', 'EBU R128'], ['atsc-a85', 'ATSC A/85'], ['op59', 'OP-59 (Australia)'], ['arib-tr-b32', 'ARIB TR-B32'], ['streaming', 'Streaming (-14 LUFS)'], ['podcast', 'Podcast (-16 LUFS)']], off: () => !s().loudness.enabled },
  { label: 'Target', kind: 'number', get: () => s().loudness.target, set: num((n) => { s().loudness.target = n; s().loudness.standard = 'custom' as never; }), step: 0.5, unit: 'LUFS', off: () => !s().loudness.enabled },
  { label: 'Tolerance', kind: 'number', get: () => s().loudness.tolerance, set: num((n) => { s().loudness.tolerance = Math.max(0.1, n); }), step: 0.1, unit: 'LU', off: () => !s().loudness.enabled },
  { label: 'True peak', kind: 'number', get: () => s().loudness.truePeak, set: num((n) => { s().loudness.truePeak = Math.min(0, n); }), step: 0.5, unit: 'dBTP', off: () => !s().loudness.enabled },
  { label: 'Limiter', kind: 'check', get: () => s().loudness.limiter, set: (v) => { s().loudness.limiter = v === 'true'; }, off: () => !s().loudness.enabled },
  { label: 'Loudness report', kind: 'check', get: () => s().loudness.report, set: (v) => { s().loudness.report = v === 'true'; }, off: () => !s().loudness.enabled },
  { section: 'Captions', label: 'Mode', kind: 'select', get: () => s().captions.mode, set: (v) => { s().captions.mode = v as never; }, options: [['none', 'None'], ['burnin', 'Burn in'], ['sidecar', 'Sidecar file'], ['embed', 'Embedded track (desktop engine)']] },
  { label: 'Sidecar format', kind: 'select', get: () => s().captions.format, set: (v) => { s().captions.format = v as never; }, options: [['srt', 'SRT'], ['vtt', 'WebVTT'], ['ttml', 'TTML'], ['scc', 'SCC (29.97 drop frame)']], show: sidecar },
  { label: 'Size', kind: 'number', get: () => s().captions.size, set: num((n) => { s().captions.size = Math.max(2, Math.min(12, n)); }), step: 0.2, unit: '% of height', show: captioned },
  { label: 'Colour', kind: 'select', get: () => s().captions.color, set: (v) => { s().captions.color = v; }, options: [['#ffffff', 'White'], ['#fde047', 'Yellow'], ['#67e8f9', 'Cyan']], show: captioned },
  { label: 'Background', kind: 'number', get: () => s().captions.background, set: num((n) => { s().captions.background = Math.max(0, Math.min(100, n)); }), step: 5, unit: '% opacity', show: captioned },
  { label: 'Position', kind: 'select', get: () => s().captions.position, set: (v) => { s().captions.position = v as never; }, options: [['bottom', 'Bottom'], ['top', 'Top']], show: captioned },
  { section: 'Timecode burn-in', label: 'Timecode', kind: 'check', get: () => s().overlays.timecode.enabled, set: (v) => { s().overlays.timecode.enabled = v === 'true'; } },
  { label: 'Start', kind: 'text', get: () => s().overlays.timecode.start, set: (v) => { s().overlays.timecode.start = v; }, off: () => !s().overlays.timecode.enabled },
  { label: 'Drop frame', kind: 'check', get: () => s().overlays.timecode.drop, set: (v) => { s().overlays.timecode.drop = v === 'true'; }, off: () => !s().overlays.timecode.enabled || Math.abs(job.fps - 29.97) > 0.05 && Math.abs(job.fps - 59.94) > 0.05 },
  { label: 'Position', kind: 'select', get: () => s().overlays.timecode.position, set: (v) => { s().overlays.timecode.position = v as never; }, options: positions, off: () => !s().overlays.timecode.enabled },
  { label: 'Size', kind: 'number', get: () => s().overlays.timecode.size, set: num((n) => { s().overlays.timecode.size = Math.max(1.5, Math.min(10, n)); }), step: 0.2, unit: '% of height', off: () => !s().overlays.timecode.enabled },
  { section: 'Name and text', label: 'Clip name', kind: 'check', get: () => s().overlays.name.enabled, set: (v) => { s().overlays.name.enabled = v === 'true'; } },
  { label: 'Name position', kind: 'select', get: () => s().overlays.name.position, set: (v) => { s().overlays.name.position = v as never; }, options: positions, off: () => !s().overlays.name.enabled },
  { label: 'Watermark', kind: 'check', get: () => s().overlays.text.enabled, set: (v) => { s().overlays.text.enabled = v === 'true'; } },
  { label: 'Text', kind: 'text', get: () => s().overlays.text.text, set: (v) => { s().overlays.text.text = v; }, off: () => !s().overlays.text.enabled },
  { label: 'Text position', kind: 'select', get: () => s().overlays.text.position, set: (v) => { s().overlays.text.position = v as never; }, options: positions, off: () => !s().overlays.text.enabled },
  { section: 'Logo bug', label: 'Logo', kind: 'check', get: () => s().overlays.logo.enabled, set: (v) => { s().overlays.logo.enabled = v === 'true'; } },
  { label: 'Position', kind: 'select', get: () => s().overlays.logo.position, set: (v) => { s().overlays.logo.position = v as never; }, options: positions, off: () => !s().overlays.logo.enabled },
  { label: 'Size', kind: 'number', get: () => s().overlays.logo.size, set: num((n) => { s().overlays.logo.size = Math.max(2, Math.min(30, n)); }), step: 1, unit: '% of height', off: () => !s().overlays.logo.enabled },
  { label: 'Opacity', kind: 'number', get: () => s().overlays.logo.opacity, set: num((n) => { s().overlays.logo.opacity = Math.max(0, Math.min(100, n)); }), step: 5, unit: '%', off: () => !s().overlays.logo.enabled },
  { section: 'Legal levels', label: 'Video limiter', kind: 'check', get: () => s().videoLimiter.enabled, set: (v) => { s().videoLimiter.enabled = v === 'true'; } },
  { label: 'Minimum', kind: 'number', get: () => s().videoLimiter.min, set: num((n) => { s().videoLimiter.min = Math.max(0, Math.min(n, s().videoLimiter.max - 5)); }), step: 1, unit: '% luma', off: () => !s().videoLimiter.enabled },
  { label: 'Maximum', kind: 'number', get: () => s().videoLimiter.max, set: num((n) => { s().videoLimiter.max = Math.min(100, Math.max(n, s().videoLimiter.min + 5)); }), step: 1, unit: '% luma', off: () => !s().videoLimiter.enabled },
];

interface Built { c: Control; row: HTMLElement; input: HTMLInputElement | HTMLSelectElement | null; head: HTMLElement | null }

export class SettingsPanel implements Panel {
  readonly id = 'settings';
  readonly title = 'Delivery Settings';
  readonly el: HTMLElement;
  private readonly built: Built[] = [];

  constructor() {
    this.el = el(`<div class="fe-info fb-settings">
      <div class="fb-set-head"><span class="fe-bar-title">${icon('sliders', 14)}<span>Delivery Settings</span></span><span class="fx-flex"></span><span class="fx-note">What the Export Settings dialog holds for these effects</span></div>
      <div class="fb-set-body"></div>
    </div>`);
    const body = q(this.el, '.fb-set-body');
    for (const c of CONTROLS) {
      let head: HTMLElement | null = null;
      if (c.section) {
        head = el('<div class="fb-sec"></div>');
        setText(head, c.section);
        body.appendChild(head);
      }
      const row = el('<div class="fe-field"><span></span><div class="fe-field-ctl"></div></div>');
      setText(q(row, 'span'), c.label);
      const ctl = q(row, '.fe-field-ctl');
      let input: HTMLInputElement | HTMLSelectElement | null = null;
      if (c.kind === 'select') {
        const sel = el<HTMLSelectElement>('<select class="fx-select"></select>');
        for (const [v, l] of c.options ?? []) {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = l;
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => this.commit(c, sel.value));
        input = sel;
        ctl.appendChild(sel);
      } else if (c.kind === 'check') {
        const box = el<HTMLInputElement>('<input type="checkbox" class="fx-check">');
        box.addEventListener('change', () => this.commit(c, String(box.checked)));
        input = box;
        ctl.appendChild(box);
      } else if (c.kind === 'note') {
        ctl.appendChild(el('<span class="fb-note-val"></span>'));
      } else {
        const inp = el<HTMLInputElement>(c.kind === 'number' ? `<input class="cv-input fe-num" type="number" step="${c.step ?? 1}">` : '<input class="cv-input" type="text" spellcheck="false">');
        inp.addEventListener('input', () => this.commit(c, inp.value));
        input = inp;
        ctl.appendChild(inp);
      }
      if (c.unit) ctl.appendChild(el(`<span class="fe-unit">${c.unit}</span>`));
      body.appendChild(row);
      this.built.push({ c, row, input, head });
    }
    job.on('settings', () => this.paint());
    job.on('profile', () => this.paint());
    job.on('source', () => this.paint());
    this.paint();
  }

  private commit(c: Control, v: string): void {
    c.set?.(v);
    job.changed();
  }

  private paint(): void {
    for (const b of this.built) {
      setHidden(b.row, b.c.show ? !b.c.show() : false);
      const v = b.c.get();
      if (b.input instanceof HTMLInputElement && b.input.type === 'checkbox') setChecked(b.input, Boolean(v));
      else if (b.input) setValue(b.input, String(v));
      else setText(q(b.row, '.fb-note-val'), String(v));
      if (b.input) setDisabled(b.input as HTMLInputElement, b.c.off ? b.c.off() : false);
    }
  }
}
