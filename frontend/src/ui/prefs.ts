import type { Ctx } from '../app/ctx';
import type { FieldSpec } from '../engine/types';
import { formats } from './choosers';
import { Dialog } from './dialogs';
import { el, q, setChecked, setClass, setText } from './dom';
import { fieldControl, type FieldControl } from './fields';
import { readChoice, setAccent, setIntensity, setTheme, THEMES } from './themes';
import { toast } from './toast';

interface ToolRow {
  id: string;
  label: string;
  version: string;
  licence: string;
  usedFor: string;
  installed: boolean;
  download?: boolean;
  enabled?: boolean;
  attribution?: string;
  programs: Array<{ program: string; path: string | null }>;
}

interface ModelRow {
  id: string;
  label: string;
  installed: boolean;
}

interface Page {
  id: string;
  label: string;
  fields: Array<[string, FieldSpec['type'], Partial<FieldSpec>?]>;
}

const PAGES: Page[] = [
  { id: 'general', label: 'General', fields: [['parallel', 'bool'], ['maxParallel', 'int', { min: 1, max: 16 }], ['autoStartIdle', 'bool'], ['autoStartMinutes', 'number', { min: 0.5, max: 600, step: 0.5, unit: 'min' }], ['defaultPreset', 'select'], ['stillDuration', 'number', { min: 0.1, max: 3600, step: 0.5, unit: 's' }], ['skipMissing', 'bool'], ['stopOnDecodeErrors', 'bool'], ['removeCompletedOnExit', 'bool']] },
  { id: 'output', label: 'Output', fields: [['outputFolder', 'path'], ['outputBesideSource', 'bool'], ['incrementNames', 'bool']] },
  { id: 'watch', label: 'Watch Folders', fields: [['autoEncodeWatch', 'bool'], ['watchInterval', 'number', { min: 0.5, max: 600, step: 0.5, unit: 's' }], ['watchSettle', 'number', { min: 0, max: 600, step: 0.5, unit: 's' }], ['watchSequences', 'bool'], ['watchSequenceWait', 'number', { min: 0, max: 600, step: 0.5, unit: 's' }]] },
  { id: 'notify', label: 'Notifications', fields: [['chime', 'bool'], ['notify', 'select', { options: [['item', 'After each item'], ['queue', 'When the queue finishes'], ['never', 'Never']] }], ['previewWhileEncoding', 'bool']] },
  { id: 'media', label: 'Media and Hardware', fields: [['ffmpegDir', 'path'], ['hardware', 'select', { options: [['auto', 'Hardware encoding when available'], ['on', 'Hardware encoding'], ['off', 'Software encoding']] }], ['threads', 'int', { min: 0, max: 256 }]] },
  { id: 'cache', label: 'Memory and Cache', fields: [['memoryReserveGB', 'number', { min: 0, max: 512, step: 0.5, unit: 'GB' }], ['hwDecode', 'select', { options: [['off', 'Decode on the CPU'], ['auto', 'Decode on the GPU when it can']] }], ['cacheFolder', 'path'], ['cacheLimitGB', 'number', { min: 0, max: 4096, step: 1, unit: 'GB' }]] },
  { id: 'tools', label: 'Delivery Tools', fields: [] },
  { id: 'logs', label: 'Logs', fields: [['logFolder', 'path']] },
  { id: 'appearance', label: 'Appearance', fields: [] },
];

export class Preferences {
  private dialog: Dialog | null = null;
  private controls = new Map<string, FieldControl>();

  constructor(private readonly ctx: Ctx) {
    ctx.client.events.on('toolFetch', (ev) => {
      const tool = String(ev.tool ?? '');
      const sel = tool.startsWith('model:') ? `.fe-model[data-model="${tool.slice(6)}"]` : `.fe-tool[data-tool="${tool}"]`;
      const row = this.dialog?.body.querySelector<HTMLElement>(sel);
      if (row) setText(q(row, '.fe-tool-state'), `${Math.round(Number(ev.progress) * 100)}%`);
    });
  }

  async open(page = 'general'): Promise<void> {
    const r = await this.ctx.run<{ prefs: Record<string, unknown>; describe: Record<string, string>; dataDir: string }>('prefs.get', {});
    if (!r) return;
    if (!this.dialog) await this.build(r.describe);
    for (const [k, c] of this.controls) c.set(r.prefs[k]);
    setText(q(this.dialog!.body, '.fe-prefs-data'), `Data folder: ${r.dataDir}`);
    this.show(page);
    void this.hardware();
    void this.cacheInfo();
    void this.tools();
    this.dialog!.open();
  }

  private async build(describe: Record<string, string>): Promise<void> {
    const d = new Dialog('Preferences', 820);
    this.dialog = d;
    const body = el(`<div class="fx-prefs"><nav class="fx-prefs-nav"></nav><div class="fe-prefs-panes"></div></div>`);
    d.body.appendChild(body);
    const nav = q(body, '.fx-prefs-nav');
    const panes = q(body, '.fe-prefs-panes');
    const presets = (await this.ctx.presets().catch(() => [])).filter((p) => p.kind === 'encode');
    for (const pg of PAGES) {
      const tab = el<HTMLButtonElement>(`<button class="fx-prefs-tab" type="button"></button>`);
      tab.textContent = pg.label;
      tab.dataset.page = pg.id;
      tab.addEventListener('click', () => this.show(pg.id));
      nav.appendChild(tab);
      const pane = el(`<div class="fx-prefs-pane" data-page="${pg.id}" hidden></div>`);
      for (const [key, type, extra] of pg.fields) {
        const spec: FieldSpec = { key, label: describe[key] ?? key, type, ...(extra ?? {}) };
        if (key === 'defaultPreset') spec.options = presets.map((p) => [p.id, `${p.category} · ${p.name}`]);
        const c = fieldControl(spec, (k, v) => void this.save(k, v));
        c.row.classList.add('fe-prefs-row');
        this.controls.set(key, c);
        pane.appendChild(c.row);
      }
      if (pg.id === 'media') pane.appendChild(el('<div class="fe-prefs-hw fx-note"></div>'));
      if (pg.id === 'cache') {
        const row = el(`<div class="fe-prefs-cache"><span class="fx-note fe-prefs-cacheinfo"></span><span class="fx-flex"></span><button class="cv-btn" type="button">Clean Cache</button></div>`);
        q(row, 'button').addEventListener('click', async () => {
          const r = await this.ctx.run<{ freed: number }>('prefs.cleanCache', { all: true });
          if (r) toast(`Freed ${(r.freed / 1024 / 1024).toFixed(1)} MB`, 'ok');
          void this.cacheInfo();
        });
        pane.appendChild(row);
      }
      if (pg.id === 'tools') await this.toolRows(pane);
      if (pg.id === 'appearance') this.appearance(pane);
      if (pg.id === 'general') pane.appendChild(el('<p class="fx-prefs-note fe-prefs-data"></p>'));
      panes.appendChild(pane);
    }
    const reset = d.button('Reset All', 'ghost', async () => {
      await this.ctx.run('prefs.reset');
      d.close();
      void this.open();
    });
    reset.classList.add('cv-btn-apart');
    d.button('Done', 'primary', () => d.close());
  }

  private async cacheInfo(): Promise<void> {
    const r = await this.ctx.run<{ folder: string; bytes: number; files: number; availableMemory: number | null }>('prefs.cacheInfo', {});
    const node = this.dialog?.body.querySelector<HTMLElement>('.fe-prefs-cacheinfo');
    if (!r || !node) return;
    const mem = r.availableMemory ? ` · ${(r.availableMemory / 1024 ** 3).toFixed(1)} GB memory free now` : '';
    setText(node, `${(r.bytes / 1024 ** 2).toFixed(1)} MB in ${r.files} files at ${r.folder}${mem}`);
  }

  private async toolRows(pane: HTMLElement): Promise<void> {
    const r = await this.ctx.run<{ tools: ToolRow[]; vendorRaw: Array<{ label: string; found: string | null }>; rawDecoders: unknown[] }>('tools.list', {}, true);
    pane.appendChild(el('<p class="fx-prefs-note">Separate programs formencoder runs for packaged deliverables and software encoding. They are built from pinned sources with ./formencoder install-tools, or bundled with the desktop app; OpenH264 is downloaded from Cisco on request and is never bundled.</p>'));
    for (const t of r?.tools ?? []) {
      const row = el(`<div class="fe-tool" data-tool="${t.id}"><div class="fe-tool-head"><span class="fe-tool-name"></span><span class="fe-tool-state"></span></div><div class="fx-note fe-tool-use"></div><div class="fx-note fe-tool-path"></div></div>`);
      setText(q(row, '.fe-tool-name'), `${t.label} ${t.version} · ${t.licence}`);
      setText(q(row, '.fe-tool-use'), t.usedFor);
      if (t.attribution) {
        // Cisco's terms: the user can turn the downloaded binary's use off and on, with the attribution where it is controlled.
        const sw = el('<label class="fe-tool-switch"><input type="checkbox" class="fx-check"><span></span></label>');
        setText(q(sw, 'span'), `Use ${t.label}`);
        const c = q<HTMLInputElement>(sw, 'input');
        c.addEventListener('change', async () => {
          const r = await this.ctx.run<{ prefs: Record<string, unknown> }>('prefs.set', { values: { [t.id]: c.checked } });
          if (r) setChecked(c, r.prefs[t.id] !== false);
          void this.tools();
        });
        const note = el('<div class="fx-note fe-tool-attr"></div>');
        setText(note, t.attribution);
        q(row, '.fe-tool-use').after(sw, note);
      }
      if (t.download) {
        const b = el<HTMLButtonElement>('<button class="cv-btn fe-tool-get" type="button">Download from Cisco</button>');
        b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            await this.ctx.client.call('openh264.fetch');
          } catch (e) {
            toast((e as Error).message, 'error');
          }
          b.disabled = false;
          void this.tools();
        });
        q(row, '.fe-tool-head').appendChild(b);
      }
      pane.appendChild(row);
    }
    this.paintTools(r?.tools ?? [], pane);
    const m = await this.ctx.run<{ models: ModelRow[]; folder: string }>('captions.models', {}, true);
    pane.appendChild(el('<div class="fx-prefs-section">Speech Models (whisper.cpp)</div>'));
    for (const md of m?.models ?? []) {
      const row = el(`<div class="fe-tool fe-model" data-model="${md.id}"><div class="fe-tool-head"><span class="fe-tool-name"></span><span class="fe-tool-state"></span><button class="cv-btn fe-tool-get" type="button">Download</button></div></div>`);
      setText(q(row, '.fe-tool-name'), md.label);
      const b = q<HTMLButtonElement>(row, 'button');
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await this.ctx.client.call('model.fetch', { model: md.id });
        } catch (e) {
          toast((e as Error).message, 'error');
        }
        b.disabled = false;
        void this.tools();
      });
      pane.appendChild(row);
    }
    this.paintModels(m?.models ?? [], pane);
    pane.appendChild(el('<div class="fx-prefs-section">Camera Raw Decoders</div>'));
    const vendor = el('<p class="fx-prefs-note fe-raw-vendor"></p>');
    setText(vendor, `CinemaDNG decodes in formencoder. R3D, ARRIRAW, X-OCN, Canon RAW and Blackmagic RAW go through the camera maker's own tool, which formencoder runs when a source's extension is listed here. Found: ${(r?.vendorRaw ?? []).map((v) => `${v.label} ${v.found ? 'yes' : 'no'}`).join(' · ')}.`);
    pane.appendChild(vendor);
    const area = el<HTMLTextAreaElement>('<textarea class="cv-input fe-raw-json" spellcheck="false" rows="6"></textarea>');
    area.placeholder = '[{"extensions": "r3d", "command": "REDline --i {input} --outDir {folder} --o {name} ...", "output": "{folder}/{name}_%06d.exr", "frameRate": 24}]';
    area.value = JSON.stringify(r?.rawDecoders ?? [], null, 2);
    const save = el<HTMLButtonElement>('<button class="cv-btn" type="button">Save Decoders</button>');
    save.addEventListener('click', async () => {
      let list: unknown;
      try {
        list = JSON.parse(area.value || '[]');
      } catch (e) {
        toast(`Not valid JSON: ${(e as Error).message}`, 'error');
        return;
      }
      const ok = await this.ctx.run('prefs.set', { values: { rawDecoders: list } });
      if (ok) toast('Raw decoders saved', 'ok');
    });
    const row = el('<div class="fe-raw-row"></div>');
    row.append(area, save);
    pane.appendChild(row);
  }

  private paintModels(rows: ModelRow[], root?: HTMLElement): void {
    const body = root ?? this.dialog?.body;
    if (!body) return;
    for (const md of rows) {
      const row = body.querySelector<HTMLElement>(`.fe-model[data-model="${md.id}"]`);
      if (!row) continue;
      setText(q(row, '.fe-tool-state'), md.installed ? 'Downloaded' : 'Not downloaded');
      setClass(row, 'is-installed', md.installed);
      setText(q(row, 'button'), md.installed ? 'Download Again' : 'Download');
    }
  }

  private async tools(): Promise<void> {
    const r = await this.ctx.run<{ tools: ToolRow[] }>('tools.list', {}, true);
    if (r) this.paintTools(r.tools);
    const m = await this.ctx.run<{ models: ModelRow[] }>('captions.models', {}, true);
    if (m) this.paintModels(m.models);
  }

  private paintTools(rows: ToolRow[], root?: HTMLElement): void {
    const body = root ?? this.dialog?.body;
    if (!body) return;
    for (const t of rows) {
      const row = body.querySelector<HTMLElement>(`.fe-tool[data-tool="${t.id}"]`);
      if (!row) continue;
      setText(q(row, '.fe-tool-state'), t.installed ? 'Installed' : t.download ? 'Not downloaded' : `Not installed: ./formencoder install-tools ${t.id}`);
      setClass(row, 'is-installed', t.installed);
      const use = row.querySelector<HTMLInputElement>('.fe-tool-switch input');
      if (use) setChecked(use, t.enabled !== false);
      const found = t.programs.map((p) => p.path).filter(Boolean).join(' · ');
      setText(q(row, '.fe-tool-path'), found || ' ');
      const get = row.querySelector<HTMLButtonElement>('.fe-tool-get');
      if (get) get.textContent = t.installed ? 'Download Again' : 'Download from Cisco';
    }
  }

  private appearance(pane: HTMLElement): void {
    const choice = readChoice();
    pane.appendChild(el('<div class="fx-prefs-section">Theme</div>'));
    const grid = el('<div class="fx-prefs-themes"></div>');
    for (const [id, th] of Object.entries(THEMES)) {
      const b = el<HTMLButtonElement>(`<button class="fx-theme-chip" type="button"><span class="fx-theme-sw"></span><span></span></button>`);
      (b.children[0] as HTMLElement).style.background = th.vars['--bg-secondary'];
      b.children[1].textContent = th.label;
      b.dataset.theme = id;
      setClass(b, 'is-active', choice.theme === id);
      b.addEventListener('click', () => {
        setTheme(id);
        for (const x of Array.from(grid.children)) setClass(x, 'is-active', (x as HTMLElement).dataset.theme === id);
      });
      grid.appendChild(b);
    }
    pane.appendChild(grid);
    const accent = el<HTMLInputElement>('<input type="color" class="fx-color">');
    accent.value = choice.accentColor;
    accent.addEventListener('input', () => setAccent(accent.value));
    const row1 = el('<div class="fe-field fe-prefs-row"><span class="fe-field-label">Accent colour</span><span class="fe-field-ctl"></span></div>');
    q(row1, '.fe-field-ctl').appendChild(accent);
    const inten = el<HTMLInputElement>('<input type="range" class="fe-range" min="0" max="1.5" step="0.05">');
    inten.value = String(choice.intensity ?? 1);
    inten.addEventListener('input', () => setIntensity(Number(inten.value)));
    const row2 = el('<div class="fe-field fe-prefs-row"><span class="fe-field-label">Accent strength</span><span class="fe-field-ctl"></span></div>');
    q(row2, '.fe-field-ctl').appendChild(inten);
    pane.append(row1, row2);
  }

  private show(page: string): void {
    if (!this.dialog) return;
    for (const t of Array.from(this.dialog.body.querySelectorAll<HTMLElement>('.fx-prefs-tab'))) setClass(t, 'is-active', t.dataset.page === page);
    for (const p of Array.from(this.dialog.body.querySelectorAll<HTMLElement>('.fx-prefs-pane'))) p.hidden = p.dataset.page !== page;
  }

  private async save(key: string, value: unknown): Promise<void> {
    const r = await this.ctx.run<{ prefs: Record<string, unknown> }>('prefs.set', { values: { [key]: value } });
    if (!r) return;
    this.controls.get(key)?.set(r.prefs[key]);
    if (key === 'ffmpegDir') {
      toast('FFmpeg location changed; encoders checked again', 'ok');
      void this.hardware();
    }
  }

  private async hardware(): Promise<void> {
    const box = this.dialog?.body.querySelector<HTMLElement>('.fe-prefs-hw');
    if (!box) return;
    const r = await this.ctx.run<{ ffmpeg: { path?: string; version?: string; licence?: string; origin?: string }; hardware: string[] }>('format.encoders', {}, true);
    if (!r) return;
    const fmts = await formats(this.ctx).catch(() => []);
    setText(box, `FFmpeg ${r.ffmpeg?.version ?? 'not found'} (${r.ffmpeg?.licence ?? '?'}) from ${r.ffmpeg?.origin ?? '?'}: ${r.ffmpeg?.path ?? ''}. Hardware encoders: ${r.hardware?.length ? r.hardware.join(', ') : 'none found'}. ${fmts.length} formats.`);
  }
}
