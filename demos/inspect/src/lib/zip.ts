const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE[n] = c >>> 0;
}

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function writeZip(entries: ZipEntry[]): Blob {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const enc = new TextEncoder();
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const head = new Uint8Array(30 + name.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, e.data.length, true);
    h.setUint32(22, e.data.length, true);
    h.setUint16(26, name.length, true);
    head.set(name, 30);
    parts.push(head, e.data);
    const c = new Uint8Array(46 + name.length);
    const d = new DataView(c.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x0800, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, e.data.length, true);
    d.setUint32(24, e.data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    c.set(name, 46);
    central.push(c);
    offset += head.length + e.data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, entries.length, true);
  v.setUint16(10, entries.length, true);
  v.setUint32(12, size, true);
  v.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/zip' });
}

export async function readZipNames(blob: Blob): Promise<string[]> {
  const tailLen = Math.min(blob.size, 66000);
  const tail = new Uint8Array(await blob.slice(blob.size - tailLen).arrayBuffer());
  const tv = new DataView(tail.buffer);
  let e = tail.length - 22;
  while (e >= 0 && tv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) return [];
  const count = tv.getUint16(e + 10, true);
  const size = tv.getUint32(e + 12, true);
  const at = tv.getUint32(e + 16, true);
  const dir = new Uint8Array(await blob.slice(at, at + size).arrayBuffer());
  const dv = new DataView(dir.buffer);
  const dec = new TextDecoder();
  const names: string[] = [];
  let o = 0;
  for (let i = 0; i < count && o + 46 <= dir.length; i++) {
    const n = dv.getUint16(o + 28, true);
    const x = dv.getUint16(o + 30, true);
    const c = dv.getUint16(o + 32, true);
    names.push(dec.decode(dir.subarray(o + 46, o + 46 + n)));
    o += 46 + n + x + c;
  }
  return names;
}
