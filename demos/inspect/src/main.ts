import '../../../frontend/src/styles/tokens.css';
import '../../../frontend/src/styles/base.css';
import '../../../frontend/src/styles/fe.css';
import '../../../frontend/src/styles/scrollbars.css';
import './styles/fonts.css';
import './styles/inspect.css';
import { Dialog } from '../../../frontend/src/ui/dialogs';
import { Dock, type Layout } from '../../../frontend/src/ui/dock';
import { el, q, revealApp, setClass, setStyleVar, setText } from '../../../frontend/src/ui/dom';
import { icon } from '../../../frontend/src/ui/icons';
import { contextMenu } from '../../../frontend/src/ui/popup';
import { applyTheme, readChoice, setTheme, THEMES } from '../../../frontend/src/ui/themes';
import { VERSION } from '../../../frontend/src/version';
import { addFiles, pickFiles } from './intake';
import { loadCurated, OPENING_RANGE } from './loader';
import { BrowserPanel } from './panels/browser';
import { ChecksumsPanel } from './panels/checksums';
import { InfoPanel } from './panels/info';
import { LogPanel } from './panels/log';
import { OutputsPanel } from './panels/outputs';
import { ViewerPanel } from './panels/viewer';
import { store } from './store';
import { isWorking, openContactSheet, openConvert } from './tools';

const LAYOUT: Layout = {
  left: [{ panels: ['browser'], active: 'browser', size: 1 }],
  center: [{ panels: ['viewer'], active: 'viewer', size: 1 }],
  right: [{ panels: ['info'], active: 'info', size: 1 }],
  bottom: [{ panels: ['outputs', 'checksums', 'log'], active: 'outputs', size: 1 }],
  leftW: 276,
  rightW: 352,
  bottomH: 262,
};

function about(): void {
  const d = new Dialog('About this demo', 500);
  d.body.appendChild(el(`<div class="fx-about">
    <div class="fx-about-head"><img class="fx-mark" src="favicon.png" width="48" height="48" alt=""><div><div class="fx-about-name">FormEncoder ${VERSION}</div><div class="cv-note">Inspect and convert · browser demo · offline</div></div></div>
    <p class="fx-note">The interface is the real one. The engine behind it is a small browser one: it reads your files' own bytes for Media Info, steps frames exactly, writes WebM, animated GIF and numbered frame sequences, and computes MD5 for the ingest check.</p>
    <p class="fx-note">The two encodes in the Outputs list, the proxy and the GIF were made with FFmpeg before the demo shipped. Everything you add with Convert is made in this page.</p>
    <p class="fx-note">Scenes, analysis, ProRes, MXF and the other desktop-only formats are not in the browser. Footage is from Pexels; authors and licences are in CREDITS.md.</p>
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
  const browser = new BrowserPanel();
  const viewer = new ViewerPanel();
  const info = new InfoPanel();
  const outputs = new OutputsPanel();
  const sums = new ChecksumsPanel();
  const log = new LogPanel();
  dock.register('browser', 'Media Browser', () => browser);
  dock.register('viewer', 'Viewer', () => viewer);
  dock.register('info', 'Media Info', () => info);
  dock.register('outputs', 'Outputs', () => outputs);
  dock.register('checksums', 'Ingest and Checksums', () => sums);
  dock.register('log', 'Log', () => log);

  const shell = el(`<div class="cv-app fx-app">
    <header class="cv-titlebar fx-titlebar">
      <div class="cv-brand fx-brand" title="FormEncoder ${VERSION}"><img class="fx-mark" src="favicon.png" width="20" height="20" alt="" draggable="false"><span class="cv-brand-name">formencoder</span></div>
      <div class="fx-menubar-host"><nav class="cv-menubar"><button class="cv-menu-btn" type="button" data-m="file">File</button><button class="cv-menu-btn" type="button" data-m="tools">Tools</button><button class="cv-menu-btn" type="button" data-m="help">Help</button></nav></div>
      <div class="fe-title-run"><span class="fe-run-dot"></span><span class="fe-run-text">Idle</span><span class="fe-run-bar"><span class="fe-bar-fill"></span></span></div>
      <div class="fx-title-tools">
        <span class="fe-badge">Browser demo</span>
        <select class="fx-select fe-ws" title="Theme"></select>
        <button class="fx-agent-cta" type="button" data-t="open" title="Open video files or a numbered image sequence">${icon('upload', 14)}<span>Open Files</span></button>
        <button class="cv-icon-btn" type="button" data-t="about" title="About this demo">${icon('info', 16)}</button>
      </div>
    </header>
    <main class="fx-main"></main>
    <footer class="cv-status fx-status">
      <span class="fx-st-engine"><span class="fx-st-dot is-on"></span><span class="fx-st-eng-text"></span></span>
      <span class="fe-st-counts"></span>
      <span class="fx-flex"></span>
      <nav class="ins-demos" aria-label="Demos">
        <span class="ins-demos-label">Demos</span>
        <a class="ins-demo-link" href="../../demo/index.html">Queue and presets</a>
        <a class="ins-demo-link" href="../broadcast/index.html">Delivery specs</a>
        <a class="ins-demo-link is-current" href="index.html" aria-current="page">Inspect and convert</a>
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

  q(shell, '[data-t="open"]').addEventListener('click', () => pickFiles());
  q(shell, '[data-t="about"]').addEventListener('click', about);
  const fileBtn = q(shell, '[data-m="file"]');
  fileBtn.addEventListener('click', () => menu(fileBtn, [
    { label: 'Open Files...', run: () => pickFiles() },
    { label: 'Convert...', run: () => openConvert() },
  ]));
  const toolsBtn = q(shell, '[data-m="tools"]');
  toolsBtn.addEventListener('click', () => menu(toolsBtn, [
    { label: 'Contact Sheet...', run: () => openContactSheet() },
    { label: 'Convert...', run: () => openConvert() },
    '-',
    { label: 'Compare A and B', run: () => store.setView('compare') },
    { label: 'Fit', run: () => store.setZoom('fit') },
    { label: '1:1 Pixels', run: () => store.setZoom('actual') },
  ]));
  const helpBtn = q(shell, '[data-m="help"]');
  helpBtn.addEventListener('click', () => menu(helpBtn, [
    { label: 'FormEncoder on GitHub', run: () => window.open('https://github.com/nodemode-dev/formencoder', '_blank', 'noopener') },
    { label: 'About this demo', run: about },
  ]));

  const run = q(shell, '.fe-title-run');
  const runText = q(shell, '.fe-run-text');
  const runBar = q(run, '.fe-bar-fill');
  const paintRun = (): void => {
    const w = store.get(store.working);
    const on = isWorking() && !!w;
    setClass(run, 'is-running', on);
    setText(runText, on && w ? `${w.name} · ${Math.round(w.progress * 100)}%` : 'Idle');
    setStyleVar(runBar, '--p', on && w ? String(w.progress) : '0');
  };
  store.on('work', paintRun);

  const counts = q(shell, '.fe-st-counts');
  const paintCounts = (): void => {
    const done = store.outputs().filter((m) => m.state === 'ready').length;
    setText(counts, `${store.sources().length} sources · ${done} outputs`);
  };
  store.on('items', paintCounts);
  paintCounts();
  setText(q(shell, '.fx-st-eng-text'), 'Browser engine · probe, exact frames, WebM, GIF, frame sequences, MD5');

  document.addEventListener('dragover', (e) => {
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    void addFiles(files);
  });

  store.setMarks(OPENING_RANGE.markIn, OPENING_RANGE.markOut);
  revealApp();
  void loadCurated();
}

start();
