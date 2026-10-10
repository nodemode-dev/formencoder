import type { Ctx } from '../app/ctx';
import { confirmAction } from '../ui/dialogs';
import type { Panel } from '../ui/dock';
import { el, q, setClass, setText } from '../ui/dom';
import { icon } from '../ui/icons';

export class LogPanel implements Panel {
  readonly id = 'log';
  readonly title = 'Log';
  readonly el: HTMLElement;
  private kind: 'encoding' | 'error' = 'encoding';
  private visible = false;
  private pending = 0;

  constructor(private readonly ctx: Ctx) {
    this.el = el(`<div class="fe-log">
      <div class="fe-bar">
        <div class="fe-seg"><button type="button" data-k="encoding" class="is-active">Encoding Log</button><button type="button" data-k="error">Error Log</button></div>
        <span class="fe-log-path"></span>
        <span class="fx-flex"></span>
        <button class="cv-icon-btn" type="button" data-a="refresh" title="Refresh">${icon('refresh', 15)}</button>
        <button class="cv-icon-btn" type="button" data-a="clear" title="Clear this log">${icon('trash', 15)}</button>
      </div>
      <pre class="fe-log-text" data-automation-id="log.text"></pre>
    </div>`);
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-k]'))) {
      b.addEventListener('click', () => {
        this.kind = b.dataset.k as 'encoding' | 'error';
        for (const x of Array.from(this.el.querySelectorAll<HTMLElement>('[data-k]'))) setClass(x, 'is-active', x === b);
        void this.load();
      });
    }
    q(this.el, '[data-a="refresh"]').addEventListener('click', () => void this.load());
    q(this.el, '[data-a="clear"]').addEventListener('click', async () => {
      if (await confirmAction('Clear Log', `Clear the ${this.kind} log? The file is emptied.`, 'Clear', true)) {
        await ctx.run('log.clear', { kind: this.kind });
        void this.load();
      }
    });
    ctx.client.events.on('finished', () => {
      if (!this.visible) return;
      window.clearTimeout(this.pending);
      this.pending = window.setTimeout(() => void this.load(), 400);
    });
  }

  shown(): void {
    this.visible = true;
    void this.load();
  }

  hidden(): void {
    this.visible = false;
  }

  private async load(): Promise<void> {
    const r = await this.ctx.run<{ path: string; lines: string[] }>('log.read', { kind: this.kind, limit: 1500 }, true);
    if (!r) return;
    setText(q(this.el, '.fe-log-path'), r.path);
    const pre = q(this.el, '.fe-log-text');
    const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 8;
    setText(pre, r.lines.length ? r.lines.join('\n') : `The ${this.kind} log is empty.`);
    if (atBottom) pre.scrollTop = pre.scrollHeight;
  }
}
