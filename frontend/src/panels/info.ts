import type { Ctx } from '../app/ctx';
import type { Panel } from '../ui/dock';
import { el, patchList, q, setHidden, setText, swapMedia } from '../ui/dom';
import { basename, fmtBytes, fmtDuration } from '../ui/format';
import { icon } from '../ui/icons';

interface Probe {
  path?: string;
  kind?: string;
  duration?: number;
  size?: number;
  bitrate?: number;
  container?: string;
  timecode?: string | null;
  video?: { codec?: string; profile?: string | null; width?: number; height?: number; fps?: number; pixFmt?: string; bitDepth?: number; chroma?: string; fieldOrder?: string; sar?: string; colorPrimaries?: string | null; colorTransfer?: string | null; hdr?: string; frames?: number; rotation?: number; alpha?: boolean } | null;
  audio?: Array<{ codec?: string; sampleRate?: number; channels?: number; layout?: string; bitDepth?: number; language?: string | null }>;
  subtitles?: Array<{ codec?: string; language?: string | null }>;
  loudness?: { integrated?: number; lra?: number; truePeak?: number } | null;
  error?: string;
}

export class InfoPanel implements Panel {
  readonly id = 'info';
  readonly title = 'Media Info';
  readonly el: HTMLElement;
  private current = '';
  private seq = 0;

  constructor(private readonly ctx: Ctx) {
    this.el = el(`<div class="fe-info">
      <div class="fe-info-shot"><img alt="" decoding="async" hidden></div>
      <div class="fe-info-name"></div>
      <div class="fe-kv"></div>
      <div class="fe-info-actions" hidden>
        <button class="cv-btn" type="button" data-a="loud">${icon('audio', 13)}Measure Loudness</button>
        <button class="cv-btn" type="button" data-a="queue">${icon('plus', 13)}Add to Queue</button>
      </div>
      <p class="fx-note fe-info-empty">Select a source in the Queue or a file in the Media Browser to see its streams, timecode, colour and loudness.</p>
    </div>`);
    ctx.ui.on('inspect', (x) => void this.show(x.path, x.name, false));
    q(this.el, '[data-a="loud"]').addEventListener('click', () => void this.show(this.current, undefined, true));
    q(this.el, '[data-a="queue"]').addEventListener('click', () => void ctx.run('queue.addSource', { paths: [this.current] }));
  }

  async show(path: string, name?: string, loudness = false): Promise<void> {
    if (!path) return;
    const seq = ++this.seq;
    this.current = path;
    setText(q(this.el, '.fe-info-name'), name || basename(path));
    setHidden(q(this.el, '.fe-info-empty'), true);
    const r = await this.ctx.run<Probe>('media.probe', { path, loudness }, true);
    if (seq !== this.seq || !r) return;
    const img = q<HTMLImageElement>(this.el, 'img');
    if (r.video) {
      void swapMedia(img, `/api/fs/thumb?path=${encodeURIComponent(path)}&at=1&width=480`).then(() => setHidden(img, false)).catch(() => setHidden(img, true));
    } else setHidden(img, true);
    const v = r.video;
    const rows: Array<[string, string]> = [
      ['Kind', r.kind ?? ''],
      ['Duration', fmtDuration(r.duration)],
      ['Container', r.container ?? ''],
      ['Size', fmtBytes(r.size)],
      ['Bitrate', r.bitrate ? `${(r.bitrate / 1e6).toFixed(2)} Mb/s` : ''],
      ['Timecode', r.timecode ?? ''],
    ];
    if (v) {
      rows.push(
        ['Video', [v.codec, v.profile].filter(Boolean).join(' ')],
        ['Frame', v.width ? `${v.width}x${v.height}${v.rotation ? `, rotated ${v.rotation}` : ''}` : ''],
        ['Rate', v.fps ? `${Number(v.fps.toFixed(3))} fps${v.frames ? `, ${v.frames} frames` : ''}` : ''],
        ['Pixels', [v.pixFmt, v.bitDepth ? `${v.bitDepth}-bit` : '', v.chroma ? `4:${v.chroma.slice(1, 2)}:${v.chroma.slice(2, 3)}` : '', v.alpha ? 'alpha' : ''].filter(Boolean).join(', ')],
        ['Scan', v.fieldOrder ?? ''],
        ['Colour', [v.colorPrimaries, v.colorTransfer, v.hdr && v.hdr !== 'none' ? `HDR ${v.hdr}` : ''].filter(Boolean).join(' · ')],
      );
    }
    for (const [i, a] of (r.audio ?? []).entries()) rows.push([`Audio ${i + 1}`, [a.codec, a.sampleRate ? `${a.sampleRate} Hz` : '', a.layout || (a.channels ? `${a.channels} ch` : ''), a.bitDepth ? `${a.bitDepth}-bit` : '', a.language && a.language !== 'und' ? a.language : ''].filter(Boolean).join(', ')]);
    for (const [i, s] of (r.subtitles ?? []).entries()) rows.push([`Captions ${i + 1}`, [s.codec, s.language].filter(Boolean).join(', ')]);
    if (r.loudness) rows.push(['Loudness', `${r.loudness.integrated} LUFS, LRA ${r.loudness.lra} LU, peak ${r.loudness.truePeak} dBTP`]);
    if (r.error) rows.push(['Note', r.error]);
    patchList(q(this.el, '.fe-kv'), rows.filter(([, val]) => val), {
      key: ([k]) => k,
      create: () => el('<div class="fe-kv-row"><span></span><span></span></div>'),
      update: (n, [k, val]) => {
        setText(n.children[0], k);
        setText(n.children[1], val);
      },
    });
    setHidden(q(this.el, '.fe-info-actions'), false);
    setHidden(q<HTMLElement>(this.el, '[data-a="loud"]'), !(r.audio ?? []).length);
  }
}
