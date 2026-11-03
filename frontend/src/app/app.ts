import { api, type ServerEvent } from '../engine/client';
import type { Approval } from '../engine/types';
import { AgentsPanel } from '../panels/agents';
import { EncodingPanel } from '../panels/encoding';
import { ExportSettings } from '../panels/export-settings';
import { FamilyPanel } from '../panels/family';
import { InfoPanel } from '../panels/info';
import { LogPanel } from '../panels/log';
import { MediaPanel } from '../panels/media';
import { PresetsPanel } from '../panels/presets';
import { QueuePanel } from '../panels/queue';
import { TerminalPanel } from '../panels/terminal';
import { WatchPanel } from '../panels/watch';
import { Dialog, promptName } from '../ui/dialogs';
import { Dock, WORKSPACES } from '../ui/dock';
import { el, escapeHtml, q, revealApp, setClass, setText } from '../ui/dom';
import { brandMark, icon } from '../ui/icons';
import { Keys } from '../ui/keys';
import { MenuBar } from '../ui/menubar';
import { Palette } from '../ui/palette';
import { contextMenu } from '../ui/popup';
import { Preferences } from '../ui/prefs';
import { ShortcutEditor } from '../ui/shortcuts';
import { applyTheme } from '../ui/themes';
import { toast } from '../ui/toast';
import { VERSION } from '../version';
import { ctx } from './ctx';

const WS_MAP: Record<string, string> = { Default: 'Default', Encoding: 'Encoding', Ingest: 'Ingest', Agent: 'Agent', Minimal: 'Minimal' };

class App {
  private readonly dock = new Dock();
  private readonly prefs = new Preferences(ctx);
  private readonly shortcutEditor = new ShortcutEditor(ctx);
  private readonly keys = new Keys(ctx);
  private palette!: Palette;
  private terminal!: TerminalPanel;
  private queue!: QueuePanel;
  private exportSettings!: ExportSettings;
  private status!: HTMLElement;
  private wsSelect!: HTMLSelectElement;
  private revealed = false;
  private consent: Dialog | null = null;
  private approval: { id: number; dialog: Dialog } | null = null;
  private readonly answered = new Set<number>();

  start(): void {
    applyTheme();
    const appEl = q(document, '#app');
    const shell = el(`<div class="cv-app fx-app">
      <header class="cv-titlebar fx-titlebar">
        <div class="cv-brand fx-brand" title="formencoder ${VERSION}">${brandMark()}<span class="cv-brand-name">formencoder</span></div>
        <div class="fx-menubar-host"></div>
        <div class="fe-title-run"><span class="fe-run-dot"></span><span class="fe-run-text">Idle</span><span class="fe-run-bar"><span class="fe-bar-fill"></span></span></div>
        <div class="fx-title-tools">
          <select class="fx-select fe-ws" title="Workspace" data-automation-id="workspace.select"></select>
          <button class="cv-icon-btn" type="button" data-t="undo" title="Undo">${icon('undo', 16)}</button>
          <button class="cv-icon-btn" type="button" data-t="redo" title="Redo">${icon('redo', 16)}</button>
          <button class="cv-icon-btn" type="button" data-t="palette" title="Search commands and presets (Cmd+K)">${icon('search', 16)}</button>
          <button class="fx-agent-cta" type="button" data-t="agent" title="Open the agent terminal">${icon('agent', 14)}<span>Agent</span></button>
          <button class="cv-icon-btn" type="button" data-t="settings" title="Preferences">${icon('settings', 16)}</button>
        </div>
      </header>
      <main class="fx-main"></main>
      <footer class="cv-status fx-status"></footer>
    </div>`);
    appEl.appendChild(shell);
    const menubar = new MenuBar(ctx, {
      after: {
        Window: () => [
          ...this.dock.panelIds().map((id) => ({ label: this.dock.titleOf(id), checked: this.dock.isVisible(id), run: () => this.dock.show(id) })),
          '-',
          { label: 'Workspaces', children: () => [...Object.keys(WORKSPACES), ...this.dock.savedNames().filter((n) => !WORKSPACES[n])].map((n) => ({ label: n, checked: this.dock.workspace === n, run: () => this.dock.switchTo(n) })) },
          { label: 'Save Workspace As...', run: () => void this.saveWorkspace() },
          { label: 'Reset Workspace', run: () => this.dock.resetWorkspace() },
          { label: 'Command Palette...', shortcut: 'Cmd+K', run: () => void this.palette.open() },
          { label: 'Maximize Panel', shortcut: '`', run: () => this.dock.toggleMaximizeFocused() },
        ],
        Help: () => [
          { label: 'formencoder on GitHub', run: () => window.open('https://github.com/nodemode-ai/formencoder', '_blank') },
          { label: 'Report an Issue', run: () => window.open('https://github.com/nodemode-ai/formencoder/issues', '_blank') },
          { label: 'Download formencoder’s FFmpeg (LGPL)', run: () => void ctx.client.call('ffmpeg.fetch').catch((e: Error) => toast(e.message, 'error')) },
          '-',
          { label: 'About formencoder', run: () => void this.about() },
        ],
        Edit: () => [{ label: 'Keyboard Shortcuts...', run: () => void this.shortcutEditor.open() }, { label: 'Preferences...', shortcut: 'Cmd+,', run: () => void this.prefs.open() }],
      },
    }, (id) => this.keys.shortcutFor(id));
    q(shell, '.fx-menubar-host').appendChild(menubar.el);
    this.status = q(shell, '.fx-status');
    q(shell, '.fx-main').appendChild(this.dock.el);
    this.registerPanels();
    this.buildTitleTools(shell);
    this.buildStatus();
    this.dock.onWorkspace = (name) => {
      if (this.wsSelect && this.wsSelect.value !== name) this.wsSelect.value = name;
    };
    this.dock.load();
    this.exportSettings = new ExportSettings(ctx);
    this.palette = new Palette(ctx, (id) => this.keys.shortcutFor(id));
    this.palette.extraEntries = () => this.dock.panelIds().map((id) => ({ id: `panel.${id}`, label: `Show ${this.dock.titleOf(id)}`, path: 'Window', keys: '', kind: 'panel' as const, run: () => this.dock.show(id) }));
    this.keys.handlers = {
      palette: () => void this.palette.open(),
      maximize: () => this.dock.toggleMaximizeFocused(),
      focused: () => this.dock.focused,
    };
    this.bindEngine();
    this.bindNativeDrop();
    ctx.ui.on('showPanel', (id) => this.dock.show(id));
    ctx.ui.on('focusPanel', (id) => this.dock.focus(id));
    ctx.ui.on('exportSettings', (id) => void this.exportSettings.open(id));
    ctx.ui.on('inspect', () => {
      if (!this.dock.isVisible('info')) return;
      this.dock.show('info');
    });
    ctx.ui.on('result', (r) => void this.showResult(r.command, r.params, r.result));
    ctx.start();
    ctx.store.events.on('state', () => this.reveal());
    window.setTimeout(() => this.reveal(), 1500);
    this.automation();
  }

  private reveal(): void {
    if (this.revealed) return;
    this.revealed = true;
    revealApp();
  }

  private registerPanels(): void {
    this.terminal = new TerminalPanel(ctx);
    this.queue = new QueuePanel(ctx);
    this.dock.register('queue', 'Queue', () => this.queue);
    this.dock.register('encoding', 'Encoding', () => new EncodingPanel(ctx));
    this.dock.register('watch', 'Watch Folders', () => new WatchPanel(ctx));
    this.dock.register('media', 'Media Browser', () => new MediaPanel(ctx));
    this.dock.register('presets', 'Preset Browser', () => new PresetsPanel(ctx));
    this.dock.register('info', 'Media Info', () => new InfoPanel(ctx));
    this.dock.register('family', 'Form Family', () => new FamilyPanel(ctx));
    this.dock.register('log', 'Log', () => new LogPanel(ctx));
    this.dock.register('terminal', 'Terminal', () => this.terminal);
    this.dock.register('agents', 'Agents', () => new AgentsPanel(ctx));
  }

  private buildTitleTools(shell: HTMLElement): void {
    this.wsSelect = q<HTMLSelectElement>(shell, '.fe-ws');
    for (const name of Object.keys(WORKSPACES)) this.wsSelect.appendChild(Object.assign(document.createElement('option'), { value: name, textContent: name }));
    this.wsSelect.addEventListener('change', () => this.dock.switchTo(this.wsSelect.value));
    for (const b of Array.from(shell.querySelectorAll<HTMLElement>('[data-t]'))) {
      b.dataset.automationId = `titlebar.${b.dataset.t}`;
      b.addEventListener('click', () => {
        const t = b.dataset.t;
        if (t === 'undo') void ctx.run('edit.undo', {}, true);
        if (t === 'redo') void ctx.run('edit.redo', {}, true);
        if (t === 'palette') void this.palette.open();
        if (t === 'settings') void this.prefs.open();
        if (t === 'agent') {
          const r = b.getBoundingClientRect();
          contextMenu(r.left, r.bottom + 4, [
            { label: 'Open Terminal', run: () => this.dock.show('terminal') },
            { label: 'Start Claude Code', run: () => this.terminal.launch('claude') },
            { label: 'Start Codex', run: () => this.terminal.launch('codex') },
            { label: 'Start Cursor', run: () => this.terminal.launch('cursor') },
            '-',
            { label: 'Agent Workspace Layout', run: () => this.dock.switchTo('Agent') },
            { label: 'Agent Activity and Setup', run: () => this.dock.show('agents') },
          ]);
        }
      });
    }
    ctx.store.events.on('history', (st) => {
      const undo = q<HTMLButtonElement>(shell, '[data-t="undo"]');
      const redo = q<HTMLButtonElement>(shell, '[data-t="redo"]');
      undo.title = st.undo ? `Undo ${st.undo}` : 'Nothing to undo';
      redo.title = st.redo ? `Redo ${st.redo}` : 'Nothing to redo';
      undo.disabled = !st.undo;
      redo.disabled = !st.redo;
    });
    const run = q(shell, '.fe-title-run');
    const paint = (): void => {
      const st = ctx.store.state;
      if (!st) return;
      const outs = st.items.flatMap((i) => i.outputs).filter((o) => o.status === 'encoding' || o.status === 'preparing');
      const avg = outs.length ? outs.reduce((s, o) => s + (Number(o.progress) || 0), 0) / outs.length : 0;
      setClass(run, 'is-running', st.running && !st.paused);
      setClass(run, 'is-paused', st.paused);
      setText(q(run, '.fe-run-text'), st.paused ? 'Paused' : outs.length ? `Encoding ${outs.length} · ${Math.round(avg * 100)}%` : st.running ? 'Starting' : `${st.counts.done}/${st.counts.total} done`);
      q<HTMLElement>(run, '.fe-bar-fill').style.setProperty('--p', String(avg));
      document.title = outs.length ? `${Math.round(avg * 100)}% · formencoder` : 'formencoder';
    };
    ctx.store.events.on('run', paint);
    ctx.store.events.on('progress', paint);
  }

  private buildStatus(): void {
    this.status.innerHTML = `<span class="fx-st-engine"><span class="fx-st-dot"></span><span class="fx-st-engine-t">Connecting</span></span><span class="fe-st-ffmpeg"></span><span class="fx-st-act"></span><span class="fx-flex"></span><span class="fe-st-counts"></span><span class="fx-st-ver">formencoder ${VERSION}</span>`;
    ctx.client.events.on('open', (h) => {
      setClass(q(this.status, '.fx-st-dot'), 'is-on', h.core);
      setText(q(this.status, '.fx-st-engine-t'), h.core ? 'Engine ready' : `Engine: ${h.error ?? 'core missing'}`);
    });
    ctx.client.events.on('close', () => {
      setClass(q(this.status, '.fx-st-dot'), 'is-on', false);
      setText(q(this.status, '.fx-st-engine-t'), 'Reconnecting');
    });
    ctx.client.events.on('activity', (ev) => {
      if (String(ev.source) !== 'ui') setText(q(this.status, '.fx-st-act'), `${String(ev.source).replace(/^mcp:/, '')} · ${ev.command}`);
    });
    ctx.client.events.on('ffmpegFetch', (ev) => setText(q(this.status, '.fe-st-ffmpeg'), `${String(ev.message)} ${Math.round(Number(ev.progress) * 100)}%`));
    ctx.store.events.on('run', (st) => {
      const f = st.ffmpeg ?? {};
      setText(q(this.status, '.fe-st-ffmpeg'), f.found === false ? 'FFmpeg not found: set it in Preferences > Media and Hardware' : f.version ? `FFmpeg ${f.version}${f.licence ? ` (${f.licence})` : ''}${st.hardware?.length ? ` · ${st.hardware.length} hardware encoder${st.hardware.length === 1 ? '' : 's'}` : ''}` : '');
      const c = st.counts;
      setText(q(this.status, '.fe-st-counts'), `${c.total} outputs · ${c.ready} ready · ${c.encoding} encoding · ${c.done} done${c.failed ? ` · ${c.failed} failed` : ''}`);
    });
  }

  private bindEngine(): void {
    ctx.client.events.on('toast', (ev) => toast(String(ev.text ?? ev.message ?? ''), ev.kind === 'error' ? 'error' : ev.kind === 'ok' ? 'ok' : 'info'));
    ctx.client.events.on('consent', (ev) => this.askConsent(ev));
    ctx.client.events.on('approvals', (ev) => this.approvals((ev.pending as Approval[] | undefined) ?? []));
    ctx.client.events.on('open', () => void ctx.client.call<{ pending: Approval[] }>('agents.approvals').then((s) => this.approvals(s.pending)).catch(() => undefined));
    ctx.client.events.on('notify', (ev) => this.notify(ev));
    ctx.client.events.on('finished', (ev) => {
      if (ev.status === 'failed') toast(`Failed: ${String(ev.error ?? 'see the Error log')}`, 'error');
    });
    ctx.client.events.on('uiAction', (ev) => {
      if (ev.action === 'panel' && typeof ev.panel === 'string') this.dock.show(ev.panel);
      if (ev.action === 'workspace' && typeof ev.name === 'string') this.dock.switchTo(WS_MAP[ev.name] ?? 'Default');
      if (ev.action === 'exportSettings' && typeof ev.output === 'string') void this.exportSettings.open(ev.output);
    });
    ctx.client.events.on('activity', (ev) => {
      if (String(ev.source) !== 'ui' && ev.ok === false) toast(`${String(ev.source).replace(/^mcp:/, '')}: ${ev.error}`, 'error');
    });
  }

  private notify(ev: ServerEvent): void {
    if (ev.chime) this.chime();
    if (document.hasFocus()) {
      toast(`${ev.title}${ev.body ? ` · ${ev.body}` : ''}`, 'ok');
      return;
    }
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification(String(ev.title), { body: String(ev.body ?? '') });
      else if ('Notification' in window && Notification.permission !== 'denied') void Notification.requestPermission();
    } catch {
      toast(String(ev.title), 'ok');
    }
  }

  private chime(): void {
    try {
      const ac = new AudioContext();
      const t = ac.currentTime;
      for (const [i, f] of [660, 880, 990].entries()) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.35);
        o.connect(g).connect(ac.destination);
        o.start(t + i * 0.12);
        o.stop(t + i * 0.12 + 0.4);
      }
      window.setTimeout(() => void ac.close(), 1200);
    } catch {
      return;
    }
  }

  private async bindNativeDrop(): Promise<void> {
    if (!('__TAURI_INTERNALS__' in window)) return;
    try {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      await getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type === 'drop' && e.payload.paths.length) {
          this.dock.show('queue');
          this.queue.addPaths(e.payload.paths);
        }
      });
    } catch (err) {
      console.warn('[formencoder] native drop unavailable', err);
    }
  }

  private async showResult(command: string, params: Record<string, unknown>, result: unknown): Promise<void> {
    if (command === 'prefs.get') return this.prefs.open();
    if (command === 'app.capabilities') return this.about();
    if (command === 'log.read') return this.dock.show('log');
    if (command === 'media.probe') {
      this.dock.show('info');
      ctx.ui.emit('inspect', { path: String(params.path) });
      return;
    }
    if (command === 'preset.reveal') {
      toast(`Presets are in ${String((result as { folder?: string })?.folder ?? '')}`);
      return;
    }
    if (command === 'encode.estimate') {
      const r = result as { bytes: number; seconds: number };
      toast(`About ${(r.bytes / 1024 / 1024).toFixed(1)} MB for ${r.seconds.toFixed(2)} s`);
      return;
    }
    if (command === 'encode.command') {
      const { report } = await import('../ui/report');
      report('FFmpeg Command', String((result as { command?: string })?.command ?? '').split('\n').join('\n\n'));
      return;
    }
    const { report } = await import('../ui/report');
    report(ctx.specs.get(command)?.label.replace(/\.\.\.$/, '') ?? command, JSON.stringify(result, null, 2));
  }

  private async saveWorkspace(): Promise<void> {
    const name = await promptName('Save Workspace As', `${this.dock.workspace} copy`, 'Save');
    if (name) this.dock.saveAs(name);
  }

  private async about(): Promise<void> {
    const caps = await ctx.run<{ commands: number; formats: number; presets: number; engine: string; ffmpeg: { version?: string; licence?: string } }>('app.capabilities', {}, true);
    const d = new Dialog('About formencoder', 500);
    d.body.appendChild(el(`<div class="fx-about">
      <div class="fx-about-head">${brandMark(44)}<div><div class="fx-about-name">formencoder</div><div class="fx-note">Version ${VERSION} · Apache-2.0 · NodeAgentc, Inc.</div></div></div>
      <p class="fx-note">The media encoder of the form family, beside formcut, formvfx, formwav and formvis: a queue, presets, watch folders, ingest, proxies, loudness, captions and publishing on formencoder's own engine written in Rust, driven by you or by an agent.</p>
      <p class="fx-note">${escapeHtml(caps ? `${caps.commands} commands · ${caps.formats} formats · ${caps.presets} presets · ${caps.engine} · FFmpeg ${caps.ffmpeg?.version ?? '?'} (${caps.ffmpeg?.licence ?? '?'})` : '')}</p>
      <p class="fx-note">FFmpeg runs as a separate program under the LGPL; third-party notices are in NOTICE.md.</p>
      <p class="fx-note">Copyright 2026 NodeAgentc, Inc. Licensed under the Apache License 2.0: <a href="https://github.com/nodemode-dev/formencoder/blob/main/LICENSE" target="_blank" rel="noopener">LICENSE</a></p>
    </div>`));
    d.button('Close', 'primary', () => d.close());
    d.onClose = () => d.scrim.remove();
    d.open();
  }

  private approvals(pending: Approval[]): void {
    const open = new Set(pending.map((r) => r.id));
    if (this.approval && !open.has(this.approval.id)) {
      this.approval.dialog.close();
      this.approval.dialog.scrim.remove();
      this.approval = null;
    }
    if (this.approval || this.consent?.isOpen) return;
    const next = pending.find((r) => !this.answered.has(r.id));
    if (!next) return;
    const d = new Dialog('Allow this agent action?', 500);
    d.scrim.dataset.automationId = 'approval';
    const who = escapeHtml(String(next.client).replace(/^mcp:/, ''));
    const params = escapeHtml(typeof next.params === 'string' ? next.params : JSON.stringify(next.params));
    d.body.appendChild(el(`<p class="fx-note"><strong>${who}</strong> asks to run <strong>${escapeHtml(next.action)}</strong>. It needs your approval because ${escapeHtml(next.why.join('; '))}.</p>`));
    d.body.appendChild(el(`<pre class="fe-approval-params">${params}</pre>`));
    d.body.appendChild(el('<p class="cv-note">Full faith in the Agents panel lets agents do this without asking.</p>'));
    const answer = (allow: boolean): void => {
      if (this.approval?.id !== next.id) return;
      this.answered.add(next.id);
      this.approval = null;
      d.close();
      d.scrim.remove();
      void ctx.client.call('agents.decide', { id: next.id, allow }).catch((e: Error) => toast(e.message, 'error'));
    };
    d.onClose = () => answer(false);
    d.button('Decline', 'ghost', () => answer(false));
    d.button('Allow', 'primary', () => answer(true));
    this.approval = { id: next.id, dialog: d };
    d.open();
  }

  private askConsent(ev: ServerEvent): void {
    const rid = ev.requestId;
    const who = String(ev.client ?? 'An agent').replace(/^mcp:/, '');
    this.consent?.close();
    const d = new Dialog('Allow an agent to change the queue?', 460);
    d.scrim.dataset.automationId = 'consent';
    d.body.appendChild(el(`<p class="fx-note"><strong>${escapeHtml(who)}</strong> wants to use formencoder's tools (${escapeHtml(String(ev.detail ?? 'edit'))}). Queue changes are undoable. Agents you start from the Terminal panel never ask.</p>`));
    let answered = false;
    const answer = (allow: boolean, remember: string): void => {
      if (answered) return;
      answered = true;
      ctx.client.reply(rid, { allow, remember });
      d.close();
      d.scrim.remove();
    };
    d.onClose = () => answer(false, 'none');
    d.button('Don’t Allow', 'ghost', () => answer(false, 'none'));
    d.button('Allow Always', '', () => answer(true, 'always'));
    d.button('Allow', 'primary', () => answer(true, 'session'));
    this.consent = d;
    d.open();
  }

  private automation(): void {
    const elements = (): Array<{ id: string; tag: string; text: string; visible: boolean; rect: number[] }> =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-automation-id]')).map((n) => {
        const r = n.getBoundingClientRect();
        return { id: n.dataset.automationId as string, tag: n.tagName.toLowerCase(), text: (n.textContent || '').trim().slice(0, 80), visible: r.width > 0 && r.height > 0 && !n.closest('[hidden]'), rect: [r.x, r.y, r.width, r.height].map(Math.round) };
      });
    (window as unknown as { formencoder: unknown }).formencoder = {
      version: VERSION,
      ctx,
      execute: (command: string, params: Record<string, unknown> = {}) => ctx.client.exec(command, params),
      invoke: (command: string, params: Record<string, unknown> | null = null) => ctx.invoke(command, params),
      state: () => ctx.store.state,
      ui: {
        elements,
        click: (id: string) => {
          const n = document.querySelector<HTMLElement>(`[data-automation-id="${CSS.escape(id)}"]`);
          if (!n) return false;
          n.click();
          return true;
        },
        showPanel: (id: string) => this.dock.show(id),
        workspace: (name: string) => this.dock.switchTo(name),
        exportSettings: (output: string) => this.exportSettings.open(output),
      },
    };
    void api('/api/system').catch(() => undefined);
  }
}

export function startApp(): void {
  new App().start();
}
