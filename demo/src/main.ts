import '../../frontend/src/styles/tokens.css';
import '../../frontend/src/styles/base.css';
import '../../frontend/src/styles/fe.css';
import '../../frontend/src/styles/scrollbars.css';
import './styles/fonts.css';
import './styles/demo.css';
import { Dialog } from '../../frontend/src/ui/dialogs';
import { Dock, type Layout } from '../../frontend/src/ui/dock';
import { el, q, revealApp, setClass, setStyleVar, setText } from '../../frontend/src/ui/dom';
import { icon } from '../../frontend/src/ui/icons';
import { contextMenu } from '../../frontend/src/ui/popup';
import { applyTheme, readChoice, setTheme, THEMES } from '../../frontend/src/ui/themes';
import { VERSION } from '../../frontend/src/version';
import { supportNote } from './engine/encode';
import { EncodingPanel } from './panels/encoding';
import { InfoPanel } from './panels/info';
import { LogPanel } from './panels/log';
import { PresetsPanel } from './panels/presets';
import { QueuePanel } from './panels/queue';
import { PRESETS } from './engine/presets';
import { store, type Output } from './state';

const LAYOUT: Layout = {
  left: [{ panels: ['presets'], active: 'presets', size: 1 }],
  center: [{ panels: ['queue'], active: 'queue', size: 1 }],
  right: [{ panels: ['info'], active: 'info', size: 1 }],
  bottom: [{ panels: ['encoding', 'log'], active: 'encoding', size: 1 }],
  leftW: 470,
  rightW: 330,
  bottomH: 250,
};

function about(): void {
  const d = new Dialog('About this demo', 480);
  d.body.appendChild(el(`<div class="fx-about">
    <div class="fx-about-head"><img class="fx-mark" src="favicon.png" width="48" height="48" alt=""><div><div class="fx-about-name">FormEncoder ${VERSION}</div><div class="cv-note">Browser demo · offline · nothing leaves this page</div></div></div>
    <p class="fx-note">This page runs the interface of FormEncoder with a small encoding engine written for the browser: it reads your file, shows its streams and loudness, and writes WebM (VP9 or VP8 with Opus), animated GIF, WAV, AIFF, Ogg Opus and stills through WebCodecs and canvas.</p>
    <p class="fx-note">The desktop app does the rest of the 93 presets (ProRes, DNxHR, MXF, DCP, H.264 and HEVC files and more) with its Rust engine and a pinned LGPL FFmpeg. Those presets are listed here, marked, and skipped when the queue runs.</p>
    <p class="fx-note">The queue opens on three Pexels clips (25, 29.97 and 59.94 fps, one of them vertical) and a LibriVox reading in the public domain; authors and licences are in demo/CREDITS.md.</p>
    <p class="fx-note">Apache-2.0 · NodeAgentc, Inc.</p>
  </div>`));
  d.button('Close', 'primary', () => d.close());
  d.open();
}

function menu(btn: HTMLElement, items: Parameters<typeof contextMenu>[2]): void {
  const r = btn.getBoundingClientRect();
  contextMenu(r.left, r.bottom + 4, items);
}

function start(): void {
  applyTheme();
  const dock = new Dock();
  const queue = new QueuePanel();
  const info = new InfoPanel();
  const presets = new PresetsPanel();
  const encoding = new EncodingPanel();
  const log = new LogPanel();
  dock.register('queue', 'Queue', () => queue);
  dock.register('info', 'Media Info', () => info);
  dock.register('presets', 'Preset Browser', () => presets);
  dock.register('encoding', 'Encoding', () => encoding);
  dock.register('log', 'Log', () => log);

  const shell = el(`<div class="cv-app fx-app">
    <header class="cv-titlebar fx-titlebar">
      <div class="cv-brand fx-brand" title="FormEncoder ${VERSION}"><img class="fx-mark" src="favicon.png" width="20" height="20" alt="" draggable="false"><span class="cv-brand-name">formencoder</span></div>
      <div class="fx-menubar-host"><nav class="cv-menubar"><button class="cv-menu-btn" type="button" data-m="file">File</button><button class="cv-menu-btn" type="button" data-m="help">Help</button></nav></div>
      <div class="fe-title-run"><span class="fe-run-dot"></span><span class="fe-run-text">Idle</span><span class="fe-run-bar"><span class="fe-bar-fill"></span></span></div>
      <div class="fx-title-tools">
        <span class="fe-badge">Browser demo</span>
        <select class="fx-select fe-ws" title="Theme"></select>
        <button class="cv-icon-btn" type="button" data-t="sample" title="Add the built-in sample">${icon('film', 16)}</button>
        <button class="fx-agent-cta" type="button" data-t="open" title="Choose a video or audio file">${icon('upload', 14)}<span>Open File</span></button>
        <button class="cv-icon-btn" type="button" data-t="about" title="About this demo">${icon('info', 16)}</button>
      </div>
    </header>
    <main class="fx-main"></main>
    <footer class="cv-status fx-status">
      <span class="fx-st-engine"><span class="fx-st-dot is-on"></span><span class="fx-st-eng-text"></span></span>
      <span class="fe-st-counts"></span>
      <span class="fx-flex"></span>
      <nav class="dm-demos" aria-label="Demos">
        <span class="dm-demos-label">Demos</span>
        <a class="dm-demo-link is-current" href="index.html" aria-current="page">Queue and presets</a>
        <a class="dm-demo-link" href="../demos/broadcast/index.html">Delivery specs</a>
        <a class="dm-demo-link" href="../demos/inspect/index.html">Inspect and convert</a>
      </nav>
      <span class="fx-st-ver">${VERSION}</span>
    </footer>
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

  q(shell, '[data-t="sample"]').addEventListener('click', () => void store.addSample());
  q(shell, '[data-t="open"]').addEventListener('click', () => queue.openPicker());
  q(shell, '[data-t="about"]').addEventListener('click', about);
  const fileBtn = q(shell, '[data-m="file"]');
  fileBtn.addEventListener('click', () => menu(fileBtn, [
    { label: 'Add Source...', run: () => queue.openPicker() },
    { label: 'Add Built-in Sample', run: () => void store.addSample() },
    '-',
    { label: 'Start Queue', enabled: !store.running, run: () => void store.start() },
    { label: 'Stop Queue', enabled: store.running, run: () => store.stop() },
    '-',
    { label: 'Remove Selected', enabled: !store.running, run: () => store.removeSelected() },
  ]));
  const helpBtn = q(shell, '[data-m="help"]');
  helpBtn.addEventListener('click', () => menu(helpBtn, [
    { label: 'FormEncoder on GitHub', run: () => window.open('https://github.com/nodemode-dev/formencoder', '_blank', 'noopener') },
    { label: 'About this demo', run: about },
  ]));

  const run = q(shell, '.fe-title-run');
  const runText = q(shell, '.fe-run-text');
  const runBar = q(run, '.fe-bar-fill');
  let active: Output | null = null;
  const paintRun = (): void => {
    const o = store.running ? active : null;
    setClass(run, 'is-running', store.running);
    if (!store.running || !o) {
      setText(runText, store.running ? 'Starting' : 'Idle');
      setStyleVar(runBar, '--p', '0');
      return;
    }
    setText(runText, `${o.fileName} · ${Math.round(o.progress * 100)}%`);
    setStyleVar(runBar, '--p', String(o.progress));
  };
  store.on('progress', (o) => { active = o as Output; paintRun(); });
  store.on('run', paintRun);

  const counts = q(shell, '.fe-st-counts');
  const paintCounts = (): void => {
    const outs = store.items.flatMap((i) => i.outputs);
    const done = outs.filter((o) => o.status === 'done').length;
    setText(counts, `${store.items.length} source${store.items.length === 1 ? '' : 's'} · ${outs.length} outputs · ${done} done · ${PRESETS.filter((p) => p.target).length} of ${PRESETS.length} presets run in this page`);
  };
  store.on('items', paintCounts);
  store.on('progress', paintCounts);
  paintCounts();
  setText(q(shell, '.fx-st-eng-text'), `Browser engine · ${supportNote()}`);

  document.addEventListener('dragover', (e) => {
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    for (const f of files) void store.addFile(f);
  });

  revealApp();
  void store.addCurated();
}

start();
