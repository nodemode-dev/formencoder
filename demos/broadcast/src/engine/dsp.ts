import { analyse, type Analysis } from './meter';

export interface NormaliseResult {
  channels: Float32Array[];
  gainDb: number;
  held: boolean;
  limited: boolean;
  reduction: number;
  analysis: Analysis;
}

export function withGain(channels: Float32Array[], db: number): Float32Array[] {
  const g = 10 ** (db / 20);
  return channels.map((c) => {
    const o = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) o[i] = c[i] * g;
    return o;
  });
}

function slidingMin(g: Float32Array, span: number): Float32Array {
  const out = new Float32Array(g.length);
  const dq = new Int32Array(g.length);
  let head = 0, tail = 0;
  for (let i = g.length - 1; i >= 0; i--) {
    while (tail > head && g[dq[tail - 1]] >= g[i]) tail--;
    dq[tail++] = i;
    while (dq[head] > i + span - 1) head++;
    out[i] = g[dq[head]];
  }
  return out;
}

export function lookaheadLimit(channels: Float32Array[], fs: number, ceilingDb: number, lookaheadMs: number, releaseMs: number): { channels: Float32Array[]; reduction: number } {
  const n = channels[0].length;
  const ceil = 10 ** (ceilingDb / 20);
  const need = new Float32Array(n).fill(1);
  for (const c of channels) for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > ceil) { const r = ceil / a; if (r < need[i]) need[i] = r; } }
  const span = Math.max(1, Math.round((lookaheadMs / 1000) * fs));
  const m = slidingMin(need, span);
  const avg = new Float32Array(n);
  let run = 0;
  for (let i = 0; i < n; i++) {
    run += m[i];
    if (i >= span) run -= m[i - span];
    avg[i] = i >= span - 1 ? run / span : Math.min(1, (run + (span - 1 - i)) / span);
  }
  const k = 1 - Math.exp(-1 / Math.max(1, (releaseMs / 1000) * fs));
  const out = channels.map(() => new Float32Array(n));
  let env = 1;
  let worst = 1;
  for (let i = 0; i < n; i++) {
    env = Math.min(avg[i], env + (1 - env) * k);
    if (env < worst) worst = env;
    for (let c = 0; c < channels.length; c++) out[c][i] = channels[c][i] * env;
  }
  return { channels: out, reduction: -20 * Math.log10(worst) };
}

export function normalise(channels: Float32Array[], fs: number, before: Analysis, target: number, ceilingDb: number, useLimiter: boolean, lookaheadMs: number, releaseMs: number): NormaliseResult {
  const want = target - before.integrated;
  if (!Number.isFinite(want)) return { channels, gainDb: 0, held: false, limited: false, reduction: 0, analysis: before };
  if (!useLimiter) {
    const room = ceilingDb - before.truePeak;
    const held = want > room;
    const gainDb = held ? room : want;
    const out = withGain(channels, gainDb);
    return { channels: out, gainDb, held, limited: false, reduction: 0, analysis: analyse(out, fs) };
  }
  let gainDb = want;
  let best: NormaliseResult | null = null;
  for (let pass = 0; pass < 3; pass++) {
    const boosted = withGain(channels, gainDb);
    const lim = lookaheadLimit(boosted, fs, ceilingDb - 0.3, lookaheadMs, releaseMs);
    const a = analyse(lim.channels, fs);
    best = { channels: lim.channels, gainDb, held: false, limited: lim.reduction > 0.05, reduction: lim.reduction, analysis: a };
    const miss = target - a.integrated;
    if (Math.abs(miss) < 0.15) break;
    gainDb += miss;
  }
  return best as NormaliseResult;
}

export interface LumaStats {
  histogram: Float32Array;
  above: number;
  below: number;
}

export function limitFrame(data: Uint8ClampedArray, min: number, max: number): void {
  const hi = max / 100;
  const lo = min / 100;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (y > hi) {
      const k = hi / y;
      data[i] = r * k;
      data[i + 1] = g * k;
      data[i + 2] = b * k;
    } else if (y < lo) {
      const lift = (lo - y) * 255;
      data[i] = r + lift;
      data[i + 1] = g + lift;
      data[i + 2] = b + lift;
    }
  }
}

export function lumaStats(data: Uint8ClampedArray, min: number, max: number): LumaStats {
  const bins = new Float32Array(100);
  let above = 0, below = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) {
    const y = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 2.55;
    bins[Math.min(99, Math.floor(y))]++;
    if (y > max + 0.5) above++;
    if (y < min - 0.5) below++;
    n++;
  }
  return { histogram: bins, above: (above / n) * 100, below: (below / n) * 100 };
}
