import { defaultSettings, planFor, run, type Settings } from '../../../demo/src/engine/encode';
import { PRESET_BY_ID, TARGET_EXT } from '../../../demo/src/engine/presets';
import { probeFile } from '../../../demo/src/engine/probe';
import { openFile, type Source } from '../../../demo/src/engine/source';
import { refreshChecks } from './loader';
import { probeGif } from './lib/gifprobe';
import { md5Blob } from './lib/md5';
import { canvasBlob } from './lib/save';
import { readZipNames, writeZip } from './lib/zip';
import { openSequence } from './media/sequence';
import { stemOf, type Media, type Role } from './model';
import { store } from './store';

export interface Range {
  start: number;
  end: number;
}

export async function reader(m: Media): Promise<Source> {
  if (m.form === 'sequence' && m.frameBlobs) {
    const files = m.frameBlobs.map((blob, i) => ({ name: m.names[i], blob }));
    return (await openSequence(files, m.fps)).source;
  }
  if (!m.blob) throw new Error(`${m.name} has no bytes to read`);
  return openFile(new File([m.blob], m.name, { type: m.blob.type || 'video/mp4' }), m.fps || null);
}

export function rangeOf(m: Media, useMarks: boolean): Range {
  const master = store.master();
  if (useMarks && master && (store.markIn !== null || store.markOut !== null) && m.fps) {
    const a = (store.markIn ?? 0) / master.fps + master.offset - m.offset;
    const b = ((store.markOut ?? master.frames - 1) + 1) / master.fps + master.offset - m.offset;
    return { start: Math.max(0, a), end: Math.min(m.duration, Math.max(a + 1 / m.fps, b)) };
  }
  return { start: 0, end: m.duration };
}

function begin(parent: Media, name: string, role: Role, form: Media['form'], label: string): Media {
  const out = store.make(name, role, form);
  out.parent = parent.id;
  out.origin = 'browser';
  out.label = label;
  out.state = 'working';
  out.message = 'Preparing';
  store.add(out);
  store.working = out.id;
  store.emit('work');
  return out;
}

function progress(m: Media, fraction: number, message: string): void {
  m.progress = fraction;
  m.message = message;
  store.emit('work');
}

function fail(m: Media, err: unknown): void {
  m.state = 'failed';
  m.message = (err as Error).message;
  store.working = '';
  store.log(`${m.name} failed: ${m.message}`, true);
  store.emit('items');
  store.emit('work');
}

export interface EncodeOptions {
  presetId: string;
  range: Range;
  mbps: number | null;
  role: Role;
  signal: AbortSignal;
}

export async function encodeWith(src: Media, o: EncodeOptions): Promise<Media | null> {
  const preset = PRESET_BY_ID.get(o.presetId);
  if (!preset?.target) throw new Error('this preset needs the desktop engine');
  const stem = stemOf(src.name);
  const ext = TARGET_EXT[preset.target];
  const name = o.role === 'proxy' ? `${stem}_Proxy.${ext}` : `${stem}_${o.presetId}${o.mbps ? `_${o.mbps}M` : ''}.${ext}`;
  const out = begin(src, name, o.role, preset.target === 'gif' ? 'animation' : 'video', preset.name);
  out.offset = src.offset + o.range.start;
  store.log(`Added ${preset.name} to ${src.name}`);
  let read: Source | null = null;
  try {
    read = await reader(src);
    const settings: Settings = { ...defaultSettings(preset), start: o.range.start, end: o.range.end, mbps: o.mbps, audio: src.probe ? src.probe.audio.length > 0 : false, lufs: null };
    const plan = planFor(read, preset, settings);
    out.expect = { width: plan.width, height: plan.height, fps: plan.fps, duration: plan.end - plan.start, frames: plan.frames, codec: preset.target === 'gif' ? 'GIF' : 'VP9', audio: settings.audio };
    const result = await run({
      source: read,
      preset,
      settings,
      signal: o.signal,
      onProgress: (p) => progress(out, p.fraction, p.message),
      onPreview: () => undefined,
    });
    out.blob = result.blob;
    out.size = result.blob.size;
    out.label = result.encoder;
    if (preset.target === 'gif') {
      out.gif = await probeGif(result.blob);
      out.url = URL.createObjectURL(result.blob);
      out.width = out.gif?.width ?? plan.width;
      out.height = out.gif?.height ?? plan.height;
      out.frames = out.gif?.frames ?? plan.frames;
      out.fps = plan.fps;
      out.duration = out.gif?.duration ?? plan.end - plan.start;
    } else {
      const file = new File([result.blob], name, { type: result.mime });
      out.probe = await probeFile(file);
      out.source = await openFile(file, out.probe.video?.fps ?? plan.fps);
      out.width = out.probe.video?.width ?? plan.width;
      out.height = out.probe.video?.height ?? plan.height;
      out.fps = out.probe.video?.fps ?? plan.fps;
      out.duration = out.probe.duration ?? plan.end - plan.start;
      out.frames = Math.round(out.duration * out.fps);
    }
    out.message = result.note;
    out.state = 'ready';
    out.progress = 1;
    refreshChecks(out);
    store.working = '';
    store.log(`Done ${name}: ${result.encoder}${result.note ? `. ${result.note}` : ''}`);
    store.emit('items');
    store.emit('work');
    void md5Blob(result.blob).then((h) => { out.md5 = h; out.md5State = 'done'; store.emit('items'); });
    return out;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      store.items = store.items.filter((m) => m.id !== out.id);
      store.working = '';
      store.log(`Stopped ${name}`);
      store.emit('items');
      store.emit('work');
      return null;
    }
    fail(out, err);
    return null;
  } finally {
    read?.dispose();
  }
}

export interface FramesOptions {
  range: Range;
  format: 'png' | 'jpeg';
  width: number;
  signal: AbortSignal;
}

export async function exportFrames(src: Media, o: FramesOptions): Promise<Media | null> {
  const ext = o.format === 'png' ? 'png' : 'jpg';
  const stem = stemOf(src.name);
  const out = begin(src, `${stem}_%04d.${ext}.zip`, 'output', 'archive', `${o.format.toUpperCase()} sequence`);
  out.offset = src.offset + o.range.start;
  let read: Source | null = null;
  try {
    read = await reader(src);
    const fps = src.fps;
    const total = Math.max(1, Math.round((o.range.end - o.range.start) * fps));
    const w = o.width > 0 && o.width < src.width ? o.width - (o.width % 2) : src.width;
    const h = Math.round((w * src.height) / src.width / 2) * 2;
    out.expect = { width: w, height: h, fps, duration: total / fps, frames: total, codec: o.format.toUpperCase(), audio: false };
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    const blobs: Blob[] = [];
    const names: string[] = [];
    for (let i = 0; i < total; i++) {
      if (o.signal.aborted) throw new DOMException('stopped', 'AbortError');
      const img = await read.frame(o.range.start + (i + 0.5) / fps);
      g.drawImage(img, 0, 0, w, h);
      blobs.push(await canvasBlob(canvas, o.format === 'png' ? 'image/png' : 'image/jpeg', 0.9));
      names.push(`${stem}_${String(i + 1).padStart(4, '0')}.${ext}`);
      progress(out, (i + 1) / total, `Frame ${i + 1} of ${total}`);
    }
    out.message = 'Writing ZIP';
    store.emit('work');
    const entries = await Promise.all(blobs.map(async (b, i) => ({ name: names[i], data: new Uint8Array(await b.arrayBuffer()) })));
    const zip = writeZip(entries);
    const back = await readZipNames(zip);
    out.blob = zip;
    out.size = zip.size;
    out.frameBlobs = blobs;
    out.names = names;
    out.width = w;
    out.height = h;
    out.fps = fps;
    out.frames = total;
    out.duration = total / fps;
    const nums = back.map((n) => Number(/(\d+)\.[a-z]+$/.exec(n)?.[1] ?? 0)).sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (!nums.includes(n)) gaps.push(n);
    out.seq = { pattern: `${stem}_%04d.${ext}`, first: nums[0], last: nums[nums.length - 1], count: back.length, gaps, digits: 4, ext: `.${ext}` };
    out.state = 'ready';
    out.progress = 1;
    out.message = `${back.length} files in the ZIP`;
    refreshChecks(out);
    store.working = '';
    store.log(`Done ${out.name}: ${back.length} frames at ${w}x${h}, ${(zip.size / 1048576).toFixed(1)} MB`);
    store.emit('items');
    store.emit('work');
    void md5Blob(zip).then((hash) => { out.md5 = hash; out.md5State = 'done'; store.emit('items'); });
    return out;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      store.items = store.items.filter((m) => m.id !== out.id);
      store.working = '';
      store.log(`Stopped ${out.name}`);
      store.emit('items');
      store.emit('work');
      return null;
    }
    fail(out, err);
    return null;
  } finally {
    read?.dispose();
  }
}

export async function openAsSequence(m: Media): Promise<Media | null> {
  if (!m.frameBlobs || !m.names.length) return null;
  const fps = m.fps || 24;
  const seq = await openSequence(m.frameBlobs.map((blob, i) => ({ name: m.names[i], blob })), fps);
  const s = store.make(seq.info.pattern, 'source', 'sequence');
  s.label = `Numbered stills, ${Number(fps.toFixed(3))} fps`;
  s.source = seq.source;
  s.seq = seq.info;
  s.names = seq.names;
  s.frameBlobs = m.frameBlobs;
  s.size = seq.source.size;
  s.width = seq.width;
  s.height = seq.height;
  s.fps = fps;
  s.frames = seq.info.count;
  s.duration = seq.info.count / fps;
  s.state = 'ready';
  s.origin = 'browser';
  store.add(s);
  store.log(`Opened ${s.name} as an image sequence: ${seq.info.count} frames, ${seq.info.gaps.length ? `${seq.info.gaps.length} missing` : 'no gaps'}`);
  return s;
}

export function verifyAgain(m: Media): void {
  refreshChecks(m);
  const bad = (m.checks ?? []).filter((c) => !c.ok);
  store.log(`Verify ${m.name}: ${bad.length ? bad.map((c) => `${c.label} wanted ${c.want}, got ${c.got}`).join('; ') : `${m.checks?.length ?? 0} checks passed`}`, bad.length > 0);
  store.emit('items');
}
