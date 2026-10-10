import type { Ctx } from '../app/ctx';
import type { FieldSpec, FormatDescription, OutputSettings, Settings, Summary } from '../engine/types';
import { formats, presetEntries } from '../ui/choosers';
import { promptName } from '../ui/dialogs';
import { el, patchList, q, setClass, setHidden, setStyleVar, setText, setTitle, swapMedia } from '../ui/dom';
import { fieldControl, showIf, type FieldControl } from '../ui/fields';
import { pickFiles } from '../ui/file-dialog';
import { basename, fmtBytes, fmtClock, getPath, POSITIONS } from '../ui/format';
import { icon } from '../ui/icons';
import { contextMenu } from '../ui/popup';
import { toast } from '../ui/toast';

type Tab = 'effects' | 'video' | 'audio' | 'multiplexer' | 'captions' | 'publish' | 'metadata';
type View = 'source' | 'output' | 'compare';

const POS = POSITIONS.map(([v, l]) => [v, l] as [unknown, string]);
const f = (key: string, label: string, type: FieldSpec['type'], extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, type, ...extra });
const overlayCommon = (k: string): FieldSpec[] => [
  f(`effects.${k}.position`, 'Position', 'select', { options: POS }),
  f(`effects.${k}.offsetX`, 'Offset X', 'int', { min: -4000, max: 4000, unit: 'px' }),
  f(`effects.${k}.offsetY`, 'Offset Y', 'int', { min: -4000, max: 4000, unit: 'px' }),
  f(`effects.${k}.size`, 'Size', 'int', { min: 6, max: 400, unit: 'px at 1080' }),
  f(`effects.${k}.opacity`, 'Opacity', 'int', { min: 0, max: 100, unit: '%' }),
  f(`effects.${k}.color`, 'Color', 'color'),
  f(`effects.${k}.background`, 'Background', 'int', { min: 0, max: 100, unit: '%' }),
];

const EFFECTS: Array<{ key: string; label: string; hint: string; fields: FieldSpec[] }> = [
  { key: 'lut', label: 'Lumetri Look / LUT', hint: 'A .cube or .3dl look applied with an intensity blend.', fields: [f('effects.lut.path', 'Applied', 'path', { options: [['cube', 'cube'], ['3dl', '3dl']] }), f('effects.lut.intensity', 'Intensity', 'int', { min: 0, max: 100, unit: '%' })] },
  { key: 'sdrConform', label: 'SDR Conform', hint: 'HDR (PQ or HLG) to SDR Rec. 709 with a tone curve.', fields: [f('effects.sdrConform.brightness', 'Brightness', 'int', { min: -100, max: 100 }), f('effects.sdrConform.contrast', 'Contrast', 'int', { min: -100, max: 100 }), f('effects.sdrConform.knee', 'Soft Knee', 'int', { min: 0, max: 100 }), f('effects.sdrConform.peak', 'Source Peak', 'int', { min: 100, max: 10000, unit: 'nits' })] },
  { key: 'imageOverlay', label: 'Image Overlay', hint: 'A logo or bug over the picture.', fields: [f('effects.imageOverlay.path', 'Applied', 'path', { options: [['png', 'png'], ['jpg', 'jpg'], ['tif', 'tif'], ['webp', 'webp']] }), f('effects.imageOverlay.position', 'Position', 'select', { options: POS }), f('effects.imageOverlay.offsetX', 'Offset X', 'int', { min: -4000, max: 4000, unit: 'px' }), f('effects.imageOverlay.offsetY', 'Offset Y', 'int', { min: -4000, max: 4000, unit: 'px' }), f('effects.imageOverlay.size', 'Size', 'int', { min: 1, max: 1000, unit: '%' }), f('effects.imageOverlay.absolute', 'Absolute Size', 'bool'), f('effects.imageOverlay.opacity', 'Opacity', 'int', { min: 0, max: 100, unit: '%' })] },
  { key: 'nameOverlay', label: 'Name Overlay', hint: 'The file name burnt in for review copies.', fields: [f('effects.nameOverlay.prefix', 'Prefix', 'text'), f('effects.nameOverlay.suffix', 'Suffix', 'text'), f('effects.nameOverlay.source', 'Format', 'select', { options: [['fileName', 'Source file name'], ['fileNameNoExt', 'Source name without extension'], ['outputName', 'Output file name'], ['outputNameNoExt', 'Output name without extension'], ['none', 'Prefix and suffix only']] }), ...overlayCommon('nameOverlay')] },
  { key: 'textOverlay', label: 'Text Overlay', hint: 'Any line of text: a watermark, a slate note.', fields: [f('effects.textOverlay.text', 'Text', 'text'), ...overlayCommon('textOverlay')] },
  { key: 'timecodeOverlay', label: 'Timecode Overlay', hint: 'Running timecode from the media or generated.', fields: [f('effects.timecodeOverlay.source', 'Time Source', 'select', { options: [['media', 'Media file timecode'], ['generate', 'Generate timecode']] }), f('effects.timecodeOverlay.start', 'Start', 'text'), f('effects.timecodeOverlay.offsetFrames', 'Offset', 'int', { min: -100000, max: 100000, unit: 'frames' }), f('effects.timecodeOverlay.frameRate', 'Timecode Rate', 'select', { options: [[null, 'Output frame rate'], [23.976, '23.976'], [24, '24'], [25, '25'], [29.97, '29.97 drop'], [30, '30'], [50, '50'], [59.94, '59.94 drop'], [60, '60']] }), ...overlayCommon('timecodeOverlay')] },
  { key: 'timeTuner', label: 'Time Tuner', hint: 'Lengthens or shortens by up to 10% where the picture changes least.', fields: [f('effects.timeTuner.percent', 'Duration Change', 'number', { min: -10, max: 10, step: 0.5, unit: '%' }), f('effects.timeTuner.targetDuration', 'Or Target Duration', 'number', { min: 0.1, max: 86400, step: 0.1, unit: 's', nullable: true }), f('effects.timeTuner.skipSlates', 'Skip Slate', 'number', { min: 0, max: 600, step: 0.5, unit: 's' })] },
  { key: 'videoLimiter', label: 'Video Limiter', hint: 'Keeps luma and chroma inside the broadcast-legal range.', fields: [f('effects.videoLimiter.min', 'Minimum', 'number', { min: -7.5, max: 50, step: 0.5, unit: '%' }), f('effects.videoLimiter.max', 'Maximum', 'number', { min: 50, max: 109, step: 0.5, unit: '%' }), f('effects.videoLimiter.compression', 'Compression', 'number', { min: 0, max: 30, step: 0.5, unit: '%' })] },
  { key: 'loudness', label: 'Loudness Normalization', hint: 'Two-pass loudness to a standard, a true-peak limiter and a report.', fields: [] },
];

export class ExportSettings {
  private readonly scrim: HTMLElement;
  private s!: Settings;
  private info: OutputSettings | null = null;
  private desc: FormatDescription | null = null;
  private output = '';
  private tab: Tab = 'video';
  private view: View = 'output';
  private time = 0;
  private controls = new Map<string, FieldControl>();
  private previewTimer = 0;
  private previewSeq = 0;
  private applying: Promise<void> = Promise.resolve();
  private summary: Summary = {};

  constructor(private readonly ctx: Ctx) {
    this.scrim = el(`<div class="cv-scrim fe-es-scrim" hidden><div class="fe-es" role="dialog" aria-modal="true" aria-label="Export Settings" data-automation-id="exportSettings">
      <header class="fe-es-head"><span class="fe-es-title">Export Settings</span><span class="fe-es-src"></span><span class="fx-flex"></span><button class="cv-icon-btn" type="button" data-a="close" title="Cancel">${icon('close', 16)}</button></header>
      <div class="fe-es-body">
        <section class="fe-es-left">
          <div class="fe-seg fe-es-views"><button type="button" data-v="source">Source</button><button type="button" data-v="output" class="is-active">Output</button><button type="button" data-v="compare">Compare</button></div>
          <div class="fe-es-stage"><figure class="fe-es-fig" data-f="source"><img alt=""><figcaption>Source</figcaption><div class="fe-es-cropbox" hidden><span class="fe-cb-move" data-h="move"></span><span class="fe-cb-h" data-h="l"></span><span class="fe-cb-h" data-h="t"></span><span class="fe-cb-h" data-h="r"></span><span class="fe-cb-h" data-h="b"></span></div></figure><figure class="fe-es-fig" data-f="output"><img alt=""><figcaption>Output</figcaption></figure><span class="fe-es-busy ns-pending">Rendering</span><span class="fe-es-err" hidden></span></div>
          <div class="fe-es-time"><span class="fe-es-tc">00:00</span><input type="range" class="fe-range" min="0" max="1" step="0.01" value="0"><span class="fe-es-dur">00:00</span></div>
          <div class="fe-es-rangebar"><span class="fe-es-inout"></span></div>
          <div class="fe-es-rangebtns"><button class="cv-btn" type="button" data-a="in">Set In</button><button class="cv-btn" type="button" data-a="out">Set Out</button><button class="cv-btn" type="button" data-a="entire">Entire Source</button><span class="fe-es-rangelabel"></span></div>
          <div class="fe-es-grid">
            <label>Source Scaling<select class="fx-select" data-k="scaling"></select></label>
            <label>Rotation<select class="fx-select" data-k="rotation"><option value="0">None</option><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">90° counterclockwise</option></select></label>
          </div>
          <div class="fe-es-crop"><span>Crop</span><label>L<input class="cv-input fe-num" type="number" min="0" data-crop="left"></label><label>T<input class="cv-input fe-num" type="number" min="0" data-crop="top"></label><label>R<input class="cv-input fe-num" type="number" min="0" data-crop="right"></label><label>B<input class="cv-input fe-num" type="number" min="0" data-crop="bottom"></label><label>Proportions<select class="fx-select fe-es-prop" data-k="crop.proportion"></select></label></div>
        </section>
        <section class="fe-es-right">
          <div class="fe-es-top">
            <div class="fe-field"><span class="fe-field-label">Format</span><span class="fe-field-ctl"><button class="fe-dd" type="button" data-a="format"></button></span></div>
            <div class="fe-field"><span class="fe-field-label">Preset</span><span class="fe-field-ctl"><button class="fe-dd" type="button" data-a="preset"></button><button class="cv-icon-btn" type="button" data-a="savePreset" title="Save Preset">${icon('preset', 15)}</button><button class="cv-icon-btn" type="button" data-a="importPreset" title="Import Preset">${icon('upload', 15)}</button></span></div>
            <div class="fe-field"><span class="fe-field-label">Comments</span><span class="fe-field-ctl"><input class="cv-input" type="text" data-k="comments" spellcheck="false"></span></div>
            <div class="fe-field"><span class="fe-field-label">Output Name</span><span class="fe-field-ctl"><button class="fe-link fe-es-out" type="button" data-a="outName"></button></span></div>
            <div class="fe-es-checks"><label class="fe-check-label"><input type="checkbox" class="fx-check" data-k="exportVideo"><span>Export Video</span></label><label class="fe-check-label"><input type="checkbox" class="fx-check" data-k="exportAudio"><span>Export Audio</span></label></div>
            <div class="fe-es-summary"><div><b>Output:</b> <span data-sum="out"></span></div><div><b>Source:</b> <span data-sum="src"></span></div></div>
          </div>
          <nav class="fe-tabs" role="tablist">
            <button type="button" data-t="effects">Effects</button><button type="button" data-t="video" class="is-active">Video</button><button type="button" data-t="audio">Audio</button><button type="button" data-t="multiplexer">Multiplexer</button><button type="button" data-t="captions">Captions</button><button type="button" data-t="publish">Publish</button><button type="button" data-t="metadata">Metadata</button>
          </nav>
          <div class="fe-es-pane" data-pane="effects"></div>
          <div class="fe-es-pane" data-pane="video"></div>
          <div class="fe-es-pane" data-pane="audio"></div>
          <div class="fe-es-pane" data-pane="multiplexer"></div>
          <div class="fe-es-pane" data-pane="captions"></div>
          <div class="fe-es-pane" data-pane="publish"></div>
          <div class="fe-es-pane" data-pane="metadata"></div>
          <div class="fe-es-bottom">
            <label class="fe-check-label"><input type="checkbox" class="fx-check" data-k="maxRenderQuality"><span>Use Maximum Render Quality</span></label>
            <label class="fe-check-label"><input type="checkbox" class="fx-check" data-k="maxDepth"><span>Render at Maximum Depth</span></label>
            <label class="fe-check-label"><input type="checkbox" class="fx-check" data-k="alphaOnly"><span>Render Alpha Channel Only</span></label>
            <label class="fe-inline">Set Start Timecode<input class="cv-input fe-tc" type="text" data-k="startTimecode" placeholder="from source" spellcheck="false"></label>
            <label class="fe-inline">Time Interpolation<select class="fx-select" data-k="timeInterpolation"></select></label>
            <label class="fe-inline">Max File Size<input class="cv-input fe-num" type="number" min="1" data-k="maxFileSize" placeholder="none"><span class="fe-unit">MB</span></label>
            <span class="fe-es-est"></span>
          </div>
        </section>
      </div>
      <footer class="fe-es-foot"><button class="cv-btn" type="button" data-a="command">${icon('terminal', 13)}FFmpeg Command</button><span class="fx-flex"></span><button class="cv-btn cv-btn-ghost" type="button" data-a="cancel">Cancel</button><button class="cv-btn cv-btn-primary" type="button" data-a="ok">OK</button></footer>
    </div></div>`);
    document.getElementById('overlay-root')?.appendChild(this.scrim);
    this.bind();
  }

  private bind(): void {
    const root = this.scrim;
    for (const b of Array.from(root.querySelectorAll<HTMLElement>('[data-a]'))) {
      b.dataset.automationId = `exportSettings.${b.dataset.a}`;
      b.addEventListener('click', (e) => void this.action(b.dataset.a as string, e));
    }
    for (const b of Array.from(root.querySelectorAll<HTMLElement>('[data-t]'))) b.addEventListener('click', () => this.showTab(b.dataset.t as Tab));
    for (const b of Array.from(root.querySelectorAll<HTMLElement>('[data-v]'))) b.addEventListener('click', () => this.setView(b.dataset.v as View));
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
    });
    const range = q<HTMLInputElement>(root, '.fe-range');
    range.addEventListener('input', () => {
      this.time = Number(range.value);
      setText(q(root, '.fe-es-tc'), fmtClock(this.time));
      this.schedulePreview(140);
    });
    for (const i of Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]'))) {
      const k = i.dataset.k as string;
      i.addEventListener('change', () => {
        let v: unknown;
        if (i instanceof HTMLInputElement && i.type === 'checkbox') v = i.checked;
        else if (i instanceof HTMLInputElement && i.type === 'number') v = i.value.trim() === '' ? null : Number(i.value);
        else if (k === 'rotation') v = Number(i.value);
        else if (k === 'startTimecode') v = i.value.trim() || null;
        else v = i.value;
        void this.patch({ [k]: v });
      });
    }
    for (const i of Array.from(root.querySelectorAll<HTMLInputElement>('[data-crop]'))) {
      i.addEventListener('change', () => void this.patch({ [`crop.${i.dataset.crop}`]: Math.max(0, Math.round(Number(i.value) || 0)) }));
    }
    this.bindCropBox();
  }

  async open(output: string): Promise<void> {
    const info = await this.ctx.run<OutputSettings>('queue.getSettings', { output });
    if (!info) return;
    if (info.kind !== 'encode') {
      toast('Copy and analysis outputs have no export settings', 'error');
      return;
    }
    if (this.output !== info.output) {
      for (const img of Array.from(this.scrim.querySelectorAll<HTMLImageElement>('.fe-es-fig img'))) img.removeAttribute('src');
    }
    this.output = info.output;
    this.info = info;
    this.s = info.settings;
    this.summary = info.summary;
    this.time = 0;
    setText(q(this.scrim, '.fe-es-src'), basename(info.source));
    setTitle(q(this.scrim, '.fe-es-src'), info.source);
    const dur = Number(info.sourceInfo?.duration) || 0;
    const range = q<HTMLInputElement>(this.scrim, '.fe-range');
    range.max = String(Math.max(0.04, dur));
    range.step = String(dur > 600 ? 0.5 : 0.04);
    range.value = '0';
    setText(q(this.scrim, '.fe-es-dur'), fmtClock(dur));
    setText(q(this.scrim, '.fe-es-tc'), fmtClock(0));
    const src = info.sourceInfo;
    const v = src?.video;
    setText(q(this.scrim, '[data-sum="src"]'), [v ? `${v.width}x${v.height}, ${Number(v.fps?.toFixed(3))} fps, ${v.codec}` : '', (src?.audio ?? []).length ? `${(src?.audio ?? []).length} audio stream(s)` : '', fmtClock(dur)].filter(Boolean).join(' · '));
    await this.describe();
    this.scrim.hidden = false;
    this.showTab(this.s.format && ['wav', 'bwf', 'aiff', 'mp3', 'aac', 'flac', 'ogg'].includes(this.s.format) ? 'audio' : this.tab);
    this.refreshAll();
    this.setView(this.view);
    q<HTMLElement>(this.scrim, '.fe-es').focus();
  }

  private close(): void {
    this.scrim.hidden = true;
    window.clearTimeout(this.previewTimer);
    this.previewSeq++;
  }

  private async describe(): Promise<void> {
    this.desc = await this.ctx.run<FormatDescription>('format.describe', { settings: this.s }) ?? null;
    if (!this.desc) return;
    const sel = q<HTMLSelectElement>(this.scrim, '[data-k="scaling"]');
    if (!sel.options.length) for (const [v, l] of this.desc.scaling) sel.appendChild(Object.assign(document.createElement('option'), { value: v, textContent: l }));
    const prop = q<HTMLSelectElement>(this.scrim, '[data-k="crop.proportion"]');
    if (!prop.options.length) for (const [v, l] of this.desc.cropProportions ?? [['none', 'None']]) prop.appendChild(Object.assign(document.createElement('option'), { value: v, textContent: l }));
    const ti = q<HTMLSelectElement>(this.scrim, '[data-k="timeInterpolation"]');
    if (!ti.options.length) for (const [v, l] of this.desc.timeInterpolation) ti.appendChild(Object.assign(document.createElement('option'), { value: v, textContent: l }));
    this.buildFieldPane('video', this.desc.video, 'This format has no video.');
    this.buildFieldPane('audio', this.desc.audio, 'This format has no audio.');
    this.buildFieldPane('multiplexer', [...this.desc.multiplexer, ...(this.desc.package ?? [])], 'This format has one container and no multiplexer settings.');
    this.buildEffects();
    this.buildCaptions();
    this.buildPublish();
    this.buildMetadata();
  }

  private get(key: string): unknown {
    return getPath(this.s, key);
  }

  private buildFieldPane(pane: Tab, fields: FieldSpec[], empty: string): void {
    const host = q(this.scrim, `[data-pane="${pane}"]`);
    const rows: Array<FieldSpec | null> = fields.length ? [...fields.filter((x) => !x.advanced), ...fields.filter((x) => x.advanced)] : [null];
    patchList(host, rows, {
      key: (x) => (x ? `${x.key}|${(x.options ?? []).map((o) => String(o[0])).join(',')}|${x.type === 'note' ? String(x.value ?? '') : ''}` : '__empty'),
      create: (x) => {
        if (!x) return el('<p class="fx-note fe-es-empty"></p>');
        const c = fieldControl(x, (k, v) => void this.patch({ [k]: v }), { sources: () => ((this.info?.sourceInfo as { audio?: Array<{ channels?: number }> } | undefined)?.audio ?? []) });
        this.controls.set(x.key, c);
        return c.row;
      },
      update: (n, x) => {
        if (!x) setText(n, empty);
      },
    });
    for (const [k, c] of this.controls) if (!c.row.isConnected) this.controls.delete(k);
  }

  private buildEffects(): void {
    const host = q(this.scrim, '[data-pane="effects"]');
    if (host.childElementCount) return;
    const desc = this.desc;
    if (!desc) return;
    for (const fx of EFFECTS) {
      const box = el(`<div class="fe-fx" data-fx="${fx.key}"><label class="fe-fx-head"><input type="checkbox" class="fx-check"><span class="fe-fx-name"></span><span class="fe-fx-hint"></span></label><div class="fe-fx-body"></div></div>`);
      setText(q(box, '.fe-fx-name'), fx.label);
      setText(q(box, '.fe-fx-hint'), fx.hint);
      const toggle = q<HTMLInputElement>(box, 'input');
      toggle.addEventListener('change', () => void this.patch({ [`effects.${fx.key}.enabled`]: toggle.checked }));
      this.controls.set(`effects.${fx.key}.enabled`, { row: box, set: (v) => { if (toggle.checked !== (v === true)) toggle.checked = v === true; setClass(box, 'is-on', v === true); }, setDisabled: () => undefined });
      let fields = fx.fields;
      if (fx.key === 'loudness') {
        const std = Object.entries(desc.loudnessStandards).map(([k, v]) => [k, v.label] as [unknown, string]);
        fields = [
          f('effects.loudness.standard', 'Standard', 'select', { options: std }),
          f('effects.loudness.target', 'Target Loudness', 'number', { min: -40, max: -5, step: 0.5, unit: 'LUFS' }),
          f('effects.loudness.tolerance', 'Tolerance', 'number', { min: 0, max: 5, step: 0.5, unit: 'LU' }),
          f('effects.loudness.truePeak', 'Max True Peak', 'number', { min: -9, max: 0, step: 0.1, unit: 'dBTP' }),
          f('effects.loudness.lra', 'Loudness Range', 'number', { min: 1, max: 30, step: 0.5, unit: 'LU' }),
          f('effects.loudness.report', 'Write Loudness Report (XML)', 'bool'),
          f('effects.loudness.reportFolder', 'Report Folder', 'path'),
          f('effects.loudness.limiter.enabled', 'True Peak Limiter', 'bool'),
          f('effects.loudness.limiter.lookahead', 'Look-ahead', 'number', { min: 1, max: 50, step: 0.5, unit: 'ms' }),
          f('effects.loudness.limiter.release', 'Release', 'number', { min: 10, max: 1000, step: 5, unit: 'ms' }),
        ];
      }
      const body = q(box, '.fe-fx-body');
      if (fx.key === 'lut') {
        const pick = el<HTMLButtonElement>(`<button class="fe-link fe-fx-luts" type="button">Installed LUTs</button>`);
        pick.addEventListener('click', async (e) => {
          const r = await this.ctx.run<{ luts: Array<{ name: string; path: string }> }>('lut.list', {});
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          contextMenu(rect.left, rect.bottom + 2, (r?.luts ?? []).length ? (r?.luts ?? []).map((l) => ({ label: l.name, run: () => void this.patch({ 'effects.lut.path': l.path, 'effects.lut.enabled': true }) })) : [{ label: 'No LUTs installed (Effects > Install LUT)', enabled: false }]);
        });
        body.appendChild(pick);
      }
      for (const x of fields) {
        const c = fieldControl(x, (k, v) => void this.patch({ [k]: v }));
        this.controls.set(x.key, c);
        body.appendChild(c.row);
      }
      host.appendChild(box);
    }
  }

  private buildCaptions(): void {
    const host = q(this.scrim, '[data-pane="captions"]');
    if (host.childElementCount || !this.desc) return;
    const fields: FieldSpec[] = [
      f('captions.mode', 'Export Options', 'select', { options: [['none', 'None'], ['sidecar', 'Create Sidecar File'], ['burnin', 'Burn Captions Into Video'], ['embed', 'Embed In Output File']] }),
      f('captions.source', 'Caption Source', 'text', { nullable: false }),
      f('captions.format', 'Sidecar Format', 'select', { options: this.desc.captions as Array<[unknown, string]>, showIf: 'captions.mode=sidecar|embed' }),
      f('captions.language', 'Language', 'text'),
      f('captions.size', 'Burn-in Size', 'int', { min: 8, max: 200, unit: 'px at 1080', showIf: 'captions.mode=burnin' }),
      f('captions.color', 'Burn-in Color', 'color', { showIf: 'captions.mode=burnin' }),
      f('captions.background', 'Burn-in Background', 'int', { min: 0, max: 100, unit: '%', showIf: 'captions.mode=burnin' }),
      f('captions.position', 'Burn-in Position', 'select', { options: [['bottom', 'Bottom'], ['top', 'Top']], showIf: 'captions.mode=burnin' }),
    ];
    host.appendChild(el('<p class="fx-note">Caption Source auto uses a .srt, .vtt, .scc or .ttml beside the source with the same name, then a caption stream inside it; or give a path.</p>'));
    for (const x of fields) {
      const c = fieldControl(x, (k, v) => void this.patch({ [k]: v }));
      c.row.dataset.showIf = x.showIf ?? '';
      this.controls.set(x.key, c);
      host.appendChild(c.row);
    }
  }

  private buildPublish(): void {
    const host = q(this.scrim, '[data-pane="publish"]');
    if (host.childElementCount) return;
    host.appendChild(el(`<div class="fe-pub-bar"><span class="fx-note">After the encode the file goes to each destination below, in order.</span><span class="fx-flex"></span><button class="cv-btn" type="button">${icon('plus', 13)}Add Destination</button></div>`));
    host.appendChild(el('<div class="fe-pub-list"></div>'));
    q(host, '.fe-pub-bar button').addEventListener('click', (e) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const add = (d: Record<string, unknown>): void => void this.patch({ publish: [...(this.s.publish ?? []), { enabled: true, ...d }] });
      contextMenu(r.left, r.bottom + 2, [
        { label: 'Folder', run: () => add({ type: 'folder', path: '', deleteLocal: false }) },
        { label: 'FTP', run: () => add({ type: 'ftp', host: '', port: 21, user: '', password: '', remotePath: '', tls: false, retries: 3 }) },
        { label: 'S3-compatible storage', run: () => add({ type: 's3', endpoint: 'https://s3.amazonaws.com', region: 'us-east-1', bucket: '', prefix: '', accessKey: '', secretKey: '' }) },
        { label: 'Webhook', run: () => add({ type: 'webhook', url: '', secret: '' }) },
        { label: 'formcut (import into a project)', run: () => add({ type: 'family', app: 'formcut', project: '' }) },
        { label: 'formvfx (import into the open project)', run: () => add({ type: 'family', app: 'formvfx' }) },
      ]);
    });
  }

  private renderPublish(): void {
    const list = q(this.scrim, '.fe-pub-list');
    const rows = (this.s.publish ?? []).map((d, i) => ({ d, i }));
    patchList(list, rows, {
      key: ({ d, i }) => `${i}:${String(d.type)}`,
      create: ({ d }) => {
        const n = el(`<div class="fe-pub"><div class="fe-pub-head"><input type="checkbox" class="fx-check" title="Enabled"><b class="fe-pub-type"></b><span class="fx-flex"></span><button class="cv-icon-btn" type="button" title="Remove">${icon('close', 13)}</button></div><div class="fe-pub-fields"></div></div>`);
        const keys = Object.keys(d).filter((k) => !['type', 'enabled'].includes(k));
        for (const k of keys) {
          const type: FieldSpec['type'] = typeof d[k] === 'boolean' ? 'bool' : typeof d[k] === 'number' ? 'int' : k === 'path' ? 'path' : 'text';
          const c = fieldControl(f(k, k.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase()), type), (key, v) => {
            const idx = Number((n.dataset.key as string).split(':')[0]);
            const next = (this.s.publish ?? []).map((x, j) => (j === idx ? { ...x, [key]: v } : x));
            void this.patch({ publish: next });
          });
          c.row.dataset.pk = k;
          if (/password|secret|secretKey/i.test(k)) q<HTMLInputElement>(c.row, 'input').type = 'password';
          q(n, '.fe-pub-fields').appendChild(c.row);
        }
        q<HTMLInputElement>(n, '.fe-pub-head input').addEventListener('change', (e) => {
          const idx = Number((n.dataset.key as string).split(':')[0]);
          void this.patch({ publish: (this.s.publish ?? []).map((x, j) => (j === idx ? { ...x, enabled: (e.target as HTMLInputElement).checked } : x)) });
        });
        q(n, '.fe-pub-head button').addEventListener('click', () => {
          const idx = Number((n.dataset.key as string).split(':')[0]);
          void this.patch({ publish: (this.s.publish ?? []).filter((_, j) => j !== idx) });
        });
        return n;
      },
      update: (n, { d }) => {
        const label = d.type === 'family' ? `Send to ${String(d.app)}` : String(d.type).toUpperCase();
        setText(q(n, '.fe-pub-type'), label);
        const box = q<HTMLInputElement>(n, '.fe-pub-head input');
        if (box.checked !== (d.enabled !== false)) box.checked = d.enabled !== false;
        for (const row of Array.from(n.querySelectorAll<HTMLElement>('[data-pk]'))) {
          const input = row.querySelector<HTMLInputElement>('input');
          const val = d[row.dataset.pk as string];
          if (!input) continue;
          if (input.type === 'checkbox') {
            if (input.checked !== (val === true)) input.checked = val === true;
          } else if (document.activeElement !== input && input.value !== String(val ?? '')) input.value = String(val ?? '');
        }
      },
    });
    if (!rows.length && !list.childElementCount) list.appendChild(el('<p class="fx-note fe-pub-none">No destinations: the file stays where Output Name says.</p>'));
    if (rows.length) list.querySelector('.fe-pub-none')?.remove();
  }

  private buildMetadata(): void {
    const host = q(this.scrim, '[data-pane="metadata"]');
    if (host.childElementCount) return;
    const fields: FieldSpec[] = [
      f('metadata.mode', 'Source Metadata', 'select', { options: [['retain', 'Keep the source metadata'], ['clear', 'Remove all metadata']] }),
      f('metadata.xmpSidecar', 'Write an XMP sidecar', 'bool'),
      f('metadata.fields.title', 'Title', 'text'),
      f('metadata.fields.artist', 'Creator', 'text'),
      f('metadata.fields.description', 'Description', 'text'),
      f('metadata.fields.copyright', 'Copyright', 'text'),
      f('metadata.fields.keywords', 'Keywords', 'text'),
      f('metadata.fields.album', 'Album / Project', 'text'),
      f('metadata.fields.date', 'Date', 'text'),
      f('metadata.fields.comment', 'Comment', 'text'),
    ];
    for (const x of fields) {
      const c = fieldControl(x, (k, v) => void this.patch({ [k]: v }));
      this.controls.set(x.key, c);
      host.appendChild(c.row);
    }
    const tpl = el(`<div class="fe-field"><span class="fe-field-label">Template</span><span class="fe-field-ctl"><select class="fx-select fe-md-tpl"><option value="">None</option></select><button class="cv-icon-btn" type="button" data-md="save" title="Save these fields as a template">${icon('preset', 14)}</button></span></div>`);
    const rules = el(`<div class="fe-field fe-field-wide"><span class="fe-field-label">Preservation Rules (remove from the source)</span><div class="fe-md-rules"></div></div>`);
    host.insertBefore(rules, host.children[1] ?? null);
    host.insertBefore(tpl, rules);
    const sel = q<HTMLSelectElement>(tpl, 'select');
    sel.addEventListener('change', () => void this.patch({ 'metadata.template': sel.value || null }));
    const load = async (): Promise<void> => {
      const r = await this.ctx.run<{ templates: Array<{ name: string }>; categories: Array<[string, string]> }>('metadata.templates', {});
      if (!r) return;
      const want = ['', ...r.templates.map((t) => t.name)].join('|');
      if (sel.dataset.sig !== want) {
        sel.dataset.sig = want;
        sel.replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: 'None' }), ...r.templates.map((t) => Object.assign(document.createElement('option'), { value: t.name, textContent: t.name })));
      }
      const box = q(rules, '.fe-md-rules');
      if (!box.childElementCount) {
        for (const [id, label] of r.categories) {
          const c = el<HTMLLabelElement>(`<label class="fe-check-label"><input type="checkbox" class="fx-check" data-rule="${id}"><span></span></label>`);
          q(c, 'span').textContent = label;
          q<HTMLInputElement>(c, 'input').addEventListener('change', () => {
            const drop = Array.from(box.querySelectorAll<HTMLInputElement>('[data-rule]')).filter((x) => x.checked).map((x) => x.dataset.rule as string);
            void this.patch({ 'metadata.rules.drop': drop });
          });
          box.appendChild(c);
        }
      }
      this.refreshMetadataExtras();
    };
    q(tpl, '[data-md="save"]').addEventListener('click', async () => {
      const name = await promptName('Save Metadata Template', '', 'Save');
      if (!name) return;
      await this.ctx.run('metadata.saveTemplate', { name, fields: this.get('metadata.fields') ?? {} });
      await load();
      void this.patch({ 'metadata.template': name });
    });
    void load();
  }

  private refreshMetadataExtras(): void {
    const sel = this.scrim.querySelector<HTMLSelectElement>('.fe-md-tpl');
    if (sel) {
      const v = String(this.get('metadata.template') ?? '');
      if ([...sel.options].some((o) => o.value === v) && sel.value !== v && document.activeElement !== sel) sel.value = v;
    }
    const drop = (this.get('metadata.rules.drop') as string[] | undefined) ?? [];
    for (const c of Array.from(this.scrim.querySelectorAll<HTMLInputElement>('[data-rule]'))) {
      const on = drop.includes(c.dataset.rule as string);
      if (c.checked !== on) c.checked = on;
    }
  }

  private showTab(t: Tab): void {
    this.tab = t;
    for (const b of Array.from(this.scrim.querySelectorAll<HTMLElement>('[data-t]'))) setClass(b, 'is-active', b.dataset.t === t);
    for (const p of Array.from(this.scrim.querySelectorAll<HTMLElement>('[data-pane]'))) setHidden(p, p.dataset.pane !== t);
  }

  private sourceSize(): { w: number; h: number } | null {
    const v = (this.info?.sourceInfo as { video?: { width?: number; height?: number; rotation?: number } } | undefined)?.video;
    if (!v?.width || !v?.height) return null;
    const rot = ((Number(v.rotation) || 0) + (Number(this.s.rotation) || 0)) % 180 !== 0;
    return rot ? { w: v.height, h: v.width } : { w: v.width, h: v.height };
  }

  private effectiveCrop(): { l: number; t: number; w: number; h: number } | null {
    const src = this.sourceSize();
    if (!src) return null;
    const c = this.s.crop as Record<string, number | string>;
    let l = Number(c.left) || 0;
    let t = Number(c.top) || 0;
    let w = Math.max(16, src.w - l - (Number(c.right) || 0));
    let h = Math.max(16, src.h - t - (Number(c.bottom) || 0));
    const m = /^([\d.]+):([\d.]+)$/.exec(String(c.proportion ?? 'none'));
    if (m) {
      const target = Number(m[1]) / Number(m[2]);
      const ax = Number(c.anchorX ?? 0.5);
      const ay = Number(c.anchorY ?? 0.5);
      if (w / h > target) {
        const nw = Math.max(16, Math.floor((h * target) / 2) * 2);
        l += Math.min(w - nw, Math.round(((w - nw) * ax) / 2) * 2);
        w = nw;
      } else if (w / h < target) {
        const nh = Math.max(16, Math.floor(w / target / 2) * 2);
        t += Math.min(h - nh, Math.round(((h - nh) * ay) / 2) * 2);
        h = nh;
      }
    }
    return { l, t, w, h };
  }

  private imageRect(): { x: number; y: number; w: number; h: number } | null {
    const fig = q(this.scrim, '.fe-es-fig[data-f="source"]');
    const img = q<HTMLImageElement>(fig, 'img');
    if (!img.naturalWidth || fig.hidden) return null;
    const fr = fig.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const k = Math.min(ir.width / img.naturalWidth, ir.height / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    return { x: ir.left - fr.left + (ir.width - w) / 2, y: ir.top - fr.top + (ir.height - h) / 2, w, h };
  }

  private placeCropBox(): void {
    if (this.cropDrag) return;
    const box = q(this.scrim, '.fe-es-cropbox');
    const src = this.sourceSize();
    const rect = this.imageRect();
    const crop = this.effectiveCrop();
    const show = !!(src && rect && crop) && this.view !== 'output';
    setHidden(box, !show);
    if (!show || !src || !rect || !crop) return;
    const sx = rect.w / src.w;
    const sy = rect.h / src.h;
    setStyleVar(box, '--cb-x', `${rect.x + crop.l * sx}px`);
    setStyleVar(box, '--cb-y', `${rect.y + crop.t * sy}px`);
    setStyleVar(box, '--cb-w', `${crop.w * sx}px`);
    setStyleVar(box, '--cb-h', `${crop.h * sy}px`);
  }

  private cropDrag = false;

  private bindCropBox(): void {
    const box = q(this.scrim, '.fe-es-cropbox');
    box.addEventListener('pointerdown', (e) => {
      const handle = (e.target as HTMLElement).dataset.h;
      const src = this.sourceSize();
      const rect = this.imageRect();
      const crop = this.effectiveCrop();
      if (!handle || !src || !rect || !crop) return;
      e.preventDefault();
      box.setPointerCapture(e.pointerId);
      this.cropDrag = true;
      const sx = rect.w / src.w;
      const sy = rect.h / src.h;
      const start = { x: e.clientX, y: e.clientY };
      const c = this.s.crop as Record<string, number | string>;
      const base = { l: Number(c.left) || 0, t: Number(c.top) || 0, r: Number(c.right) || 0, b: Number(c.bottom) || 0 };
      const proportional = String(c.proportion ?? 'none') !== 'none';
      let next: Record<string, number> = {};
      const move = (ev: PointerEvent): void => {
        const dx = (ev.clientX - start.x) / sx;
        const dy = (ev.clientY - start.y) / sy;
        const even = (n: number): number => Math.max(0, Math.round(n / 2) * 2);
        if (handle === 'move' && proportional) {
          const freeW = src.w - base.l - base.r - crop.w;
          const freeH = src.h - base.t - base.b - crop.h;
          const ax = freeW > 0 ? Math.min(1, Math.max(0, (crop.l - base.l + dx) / freeW)) : 0.5;
          const ay = freeH > 0 ? Math.min(1, Math.max(0, (crop.t - base.t + dy) / freeH)) : 0.5;
          next = { 'crop.anchorX': Math.round(ax * 1000) / 1000, 'crop.anchorY': Math.round(ay * 1000) / 1000 };
          setStyleVar(box, '--cb-x', `${rect.x + (base.l + ax * freeW) * sx}px`);
          setStyleVar(box, '--cb-y', `${rect.y + (base.t + ay * freeH) * sy}px`);
          return;
        }
        const n = { ...base };
        if (handle === 'move') {
          const mx = Math.min(Math.max(-base.l, dx), base.r);
          const my = Math.min(Math.max(-base.t, dy), base.b);
          n.l = base.l + mx; n.r = base.r - mx; n.t = base.t + my; n.b = base.b - my;
        }
        if (handle === 'l') n.l = Math.min(src.w - n.r - 16, Math.max(0, base.l + dx));
        if (handle === 'r') n.r = Math.min(src.w - n.l - 16, Math.max(0, base.r - dx));
        if (handle === 't') n.t = Math.min(src.h - n.b - 16, Math.max(0, base.t + dy));
        if (handle === 'b') n.b = Math.min(src.h - n.t - 16, Math.max(0, base.b - dy));
        n.l = even(n.l); n.t = even(n.t); n.r = even(n.r); n.b = even(n.b);
        next = { 'crop.left': n.l, 'crop.top': n.t, 'crop.right': n.r, 'crop.bottom': n.b };
        setStyleVar(box, '--cb-x', `${rect.x + n.l * sx}px`);
        setStyleVar(box, '--cb-y', `${rect.y + n.t * sy}px`);
        setStyleVar(box, '--cb-w', `${(src.w - n.l - n.r) * sx}px`);
        setStyleVar(box, '--cb-h', `${(src.h - n.t - n.b) * sy}px`);
      };
      const up = (): void => {
        box.removeEventListener('pointermove', move);
        box.removeEventListener('pointerup', up);
        box.removeEventListener('pointercancel', up);
        this.cropDrag = false;
        if (Object.keys(next).length) void this.patch(next);
        else this.placeCropBox();
      };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
    });
    const img = q<HTMLImageElement>(this.scrim, '.fe-es-fig[data-f="source"] img');
    img.addEventListener('load', () => this.placeCropBox());
    if (window.ResizeObserver) new ResizeObserver(() => this.placeCropBox()).observe(q(this.scrim, '.fe-es-stage'));
  }

  private setView(v: View): void {
    this.view = v;
    for (const b of Array.from(this.scrim.querySelectorAll<HTMLElement>('[data-v]'))) setClass(b, 'is-active', b.dataset.v === v);
    setClass(q(this.scrim, '.fe-es-stage'), 'is-compare', v === 'compare');
    for (const fig of Array.from(this.scrim.querySelectorAll<HTMLElement>('.fe-es-fig'))) setHidden(fig, !(v === 'compare' || fig.dataset.f === v));
    this.placeCropBox();
    this.schedulePreview(0);
  }

  private refreshAll(): void {
    const s = this.s;
    setText(q(this.scrim, '[data-a="format"]'), this.desc?.label ?? s.format);
    setText(q(this.scrim, '[data-a="preset"]'), s.presetName || 'Custom');
    const out = this.ctx.store.output(this.output);
    setText(q(this.scrim, '.fe-es-out'), basename(out?.path || ''));
    setTitle(q(this.scrim, '.fe-es-out'), out?.path || '');
    for (const i of Array.from(this.scrim.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]'))) {
      const v = this.get(i.dataset.k as string);
      if (i instanceof HTMLInputElement && i.type === 'checkbox') {
        if (i.checked !== (v === true)) i.checked = v === true;
      } else if (document.activeElement !== i) {
        const want = v === null || v === undefined ? '' : String(v);
        if (i.value !== want) i.value = want;
      }
    }
    for (const i of Array.from(this.scrim.querySelectorAll<HTMLInputElement>('[data-crop]'))) {
      const want = String((s.crop as Record<string, number>)[i.dataset.crop as string] ?? 0);
      if (document.activeElement !== i && i.value !== want) i.value = want;
    }
    this.placeCropBox();
    const match = s.video?.matchSource !== false;
    for (const [key, c] of this.controls) {
      c.set(this.get(key));
      if (['video.width', 'video.height', 'video.frameRate', 'video.fieldOrder', 'video.pixelAspect'].includes(key)) c.setDisabled(match);
      const spec = [...(this.desc?.video ?? []), ...(this.desc?.audio ?? []), ...(this.desc?.multiplexer ?? []), ...(this.desc?.package ?? [])].find((x) => x.key === key);
      const cond = spec?.showIf ?? c.row.dataset.showIf;
      if (cond !== undefined) setHidden(c.row, !showIf(cond || undefined, (k) => this.get(k)));
    }
    for (const fx of EFFECTS) setClass(q(this.scrim, `[data-fx="${fx.key}"]`), 'is-on', this.get(`effects.${fx.key}.enabled`) === true);
    this.renderPublish();
    this.renderRange();
    this.refreshMetadataExtras();
    setText(q(this.scrim, '[data-sum="out"]'), [this.summary.format, this.summary.video, this.summary.audio].filter(Boolean).join(' · '));
  }

  private renderRange(): void {
    const dur = Number(this.info?.sourceInfo?.duration) || 0;
    const r = this.s.range;
    const a = r.mode === 'entire' || r.in === null ? 0 : Number(r.in);
    const b = r.mode === 'entire' || r.out === null ? dur : Number(r.out);
    const bar = q(this.scrim, '.fe-es-inout');
    bar.style.left = `${dur ? (a / dur) * 100 : 0}%`;
    bar.style.width = `${dur ? Math.max(0.5, ((b - a) / dur) * 100) : 100}%`;
    setText(q(this.scrim, '.fe-es-rangelabel'), r.mode === 'entire' ? `Entire source · ${fmtClock(dur)}` : `${fmtClock(a)} to ${fmtClock(b)} · ${fmtClock(b - a)}`);
  }

  private patch(p: Record<string, unknown>): Promise<void> {
    this.applying = this.applying.then(async () => {
      const before = this.s.format;
      const beforeCodecs = `${String(this.get('video.codec'))}|${String(this.get('audio.codec'))}`;
      const r = await this.ctx.run<{ settings: Settings; summary: Summary; estimate: { bytes: number } | null }>('settings.apply', { settings: this.s, patch: p, output: this.output });
      if (!r) return;
      this.s = r.settings;
      this.summary = r.summary;
      setText(q(this.scrim, '.fe-es-est'), r.estimate ? `Estimated File Size: ${fmtBytes(r.estimate.bytes)}` : '');
      if (before !== this.s.format || beforeCodecs !== `${String(this.get('video.codec'))}|${String(this.get('audio.codec'))}`) await this.describe();
      this.refreshAll();
      this.schedulePreview(260);
    });
    return this.applying;
  }

  private schedulePreview(ms: number): void {
    window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => void this.preview(), ms);
  }

  private async preview(): Promise<void> {
    if (this.scrim.hidden || !this.output) return;
    const seq = ++this.previewSeq;
    const busy = q(this.scrim, '.fe-es-busy');
    const t = setTimeout(() => busy.classList.add('is-shown'), 300);
    const views: Array<'source' | 'output'> = this.view === 'compare' ? ['source', 'output'] : [this.view];
    const stage = q(this.scrim, '.fe-es-stage');
    const width = Math.min(1280, Math.round(stage.clientWidth * (this.view === 'compare' ? 0.5 : 1) * Math.min(2, window.devicePixelRatio || 1))) || 960;
    try {
      for (const v of views) {
        const r = await this.ctx.client.call<{ png: string }>('frame.png', { output: this.output, time: this.time, width, view: v, patch: this.s });
        if (seq !== this.previewSeq) return;
        await swapMedia(q<HTMLImageElement>(this.scrim, `.fe-es-fig[data-f="${v}"] img`), `data:image/png;base64,${r.png}`);
      }
      setHidden(q(this.scrim, '.fe-es-err'), true);
    } catch (e) {
      if (seq !== this.previewSeq) return;
      const err = q(this.scrim, '.fe-es-err');
      setText(err, (e as Error).message);
      setHidden(err, false);
    } finally {
      clearTimeout(t);
      window.setTimeout(() => busy.classList.remove('is-shown'), 250);
    }
  }

  private async action(a: string, e: Event): Promise<void> {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    switch (a) {
      case 'close':
      case 'cancel':
        this.close();
        return;
      case 'ok':
        await this.applying;
        if (await this.ctx.run('queue.setSettings', { refs: [this.output], settings: this.s, replace: true })) this.close();
        return;
      case 'format': {
        const rows = await formats(this.ctx);
        const groups = new Map<string, typeof rows>();
        for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
        contextMenu(rect.left, rect.bottom + 2, [...groups.entries()].map(([g, list]) => ({ label: g, children: list.map((x) => ({ label: x.label, checked: x.id === this.s.format, run: () => void this.patch({ format: x.id }) })) })));
        return;
      }
      case 'preset': {
        const entries = await presetEntries(this.ctx, String(this.s.preset ?? ''), (id) => void this.applyPreset(id), 'encode', this.s.format);
        const all = await presetEntries(this.ctx, String(this.s.preset ?? ''), (id) => void this.applyPreset(id));
        contextMenu(rect.left, rect.bottom + 2, entries.length ? [...entries, '-', { label: 'All Presets', children: all }] : all);
        return;
      }
      case 'savePreset': {
        const name = await promptName('Save Preset', String(this.s.presetName || 'My Preset').replace(/ \(modified\)$/, ''), 'Save');
        if (!name) return;
        const r = await this.ctx.run<{ preset: string; name: string }>('preset.create', { name, settings: this.s });
        if (r) {
          await this.patch({ preset: r.preset, presetName: r.name ?? name });
          toast(`Saved preset ${name}`, 'ok');
          this.ctx.ui.emit('presets', undefined);
        }
        return;
      }
      case 'importPreset': {
        const got = await pickFiles({ title: 'Import Preset', mode: 'open', extensions: ['fepreset', 'json', 'epr'] });
        if (!got?.length) return;
        const r = await this.ctx.run<{ preset: string }>('preset.import', { path: got[0] });
        if (r?.preset) await this.applyPreset(r.preset);
        return;
      }
      case 'outName': {
        const out = this.ctx.store.output(this.output);
        const got = await pickFiles({ title: 'Output Name', mode: 'save', defaultName: basename(out?.path || 'output') });
        if (got?.length) {
          await this.ctx.run('queue.setOutput', { refs: [this.output], path: got[0] });
          this.refreshAll();
        }
        return;
      }
      case 'in':
      case 'out': {
        const r = this.s.range;
        const dur = Number(this.info?.sourceInfo?.duration) || 0;
        const a0 = r.mode === 'entire' || r.in === null ? 0 : Number(r.in);
        const b0 = r.mode === 'entire' || r.out === null ? dur : Number(r.out);
        const next = a === 'in' ? { mode: 'custom', in: Math.min(this.time, b0 - 0.04), out: b0 } : { mode: 'custom', in: a0, out: Math.max(this.time, a0 + 0.04) };
        await this.patch({ range: next });
        return;
      }
      case 'entire':
        await this.patch({ range: { mode: 'entire', in: null, out: null } });
        return;
      case 'command': {
        await this.applying;
        const saved = await this.ctx.run('queue.setSettings', { refs: [this.output], settings: this.s, replace: true });
        if (!saved) return;
        const r = await this.ctx.run<{ command: string; notes: string[] }>('encode.command', { output: this.output });
        if (r) {
          const { report } = await import('../ui/report');
          report('FFmpeg Command', r.command.split('\n').join('\n\n'));
        }
      }
    }
  }

  private async applyPreset(id: string): Promise<void> {
    const r = await this.ctx.run<{ settings: Settings }>('preset.get', { preset: id });
    if (!r) return;
    const keep = { range: this.s.range, outputName: this.s.outputName };
    const applied = await this.ctx.run<{ settings: Settings; summary: Summary }>('settings.apply', { settings: r.settings, patch: keep, output: this.output });
    if (!applied) return;
    this.s = applied.settings;
    this.summary = applied.summary;
    await this.describe();
    this.refreshAll();
    this.schedulePreview(0);
  }
}
