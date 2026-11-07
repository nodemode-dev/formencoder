export interface WebmVideo {
  codec: 'V_VP9' | 'V_VP8';
  width: number;
  height: number;
}

export interface WebmAudio {
  sampleRate: number;
  channels: number;
  preSkip: number;
}

export interface WebmBlock {
  track: 1 | 2;
  timeMs: number;
  key: boolean;
  data: Uint8Array;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function idBytes(id: number): Uint8Array {
  const out: number[] = [];
  let v = id;
  while (v > 0) { out.unshift(v & 255); v = Math.floor(v / 256); }
  return Uint8Array.from(out);
}

function sizeBytes(n: number): Uint8Array {
  let len = 1;
  while (len < 8 && n >= 2 ** (7 * len) - 1) len++;
  const out = new Uint8Array(len);
  let v = n;
  for (let i = len - 1; i >= 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
  out[0] |= 1 << (8 - len);
  return out;
}

function el(id: number, payload: Uint8Array): Uint8Array {
  return concat([idBytes(id), sizeBytes(payload.length), payload]);
}

function uint(id: number, value: number): Uint8Array {
  const out: number[] = [];
  let v = value;
  do { out.unshift(v % 256); v = Math.floor(v / 256); } while (v > 0);
  return el(id, Uint8Array.from(out));
}

function float64(id: number, value: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, value, false);
  return el(id, b);
}

function str(id: number, value: string): Uint8Array {
  return el(id, new TextEncoder().encode(value));
}

function opusHead(a: WebmAudio): Uint8Array {
  const b = new Uint8Array(19);
  const dv = new DataView(b.buffer);
  b.set(new TextEncoder().encode('OpusHead'), 0);
  b[8] = 1;
  b[9] = a.channels;
  dv.setUint16(10, a.preSkip, true);
  dv.setUint32(12, a.sampleRate, true);
  dv.setInt16(16, 0, true);
  b[18] = 0;
  return b;
}

export function opusHeadBytes(a: WebmAudio): Uint8Array {
  return opusHead(a);
}

export function muxWebm(video: WebmVideo | null, audio: WebmAudio | null, blocks: WebmBlock[], durationMs: number): Blob {
  const header = el(0x1a45dfa3, concat([
    uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8),
    str(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2),
  ]));
  const info = el(0x1549a966, concat([
    uint(0x2ad7b1, 1000000), float64(0x4489, durationMs), str(0x4d80, 'formencoder demo'), str(0x5741, 'formencoder demo'),
  ]));
  const entries: Uint8Array[] = [];
  if (video) {
    entries.push(el(0xae, concat([
      uint(0xd7, 1), uint(0x73c5, 1), uint(0x83, 1), uint(0x9c, 0), str(0x86, video.codec),
      el(0xe0, concat([uint(0xb0, video.width), uint(0xba, video.height)])),
    ])));
  }
  if (audio) {
    entries.push(el(0xae, concat([
      uint(0xd7, 2), uint(0x73c5, 2), uint(0x83, 2), uint(0x9c, 0), str(0x86, 'A_OPUS'),
      uint(0x56aa, Math.round((audio.preSkip / 48000) * 1e9)), uint(0x56bb, 80000000),
      el(0x63a2, opusHead(audio)),
      el(0xe1, concat([float64(0xb5, audio.sampleRate), uint(0x9f, audio.channels)])),
    ])));
  }
  const tracks = el(0x1654ae6b, concat(entries));
  const sorted = [...blocks].sort((a, b) => a.timeMs - b.timeMs || a.track - b.track);
  const clusters: Uint8Array[] = [];
  const cues: Array<{ timeMs: number; offset: number }> = [];
  let offset = info.length + tracks.length;
  let current: Uint8Array[] = [];
  let base = 0;
  let open = false;
  const flush = (): void => {
    if (!open) return;
    const body = concat([uint(0xe7, Math.round(base)), ...current]);
    const c = el(0x1f43b675, body);
    clusters.push(c);
    offset += c.length;
    current = [];
    open = false;
  };
  for (const b of sorted) {
    const t = Math.round(b.timeMs);
    const rel = t - Math.round(base);
    const startNew = !open || (b.track === 1 && b.key && rel > 0) || rel > 30000;
    if (startNew) {
      flush();
      base = t;
      open = true;
      if (b.track === 1 && b.key) cues.push({ timeMs: t, offset });
    }
    const head = new Uint8Array(4);
    head[0] = 0x80 | b.track;
    new DataView(head.buffer).setInt16(1, t - Math.round(base), false);
    head[3] = b.key ? 0x80 : 0;
    current.push(el(0xa3, concat([head, b.data])));
  }
  flush();
  const cueBytes = cues.length
    ? el(0x1c53bb6b, concat(cues.map((c) => el(0xbb, concat([uint(0xb3, c.timeMs), el(0xb7, concat([uint(0xf7, 1), uint(0xf1, c.offset)]))])))))
    : new Uint8Array(0);
  const segment = el(0x18538067, concat([info, tracks, ...clusters, cueBytes]));
  return new Blob([header as BlobPart, segment as BlobPart], { type: 'video/webm' });
}
