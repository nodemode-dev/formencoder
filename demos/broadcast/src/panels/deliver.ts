import { Dialog } from '../../../../frontend/src/ui/dialogs';
import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setDisabled, setStyleVar, setText } from '../../../../frontend/src/ui/dom';
import { fmtBytes } from '../../../../frontend/src/ui/format';
import { icon } from '../../../../frontend/src/ui/icons';
import { PRESET_BY_ID, TARGET_EXT } from '../../../../demo/src/engine/presets';
import { CAPTION_EXT } from '../engine/captions';
import { fmt, signed } from '../engine/meter';
import { job, type Deliverable, type VerifyRow } from '../job';

const ICON: Record<Deliverable['key'], string> = { media: 'film', captions: 'captions', report: 'analyze', verify: 'check' };
const LABEL: Record<Deliverable['key'], string> = { media: 'Programme', captions: 'Captions', report: 'Loudness report', verify: 'Verify report' };

function planned(): Deliverable[] {
  const preset = PRESET_BY_ID.get(job.currentPreset());
  const s = job.settings;
  const stem = job.stem();
  const ext = preset?.target ? TARGET_EXT[preset.target] : 'out';
  return [
    { key: 'media', name: `${stem}_${preset?.id ?? 'out'}.${ext}`, detail: preset?.target ? `${preset.name}, ${s.range.start.toFixed(1)} to ${s.range.end.toFixed(1)} s` : `${preset?.name ?? ''} needs the desktop engine`, status: preset?.target ? 'idle' : 'skipped', blob: null, mime: '' },
    { key: 'captions', name: `${stem}_${preset?.id ?? 'out'}.${CAPTION_EXT[s.captions.format]}`, detail: s.captions.mode === 'sidecar' ? `${job.cues.length} cues as ${s.captions.format.toUpperCase()}` : s.captions.mode === 'burnin' ? 'Burned into the picture' : 'Not written', status: s.captions.mode === 'sidecar' ? 'idle' : 'skipped', blob: null, mime: '' },
    { key: 'report', name: `${stem}_${preset?.id ?? 'out'}.loudness.xml`, detail: s.loudness.enabled && s.loudness.report ? `Input and output of ${s.loudness.target} LUFS ${s.loudness.standard}` : 'Not written', status: s.loudness.enabled && s.loudness.report ? 'idle' : 'skipped', blob: null, mime: '' },
    { key: 'verify', name: `${stem}_${preset?.id ?? 'out'}.verify.json`, detail: 'Probe and loudness of the output file', status: 'idle', blob: null, mime: '' },
  ];
}

function preflight(): VerifyRow[] {
  const l = job.settings.loudness;
  const rows: VerifyRow[] = [];
  const p = job.processed?.analysis;
  if (l.enabled && p) {
    const diff = p.integrated - l.target;
    rows.push({ label: 'Integrated loudness', expected: `${l.target} LUFS ± ${l.tolerance} LU`, measured: `${fmt(p.integrated)} LUFS (${signed(diff)} LU)`, state: Math.abs(diff) <= l.tolerance ? 'pass' : 'fail' });
    rows.push({ label: 'True peak', expected: `at most ${l.truePeak} dBTP`, measured: `${fmt(p.truePeak)} dBTP`, state: p.truePeak <= l.truePeak + 0.05 ? 'pass' : 'fail' });
  } else if (job.original) {
    rows.push({ label: 'Loudness', expected: 'not normalised', measured: `${fmt(job.original.integrated)} LUFS, ${fmt(job.original.truePeak)} dBTP`, state: 'note' });
  }
  if (job.settings.captions.mode !== 'none') for (const c of job.captionChecks) rows.push({ label: `Captions: ${c.label}`, expected: job.settings.captions.mode === 'burnin' ? 'burned in' : job.settings.captions.format.toUpperCase(), measured: c.detail, state: c.ok ? 'pass' : 'fail' });
  const preset = PRESET_BY_ID.get(job.currentPreset());
  rows.push({ label: 'Encoder', expected: preset?.name ?? '', measured: preset?.target ? 'runs in this page' : 'needs the desktop engine', state: preset?.target ? 'pass' : 'note' });
  return rows;
}

export class DeliverPanel implements Panel {
  readonly id = 'deliver';
  readonly title = 'Deliverables';
  readonly el: HTMLElement;
  private readonly shot: HTMLCanvasElement;

  constructor() {
    this.el = el(`<div class="fb-deliver">
      <section class="fb-del-col">
        <div class="fe-bar">
          <button class="fe-run" type="button" data-a="run" title="Render the programme with the settings, write the sidecars and verify the output">${icon('play', 14)}<span class="fe-run-label">Run Delivery</span></button>
          <button class="cv-icon-btn" type="button" data-a="stop" title="Stop">${icon('stop', 14)}</button>
          <span class="fx-flex"></span>
          <span class="fx-note fb-del-state"></span>
        </div>
        <div class="fb-del-body">
          <div class="fe-enc-shot"><canvas width="352" height="198"></canvas></div>
          <div class="fb-del-side">
            <div class="fe-enc-progress"><span class="fe-bar-track"><span class="fe-bar-fill"></span></span><span class="fe-enc-pct">0%</span></div>
            <div class="fe-enc-msg"></div>
            <div class="fb-dl-list"></div>
          </div>
        </div>
      </section>
      <section class="fb-ver-col">
        <div class="fe-bar">
          <span class="fe-bar-title">${icon('check', 14)}<span class="fb-ver-title">Pre-flight</span></span>
          <span class="fe-badge fb-ver-sum"></span>
          <span class="fx-flex"></span>
          <span class="fx-note fb-ver-note"></span>
        </div>
        <div class="fb-ver-list"></div>
      </section>
    </div>`);
    this.shot = q<HTMLCanvasElement>(this.el, '.fe-enc-shot canvas');
    q(this.el, '[data-a="run"]').addEventListener('click', () => void job.deliver());
    q(this.el, '[data-a="stop"]').addEventListener('click', () => job.stop());
    q(this.el, '.fb-dl-list').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      const d = job.deliverables.find((x) => x.key === b?.dataset.key);
      if (!b || !d?.blob) return;
      if (b.dataset.act === 'save') this.save(d);
      else this.preview(d);
    });
    for (const t of ['deliverables', 'verify', 'run', 'settings', 'audio', 'cues', 'source', 'frame'] as const) job.on(t, () => this.paint());
    this.paint();
  }

  private save(d: Deliverable): void {
    if (!d.blob) return;
    const url = URL.createObjectURL(d.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = d.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  private preview(d: Deliverable): void {
    if (!d.blob) return;
    const dlg = new Dialog(`Preview · ${d.name}`, 760);
    const isVideo = d.mime.startsWith('video/');
    const media = document.createElement(isVideo ? 'video' : 'audio');
    media.controls = true;
    media.className = 'fb-preview-media';
    const url = URL.createObjectURL(d.blob);
    media.src = url;
    dlg.body.appendChild(media);
    dlg.button('Close', 'primary', () => { media.pause(); dlg.close(); window.setTimeout(() => URL.revokeObjectURL(url), 2000); });
    dlg.open();
  }

  private paintShot(): void {
    const g = this.shot.getContext('2d');
    if (!g) return;
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.shot.width, this.shot.height);
    const src = job.running && job.preview ? job.preview : job.video && job.video.readyState >= 2 ? job.video : null;
    if (!src) return;
    const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
    const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
    const k = Math.min(this.shot.width / sw, this.shot.height / sh);
    g.drawImage(src, (this.shot.width - sw * k) / 2, (this.shot.height - sh * k) / 2, sw * k, sh * k);
  }

  private paint(): void {
    const items = job.deliverables.length ? job.deliverables : planned();
    const running = job.running;
    setDisabled(q<HTMLButtonElement>(this.el, '[data-a="run"]'), running || !job.ready);
    setDisabled(q<HTMLButtonElement>(this.el, '[data-a="stop"]'), !running);
    setClass(q(this.el, '[data-a="run"]'), 'is-running', running);
    setText(q(this.el, '.fe-run-label'), running ? 'Running' : 'Run Delivery');
    setStyleVar(q(this.el, '.fe-bar-fill'), '--p', String(job.progress));
    setText(q(this.el, '.fe-enc-pct'), `${Math.round(job.progress * 100)}%`);
    setText(q(this.el, '.fe-enc-msg'), running ? job.message : job.deliverables.length ? '' : 'Run Delivery renders the programme with these settings, writes the sidecars and verifies the result.');
    setText(q(this.el, '.fb-del-state'), running ? 'Rendering' : job.deliverables.length ? 'Finished' : 'Ready');
    this.paintShot();
    patchList(q(this.el, '.fb-dl-list'), items, {
      key: (d) => d.key,
      create: (d) => el(`<div class="fb-dl" data-key="${d.key}"><span class="fb-dl-ic">${icon(ICON[d.key], 14)}</span><div class="fb-dl-main"><span class="fb-dl-name"></span><span class="fb-dl-detail"></span></div><span class="fb-dl-st"></span><button class="cv-icon-btn" type="button" data-act="preview" data-key="${d.key}" title="Preview">${icon('eye', 14)}</button><button class="cv-icon-btn" type="button" data-act="save" data-key="${d.key}" title="Save">${icon('upload', 14)}</button></div>`),
      update: (n, d) => {
        setText(q(n, '.fb-dl-name'), d.name);
        setText(q(n, '.fb-dl-detail'), d.status === 'done' && d.blob ? `${fmtBytes(d.blob.size)} · ${d.detail}` : d.detail || LABEL[d.key]);
        setText(q(n, '.fb-dl-st'), { idle: 'ready', running: 'running', done: 'done', failed: 'failed', skipped: 'not written' }[d.status]);
        n.dataset.status = d.status;
        setClass(n, 'is-done', d.status === 'done');
      },
    });
    const rows = job.verify.length ? job.verify : preflight();
    setText(q(this.el, '.fb-ver-title'), job.verify.length ? `Verify Report · ${job.deliverables[0]?.name ?? ''}` : 'Pre-flight');
    const bad = rows.filter((r) => r.state === 'fail').length;
    const good = rows.filter((r) => r.state === 'pass').length;
    setText(q(this.el, '.fb-ver-sum'), `${good} passed, ${bad} to look at`);
    setClass(q(this.el, '.fb-ver-sum'), 'is-warn', bad > 0);
    setText(q(this.el, '.fb-ver-note'), job.verify.length ? 'Measured on the rendered file' : 'Predicted from the settings, run the delivery to measure the file');
    patchList(q(this.el, '.fb-ver-list'), rows, {
      key: (r) => r.label,
      create: () => el('<div class="fb-vr"><span class="fb-vr-label"></span><span class="fb-vr-exp"></span><span class="fb-vr-got"></span><b class="fb-vr-state"></b></div>'),
      update: (n, r) => {
        setText(q(n, '.fb-vr-label'), r.label);
        setText(q(n, '.fb-vr-exp'), r.expected);
        setText(q(n, '.fb-vr-got'), r.measured);
        setText(q(n, '.fb-vr-state'), r.state === 'pass' ? 'pass' : r.state === 'fail' ? 'check' : 'note');
        setClass(n, 'is-pass', r.state === 'pass');
        setClass(n, 'is-fail', r.state === 'fail');
      },
    });
  }
}
