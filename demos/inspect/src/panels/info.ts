import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setHidden, setText, setTitle } from '../../../../frontend/src/ui/dom';
import { fmtBytes } from '../../../../frontend/src/ui/format';
import { describeLoudness, measureLoudness } from '../../../../demo/src/engine/loudness';
import { cardSummary, factsOf, kindLabel } from '../facts';
import { rateLabel } from '../lib/timecode';
import type { Media } from '../model';
import { store } from '../store';

const loud = new Map<string, string>();
const pending = new Set<string>();

function loudness(m: Media | undefined): string {
  if (!m || !m.source || m.form !== 'video' || !m.probe?.audio.length) return '';
  const known = loud.get(m.id);
  if (known !== undefined) return known;
  if (!pending.has(m.id)) {
    pending.add(m.id);
    void (async () => {
      try {
        const buf = await (m.source as NonNullable<Media['source']>).audio();
        if (!buf) { loud.set(m.id, 'Not decodable here'); return; }
        const chans: Float32Array[] = [];
        for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
        const l = measureLoudness(chans, buf.sampleRate);
        loud.set(m.id, l.integrated < -69 ? 'Silent, below -70 LUFS' : describeLoudness(l));
      } catch {
        loud.set(m.id, 'Not decodable here');
      }
      store.emit('items');
    })();
  }
  return 'Measuring';
}

const ORDER = ['kind', 'container', 'size', 'duration', 'bitrate', 'vcodec', 'frame', 'shape', 'rate', 'frames', 'vbit', 'audio', 'loud', 'loop', 'md5'];
const LABEL: Record<string, string> = { kind: 'Kind', container: 'Container', size: 'Size', duration: 'Duration', bitrate: 'Bit rate', vcodec: 'Video', frame: 'Frame', shape: 'Shape', rate: 'Rate', frames: 'Frames', vbit: 'Video rate', audio: 'Audio', loud: 'Loudness', loop: 'Loop', md5: 'MD5' };
const INFORMATIVE = new Set(['md5']);

interface Row {
  key: string;
  a: string;
  b: string;
  diff: boolean;
}

export class InfoPanel implements Panel {
  readonly id = 'info';
  readonly title = 'Media Info';
  readonly el: HTMLElement;
  private readonly rows: HTMLElement;

  constructor() {
    this.el = el(`<div class="fe-info ins-info">
      <div class="ins-info-head">
        <span></span>
        <div class="ins-info-col" data-c="a"><div class="fe-info-shot"><img alt="" hidden></div><div class="ins-info-name"></div></div>
        <div class="ins-info-col" data-c="b"><div class="fe-info-shot"><img alt="" hidden></div><div class="ins-info-name"></div></div>
      </div>
      <div class="ins-info-sum fx-note"></div>
      <div class="fe-kv ins-kv"></div>
      <div class="ins-info-sec ins-seq-sec" hidden><div class="ins-sec-title">Image sequence</div><div class="ins-seq"></div></div>
      <div class="ins-info-sec ins-card-sec"><div class="ins-sec-title">This card</div><div class="ins-card"></div></div>
    </div>`);
    this.rows = q(this.el, '.ins-kv');
    store.on('slots', () => this.paint());
    store.on('items', () => this.paint());
    this.paint();
  }

  private paint(): void {
    const a = store.a();
    const b = store.b();
    const fa = new Map((a ? factsOf(a, loudness(a)) : []).map((f) => [f.key, f.value]));
    const fb = new Map((b ? factsOf(b, loudness(b)) : []).map((f) => [f.key, f.value]));
    const rows: Row[] = [];
    for (const key of ORDER) {
      const va = fa.get(key) ?? '';
      const vb = fb.get(key) ?? '';
      if (!va && !vb) continue;
      rows.push({ key, a: va || 'None', b: vb || 'None', diff: !!a && !!b && va !== vb && !INFORMATIVE.has(key) });
    }
    const diffs = rows.filter((r) => r.diff).length;
    setText(q(this.el, '.ins-info-sum'), a && b ? `${diffs} of ${rows.length - 1} fields differ between A and B.` : 'Choose a file for A and for B to compare their probes.');
    patchList(this.rows, rows, {
      key: (r) => r.key,
      create: () => el('<div class="fe-kv-row ins-kv-row"><span></span><span></span><span></span></div>'),
      update: (n, r) => {
        setText(n.children[0], LABEL[r.key]);
        setText(n.children[1], r.a);
        setText(n.children[2], r.b);
        setClass(n, 'is-diff', r.diff);
      },
    });
    this.head('a', a);
    this.head('b', b);
    this.sequence([a, b]);
    const card = cardSummary();
    patchList(q(this.el, '.ins-card'), card, { key: (s) => s, create: () => el('<div class="ins-line"></div>'), update: (n, s) => setText(n, s) });
    setHidden(q(this.el, '.ins-card-sec'), card.length === 0);
  }

  private head(c: 'a' | 'b', m: Media | undefined): void {
    const col = q(this.el, `.ins-info-col[data-c="${c}"]`);
    const img = q<HTMLImageElement>(col, 'img');
    if (m?.thumb) {
      if (img.getAttribute('src') !== m.thumb) img.setAttribute('src', m.thumb);
      setHidden(img, false);
    } else setHidden(img, true);
    setText(q(col, '.ins-info-name'), m ? `${c.toUpperCase()}  ${m.name}` : c.toUpperCase());
    setTitle(col, m ? `${m.name}\n${kindLabel(m)}, ${fmtBytes(m.size)}${m.fps ? `, ${rateLabel(m.fps)} fps` : ''}` : '');
  }

  private sequence(list: Array<Media | undefined>): void {
    const seqs = list.filter((m): m is Media => !!m && !!m.seq);
    const sec = q(this.el, '.ins-seq-sec');
    setHidden(sec, seqs.length === 0);
    const lines: Array<[string, string, boolean]> = [];
    for (const m of seqs) {
      const s = m.seq as NonNullable<Media['seq']>;
      const pad = (n: number): string => String(n).padStart(s.digits, '0');
      lines.push([`${m.name}: first ${pad(s.first)}, last ${pad(s.last)}`, '', true]);
      const span = s.last - s.first + 1;
      lines.push([`${s.count} files for ${span} numbers`, s.gaps.length ? `missing ${s.gaps.slice(0, 6).join(', ')}` : 'no gaps', s.gaps.length === 0]);
      lines.push([`${m.duration.toFixed(2)} s at ${rateLabel(m.fps)} fps`, `${(m.duration * m.fps).toFixed(0)} frames`, Math.abs(m.duration * m.fps - s.count) < 0.5]);
    }
    patchList(q(this.el, '.ins-seq'), lines, {
      key: (l) => l[0],
      create: () => el('<div class="ins-line ins-line-2"><span></span><span></span></div>'),
      update: (n, l) => {
        setText(n.children[0], l[0]);
        setText(n.children[1], l[1]);
        setClass(n, 'is-bad', !l[2]);
      },
    });
  }
}

