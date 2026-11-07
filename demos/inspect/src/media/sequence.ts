import type { Source } from '../../../../demo/src/engine/source';
import type { SeqInfo } from '../model';

export interface NamedBlob {
  name: string;
  blob: Blob;
}

const PATTERN = /^(.*?)(\d+)(\.[A-Za-z0-9]+)$/;

export function groupSequence(files: NamedBlob[]): { files: Array<NamedBlob & { n: number }>; info: SeqInfo } | null {
  const groups = new Map<string, Array<NamedBlob & { n: number }>>();
  for (const f of files) {
    const m = PATTERN.exec(f.name);
    if (!m) continue;
    const key = `${m[1]}|${m[2].length}|${m[3].toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push({ ...f, n: Number(m[2]) });
  }
  let best: Array<NamedBlob & { n: number }> | null = null;
  let bestKey = '';
  for (const [k, g] of groups) {
    if (!best || g.length > best.length) { best = g; bestKey = k; }
  }
  if (!best || best.length < 2) return null;
  best.sort((a, b) => a.n - b.n);
  const [prefix, digits, ext] = bestKey.split('|');
  const present = new Set(best.map((f) => f.n));
  const first = best[0].n;
  const last = best[best.length - 1].n;
  const gaps: number[] = [];
  for (let n = first; n <= last; n++) if (!present.has(n)) gaps.push(n);
  return { files: best, info: { pattern: `${prefix}%0${digits}d${ext}`, first, last, count: best.length, gaps, digits: Number(digits), ext } };
}

export interface Sequence {
  source: Source;
  info: SeqInfo;
  names: string[];
  width: number;
  height: number;
}

let counter = 0;

export async function openSequence(files: NamedBlob[], fps: number): Promise<Sequence> {
  const grouped = groupSequence(files);
  if (!grouped) throw new Error('these files are not a numbered image sequence');
  const bitmaps = await Promise.all(grouped.files.map((f) => createImageBitmap(f.blob)));
  const width = bitmaps[0].width;
  const height = bitmaps[0].height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const duration = bitmaps.length / fps;
  const source: Source = {
    id: `seq${++counter}`,
    name: grouped.info.pattern,
    kind: 'video',
    sample: false,
    size: grouped.files.reduce((n, f) => n + f.blob.size, 0),
    width,
    height,
    fps,
    duration,
    async frame(t: number): Promise<CanvasImageSource> {
      const i = Math.max(0, Math.min(bitmaps.length - 1, Math.floor(t * fps + 1e-6)));
      g.clearRect(0, 0, width, height);
      g.drawImage(bitmaps[i], 0, 0, width, height);
      return canvas;
    },
    audio: () => Promise.resolve(null),
    dispose: () => undefined,
  };
  return { source, info: grouped.info, names: grouped.files.map((f) => f.name), width, height };
}
