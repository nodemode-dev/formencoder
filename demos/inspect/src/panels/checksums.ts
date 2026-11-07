import { Dialog } from '../../../../frontend/src/ui/dialogs';
import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, patchList, q, setChecked, setClass, setDisabled, setText, setTitle } from '../../../../frontend/src/ui/dom';
import { fmtBytes } from '../../../../frontend/src/ui/format';
import { icon } from '../../../../frontend/src/ui/icons';
import { toast } from '../../../../frontend/src/ui/toast';
import { CHUNK, idle, Md5, md5Blob } from '../lib/md5';
import { saveBlob } from '../lib/save';
import type { Media } from '../model';
import { store } from '../store';

export type Mode = 'size' | 'md5' | 'bit';

interface Ingest {
  mode: Mode;
  srcMd5: string;
  copyMd5: string;
  ok: boolean;
  detail: string;
  progress: number;
  running: boolean;
  flipped: boolean;
}

const results = new Map<string, Ingest>();
let mode: Mode = 'md5';
let flip = false;
let running = false;

const MODE_LABEL: Record<Mode, string> = { size: 'Size', md5: 'MD5', bit: 'Bit for bit' };

function bytesOf(m: Media): Blob | null {
  if (m.blob) return m.blob;
  if (m.frameBlobs) return new Blob(m.frameBlobs);
  return null;
}

async function ingestOne(m: Media, how: Mode, damage: boolean): Promise<void> {
  const src = bytesOf(m);
  if (!src) return;
  const r: Ingest = { mode: how, srcMd5: '', copyMd5: '', ok: false, detail: '', progress: 0, running: true, flipped: damage };
  results.set(m.id, r);
  store.emit('items');
  const hash = new Md5();
  const parts: Uint8Array[] = [];
  const hit = Math.floor(src.size * 0.37);
  for (let o = 0; o < src.size; o += CHUNK) {
    const u8 = new Uint8Array(await src.slice(o, o + CHUNK).arrayBuffer());
    hash.update(u8);
    const copy = u8.slice();
    if (damage && hit >= o && hit < o + copy.length) copy[hit - o] ^= 1;
    parts.push(copy);
    r.progress = Math.min(1, (o + CHUNK) / src.size) * (how === 'size' ? 1 : 0.5);
    store.emit('items');
    await idle();
  }
  r.srcMd5 = hash.hex();
  const copy = new Blob(parts as BlobPart[]);
  if (how === 'size') {
    r.ok = copy.size === src.size;
    r.detail = r.ok ? `${fmtBytes(copy.size)} on both sides` : `${copy.size} bytes against ${src.size}`;
  } else if (how === 'md5') {
    r.copyMd5 = await md5Blob(copy, (f) => { r.progress = 0.5 + f * 0.5; store.emit('items'); });
    r.ok = r.copyMd5 === r.srcMd5;
    r.detail = r.ok ? 'Copy read back from storage matches' : `${r.srcMd5.slice(0, 8)} against ${r.copyMd5.slice(0, 8)}`;
  } else {
    let at = -1;
    for (let o = 0; o < src.size && at < 0; o += CHUNK) {
      const a = new Uint8Array(await src.slice(o, o + CHUNK).arrayBuffer());
      const b = new Uint8Array(await copy.slice(o, o + CHUNK).arrayBuffer());
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { at = o + i; r.detail = `Byte ${(o + i).toLocaleString('en-US')} differs: ${a[i].toString(16).padStart(2, '0')} against ${b[i].toString(16).padStart(2, '0')}`; break; }
      r.progress = 0.5 + Math.min(1, (o + CHUNK) / src.size) * 0.5;
      store.emit('items');
      await idle();
    }
    r.ok = at < 0;
    if (r.ok) r.detail = 'Every byte matches';
    r.copyMd5 = r.ok ? r.srcMd5 : '';
  }
  r.progress = 1;
  r.running = false;
  store.log(`Ingest ${m.name}, verify ${MODE_LABEL[how]}: ${r.ok ? 'verified' : `MISMATCH, ${r.detail}`}`, !r.ok);
  store.emit('items');
}

export async function runIngest(items: Media[]): Promise<void> {
  if (running) { toast('An ingest is already running'); return; }
  running = true;
  store.emit('work');
  let first = true;
  try {
    for (const m of items) {
      await ingestOne(m, mode, flip && first);
      first = false;
    }
  } finally {
    running = false;
    store.emit('work');
  }
}

function listText(): string {
  return store.items.filter((m) => m.md5).map((m) => `${m.md5}  ${m.name}`).join('\n') + '\n';
}

export async function checkList(file: File): Promise<void> {
  const text = await file.text();
  const rows: Array<[string, string, string]> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^([a-fA-F0-9]{32})\s+\*?(.+?)\s*$/.exec(line);
    if (!m) continue;
    const media = store.items.find((x) => x.name === m[2]);
    if (!media) rows.push(['missing', m[2], 'no file of that name is loaded']);
    else if (!media.md5) rows.push(['missing', m[2], 'not read yet']);
    else if (media.md5 === m[1].toLowerCase()) rows.push(['ok', m[2], 'OK']);
    else rows.push(['bad', m[2], `FAILED, listed ${m[1].slice(0, 8)}, file ${media.md5.slice(0, 8)}`]);
  }
  const d = new Dialog(`Check ${file.name}`, 560);
  const box = el('<div class="ins-report"></div>');
  if (!rows.length) box.appendChild(el('<p class="fx-note">No MD5 lines were found. Each line is a 32 character hash, two spaces and a file name.</p>'));
  for (const [kind, name, text2] of rows) {
    const row = el(`<div class="ins-report-row is-${kind}"><span class="ins-report-name"></span><span class="ins-report-text"></span></div>`);
    setText(q(row, '.ins-report-name'), name);
    setText(q(row, '.ins-report-text'), text2);
    box.appendChild(row);
  }
  d.body.appendChild(box);
  const bad = rows.filter((r) => r[0] !== 'ok').length;
  store.log(`Checked ${file.name}: ${rows.length - bad} of ${rows.length} match`, bad > 0);
  d.button('Close', 'primary', () => d.close());
  d.open();
}

export class ChecksumsPanel implements Panel {
  readonly id = 'checksums';
  readonly title = 'Ingest and Checksums';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;

  constructor() {
    this.el = el(`<div class="fe-queue ins-sums">
      <div class="fe-bar">
        <span class="fe-bar-title">${icon('ingest', 14)}<span>Ingest</span></span>
        <label class="ins-bar-label">Verify<select class="fx-select ins-mode"><option value="size">Size</option><option value="md5">MD5</option><option value="bit">Bit for bit</option></select></label>
        <label class="fe-check-label" title="Test only: changes one bit of the first copy so a failed verification can be seen"><input type="checkbox" class="ins-flip">Damage the first copy (test)</label>
        <span class="fx-flex"></span>
        <button class="cv-btn" type="button" data-a="ingest">${icon('ingest', 13)}Ingest All</button>
        <button class="cv-btn" type="button" data-a="save">${icon('upload', 13)}Save .md5</button>
        <button class="cv-btn" type="button" data-a="check">${icon('check', 13)}Check List</button>
      </div>
      <div class="fe-q-head ins-sum-grid"><span>File</span><span>Size</span><span>MD5 of the file</span><span>Copy</span><span>Result</span></div>
      <div class="fe-q-list ins-sum-list"></div>
    </div>`);
    this.list = q(this.el, '.ins-sum-list');
    const sel = q<HTMLSelectElement>(this.el, '.ins-mode');
    sel.value = mode;
    sel.addEventListener('change', () => { mode = sel.value as Mode; });
    const fl = q<HTMLInputElement>(this.el, '.ins-flip');
    setChecked(fl, flip);
    fl.addEventListener('change', () => { flip = fl.checked; });
    q(this.el, '[data-a="ingest"]').addEventListener('click', () => void runIngest(store.items.filter((m) => m.role === 'source' && bytesOf(m))));
    q(this.el, '[data-a="save"]').addEventListener('click', () => {
      if (!store.items.some((m) => m.md5)) { toast('No checksums are ready yet'); return; }
      saveBlob(new Blob([listText()], { type: 'text/plain' }), 'hike-shoot.md5');
    });
    q(this.el, '[data-a="check"]').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md5,.txt';
      input.addEventListener('change', () => { const f = input.files?.[0]; if (f) void checkList(f); });
      input.click();
    });
    store.on('items', () => this.paint());
    store.on('work', () => this.paint());
    this.paint();
  }

  private paint(): void {
    const rows = store.items.filter((m) => m.state !== 'failed');
    patchList(this.list, rows, {
      key: (m) => m.id,
      create: () => el(`<div class="fe-q-out ins-sum-row ins-sum-grid"><span class="ins-sum-name"></span><span class="ins-sum-size"></span><span class="ins-mono ins-sum-md5"></span><span class="ins-mono ins-sum-copy"></span><span class="ins-sum-res"><span class="fe-bar-track"><span class="fe-bar-fill"></span></span><span class="fe-st-text"></span></span></div>`),
      update: (n, m) => this.update(n, m),
    });
    for (const b of ['ingest']) setDisabled(q<HTMLButtonElement>(this.el, `[data-a="${b}"]`), running);
  }

  private update(n: HTMLElement, m: Media): void {
    setText(q(n, '.ins-sum-name'), m.name);
    setTitle(q(n, '.ins-sum-name'), `${m.name}${m.role === 'source' ? '' : ' (made by this page)'}`);
    setText(q(n, '.ins-sum-size'), m.state === 'loading' ? '' : fmtBytes(m.size));
    setText(q(n, '.ins-sum-md5'), m.md5 || (m.md5State === 'running' ? 'reading' : m.state === 'loading' ? '' : 'waiting'));
    const r = results.get(m.id);
    setText(q(n, '.ins-sum-copy'), r?.copyMd5 ? r.copyMd5 : r ? (r.running ? 'copying' : r.mode === 'size' ? 'not hashed' : 'differs') : 'not copied');
    const t = q(n, '.fe-st-text');
    const bar = q(n, '.fe-bar-fill');
    if (!r) {
      setText(t, '');
      bar.style.setProperty('--p', '0');
    } else {
      setText(t, r.running ? `${Math.round(r.progress * 100)}%` : r.ok ? `Verified (${MODE_LABEL[r.mode]})` : 'Mismatch');
      bar.style.setProperty('--p', String(r.progress));
      setTitle(t, r.detail);
    }
    n.dataset.status = !r ? 'ready' : r.running ? 'encoding' : r.ok ? 'done' : 'failed';
    setClass(n, 'is-flipped', !!r?.flipped);
    setTitle(n, r?.detail ?? '');
  }
}
