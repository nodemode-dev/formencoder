export interface GifInfo {
  width: number;
  height: number;
  frames: number;
  duration: number;
  loops: boolean;
}

export async function probeGif(blob: Blob): Promise<GifInfo | null> {
  const b = new Uint8Array(await blob.arrayBuffer());
  const head = String.fromCharCode(...b.subarray(0, 6));
  if (head !== 'GIF89a' && head !== 'GIF87a') return null;
  const dv = new DataView(b.buffer);
  const width = dv.getUint16(6, true);
  const height = dv.getUint16(8, true);
  let o = 13 + (b[10] & 0x80 ? 3 * 2 ** ((b[10] & 7) + 1) : 0);
  let frames = 0;
  let cs = 0;
  let loops = false;
  const skipBlocks = (): void => {
    while (o < b.length && b[o] !== 0) o += b[o] + 1;
    o += 1;
  };
  while (o < b.length) {
    const t = b[o];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[o + 1];
      if (label === 0xf9) cs += dv.getUint16(o + 4, true);
      if (label === 0xff && String.fromCharCode(...b.subarray(o + 3, o + 14)) === 'NETSCAPE2.0') loops = true;
      o += 2;
      skipBlocks();
    } else if (t === 0x2c) {
      frames += 1;
      const flags = b[o + 9];
      o += 10 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0) + 1;
      skipBlocks();
    } else break;
  }
  return { width, height, frames, duration: cs / 100, loops };
}
