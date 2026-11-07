import { blankMedia, type Media } from './model';

export type Topic = 'items' | 'slots' | 'frame' | 'marks' | 'view' | 'log' | 'work';
type Listener = () => void;

export type View = 'a' | 'b' | 'compare';
export type Zoom = 'fit' | 'actual';

class Store {
  items: Media[] = [];
  slotA = '';
  slotB = '';
  view: View = 'compare';
  zoom: Zoom = 'fit';
  frame = 0;
  markIn: number | null = null;
  markOut: number | null = null;
  working = '';
  logs: Array<{ time: string; text: string; error: boolean }> = [];
  private readonly listeners = new Map<Topic, Set<Listener>>();
  private seq = 0;

  on(topic: Topic, fn: Listener): void {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic)?.add(fn);
  }

  emit(topic: Topic): void {
    for (const fn of this.listeners.get(topic) ?? []) fn();
  }

  log(text: string, error = false): void {
    const d = new Date();
    const time = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
    this.logs.push({ time, text, error });
    if (this.logs.length > 400) this.logs.shift();
    this.emit('log');
  }

  nextId(): string {
    this.seq += 1;
    return `m${this.seq}`;
  }

  get(id: string): Media | undefined {
    return this.items.find((m) => m.id === id);
  }

  a(): Media | undefined {
    return this.get(this.slotA);
  }

  b(): Media | undefined {
    return this.get(this.slotB);
  }

  master(): Media | undefined {
    const a = this.a();
    return a && a.fps > 0 ? a : this.b();
  }

  sources(): Media[] {
    return this.items.filter((m) => m.role === 'source');
  }

  outputs(): Media[] {
    return this.items.filter((m) => m.role !== 'source');
  }

  add(m: Media): Media {
    this.items.push(m);
    this.emit('items');
    return m;
  }

  make(name: string, role: Media['role'], form: Media['form']): Media {
    return blankMedia(this.nextId(), name, role, form);
  }

  setSlots(a: string, b: string): void {
    if (a === this.slotA && b === this.slotB) return;
    this.slotA = a;
    this.slotB = b;
    this.emit('slots');
  }

  setView(v: View): void {
    if (v === this.view) return;
    this.view = v;
    this.emit('view');
  }

  setZoom(z: Zoom): void {
    if (z === this.zoom) return;
    this.zoom = z;
    this.emit('view');
  }

  setFrame(n: number): void {
    const m = this.master();
    const last = m ? Math.max(0, m.frames - 1) : 0;
    const f = Math.max(0, Math.min(last, Math.round(n)));
    if (f === this.frame) return;
    this.frame = f;
    this.emit('frame');
  }

  setMarks(a: number | null, b: number | null): void {
    this.markIn = a;
    this.markOut = b;
    this.emit('marks');
  }
}

export const store = new Store();
