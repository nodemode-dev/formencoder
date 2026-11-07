import { toast } from '../../../frontend/src/ui/toast';
import { probeFile } from '../../../demo/src/engine/probe';
import { openFile } from '../../../demo/src/engine/source';
import { finishThumb, hashAll } from './loader';
import { checkList } from './panels/checksums';
import { groupSequence, openSequence } from './media/sequence';
import { store } from './store';

const SEQUENCE_RATE = 25;

async function addVideo(file: File): Promise<void> {
  const m = store.make(file.name, 'source', 'video');
  m.label = 'Opened from your computer';
  m.origin = 'browser';
  m.blob = file;
  m.size = file.size;
  store.add(m);
  try {
    m.probe = await probeFile(file);
    const fps = m.probe.video?.fps && Number.isFinite(m.probe.video.fps) ? m.probe.video.fps : null;
    m.source = await openFile(file, fps);
    if (m.source.kind !== 'video') throw new Error('this file has no picture');
    m.fps = fps ?? m.source.fps;
    m.width = m.probe.video?.width ?? m.source.width;
    m.height = m.probe.video?.height ?? m.source.height;
    m.duration = m.probe.duration ?? m.source.duration;
    m.frames = m.probe.video?.frames ?? Math.round(m.duration * m.fps);
    m.state = 'ready';
    store.log(`Opened ${file.name}`);
    store.emit('items');
    if (!store.slotA || !store.a()) store.setSlots(m.id, store.slotB);
    else store.setSlots(store.slotA, m.id);
    await finishThumb(m);
  } catch (err) {
    m.state = 'failed';
    store.log(`Could not open ${file.name}: ${(err as Error).message}`, true);
    toast(`Could not open ${file.name}`, 'error');
  }
  store.emit('items');
  void hashAll();
}

async function addSequence(files: File[]): Promise<boolean> {
  const named = files.map((f) => ({ name: f.name, blob: f as Blob }));
  const grouped = groupSequence(named);
  if (!grouped) return false;
  const seq = await openSequence(named, SEQUENCE_RATE);
  const m = store.make(seq.info.pattern, 'source', 'sequence');
  m.label = `Numbered stills, ${SEQUENCE_RATE} fps`;
  m.origin = 'browser';
  m.source = seq.source;
  m.seq = seq.info;
  m.names = seq.names;
  m.frameBlobs = grouped.files.map((f) => f.blob);
  m.size = seq.source.size;
  m.width = seq.width;
  m.height = seq.height;
  m.fps = SEQUENCE_RATE;
  m.frames = seq.info.count;
  m.duration = seq.info.count / SEQUENCE_RATE;
  m.state = 'ready';
  store.add(m);
  store.log(`Added ${m.name} as an image sequence: ${seq.info.count} frames, ${seq.info.gaps.length ? `missing ${seq.info.gaps.join(', ')}` : 'no gaps'}`, seq.info.gaps.length > 0);
  store.setSlots(m.id, store.slotB);
  await finishThumb(m);
  store.emit('items');
  void hashAll();
  return true;
}

export async function addFiles(all: File[]): Promise<void> {
  const lists = all.filter((f) => /\.(md5|txt)$/i.test(f.name));
  for (const l of lists) await checkList(l);
  const images = all.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(f.name));
  const videos = all.filter((f) => f.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name));
  for (const v of videos) await addVideo(v);
  if (images.length) {
    const ok = await addSequence(images).catch((err: Error) => { store.log(`Sequence: ${err.message}`, true); return false; });
    if (!ok) toast('Those images are not a numbered sequence such as frame_0001.png', 'error');
  }
  if (!lists.length && !images.length && !videos.length) toast('Drop a video, a numbered image sequence or a .md5 list');
}

export function pickFiles(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'video/*,image/*,.md5,.txt,.mkv';
  input.addEventListener('change', () => void addFiles(Array.from(input.files ?? [])));
  input.click();
}
