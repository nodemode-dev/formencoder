import type { Ctx } from './app/ctx';
import type { ConsentChoice, ConsentRequest, DockAdapter, DockAgentStatus, DockChannel, DockErrorKind, DockProgram, DockProgramStatus, DockTerminal, PtyKind, StoredChoiceState } from './dock/adapter';
import { Dock } from './dock/dock';
import { api, LOCAL_HEADERS, RpcFailure, windowTicket, wsUrl, type ServerEvent } from './engine/client';
import type { Panel } from './ui/dock';
import './dock/dock.css';
import './styles/dock-tokens.css';

type Agy = 'antigravity';
type Kind = Exclude<PtyKind, 'agent'> | Agy;
interface Row { id: string; title: string; cwd?: string; kind?: string; alive?: boolean; exited?: boolean }
interface Program { installed: boolean; version: string | null; signedIn: boolean | null; install: string; finding?: string; said?: string }
interface Refusal { code?: string; message?: string }

export interface PanelHost {
  show(): void;
  close(): void;
  settings(): void;
}

const KINDS: (PtyKind | Agy)[] = ['shell', 'claude', 'codex', 'cursor', 'antigravity', 'agent'];
const PROGRAMS: (DockProgram | Agy)[] = ['claude', 'codex', 'cursor', 'antigravity'];
const NOTES = ['Changes to the queue can be undone.', 'Claude Code, Codex, Cursor and Antigravity tabs you start in the Terminal panel do not ask.'];

function detail(err: unknown): Refusal | string | null {
  if (!(err instanceof RpcFailure)) return null;
  try {
    const body = JSON.parse(err.message) as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
    if (body.detail && typeof body.detail === 'object') return body.detail as Refusal;
  } catch {
    return err.message;
  }
  return err.message;
}

function errorKind(err: unknown): DockErrorKind | null {
  if (err instanceof TypeError) return 'unreachable';
  if (!(err instanceof RpcFailure)) return null;
  const said = detail(err);
  if (typeof said === 'object' && said?.code === 'not_installed') return 'notInstalled';
  if (err.code === 403) return 'refused';
  if (err.code === 502 || err.code === 503 || err.code === 504) return 'unreachable';
  if ((err.code === 404 || err.code === 405) && typeof said === 'string' && /^(Not Found|Method Not Allowed)$/i.test(said)) return 'oldEngine';
  return null;
}

function record(row: Row): DockTerminal<Agy> {
  const kind = KINDS.includes(row.kind as PtyKind | Agy) ? row.kind as PtyKind | Agy : 'shell';
  const alive = row.alive ?? row.exited !== true;
  return row.cwd ? { id: row.id, title: row.title, alive, kind, tip: row.cwd } : { id: row.id, title: row.title, alive, kind };
}

function channel(id: string): DockChannel {
  let data = (_chunk: string | Uint8Array): void => undefined;
  let exit = (): void => undefined;
  let lost = (): void => undefined;
  let socket: WebSocket | null = null;
  let shut = false;
  let size = { cols: 100, rows: 30 };
  const send = (message: unknown): void => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const control = (text: string): void => {
    let message: { type?: string };
    try {
      message = JSON.parse(text) as { type?: string };
    } catch {
      return;
    }
    if (message.type === 'hello') {
      data('');
      send({ type: 'resize', cols: size.cols, rows: size.rows });
    } else if (message.type === 'exit') exit();
    else if (message.type === 'restart') data('\x1bc');
  };
  const connect = async (): Promise<void> => {
    const ticket = await windowTicket();
    if (shut) return;
    const made = new WebSocket(wsUrl(`/api/terminal/ws?session=${encodeURIComponent(id)}&typed=1&cols=${size.cols}&rows=${size.rows}&ticket=${encodeURIComponent(ticket)}`));
    made.binaryType = 'arraybuffer';
    socket = made;
    made.addEventListener('message', (event) => {
      if (typeof event.data === 'string') data(event.data);
      else control(new TextDecoder().decode(event.data as ArrayBuffer));
    });
    made.addEventListener('close', () => {
      if (socket === made) socket = null;
      if (!shut) lost();
    });
  };
  void connect();
  return {
    send: (chunk) => send({ type: 'input', data: chunk }),
    resize: (cols, rows) => {
      size = { cols, rows };
      send({ type: 'resize', cols, rows });
    },
    onData: (handler) => { data = handler; },
    onExit: (handler) => { exit = handler; },
    onClose: (handler) => { lost = handler; },
    close: () => {
      shut = true;
      socket?.close();
    },
  };
}

function program(value: Program | undefined, own: boolean): DockProgramStatus | undefined {
  if (!value) return undefined;
  const status: DockProgramStatus = { installed: value.installed, version: value.version, install: value.install, signedIn: value.signedIn };
  if (own && value.finding !== 'runs' && typeof value.said === 'string') status.note = value.said;
  return status;
}

function question(ev: ServerEvent): ConsentRequest {
  const answers = Array.isArray(ev.answers) ? ev.answers as unknown[] : ['deny', 'once', 'always'];
  const offers = (['deny', 'once', 'always'] as ConsentChoice[]).filter((choice) => answers.includes(choice));
  const request: ConsentRequest = {
    id: String(ev.id ?? ev.requestId),
    agent: typeof ev.agent === 'string' ? ev.agent : String(ev.client ?? '').replace(/^mcp:/, ''),
    what: typeof ev.what === 'string' && ev.what ? ev.what : 'make changes',
    offers,
    always: ev.alwaysScope === 'all' ? 'all' : 'agent',
    escape: 'deny',
    notes: NOTES,
  };
  if (typeof ev.expiresAt === 'number') request.expires = Math.round(ev.expiresAt * 1000);
  return request;
}

function adapterFor(ctx: Ctx, host: PanelHost): DockAdapter<Agy> {
  return {
    words: {
      app: 'formencoder',
      noun: 'queue',
      example: 'make a YouTube file from this clip',
      start: './formencoder boot',
      lead: "Ask Claude Code to add files to the queue, pick presets and start encodes. It works through formencoder's own tools.",
    },
    strings: {
      empty: 'No terminal is open. Start a shell with the plus button, or Claude Code with the agent button.',
      agentTab: 'A terminal an outside agent opened, read only',
      tourPanelBody: 'This panel holds your terminals and Claude Code, an assistant that can work on your {noun} for you. Close it from its tab and open it again from the Window menu.',
      tourChatBody: 'Type what you want in this line, for example "{example}", and press Enter. Claude Code opens in a new tab and does it in {app}.',
      tourAskBody: 'If another AI program on this computer wants to change your {noun}, {app} asks you first in a box in the middle of the window. Choose Deny, Allow once or Always allow. Outside agents in the menu here opens the Agents panel, where the allowed agents are listed and can be forgotten.',
    },
    placement: { mode: 'hosted', request: (open) => { if (open) host.show(); else host.close(); } },
    isDockChord: () => false,
    chordLabel: () => '',
    tabs: () => ({ builtin: ['shell', 'claude', 'codex', 'cursor', 'antigravity'] }),
    classes: { iconButton: 'cv-icon-btn', button: 'cv-btn', primaryButton: 'cv-btn-primary', input: 'cv-input', select: 'fx-select', note: 'cv-note' },
    t: (_key, english) => english,
    onTheme: (handler) => { document.addEventListener('nm:ui-settings-changed', handler); },
    keyHeaders: () => ({ ...LOCAL_HEADERS }),
    errors: {
      message: (err) => {
        const said = detail(err);
        return typeof said === 'string' ? said : said?.message ?? null;
      },
      kind: errorKind,
    },
    terminal: {
      list: async () => {
        const [own, outside] = await Promise.all([api<{ tabs: Row[] }>('/api/terminal/tabs'), api<{ sessions: Row[] }>('/api/terminal/sessions')]);
        return [...own.tabs, ...outside.sessions.filter((row) => row.kind === 'agent')].map(record);
      },
      open: async (kind: Kind, o) => record(await api<Row>('/api/terminal/tabs', {
        method: 'POST',
        body: JSON.stringify({ kind, cols: o.cols, rows: o.rows, ...(o.prompt ? { prompt: o.prompt } : {}), ...(o.resume ? { resume: o.resume } : {}) }),
      })),
      restart: async (id) => { await api(`/api/terminal/sessions/${encodeURIComponent(id)}/restart`, { method: 'POST', body: '{}' }); },
      close: async (id) => {
        try {
          await api(`/api/terminal/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
        } catch (err) {
          if (!(err instanceof RpcFailure) || err.code !== 404) throw err;
        }
      },
      channel,
      scrollback: 8000,
    },
    agentStatus: async (): Promise<DockAgentStatus<Agy> | null> => {
      const status = await api<{ agents: Partial<Record<DockProgram | Agy, Program>> }>('/api/terminal/agents');
      const out: DockAgentStatus<Agy> = {};
      for (const kind of PROGRAMS) {
        const found = program(status.agents[kind], kind === 'antigravity');
        if (found) out[kind] = found;
      }
      return out;
    },
    consent: {
      subscribe: (add, withdraw) => {
        ctx.client.events.on('consent', (ev) => add(question(ev)));
        ctx.client.events.on('event', (ev) => {
          if (ev.type === 'withdrawn' && ev.of === 'consent') withdraw(String(ev.id ?? ev.requestId));
        });
      },
      answer: async (id, choice) => {
        ctx.client.reply(Number(id), { allow: choice !== 'deny', remember: choice === 'deny' ? 'none' : choice });
      },
    },
    storedChoice: {
      get: async (): Promise<StoredChoiceState> => {
        const status = await api<{ consent: { policy: string; sealBroken?: boolean } }>('/api/agents/status');
        return { value: status.consent.policy === 'deny' ? 'blocked' : 'ask', changedOutside: status.consent.sealBroken === true };
      },
      set: async () => { throw new Error('formencoder keeps one answer per agent; forget them in the Agents panel.'); },
    },
    openSettings: () => host.settings(),
  };
}

export class TerminalPanel implements Panel {
  readonly id = 'terminal';
  readonly title = 'Terminal';
  readonly el: HTMLElement;
  readonly dock: Dock<Agy>;

  constructor(ctx: Ctx, private readonly host: PanelHost) {
    this.el = document.createElement('div');
    this.el.className = 'fe-dock-host';
    this.dock = new Dock(adapterFor(ctx, host));
    this.dock.mount(this.el);
    this.dock.root.querySelector('.ft-dock-stage')?.setAttribute('data-automation-id', 'terminal.screen');
    ctx.client.events.on('terminals', () => void this.dock.sync());
  }

  shown(): void {
    this.dock.shown();
    this.dock.focus();
  }

  hidden(): void {
    this.dock.hidden();
  }

  launch(kind: 'shell' | DockProgram | Agy): void {
    this.host.show();
    void this.dock.show(kind);
  }
}
