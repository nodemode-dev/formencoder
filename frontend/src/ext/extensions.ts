import type { Ctx } from '../app/ctx';
import { api, LOCAL_HEADERS, RpcFailure, type ServerEvent } from '../engine/client';
import { Emitter } from '../engine/events';
import type { UiState } from '../engine/types';
import { confirmAction, Dialog } from '../ui/dialogs';
import type { Dock, Panel } from '../ui/dock';
import { el, escapeHtml, q, setText } from '../ui/dom';
import { pickFiles } from '../ui/file-dialog';
import type { PopupEntry } from '../ui/popup';
import { toast } from '../ui/toast';
import { VERSION } from '../version';
import { ERR, ExtensionHost, HostError, PERMISSION_WORDS, type ExtensionRecord, type Frame, type Permission, type Theme } from './host-bridge';

export interface Listing {
  product: string;
  app: string;
  appVersion: string;
  root: string;
  stamp: number[];
  manage: string;
  extensions: ExtensionRecord[];
}

export type RowState = 'ready' | 'needs-permission' | 'refused';

export interface ExtEvents {
  list: ExtensionRecord[];
  grants: void;
}

const POLL_MS = 2000;
const OPEN_LIMIT = 200 * 1024 * 1024;
const SOURCE_LABEL: Record<string, string> = { catalogue: 'Catalogue', sideload: 'File', development: 'Development' };
const TOKEN_MAP: Record<string, string> = {
  '--bg': '--bg-primary',
  '--panel': '--bg-secondary',
  '--surface': '--bg-tertiary',
  '--text': '--text-primary',
  '--muted': '--text-secondary',
  '--faint': '--text-muted',
  '--accent': '--accent-color',
  '--border': '--border-color',
  '--radius': '--radius',
  '--ok': '--ok',
  '--warn': '--warn',
  '--danger': '--danger',
  '--font-ui': '--font-ui',
  '--font-mono': '--font-mono',
};

export const sourceLabel = (s: string): string => SOURCE_LABEL[s] ?? s;
export const panelKey = (ext: ExtensionRecord, panel: string): string => `ext:${ext.id}:${panel}`;
const sig = (ext: ExtensionRecord): string => JSON.stringify(ext);

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function failure(e: unknown): HostError {
  if (e instanceof HostError) return e;
  return new HostError(ERR.REFUSED, e instanceof RpcFailure || e instanceof Error ? e.message : String(e));
}

const GATED: [string, Permission][] = [
  ['prefs.', 'native-code'],
  ['plugin.', 'native-code'],
  ['tools.', 'native-code'],
  ['lut.install', 'native-code'],
  ['openh264.', 'native-code'],
  ['shortcuts.', 'native-code'],
  ['model.', 'models'],
  ['family.', 'network'],
  ['watch.', 'files-write'],
  ['queue.setOutput', 'files-write'],
];

function carriesPublish(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(carriesPublish);
  if (!v || typeof v !== 'object') return false;
  return Object.entries(v).some(([k, x]) => (k === 'publish' && x != null && !(Array.isArray(x) && x.length === 0)) || carriesPublish(x));
}

function gate(ext: ExtensionRecord, command: string, args: unknown): void {
  const needs = GATED.filter(([p]) => (p.endsWith('.') ? command.startsWith(p) : command === p)).map(([, n]) => n);
  if (carriesPublish(args)) needs.push('network');
  const missing = needs.find((n) => !ext.permissions.includes(n));
  if (missing) throw new HostError(ERR.PERMISSION, `${ext.name} does not have the ${missing} permission needed for ${command}`);
}

class ExtPanel implements Panel {
  readonly el: HTMLElement;
  title: string;
  frame: Frame | null = null;
  private readonly host: HTMLElement;

  constructor(readonly id: string, public ext: ExtensionRecord, readonly panel: string, private readonly owner: Extensions) {
    this.title = owner.panelTitle(ext, panel);
    this.el = el('<div class="fe-ext-docked"><div class="fe-ext-frame-host"></div></div>');
    this.host = q(this.el, '.fe-ext-frame-host');
  }

  private turn = 0;

  shown(): void {
    if (!this.frame) void this.mount();
  }

  async mount(): Promise<void> {
    const turn = ++this.turn;
    this.frame?.dispose();
    this.frame = null;
    if (!(await this.owner.allow(this.ext)) || turn !== this.turn) return;
    const frame = await this.owner.host.open(this.ext, this.host);
    if (!frame) return;
    if (turn !== this.turn) {
      frame.dispose();
      return;
    }
    this.frame = frame;
    void frame.activate({ reason: 'panel', panel: this.panel }).catch(() => undefined);
  }

  retitle(title: string): void {
    this.title = title;
    const tab = this.owner.dockEl().querySelector(`.fx-tab[data-panel="${CSS.escape(this.id)}"]`);
    setText(tab, title);
  }

  dispose(): void {
    this.turn++;
    this.frame?.dispose();
    this.frame = null;
  }
}

export class Extensions {
  readonly events = new Emitter<ExtEvents>();
  readonly host: ExtensionHost;
  list: ExtensionRecord[] = [];
  root = '';
  manage = 'formai://extensions?product=formencoder';
  loaded = false;
  readonly ready: Promise<void>;
  private markReady: () => void = () => undefined;
  private stamp = '';
  private readonly sigs = new Map<string, string>();
  private readonly docked = new Map<string, ExtPanel>();
  private readonly dialogs = new Map<string, { dialog: Dialog; frame: Frame | null }>();
  private readonly hidden: HTMLElement;
  private themeSig = '';
  private readonly asking = new Map<string, Promise<boolean>>();

  constructor(private readonly ctx: Ctx, private readonly dock: Dock) {
    this.ready = new Promise((r) => (this.markReady = r));
    window.setTimeout(() => this.markReady(), 1200);
    this.hidden = el('<div class="fe-ext-hidden" aria-hidden="true"></div>');
    document.getElementById('overlay-root')?.appendChild(this.hidden);
    this.host = new ExtensionHost({
      product: 'formencoder',
      app: 'FormEncoder',
      appVersion: VERSION,
      theme: () => this.theme(),
      notify: (ext, message, level) => toast(`${ext.name}: ${message}`, level === 'error' || level === 'warning' ? 'error' : level === 'success' ? 'ok' : 'info'),
      setTitle: (ext, frame, title) => this.setTitle(ext, frame, title),
      readDocument: (_ext, p) => this.readDocument(p.what),
      applyDocument: (ext, label, ops) => this.applyDocument(ext, label, ops),
      commands: () => this.commands(),
      run: (ext, command, args) => this.runApp(ext, command, args),
      openFiles: (ext, accept, multiple) => this.openFiles(ext, accept, multiple),
      saveFile: (ext, name, type, data) => this.saveFile(ext, name, type, data),
      fetch: (_ext, req) => this.fetch(req),
      consent: (ext) => this.consent(ext),
    });
    void this.refresh(false);
    window.setInterval(() => {
      if (document.hasFocus()) void this.poll();
    }, POLL_MS);
    this.bindEvents();
    this.watchTheme();
  }

  dockEl(): HTMLElement {
    return this.dock.el;
  }

  state(ext: ExtensionRecord): RowState {
    if (ext.state === 'refused') return 'refused';
    return this.host.isGranted(ext) ? 'ready' : 'needs-permission';
  }

  panelTitle(ext: ExtensionRecord, panel: string): string {
    const p = ext.panels.find((x) => x.id === panel);
    return !p || p.title === ext.name ? ext.name : `${ext.name}: ${p.title}`;
  }

  private async poll(): Promise<void> {
    try {
      const r = await api<{ stamp: number[] }>('/api/extensions/stamp');
      if (JSON.stringify(r.stamp) !== this.stamp) await this.refresh(false);
    } catch {
      return;
    }
  }

  async refresh(force: boolean): Promise<void> {
    let r: Listing;
    try {
      r = await api<Listing>(`/api/extensions${force ? '?reload=1' : ''}`);
    } catch (e) {
      if (force) toast(`Extensions: ${(e as Error).message}`, 'error');
      this.markReady();
      return;
    }
    this.stamp = JSON.stringify(r.stamp);
    this.root = r.root;
    this.manage = r.manage;
    const next = new Map(r.extensions.map((x) => [x.id, x]));
    for (const old of this.list) {
      const now = next.get(old.id);
      if (!now) this.drop(old);
      else if (sig(now) !== this.sigs.get(old.id) || (force && now.source === 'development')) this.replace(old, now);
    }
    this.sigs.clear();
    for (const x of r.extensions) this.sigs.set(x.id, sig(x));
    this.list = r.extensions;
    for (const x of this.list) for (const p of x.panels) if (p.location !== 'dialog') this.registerPanel(x, p.id);
    this.loaded = true;
    this.markReady();
    this.events.emit('list', this.list);
    if (force) toast(`Extensions reloaded: ${this.list.length} found`, 'ok');
  }

  private registerPanel(ext: ExtensionRecord, panel: string): void {
    const id = panelKey(ext, panel);
    const have = this.docked.get(id);
    if (have) {
      have.ext = ext;
      return;
    }
    this.dock.register(id, this.panelTitle(ext, panel), () => {
      const p = new ExtPanel(id, this.find(ext.id) ?? ext, panel, this);
      this.docked.set(id, p);
      return p;
    });
  }

  private drop(ext: ExtensionRecord): void {
    this.host.disposeExtension(ext.id);
    for (const [id, p] of this.docked) {
      if (p.ext.id !== ext.id) continue;
      p.dispose();
      this.dock.close(id);
    }
    for (const [key, d] of this.dialogs) if (key.startsWith(`${ext.id}:`)) d.dialog.close();
  }

  private replace(old: ExtensionRecord, now: ExtensionRecord): void {
    const panels = new Set(now.state === 'ready' ? now.panels.filter((p) => p.location !== 'dialog').map((p) => p.id) : []);
    for (const [id, p] of this.docked) {
      if (p.ext.id !== old.id) continue;
      p.ext = now;
      if (!panels.has(p.panel)) {
        p.dispose();
        this.dock.close(id);
        continue;
      }
      p.retitle(this.panelTitle(now, p.panel));
      if (p.frame) void p.mount();
    }
    for (const [key, d] of this.dialogs) if (key.startsWith(`${old.id}:`)) d.dialog.close();
  }

  find(id: string): ExtensionRecord | undefined {
    return this.list.find((x) => x.id === id);
  }

  async allow(ext: ExtensionRecord): Promise<boolean> {
    if (this.host.isGranted(ext)) return true;
    const key = `${ext.id}@${ext.version}`;
    let asking = this.asking.get(key);
    if (!asking) {
      asking = this.host.ensureConsent(ext).finally(() => this.asking.delete(key));
      this.asking.set(key, asking);
    }
    const ok = await asking;
    this.events.emit('grants', undefined);
    return ok;
  }

  forget(ext: ExtensionRecord): void {
    this.host.revoke(ext);
    for (const [id, p] of this.docked) {
      if (p.ext.id !== ext.id) continue;
      p.dispose();
      this.dock.close(id);
    }
    for (const [key, d] of this.dialogs) if (key.startsWith(`${ext.id}:`)) d.dialog.close();
    this.events.emit('grants', undefined);
  }

  async openPanel(ext: ExtensionRecord, panel: string): Promise<void> {
    const def = ext.panels.find((p) => p.id === panel);
    if (!def || ext.state !== 'ready') return;
    if (!(await this.allow(ext))) return;
    if (def.location === 'dialog') return this.openDialog(ext, panel);
    const id = panelKey(ext, panel);
    this.dock.show(id);
  }

  private async openDialog(ext: ExtensionRecord, panel: string, activation?: { command: string; args: unknown }): Promise<void> {
    if (!(await this.allow(ext))) return;
    const key = `${ext.id}:${panel}`;
    let entry = this.dialogs.get(key);
    if (!entry) {
      const dialog = new Dialog(this.panelTitle(ext, panel), 560);
      dialog.scrim.dataset.automationId = `extension.dialog.${ext.id}.${panel}`;
      const hostEl = el('<div class="fe-ext-dialog-frame"></div>');
      dialog.body.appendChild(hostEl);
      const made: { dialog: Dialog; frame: Frame | null } = { dialog, frame: null };
      dialog.onClose = () => {
        made.frame?.dispose();
        made.frame = null;
        this.dialogs.delete(key);
        dialog.scrim.remove();
      };
      this.dialogs.set(key, made);
      entry = made;
      dialog.open();
      const frame = await this.host.open(ext, hostEl, { onResize: (h) => hostEl.style.setProperty('--fe-ext-h', `${Math.max(120, Math.min(h, window.innerHeight - 200))}px`) });
      if (!frame) {
        dialog.close();
        return;
      }
      if (this.dialogs.get(key) !== made) {
        frame.dispose();
        return;
      }
      made.frame = frame;
      void frame.activate({ reason: 'panel', panel }).catch(() => undefined);
    }
    if (activation) void entry.frame?.activate({ reason: 'command', command: activation.command, args: activation.args }).catch(() => undefined);
  }

  async runCommand(ext: ExtensionRecord, command: string, args: unknown = {}): Promise<unknown> {
    const def = ext.commands.find((c) => c.id === command);
    if (!def) throw new HostError(ERR.NOT_FOUND, `${ext.name} has no command ${command}`);
    if (ext.state !== 'ready') throw new HostError(ERR.REFUSED, `${ext.name} is refused: ${ext.reason ?? ''}`);
    if (!(await this.allow(ext))) throw new HostError(ERR.PERMISSION, `${ext.name} was not allowed to run`);
    if (!def.panel) return this.host.runCommand(ext, command, args, this.hidden);
    const panel = ext.panels.find((p) => p.id === def.panel);
    if (!panel) throw new HostError(ERR.NOT_FOUND, `${ext.name} has no panel ${def.panel}`);
    if (panel.location === 'dialog') {
      await this.openDialog(ext, panel.id, { command, args });
      return { opened: panel.id };
    }
    const id = panelKey(ext, panel.id);
    this.dock.show(id);
    const p = this.docked.get(id);
    if (!p) return { opened: panel.id };
    if (!p.frame) await p.mount();
    return p.frame?.activate({ reason: 'command', command, args });
  }

  async runFromMenu(ext: ExtensionRecord, command: string): Promise<void> {
    const def = ext.commands.find((c) => c.id === command);
    try {
      await this.runCommand(ext, command, {});
      if (def && !def.panel) toast(`${ext.name}: ${def.title} finished`, 'ok');
    } catch (e) {
      const err = failure(e);
      if (err.code !== ERR.CANCELLED && err.code !== ERR.PERMISSION) toast(`${ext.name}: ${err.message}`, 'error');
    }
  }

  menuEntries(): PopupEntry[] {
    const out: PopupEntry[] = [];
    for (const ext of this.list) {
      if (ext.state !== 'ready') continue;
      for (const c of ext.commands) out.push({ label: `${ext.name}: ${c.title}`, id: `menu.ext.${ext.id}.${c.id}`, run: () => void this.runFromMenu(ext, c.id) });
    }
    if (out.length) out.push('-');
    out.push({ label: 'Extensions Panel', id: 'menu.ext.panel', run: () => this.dock.show('extensions') });
    out.push({ label: 'Reload Extensions', id: 'menu.ext.reload', run: () => void this.refresh(true) });
    out.push({ label: 'Manage in FormPortal', id: 'menu.ext.manage', run: () => this.openManage() });
    return out;
  }

  paletteEntries(): Array<{ id: string; label: string; path: string; keys: string; kind: 'command'; run: () => void }> {
    const out: Array<{ id: string; label: string; path: string; keys: string; kind: 'command'; run: () => void }> = [];
    for (const ext of this.list) {
      if (ext.state !== 'ready') continue;
      for (const c of ext.commands) out.push({ id: `ext.${ext.id}.${c.id}`, label: `${ext.name}: ${c.title}`, path: 'Extensions', keys: '', kind: 'command', run: () => void this.runFromMenu(ext, c.id) });
    }
    out.push({ id: 'ext.reload', label: 'Reload Extensions', path: 'Extensions', keys: '', kind: 'command', run: () => void this.refresh(true) });
    return out;
  }

  openManage(): void {
    window.open(this.manage, '_blank', 'noopener');
  }

  private theme(): Theme {
    const style = getComputedStyle(document.documentElement);
    const tokens: Record<string, string> = {};
    for (const [k, v] of Object.entries(TOKEN_MAP)) {
      const value = style.getPropertyValue(v).trim();
      if (value) tokens[k] = value;
    }
    return { mode: document.body.classList.contains('theme-light') ? 'light' : 'dark', tokens };
  }

  private watchTheme(): void {
    let queued = false;
    const check = (): void => {
      queued = false;
      const t = this.theme();
      const s = JSON.stringify(t);
      if (s === this.themeSig) return;
      this.themeSig = s;
      this.host.setTheme(t);
    };
    this.themeSig = JSON.stringify(this.theme());
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(check);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  private bindEvents(): void {
    const changed = (st: UiState): void => this.host.broadcast('document.changed', { revision: st.revision, counts: st.counts });
    this.ctx.store.events.on('items', changed);
    this.ctx.store.events.on('watch', changed);
    this.ctx.store.events.on('selection', () => this.host.broadcast('selection.changed', this.ctx.store.selection()));
    this.ctx.client.events.on('finished', (ev) => this.host.broadcast('encode.finished', { output: ev.output ?? null, status: ev.status ?? null, path: ev.path ?? null, error: ev.error ?? null }));
    this.ctx.client.events.on('event', (ev) => {
      if (ev.type === 'extensions') void this.answerAgent(ev);
    });
  }

  private async answerAgent(ev: ServerEvent): Promise<void> {
    const rid = ev.requestId;
    if (ev.action === 'list') {
      if (!this.loaded) await this.ready;
      this.ctx.client.reply(rid, { extensions: this.list.map((x) => ({ id: x.id, state: this.state(x) })) });
      return;
    }
    if (ev.action !== 'run') return;
    const ext = this.find(String(ev.id ?? ''));
    if (!ext) {
      this.ctx.client.reply(rid, { ok: false, code: ERR.NOT_FOUND, message: `no extension ${String(ev.id)} in this window` });
      return;
    }
    try {
      const result = await this.runCommand(ext, String(ev.command ?? ''), ev.args ?? {});
      this.ctx.client.reply(rid, { ok: true, result: result ?? null });
    } catch (e) {
      const err = failure(e);
      this.ctx.client.reply(rid, { ok: false, code: err.code, message: err.message });
    }
  }

  private setTitle(ext: ExtensionRecord, frame: HTMLIFrameElement, title: string): void {
    const text = title ? `${ext.name}: ${title}` : ext.name;
    for (const p of this.docked.values()) if (p.frame?.frame === frame) p.retitle(text);
    for (const d of this.dialogs.values()) if (d.frame?.frame === frame) d.dialog.setTitle(text);
  }

  private consent(ext: ExtensionRecord): Promise<boolean> {
    return new Promise((resolve) => {
      const d = new Dialog(`Allow ${ext.name}?`, 460);
      d.scrim.dataset.automationId = 'extension.consent';
      const from = ext.source === 'development' ? `a development folder${ext.path ? ` (${ext.path})` : ''}` : ext.source === 'sideload' ? 'a package file added in FormPortal' : "FormPortal's catalogue";
      d.body.appendChild(el(`<p class="fx-note"><strong>${escapeHtml(ext.name)}</strong> ${escapeHtml(ext.version)}, from ${escapeHtml(from)}, asks to:</p>`));
      d.body.appendChild(el(`<ul class="fe-ext-perms">${ext.permissions.map((p) => `<li>${escapeHtml(PERMISSION_WORDS[p] ?? p)}</li>`).join('')}</ul>`));
      d.body.appendChild(el('<p class="cv-note">It runs in a sandbox and can only use FormEncoder\'s own commands. You can forget this choice in the Extensions panel.</p>'));
      let done = false;
      const answer = (ok: boolean): void => {
        if (done) return;
        done = true;
        d.close();
        d.scrim.remove();
        resolve(ok);
      };
      d.onClose = () => answer(false);
      d.button('Not Now', 'ghost', () => answer(false));
      d.button('Allow', 'primary', () => answer(true));
      d.open();
    });
  }

  private async readDocument(what: string | undefined): Promise<unknown> {
    const w = what ?? 'queue';
    try {
      if (w === 'queue') {
        const st = await this.ctx.client.call<UiState>('ui.state');
        return { what: 'queue', revision: st.revision, running: st.running, paused: st.paused, counts: st.counts, selection: this.ctx.store.selection(), undo: st.undo, redo: st.redo, items: st.items };
      }
      if (w === 'selection') {
        const st = await this.ctx.client.call<UiState>('ui.state');
        const sel = this.ctx.store.selection();
        const ids = sel.outputs.length ? sel.outputs : st.items.filter((i) => sel.items.includes(i.id)).flatMap((i) => i.outputs.map((o) => o.id));
        const outputs = await Promise.all(ids.slice(0, 50).map((id) => this.ctx.client.exec('queue.getSettings', { output: id })));
        return { what: 'selection', outputs };
      }
      if (w === 'watch') {
        const st = await this.ctx.client.call<UiState>('ui.state');
        return { what: 'watch', autoEncodeWatch: st.autoEncodeWatch, watch: st.watch };
      }
      if (w === 'presets') return { what: 'presets', ...(await this.ctx.client.exec<Record<string, unknown>>('preset.list', {})) };
      if (w === 'formats') return { what: 'formats', ...(await this.ctx.client.exec<Record<string, unknown>>('format.list', {})) };
      if (w === 'history') return { what: 'history', ...(await this.ctx.client.exec<Record<string, unknown>>('history.list', {})) };
    } catch (e) {
      throw failure(e);
    }
    throw new HostError(ERR.INVALID, 'document.read takes what: queue, selection, watch, presets, formats or history');
  }

  private async applyDocument(ext: ExtensionRecord, label: string, ops: { command: string; args?: unknown }[]): Promise<{ applied: number; results: unknown[] }> {
    if (!ops.length) return { applied: 0, results: [] };
    for (const o of ops) gate(ext, o.command, o.args);
    try {
      const r = await this.ctx.client.call<{ results: unknown[] }>('command.batch', { label: label.slice(0, 120), atomic: true, steps: ops.map((o) => ({ command: o.command, params: o.args ?? {} })) });
      return { applied: r.results.length, results: r.results };
    } catch (e) {
      throw failure(e);
    }
  }

  private commands(): unknown[] {
    return [...this.ctx.specs.values()].map((s) => ({ id: s.id, title: s.label.replace(/\.\.\.$/, ''), args: s.schema ?? { type: 'object', properties: {} }, query: s.query, undoable: s.undoable }));
  }

  private async runApp(ext: ExtensionRecord, command: string, args: unknown): Promise<unknown> {
    gate(ext, command, args);
    try {
      return await this.ctx.client.exec(command, (args && typeof args === 'object' ? args : {}) as Record<string, unknown>);
    } catch (e) {
      throw failure(e);
    }
  }

  private async openFiles(ext: ExtensionRecord, accept: string[], multiple: boolean): Promise<{ name: string; type: string; size: number; data: string }[]> {
    const exts = accept.map((a) => a.replace(/^\./, '').toLowerCase()).filter((a) => /^[a-z0-9]+$/.test(a));
    const paths = await pickFiles({ title: `${ext.name}: Open`, mode: 'open', multiple, extensions: exts.length ? exts : undefined });
    if (!paths || !paths.length) throw new HostError(ERR.CANCELLED, 'no file was chosen');
    const out: { name: string; type: string; size: number; data: string }[] = [];
    let total = 0;
    for (const path of paths) {
      const res = await fetch(`/api/fs/file?path=${encodeURIComponent(path)}`, { headers: LOCAL_HEADERS });
      if (!res.ok) throw new HostError(ERR.REFUSED, `${path} could not be read`);
      const buf = await res.arrayBuffer();
      total += buf.byteLength;
      if (total > OPEN_LIMIT) throw new HostError(ERR.REFUSED, 'the chosen files are larger than 200 MB together');
      out.push({ name: path.split(/[\\/]/).pop() ?? path, type: res.headers.get('content-type') ?? 'application/octet-stream', size: buf.byteLength, data: toBase64(buf) });
    }
    return out;
  }

  private async saveFile(ext: ExtensionRecord, name: string, _type: string, data: string): Promise<{ saved: boolean; name: string }> {
    const safe = name.split(/[\\/]/).pop() || 'file';
    const dot = safe.lastIndexOf('.');
    const suffix = dot > 0 ? safe.slice(dot + 1).toLowerCase() : '';
    const paths = await pickFiles({ title: `${ext.name}: Save`, mode: 'save', defaultName: safe, extensions: /^[a-z0-9]+$/.test(suffix) ? [suffix] : undefined });
    if (!paths || !paths.length) throw new HostError(ERR.CANCELLED, 'no place was chosen');
    const path = paths[0];
    const post = (overwrite: boolean): Promise<Response> => fetch('/api/extensions/save', { method: 'POST', headers: { ...LOCAL_HEADERS, 'content-type': 'application/json' }, body: JSON.stringify({ path, data, overwrite }) });
    let res = await post('__TAURI_INTERNALS__' in window);
    if (res.status === 409) {
      const shown = path.split(/[\\/]/).pop() ?? path;
      if (!(await confirmAction('Replace File', `${shown} is there already. Replace it with the file from ${ext.name}?`, 'Replace', true))) throw new HostError(ERR.CANCELLED, 'the file was not replaced');
      res = await post(true);
    }
    if (!res.ok) throw new HostError(ERR.REFUSED, await res.text());
    const r = (await res.json()) as { name: string };
    return { saved: true, name: r.name };
  }

  private async fetch(req: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const res = await fetch('/api/extensions/fetch', { method: 'POST', headers: { ...LOCAL_HEADERS, 'content-type': 'application/json' }, body: JSON.stringify(req) });
    if (!res.ok) {
      let message = await res.text();
      try {
        message = (JSON.parse(message) as { detail?: string }).detail ?? message;
      } catch {
        message = message || `HTTP ${res.status}`;
      }
      throw new HostError(res.status === 400 ? ERR.INVALID : ERR.REFUSED, message);
    }
    return res.json();
  }
}
