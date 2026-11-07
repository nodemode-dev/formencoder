import { fmtBytes } from '../../frontend/src/ui/format';
import { defaultSettings, run, type Settings } from './engine/encode';
import { measureLoudness, describeLoudness, type Loudness } from './engine/loudness';
import { probeFile, type ProbeInfo } from './engine/probe';
import { PRESET_BY_ID, TARGET_EXT } from './engine/presets';
import { createSample, openFile, type Source } from './engine/source';
import { CURATED, loadFile, pendingSource } from './engine/media';

export type Status = 'ready' | 'preparing' | 'encoding' | 'done' | 'failed' | 'stopped' | 'skipped';

export interface Output {
  id: string;
  presetId: string;
  settings: Settings;
  status: Status;
  progress: number;
  message: string;
  encoder: string;
  note: string;
  blob: Blob | null;
  mime: string;
  fileName: string;
  elapsed: number;
  fps: number;
  frame: number;
  frames: number;
  eta: number;
  speed: number;
}

export interface Item {
  id: string;
  source: Source;
  probe: ProbeInfo;
  loudness: Loudness | null;
  loudnessState: 'pending' | 'done' | 'none';
  poster: HTMLCanvasElement | null;
  outputs: Output[];
  collapsed: boolean;
  loading: boolean;
}

export type Topic = 'items' | 'select' | 'progress' | 'log' | 'run' | 'settings';

type Listener = (payload?: unknown) => void;

let outSeq = 0;

class Store {
  items: Item[] = [];
  selectedItem = '';
  selectedOutput = '';
  running = false;
  logs: Array<{ time: string; text: string; error: boolean }> = [];
  private readonly listeners = new Map<Topic, Set<Listener>>();
  private abort: AbortController | null = null;
  private readonly previews = new Map<string, HTMLCanvasElement>();

  on(topic: Topic, fn: Listener): void {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic)?.add(fn);
  }

  emit(topic: Topic, payload?: unknown): void {
    for (const fn of this.listeners.get(topic) ?? []) fn(payload);
  }

  log(text: string, error = false): void {
    const d = new Date();
    const time = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
    this.logs.push({ time, text, error });
    if (this.logs.length > 400) this.logs.shift();
    this.emit('log');
  }

  previewFor(id: string): HTMLCanvasElement | undefined {
    return this.previews.get(id);
  }

  item(id: string): Item | undefined {
    return this.items.find((i) => i.id === id);
  }

  outputOf(id: string): { item: Item; output: Output } | undefined {
    for (const item of this.items) {
      const output = item.outputs.find((o) => o.id === id);
      if (output) return { item, output };
    }
    return undefined;
  }

  select(itemId: string, outputId = ''): void {
    if (this.selectedItem === itemId && this.selectedOutput === outputId) return;
    this.selectedItem = itemId;
    this.selectedOutput = outputId;
    this.emit('select');
  }

  makeOutput(presetId: string): Output {
    const preset = PRESET_BY_ID.get(presetId);
    if (!preset) throw new Error(`unknown preset ${presetId}`);
    return {
      id: `out${++outSeq}`,
      presetId,
      settings: defaultSettings(preset),
      status: 'ready',
      progress: 0,
      message: '',
      encoder: '',
      note: '',
      blob: null,
      mime: '',
      fileName: '',
      elapsed: 0,
      fps: 0,
      frame: 0,
      frames: 0,
      eta: 0,
      speed: 0,
    };
  }

  stem(item: Item): string {
    return item.source.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_') || 'source';
  }

  nameFor(item: Item, out: Output): string {
    const preset = PRESET_BY_ID.get(out.presetId);
    const ext = preset?.target ? TARGET_EXT[preset.target] : 'out';
    return `${this.stem(item)}_${out.presetId}.${ext}`;
  }

  addOutput(itemId: string, presetId: string): Output | undefined {
    const item = this.item(itemId);
    if (!item) return undefined;
    const out = this.makeOutput(presetId);
    out.fileName = this.nameFor(item, out);
    item.outputs.push(out);
    item.collapsed = false;
    this.log(`Added output ${PRESET_BY_ID.get(presetId)?.name ?? presetId} to ${item.source.name}`);
    this.emit('items');
    return out;
  }

  async addSource(source: Source, presets: string[]): Promise<Item> {
    const item: Item = { id: source.id, source, probe: { container: '', duration: null, size: source.size, bitrate: null, video: null, audio: [], notes: [] }, loudness: null, loudnessState: 'pending', poster: null, outputs: [], collapsed: false, loading: false };
    this.items.push(item);
    for (const p of presets) {
      const out = this.makeOutput(p);
      out.fileName = this.nameFor(item, out);
      item.outputs.push(out);
    }
    this.selectedItem = item.id;
    this.selectedOutput = '';
    this.log(`Added source ${source.name}`);
    this.emit('items');
    this.emit('select');
    return item;
  }

  async analyse(item: Item, file: File | null): Promise<void> {
    if (file) item.probe = await probeFile(file);
    else {
      item.probe = {
        container: 'generated in this page (no file)',
        duration: item.source.duration,
        size: 0,
        bitrate: null,
        video: { codec: 'canvas RGB', profile: '', width: item.source.width, height: item.source.height, fps: item.source.fps, frames: Math.round(item.source.duration * item.source.fps), bitrate: null, pixels: 'rgb24' },
        audio: [{ codec: 'PCM f32 (synthesised)', sampleRate: 48000, channels: 2, bitDepth: 32, bitrate: null }],
        notes: [],
      };
    }
    if (item.source.kind === 'video') {
      try {
        const img = await item.source.frame(Math.min(1, item.source.duration / 2));
        const poster = document.createElement('canvas');
        poster.width = 640;
        poster.height = Math.max(2, Math.round((640 * item.source.height) / item.source.width));
        poster.getContext('2d')?.drawImage(img, 0, 0, poster.width, poster.height);
        item.poster = poster;
      } catch (e) {
        this.log(`No preview frame: ${(e as Error).message}`, true);
      }
    }
    this.emit('items');
    this.emit('select');
    try {
      const buf = await item.source.audio();
      if (!buf) {
        item.loudnessState = 'none';
      } else {
        if (!item.probe.audio.length) item.probe.audio.push({ codec: 'decoded by the browser', sampleRate: buf.sampleRate, channels: buf.numberOfChannels, bitDepth: null, bitrate: null });
        await new Promise((r) => window.setTimeout(r, 0));
        const chans: Float32Array[] = [];
        for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
        item.loudness = measureLoudness(chans, buf.sampleRate);
        item.loudnessState = 'done';
        this.log(`Loudness of ${item.source.name}: ${describeLoudness(item.loudness)}`);
      }
    } catch (e) {
      item.loudnessState = 'none';
      this.log(`Loudness measurement failed: ${(e as Error).message}`, true);
    }
    this.emit('items');
    this.emit('select');
  }

  async addFile(file: File): Promise<void> {
    try {
      this.log(`Opening ${file.name}`);
      const probe = await probeFile(file);
      const fps = probe.video?.fps ?? null;
      const source = await openFile(file, fps && Number.isFinite(fps) ? fps : null);
      const defaults = source.kind === 'video' ? ['match-source-medium', 'gif-480', 'bwf-ebu'] : ['wav-48-24', 'bwf-ebu', 'ogg-opus'];
      const item = await this.addSource(source, defaults);
      await this.analyse(item, file);
    } catch (e) {
      this.log(`Could not open ${file.name}: ${(e as Error).message}`, true);
    }
  }

  async addCurated(): Promise<void> {
    const rows: Array<{ item: Item; index: number }> = [];
    CURATED.forEach((c, index) => {
      const item = this.addCuratedRow(c);
      rows.push({ item, index });
    });
    this.selectedItem = rows[0].item.id;
    this.emit('select');
    let loaded = 0;
    for (const { item, index } of rows) {
      const c = CURATED[index];
      try {
        const file = await loadFile(c);
        const source = await openFile(file, c.fps || null);
        source.id = item.id;
        item.source.dispose();
        item.source = source;
        item.loading = false;
        this.emit('items');
        await this.analyse(item, file);
        loaded++;
      } catch (e) {
        this.log(`Could not load ${c.file}: ${(e as Error).message}`, true);
        this.items = this.items.filter((i) => i.id !== item.id);
        if (this.selectedItem === item.id) this.selectedItem = this.items[0]?.id ?? '';
        this.emit('items');
        this.emit('select');
      }
    }
    if (!loaded) {
      this.log('The curated media did not load; adding the built-in sample instead', true);
      await this.addSample();
    }
  }

  private addCuratedRow(c: (typeof CURATED)[number]): Item {
    const source = pendingSource(c);
    const item: Item = { id: source.id, source, probe: { container: '', duration: c.duration, size: c.bytes, bitrate: null, video: null, audio: [], notes: [] }, loudness: null, loudnessState: 'pending', poster: null, outputs: [], collapsed: false, loading: true };
    this.items.push(item);
    for (const o of c.outputs) {
      const out = this.makeOutput(o.preset);
      if (o.lufs !== undefined) out.settings.lufs = o.lufs;
      if (o.size) out.settings.size = o.size;
      out.fileName = this.nameFor(item, out);
      item.outputs.push(out);
    }
    this.log(`Added source ${c.file}`);
    this.emit('items');
    return item;
  }

  async addSample(): Promise<void> {
    const source = createSample();
    const item = await this.addSource(source, ['match-source-medium', 'gif-480', 'bwf-ebu']);
    await this.analyse(item, null);
  }

  removeSelected(): void {
    if (this.running) return;
    if (this.selectedOutput) {
      const hit = this.outputOf(this.selectedOutput);
      if (hit) {
        hit.item.outputs = hit.item.outputs.filter((o) => o.id !== this.selectedOutput);
        this.selectedOutput = '';
      }
    } else if (this.selectedItem) {
      const item = this.item(this.selectedItem);
      item?.source.dispose();
      this.items = this.items.filter((i) => i.id !== this.selectedItem);
      this.selectedItem = this.items[0]?.id ?? '';
    }
    this.emit('items');
    this.emit('select');
  }

  resetOutput(out: Output): void {
    out.status = 'ready';
    out.progress = 0;
    out.message = '';
    out.blob = null;
    out.note = '';
    out.encoder = '';
    this.emit('items');
  }

  async start(): Promise<void> {
    if (this.running) return;
    const todo: Array<{ item: Item; out: Output }> = [];
    for (const item of this.items) for (const out of item.outputs) if (!item.loading && out.status === 'ready' || out.status === 'failed' || out.status === 'stopped') todo.push({ item, out });
    if (!todo.length) { this.log('Nothing to encode: every output is done'); return; }
    this.running = true;
    this.abort = new AbortController();
    this.emit('run');
    this.log(`Queue started: ${todo.length} output${todo.length === 1 ? '' : 's'}`);
    for (const { item, out } of todo) {
      if (this.abort.signal.aborted) break;
      await this.runOne(item, out, this.abort.signal);
    }
    this.running = false;
    this.abort = null;
    this.log('Queue finished');
    this.emit('run');
  }

  stop(): void {
    this.abort?.abort();
  }

  private async runOne(item: Item, out: Output, signal: AbortSignal): Promise<void> {
    const preset = PRESET_BY_ID.get(out.presetId);
    if (!preset) return;
    if (!preset.target) {
      out.status = 'skipped';
      out.message = 'Needs the desktop engine';
      this.log(`Skipped ${out.fileName}: ${preset.name} needs the desktop engine`);
      this.emit('progress', out);
      return;
    }
    out.status = 'preparing';
    out.progress = 0;
    out.message = 'Preparing';
    out.blob = null;
    out.note = '';
    this.emit('progress', out);
    const began = performance.now();
    this.log(`Encoding ${out.fileName} with ${preset.name}`);
    try {
      const canvasFor = (): HTMLCanvasElement => {
        let c = this.previews.get(out.id);
        if (!c) { c = document.createElement('canvas'); this.previews.set(out.id, c); }
        return c;
      };
      const result = await run({
        source: item.source,
        preset,
        settings: out.settings,
        signal,
        onProgress: (p) => {
          const el = (performance.now() - began) / 1000;
          out.status = 'encoding';
          out.progress = p.fraction;
          out.frame = p.frame;
          out.frames = p.frames;
          out.elapsed = el;
          out.eta = p.fraction > 0.02 ? (el / p.fraction) * (1 - p.fraction) : 0;
          out.fps = el > 0 ? p.frame / el : 0;
          out.speed = el > 0 && item.source.fps ? p.frame / item.source.fps / el : 0;
          out.message = p.message;
          this.emit('progress', out);
        },
        onPreview: (canvas) => {
          const c = canvasFor();
          if (c.width !== canvas.width || c.height !== canvas.height) { c.width = canvas.width; c.height = canvas.height; }
          c.getContext('2d')?.drawImage(canvas, 0, 0);
          this.emit('progress', out);
        },
      });
      out.blob = result.blob;
      out.mime = result.mime;
      out.fileName = out.fileName.replace(/\.[^.]+$/, `.${result.ext}`);
      out.encoder = result.encoder;
      out.note = result.note;
      out.status = 'done';
      out.progress = 1;
      out.elapsed = (performance.now() - began) / 1000;
      out.eta = 0;
      out.message = fmtBytes(result.blob.size);
      this.log(`Done ${out.fileName}: ${result.encoder}${result.note ? '. ' + result.note : ''}`);
    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError') {
        out.status = 'stopped';
        out.message = 'Stopped';
        this.log(`Stopped ${out.fileName}`);
      } else {
        out.status = 'failed';
        out.message = err.message;
        this.log(`Failed ${out.fileName}: ${err.message}`, true);
      }
    }
    this.emit('progress', out);
    this.emit('items');
  }
}

export const store = new Store();
