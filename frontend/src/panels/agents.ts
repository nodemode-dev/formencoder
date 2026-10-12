import type { Ctx } from '../app/ctx';
import { api } from '../engine/client';
import type { Panel } from '../ui/dock';
import { el, patchList, q, setChecked, setClass, setText } from '../ui/dom';
import { icon } from '../ui/icons';
import { toast } from '../ui/toast';

interface Activity {
  time: number;
  source: string;
  command: string;
  ok: boolean;
  error?: string | null;
}

interface AgentStatus {
  workspace: { path: string; mcp: { command: string; args: string[] } };
  consent: { policy: string; session: string[]; always: string[] };
  clients: Record<string, boolean>;
  windows: number;
  activity: Activity[];
}

export class AgentsPanel implements Panel {
  readonly id = 'agents';
  readonly title = 'Agents';
  readonly el: HTMLElement;
  private feed: Activity[] = [];

  constructor(ctx: Ctx) {
    this.el = el(`<div class="fx-agents">
      <section class="fx-agents-sec">
        <div class="fx-agents-h">${icon('agent', 14)}<span>Drive formencoder with an agent</span></div>
        <p class="fx-note">Start Claude Code, Codex or Cursor in the Terminal panel: they open in formencoder's agent workspace and already know the queue, presets, export settings and the form family. From any other folder, set your account up once:</p>
        <div class="fx-agents-row">
          <button class="cv-btn" type="button" data-install="claude">Set up Claude Code</button>
          <button class="cv-btn" type="button" data-install="codex">Set up Codex</button>
          <button class="cv-btn" type="button" data-install="cursor">Set up Cursor</button>
        </div>
        <div class="fx-agents-kv"><span>MCP (stdio)</span><code class="fx-agents-mcp"></code></div>
        <div class="fx-agents-kv"><span>MCP (HTTP)</span><code>${location.origin}/mcp</code></div>
        <div class="fx-agents-kv"><span>Workspace</span><code class="fx-agents-ws"></code></div>
      </section>
      <section class="fx-agents-sec">
        <div class="fx-agents-h">${icon('lock', 14)}<span>Permissions</span><span class="fx-flex"></span><button class="fx-link" type="button" data-act="forget">Forget all</button></div>
        <div class="fx-agents-allowed"></div>
        <label class="fe-faith"><input type="checkbox" class="fx-check" data-automation-id="agents.fullFaith"><span><strong>Full faith</strong> · agents may delete, clear or reset, publish to outside services, overwrite files, change where watch folders write and type into terminals without asking you first. Off, each of those waits for your approval.</span></label>
      </section>
      <section class="fx-agents-sec fx-agents-grow">
        <div class="fx-agents-h">${icon('history', 14)}<span>Agent activity</span></div>
        <div class="fx-agents-feed" data-automation-id="agents.activity"></div>
      </section>
    </div>`);
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-install]'))) {
      b.dataset.automationId = `agents.install.${b.dataset.install}`;
      b.addEventListener('click', async () => {
        try {
          const r = await api<{ said: string[] }>('/api/agents/install', { method: 'POST', body: JSON.stringify({ client: b.dataset.install }) });
          toast(r.said.join(' · '));
        } catch (e) {
          toast(String((e as Error).message), 'error');
        }
      });
    }
    q(this.el, '[data-act="forget"]').addEventListener('click', async () => {
      await api('/api/agents/forget', { method: 'POST', body: '{}' });
      void this.load();
    });
    ctx.client.events.on('activity', (ev) => {
      this.feed.push(ev as unknown as Activity);
      if (this.feed.length > 300) this.feed.shift();
      if (!this.el.hidden) this.renderFeed();
    });
    this.faith = q<HTMLInputElement>(this.el, '.fe-faith input');
    this.faith.addEventListener('change', () => {
      void ctx.client.call<{ fullFaith: boolean }>('agents.fullFaith', { on: this.faith.checked }).then((s) => setChecked(this.faith, s.fullFaith)).catch((e: Error) => toast(e.message, 'error'));
    });
    ctx.client.events.on('approvals', (ev) => setChecked(this.faith, ev.fullFaith === true));
    ctx.client.events.on('agentActivity', (ev) => {
      const a = ev.entry as { time: number; client: string; tool: string; ok: boolean; approval?: string | null; error?: string | null } | undefined;
      if (!a || a.client === 'ui') return;
      this.feed.push({ time: a.time, source: a.client, command: a.approval ? `${a.tool} (${a.approval})` : a.tool, ok: a.ok, error: a.error });
      if (this.feed.length > 300) this.feed.shift();
      if (!this.el.hidden) this.renderFeed();
    });
    this.ctx = ctx;
  }

  private readonly faith: HTMLInputElement;
  private readonly ctx: Ctx;

  shown(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const s = await api<AgentStatus>('/api/agents/status');
      setText(q(this.el, '.fx-agents-mcp'), [s.workspace.mcp.command, ...s.workspace.mcp.args].join(' '));
      setText(q(this.el, '.fx-agents-ws'), s.workspace.path);
      for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-install]'))) setClass(b, 'is-missing', !s.clients[b.dataset.install as string]);
      const allowed = [...s.consent.always.map((c) => `${c} (always)`), ...s.consent.session.filter((c) => !s.consent.always.includes(c)).map((c) => `${c} (this session)`)];
      setText(q(this.el, '.fx-agents-allowed'), allowed.length ? allowed.join(', ') : `Policy: ${s.consent.policy}. Agents from the Terminal panel are always trusted; others ask once.`);
      if (!this.feed.length) this.feed = s.activity.filter((a) => a.source !== 'ui');
      this.renderFeed();
      const ap = await this.ctx.client.call<{ fullFaith: boolean }>('agents.approvals');
      setChecked(this.faith, ap.fullFaith);
    } catch {
      return;
    }
  }

  private renderFeed(): void {
    const rows = this.feed.slice(-120).reverse();
    patchList(q(this.el, '.fx-agents-feed'), rows, {
      key: (a) => `${a.time}:${a.command}`,
      create: () => el('<div class="fx-act"><span class="fx-act-t"></span><span class="fx-act-s"></span><span class="fx-act-c"></span></div>'),
      update: (n, a) => {
        setText(n.children[0], new Date(a.time * 1000).toLocaleTimeString());
        setText(n.children[1], a.source.replace(/^mcp:/, ''));
        setText(n.children[2], a.ok ? a.command : `${a.command}: ${a.error ?? 'failed'}`);
        setClass(n, 'is-error', !a.ok);
      },
    });
  }
}
