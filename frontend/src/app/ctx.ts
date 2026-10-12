import { Client, RpcFailure } from '../engine/client';
import { Emitter } from '../engine/events';
import { Store } from '../engine/store';
import type { CommandSpec, PresetRow } from '../engine/types';
import { pickFiles } from '../ui/file-dialog';
import { schemaForm } from '../ui/forms';
import { toast } from '../ui/toast';

export interface UiEvents {
  showPanel: string;
  focusPanel: string;
  exportSettings: string;
  inspect: { path: string; name?: string };
  presets: void;
  result: { command: string; params: Record<string, unknown>; result: unknown };
  specs: void;
}

interface Picker {
  key: string;
  mode: 'open' | 'save' | 'folder';
  multiple?: boolean;
  ext?: string[];
  name?: string;
  title?: string;
}

export const MEDIA = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mxf', 'mts', 'm2ts', 'ts', 'mpg', 'mpeg', 'm2v', 'vob', 'wmv', 'flv', '3gp', 'dv', 'ogv', 'y4m', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'tga', 'dpx', 'exr', 'webp', 'gif', 'jp2', 'psd', 'wav', 'aif', 'aiff', 'mp3', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'wma', 'ac3', 'eac3', 'caf', 'bwf', 'fvxlink'];
const CAPTIONS = ['srt', 'vtt', 'scc', 'ttml', 'xml', 'dfxp'];

const PICKERS: Record<string, Picker[]> = {
  'queue.addSource': [{ key: 'paths', mode: 'open', multiple: true, ext: MEDIA, title: 'Add Source' }],
  'queue.stitch': [{ key: 'paths', mode: 'open', multiple: true, ext: MEDIA, title: 'Stitch Clips Together' }],
  'queue.addFolder': [{ key: 'folder', mode: 'folder', title: 'Add Folder' }],
  'watch.add': [{ key: 'folder', mode: 'folder', title: 'Add Watch Folder' }],
  'preset.import': [{ key: 'path', mode: 'open', ext: ['fepreset', 'json', 'epr'], title: 'Import Preset' }],
  'preset.export': [{ key: 'path', mode: 'save', ext: ['fepreset'], name: 'Preset.fepreset', title: 'Export Preset' }],
  'queue.save': [{ key: 'path', mode: 'save', ext: ['fequeue'], name: 'Queue.fequeue', title: 'Save Queue' }],
  'queue.open': [{ key: 'path', mode: 'open', ext: ['fequeue', 'json'], title: 'Open Queue' }],
  'lut.install': [{ key: 'path', mode: 'open', ext: ['cube', '3dl'], title: 'Install LUT' }],
  'captions.read': [{ key: 'path', mode: 'open', ext: CAPTIONS, title: 'Read Captions' }],
  'captions.convert': [{ key: 'path', mode: 'open', ext: CAPTIONS, title: 'Convert Captions' }],
  'ingest.copy': [{ key: 'paths', mode: 'open', multiple: true, title: 'Ingest: choose the media or card files' }, { key: 'destination', mode: 'folder', title: 'Ingest: copy to' }],
  'proxy.create': [{ key: 'paths', mode: 'open', multiple: true, ext: MEDIA, title: 'Create Proxies' }],
  'analyze.media': [{ key: 'paths', mode: 'open', multiple: true, ext: MEDIA, title: 'Analyze Media' }],
  'media.probe': [{ key: 'path', mode: 'open', ext: MEDIA, title: 'Media Info' }],
};

const SELECTED_REFS = new Set(['queue.duplicate', 'queue.remove', 'queue.setPreset', 'queue.setFormat', 'queue.setSettings', 'queue.skip', 'queue.resetStatus', 'queue.stopCurrent', 'queue.setOutput', 'queue.setRange']);
const SELECTED_OUTPUT = new Set(['ui.exportSettings', 'encode.command', 'encode.estimate', 'encode.verify', 'queue.getSettings']);
const SELECTED_ITEM = new Set(['queue.addOutput', 'queue.interpret']);

export class Ctx {
  readonly client = new Client();
  readonly store = new Store(this.client);
  readonly ui = new Emitter<UiEvents>();
  readonly specs = new Map<string, CommandSpec>();
  private presetCache: PresetRow[] | null = null;

  start(): void {
    this.client.connect();
    this.client.events.on('open', () => void this.loadSpecs());
    this.client.events.on('activity', (ev) => {
      if (String(ev.command || '').startsWith('preset.')) this.presetCache = null;
      if (String(ev.command || '').startsWith('shortcuts.')) void this.loadSpecs().then(() => this.ui.emit('specs', undefined));
    });
  }

  async loadSpecs(): Promise<void> {
    try {
      const rows = await this.client.call<CommandSpec[]>('command.list', { schemas: true });
      this.specs.clear();
      for (const r of rows) this.specs.set(r.id, r);
    } catch (e) {
      console.warn('[formencoder] command list failed', e);
    }
  }

  async presets(refresh = false): Promise<PresetRow[]> {
    if (refresh || !this.presetCache) {
      const r = await this.client.exec<{ presets: PresetRow[] }>('preset.list', {});
      this.presetCache = r.presets;
    }
    return this.presetCache;
  }

  dropPresets(): void {
    this.presetCache = null;
  }

  async run<T = unknown>(command: string, params: Record<string, unknown> = {}, quiet = false): Promise<T | undefined> {
    try {
      const r = await this.client.exec<T>(command, params);
      if (command.startsWith('preset.')) this.presetCache = null;
      return r;
    } catch (e) {
      if (!quiet) toast(e instanceof RpcFailure ? e.message : String(e), 'error');
      return undefined;
    }
  }

  hasParams(command: string): boolean {
    return Object.keys(this.specs.get(command)?.schema?.properties ?? {}).length > 0;
  }

  async invoke(command: string, params: Record<string, unknown> | null = null, ask = false): Promise<unknown> {
    if (!command) return undefined;
    ask = ask && this.hasParams(command);
    const p: Record<string, unknown> = { ...(params || {}) };
    const sel = this.store.selection();
    if (SELECTED_REFS.has(command) && p.refs === undefined) {
      if (sel.outputs.length) p.refs = sel.outputs;
      else if (sel.items.length) p.refs = sel.items;
      else if (command !== 'queue.stopCurrent' && !ask) {
        toast('Select an output or a source in the Queue first', 'error');
        return undefined;
      }
    }
    if (SELECTED_OUTPUT.has(command) && p.output === undefined && p.path === undefined) {
      const o = sel.outputs[0] ?? this.store.firstOutputOf(sel.items[0]);
      if (!o && !ask) {
        toast('Select an output in the Queue first', 'error');
        return undefined;
      }
      if (o) p.output = o;
    }
    if (SELECTED_ITEM.has(command) && p.item === undefined) {
      const it = sel.items[0] ?? this.store.itemOf(sel.outputs[0]);
      if (!it && !ask) {
        toast('Select a source in the Queue first', 'error');
        return undefined;
      }
      if (it) p.item = it;
    }
    if (command === 'ui.exportSettings' && p.output !== undefined) {
      this.ui.emit('exportSettings', String(p.output));
      return undefined;
    }
    for (const picker of ask ? [] : PICKERS[command] ?? []) {
      if (p[picker.key] !== undefined) continue;
      const label = picker.title || this.specs.get(command)?.label?.replace(/\.\.\.$/, '') || command;
      const got = await pickFiles({ title: label, mode: picker.mode, multiple: picker.multiple, extensions: picker.ext, defaultName: picker.name });
      if (!got || !got.length) return undefined;
      p[picker.key] = picker.multiple ? got : got[0];
    }
    const spec = this.specs.get(command);
    const missing = (spec?.schema?.required ?? []).filter((k) => p[k] === undefined);
    if (spec && (missing.length || ask)) {
      const r = await schemaForm(spec, p, this);
      if (!r) return undefined;
      Object.assign(p, r);
    }
    try {
      const out = await this.client.exec(command, p);
      if (command.startsWith('preset.')) this.presetCache = null;
      if (spec?.query && command !== 'queue.select') this.ui.emit('result', { command, params: p, result: out });
      return out;
    } catch (e) {
      toast(e instanceof RpcFailure ? e.message : String(e), 'error');
      return undefined;
    }
  }
}

export const ctx = new Ctx();
