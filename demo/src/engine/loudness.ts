export interface Loudness {
  integrated: number;
  lra: number;
  samplePeak: number;
  truePeak: number;
  shortTermMax: number;
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function shelf(fs: number): Biquad {
  const f0 = 1681.974450955533;
  const gain = 3.999843853973347;
  const q = 0.7071752369554196;
  const k = Math.tan((Math.PI * f0) / fs);
  const vh = 10 ** (gain / 20);
  const vb = vh ** 0.4996667741545416;
  const a0 = 1 + k / q + k * k;
  return {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
}

function highpass(fs: number): Biquad {
  const f0 = 38.13547087602444;
  const q = 0.5003270373238773;
  const k = Math.tan((Math.PI * f0) / fs);
  const a0 = 1 + k / q + k * k;
  return { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / q + k * k) / a0 };
}

function weight(x: Float32Array, fs: number): Float64Array {
  const s = shelf(fs);
  const h = highpass(fs);
  const out = new Float64Array(x.length);
  let z1 = 0, z2 = 0, w1 = 0, w2 = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i];
    const b = s.b0 * a + z1;
    z1 = s.b1 * a - s.a1 * b + z2;
    z2 = s.b2 * a - s.a2 * b;
    const c = h.b0 * b + w1;
    w1 = h.b1 * b - h.a1 * c + w2;
    w2 = h.b2 * b - h.a2 * c;
    out[i] = c;
  }
  return out;
}

function channelWeights(n: number): number[] {
  if (n === 6) return [1, 1, 1, 0, 1.41, 1.41];
  if (n === 5) return [1, 1, 1, 1.41, 1.41];
  return new Array<number>(n).fill(1);
}

const toDb = (ms: number): number => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return -Infinity;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function windowedMean(sub: Float64Array, span: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + span <= sub.length; i++) {
    let s = 0;
    for (let j = 0; j < span; j++) s += sub[i + j];
    out.push(s / span);
  }
  return out;
}

function sincAt(x: Float32Array, i: number, frac: number): number {
  const taps = 8;
  let sum = 0;
  for (let k = -taps + 1; k <= taps; k++) {
    const idx = i + k;
    if (idx < 0 || idx >= x.length) continue;
    const d = k - frac;
    const sinc = Math.abs(d) < 1e-9 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
    const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / (taps + 1));
    sum += x[idx] * sinc * w;
  }
  return sum;
}

function peaks(channels: Float32Array[]): { sample: number; truePeak: number } {
  let sample = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > sample) sample = a; }
  let tp = sample;
  const gate = sample * 0.55;
  for (const c of channels) {
    for (let i = 0; i < c.length - 1; i++) {
      if (Math.abs(c[i]) < gate && Math.abs(c[i + 1]) < gate) continue;
      for (const f of [0.25, 0.5, 0.75]) { const a = Math.abs(sincAt(c, i, f)); if (a > tp) tp = a; }
    }
  }
  return { sample, truePeak: tp };
}

export function measureLoudness(channels: Float32Array[], sampleRate: number): Loudness {
  const dbfs = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  const n = channels[0]?.length ?? 0;
  const p = peaks(channels);
  const sub = Math.round(sampleRate * 0.1);
  const count = Math.floor(n / sub);
  const w = channelWeights(channels.length);
  const energy = new Float64Array(count);
  channels.forEach((ch, ci) => {
    if (!w[ci]) return;
    const f = weight(ch, sampleRate);
    for (let b = 0; b < count; b++) {
      let s = 0;
      const o = b * sub;
      for (let i = 0; i < sub; i++) s += f[o + i] * f[o + i];
      energy[b] += (w[ci] * s) / sub;
    }
  });
  const momentary = windowedMean(energy, 4);
  const abs = momentary.filter((e) => toDb(e) > -70);
  let integrated = -Infinity;
  if (abs.length) {
    const thr = toDb(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const kept = momentary.filter((e) => toDb(e) > -70 && toDb(e) > thr);
    if (kept.length) integrated = toDb(kept.reduce((a, b) => a + b, 0) / kept.length);
  }
  const short = windowedMean(energy, 30);
  const shortAbs = short.filter((e) => toDb(e) > -70);
  let lra = 0;
  let shortMax = -Infinity;
  if (shortAbs.length) {
    const thr = toDb(shortAbs.reduce((a, b) => a + b, 0) / shortAbs.length) - 20;
    const kept = shortAbs.map(toDb).filter((l) => l > thr).sort((a, b) => a - b);
    if (kept.length) {
      lra = percentile(kept, 0.95) - percentile(kept, 0.1);
      shortMax = kept[kept.length - 1];
    }
  }
  return { integrated, lra, samplePeak: dbfs(p.sample), truePeak: dbfs(p.truePeak), shortTermMax: shortMax };
}

export function fmtLufs(v: number): string {
  return Number.isFinite(v) ? v.toFixed(1) : '-inf';
}

export function describeLoudness(l: Loudness): string {
  return `${fmtLufs(l.integrated)} LUFS, LRA ${l.lra.toFixed(1)} LU, peak ${fmtLufs(l.truePeak)} dBTP`;
}

export function gainFor(l: Loudness, targetLufs: number, ceilingDbtp = -1): { gainDb: number; limited: boolean } {
  if (!Number.isFinite(l.integrated)) return { gainDb: 0, limited: false };
  const want = targetLufs - l.integrated;
  const room = ceilingDbtp - l.truePeak;
  if (Number.isFinite(room) && want > room) return { gainDb: room, limited: true };
  return { gainDb: want, limited: false };
}
