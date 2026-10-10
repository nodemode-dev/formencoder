import type { Ctx } from '../app/ctx';
import type { FieldSpec } from '../engine/types';
import { formats } from './choosers';
import { Dialog } from './dialogs';
import { el, q, setClass, setText } from './dom';
import { fieldControl, type FieldControl } from './fields';
import { readChoice, setAccent, setIntensity, setTheme, THEMES } from './themes';
import { toast } from './toast';

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
  { id: 'logs', label: 'Logs', fields: [['logFolder', 'path']] },
  { id: 'appearance', label: 'Appearance', fields: [] },
];

export class Preferences {
  private dialog: Dialog | null = null;
  private controls = new Map<string, FieldControl>();

  constructor(private readonly ctx: Ctx) {}

  async open(page = 'general'): Promise<void> {
    const r = await this.ctx.run<{ prefs: Record<string, unknown>; describe: Record<string, string>; dataDir: string }>('prefs.get', {});
    if (!r) return;
    if (!this.dialog) await this.build(r.describe);
    for (const [k, c] of this.controls) c.set(r.prefs[k]);
    setText(q(this.dialog!.body, '.fe-prefs-data'), `Data folder: ${r.dataDir}`);
    this.show(page);
    void this.hardware();
    void this.cacheInfo();
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
