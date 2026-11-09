import { PROFILES, type StandardId } from '../../../../frontend/src/demos/broadcast-profiles';

export { PROFILES };
export type { CaptionMode, Profile, StandardId } from '../../../../frontend/src/demos/broadcast-profiles';

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

export const PROFILE_BY_ID = new Map(PROFILES.map((p) => [p.id, p]));
