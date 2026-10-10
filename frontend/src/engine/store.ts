import type { Client, ServerEvent } from './client';
import { Emitter } from './events';
import type { Item, Output, UiState } from './types';

export interface StoreEvents {
  state: UiState;
  items: UiState;
  watch: UiState;
  run: UiState;
  history: UiState;
  selection: UiState;
  progress: Output;
}

const json = (v: unknown): string => JSON.stringify(v ?? null);
const LIVE = ['status', 'progress', 'eta', 'elapsed', 'fps', 'speed', 'message', 'encoder', 'bytes', 'outTime', 'error', 'path', 'fetch', 'notes', 'loudness', 'publish'] as const;

export class Store {
  readonly events = new Emitter<StoreEvents>();
  state: UiState | null = null;
  private pulling = false;
  private dirty = false;
  private sig: Record<string, string> = {};
  private local: { items: string[]; outputs: string[] } = { items: [], outputs: [] };

  constructor(private readonly client: Client) {
    client.events.on('open', () => this.invalidate());
    client.events.on('changed', () => this.invalidate());
    client.events.on('progress', (ev) => this.progress(ev));
    client.events.on('finished', () => this.invalidate());
  }

  watch(fn: (st: UiState) => void): void {
    this.events.on('state', fn);
    if (this.state) queueMicrotask(() => this.state && fn(this.state));
  }

  output(id: string): Output | undefined {
    for (const it of this.state?.items ?? []) for (const o of it.outputs) if (o.id === id) return o;
    return undefined;
  }

  item(id: string): Item | undefined {
    return this.state?.items.find((i) => i.id === id);
  }

  itemOf(outputId: string | undefined): string | undefined {
    if (!outputId) return undefined;
    return this.state?.items.find((i) => i.outputs.some((o) => o.id === outputId))?.id;
  }

  firstOutputOf(itemId: string | undefined): string | undefined {
    if (!itemId) return undefined;
    return this.item(itemId)?.outputs[0]?.id;
  }

  selection(): { items: string[]; outputs: string[] } {
    return this.local;
  }

  select(items: string[], outputs: string[]): void {
    this.local = { items, outputs };
    if (this.state) this.events.emit('selection', this.state);
    void this.client.exec('queue.select', { items, outputs }).catch(() => undefined);
  }

  invalidate(): void {
    if (this.pulling) {
      this.dirty = true;
      return;
    }
    void this.pull();
  }

  async pull(): Promise<void> {
    this.pulling = true;
    try {
      do {
        this.dirty = false;
        const st = await this.client.call<UiState>('ui.state');
        this.apply(st);
      } while (this.dirty);
    } catch (e) {
      console.warn('[formencoder] state pull failed', e);
    } finally {
      this.pulling = false;
    }
  }

  private progress(ev: ServerEvent): void {
    const o = this.output(String(ev.output));
    if (!o) {
      this.invalidate();
      return;
    }
    const rec = o as unknown as Record<string, unknown>;
    for (const k of LIVE) if (k in ev) rec[k] = ev[k];
    if (ev.status === 'encoding' && typeof ev.progress !== 'number' && o.progress === undefined) o.progress = 0;
    this.events.emit('progress', o);
  }

  private apply(st: UiState): void {
    this.state = st;
    const ids = new Set(st.items.map((i) => i.id));
    const outs = new Set(st.items.flatMap((i) => i.outputs.map((o) => o.id)));
    const keep = { items: this.local.items.filter((i) => ids.has(i)), outputs: this.local.outputs.filter((o) => outs.has(o)) };
    const selChanged = keep.items.length !== this.local.items.length || keep.outputs.length !== this.local.outputs.length;
    this.local = keep;
    const parts: Record<Exclude<keyof StoreEvents, 'state' | 'progress'>, string> = {
      items: json(st.items),
      watch: json([st.watch, st.autoEncodeWatch]),
      run: json([st.running, st.paused, st.counts, st.encoding, st.autoStartIn, st.ffmpeg, st.hardware, st.encodersReady]),
      history: json([st.undo, st.redo]),
      selection: json(this.local),
    };
    for (const k of Object.keys(parts) as Array<keyof typeof parts>) {
      if (this.sig[k] !== parts[k] || (k === 'selection' && selChanged)) {
        this.sig[k] = parts[k];
        this.events.emit(k, st);
      }
    }
    this.events.emit('state', st);
  }
}
