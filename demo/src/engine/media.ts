import type { Source } from './source';

export interface CuratedOutput {
  preset: string;
  lufs?: number;
  size?: 'source';
}

export interface Curated {
  pack: string;
  file: string;
  mime: string;
  kind: 'video' | 'audio';
  width: number;
  height: number;
  fps: number;
  duration: number;
  bytes: number;
  outputs: CuratedOutput[];
}

export const CURATED: Curated[] = [
  {
    pack: 'open-water',
    file: 'open-water-1280x720-30fps.mp4',
    mime: 'video/mp4',
    kind: 'video',
    width: 1280,
    height: 720,
    fps: 29.97,
    duration: 8.008,
    bytes: 6819433,
    outputs: [{ preset: 'match-source-medium' }, { preset: 'gif-480' }, { preset: 'png-still' }],
  },
  {
    pack: 'coast-aerial',
    file: 'coast-aerial-1280x720-25fps.mp4',
    mime: 'video/mp4',
    kind: 'video',
    width: 1280,
    height: 720,
    fps: 25,
    duration: 7,
    bytes: 6637734,
    outputs: [{ preset: 'match-source-medium' }, { preset: 'gif-480' }],
  },
  {
    pack: 'shoreline-vertical',
    file: 'shoreline-vertical-404x720-60fps.mp4',
    mime: 'video/mp4',
    kind: 'video',
    width: 404,
    height: 720,
    fps: 59.94,
    duration: 7.858,
    bytes: 4235966,
    outputs: [{ preset: 'match-source-medium' }, { preset: 'gif-480', size: 'source' }],
  },
  {
    pack: 'on-the-sea-reading',
    file: 'on-the-sea-reading.mp3',
    mime: 'audio/mpeg',
    kind: 'audio',
    width: 0,
    height: 0,
    fps: 0,
    duration: 21.133,
    bytes: 211755,
    outputs: [{ preset: 'ogg-opus', lufs: -16 }, { preset: 'bwf-ebu' }, { preset: 'wav-48-24' }],
  },
];

type PackMap = Record<string, string>;

function packs(): PackMap {
  const w = window as unknown as { FE_MEDIA?: PackMap };
  if (!w.FE_MEDIA) w.FE_MEDIA = {};
  return w.FE_MEDIA;
}

function inject(pack: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.async = true;
    s.src = `media/${pack}.js`;
    s.onload = (): void => { s.remove(); resolve(); };
    s.onerror = (): void => { s.remove(); reject(new Error(`the media pack ${pack} did not load`)); };
    document.head.appendChild(s);
  });
}

export async function loadFile(c: Curated): Promise<File> {
  await inject(c.pack);
  const map = packs();
  const b64 = map[c.file];
  delete map[c.file];
  if (!b64) throw new Error(`the media pack ${c.pack} holds no ${c.file}`);
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new File([bytes], c.file, { type: c.mime });
}

let pendingSeq = 0;

export function pendingSource(c: Curated): Source {
  return {
    id: `pending${++pendingSeq}`,
    name: c.file,
    kind: c.kind,
    sample: false,
    size: c.bytes,
    width: c.width,
    height: c.height,
    fps: c.fps,
    duration: c.duration,
    frame: () => Promise.reject(new Error('the source is still loading')),
    audio: () => Promise.resolve(null),
    dispose: () => undefined,
  };
}
