import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, q } from '../../../../frontend/src/ui/dom';
import { icon } from '../../../../frontend/src/ui/icons';
import { store } from '../store';

export class LogPanel implements Panel {
  readonly id = 'log';
  readonly title = 'Log';
  readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private drawn = 0;

  constructor() {
    this.el = el(`<div class="fe-log">
      <div class="fe-bar">
        <span class="fe-bar-title">${icon('log', 14)}<span>Activity</span></span>
        <span class="fx-flex"></span>
        <button class="cv-icon-btn" type="button" data-a="clear" title="Clear the log">${icon('trash', 15)}</button>
      </div>
      <pre class="fe-log-text"></pre>
    </div>`);
    this.text = q(this.el, '.fe-log-text');
    q(this.el, '[data-a="clear"]').addEventListener('click', () => {
      store.logs.length = 0;
      this.drawn = 0;
      this.text.replaceChildren();
    });
    store.on('log', () => this.sync());
    this.sync();
  }

  private sync(): void {
    const stick = this.text.scrollTop + this.text.clientHeight >= this.text.scrollHeight - 8;
    if (store.logs.length < this.drawn) {
      this.drawn = 0;
      this.text.replaceChildren();
    }
    for (let i = this.drawn; i < store.logs.length; i++) {
      const l = store.logs[i];
      const row = document.createElement('div');
      row.textContent = `${l.time}  ${l.text}`;
      if (l.error) row.className = 'fd-log-err';
      this.text.appendChild(row);
    }
    this.drawn = store.logs.length;
    if (stick) this.text.scrollTop = this.text.scrollHeight;
  }
}
