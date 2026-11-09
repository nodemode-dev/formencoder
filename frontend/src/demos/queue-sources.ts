export interface CuratedOutput {
  preset: string;
  lufs?: number;
  size?: 'source';
}

export interface Curated {
  pack: string;
  file: string;
  mime: string;
  kind: 'video' | 'audio';
  width: number;
  height: number;
  fps: number;
  duration: number;
  bytes: number;
  outputs: CuratedOutput[];
}

export const CURATED: Curated[] = [
  {
    pack: 'open-water',
    file: 'open-water-1280x720-30fps.mp4',
    mime: 'video/mp4',
    kind: 'video',
    width: 1280,
    height: 720,
    fps: 29.97,
    duration: 8.008,
    bytes: 6819433,
    outputs: [{ preset: 'match-source-medium' }, { preset: 'gif-480' }, { preset: 'png-still' }],
  },
  {
    pack: 'coast-aerial',
    file: 'coast-aerial-1280x720-25fps.mp4',
    mime: 'video/mp4',
    kind: 'video',
    width: 1280,
    height: 720,
    fps: 25,
    duration: 7,
    bytes: 6637734,
    outputs: [{ preset: 'match-source-medium' }, { preset: 'gif-480' }],
  },
  {
    pack: 'shoreline-vertical',
    file: 'shoreline-vertical-404x720-60fps.mp4',
    mime: 'video/mp4',
    kind: 'video',
    width: 404,
    height: 720,
    fps: 59.94,
    duration: 7.858,
    bytes: 4235966,
    outputs: [{ preset: 'match-source-medium' }, { preset: 'gif-480', size: 'source' }],
  },
  {
    pack: 'on-the-sea-reading',
    file: 'on-the-sea-reading.mp3',
    mime: 'audio/mpeg',
    kind: 'audio',
    width: 0,
    height: 0,
    fps: 0,
    duration: 21.133,
    bytes: 211755,
    outputs: [{ preset: 'ogg-opus', lufs: -16 }, { preset: 'bwf-ebu' }, { preset: 'wav-48-24' }],
  },
];
