import { Dialog } from '../../../../frontend/src/ui/dialogs';
import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setDisabled, setHidden, setStyleVar, setText, setTitle } from '../../../../frontend/src/ui/dom';
import { fmtBytes } from '../../../../frontend/src/ui/format';
import { icon } from '../../../../frontend/src/ui/icons';
import { toast } from '../../../../frontend/src/ui/toast';
import { saveBlob } from '../lib/save';
import type { Media } from '../model';
import { store } from '../store';
import { createProxy, isWorking, openConvert, stopWork } from '../tools';
import { openAsSequence, verifyAgain } from '../work';

let preview: Dialog | null = null;
let stage: HTMLElement;
let caption: HTMLElement;
let urls: string[] = [];

function buildPreview(): Dialog {
  const d = new Dialog('Preview', 780);
  stage = el('<div class="fd-stage"></div>');
  caption = el('<p class="cv-note fd-caption"></p>');
  d.body.appendChild(stage);
  d.body.appendChild(caption);
  d.button('Close', 'primary', () => d.close());
  d.onClose = () => {
    stage.replaceChildren();
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  };
  return d;
}

async function showPreview(m: Media): Promise<void> {
  preview ??= buildPreview();
  preview.setTitle(m.name);
  setText(caption, [m.label, m.message].filter(Boolean).join('. '));
  if (m.form === 'animation' && m.blob) {
    const img = el<HTMLImageElement>('<img class="fd-media" alt="">');
    const u = URL.createObjectURL(m.blob);
    urls.push(u);
    img.src = u;
    stage.replaceChildren(img);
  } else if (m.form === 'archive' && m.frameBlobs) {
    const strip = el('<div class="ins-strip"></div>');
    const pick = [0, 1, 2, 3, 4, 5].map((k) => Math.round((k / 5) * (m.frameBlobs as Blob[]).length - (k === 5 ? 1 : 0)));
    for (const i of pick) {
      const cell = el('<figure class="ins-strip-cell"><img alt=""><figcaption></figcaption></figure>');
      const u = URL.createObjectURL((m.frameBlobs as Blob[])[Math.max(0, i)]);
      urls.push(u);
      q<HTMLImageElement>(cell, 'img').src = u;
      setText(q(cell, 'figcaption'), m.names[Math.max(0, i)]);
      strip.appendChild(cell);
    }
    stage.replaceChildren(strip);
  } else if (m.blob) {
    const v = el<HTMLVideoElement>('<video class="fd-media" controls playsinline></video>');
    const u = URL.createObjectURL(m.blob);
    urls.push(u);
    v.src = u;
    stage.replaceChildren(v);
  }
  preview.open(q(preview.scrim, '.cv-btn-primary'));
}

function report(m: Media): void {
  const d = new Dialog(`Verify ${m.name}`, 560);
  const box = el('<div class="ins-report"></div>');
  for (const c of m.checks ?? []) {
    const row = el(`<div class="ins-report-row ${c.ok ? 'is-ok' : 'is-bad'}"><span class="ins-report-name"></span><span class="ins-report-text"></span></div>`);
    setText(q(row, '.ins-report-name'), c.label);
    setText(q(row, '.ins-report-text'), c.ok ? `${c.got}` : `wanted ${c.want}, got ${c.got}`);
    box.appendChild(row);
  }
  if (!m.checks?.length) box.appendChild(el('<p class="fx-note">There is nothing to verify against for this file.</p>'));
  d.body.appendChild(box);
  d.body.appendChild(el('<p class="fx-note">Verify probes the finished file and compares it with the settings it was made from, as the desktop app does.</p>'));
  d.button('Close', 'primary', () => d.close());
  d.open();
}

export class OutputsPanel implements Panel {
  readonly id = 'outputs';
  readonly title = 'Outputs';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;

  constructor() {
    this.el = el(`<div class="fe-queue ins-outputs">
      <div class="fe-bar">
        <span class="fe-bar-title">${icon('queue', 14)}<span>Outputs</span></span>
        <button class="cv-btn" type="button" data-a="convert">${icon('plus', 13)}Convert</button>
        <button class="cv-btn" type="button" data-a="proxy" title="Make a proxy of A into a Proxies folder next to it, named [source]_Proxy">${icon('film', 13)}Create Proxy of A</button>
        <button class="cv-btn" type="button" data-a="verify">${icon('check', 13)}Verify All</button>
        <span class="fx-flex"></span>
        <span class="ins-work-text"></span>
        <button class="cv-btn ins-stop" type="button" data-a="stop">${icon('close', 13)}Stop</button>
      </div>
      <div class="fe-q-head ins-out-grid"><span>Output</span><span>Made as</span><span>Size</span><span>Verify</span><span></span></div>
      <div class="fe-q-list ins-out-list"></div>
    </div>`);
    this.list = q(this.el, '.ins-out-list');
    q(this.el, '[data-a="convert"]').addEventListener('click', () => openConvert());
    q(this.el, '[data-a="proxy"]').addEventListener('click', () => {
      const a = store.a();
      if (a && a.form === 'video') void createProxy(a);
      else toast('Show a video file in A first');
    });
    q(this.el, '[data-a="verify"]').addEventListener('click', () => { for (const m of store.outputs()) if (m.state === 'ready') verifyAgain(m); });
    q(this.el, '[data-a="stop"]').addEventListener('click', () => stopWork());
    store.on('items', () => this.paint());
    store.on('work', () => this.paint());
    store.on('slots', () => this.paint());
    this.paint();
  }

  private paint(): void {
    patchList(this.list, store.outputs(), {
      key: (m) => m.id,
      create: () => this.create(),
      update: (n, m) => this.update(n, m),
    });
    const busy = isWorking();
    q(this.el, '.ins-stop').style.visibility = busy ? 'visible' : 'hidden';
    const w = store.get(store.working);
    setText(q(this.el, '.ins-work-text'), busy && w ? `${w.name} · ${Math.round(w.progress * 100)}%` : '');
    setDisabled(q<HTMLButtonElement>(this.el, '[data-a="convert"]'), busy);
    setDisabled(q<HTMLButtonElement>(this.el, '[data-a="proxy"]'), busy);
  }

  private create(): HTMLElement {
    const n = el(`<div class="fe-q-out ins-out-row ins-out-grid">
      <span class="ins-two"><span class="ins-title"></span><span class="ins-sub"></span></span>
      <span class="ins-two"><span class="ins-title ins-fmt"></span><span class="ins-sub ins-orig"></span></span>
      <span class="ins-two"><span class="ins-title ins-size"></span><span class="ins-sub ins-rate"></span></span>
      <span class="ins-status"><span class="fe-bar-track ins-track"><span class="fe-bar-fill"></span></span><span class="fe-st-text ins-msg"></span><button class="ins-chip" type="button"></button></span>
      <span class="ins-acts">
        <button class="cv-icon-btn ins-ab" type="button" data-a="a" title="Show in A">A</button>
        <button class="cv-icon-btn ins-ab" type="button" data-a="b" title="Show in B">B</button>
        <button class="cv-icon-btn" type="button" data-a="play" title="Preview">${icon('play', 14)}</button>
        <button class="cv-icon-btn" type="button" data-a="seq" title="Open as an image sequence">${icon('sequence', 14)}</button>
        <button class="cv-icon-btn" type="button" data-a="save" title="Save">${icon('upload', 14)}</button>
      </span>
    </div>`);
    const get = (): Media | undefined => store.get(n.dataset.key as string);
    q(n, '[data-a="a"]').addEventListener('click', () => { const m = get(); if (m) store.setSlots(m.id, store.slotB); });
    q(n, '[data-a="b"]').addEventListener('click', () => { const m = get(); if (m) store.setSlots(store.slotA, m.id); });
    q(n, '[data-a="play"]').addEventListener('click', () => { const m = get(); if (m) void showPreview(m); });
    q(n, '[data-a="seq"]').addEventListener('click', () => {
      const m = get();
      if (m) void openAsSequence(m).then((s) => { if (s) { store.setSlots(s.id, store.slotB); toast(`Opened ${s.name} as an image sequence`); } });
    });
    q(n, '[data-a="save"]').addEventListener('click', () => { const m = get(); if (m?.blob) saveBlob(m.blob, m.name); });
    q(n, '.ins-chip').addEventListener('click', () => { const m = get(); if (m) report(m); });
    n.addEventListener('dblclick', () => { const m = get(); if (m) void showPreview(m); });
    return n;
  }

  private update(n: HTMLElement, m: Media): void {
    const parent = store.get(m.parent);
    setText(q(n, '.ins-title'), m.name);
    setTitle(q(n, '.ins-title'), m.name);
    setText(q(n, '.ins-sub'), parent ? `${m.role === 'proxy' ? 'Proxy of' : 'From'} ${parent.name}` : '');
    setText(q(n, '.ins-fmt'), m.label);
    setTitle(q(n, '.ins-fmt'), m.label);
    setText(q(n, '.ins-orig'), m.origin === 'included' ? 'Included with the demo, made with FFmpeg' : 'Made in this page');
    setText(q(n, '.ins-size'), m.state === 'ready' ? fmtBytes(m.size) : '');
    const br = m.probe?.bitrate;
    setText(q(n, '.ins-rate'), m.state === 'ready' ? (br ? `${(br / 1e6).toFixed(2)} Mb/s` : m.form === 'archive' ? `${m.frames} files` : m.form === 'animation' ? `${m.frames} frames` : '') : '');
    const ready = m.state === 'ready';
    const bar = q(n, '.ins-track');
    setStyleVar(q(n, '.fe-bar-fill'), '--p', String(m.progress));
    setClass(bar, 'is-off', ready || m.state === 'failed');
    const chip = q(n, '.ins-chip');
    const checks = m.checks ?? [];
    const bad = checks.filter((c) => !c.ok);
    setHidden(chip, !ready || checks.length === 0);
    setText(chip, bad.length ? `${bad.length} of ${checks.length} differ` : `${checks.length} checks passed`);
    setClass(chip, 'is-bad', bad.length > 0);
    setTitle(chip, checks.map((c) => `${c.ok ? 'ok' : 'differs'}: ${c.label}, ${c.got}`).join('\n'));
    const msg = q(n, '.ins-msg');
    setText(msg, m.state === 'working' ? m.message : m.state === 'failed' ? m.message : '');
    n.dataset.status = m.state === 'ready' ? 'done' : m.state === 'working' ? 'encoding' : m.state === 'failed' ? 'failed' : 'ready';
    const isVideo = m.form === 'video';
    const vis = (sel: string, on: boolean): void => { q(n, sel).style.visibility = on ? 'visible' : 'hidden'; };
    vis('[data-a="a"]', isVideo && ready);
    vis('[data-a="b"]', isVideo && ready);
    vis('[data-a="play"]', ready);
    vis('[data-a="seq"]', m.form === 'archive' && ready);
    vis('[data-a="save"]', ready && !!m.blob);
    setClass(q(n, '[data-a="a"]'), 'is-active', m.id === store.slotA);
    setClass(q(n, '[data-a="b"]'), 'is-active', m.id === store.slotB);
  }
}
