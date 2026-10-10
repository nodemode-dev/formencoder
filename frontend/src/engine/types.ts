export type Status = 'ready' | 'preparing' | 'encoding' | 'paused' | 'done' | 'failed' | 'stopped' | 'skipped';

export interface Summary {
  format?: string;
  video?: string;
  audio?: string;
  effects?: string[];
}

export interface Loudness {
  standard?: string;
  target?: number;
  truePeak?: number;
  output?: { integrated?: number; lra?: number; truePeak?: number };
}

export interface Output {
  id: string;
  kind: 'encode' | 'copy' | 'analysis';
  format: string;
  formatLabel: string;
  preset: string | null;
  presetName: string;
  path: string;
  status: Status;
  progress: number;
  error: string | null;
  eta: number | null;
  elapsed: number | null;
  fps: number | null;
  speed: number | null;
  encoder: string | null;
  bytes: number | null;
  notes: string[] | null;
  message: string | null;
  summary: Summary;
  effects: string[];
  skip: boolean;
  folder: string | null;
  custom: boolean;
  publish: Array<{ type: string; ok: boolean; error?: string; sent?: string[] }> | null;
  loudness: Loudness | null;
  outTime: number | null;
  duration: number | null;
  fetch?: number;
}

export interface Item {
  id: string;
  index: number;
  kind: 'file' | 'sequence' | 'stitch' | 'family';
  name: string;
  path: string;
  duration: number | null;
  video: string;
  audio: string;
  origin: { watch?: string } | null;
  family: { app?: string; id?: string; name?: string } | null;
  stitch: string[] | null;
  range: { in?: number; out?: number } | null;
  interpret: Record<string, unknown> | null;
  missing: boolean;
  outputs: Output[];
}

export interface WatchOutput {
  id: string;
  format: string;
  formatLabel: string;
  presetName: string;
  folder: string;
}

export interface Watch {
  id: string;
  folder: string;
  active: boolean;
  moveSources: boolean;
  kind: string;
  outputs: WatchOutput[];
  lastScan: number | null;
}

export interface Counts {
  total: number;
  ready: number;
  encoding: number;
  done: number;
  failed: number;
  stopped: number;
  skipped: number;
}

export interface UiState {
  revision: number;
  version: string;
  running: boolean;
  paused: boolean;
  items: Item[];
  watch: Watch[];
  selection: { items: string[]; outputs: string[] };
  undo: string | null;
  redo: string | null;
  counts: Counts;
  autoStartIn: number | null;
  autoEncodeWatch: boolean;
  parallel: boolean;
  encoding: string[];
  ffmpeg: { found?: boolean; path?: string; version?: string; licence?: string; origin?: string };
  hardware: string[];
  encodersReady: boolean;
}

export interface CommandSpec {
  id: string;
  label: string;
  menu: string;
  params: string;
  undoable: boolean;
  query: boolean;
  shortcut: string;
  enabled: boolean;
  schema?: { properties?: Record<string, Record<string, unknown>>; required?: string[] };
  doc?: string;
}

export interface PresetRow {
  id: string;
  name: string;
  group: string;
  category: string;
  system: boolean;
  kind: string;
  format: string;
  formatLabel: string;
  alias: string | null;
  frameSize: string;
  frameRate: string;
  targetRate: string;
  comment: string;
  summary: Summary;
}

export interface FieldSpec {
  key: string;
  label: string;
  type: 'bool' | 'int' | 'number' | 'select' | 'text' | 'color' | 'path';
  options?: Array<[unknown, string]>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  nullable?: boolean;
  showIf?: string;
  value?: unknown;
  advanced?: boolean;
}

export interface FormatDescription {
  format: string;
  label: string;
  video: FieldSpec[];
  audio: FieldSpec[];
  multiplexer: FieldSpec[];
  codecs: Record<string, { label: string; encoders: string[] }>;
  audioCodecs: Record<string, { label: string; encoders: string[] }>;
  effects: Record<string, Record<string, unknown>>;
  loudnessStandards: Record<string, { label: string; target: number; truePeak: number }>;
  positions: string[];
  scaling: Array<[string, string]>;
  timeInterpolation: Array<[string, string]>;
  captions: Array<[string, string]>;
  defaults: Settings;
}

export type Settings = Record<string, unknown> & {
  format: string;
  presetName?: string;
  outputName?: string;
  exportVideo?: boolean;
  exportAudio?: boolean;
  video: Record<string, unknown>;
  audio: Record<string, unknown>;
  multiplexer: Record<string, unknown>;
  range: { mode: string; in: number | null; out: number | null };
  crop: { left: number; top: number; right: number; bottom: number };
  effects: Record<string, Record<string, unknown>>;
  captions: Record<string, unknown>;
  metadata: { mode: string; fields: Record<string, string>; xmpSidecar: boolean };
  publish: Array<Record<string, unknown>>;
};

export interface OutputSettings {
  output: string;
  item: string;
  source: string;
  path: string;
  kind: string;
  settings: Settings;
  summary: Summary;
  sourceInfo: { duration?: number; video?: { width?: number; height?: number; fps?: number; codec?: string } | null; audio?: unknown[] };
}
