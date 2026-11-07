import { Dialog } from '../../../frontend/src/ui/dialogs';
import { el, q, setText } from '../../../frontend/src/ui/dom';
import { fmtDuration } from '../../../frontend/src/ui/format';
import { toast } from '../../../frontend/src/ui/toast';
import { canvasBlob, saveBlob } from './lib/save';
import { timecode } from './lib/timecode';
import { playable, stemOf, type Media } from './model';
import { store } from './store';
import { encodeWith, exportFrames, rangeOf, reader } from './work';

let abort: AbortController | null = null;

export function stopWork(): void {
  abort?.abort();
}

export function isWorking(): boolean {
  return abort !== null;
}

function option(value: string, text: string): HTMLOptionElement {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}

function select(options: Array<[string, string]>, value: string): HTMLSelectElement {
  const s = el<HTMLSelectElement>('<select class="fx-select"></select>');
  for (const [v, t] of options) s.appendChild(option(v, t));
  s.value = value;
  return s;
}

const FORMATS: Array<[string, string]> = [
  ['enc:match-source-medium', 'Match Source - Medium bitrate (WebM here)'],
  ['proxy:proxy-h264-540', 'Create Proxy: H.264 Proxy 960x540 (WebM here)'],
  ['enc:gif-480', 'Animated GIF 480 px'],
  ['seq:png', 'Image sequence: PNG, numbered, in a ZIP'],
  ['seq:jpeg', 'Image sequence: JPEG, numbered, in a ZIP'],
  ['enc:png-still', 'PNG Still (first frame of the range)'],
];

let convert: Dialog | null = null;
let convertParts: { source: HTMLSelectElement; format: HTMLSelectElement; range: HTMLSelectElement; rate: HTMLInputElement; width: HTMLSelectElement; note: HTMLElement } | null = null;

function sourceList(): Media[] {
  return store.items.filter((m) => playable(m));
}

function describe(): void {
  const p = convertParts;
  if (!p) return;
  const m = store.get(p.source.value);
  if (!m) { setText(p.note, ''); return; }
  const r = rangeOf(m, p.range.value === 'marks');
  const frames = Math.max(1, Math.round((r.end - r.start) * m.fps));
  const kind = p.format.value.split(':')[0];
  const isVideo = p.format.value.includes('match-source') || kind === 'proxy';
  p.rate.disabled = !isVideo;
  p.width.disabled = kind !== 'seq';
  setText(p.note, `${frames} frames, ${fmtDuration(r.end - r.start)} at ${Number(m.fps.toFixed(3))} fps from ${m.name}.${kind === 'seq' && frames > 150 ? ' A long sequence takes memory; set In and Out first.' : ''}`);
}

function buildConvert(): Dialog {
  const d = new Dialog('Convert', 520);
  const source = select([], '');
  const format = select(FORMATS, FORMATS[0][0]);
  const range = select([['marks', 'In and Out marks (or the whole file when none)'], ['all', 'Entire file']], 'marks');
  const rate = el<HTMLInputElement>('<input class="cv-input" type="number" min="0.2" max="14" step="0.05" placeholder="Preset rate (Mb/s)">');
  const width = select([['0', 'Source size'], ['960', '960 px wide'], ['480', '480 px wide']], '480');
  const note = el('<p class="fx-note ins-note"></p>');
  d.field('Source', source);
  d.field('Output', format);
  d.field('Range', range);
  d.field('Bit rate (Mb/s)', rate);
  d.field('Frame width', width);
  d.body.appendChild(note);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Add and Run', 'primary', () => void startConvert());
  convertParts = { source, format, range, rate, width, note };
  for (const c of [source, format, range, width]) c.addEventListener('change', describe);
  return d;
}

export function openConvert(): void {
  convert ??= buildConvert();
  const p = convertParts as NonNullable<typeof convertParts>;
  p.source.replaceChildren(...sourceList().map((m) => option(m.id, `${m.role === 'source' ? '' : 'Output: '}${m.name}`)));
  const want = store.a()?.id ?? '';
  if (want && sourceList().some((m) => m.id === want)) p.source.value = want;
  describe();
  convert.open(p.format);
}

async function startConvert(): Promise<void> {
  const p = convertParts;
  if (!p || abort) { toast('One conversion runs at a time'); return; }
  const src = store.get(p.source.value);
  if (!src) return;
  const [kind, id] = p.format.value.split(':');
  const range = rangeOf(src, p.range.value === 'marks');
  convert?.close();
  abort = new AbortController();
  store.emit('work');
  try {
    if (kind === 'seq') await exportFrames(src, { range, format: id as 'png' | 'jpeg', width: Number(p.width.value), signal: abort.signal });
    else await encodeWith(src, { presetId: id, range, mbps: p.rate.value ? Number(p.rate.value) : null, role: kind === 'proxy' ? 'proxy' : 'output', signal: abort.signal });
  } finally {
    abort = null;
    store.emit('work');
  }
}

export async function createProxy(src: Media): Promise<void> {
  if (abort) { toast('One conversion runs at a time'); return; }
  abort = new AbortController();
  store.emit('work');
  try {
    await encodeWith(src, { presetId: 'proxy-h264-540', range: { start: 0, end: src.duration }, mbps: null, role: 'proxy', signal: abort.signal });
  } finally {
    abort = null;
    store.emit('work');
  }
}

let sheet: Dialog | null = null;
let sheetParts: { which: HTMLSelectElement; count: HTMLSelectElement; range: HTMLSelectElement; canvas: HTMLCanvasElement; note: HTMLElement; save: HTMLButtonElement } | null = null;
let sheetRun = 0;

function buildSheet(): Dialog {
  const d = new Dialog('Contact Sheet', 900);
  const which = select([['a', 'A'], ['b', 'B']], 'a');
  const count = select([['4', '4 frames'], ['6', '6 frames'], ['9', '9 frames'], ['12', '12 frames']], '6');
  const range = select([['marks', 'In and Out marks (or the whole file when none)'], ['all', 'Entire file']], 'all');
  const box = el('<div class="ins-sheet"><canvas width="1920" height="1080"></canvas></div>');
  const note = el('<p class="fx-note ins-note"></p>');
  d.field('File', which);
  d.field('Frames', count);
  d.field('Range', range);
  d.body.appendChild(box);
  d.body.appendChild(note);
  d.button('Close', 'ghost', () => d.close());
  const save = d.button('Save PNG', 'primary', () => void saveSheet());
  sheetParts = { which, count, range, canvas: q<HTMLCanvasElement>(box, 'canvas'), note, save };
  for (const c of [which, count, range]) c.addEventListener('change', () => void paintSheet());
  d.onClose = () => { sheetRun += 1; };
  return d;
}

async function saveSheet(): Promise<void> {
  const p = sheetParts;
  const m = store.get(p?.which.value === 'b' ? store.slotB : store.slotA);
  if (!p || !m) return;
  saveBlob(await canvasBlob(p.canvas), `${stemOf(m.name)}_contact-sheet.png`);
}

async function paintSheet(): Promise<void> {
  const p = sheetParts;
  if (!p) return;
  const m = store.get(p.which.value === 'b' ? store.slotB : store.slotA);
  const my = ++sheetRun;
  const g = p.canvas.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#0b0b0b';
  g.fillRect(0, 0, p.canvas.width, p.canvas.height);
  if (!m || !playable(m)) { setText(p.note, 'Pick a file that has pictures.'); return; }
  const n = Number(p.count.value);
  const cols = n === 4 ? 2 : n === 6 ? 3 : n === 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const gap = 12;
  const cw = Math.floor((p.canvas.width - gap * (cols + 1)) / cols);
  const ch = Math.round((cw * m.height) / m.width);
  const total = rows * ch + gap * (rows + 1);
  p.canvas.height = Math.max(total, 270);
  g.fillStyle = '#0b0b0b';
  g.fillRect(0, 0, p.canvas.width, p.canvas.height);
  const r = rangeOf(m, p.range.value === 'marks');
  setText(p.note, 'Reading frames');
  p.save.disabled = true;
  const read = await reader(m);
  try {
    for (let i = 0; i < n; i++) {
      if (my !== sheetRun) return;
      const t = r.start + ((i + 0.5) / n) * (r.end - r.start);
      const idx = Math.max(0, Math.min(m.frames - 1, Math.floor(t * m.fps + 1e-3)));
      const img = await read.frame((idx + 0.5) / m.fps);
      const x = gap + (i % cols) * (cw + gap);
      const y = gap + Math.floor(i / cols) * (ch + gap);
      g.drawImage(img, x, y, cw, ch);
      const label = `${timecode(idx + Math.round(m.offset * m.fps), m.fps)}   frame ${idx}`;
      g.font = '600 22px ui-monospace, Menlo, monospace';
      const w = g.measureText(label).width + 20;
      g.fillStyle = 'rgba(0,0,0,0.62)';
      g.fillRect(x + 8, y + ch - 38, w, 30);
      g.fillStyle = '#fff';
      g.fillText(label, x + 18, y + ch - 16);
    }
    setText(p.note, `${n} frames of ${m.name}, spread evenly over ${fmtDuration(r.end - r.start)}.`);
    p.save.disabled = false;
  } finally {
    read.dispose();
  }
}

export function openContactSheet(): void {
  sheet ??= buildSheet();
  const p = sheetParts as NonNullable<typeof sheetParts>;
  p.which.value = store.a() && playable(store.a() as Media) ? 'a' : 'b';
  sheet.open();
  void paintSheet();
}
