import { run, planFor, type Plan, type Settings as RunSettings } from '../../../demo/src/engine/encode';
import { loadFile, type Curated } from '../../../demo/src/engine/media';
import { probeFile, type ProbeInfo } from '../../../demo/src/engine/probe';
import { AUDIO_TARGETS, PRESET_BY_ID, TARGET_EXT, TARGET_MIME } from '../../../demo/src/engine/presets';
import { openFile, type Source } from '../../../demo/src/engine/source';
import logoUrl from '../favicon.png';
import srtText from './data/programme.srt?raw';
import { CAPTION_EXT, CAPTION_MIME, checkCues, parseCues, writeCaptions, type CaptionCheck, type CaptionFormat, type Cue } from './engine/captions';
import { normalise, limitFrame, type NormaliseResult } from './engine/dsp';
import { analyse, fmt, signed, type Analysis } from './engine/meter';
import { drawOverlays, type CaptionStyle, type OverlayInput, type OverlaySettings } from './engine/overlay';
import { PROFILE_BY_ID, STANDARD_BY_ID, type CaptionMode, type StandardId } from './engine/standards';
import { loudnessReport } from './engine/report';

export interface Settings {
  profileId: string;
  loudness: { enabled: boolean; standard: StandardId; target: number; tolerance: number; truePeak: number; limiter: boolean; report: boolean };
  captions: { mode: CaptionMode; format: CaptionFormat; size: number; color: string; background: number; position: 'bottom' | 'top' };
  overlays: OverlaySettings;
  videoLimiter: { enabled: boolean; min: number; max: number };
  range: { start: number; end: number };
  renderWidth: number;
}

export type Topic = 'frame' | 'profile' | 'settings' | 'audio' | 'cues' | 'source' | 'deliverables' | 'verify' | 'log' | 'run';

export interface Deliverable {
  key: 'media' | 'captions' | 'report' | 'verify';
  name: string;
  detail: string;
  status: 'idle' | 'running' | 'done' | 'failed' | 'skipped';
  blob: Blob | null;
  mime: string;
}

export interface VerifyRow {
  label: string;
  expected: string;
  measured: string;
  state: 'pass' | 'fail' | 'note';
}

export const PROGRAMME: Curated = {
  pack: 'programme',
  file: 'on-the-sea-programme.mp4',
  mime: 'video/mp4',
  kind: 'video',
  width: 1280,
  height: 720,
  fps: 25,
  duration: 17.4,
  bytes: 4880602,
  outputs: [],
};

type Listener = () => void;

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function defaultSettings(): Settings {
  return {
    profileId: 'ebu',
    loudness: { enabled: true, standard: 'ebu-r128', target: -23, tolerance: 1, truePeak: -1, limiter: false, report: true },
    captions: { mode: 'sidecar', format: 'ttml', size: 5.2, color: '#ffffff', background: 62, position: 'bottom' },
    overlays: {
      timecode: { enabled: false, position: 'topLeft', size: 3.6, background: 55, start: '10:00:00:00', drop: false },
      name: { enabled: false, position: 'topRight', size: 3, background: 55, prefix: '' },
      text: { enabled: false, position: 'center', size: 6, background: 0, text: 'FOR REVIEW ONLY' },
      logo: { enabled: false, position: 'bottomRight', size: 9, opacity: 80 },
    },
    videoLimiter: { enabled: true, min: 0, max: 96 },
    range: { start: 0, end: 17.4 },
    renderWidth: 1280,
  };
}

class Job {
  settings: Settings = defaultSettings();
  source: Source | null = null;
  file: File | null = null;
  probe: ProbeInfo | null = null;
  video: HTMLVideoElement | null = null;
  hasPicture = true;
  fps = 25;
  duration = 17.4;
  name = '';
  rate = 48000;
  buffer: AudioBuffer | null = null;
  channels: Float32Array[] = [];
  original: Analysis | null = null;
  processed: NormaliseResult | null = null;
  processedBuffer: AudioBuffer | null = null;
  processedOffset = 0;
  cues: Cue[] = [];
  cueName = 'programme.srt';
  logo: HTMLImageElement | null = null;
  deliverables: Deliverable[] = [];
  verify: VerifyRow[] = [];
  verifyState: 'none' | 'pass' | 'fail' = 'none';
  captionChecks: CaptionCheck[] = [];
  running = false;
  progress = 0;
  message = '';
  preview: HTMLCanvasElement | null = null;
  logs: Array<{ time: string; text: string; error: boolean }> = [];
  ready = false;
  private readonly listeners = new Map<Topic, Set<Listener>>();
  private audioTimer = 0;
  private abort: AbortController | null = null;

  on(topic: Topic, fn: Listener): void {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic)?.add(fn);
  }

  emit(topic: Topic): void {
    for (const fn of this.listeners.get(topic) ?? []) fn();
  }

  log(text: string, error = false): void {
    const d = new Date();
    this.logs.push({ time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`, text, error });
    if (this.logs.length > 300) this.logs.shift();
    this.emit('log');
  }

  stem(): string {
    return this.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_') || 'programme';
  }

  captionStyle(): CaptionStyle {
    const c = this.settings.captions;
    return { burn: c.mode === 'burnin', size: c.size, color: c.color, background: c.background, position: c.position };
  }

  overlayInput(): OverlayInput {
    return { overlays: this.settings.overlays, captions: this.captionStyle(), cues: this.cues, fps: this.fps, name: this.stem(), logo: this.logo };
  }

  async start(): Promise<void> {
    this.cues = parseCues(srtText);
    this.captionChecks = checkCues(this.cues, this.fps);
    this.logo = await new Promise<HTMLImageElement>((resolve) => {
      const i = new Image();
      i.onload = (): void => resolve(i);
      i.src = logoUrl;
    });
    this.applyProfile('review', false);
    this.emit('cues');
    try {
      const file = await loadFile(PROGRAMME);
      await this.adopt(file, PROGRAMME.fps);
    } catch (e) {
      this.log(`The programme pack did not load: ${(e as Error).message}`, true);
    }
  }

  async adopt(file: File, knownFps: number | null): Promise<void> {
    this.ready = false;
    this.emit('source');
    this.video?.removeAttribute('src');
    this.source?.dispose();
    const source = await openFile(file, knownFps);
    this.file = file;
    this.source = source;
    this.name = file.name;
    this.hasPicture = source.kind === 'video';
    this.fps = source.fps || 25;
    this.duration = source.duration;
    this.settings.range = { start: 0, end: Math.round(source.duration * 100) / 100 };
    this.probe = await probeFile(file);
    if (this.hasPicture) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = URL.createObjectURL(file);
      await new Promise<void>((resolve) => {
        v.addEventListener('loadeddata', () => resolve(), { once: true });
        v.addEventListener('error', () => resolve(), { once: true });
      });
      this.video = v;
    } else {
      this.video = null;
    }
    this.buffer = await source.audio();
    this.channels = [];
    this.original = null;
    if (this.buffer) {
      this.rate = this.buffer.sampleRate;
      for (let c = 0; c < this.buffer.numberOfChannels; c++) this.channels.push(this.buffer.getChannelData(c));
      await new Promise((r) => window.setTimeout(r, 0));
      this.original = analyse(this.channels, this.rate);
      this.log(`Loudness of ${file.name}: ${fmt(this.original.integrated)} LUFS, LRA ${fmt(this.original.lra)} LU, true peak ${fmt(this.original.truePeak)} dBTP`);
    } else {
      this.log(`${file.name} has no audio the browser can decode`);
    }
    this.ready = true;
    this.log(`Opened ${file.name}: ${source.width}x${source.height}, ${this.fps} fps, ${source.duration.toFixed(2)} s`);
    this.refreshAudio();
    this.emit('source');
    this.emit('settings');
  }

  loadCaptions(text: string, name: string): void {
    const cues = parseCues(text);
    if (!cues.length) { this.log(`${name} holds no cues`, true); return; }
    this.cues = cues;
    this.cueName = name;
    this.captionChecks = checkCues(cues, this.fps);
    this.log(`Captions from ${name}: ${cues.length} cues`);
    this.emit('cues');
  }

  applyProfile(id: string, announce = true): void {
    const p = PROFILE_BY_ID.get(id);
    if (!p) return;
    const s = this.settings;
    const std = STANDARD_BY_ID.get(p.standard);
    s.profileId = id;
    s.loudness = { ...s.loudness, enabled: true, standard: p.standard, target: std?.target ?? -23, truePeak: std?.truePeak ?? -1, limiter: p.limiter };
    s.captions = { ...s.captions, mode: p.captions.mode, format: p.captions.format };
    s.overlays.timecode.enabled = p.overlays.timecode;
    s.overlays.timecode.start = p.startTimecode;
    s.overlays.name.enabled = p.overlays.name;
    s.overlays.text.enabled = p.overlays.text;
    s.overlays.logo.enabled = p.overlays.logo;
    s.videoLimiter.enabled = p.videoLimiter;
    if (announce) this.log(`Profile ${PRESET_BY_ID.get(p.presetId)?.name ?? p.id}: ${std?.label ?? ''} ${std?.target ?? ''} LUFS, captions ${p.captions.mode}`);
    this.emit('profile');
    this.changed();
  }

  changed(): void {
    this.emit('settings');
    window.clearTimeout(this.audioTimer);
    this.audioTimer = window.setTimeout(() => this.refreshAudio(), 120);
  }

  setStandard(id: StandardId): void {
    const std = STANDARD_BY_ID.get(id);
    this.settings.loudness.standard = id;
    if (std) {
      this.settings.loudness.target = std.target;
      this.settings.loudness.truePeak = std.truePeak;
    }
    this.changed();
  }

  rangeChannels(): Float32Array[] {
    const a = Math.max(0, Math.floor(this.settings.range.start * this.rate));
    const b = Math.min(this.channels[0]?.length ?? 0, Math.ceil(this.settings.range.end * this.rate));
    return this.channels.map((c) => c.slice(a, b));
  }

  refreshAudio(): void {
    const l = this.settings.loudness;
    this.processed = null;
    this.processedBuffer = null;
    if (this.original && l.enabled && this.channels.length) {
      const crop = this.rangeChannels();
      if (crop[0]?.length > this.rate * 0.5) {
        const before = analyse(crop, this.rate);
        this.processed = normalise(crop, this.rate, before, l.target, l.truePeak, l.limiter, 5, 50);
        this.processedOffset = this.settings.range.start;
        const buf = new AudioBuffer({ length: crop[0].length, numberOfChannels: crop.length, sampleRate: this.rate });
        this.processed.channels.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
        this.processedBuffer = buf;
      }
    }
    this.emit('audio');
  }

  finalChannels(): { channels: Float32Array[]; rate: number } | null {
    if (!this.channels.length) return null;
    if (this.processed) return { channels: this.processed.channels, rate: this.rate };
    return { channels: this.rangeChannels(), rate: this.rate };
  }

  drawFrame(g: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, t: number): void {
    g.drawImage(img, 0, 0, w, h);
    const vl = this.settings.videoLimiter;
    if (vl.enabled) {
      const data = g.getImageData(0, 0, w, h);
      limitFrame(data.data, vl.min, vl.max);
      g.putImageData(data, 0, 0);
    }
    drawOverlays(g, w, h, t, this.overlayInput());
  }

  currentPreset(): string {
    return PROFILE_BY_ID.get(this.settings.profileId)?.presetId ?? 'match-source-medium';
  }

  async deliver(): Promise<void> {
    const src = this.source;
    if (this.running || !src) return;
    const preset = PRESET_BY_ID.get(this.currentPreset());
    if (!preset?.target) { this.log(`${preset?.name ?? 'This preset'} needs the desktop engine`, true); return; }
    const isAudio = AUDIO_TARGETS.has(preset.target);
    if (!isAudio && !this.hasPicture) { this.log('This source has no picture for a video preset', true); return; }
    this.running = true;
    this.progress = 0;
    this.abort = new AbortController();
    this.verify = [];
    this.verifyState = 'none';
    const stem = this.stem();
    const ext = TARGET_EXT[preset.target];
    const media: Deliverable = { key: 'media', name: `${stem}_${preset.id}.${ext}`, detail: '', status: 'running', blob: null, mime: TARGET_MIME[preset.target] };
    const cap = this.settings.captions;
    const capName = `${stem}_${preset.id}.${CAPTION_EXT[cap.format]}`;
    const captions: Deliverable = { key: 'captions', name: capName, detail: '', status: cap.mode === 'sidecar' && this.cues.length ? 'idle' : 'skipped', blob: null, mime: CAPTION_MIME[cap.format] };
    const report: Deliverable = { key: 'report', name: `${stem}_${preset.id}.loudness.xml`, detail: '', status: this.settings.loudness.enabled && this.settings.loudness.report ? 'idle' : 'skipped', blob: null, mime: 'application/xml' };
    const verify: Deliverable = { key: 'verify', name: `${stem}_${preset.id}.verify.json`, detail: '', status: 'idle', blob: null, mime: 'application/json' };
    this.deliverables = [media, captions, report, verify];
    this.emit('deliverables');
    this.emit('verify');
    this.emit('run');
    const s = this.settings;
    const audio = this.finalChannels();
    const rate = this.rate;
    const wrapped = this.wrap(src, audio, rate);
    const runSettings: RunSettings = { size: s.renderWidth >= 1280 ? 'preset' : s.renderWidth, fps: null, mbps: null, codec: 'auto', audio: true, lufs: null, start: s.range.start, end: s.range.end };
    let plan: Plan | null = null;
    try {
      plan = planFor(wrapped, preset, runSettings);
      this.log(`Render ${media.name}: ${isAudio ? 'audio' : `${plan.width}x${plan.height}, ${plan.fps} fps, ${plan.frames} frames`}, ${s.range.start.toFixed(2)} to ${s.range.end.toFixed(2)} s`);
      const result = await run({
        source: wrapped,
        preset,
        settings: runSettings,
        signal: this.abort.signal,
        onProgress: (p) => { this.progress = p.fraction; this.message = `${p.message} · frame ${p.frame} of ${p.frames}`; this.emit('run'); },
        onPreview: (c) => { this.preview = c; this.emit('run'); },
      });
      media.blob = result.blob;
      media.status = 'done';
      media.detail = `${result.encoder}${result.note ? `. ${result.note}` : ''}`;
      media.name = `${stem}_${preset.id}.${result.ext}`;
      this.log(`Rendered ${media.name} (${(result.blob.size / 1e6).toFixed(2)} MB)`);
    } catch (e) {
      media.status = (e as Error).name === 'AbortError' ? 'idle' : 'failed';
      media.detail = (e as Error).message;
      this.log(`Render ${media.status === 'failed' ? 'failed' : 'stopped'}: ${(e as Error).message}`, media.status === 'failed');
    }
    this.emit('deliverables');
    if (captions.status === 'idle') {
      const a = s.range.start, b = s.range.end;
      const cues = this.cues.filter((c) => c.end > a && c.start < b).map((c) => ({ start: Math.max(0, c.start - a), end: Math.min(b, c.end) - a, text: c.text }));
      captions.blob = new Blob([writeCaptions(cues, cap.format, 0)], { type: captions.mime });
      captions.status = 'done';
      captions.detail = `${cues.length} cues as ${cap.format.toUpperCase()}${cap.format === 'scc' ? ' (29.97 drop frame, pop-on, rows 14 and 15)' : ''}`;
      this.log(`Wrote ${captions.name}`);
    }
    if (media.status === 'done' && media.blob && plan) await this.verifyOutput(media, plan, report, verify, preset.id);
    else { report.status = 'skipped'; verify.status = 'skipped'; }
    this.running = false;
    this.progress = 1;
    this.emit('deliverables');
    this.emit('verify');
    this.emit('run');
  }

  stop(): void {
    this.abort?.abort();
  }

  private wrap(src: Source, audio: { channels: Float32Array[]; rate: number } | null, rate: number): Source {
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const g = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    const start = this.settings.range.start;
    let buffer: AudioBuffer | null = null;
    if (audio && audio.channels.length) {
      const lead = start;
      const length = audio.channels[0].length + Math.round(lead * rate);
      buffer = new AudioBuffer({ length, numberOfChannels: audio.channels.length, sampleRate: rate });
      audio.channels.forEach((c, i) => buffer?.copyToChannel(c as Float32Array<ArrayBuffer>, i, Math.round(lead * rate)));
    }
    return {
      ...src,
      async frame(t: number): Promise<CanvasImageSource> {
        const img = await src.frame(t);
        job.drawFrame(g, img, canvas.width, canvas.height, t);
        return canvas;
      },
      audio: () => Promise.resolve(buffer),
    };
  }

  private async verifyOutput(media: Deliverable, plan: Plan, report: Deliverable, verify: Deliverable, presetId: string): Promise<void> {
    verify.status = 'running';
    this.emit('deliverables');
    const preset = PRESET_BY_ID.get(presetId);
    const isAudio = !!preset?.target && AUDIO_TARGETS.has(preset.target);
    const rows: VerifyRow[] = [];
    const l = this.settings.loudness;
    const file = new File([media.blob as Blob], media.name, { type: media.mime });
    let info: ProbeInfo | null = null;
    try { info = await probeFile(file); } catch (e) { this.log(`Probe failed: ${(e as Error).message}`, true); }
    const want = plan.end - plan.start;
    if (info) {
      if (!isAudio && info.video) {
        rows.push({ label: 'Frame size', expected: `${plan.width}x${plan.height}`, measured: `${info.video.width}x${info.video.height}`, state: info.video.width === plan.width && info.video.height === plan.height ? 'pass' : 'fail' });
        const fps = info.video.fps ?? 0;
        rows.push({ label: 'Frame rate', expected: `${plan.fps} fps`, measured: fps ? `${Number(fps.toFixed(3))} fps` : 'not stated', state: fps && Math.abs(fps - plan.fps) < 0.06 ? 'pass' : fps ? 'fail' : 'note' });
        rows.push({ label: 'Video codec', expected: 'VP9 or VP8', measured: info.video.codec, state: /vp[89]/i.test(info.video.codec) ? 'pass' : 'fail' });
      }
      const dur = info.duration ?? 0;
      rows.push({ label: 'Duration', expected: `${want.toFixed(2)} s`, measured: `${dur.toFixed(2)} s`, state: Math.abs(dur - want) <= Math.max(0.1, 2 / plan.fps) ? 'pass' : 'fail' });
      const a = info.audio[0];
      if (a) {
        rows.push({ label: 'Audio codec', expected: isAudio ? 'PCM' : 'Opus', measured: a.codec, state: isAudio ? (/pcm|wav/i.test(a.codec) ? 'pass' : 'note') : /opus/i.test(a.codec) ? 'pass' : 'fail' });
        rows.push({ label: 'Sample rate', expected: `${this.rate} Hz`, measured: `${a.sampleRate} Hz`, state: a.sampleRate === this.rate ? 'pass' : 'fail' });
        rows.push({ label: 'Channels', expected: `${this.channels.length || 2}`, measured: `${a.channels}`, state: a.channels === (this.channels.length || 2) ? 'pass' : 'note' });
      } else {
        rows.push({ label: 'Audio', expected: 'one stream', measured: 'none', state: 'fail' });
      }
    }
    let measured: Analysis | null = null;
    try {
      const ctx = new OfflineAudioContext(2, 1, this.rate);
      const buf = await ctx.decodeAudioData(await (media.blob as Blob).arrayBuffer());
      const ch: Float32Array[] = [];
      for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
      measured = analyse(ch, buf.sampleRate);
    } catch (e) {
      this.log(`The browser could not decode the output audio: ${(e as Error).message}`, true);
    }
    if (measured && l.enabled) {
      const diff = measured.integrated - l.target;
      rows.push({ label: 'Integrated loudness', expected: `${l.target} LUFS ± ${l.tolerance} LU`, measured: `${fmt(measured.integrated)} LUFS (${signed(diff)} LU)`, state: Math.abs(diff) <= l.tolerance ? 'pass' : 'fail' });
      rows.push({ label: 'True peak', expected: `at most ${l.truePeak} dBTP`, measured: `${fmt(measured.truePeak)} dBTP`, state: measured.truePeak <= l.truePeak + 0.05 ? 'pass' : 'fail' });
      rows.push({ label: 'Loudness range', expected: 'reported', measured: `${fmt(measured.lra)} LU`, state: 'note' });
    } else if (measured) {
      rows.push({ label: 'Loudness', expected: 'not normalised', measured: `${fmt(measured.integrated)} LUFS, ${fmt(measured.truePeak)} dBTP`, state: 'note' });
    }
    if (this.settings.captions.mode !== 'none') {
      for (const c of this.captionChecks) rows.push({ label: `Captions: ${c.label}`, expected: this.settings.captions.mode === 'burnin' ? 'burned in' : this.settings.captions.format.toUpperCase(), measured: c.detail, state: c.ok ? 'pass' : 'fail' });
    }
    this.verify = rows;
    this.verifyState = rows.some((r) => r.state === 'fail') ? 'fail' : 'pass';
    verify.blob = new Blob([JSON.stringify({ file: media.name, preset: presetId, checks: rows.map((r) => ({ check: r.label, expected: r.expected, measured: r.measured, result: r.state })), result: this.verifyState }, null, 2)], { type: 'application/json' });
    verify.status = 'done';
    verify.detail = `${rows.filter((r) => r.state === 'pass').length} passed, ${rows.filter((r) => r.state === 'fail').length} to look at`;
    this.log(`Verify ${media.name}: ${verify.detail}`, this.verifyState === 'fail');
    if (report.status === 'idle' && measured && this.processed) {
      report.blob = new Blob([loudnessReport(media.name, STANDARD_BY_ID.get(l.standard)?.label ?? l.standard, l.target, l.truePeak, analyse(this.rangeChannels(), this.rate), measured)], { type: 'application/xml' });
      report.status = 'done';
      report.detail = `${fmt(measured.integrated)} LUFS measured on the output`;
      this.log(`Wrote ${report.name}`);
    } else if (report.status === 'idle') {
      report.status = 'skipped';
    }
    this.emit('verify');
  }
}

export const job = new Job();
