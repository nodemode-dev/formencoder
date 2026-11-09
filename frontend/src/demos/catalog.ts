import { PROFILES, REVIEW_TEXT } from './broadcast-profiles';
import { CURATED } from './queue-sources';

export interface DemoOutput {
  preset: string;
  settings?: Record<string, unknown>;
}

export interface DemoSource {
  file: string;
  frameRate?: number;
  captions?: string;
  outputs: DemoOutput[];
}

export interface Demo {
  id: 'queue' | 'broadcast' | 'inspect';
  title: string;
  blurb: string;
  sources: DemoSource[];
  panel: string;
}

const sys = (id: string): string => `system/${id}`;

const queueDemo: Demo = {
  id: 'queue',
  title: 'Queue and presets',
  blurb: 'Three sea clips and a reading with ten outputs: H.264, GIF, a still, Opus at -16 LUFS and broadcast WAV',
  panel: 'queue',
  sources: CURATED.map((c) => ({
    file: c.file,
    outputs: c.outputs.map((o) => ({
      preset: sys(o.preset),
      settings: o.lufs !== undefined ? { effects: { loudness: { enabled: true, standard: 'custom', target: o.lufs } } } : o.size === 'source' ? { video: { matchSource: true } } : undefined,
    })),
  })),
};

const PROGRAMME = 'on-the-sea-programme.mp4';
const CUES = 'on-the-sea-programme.srt';
const BROADCAST_PROFILES = ['review', 'ebu', 'atsc', 'bwf', 'xdcam'];

const broadcastDemo: Demo = {
  id: 'broadcast',
  title: 'Delivery specs',
  blurb: 'A 17 s programme with captions to air: review copy with burn-ins, EBU R128, ATSC A/85, BWF and an MXF master',
  panel: 'queue',
  sources: [
    {
      file: PROGRAMME,
      captions: CUES,
      outputs: PROFILES.filter((p) => BROADCAST_PROFILES.includes(p.id)).map((p) => {
        const on = p.captions.mode !== 'none';
        const effects: Record<string, unknown> = {
          loudness: { enabled: true, standard: p.standard, limiter: { enabled: p.limiter } },
          videoLimiter: { enabled: p.videoLimiter, min: 0, max: 96 },
          timecodeOverlay: { enabled: p.overlays.timecode, position: 'topLeft', start: p.startTimecode, source: 'generate' },
          nameOverlay: { enabled: p.overlays.name, position: 'topRight' },
          textOverlay: { enabled: p.overlays.text, position: 'center', text: REVIEW_TEXT },
        };
        return { preset: sys(p.presetId), settings: { effects, captions: { mode: p.captions.mode, format: p.captions.format, source: on ? CUES : 'auto' }, startTimecode: p.startTimecode } };
      }),
    },
  ],
};

const STREAM_RANGE = { mode: 'custom', in: 2.002, out: 5.005 };
const h264At = (mbps: number): Record<string, unknown> => ({ video: { targetBitrate: mbps, maxBitrate: mbps * 1.2 }, range: STREAM_RANGE });

const inspectDemo: Demo = {
  id: 'inspect',
  title: 'Inspect and convert',
  blurb: 'A hike shoot of mixed rates and shapes with a JPEG sequence; high and low encodes, a proxy and a GIF to compare',
  panel: 'info',
  sources: [
    {
      file: 'autumn-stream.mp4',
      outputs: [
        { preset: sys('match-source-high'), settings: { ...h264At(3.5), outputName: '{source}_high' } },
        { preset: sys('match-source-high'), settings: { ...h264At(0.45), outputName: '{source}_low' } },
        { preset: sys('proxy-h264-540') },
        { preset: sys('gif-480'), settings: { range: STREAM_RANGE } },
      ],
    },
    { file: 'waterfall.mp4', outputs: [{ preset: sys('proxy-h264-540') }] },
    { file: 'river-vertical.mp4', outputs: [{ preset: sys('proxy-h264-540') }] },
    { file: 'clouds_0001.jpg', frameRate: 24, outputs: [{ preset: sys('gif-480') }] },
  ],
};

export const DEMOS: Demo[] = [queueDemo, broadcastDemo, inspectDemo];
export const DEMO_IDS = DEMOS.map((d) => d.id);
