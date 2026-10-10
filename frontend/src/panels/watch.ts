import type { Ctx } from '../app/ctx';
import type { UiState, Watch } from '../engine/types';
import { presetEntries } from '../ui/choosers';
import type { Panel } from '../ui/dock';
import { el, patchList, q, setClass, setHidden, setText, setTitle } from '../ui/dom';
import { pickFiles } from '../ui/file-dialog';
import { basename } from '../ui/format';
import { icon } from '../ui/icons';
import { contextMenu } from '../ui/popup';
import { DND_PRESET } from './queue';

export class WatchPanel implements Panel {
  readonly id = 'watch';
  readonly title = 'Watch Folders';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;

  constructor(private readonly ctx: Ctx) {
    this.el = el(`<div class="fe-watch">
      <div class="fe-bar">
        <button class="cv-icon-btn" type="button" data-a="add" title="Add Watch Folder (Cmd+Alt+I)">${icon('plus', 16)}</button>
        <button class="cv-icon-btn" type="button" data-a="scan" title="Scan watch folders now">${icon('refresh', 15)}</button>
        <span class="fx-flex"></span>
        <label class="fe-check-label"><input type="checkbox" class="fx-check" data-a="auto"><span>Auto-Encode Watch Folders</span></label>
      </div>
      <div class="fe-w-list" data-automation-id="watch.list"></div>
      <div class="fe-q-empty fe-w-empty"><div class="fe-drop-card">${icon('watch', 28)}<strong>No watch folders</strong><span>Add a folder and give it presets: media dropped into it is encoded into its Output folder, and the originals move to Source when they are done.</span><button class="cv-btn" type="button" data-a="add2">${icon('plus', 14)}Add Watch Folder</button></div></div>
    </div>`);
    this.list = q(this.el, '.fe-w-list');
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-a]'))) {
      b.dataset.automationId = `watch.${b.dataset.a}`;
      if (b.dataset.a === 'auto') {
        b.addEventListener('change', () => void ctx.run('queue.autoEncodeWatch', { enabled: (b as HTMLInputElement).checked }));
        continue;
      }
      b.addEventListener('click', () => {
        if (b.dataset.a === 'scan') void ctx.run('watch.scan');
        else void this.add();
      });
    }
    ctx.store.events.on('watch', (st) => this.render(st));
  }

  shown(): void {
    if (this.ctx.store.state) this.render(this.ctx.store.state);
  }

  private async add(): Promise<void> {
    const got = await pickFiles({ title: 'Add Watch Folder', mode: 'folder' });
    if (!got?.length) return;
    const presets = await this.ctx.presets();
    const def = presets.find((p) => p.id === 'system/match-source-high')?.id ?? presets[0]?.id;
    void this.ctx.run('watch.add', { folder: got[0], preset: def });
  }

  private render(st: UiState): void {
    const c = q<HTMLInputElement>(this.el, '[data-a="auto"]');
    if (c.checked !== st.autoEncodeWatch) c.checked = st.autoEncodeWatch;
    setHidden(q(this.el, '.fe-w-empty'), st.watch.length > 0);
    patchList(this.list, st.watch, {
      key: (w) => w.id,
      create: () => {
        const n = el(`<div class="fe-w-item">
          <div class="fe-w-head">
            <input type="checkbox" class="fx-check" title="Active">
            <span class="fe-w-ic">${icon('watch', 16)}</span>
            <span class="fe-w-name"></span>
            <span class="fe-w-path"></span>
            <span class="fx-flex"></span>
            <button class="cv-icon-btn" type="button" data-w="addOutput" title="Add an output">${icon('plus', 14)}</button>
            <button class="cv-icon-btn" type="button" data-w="more" title="More">${icon('more3', 14)}</button>
          </div>
          <div class="fe-w-outs"></div>
        </div>`);
        const head = q(n, '.fe-w-head');
        q<HTMLInputElement>(n, 'input').addEventListener('change', (e) => void this.ctx.run('watch.setActive', { watch: n.dataset.key, active: (e.target as HTMLInputElement).checked }));
        q(n, '[data-w="addOutput"]').addEventListener('click', (e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          void presetEntries(this.ctx, null, (p) => void this.ctx.run('watch.addOutput', { watch: n.dataset.key, preset: p })).then((entries) => contextMenu(r.left, r.bottom + 2, entries));
        });
        q(n, '[data-w="more"]').addEventListener('click', (e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const w = this.ctx.store.state?.watch.find((x) => x.id === n.dataset.key);
          contextMenu(r.left, r.bottom + 2, [
            { label: 'Scan Now', run: () => void this.ctx.run('watch.scan') },
            { label: 'Copy Folder Path', run: () => void navigator.clipboard?.writeText(w?.folder ?? '') },
            {
              label: 'Chain Outputs Into',
              children: () => [
                { label: 'No chain (Output folder)', run: () => void this.ctx.run('watch.chain', { watch: n.dataset.key, to: null }) },
                ...(this.ctx.store.state?.watch ?? []).filter((x) => x.id !== n.dataset.key).map((x) => ({ label: basename(x.folder), run: () => void this.ctx.run('watch.chain', { watch: n.dataset.key, to: x.id }) })),
              ],
            },
            '-',
            { label: 'Remove Watch Folder', run: () => void this.ctx.run('watch.remove', { watch: n.dataset.key }) },
          ]);
        });
        head.addEventListener('dragover', (e) => {
          if (!e.dataTransfer?.types.includes(DND_PRESET)) return;
          e.preventDefault();
          setClass(head, 'is-drop', true);
        });
        head.addEventListener('dragleave', () => setClass(head, 'is-drop', false));
        head.addEventListener('drop', (e) => {
          setClass(head, 'is-drop', false);
          const preset = e.dataTransfer?.getData(DND_PRESET);
          if (!preset) return;
          e.preventDefault();
          void this.ctx.run('watch.addOutput', { watch: n.dataset.key, preset });
        });
        return n;
      },
      update: (n, w: Watch) => {
        const box = q<HTMLInputElement>(n, 'input');
        if (box.checked !== w.active) box.checked = w.active;
        setClass(n, 'is-off', !w.active);
        setText(q(n, '.fe-w-name'), basename(w.folder));
        const chained = w.chainTo ? this.ctx.store.state?.watch.find((x) => x.id === w.chainTo) : undefined;
        setClass(n, 'is-offline', w.online === false);
        setText(q(n, '.fe-w-path'), [w.folder, w.kind === 'analysis' ? 'analysis' : '', chained ? `feeds ${basename(chained.folder)}` : '', w.online === false ? 'cannot be reached' : ''].filter(Boolean).join(' · '));
        setTitle(q(n, '.fe-w-path'), w.lastScan ? `Last scan ${new Date(w.lastScan * 1000).toLocaleTimeString()}` : 'Not scanned yet');
        patchList(q(n, '.fe-w-outs'), w.outputs, {
          key: (o) => o.id,
          create: () => {
            const r = el(`<div class="fe-w-out"><span class="fe-w-fmt"></span><button class="fe-link fe-w-preset" type="button"></button><span class="fe-w-dest"></span><button class="cv-icon-btn" type="button" title="Remove this output">${icon('close', 12)}</button></div>`);
            q(r, 'button.cv-icon-btn').addEventListener('click', () => void this.ctx.run('watch.removeOutput', { output: r.dataset.key }));
            q(r, '.fe-w-preset').addEventListener('click', (e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              void presetEntries(this.ctx, null, (p) => void this.ctx.run('watch.setOutput', { output: r.dataset.key, preset: p })).then((entries) => contextMenu(rect.left, rect.bottom + 2, entries));
            });
            q(r, '.fe-w-dest').addEventListener('click', async () => {
              const got = await pickFiles({ title: 'Output folder for this watch output', mode: 'folder' });
              if (got?.length) void this.ctx.run('watch.setOutput', { output: r.dataset.key, folder: got[0] });
            });
            return r;
          },
          update: (r, o) => {
            setText(q(r, '.fe-w-fmt'), o.formatLabel);
            setText(q(r, '.fe-w-preset'), o.presetName || 'Custom');
            setText(q(r, '.fe-w-dest'), o.folder);
            setTitle(q(r, '.fe-w-dest'), `${o.folder} (click to change)`);
          },
        });
      },
    });
  }
}
