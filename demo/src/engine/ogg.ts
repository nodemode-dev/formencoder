import { opusHeadBytes } from './webm';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

function crc(data: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < data.length; i++) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ data[i]) & 255]) >>> 0;
  return c >>> 0;
}

function page(packets: Uint8Array[], flags: number, granule: number, serial: number, seq: number, continued = false): Uint8Array {
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) { lacing.push(255); n -= 255; }
    lacing.push(n);
  }
  const body = packets.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + body);
  const dv = new DataView(out.buffer);
  out.set(new TextEncoder().encode('OggS'), 0);
  out[4] = 0;
  out[5] = flags | (continued ? 1 : 0);
  dv.setBigUint64(6, BigInt(granule), true);
  dv.setUint32(14, serial, true);
  dv.setUint32(18, seq, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let o = 27 + lacing.length;
  for (const p of packets) { out.set(p, o); o += p.length; }
  dv.setUint32(22, crc(out), true);
  return out;
}

export interface OpusPacket {
  data: Uint8Array;
  samples: number;
}

export function muxOggOpus(packets: OpusPacket[], channels: number, preSkip: number, inputRate: number): Blob {
  const serial = 0x46454e43;
  const parts: Uint8Array[] = [];
  const head = opusHeadBytes({ sampleRate: inputRate, channels, preSkip });
  const vendor = new TextEncoder().encode('formencoder demo');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  const tdv = new DataView(tags.buffer);
  tags.set(new TextEncoder().encode('OpusTags'), 0);
  tdv.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  tdv.setUint32(12 + vendor.length, 0, true);
  parts.push(page([head], 2, 0, serial, 0));
  parts.push(page([tags], 0, 0, serial, 1));
  let seq = 2;
  let granule = preSkip;
  let batch: OpusPacket[] = [];
  const total = packets.length;
  packets.forEach((p, i) => {
    batch.push(p);
    granule += p.samples;
    const last = i === total - 1;
    if (batch.length >= 40 || last) {
      parts.push(page(batch.map((b) => b.data), last ? 4 : 0, granule, serial, seq++));
      batch = [];
    }
  });
  return new Blob(parts as BlobPart[], { type: 'audio/ogg' });
}
