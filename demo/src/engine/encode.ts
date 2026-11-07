import { GifWriter } from './gif';
import { describeLoudness, gainFor, measureLoudness } from './loudness';
import { muxOggOpus, type OpusPacket } from './ogg';
import { encodeAiff, encodeWav } from './pcm';
import { AUDIO_TARGETS, TARGET_EXT, TARGET_MIME, type Preset, type Target } from './presets';
import { SAMPLE_RATE, type Source } from './source';
import { muxWebm, type WebmBlock } from './webm';

export interface Settings {
  size: 'preset' | 'source' | number;
  fps: number | null;
  mbps: number | null;
  codec: 'auto' | 'vp9' | 'vp8';
  audio: boolean;
  lufs: number | null;
  start: number;
  end: number | null;
}

export interface Progress {
  fraction: number;
  frame: number;
  frames: number;
  message: string;
}

export interface RunContext {
  source: Source;
  preset: Preset;
  settings: Settings;
  signal: AbortSignal;
  onProgress(p: Progress): void;
  onPreview(canvas: HTMLCanvasElement): void;
}

export interface RunResult {
  blob: Blob;
  ext: string;
  mime: string;
  encoder: string;
  note: string;
}

export const MAX_SIDE = 1280;

export function defaultSettings(preset: Preset): Settings {
  return { size: 'preset', fps: null, mbps: null, codec: 'auto', audio: true, lufs: preset.lufs, start: 0, end: null };
}

export interface Plan {
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  fps: number;
  mbps: number;
  start: number;
  end: number;
  frames: number;
  capped: boolean;
}

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

export function planFor(source: Source, preset: Preset, s: Settings): Plan {
  const start = Math.max(0, Math.min(s.start, source.duration));
  const end = Math.max(start + 0.05, Math.min(s.end ?? source.duration, source.duration));
  let w = source.width || 640;
  let h = source.height || 360;
  let fit = false;
  const gifPx = preset.target === 'gif' ? Number(/(\d+) px/.exec(preset.name)?.[1] ?? 0) : 0;
  if (typeof s.size === 'number') {
    w = s.size;
    h = (source.height / source.width) * s.size;
  } else if (s.size === 'preset' && preset.width && preset.height) {
    w = preset.width;
    h = preset.height;
    fit = true;
  } else if (s.size === 'preset' && gifPx) {
    w = gifPx;
    h = (source.height / source.width) * gifPx;
  }
  let capped = false;
  const side = Math.max(w, h);
  if (side > MAX_SIDE) {
    const k = MAX_SIDE / side;
    w *= k;
    h *= k;
    capped = true;
  }
  const width = even(w);
  const height = even(h);
  let innerWidth = width;
  let innerHeight = height;
  if (fit && source.width && source.height) {
    const k = Math.min(width / source.width, height / source.height);
    innerWidth = even(source.width * k);
    innerHeight = even(source.height * k);
  }
  const rawFps = s.fps ?? preset.fps ?? (source.fps || 30);
  const fps = Math.max(1, Math.min(60, preset.target === 'gif' ? Math.min(rawFps, 25) : rawFps));
  let mbps = s.mbps ?? 0;
  if (!mbps) {
    if (preset.mbps && preset.width && preset.height) mbps = preset.mbps * ((width * height) / (preset.width * preset.height)) * (fps / (preset.fps || 30));
    else if (preset.mbps) mbps = preset.mbps * 0.25;
    else mbps = 0.09 * width * height * fps / 1e6;
  }
  mbps = Math.max(0.15, Math.min(14, mbps));
  const frames = Math.max(1, Math.floor((end - start) * fps));
  return { width, height, innerWidth, innerHeight, fps, mbps, start, end, frames, capped };
}

export function supportNote(): string {
  const parts: string[] = [];
  parts.push(typeof VideoEncoder === 'undefined' ? 'VideoEncoder missing' : 'VideoEncoder ready');
  parts.push(typeof AudioEncoder === 'undefined' ? 'AudioEncoder missing' : 'AudioEncoder ready');
  return parts.join(', ');
}

function abortIf(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('stopped', 'AbortError');
}

function tick(): Promise<void> {
  return new Promise((r) => window.setTimeout(r, 0));
}

function paint(ctx: CanvasRenderingContext2D, plan: Plan, src: CanvasImageSource, sw: number, sh: number): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, plan.width, plan.height);
  const x = (plan.width - plan.innerWidth) / 2;
  const y = (plan.height - plan.innerHeight) / 2;
  ctx.drawImage(src, 0, 0, sw, sh, x, y, plan.innerWidth, plan.innerHeight);
}

function sourceSize(src: CanvasImageSource, fallback: Source): { w: number; h: number } {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth, h: src.videoHeight };
  if (src instanceof HTMLCanvasElement) return { w: src.width, h: src.height };
  return { w: fallback.width, h: fallback.height };
}

async function cropAudio(ctx: RunContext, plan: Plan): Promise<{ channels: Float32Array[]; rate: number } | null> {
  const buf = await ctx.source.audio();
  if (!buf) return null;
  const a = Math.floor(plan.start * buf.sampleRate);
  const b = Math.min(buf.length, Math.ceil(plan.end * buf.sampleRate));
  const src: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) src.push(buf.getChannelData(c).slice(a, b));
  if (src.length <= 2) return { channels: src, rate: buf.sampleRate };
  const n = src[0].length;
  const l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = src[0][i] + 0.707 * (src[2]?.[i] ?? 0) + 0.707 * (src[4]?.[i] ?? 0);
    r[i] = src[1][i] + 0.707 * (src[2]?.[i] ?? 0) + 0.707 * (src[5]?.[i] ?? 0);
  }
  return { channels: [l, r], rate: buf.sampleRate };
}

function applyGain(channels: Float32Array[], db: number): void {
  const g = 10 ** (db / 20);
  for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= g;
}

async function prepareAudio(ctx: RunContext, plan: Plan): Promise<{ channels: Float32Array[]; rate: number; note: string } | null> {
  const a = await cropAudio(ctx, plan);
  if (!a) return null;
  let note = '';
  const before = measureLoudness(a.channels, a.rate);
  if (ctx.settings.lufs !== null) {
    const g = gainFor(before, ctx.settings.lufs);
    applyGain(a.channels, g.gainDb);
    const after = measureLoudness(a.channels, a.rate);
    note = `Loudness ${describeLoudness(after)} (was ${before.integrated.toFixed(1)} LUFS, gain ${g.gainDb >= 0 ? '+' : ''}${g.gainDb.toFixed(1)} dB${g.limited ? ', held at -1 dBTP' : ''})`;
  } else {
    note = `Loudness ${describeLoudness(before)}`;
  }
  return { channels: a.channels, rate: a.rate, note };
}

async function encodeOpus(channels: Float32Array[], rate: number, bitrate: number, signal: AbortSignal): Promise<Array<{ data: Uint8Array; timeUs: number; samples: number }>> {
  if (typeof AudioEncoder === 'undefined') throw new Error('this browser has no AudioEncoder');
  if (rate !== SAMPLE_RATE) throw new Error(`audio at ${rate} Hz needs resampling; the demo expects ${SAMPLE_RATE} Hz`);
  const config = { codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: channels.length, bitrate };
  const sup = await AudioEncoder.isConfigSupported(config);
  if (!sup.supported) throw new Error('Opus encoding is not available in this browser');
  const out: Array<{ data: Uint8Array; timeUs: number; samples: number }> = [];
  let failure: Error | null = null;
  const enc = new AudioEncoder({
    output: (chunk) => {
      const d = new Uint8Array(chunk.byteLength);
      chunk.copyTo(d);
      out.push({ data: d, timeUs: chunk.timestamp, samples: Math.round(((chunk.duration ?? 20000) / 1e6) * SAMPLE_RATE) });
    },
    error: (e) => { failure = e; },
  });
  enc.configure(config);
  const step = 960;
  const n = channels[0].length;
  for (let o = 0; o < n; o += step) {
    abortIf(signal);
    if (failure) throw failure;
    const len = Math.min(step, n - o);
    const planar = new Float32Array(step * channels.length);
    channels.forEach((c, ci) => planar.set(c.subarray(o, o + len), ci * step));
    const data = new AudioData({ format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: step, numberOfChannels: channels.length, timestamp: Math.round((o / SAMPLE_RATE) * 1e6), data: planar });
    enc.encode(data);
    data.close();
    if (enc.encodeQueueSize > 12) await tick();
  }
  await enc.flush();
  enc.close();
  if (failure) throw failure;
  return out;
}

async function runWebm(ctx: RunContext): Promise<RunResult> {
  if (typeof VideoEncoder === 'undefined') throw new Error('this browser has no WebCodecs VideoEncoder');
  const { source, preset, settings } = ctx;
  if (source.kind !== 'video') throw new Error('this source has no picture');
  const plan = planFor(source, preset, settings);
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const order = settings.codec === 'vp8' ? ['vp8'] : settings.codec === 'vp9' ? ['vp09.00.10.08'] : ['vp09.00.10.08', 'vp8'];
  let codec = '';
  let cfg: VideoEncoderConfig | null = null;
  for (const c of order) {
    const test: VideoEncoderConfig = { codec: c, width: plan.width, height: plan.height, bitrate: Math.round(plan.mbps * 1e6), framerate: plan.fps, latencyMode: 'quality', bitrateMode: 'variable' };
    const s = await VideoEncoder.isConfigSupported(test);
    if (s.supported) { codec = c; cfg = test; break; }
  }
  if (!cfg) throw new Error('neither VP9 nor VP8 encoding is available in this browser');
  const blocks: WebmBlock[] = [];
  let failure: Error | null = null;
  const venc = new VideoEncoder({
    output: (chunk) => {
      const d = new Uint8Array(chunk.byteLength);
      chunk.copyTo(d);
      blocks.push({ track: 1, timeMs: chunk.timestamp / 1000, key: chunk.type === 'key', data: d });
    },
    error: (e) => { failure = e; },
  });
  venc.configure(cfg);
  const began = performance.now();
  const keyEvery = Math.max(1, Math.round(plan.fps * 2));
  let lastPreview = 0;
  for (let k = 0; k < plan.frames; k++) {
    abortIf(ctx.signal);
    if (failure) throw failure;
    const t = plan.start + k / plan.fps;
    const img = await source.frame(t);
    const sz = sourceSize(img, source);
    paint(g, plan, img, sz.w, sz.h);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((k / plan.fps) * 1e6), duration: Math.round(1e6 / plan.fps) });
    venc.encode(frame, { keyFrame: k % keyEvery === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await tick();
    const now = performance.now();
    if (now - lastPreview > 160) { lastPreview = now; ctx.onPreview(canvas); }
    const el = (now - began) / 1000;
    ctx.onProgress({ fraction: ((k + 1) / plan.frames) * 0.92, frame: k + 1, frames: plan.frames, message: `${((k + 1) / Math.max(el, 0.001)).toFixed(1)} fps` });
  }
  await venc.flush();
  venc.close();
  ctx.onPreview(canvas);
  if (failure) throw failure;
  let note = plan.capped ? `Frame size capped at ${MAX_SIDE} px in the browser demo` : '';
  let audioInfo: { sampleRate: number; channels: number; preSkip: number } | null = null;
  if (settings.audio) {
    ctx.onProgress({ fraction: 0.93, frame: plan.frames, frames: plan.frames, message: 'Encoding audio' });
    const a = await prepareAudio(ctx, plan);
    if (a) {
      try {
        const chunks = await encodeOpus(a.channels, a.rate, 128000, ctx.signal);
        for (const c of chunks) blocks.push({ track: 2, timeMs: c.timeUs / 1000, key: true, data: c.data });
        audioInfo = { sampleRate: SAMPLE_RATE, channels: a.channels.length, preSkip: 312 };
        note = [note, a.note].filter(Boolean).join('. ');
      } catch (e) {
        note = [note, `Audio left out: ${(e as Error).message}`].filter(Boolean).join('. ');
      }
    }
  }
  ctx.onProgress({ fraction: 0.98, frame: plan.frames, frames: plan.frames, message: 'Writing WebM' });
  const blob = muxWebm({ codec: codec === 'vp8' ? 'V_VP8' : 'V_VP9', width: plan.width, height: plan.height }, audioInfo, blocks, (plan.end - plan.start) * 1000);
  return { blob, ext: TARGET_EXT.webm, mime: TARGET_MIME.webm, encoder: `WebCodecs ${codec === 'vp8' ? 'VP8' : 'VP9'}${audioInfo ? ' + Opus' : ''} · ${plan.width}x${plan.height} · ${plan.fps} fps · ${plan.mbps.toFixed(1)} Mb/s`, note };
}

async function runGif(ctx: RunContext): Promise<RunResult> {
  const { source, preset, settings } = ctx;
  if (source.kind !== 'video') throw new Error('this source has no picture');
  const plan = planFor(source, preset, settings);
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const g = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const gif = new GifWriter(plan.width, plan.height);
  const delay = Math.max(2, Math.round(100 / plan.fps));
  for (let k = 0; k < plan.frames; k++) {
    abortIf(ctx.signal);
    const img = await source.frame(plan.start + k / plan.fps);
    const sz = sourceSize(img, source);
    paint(g, plan, img, sz.w, sz.h);
    gif.addFrame(g.getImageData(0, 0, plan.width, plan.height).data, delay);
    ctx.onPreview(canvas);
    ctx.onProgress({ fraction: (k + 1) / plan.frames, frame: k + 1, frames: plan.frames, message: 'Quantising' });
    if (k % 2 === 1) await tick();
  }
  const blob = gif.finish();
  return { blob, ext: 'gif', mime: 'image/gif', encoder: `GIF89a · ${plan.width}x${plan.height} · ${plan.fps} fps · 256 colours`, note: plan.capped ? `Frame size capped at ${MAX_SIDE} px in the browser demo` : '' };
}

async function runAudio(ctx: RunContext, target: Target): Promise<RunResult> {
  const { source, preset } = ctx;
  const plan = planFor(source, preset, ctx.settings);
  ctx.onProgress({ fraction: 0.05, frame: 0, frames: 1, message: 'Decoding audio' });
  const a = await prepareAudio(ctx, plan);
  if (!a) throw new Error('this source has no audio the browser can decode');
  abortIf(ctx.signal);
  ctx.onProgress({ fraction: 0.5, frame: 0, frames: 1, message: 'Writing' });
  if (target === 'ogg') {
    const chunks = await encodeOpus(a.channels, a.rate, 160000, ctx.signal);
    const packets: OpusPacket[] = chunks.map((c) => ({ data: c.data, samples: c.samples }));
    const blob = muxOggOpus(packets, a.channels.length, 312, a.rate);
    return { blob, ext: TARGET_EXT.ogg, mime: TARGET_MIME.ogg, encoder: `WebCodecs Opus · ${a.channels.length} ch · 160 kb/s`, note: a.note };
  }
  const blob = target === 'aiff' ? encodeAiff(a.channels, a.rate, preset.bits) : encodeWav(a.channels, a.rate, preset.bits);
  return { blob, ext: TARGET_EXT[target], mime: TARGET_MIME[target], encoder: `PCM ${preset.bits}-bit · ${a.rate} Hz · ${a.channels.length} ch`, note: a.note };
}

async function runStill(ctx: RunContext, target: 'png' | 'jpeg'): Promise<RunResult> {
  const { source, preset, settings } = ctx;
  if (source.kind !== 'video') throw new Error('this source has no picture');
  const plan = planFor(source, preset, settings);
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = await source.frame(plan.start);
  const sz = sourceSize(img, source);
  paint(g, plan, img, sz.w, sz.h);
  ctx.onPreview(canvas);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the canvas could not be saved'))), TARGET_MIME[target], 0.92));
  return { blob, ext: TARGET_EXT[target], mime: TARGET_MIME[target], encoder: `${target.toUpperCase()} still · ${plan.width}x${plan.height}`, note: '' };
}

export async function run(ctx: RunContext): Promise<RunResult> {
  const target = ctx.preset.target;
  if (!target) throw new Error('needs the desktop engine');
  if (target === 'webm') return runWebm(ctx);
  if (target === 'gif') return runGif(ctx);
  if (AUDIO_TARGETS.has(target)) return runAudio(ctx, target);
  return runStill(ctx, target as 'png' | 'jpeg');
}
