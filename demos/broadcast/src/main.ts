import '../../../frontend/src/styles/tokens.css';
import '../../../frontend/src/styles/base.css';
import '../../../frontend/src/styles/fe.css';
import '../../../frontend/src/styles/scrollbars.css';
import '../../../demo/src/styles/fonts.css';
import './styles/broadcast.css';
import { supportNote } from '../../../demo/src/engine/encode';
import { Dialog } from '../../../frontend/src/ui/dialogs';
import { Dock, type Layout } from '../../../frontend/src/ui/dock';
import { el, q, revealApp, setClass, setStyleVar, setText } from '../../../frontend/src/ui/dom';
import { icon } from '../../../frontend/src/ui/icons';
import { contextMenu } from '../../../frontend/src/ui/popup';
import { applyTheme, readChoice, setTheme, THEMES } from '../../../frontend/src/ui/themes';
import { toast } from '../../../frontend/src/ui/toast';
import { VERSION } from '../../../frontend/src/version';
import { fmt } from './engine/meter';
import { job } from './job';
import { CaptionsPanel } from './panels/captions';
import { DeliverPanel } from './panels/deliver';
import { LoudnessPanel } from './panels/loudness';
import { LogPanel } from './panels/log';
import { ProfilesPanel } from './panels/profiles';
import { ProgrammePanel } from './panels/programme';
import { SettingsPanel } from './panels/settings';

const LAYOUT: Layout = {
  left: [{ panels: ['profiles', 'settings'], active: 'profiles', size: 1 }],
  center: [{ panels: ['programme'], active: 'programme', size: 1 }],
  right: [{ panels: ['loudness'], active: 'loudness', size: 1 }],
  bottom: [{ panels: ['deliver', 'captions', 'log'], active: 'deliver', size: 1 }],
  leftW: 392,
  rightW: 430,
  bottomH: 292,
};

function about(): void {
  const d = new Dialog('About this demo', 500);
  d.body.appendChild(el(`<div class="fx-about">
    <div class="fx-about-head"><img class="fx-mark" src="favicon.png" width="48" height="48" alt=""><div><div class="fx-about-name">FormEncoder ${VERSION}</div><div class="cv-note">Delivery specs demo · offline · nothing leaves this page</div></div></div>
    <p class="fx-note">This page shows what formencoder checks before a file goes to air or to a platform: loudness against EBU R128, ATSC A/85, OP-59, ARIB TR-B32 and streaming targets, captions as a sidecar or burned in, timecode and name overlays, and a verify report on the file that comes out.</p>
    <p class="fx-note">Loudness is measured to ITU-R BS.1770-4. Normalise applies a linear gain, with a look-ahead limiter when asked, and the output is measured again from the decoded file. The browser writes WebM and WAV; the desktop engine writes the rest of the 93 presets, MXF masters included.</p>
    <p class="fx-note">The programme is a Pexels aerial clip with a public-domain LibriVox reading and captions set from the Project Gutenberg text; see demos/broadcast/CREDITS.md. Drop your own video, audio or SRT file on the window.</p>
    <p class="fx-note">Apache-2.0 · NodeAgentc, Inc.</p>
  </div>`));
  d.button('Close', 'primary', () => d.close());
  d.open();
}

function menu(btn: HTMLElement, items: Parameters<typeof contextMenu>[2]): void {
  const r = btn.getBoundingClientRect();
  contextMenu(r.left, r.bottom + 4, items);
}

function openOwn(files: File[]): void {
  for (const f of files) {
    if (/\.(srt|vtt)$/i.test(f.name)) void f.text().then((t) => job.loadCaptions(t, f.name));
    else void job.adopt(f, null).catch((e: Error) => { job.log(`${f.name}: ${e.message}`, true); toast(`Could not open ${f.name}`, 'error'); });
  }
}

function start(): void {
  applyTheme();
  const dock = new Dock();
  const profiles = new ProfilesPanel();
  const settings = new SettingsPanel();
  const programme = new ProgrammePanel();
  const loudness = new LoudnessPanel();
  const deliver = new DeliverPanel();
  const captions = new CaptionsPanel();
  const log = new LogPanel();
  dock.register('profiles', 'Delivery Profiles', () => profiles);
  dock.register('settings', 'Delivery Settings', () => settings);
  dock.register('programme', 'Programme', () => programme);
  dock.register('loudness', 'Loudness', () => loudness);
  dock.register('deliver', 'Deliverables', () => deliver);
  dock.register('captions', 'Captions', () => captions);
  dock.register('log', 'Log', () => log);

  const shell = el(`<div class="cv-app fx-app">
    <header class="cv-titlebar fx-titlebar">
      <div class="cv-brand fx-brand" title="FormEncoder ${VERSION}"><img class="fx-mark" src="favicon.png" width="20" height="20" alt="" draggable="false"><span class="cv-brand-name">formencoder</span></div>
      <div class="fx-menubar-host"><nav class="cv-menubar"><button class="cv-menu-btn" type="button" data-m="file">File</button><button class="cv-menu-btn" type="button" data-m="help">Help</button></nav></div>
      <div class="fe-title-run"><span class="fe-run-dot"></span><span class="fe-run-text">Idle</span><span class="fe-run-bar"><span class="fe-bar-fill"></span></span></div>
      <div class="fx-title-tools">
        <span class="fe-badge">Delivery specs demo</span>
        <select class="fx-select fe-ws" title="Theme"></select>
        <button class="fx-agent-cta" type="button" data-t="open" title="Choose a video, audio or caption file">${icon('upload', 14)}<span>Open File</span></button>
        <button class="cv-icon-btn" type="button" data-t="about" title="About this demo">${icon('info', 16)}</button>
      </div>
    </header>
    <main class="fx-main"></main>
    <footer class="cv-status fx-status">
      <span class="fx-st-engine"><span class="fx-st-dot is-on"></span><span class="fx-st-eng-text"></span></span>
      <span class="fe-st-counts"></span>
      <span class="fx-flex"></span>
      <nav class="fb-demos" aria-label="Demos">
        <span class="fb-demos-label">Demos</span>
        <a class="fb-demo-link" href="../../demo/index.html">Queue and presets</a>
        <a class="fb-demo-link is-current" href="index.html" aria-current="page">Delivery specs</a>
        <a class="fb-demo-link" href="../inspect/index.html">Inspect and convert</a>
      </nav>
      <span class="fx-st-ver">${VERSION}</span>
    </footer>
    <input class="fd-file" type="file" accept="video/*,audio/*,.srt,.vtt" multiple>
  </div>`);
  q(document, '#app').appendChild(shell);
  q(shell, '.fx-main').appendChild(dock.el);
  dock.applyLayout(LAYOUT, 'Default');

  const themes = q<HTMLSelectElement>(shell, '.fe-ws');
  for (const [id, t] of Object.entries(THEMES)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = t.label;
    themes.appendChild(o);
  }
  themes.value = readChoice().theme;
  themes.addEventListener('change', () => setTheme(themes.value));

  const picker = q<HTMLInputElement>(shell, '.fd-file');
  picker.addEventListener('change', () => { openOwn(Array.from(picker.files ?? [])); picker.value = ''; });
  q(shell, '[data-t="open"]').addEventListener('click', () => picker.click());
  q(shell, '[data-t="about"]').addEventListener('click', about);
  const fileBtn = q(shell, '[data-m="file"]');
  fileBtn.addEventListener('click', () => menu(fileBtn, [
    { label: 'Open Video, Audio or Captions...', run: () => picker.click() },
    '-',
    { label: 'Run Delivery', enabled: !job.running && job.ready, run: () => void job.deliver() },
    { label: 'Stop', enabled: job.running, run: () => job.stop() },
  ]));
  const helpBtn = q(shell, '[data-m="help"]');
  helpBtn.addEventListener('click', () => menu(helpBtn, [
    { label: 'FormEncoder on GitHub', run: () => window.open('https://github.com/nodemode-dev/formencoder', '_blank', 'noopener') },
    { label: 'About this demo', run: about },
  ]));

  const run = q(shell, '.fe-title-run');
  const runText = q(shell, '.fe-run-text');
  const runBar = q(run, '.fe-bar-fill');
  job.on('run', () => {
    setClass(run, 'is-running', job.running);
    setText(runText, job.running ? `${job.deliverables[0]?.name ?? ''} · ${Math.round(job.progress * 100)}%` : 'Idle');
    setStyleVar(runBar, '--p', String(job.running ? job.progress : 0));
  });

  const counts = q(shell, '.fe-st-counts');
  const paintCounts = (): void => {
    const a = job.original;
    setText(counts, a ? `${job.name} · ${job.duration.toFixed(2)} s · ${fmt(a.integrated)} LUFS · ${fmt(a.truePeak)} dBTP · ${job.cues.length} caption cues` : 'Loading the programme');
  };
  job.on('source', paintCounts);
  job.on('cues', paintCounts);
  paintCounts();
  setText(q(shell, '.fx-st-eng-text'), `Browser engine · ${supportNote()}`);

  document.addEventListener('dragover', (e) => {
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    openOwn(files);
  });
  revealApp();
  void job.start();
}

start();
