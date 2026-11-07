interface Box {
  lo: number;
  hi: number;
}

function medianCut(samples: Uint32Array, colours: number): Uint8Array {
  const channel = (px: number, c: number): number => (px >> (16 - c * 8)) & 255;
  const idx = Array.from(samples.keys());
  const boxes: Box[] = [{ lo: 0, hi: idx.length }];
  const order = idx;
  const range = (b: Box): { c: number; span: number } => {
    let best = 0, span = -1;
    for (let c = 0; c < 3; c++) {
      let mn = 255, mx = 0;
      for (let i = b.lo; i < b.hi; i++) { const v = channel(samples[order[i]], c); if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mx - mn > span) { span = mx - mn; best = c; }
    }
    return { c: best, span };
  };
  while (boxes.length < colours) {
    let pick = -1, bestSpan = 0, bestChannel = 0;
    boxes.forEach((b, i) => {
      if (b.hi - b.lo < 2) return;
      const r = range(b);
      const weight = r.span * Math.sqrt(b.hi - b.lo);
      if (weight > bestSpan) { bestSpan = weight; pick = i; bestChannel = r.c; }
    });
    if (pick < 0) break;
    const b = boxes[pick];
    const part = order.slice(b.lo, b.hi).sort((x, y) => channel(samples[x], bestChannel) - channel(samples[y], bestChannel));
    for (let i = 0; i < part.length; i++) order[b.lo + i] = part[i];
    const mid = b.lo + ((b.hi - b.lo) >> 1);
    boxes.splice(pick, 1, { lo: b.lo, hi: mid }, { lo: mid, hi: b.hi });
  }
  const palette = new Uint8Array(256 * 3);
  boxes.forEach((b, bi) => {
    let r = 0, g = 0, bl = 0;
    const n = Math.max(1, b.hi - b.lo);
    for (let i = b.lo; i < b.hi; i++) { const px = samples[order[i]]; r += channel(px, 0); g += channel(px, 1); bl += channel(px, 2); }
    palette[bi * 3] = Math.round(r / n);
    palette[bi * 3 + 1] = Math.round(g / n);
    palette[bi * 3 + 2] = Math.round(bl / n);
  });
  return palette;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function lzw(indices: Uint8Array): Uint8Array {
  const out: number[] = [];
  const minCode = 8;
  const clear = 1 << minCode;
  const end = clear + 1;
  let size = minCode + 1;
  let next = end + 1;
  let table = new Map<number, number>();
  let buf = 0, bits = 0;
  const put = (code: number): void => {
    buf |= code << bits;
    bits += size;
    while (bits >= 8) { out.push(buf & 255); buf >>>= 8; bits -= 8; }
  };
  put(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = table.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    put(prefix);
    if (next < 4096) {
      table.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      put(clear);
      table = new Map();
      size = minCode + 1;
      next = end + 1;
    }
    prefix = k;
  }
  put(prefix);
  put(end);
  if (bits > 0) out.push(buf & 255);
  return Uint8Array.from(out);
}

export class GifWriter {
  private readonly parts: Uint8Array[] = [];

  constructor(private readonly width: number, private readonly height: number) {
    const h = new Uint8Array(13);
    const dv = new DataView(h.buffer);
    h.set(new TextEncoder().encode('GIF89a'), 0);
    dv.setUint16(6, width, true);
    dv.setUint16(8, height, true);
    h[10] = 0;
    h[11] = 0;
    h[12] = 0;
    this.parts.push(h);
    this.parts.push(Uint8Array.from([0x21, 0xff, 0x0b, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, 0, 0, 0]));
  }

  addFrame(rgba: Uint8ClampedArray, delayCs: number): void {
    const n = this.width * this.height;
    const step = Math.max(1, Math.floor(n / 12000));
    const sampled: number[] = [];
    for (let i = 0; i < n; i += step) sampled.push((rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2]);
    const palette = medianCut(Uint32Array.from(sampled), 256);
    const cache = new Map<number, number>();
    const nearest = (r: number, g: number, b: number): number => {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const c = cache.get(key);
      if (c !== undefined) return c;
      const rr = (r >> 3) << 3 | 4, gg = (g >> 3) << 3 | 4, bb = (b >> 3) << 3 | 4;
      let best = 0, bd = Infinity;
      for (let p = 0; p < 256; p++) {
        const dr = palette[p * 3] - rr, dg = palette[p * 3 + 1] - gg, db = palette[p * 3 + 2] - bb;
        const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (d < bd) { bd = d; best = p; }
      }
      cache.set(key, best);
      return best;
    };
    const idx = new Uint8Array(n);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        const t = (BAYER[(y & 3) * 4 + (x & 3)] - 7.5) * 1.6;
        const r = Math.max(0, Math.min(255, rgba[i * 4] + t));
        const g = Math.max(0, Math.min(255, rgba[i * 4 + 1] + t));
        const b = Math.max(0, Math.min(255, rgba[i * 4 + 2] + t));
        idx[i] = nearest(r, g, b);
      }
    }
    this.parts.push(Uint8Array.from([0x21, 0xf9, 4, 0, delayCs & 255, (delayCs >> 8) & 255, 0, 0]));
    const d = new Uint8Array(10);
    const dv = new DataView(d.buffer);
    d[0] = 0x2c;
    dv.setUint16(5, this.width, true);
    dv.setUint16(7, this.height, true);
    d[9] = 0x80 | 7;
    this.parts.push(d);
    this.parts.push(palette);
    this.parts.push(Uint8Array.from([8]));
    const data = lzw(idx);
    for (let o = 0; o < data.length; o += 255) {
      const chunk = data.subarray(o, Math.min(data.length, o + 255));
      this.parts.push(Uint8Array.from([chunk.length]));
      this.parts.push(chunk);
    }
    this.parts.push(Uint8Array.from([0]));
  }

  finish(): Blob {
    this.parts.push(Uint8Array.from([0x3b]));
    return new Blob(this.parts as BlobPart[], { type: 'image/gif' });
  }
}
