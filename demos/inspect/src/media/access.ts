import type { Media } from '../model';

const chains = new Map<string, Promise<unknown>>();

export function readFrame<T>(m: Media, t: number, use: (img: CanvasImageSource, width: number, height: number) => T): Promise<T> {
  const src = m.source;
  if (!src) return Promise.reject(new Error(`${m.name} has no picture yet`));
  const prev = chains.get(m.id) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(async () => {
    const img = await src.frame(t);
    const w = img instanceof HTMLVideoElement ? img.videoWidth : (img as HTMLCanvasElement).width;
    const h = img instanceof HTMLVideoElement ? img.videoHeight : (img as HTMLCanvasElement).height;
    return use(img, w, h);
  });
  chains.set(m.id, run);
  return run;
}

export async function packBlob(b64: string, type: string): Promise<Blob> {
  const res = await fetch(`data:${type};base64,${b64}`);
  return res.blob();
}

type PackMap = Record<string, unknown>;

export function packs(): PackMap {
  const w = window as unknown as { INSPECT_MEDIA?: PackMap };
  if (!w.INSPECT_MEDIA) w.INSPECT_MEDIA = {};
  return w.INSPECT_MEDIA;
}

export function injectPack(pack: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.async = true;
    s.src = `media/${pack}.js`;
    s.onload = (): void => { s.remove(); resolve(); };
    s.onerror = (): void => { s.remove(); reject(new Error(`the media pack ${pack} did not load`)); };
    document.head.appendChild(s);
  });
}
