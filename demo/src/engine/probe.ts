export interface VideoInfo {
  codec: string;
  profile: string;
  width: number;
  height: number;
  fps: number | null;
  frames: number | null;
  bitrate: number | null;
  pixels: string;
}

export interface AudioInfo {
  codec: string;
  sampleRate: number | null;
  channels: number | null;
  bitDepth: number | null;
  bitrate: number | null;
}

export interface ProbeInfo {
  container: string;
  duration: number | null;
  size: number;
  bitrate: number | null;
  video: VideoInfo | null;
  audio: AudioInfo[];
  notes: string[];
}

const dec = new TextDecoder('latin1');

async function slice(file: Blob, start: number, len: number): Promise<DataView> {
  const buf = await file.slice(start, start + len).arrayBuffer();
  return new DataView(buf);
}

const fourcc = (dv: DataView, o: number): string => dec.decode(new Uint8Array(dv.buffer, dv.byteOffset + o, 4));

const H264_PROFILES: Record<number, string> = { 66: 'Baseline', 77: 'Main', 88: 'Extended', 100: 'High', 110: 'High 10', 122: 'High 4:2:2', 244: 'High 4:4:4' };
const PRORES: Record<string, string> = { apco: 'ProRes 422 Proxy', apcs: 'ProRes 422 LT', apcn: 'ProRes 422', apch: 'ProRes 422 HQ', ap4h: 'ProRes 4444', ap4x: 'ProRes 4444 XQ' };
const PCM: Record<string, string> = { sowt: 'PCM s16le', twos: 'PCM s16be', in24: 'PCM s24', in32: 'PCM s32', lpcm: 'PCM', fl32: 'PCM f32', fl64: 'PCM f64', raw: 'PCM u8' };

interface Trak {
  type: string;
  timescale: number;
  duration: number;
  width: number;
  height: number;
  format: string;
  profile: string;
  samples: number;
  stts: number;
  bytes: number;
  channels: number;
  bits: number;
  rate: number;
  esObject: number;
}

function parseTrak(dv: DataView, start: number, end: number): Trak {
  const t: Trak = { type: '', timescale: 0, duration: 0, width: 0, height: 0, format: '', profile: '', samples: 0, stts: 0, bytes: 0, channels: 0, bits: 0, rate: 0, esObject: 0 };
  const walk = (s: number, e: number): void => {
    let o = s;
    while (o + 8 <= e) {
      let size = dv.getUint32(o);
      const type = fourcc(dv, o + 4);
      let head = 8;
      if (size === 1) { size = Number(dv.getBigUint64(o + 8)); head = 16; }
      if (size === 0) size = e - o;
      if (size < head || o + size > e) break;
      const p = o + head;
      const q = o + size;
      if (type === 'mdia' || type === 'minf' || type === 'stbl') walk(p, q);
      else if (type === 'tkhd') {
        const v = dv.getUint8(p);
        const wo = p + (v === 1 ? 88 : 76);
        t.width = dv.getUint32(wo) / 65536;
        t.height = dv.getUint32(wo + 4) / 65536;
      } else if (type === 'mdhd') {
        const v = dv.getUint8(p);
        t.timescale = dv.getUint32(p + (v === 1 ? 20 : 12));
        t.duration = v === 1 ? Number(dv.getBigUint64(p + 24)) : dv.getUint32(p + 16);
      } else if (type === 'hdlr') t.type = fourcc(dv, p + 8);
      else if (type === 'stsd') {
        const eo = p + 8;
        t.format = fourcc(dv, eo + 4);
        if (t.type === 'vide') {
          const sw = dv.getUint16(eo + 32), sh = dv.getUint16(eo + 34);
          if (sw) t.width = sw;
          if (sh) t.height = sh;
          let c = eo + 86;
          const esz = dv.getUint32(eo);
          while (c + 8 <= eo + esz) {
            const cs = dv.getUint32(c);
            const ct = fourcc(dv, c + 4);
            if (cs < 8) break;
            if (ct === 'avcC') t.profile = `${H264_PROFILES[dv.getUint8(c + 9)] ?? 'profile ' + dv.getUint8(c + 9)} L${(dv.getUint8(c + 11) / 10).toFixed(1)}`;
            if (ct === 'hvcC') t.profile = ({ 1: 'Main', 2: 'Main 10' } as Record<number, string>)[dv.getUint8(c + 9) & 31] ?? '';
            c += cs;
          }
        } else if (t.type === 'soun') {
          t.channels = dv.getUint16(eo + 24);
          t.bits = dv.getUint16(eo + 26);
          t.rate = dv.getUint16(eo + 32);
          const esz = dv.getUint32(eo);
          let c = eo + 36;
          while (c + 8 <= eo + esz) {
            const cs = dv.getUint32(c);
            const ct = fourcc(dv, c + 4);
            if (cs < 8) break;
            if (ct === 'esds') {
              for (let k = c + 12; k < c + cs - 1; k++) if (dv.getUint8(k) === 0x04) { t.esObject = dv.getUint8(k + 2 + (dv.getUint8(k + 1) & 0x80 ? 3 : 0)); break; }
            }
            c += cs;
          }
        }
      } else if (type === 'stts') {
        const n = dv.getUint32(p + 4);
        let total = 0, dur = 0;
        for (let i = 0; i < n && p + 8 + i * 8 + 8 <= q; i++) {
          const c = dv.getUint32(p + 8 + i * 8), d = dv.getUint32(p + 12 + i * 8);
          total += c;
          dur += c * d;
        }
        t.samples = total;
        t.stts = dur;
      } else if (type === 'stsz') {
        const fixed = dv.getUint32(p + 4), count = dv.getUint32(p + 8);
        if (fixed) t.bytes = fixed * count;
        else {
          let sum = 0;
          for (let i = 0; i < count && p + 12 + i * 4 + 4 <= q; i++) sum += dv.getUint32(p + 12 + i * 4);
          t.bytes = sum;
        }
      }
      o += size;
    }
  };
  walk(start, end);
  return t;
}

function videoName(format: string): string {
  if (format === 'avc1' || format === 'avc3') return 'H.264';
  if (format === 'hvc1' || format === 'hev1') return 'HEVC';
  if (format === 'av01') return 'AV1';
  if (format === 'vp09') return 'VP9';
  if (format === 'vp08') return 'VP8';
  if (format === 'mp4v') return 'MPEG-4 Visual';
  if (PRORES[format]) return PRORES[format];
  return format;
}

function audioName(t: Trak): string {
  if (t.format === 'mp4a') return t.esObject === 0x6b || t.esObject === 0x69 ? 'MP3' : 'AAC';
  if (t.format === 'Opus') return 'Opus';
  if (t.format === 'ac-3') return 'AC-3';
  if (t.format === 'ec-3') return 'E-AC-3';
  if (t.format === 'alac') return 'ALAC';
  if (t.format === 'fLaC') return 'FLAC';
  return PCM[t.format] ?? t.format;
}

async function probeMp4(file: Blob): Promise<ProbeInfo | null> {
  let o = 0;
  let brand = '';
  let moov: DataView | null = null;
  while (o + 8 <= file.size) {
    const h = await slice(file, o, 16);
    let size = h.getUint32(0);
    const type = fourcc(h, 4);
    let head = 8;
    if (size === 1) { size = Number(h.getBigUint64(8)); head = 16; }
    if (size === 0) size = file.size - o;
    if (size < head) break;
    if (type === 'ftyp') brand = fourcc(await slice(file, o + head, 4), 0);
    if (type === 'moov' && size < 256 * 1024 * 1024) { moov = await slice(file, o + head, size - head); break; }
    o += size;
  }
  if (!moov) return null;
  const info: ProbeInfo = { container: brand === 'qt  ' ? 'QuickTime MOV' : `MP4 (${brand.trim()})`, duration: null, size: file.size, bitrate: null, video: null, audio: [], notes: [] };
  let movieScale = 0, movieDur = 0;
  let p = 0;
  while (p + 8 <= moov.byteLength) {
    const size = moov.getUint32(p);
    const type = fourcc(moov, p + 4);
    if (size < 8 || p + size > moov.byteLength) break;
    if (type === 'mvhd') {
      const v = moov.getUint8(p + 8);
      movieScale = moov.getUint32(p + 8 + (v === 1 ? 20 : 12));
      movieDur = v === 1 ? Number(moov.getBigUint64(p + 8 + 24)) : moov.getUint32(p + 8 + 16);
    } else if (type === 'trak') {
      const t = parseTrak(moov, p + 8, p + size);
      const seconds = t.timescale ? t.duration / t.timescale : 0;
      if (t.type === 'vide' && !info.video) {
        const fps = t.stts && t.samples ? (t.samples * t.timescale) / t.stts : null;
        info.video = {
          codec: videoName(t.format),
          profile: t.profile,
          width: Math.round(t.width),
          height: Math.round(t.height),
          fps,
          frames: t.samples || null,
          bitrate: seconds && t.bytes ? (t.bytes * 8) / seconds : null,
          pixels: '',
        };
      } else if (t.type === 'soun') {
        info.audio.push({ codec: audioName(t), sampleRate: t.rate || null, channels: t.channels || null, bitDepth: PCM[t.format] ? t.bits : null, bitrate: seconds && t.bytes ? (t.bytes * 8) / seconds : null });
      }
    }
    p += size;
  }
  info.duration = movieScale ? movieDur / movieScale : null;
  if (info.duration) info.bitrate = (file.size * 8) / info.duration;
  return info;
}

function readVint(b: Uint8Array, o: number, keepMarker: boolean): { value: number; len: number; unknown: boolean } | null {
  const first = b[o];
  if (first === undefined || first === 0) return null;
  let len = 1;
  while (!(first & (0x80 >> (len - 1)))) len++;
  if (o + len > b.length) return null;
  let v = keepMarker ? first : first & (0xff >> len);
  let allOnes = (first & (0xff >> len)) === (0xff >> len);
  for (let i = 1; i < len; i++) { v = v * 256 + b[o + i]; if (b[o + i] !== 255) allOnes = false; }
  return { value: v, len, unknown: !keepMarker && allOnes };
}

const MASTER = new Set([0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe0, 0xe1]);

async function probeWebm(file: Blob): Promise<ProbeInfo | null> {
  const dv = await slice(file, 0, Math.min(file.size, 2 * 1024 * 1024));
  const b = new Uint8Array(dv.buffer);
  if (b.length < 4 || b[0] !== 0x1a || b[1] !== 0x45 || b[2] !== 0xdf || b[3] !== 0xa3) return null;
  const info: ProbeInfo = { container: 'Matroska', duration: null, size: file.size, bitrate: null, video: null, audio: [], notes: [] };
  let scale = 1000000;
  let doc = '';
  let cur: { type: number; codec: string; w: number; h: number; dur: number; rate: number; ch: number; bits: number } | null = null;
  const commit = (): void => {
    if (!cur) return;
    const name = cur.codec === 'V_VP9' ? 'VP9' : cur.codec === 'V_VP8' ? 'VP8' : cur.codec === 'V_AV1' ? 'AV1' : cur.codec === 'V_MPEG4/ISO/AVC' ? 'H.264' : cur.codec === 'V_MPEGH/ISO/HEVC' ? 'HEVC' : cur.codec;
    if (cur.type === 1 && !info.video) info.video = { codec: name, profile: '', width: cur.w, height: cur.h, fps: cur.dur ? 1e9 / cur.dur : null, frames: null, bitrate: null, pixels: '' };
    if (cur.type === 2) info.audio.push({ codec: cur.codec === 'A_OPUS' ? 'Opus' : cur.codec === 'A_VORBIS' ? 'Vorbis' : cur.codec === 'A_AAC' ? 'AAC' : cur.codec === 'A_FLAC' ? 'FLAC' : cur.codec, sampleRate: cur.rate || null, channels: cur.ch || null, bitDepth: cur.bits || null, bitrate: null });
    cur = null;
  };
  const num = (o: number, n: number): number => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[o + i]; return v; };
  const flt = (o: number, n: number): number => (n === 4 ? dv.getFloat32(o) : n === 8 ? dv.getFloat64(o) : 0);
  const walk = (s: number, e: number, depth: number): boolean => {
    let o = s;
    while (o < e && o < b.length) {
      const id = readVint(b, o, true);
      if (!id) return true;
      const sz = readVint(b, o + id.len, false);
      if (!sz) return true;
      const p = o + id.len + sz.len;
      const q = sz.unknown ? e : Math.min(e, p + sz.value);
      if (id.value === 0x1f43b675) return false;
      if (id.value === 0xae) { commit(); cur = { type: 0, codec: '', w: 0, h: 0, dur: 0, rate: 0, ch: 0, bits: 0 }; }
      if (MASTER.has(id.value)) { if (!walk(p, q, depth + 1)) return false; if (id.value === 0xae) commit(); }
      else {
        const n = q - p;
        if (id.value === 0x4282) doc = dec.decode(b.subarray(p, q));
        else if (id.value === 0x2ad7b1) scale = num(p, n);
        else if (id.value === 0x4489) info.duration = (flt(p, n) * scale) / 1e9;
        else if (cur) {
          if (id.value === 0x83) cur.type = num(p, n);
          else if (id.value === 0x86) cur.codec = dec.decode(b.subarray(p, q));
          else if (id.value === 0xb0) cur.w = num(p, n);
          else if (id.value === 0xba) cur.h = num(p, n);
          else if (id.value === 0x23e383) cur.dur = num(p, n);
          else if (id.value === 0xb5) cur.rate = flt(p, n);
          else if (id.value === 0x9f) cur.ch = num(p, n);
          else if (id.value === 0x6264) cur.bits = num(p, n);
        }
      }
      o = q;
    }
    return true;
  };
  walk(0, b.length, 0);
  commit();
  info.container = doc === 'webm' ? 'WebM' : 'Matroska';
  if (info.duration) info.bitrate = (file.size * 8) / info.duration;
  return info;
}

async function probeWav(file: Blob): Promise<ProbeInfo | null> {
  const h = await slice(file, 0, Math.min(file.size, 4096));
  if (h.byteLength < 12) return null;
  const riff = fourcc(h, 0);
  if ((riff !== 'RIFF' && riff !== 'RF64') || fourcc(h, 8) !== 'WAVE') return null;
  let o = 12;
  let a: AudioInfo | null = null;
  let dataBytes = 0;
  let byteRate = 0;
  while (o + 8 <= h.byteLength) {
    const id = fourcc(h, o);
    const size = h.getUint32(o + 4, true);
    if (id === 'fmt ') {
      const tag = h.getUint16(o + 8, true);
      const bits = h.getUint16(o + 22, true);
      byteRate = h.getUint32(o + 16, true);
      a = { codec: tag === 3 ? `PCM f${bits}le` : `PCM s${bits}le`, sampleRate: h.getUint32(o + 12, true), channels: h.getUint16(o + 10, true), bitDepth: bits, bitrate: byteRate * 8 };
    } else if (id === 'data') {
      dataBytes = size === 0xffffffff ? file.size - o - 8 : size;
      break;
    }
    o += 8 + size + (size & 1);
  }
  if (!a) return null;
  return { container: 'WAVE', duration: byteRate && dataBytes ? dataBytes / byteRate : null, size: file.size, bitrate: byteRate * 8, video: null, audio: [a], notes: [] };
}

async function probeOgg(file: Blob): Promise<ProbeInfo | null> {
  const h = await slice(file, 0, Math.min(file.size, 8192));
  if (h.byteLength < 28 || fourcc(h, 0) !== 'OggS') return null;
  const bytes = new Uint8Array(h.buffer);
  const text = dec.decode(bytes);
  let a: AudioInfo = { codec: 'Ogg', sampleRate: null, channels: null, bitDepth: null, bitrate: null };
  const op = text.indexOf('OpusHead');
  const vb = text.indexOf('\x01vorbis');
  if (op >= 0) a = { codec: 'Opus', sampleRate: 48000, channels: bytes[op + 9], bitDepth: null, bitrate: null };
  else if (vb >= 0) a = { codec: 'Vorbis', sampleRate: h.getUint32(vb + 12, true), channels: bytes[vb + 11], bitDepth: null, bitrate: null };
  const tail = await slice(file, Math.max(0, file.size - 65536), Math.min(file.size, 65536));
  const tb = new Uint8Array(tail.buffer);
  let granule: number | null = null;
  for (let i = tb.length - 27; i >= 0; i--) {
    if (tb[i] === 0x4f && tb[i + 1] === 0x67 && tb[i + 2] === 0x67 && tb[i + 3] === 0x53) { granule = Number(tail.getBigUint64(i + 6, true)); break; }
  }
  const rate = a.sampleRate ?? 48000;
  const duration = granule !== null && granule > 0 ? granule / (a.codec === 'Opus' ? 48000 : rate) : null;
  return { container: 'Ogg', duration, size: file.size, bitrate: duration ? (file.size * 8) / duration : null, video: null, audio: [a], notes: [] };
}

async function probeFlac(file: Blob): Promise<ProbeInfo | null> {
  const h = await slice(file, 0, Math.min(file.size, 64));
  if (h.byteLength < 26 || fourcc(h, 0) !== 'fLaC') return null;
  const rate = (h.getUint8(18) << 12) | (h.getUint8(19) << 4) | (h.getUint8(20) >> 4);
  const channels = ((h.getUint8(20) >> 1) & 7) + 1;
  const bits = (((h.getUint8(20) & 1) << 4) | (h.getUint8(21) >> 4)) + 1;
  const total = (h.getUint8(21) & 15) * 2 ** 32 + h.getUint32(22);
  const duration = rate && total ? total / rate : null;
  return { container: 'FLAC', duration, size: file.size, bitrate: duration ? (file.size * 8) / duration : null, video: null, audio: [{ codec: 'FLAC', sampleRate: rate, channels, bitDepth: bits, bitrate: null }], notes: [] };
}

const MP3_RATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_HZ = [44100, 48000, 32000];

async function probeMp3(file: Blob): Promise<ProbeInfo | null> {
  const h = await slice(file, 0, Math.min(file.size, 65536));
  let o = 0;
  if (fourcc(h, 0).startsWith('ID3')) o = 10 + ((h.getUint8(6) << 21) | (h.getUint8(7) << 14) | (h.getUint8(8) << 7) | h.getUint8(9));
  if (o + 4 > h.byteLength) return null;
  for (let i = o; i + 4 < h.byteLength && i < o + 4096; i++) {
    if (h.getUint8(i) === 0xff && (h.getUint8(i + 1) & 0xe0) === 0xe0) {
      const ver = (h.getUint8(i + 1) >> 3) & 3;
      const layer = (h.getUint8(i + 1) >> 1) & 3;
      const br = MP3_RATES[h.getUint8(i + 2) >> 4];
      const hz = MP3_HZ[(h.getUint8(i + 2) >> 2) & 3];
      if (ver !== 3 || layer !== 1 || !br || !hz) continue;
      const channels = (h.getUint8(i + 3) >> 6) === 3 ? 1 : 2;
      return { container: 'MPEG audio', duration: ((file.size - i) * 8) / (br * 1000), size: file.size, bitrate: br * 1000, video: null, audio: [{ codec: 'MP3', sampleRate: hz, channels, bitDepth: null, bitrate: br * 1000 }], notes: ['duration assumes constant bitrate'] };
    }
  }
  return null;
}

export async function probeFile(file: File): Promise<ProbeInfo> {
  const tries = [probeMp4, probeWebm, probeWav, probeOgg, probeFlac, probeMp3];
  for (const t of tries) {
    try {
      const r = await t(file);
      if (r) return r;
    } catch {
      continue;
    }
  }
  return { container: file.type || 'unknown', duration: null, size: file.size, bitrate: null, video: null, audio: [], notes: ['container not recognised, showing what the browser reports'] };
}
