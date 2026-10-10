export function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : p;
}

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function fmtClock(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s) || s < 0) return '--:--';
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function fmtDuration(s: number | null | undefined): string {
  if (!s || !Number.isFinite(s)) return '';
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
  return fmtClock(s);
}

export const STATUS_LABEL: Record<string, string> = {
  ready: 'Ready',
  preparing: 'Preparing',
  encoding: 'Encoding',
  paused: 'Paused',
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
  skipped: 'Skipped',
};

export const POSITIONS: Array<[string, string]> = [
  ['topLeft', 'Top Left'], ['topCenter', 'Top Center'], ['topRight', 'Top Right'],
  ['centerLeft', 'Center Left'], ['center', 'Center'], ['centerRight', 'Center Right'],
  ['bottomLeft', 'Bottom Left'], ['bottomCenter', 'Bottom Center'], ['bottomRight', 'Bottom Right'],
];

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}
