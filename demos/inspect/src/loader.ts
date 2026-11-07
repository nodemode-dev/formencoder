import { probeFile } from '../../../demo/src/engine/probe';
import { openFile } from '../../../demo/src/engine/source';
import { relinkChecks, verifyMedia } from './facts';
import { probeGif } from './lib/gifprobe';
import { md5Blob } from './lib/md5';
import { injectPack, packBlob, packs, readFrame } from './media/access';
import { openSequence } from './media/sequence';
import type { Form, Media, Role } from './model';
import { store } from './store';

interface Entry {
  pack: string;
  file: string;
  role: Role;
  form: Form;
  parent: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  frames: number;
  size: number;
  codec: string;
  audio: boolean;
  offset: number;
  type: string;
}

const NTSC = 30000 / 1001;
const FILM = 24000 / 1001;

export const ENTRIES: Entry[] = [
  { pack: 'autumn-stream', file: 'autumn-stream.mp4', role: 'source', form: 'video', parent: '', label: 'Camera original, trimmed', width: 1280, height: 720, fps: NTSC, duration: 8.008, frames: 240, size: 6525912, codec: 'H.264', audio: true, offset: 0, type: 'video/mp4' },
  { pack: 'waterfall', file: 'waterfall.mp4', role: 'source', form: 'video', parent: '', label: 'Camera original, trimmed', width: 1280, height: 640, fps: FILM, duration: 6.006, frames: 144, size: 2898071, codec: 'H.264', audio: true, offset: 0, type: 'video/mp4' },
  { pack: 'river-vertical', file: 'river-vertical.mp4', role: 'source', form: 'video', parent: '', label: 'Phone original, vertical', width: 404, height: 720, fps: 60, duration: 6.15, frames: 369, size: 1501308, codec: 'H.264', audio: true, offset: 0, type: 'video/mp4' },
  { pack: 'clouds-sequence', file: 'clouds_%04d.jpg', role: 'source', form: 'sequence', parent: '', label: 'Numbered stills, 24 fps', width: 960, height: 540, fps: 24, duration: 1.5, frames: 36, size: 1700000, codec: 'JPEG', audio: false, offset: 0, type: 'image/jpeg' },
  { pack: 'autumn-stream_high', file: 'autumn-stream_high.mp4', role: 'output', form: 'video', parent: 'autumn-stream.mp4', label: 'Match Source, high: H.264 3.5 Mb/s', width: 1280, height: 720, fps: NTSC, duration: 3.003, frames: 90, size: 1514869, codec: 'H.264', audio: true, offset: 2.002, type: 'video/mp4' },
  { pack: 'autumn-stream_low', file: 'autumn-stream_low.mp4', role: 'output', form: 'video', parent: 'autumn-stream.mp4', label: 'Match Source, low: H.264 0.45 Mb/s', width: 1280, height: 720, fps: NTSC, duration: 3.003, frames: 90, size: 220648, codec: 'H.264', audio: true, offset: 2.002, type: 'video/mp4' },
  { pack: 'autumn-stream_Proxy', file: 'autumn-stream_Proxy.mp4', role: 'proxy', form: 'video', parent: 'autumn-stream.mp4', label: 'H.264 Proxy 960x540', width: 960, height: 540, fps: NTSC, duration: 8.008, frames: 240, size: 2922345, codec: 'H.264', audio: true, offset: 0, type: 'video/mp4' },
  { pack: 'autumn-stream_480', file: 'autumn-stream_480.gif', role: 'output', form: 'animation', parent: 'autumn-stream.mp4', label: 'Animated GIF 480 px', width: 480, height: 270, fps: 15, duration: 3, frames: 45, size: 892598, codec: 'GIF', audio: false, offset: 2.002, type: 'image/gif' },
];

export const OPENING_RANGE = { markIn: 60, markOut: 149 };

function seed(): Map<string, Media> {
  const byName = new Map<string, Media>();
  for (const e of ENTRIES) {
    const m = store.make(e.file, e.role, e.form);
    m.label = e.label;
    m.width = e.width;
    m.height = e.height;
    m.fps = e.fps;
    m.duration = e.duration;
    m.frames = e.frames;
    m.size = e.size;
    m.offset = e.offset;
    m.origin = 'included';
    if (e.role !== 'source') {
      m.expect = { width: e.width, height: e.height, fps: e.fps, duration: e.duration, frames: e.frames, codec: e.codec, audio: e.audio };
      m.parent = byName.get(e.parent)?.id ?? '';
    }
    byName.set(e.file, m);
    store.items.push(m);
  }
  return byName;
}

export async function makeThumb(m: Media): Promise<string> {
  const t = m.form === 'sequence' ? m.duration / 2 : Math.min(m.duration / 2, 2.5);
  return readFrame(m, t, (img, w, h) => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = Math.max(2, Math.round((240 * h) / w));
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  });
}

async function loadEntry(e: Entry, m: Media): Promise<void> {
  await injectPack(e.pack);
  const map = packs();
  const key = e.form === 'sequence' ? e.pack : e.file;
  const raw = map[key];
  delete map[key];
  if (!raw) throw new Error(`the pack ${e.pack} holds no ${e.file}`);
  if (e.form === 'sequence') {
    const files = await Promise.all(Object.entries(raw as Record<string, string>).map(async ([name, b64]) => ({ name, blob: await packBlob(b64, 'image/jpeg') })));
    const seq = await openSequence(files, e.fps);
    m.source = seq.source;
    m.seq = seq.info;
    m.names = seq.names;
    m.size = seq.source.size;
    m.width = seq.width;
    m.height = seq.height;
    m.frames = seq.info.count;
    m.duration = seq.info.count / e.fps;
    m.frameBlobs = files.sort((a, b) => a.name.localeCompare(b.name)).map((f) => f.blob);
  } else {
    const blob = await packBlob(raw as string, e.type);
    m.blob = blob;
    m.size = blob.size;
    if (e.form === 'animation') {
      m.gif = await probeGif(blob);
      m.url = URL.createObjectURL(blob);
    } else {
      const file = new File([blob], e.file, { type: e.type });
      const probe = await probeFile(file);
      m.probe = probe;
      const fps = probe.video?.fps && Number.isFinite(probe.video.fps) ? probe.video.fps : e.fps;
      m.source = await openFile(file, fps);
      m.fps = fps;
      m.width = probe.video?.width ?? e.width;
      m.height = probe.video?.height ?? e.height;
      m.duration = probe.duration ?? m.source.duration;
      m.frames = probe.video?.frames ?? Math.round(m.duration * fps);
    }
  }
  m.state = 'ready';
}

export async function finishThumb(m: Media): Promise<void> {
  if (!m.source) return;
  try {
    m.thumb = await makeThumb(m);
  } catch (err) {
    store.log(`No thumbnail for ${m.name}: ${(err as Error).message}`, true);
  }
}

export function refreshChecks(m: Media): void {
  if (!m.expect) return;
  const base = verifyMedia(m);
  const parent = store.get(m.parent);
  m.checks = m.role === 'proxy' && parent?.probe ? [...base, ...relinkChecks(m, parent)] : base;
}

export async function hashAll(): Promise<void> {
  for (const m of store.items) {
    if (!m.blob && !m.frameBlobs) continue;
    if (m.md5State === 'done') continue;
    m.md5State = 'running';
    store.emit('items');
    const t0 = performance.now();
    try {
      if (m.blob) m.md5 = await md5Blob(m.blob);
      else m.md5 = await md5Blob(new Blob(m.frameBlobs as Blob[]));
      m.md5State = 'done';
      store.log(`MD5 ${m.md5}  ${m.name}  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (err) {
      m.md5State = 'idle';
      store.log(`MD5 failed for ${m.name}: ${(err as Error).message}`, true);
    }
    store.emit('items');
  }
}

export async function loadCurated(): Promise<void> {
  const byName = seed();
  store.emit('items');
  const first = byName.get('autumn-stream.mp4') as Media;
  const low = byName.get('autumn-stream_low.mp4') as Media;
  store.setSlots(first.id, low.id);
  const order = ['autumn-stream.mp4', 'autumn-stream_low.mp4', 'autumn-stream_high.mp4', 'waterfall.mp4', 'river-vertical.mp4', 'clouds_%04d.jpg', 'autumn-stream_Proxy.mp4', 'autumn-stream_480.gif'];
  let loaded = 0;
  for (const name of order) {
    const e = ENTRIES.find((x) => x.file === name) as Entry;
    const m = byName.get(name) as Media;
    try {
      await loadEntry(e, m);
      loaded += 1;
      refreshChecks(m);
      store.emit('items');
      if (m === first) store.setFrame(OPENING_RANGE.markIn + 24);
      void finishThumb(m).then(() => store.emit('items'));
      store.log(`Loaded ${m.name}`);
    } catch (err) {
      m.state = 'failed';
      m.message = (err as Error).message;
      store.log(`Could not load ${name}: ${m.message}`, true);
      store.emit('items');
    }
  }
  for (const m of store.items) if (m.role === 'proxy') refreshChecks(m);
  store.emit('items');
  if (!loaded) store.log('No curated media loaded', true);
  void hashAll();
}
