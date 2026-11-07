import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setText } from '../../../../frontend/src/ui/dom';
import { icon } from '../../../../frontend/src/ui/icons';
import { toast } from '../../../../frontend/src/ui/toast';
import { CAPTION_EXT, CAPTION_MIME, cps, MAX_CPS, writeCaptions, type CaptionFormat } from '../engine/captions';
import { activeCue } from '../engine/overlay';
import { job } from '../job';
import { player } from '../player';

const clock = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

export class CaptionsPanel implements Panel {
  readonly id = 'captions';
  readonly title = 'Captions';
  readonly el: HTMLElement;
  private readonly file: HTMLInputElement;
  private activeIndex = -1;

  constructor() {
    this.el = el(`<div class="fe-info fb-caps">
      <div class="fe-bar">
        <span class="fe-bar-title">${icon('captions', 14)}<span>Captions</span></span>
        <span class="fx-note fb-cap-name"></span>
        <span class="fx-flex"></span>
        <span class="fe-badge fb-cap-sum"></span>
        <button class="cv-btn" type="button" data-a="open">${icon('upload', 13)}Open SRT or VTT</button>
        <select class="fx-select fb-cap-fmt" title="Convert to">
          <option value="srt">SRT</option><option value="vtt">WebVTT</option><option value="ttml">TTML</option><option value="scc">SCC</option>
        </select>
        <button class="cv-btn" type="button" data-a="convert">${icon('file', 13)}Convert and Save</button>
      </div>
      <div class="fb-checks"></div>
      <div class="fb-cue-head fb-cue"><span>#</span><span>In</span><span>Out</span><span>Chars/s</span><span>Text</span></div>
      <div class="fb-cue-list"></div>
      <input class="fd-file" type="file" accept=".srt,.vtt,text/vtt,application/x-subrip">
    </div>`);
    this.file = q<HTMLInputElement>(this.el, '.fd-file');
    q(this.el, '[data-a="open"]').addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', async () => {
      const f = this.file.files?.[0];
      if (f) job.loadCaptions(await f.text(), f.name);
      this.file.value = '';
    });
    q(this.el, '[data-a="convert"]').addEventListener('click', () => this.convert());
    q(this.el, '.fb-cue-list').addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      const c = job.cues[Number(row?.dataset.i)];
      if (c) player.seek(c.start + 0.05);
    });
    job.on('cues', () => this.paint());
    player.on(() => this.mark());
    this.paint();
  }

  private convert(): void {
    const fmt = q<HTMLSelectElement>(this.el, '.fb-cap-fmt').value as CaptionFormat;
    const text = writeCaptions(job.cues, fmt, 0);
    const url = URL.createObjectURL(new Blob([text], { type: CAPTION_MIME[fmt] }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.cueName.replace(/\.[^.]+$/, '')}.${CAPTION_EXT[fmt]}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Wrote ${a.download}`, 'ok');
  }

  private mark(): void {
    const c = activeCue(job.cues, player.time);
    const i = c ? job.cues.indexOf(c) : -1;
    if (i === this.activeIndex) return;
    this.activeIndex = i;
    for (const n of Array.from(q(this.el, '.fb-cue-list').children)) setClass(n as HTMLElement, 'is-active', (n as HTMLElement).dataset.i === String(i));
  }

  private paint(): void {
    setText(q(this.el, '.fb-cap-name'), job.cueName);
    const bad = job.captionChecks.filter((c) => !c.ok).length;
    setText(q(this.el, '.fb-cap-sum'), bad ? `${bad} to look at` : 'checks pass');
    setClass(q(this.el, '.fb-cap-sum'), 'is-warn', bad > 0);
    patchList(q(this.el, '.fb-checks'), job.captionChecks, {
      key: (c) => c.label,
      create: () => el('<span class="fb-chk"><b></b><i></i></span>'),
      update: (n, c) => {
        setText(n.children[0], c.label);
        setText(n.children[1], c.detail);
        setClass(n, 'is-bad', !c.ok);
      },
    });
    patchList(q(this.el, '.fb-cue-list'), job.cues.map((c, i) => ({ c, i })), {
      key: ({ i }) => String(i),
      create: ({ i }) => { const n = el('<div class="fb-cue"><span></span><span class="fb-mono"></span><span class="fb-mono"></span><span class="fb-mono"></span><span class="fb-cue-text"></span></div>'); n.dataset.i = String(i); return n; },
      update: (n, { c, i }) => {
        n.dataset.i = String(i);
        setText(n.children[0], String(i + 1));
        setText(n.children[1], clock(c.start));
        setText(n.children[2], clock(c.end));
        const v = cps(c);
        setText(n.children[3], v.toFixed(1));
        setClass(n.children[3], 'fb-bad', v > MAX_CPS);
        setText(n.children[4], c.text.replace(/\n/g, ' / '));
      },
    });
    this.activeIndex = -2;
    this.mark();
  }
}
