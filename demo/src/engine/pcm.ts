function quantise(v: number, bits: 16 | 24): number {
  const max = bits === 16 ? 32767 : 8388607;
  const c = Math.max(-1, Math.min(1, v));
  return Math.round(c < 0 ? c * (max + 1) : c * max);
}

export function encodeWav(channels: Float32Array[], sampleRate: number, bits: 16 | 24): Blob {
  const n = channels[0]?.length ?? 0;
  const ch = channels.length;
  const bytes = bits / 8;
  const data = n * ch * bytes;
  const buf = new ArrayBuffer(44 + data);
  const dv = new DataView(buf);
  const tag = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, 'RIFF');
  dv.setUint32(4, 36 + data, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * ch * bytes, true);
  dv.setUint16(32, ch * bytes, true);
  dv.setUint16(34, bits, true);
  tag(36, 'data');
  dv.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const q = quantise(channels[c][i], bits);
      if (bits === 16) {
        dv.setInt16(o, q, true);
      } else {
        dv.setUint8(o, q & 255);
        dv.setUint8(o + 1, (q >> 8) & 255);
        dv.setUint8(o + 2, (q >> 16) & 255);
      }
      o += bytes;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function encodeAiff(channels: Float32Array[], sampleRate: number, bits: 16 | 24): Blob {
  const n = channels[0]?.length ?? 0;
  const ch = channels.length;
  const bytes = bits / 8;
  const data = n * ch * bytes;
  const buf = new ArrayBuffer(12 + 26 + 16 + data);
  const dv = new DataView(buf);
  const tag = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, 'FORM');
  dv.setUint32(4, 4 + 26 + 16 + data, false);
  tag(8, 'AIFF');
  tag(12, 'COMM');
  dv.setUint32(16, 18, false);
  dv.setInt16(20, ch, false);
  dv.setUint32(22, n, false);
  dv.setInt16(26, bits, false);
  const e = Math.floor(Math.log2(sampleRate));
  dv.setUint16(28, 16383 + e, false);
  dv.setBigUint64(30, BigInt(sampleRate) << BigInt(63 - e), false);
  tag(38, 'SSND');
  dv.setUint32(42, 8 + data, false);
  dv.setUint32(46, 0, false);
  dv.setUint32(50, 0, false);
  let o = 54;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const q = quantise(channels[c][i], bits);
      if (bits === 16) {
        dv.setInt16(o, q, false);
      } else {
        dv.setUint8(o, (q >> 16) & 255);
        dv.setUint8(o + 1, (q >> 8) & 255);
        dv.setUint8(o + 2, q & 255);
      }
      o += bytes;
    }
  }
  return new Blob([buf], { type: 'audio/aiff' });
}
