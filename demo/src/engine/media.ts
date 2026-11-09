import type { Curated } from '../../../frontend/src/demos/queue-sources';
import type { Source } from './source';

export { CURATED, type Curated, type CuratedOutput } from '../../../frontend/src/demos/queue-sources';

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
