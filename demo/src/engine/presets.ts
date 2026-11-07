import { PRESET_ROWS } from './preset-rows';

export type Target = 'webm' | 'gif' | 'wav' | 'aiff' | 'ogg' | 'png' | 'jpeg';

export interface Preset {
  id: string;
  name: string;
  category: string;
  format: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  mbps: number | null;
  target: Target | null;
  lufs: number | null;
  bits: 16 | 24;
}

const VIDEO_FORMATS = new Set(['h264', 'hevc', 'av1', 'webm', 'mpeg2', 'mpeg2_dvd', 'mpeg2_bluray', 'h264_bluray', 'matroska']);

function targetOf(id: string, format: string): Target | null {
  if (id === 'webm-vp9-alpha' || id === 'ffv1-archive') return null;
  if (VIDEO_FORMATS.has(format)) return 'webm';
  if (format === 'gif') return 'gif';
  if (format === 'wav' || format === 'bwf') return 'wav';
  if (format === 'aiff') return 'aiff';
  if (format === 'ogg') return 'ogg';
  if (id === 'png-still') return 'png';
  if (id === 'jpeg-still') return 'jpeg';
  return null;
}

function lufsOf(name: string): number | null {
  if (/EBU R128/.test(name)) return -23;
  if (/ATSC A\/85/.test(name)) return -24;
  const m = /(-\d+) LUFS/.exec(name);
  return m ? Number(m[1]) : null;
}

export const PRESETS: Preset[] = PRESET_ROWS.map(([id, name, category, format, width, height, fps, mbps]) => ({
  id,
  name,
  category,
  format,
  width,
  height,
  fps,
  mbps,
  target: targetOf(id, format),
  lufs: lufsOf(name),
  bits: /-16\b|16-bit/.test(name) ? 16 : 24,
}));

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export const TARGET_LABEL: Record<Target, string> = {
  webm: 'WebM',
  gif: 'GIF',
  wav: 'WAV',
  aiff: 'AIFF',
  ogg: 'Ogg Opus',
  png: 'PNG',
  jpeg: 'JPEG',
};

export const TARGET_EXT: Record<Target, string> = {
  webm: 'webm',
  gif: 'gif',
  wav: 'wav',
  aiff: 'aiff',
  ogg: 'opus',
  png: 'png',
  jpeg: 'jpg',
};

export const TARGET_MIME: Record<Target, string> = {
  webm: 'video/webm',
  gif: 'image/gif',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  ogg: 'audio/ogg',
  png: 'image/png',
  jpeg: 'image/jpeg',
};

export const FORMAT_LABEL: Record<string, string> = {
  h264: 'H.264', hevc: 'HEVC', av1: 'AV1', webm: 'WebM', prores: 'ProRes', quicktime: 'QuickTime', cineform: 'CineForm',
  mxf_op1a: 'MXF OP1a', dnxhr_mxf: 'DNx MXF', prores_mxf: 'ProRes MXF', jpeg2000_mxf: 'J2K MXF', mpeg2: 'MPEG-2',
  mpeg2_dvd: 'DVD', mpeg2_bluray: 'Blu-ray', h264_bluray: 'Blu-ray', as10: 'AS-10', as11: 'AS-11', as11_d10: 'AS-11 D10',
  p2: 'P2', dcp: 'DCP', png: 'PNG', tiff: 'TIFF', dpx: 'DPX', exr: 'EXR', jpeg: 'JPEG', targa: 'Targa', gif: 'GIF',
  wav: 'WAV', bwf: 'BWF', aiff: 'AIFF', mp3: 'MP3', aac: 'AAC', flac: 'FLAC', ogg: 'Ogg', matroska: 'Matroska',
};

export const AUDIO_TARGETS =new Set<Target>(['wav', 'aiff', 'ogg']);

export function presetSize(p: Preset): string {
  return p.width && p.height ? `${p.width}x${p.height}` : '';
}

export function presetRate(p: Preset): string {
  return p.fps ? `${Number(p.fps.toFixed(3))}` : '';
}

export function presetBitrate(p: Preset): string {
  return p.mbps ? `${p.mbps} Mb/s` : '';
}
