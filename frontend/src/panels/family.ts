import type { Ctx } from '../app/ctx';
import { presetEntries } from '../ui/choosers';
import type { Panel } from '../ui/dock';
import { el, patchList, pendingClass, q, setClass, setHidden, setText, setTitle } from '../ui/dom';
import { pickFiles } from '../ui/file-dialog';
import { fmtDuration } from '../ui/format';
import { icon } from '../ui/icons';
import { contextMenu } from '../ui/popup';
import { toast } from '../ui/toast';

interface App {
  app: string;
  running: boolean;
  url: string | null;
  label: string;
  kind: string;
  alt: string;
  gives: string;
  version?: string;
  canStart?: boolean;
}

interface LinkState {
  linked: boolean;
  receiver: string;
  preset?: string;
  received?: number;
  last?: { at: number; file: string; project?: string } | null;
}

interface Source {
  id: string;
  name: string;
  kind: string;
  width?: number;
  height?: number;
  frameRate?: number;
  duration?: number;
  live?: boolean;
}

const DEFAULT_PRESET: Record<string, string> = { formcut: 'system/match-source-high', formvfx: 'system/prores-hq', formwav: 'system/wav-48-24', formvis: 'system/png-still' };

export class FamilyPanel implements Panel {
  readonly id = 'family';
  readonly title = 'Form Family';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private apps: App[] = [];
  private sources = new Map<string, Source[]>();
  private open = new Set<string>();
  private busy = false;
  private link: LinkState = { linked: false, receiver: '' };

  constructor(private readonly ctx: Ctx) {
    this.el = el(`<div class="fe-family">
      <div class="fe-bar">
        <span class="fe-bar-title">${icon('family', 15)}<span>formcut · formvfx · formwav · formvis</span></span>
        <span class="fx-flex"></span>
        <span class="fe-pending ns-pending">Looking</span>
        <button class="cv-icon-btn" type="button" data-a="refresh" title="Look for the family apps again">${icon('refresh', 15)}</button>
        <button class="cv-icon-btn" type="button" data-a="link" title="Queue a formvfx Dynamic Link (.fvxlink)">${icon('link', 15)}</button>
      </div>
      <div class="fe-f-list" data-automation-id="family.list"></div>
      <p class="fx-note fe-f-note">Media that came from a family app is encoded from the app itself: formcut renders the project through its own export, formvfx streams the composition frame by frame over Dynamic Link, formwav mixes the session and formvis hands over the image. Finished files can go back with Publish.</p>
    </div>`);
    this.list = q(this.el, '.fe-f-list');
    q(this.el, '[data-a="refresh"]').addEventListener('click', () => void this.load());
    q(this.el, '[data-a="link"]').addEventListener('click', async () => {
      const got = await pickFiles({ title: 'Queue a formvfx Dynamic Link', mode: 'open', extensions: ['fvxlink'] });
      if (got?.length) {
        const r = await this.ctx.client.call('family.addLink', { path: got[0], preset: 'system/prores-hq' }).catch((e: Error) => toast(e.message, 'error'));
        if (r) toast('Dynamic Link queued');
      }
    });
  }

  shown(): void {
    if (!this.apps.length) void this.load();
  }

  private async load(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const done = pendingClass(q(this.el, '.fe-pending'));
    try {
      this.apps = await this.ctx.client.call<App[]>('family.discover');
      this.link = (await this.ctx.client.call<{ formcut: LinkState }>('family.links').catch(() => null))?.formcut ?? this.link;
      for (const a of this.apps) if (a.running && this.open.has(a.app)) await this.loadSources(a.app);
      this.render();
    } catch (e) {
      toast(String((e as Error).message), 'error');
    } finally {
      this.busy = false;
      done();
    }
  }

  private async loadSources(app: string): Promise<void> {
    try {
      const r = await this.ctx.client.call<{ sources: Source[] }>('family.sources', { app });
      this.sources.set(app, r.sources);
    } catch (e) {
      this.sources.set(app, []);
      toast(String((e as Error).message), 'error');
    }
  }

  private render(): void {
    patchList(this.list, this.apps, {
      key: (a) => a.app,
      create: () => {
        const n = el(`<div class="fe-f-app">
          <div class="fe-f-head"><span class="fe-dot"></span><span class="fe-f-name"></span><span class="fe-f-kind"></span><span class="fx-flex"></span><button class="cv-btn fe-f-open" type="button"></button></div>
          <div class="fe-f-gives"></div>
          <div class="fe-f-link" hidden><span class="fx-note fe-f-linktext"></span><span class="fx-flex"></span><button class="cv-btn fe-f-linkbtn" type="button"></button></div>
          <div class="fe-f-sources"></div>
        </div>`);
        q(n, '.fe-f-linkbtn').addEventListener('click', (e) => {
          if (this.link.linked) {
            void this.setLink(null);
            return;
          }
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          void presetEntries(this.ctx, DEFAULT_PRESET.formcut, (p) => void this.setLink(p)).then((entries) =>
            contextMenu(rect.left, rect.bottom + 2, [{ label: 'Encode with Match Source - High bitrate', run: () => void this.setLink(DEFAULT_PRESET.formcut) }, '-', ...entries]),
          );
        });
        q(n, '.fe-f-open').addEventListener('click', async () => {
          const app = n.dataset.key as string;
          if (this.open.has(app)) this.open.delete(app);
          else {
            this.open.add(app);
            await this.loadSources(app);
          }
          this.render();
        });
        return n;
      },
      update: (n, a) => {
        setClass(q(n, '.fe-dot'), 'is-on', a.running);
        setText(q(n, '.fe-f-name'), a.label);
        setText(q(n, '.fe-f-kind'), `${a.kind} · like ${a.alt}`);
        setTitle(q(n, '.fe-f-head'), a.running ? `${a.url} · ${a.version ?? ''}` : `${a.label} is not running on this computer`);
        setText(q(n, '.fe-f-gives'), a.running ? a.gives : a.canStart ? `Not running. Its engine starts on its own when you open its sources or queue from it.` : `Not running. Open ${a.label} and refresh.`);
        const linkRow = q(n, '.fe-f-link');
        setHidden(linkRow, a.app !== 'formcut');
        if (a.app === 'formcut') {
          const l = this.link;
          setText(q(linkRow, '.fe-f-linktext'), l.linked ? `Every formcut export comes here and encodes with ${l.preset || 'the default preset'} (${l.received ?? 0} so far)` : 'Send formcut exports here as they finish');
          setText(q(linkRow, '.fe-f-linkbtn'), l.linked ? 'Stop Receiving' : 'Receive Exports');
          q<HTMLButtonElement>(linkRow, '.fe-f-linkbtn').disabled = !l.linked && !a.running;
        }
        const open = this.open.has(a.app) && (a.running || !!a.canStart);
        const btn = q<HTMLButtonElement>(n, '.fe-f-open');
        setText(btn, open ? 'Hide' : 'Sources');
        btn.disabled = !a.running && !a.canStart;
        const box = q(n, '.fe-f-sources');
        setHidden(box, !open);
        if (!open) return;
        patchList(box, this.sources.get(a.app) ?? [], {
          key: (s) => `${a.app}:${s.id}`,
          create: () => {
            const r = el(`<div class="fe-f-src"><span class="fe-f-sname"></span><span class="fe-f-smeta"></span><button class="cv-btn" type="button">${icon('plus', 12)}Queue</button></div>`);
            q(r, 'button').addEventListener('click', (e) => {
              const [app, ...rest] = (r.dataset.key as string).split(':');
              const id = rest.join(':');
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              void presetEntries(this.ctx, DEFAULT_PRESET[app] ?? null, (p) => void this.queue(app, id, p)).then((entries) =>
                contextMenu(rect.left, rect.bottom + 2, [{ label: `Queue with ${DEFAULT_PRESET[app]?.split('/')[1] ?? 'default'}`, run: () => void this.queue(app, id, DEFAULT_PRESET[app]) }, '-', ...entries]),
              );
            });
            return r;
          },
          update: (r, s) => {
            setText(q(r, '.fe-f-sname'), s.name);
            setText(q(r, '.fe-f-smeta'), [s.kind, s.width ? `${s.width}x${s.height}` : '', s.frameRate ? `${s.frameRate} fps` : '', fmtDuration(s.duration), s.live ? 'live' : ''].filter(Boolean).join(' · '));
          },
        });
      },
    });
  }

  private async setLink(preset: string | null): Promise<void> {
    try {
      const r = preset === null ? await this.ctx.client.call<{ formcut: LinkState }>('family.unlinkFormcut') : await this.ctx.client.call<{ formcut: LinkState }>('family.linkFormcut', { preset, start: true });
      this.link = r.formcut;
      toast(this.link.linked ? 'formcut exports now come to formencoder' : 'formcut exports no longer come here', 'ok');
    } catch (e) {
      toast(String((e as Error).message), 'error');
    }
    this.render();
  }

  private async queue(app: string, id: string, preset?: string): Promise<void> {
    try {
      await this.ctx.client.call('family.add', { app, id, ...(preset ? { preset } : {}) });
      toast(`${app} source queued`, 'ok');
      this.ctx.ui.emit('showPanel', 'queue');
    } catch (e) {
      toast(String((e as Error).message), 'error');
    }
  }
}
