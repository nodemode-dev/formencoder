export interface Analysis {
  integrated: number;
  lra: number;
  samplePeak: number;
  truePeak: number;
  momentary: Float32Array;
  short: Float32Array;
  momentaryMax: number;
  shortMax: number;
  step: number;
  duration: number;
}

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

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

function kWeight(x: Float32Array, fs: number): Float64Array {
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

const toLufs = (ms: number): number => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);
const toDb = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity);

function sincAt(x: Float32Array, i: number, frac: number): number {
  const taps = 8;
  let sum = 0;
  for (let k = -taps + 1; k <= taps; k++) {
    const idx = i + k;
    if (idx < 0 || idx >= x.length) continue;
    const d = k - frac;
    const sinc = Math.abs(d) < 1e-9 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
    sum += x[idx] * sinc * (0.5 + 0.5 * Math.cos((Math.PI * d) / (taps + 1)));
  }
  return sum;
}

export function peaks(channels: Float32Array[]): { sample: number; truePeak: number } {
  let sample = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > sample) sample = a; }
  let tp = sample;
  const gate = sample * 0.5;
  for (const c of channels) {
    for (let i = 0; i < c.length - 1; i++) {
      if (Math.abs(c[i]) < gate && Math.abs(c[i + 1]) < gate) continue;
      for (const f of [0.25, 0.5, 0.75]) { const a = Math.abs(sincAt(c, i, f)); if (a > tp) tp = a; }
    }
  }
  return { sample, truePeak: tp };
}

function percentile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function windows(energy: Float64Array, span: number): Float32Array {
  const out = new Float32Array(energy.length).fill(NaN);
  let run = 0;
  for (let i = 0; i < energy.length; i++) {
    run += energy[i];
    if (i >= span) run -= energy[i - span];
    if (i >= span - 1) out[i] = toLufs(run / span);
  }
  return out;
}

export function analyse(channels: Float32Array[], fs: number): Analysis {
  const n = channels[0]?.length ?? 0;
  const sub = Math.round(fs * 0.1);
  const count = Math.floor(n / sub);
  const energy = new Float64Array(count);
  for (const ch of channels) {
    const f = kWeight(ch, fs);
    for (let b = 0; b < count; b++) {
      let s = 0;
      const o = b * sub;
      for (let i = 0; i < sub; i++) s += f[o + i] * f[o + i];
      energy[b] += s / sub;
    }
  }
  const momentary = windows(energy, 4);
  const short = windows(energy, 30);
  const lin = (l: number): number => 10 ** ((l + 0.691) / 10);
  const valid = Array.from(momentary).filter((l) => Number.isFinite(l) && l > -70);
  let integrated = -Infinity;
  if (valid.length) {
    const gate = toLufs(valid.reduce((a, l) => a + lin(l), 0) / valid.length) - 10;
    const kept = valid.filter((l) => l > gate);
    if (kept.length) integrated = toLufs(kept.reduce((a, l) => a + lin(l), 0) / kept.length);
  }
  const sv = Array.from(short).filter((l) => Number.isFinite(l) && l > -70);
  let lra = 0;
  if (sv.length) {
    const gate = toLufs(sv.reduce((a, l) => a + lin(l), 0) / sv.length) - 20;
    const kept = sv.filter((l) => l > gate).sort((a, b) => a - b);
    if (kept.length) lra = percentile(kept, 0.95) - percentile(kept, 0.1);
  }
  const p = peaks(channels);
  const max = (a: Float32Array): number => a.reduce((m, v) => (Number.isFinite(v) && v > m ? v : m), -Infinity);
  return {
    integrated,
    lra,
    samplePeak: toDb(p.sample),
    truePeak: toDb(p.truePeak),
    momentary,
    short,
    momentaryMax: max(momentary),
    shortMax: max(short),
    step: 0.1,
    duration: n / fs,
  };
}

export function signed(v: number, digits = 1): string {
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? '+' : ''}${r.toFixed(digits)}`;
}

export function fmt(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : '-inf';
}
