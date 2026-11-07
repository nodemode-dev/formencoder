import type { Panel } from '../../../frontend/src/ui/dock';
import { el, patchList, q, setHidden, setText } from '../../../frontend/src/ui/dom';
import { fmtBytes, fmtDuration } from '../../../frontend/src/ui/format';
import { icon } from '../../../frontend/src/ui/icons';
import { toast } from '../../../frontend/src/ui/toast';
import { describeLoudness } from '../engine/loudness';
import { store, type Item } from '../state';

function waveform(canvas: HTMLCanvasElement, buf: AudioBuffer): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const style = getComputedStyle(document.documentElement);
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const color = style.getPropertyValue('--accent-color').trim() || '#f2545b';
  g.fillStyle = color;
  const data = buf.getChannelData(0);
  const per = Math.max(1, Math.floor(data.length / canvas.width));
  const mid = canvas.height / 2;
  for (let x = 0; x < canvas.width; x++) {
    let mn = 1, mx = -1;
    for (let i = 0; i < per; i += Math.max(1, per >> 6)) { const v = data[x * per + i] ?? 0; if (v < mn) mn = v; if (v > mx) mx = v; }
    g.fillRect(x, mid + mn * mid * 0.9, 1, Math.max(1, (mx - mn) * mid * 0.9));
  }
}

export class InfoPanel implements Panel {
  readonly id = 'info';
  readonly title = 'Media Info';
  readonly el: HTMLElement;
  private readonly shot: HTMLCanvasElement;
  private drawnKey = '';
  private shownPoster: HTMLCanvasElement | null = null;

  constructor() {
    this.el = el(`<div class="fe-info">
      <div class="fe-info-shot"><canvas class="fd-shot" width="640" height="360"></canvas></div>
      <div class="fe-info-name"></div>
      <div class="fe-kv"></div>
      <div class="fe-info-actions" hidden>
        <button class="cv-btn" type="button" data-a="frame">${icon('image', 13)}Save Frame (PNG)</button>
        <button class="cv-btn" type="button" data-a="output">${icon('plus', 13)}Add WAV Output</button>
      </div>
      <p class="fx-note fe-info-empty">Add a source to see its streams, frame and loudness.</p>
    </div>`);
    this.shot = q<HTMLCanvasElement>(this.el, '.fd-shot');
    q(this.el, '[data-a="frame"]').addEventListener('click', () => this.saveFrame());
    q(this.el, '[data-a="output"]').addEventListener('click', () => {
      const item = store.item(store.selectedItem);
      if (item) store.addOutput(item.id, 'wav-48-16');
    });
    store.on('select', () => this.show());
    store.on('items', () => this.show());
    this.show();
  }

  private saveFrame(): void {
    const item = store.item(store.selectedItem);
    if (!item?.poster) { toast('No frame to save for this source'); return; }
    item.poster.toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${store.stem(item)}_frame.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  }

  private rows(item: Item): Array<[string, string]> {
    const p = item.probe;
    const s = item.source;
    const rows: Array<[string, string]> = [
      ['Kind', s.kind === 'video' ? 'Video' : 'Audio'],
      ['Duration', fmtDuration(p.duration ?? s.duration)],
      ['Container', p.container],
      ['Size', s.sample ? 'not a file' : fmtBytes(p.size)],
      ['Bitrate', p.bitrate ? `${(p.bitrate / 1e6).toFixed(2)} Mb/s` : ''],
    ];
    if (p.video) {
      const v = p.video;
      rows.push(
        ['Video', [v.codec, v.profile].filter(Boolean).join(' ')],
        ['Frame', v.width ? `${v.width}x${v.height}` : ''],
        ['Rate', v.fps ? `${Number(v.fps.toFixed(3))} fps${v.frames ? `, ${v.frames} frames` : ''}` : ''],
        ['Video rate', v.bitrate ? `${(v.bitrate / 1e6).toFixed(2)} Mb/s` : ''],
      );
    } else if (s.kind === 'video') {
      rows.push(['Frame', `${s.width}x${s.height}`], ['Rate', `${Number(s.fps.toFixed(3))} fps`]);
    }
    p.audio.forEach((a, i) => {
      rows.push([`Audio ${i + 1}`, [a.codec, a.sampleRate ? `${a.sampleRate} Hz` : '', a.channels ? `${a.channels} ch` : '', a.bitDepth ? `${a.bitDepth}-bit` : ''].filter(Boolean).join(', ')]);
    });
    if (item.loudnessState === 'pending') rows.push(['Loudness', 'Measuring']);
    else if (item.loudness) rows.push(['Loudness', describeLoudness(item.loudness)]);
    else rows.push(['Loudness', p.audio.length ? 'No audio the browser can decode' : 'No audio track']);
    p.notes.forEach((n, i) => rows.push([i === 0 ? 'Note' : '', n]));
    return rows;
  }

  private show(): void {
    const item = store.item(store.selectedItem);
    setHidden(q(this.el, '.fe-info-empty'), !!item);
    setHidden(q(this.el, '.fe-info-actions'), !item);
    if (!item) {
      setText(q(this.el, '.fe-info-name'), '');
      q(this.el, '.fe-kv').replaceChildren();
      return;
    }
    setText(q(this.el, '.fe-info-name'), item.source.name);
    patchList(q(this.el, '.fe-kv'), this.rows(item).filter(([, v]) => v), {
      key: ([k, v]) => (k === '' ? `note:${v}` : k),
      create: () => el('<div class="fe-kv-row"><span></span><span></span></div>'),
      update: (n, [k, v]) => {
        setText(n.children[0], k);
        setText(n.children[1], v);
      },
    });
    this.paintShot(item);
  }

  private paintShot(item: Item): void {
    const key = `${item.id}:${item.poster ? 'p' : 'n'}:${item.loudnessState}`;
    if (key === this.drawnKey && this.shownPoster === item.poster) return;
    this.drawnKey = key;
    this.shownPoster = item.poster;
    const g = this.shot.getContext('2d');
    if (!g) return;
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.shot.width, this.shot.height);
    if (item.poster) {
      const k = Math.min(this.shot.width / item.poster.width, this.shot.height / item.poster.height);
      const w = item.poster.width * k, h = item.poster.height * k;
      g.drawImage(item.poster, (this.shot.width - w) / 2, (this.shot.height - h) / 2, w, h);
    } else if (item.source.kind === 'audio') {
      void item.source.audio().then((b) => { if (b && store.selectedItem === item.id) waveform(this.shot, b); });
    }
  }
}
