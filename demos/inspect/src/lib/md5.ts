const SHIFT = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

export class Md5 {
  private a = 0x67452301;
  private b = 0xefcdab89 | 0;
  private c = 0x98badcfe | 0;
  private d = 0x10325476;
  private readonly tail = new Uint8Array(64);
  private fill = 0;
  private total = 0;
  private readonly w = new Int32Array(16);

  update(data: Uint8Array): void {
    this.total += data.length;
    let i = 0;
    if (this.fill) {
      const take = Math.min(64 - this.fill, data.length);
      this.tail.set(data.subarray(0, take), this.fill);
      this.fill += take;
      i = take;
      if (this.fill === 64) {
        this.block(this.tail, 0);
        this.fill = 0;
      }
    }
    for (; i + 64 <= data.length; i += 64) this.block(data, i);
    if (i < data.length) {
      this.tail.set(data.subarray(i), 0);
      this.fill = data.length - i;
    }
  }

  private block(m: Uint8Array, o: number): void {
    const w = this.w;
    for (let j = 0; j < 16; j++) w[j] = m[o + 4 * j] | (m[o + 4 * j + 1] << 8) | (m[o + 4 * j + 2] << 16) | (m[o + 4 * j + 3] << 24);
    let a = this.a, b = this.b, c = this.c, d = this.d;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15; }
      else { f = c ^ (b | ~d); g = (7 * i) & 15; }
      const s = SHIFT[(i >> 4) * 4 + (i & 3)];
      const x = (a + f + K[i] + w[g]) | 0;
      const next = (b + ((x << s) | (x >>> (32 - s)))) | 0;
      a = d;
      d = c;
      c = b;
      b = next;
    }
    this.a = (this.a + a) | 0;
    this.b = (this.b + b) | 0;
    this.c = (this.c + c) | 0;
    this.d = (this.d + d) | 0;
  }

  hex(): string {
    const bits = this.total * 8;
    const pad = new Uint8Array(((this.fill < 56 ? 56 : 120) - this.fill) + 8);
    pad[0] = 0x80;
    const dv = new DataView(pad.buffer);
    dv.setUint32(pad.length - 8, bits >>> 0, true);
    dv.setUint32(pad.length - 4, Math.floor(bits / 4294967296), true);
    this.update(pad);
    const out = new Uint8Array(16);
    const o = new DataView(out.buffer);
    o.setInt32(0, this.a, true);
    o.setInt32(4, this.b, true);
    o.setInt32(8, this.c, true);
    o.setInt32(12, this.d, true);
    return Array.from(out, (v) => v.toString(16).padStart(2, '0')).join('');
  }
}

export const CHUNK = 2 * 1024 * 1024;

export function idle(): Promise<void> {
  return new Promise((r) => window.setTimeout(r, 0));
}

export async function md5Blob(blob: Blob, onProgress?: (fraction: number) => void): Promise<string> {
  const h = new Md5();
  for (let o = 0; o < blob.size; o += CHUNK) {
    h.update(new Uint8Array(await blob.slice(o, o + CHUNK).arrayBuffer()));
    onProgress?.(Math.min(1, (o + CHUNK) / Math.max(1, blob.size)));
    await idle();
  }
  return h.hex();
}

export function md5Bytes(data: Uint8Array): string {
  const h = new Md5();
  h.update(data);
  return h.hex();
}
