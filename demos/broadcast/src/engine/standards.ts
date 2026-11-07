import type { CaptionFormat } from './captions';

export type StandardId = 'ebu-r128' | 'atsc-a85' | 'op59' | 'arib-tr-b32' | 'streaming' | 'podcast' | 'custom';

export interface Standard {
  id: StandardId;
  label: string;
  short: string;
  target: number;
  truePeak: number;
  region: string;
}

export const STANDARDS: Standard[] = [
  { id: 'ebu-r128', label: 'EBU R128', short: 'R128', target: -23, truePeak: -1, region: 'Europe' },
  { id: 'atsc-a85', label: 'ATSC A/85', short: 'A/85', target: -24, truePeak: -2, region: 'United States' },
  { id: 'op59', label: 'OP-59 (Australia)', short: 'OP-59', target: -24, truePeak: -2, region: 'Australia' },
  { id: 'arib-tr-b32', label: 'ARIB TR-B32', short: 'ARIB', target: -24, truePeak: -1, region: 'Japan' },
  { id: 'streaming', label: 'Streaming (-14 LUFS)', short: 'Streaming', target: -14, truePeak: -1, region: 'Web' },
  { id: 'podcast', label: 'Podcast (-16 LUFS)', short: 'Podcast', target: -16, truePeak: -1, region: 'Audio' },
];

export const STANDARD_BY_ID = new Map<string, Standard>(STANDARDS.map((s) => [s.id, s]));

export type CaptionMode = 'none' | 'burnin' | 'sidecar' | 'embed';

export interface Profile {
  id: string;
  group: string;
  presetId: string;
  detail: string;
  standard: StandardId;
  limiter: boolean;
  captions: { mode: CaptionMode; format: CaptionFormat };
  overlays: { timecode: boolean; name: boolean; text: boolean; logo: boolean };
  videoLimiter: boolean;
  startTimecode: string;
  runs: boolean;
}

const none = { timecode: false, name: false, text: false, logo: false };

export const PROFILES: Profile[] = [
  { id: 'review', group: 'Review', presetId: 'match-source-medium', detail: 'Timecode, name and watermark burned in, captions on, R128', standard: 'ebu-r128', limiter: false, captions: { mode: 'burnin', format: 'srt' }, overlays: { timecode: true, name: true, text: true, logo: false }, videoLimiter: false, startTimecode: '01:00:00:00', runs: true },
  { id: 'ebu', group: 'Broadcast', presetId: 'h264-broadcast-ebu', detail: 'Europe, 25 fps, SRT or TTML beside the file, legal levels', standard: 'ebu-r128', limiter: false, captions: { mode: 'sidecar', format: 'ttml' }, overlays: { ...none, logo: false }, videoLimiter: true, startTimecode: '10:00:00:00', runs: true },
  { id: 'atsc', group: 'Broadcast', presetId: 'h264-broadcast-atsc', detail: 'United States, A/85, SCC beside the file, legal levels', standard: 'atsc-a85', limiter: true, captions: { mode: 'sidecar', format: 'scc' }, overlays: none, videoLimiter: true, startTimecode: '01:00:00:00', runs: true },
  { id: 'bwf', group: 'Broadcast', presetId: 'bwf-ebu', detail: 'Programme audio only, 24-bit 48 kHz, R128 report', standard: 'ebu-r128', limiter: false, captions: { mode: 'none', format: 'srt' }, overlays: none, videoLimiter: false, startTimecode: '10:00:00:00', runs: true },
  { id: 'xdcam', group: 'Broadcast', presetId: 'xdcam-hd422-720p50', detail: 'MXF OP1a master, written by the desktop engine', standard: 'ebu-r128', limiter: false, captions: { mode: 'none', format: 'srt' }, overlays: none, videoLimiter: true, startTimecode: '10:00:00:00', runs: false },
  { id: 'youtube', group: 'Web and social', presetId: 'youtube-1080p', detail: 'Streaming loudness, WebVTT beside the file', standard: 'streaming', limiter: true, captions: { mode: 'sidecar', format: 'vtt' }, overlays: none, videoLimiter: false, startTimecode: '00:00:00:00', runs: true },
  { id: 'social', group: 'Web and social', presetId: 'webm-vp9-1080p', detail: 'Captions burned in so they survive any player', standard: 'streaming', limiter: true, captions: { mode: 'burnin', format: 'srt' }, overlays: { ...none, logo: true }, videoLimiter: false, startTimecode: '00:00:00:00', runs: true },
  { id: 'podcast', group: 'Audio', presetId: 'wav-48-24', detail: 'Spoken word at -16 LUFS, limiter on, WAV master', standard: 'podcast', limiter: true, captions: { mode: 'none', format: 'srt' }, overlays: none, videoLimiter: false, startTimecode: '00:00:00:00', runs: true },
];

export const PROFILE_BY_ID = new Map(PROFILES.map((p) => [p.id, p]));
