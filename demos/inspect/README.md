# FormEncoder demo 3: inspect and convert

An offline demo of how formencoder looks at media before and after an encode: probing and comparing sources, stepping frames exactly, comparing two encodes side by side, turning a clip into a numbered image sequence or an animated GIF, making proxies, and checking files with checksums. It runs in any current Chromium browser (Chrome, Edge, Brave) with no engine, no backend and no network. It is the third of three demos: the Queue demo is `../../demo/index.html`, the second is `../broadcast/index.html`; a quiet link row in the status bar moves between them.

## Open it

- Double-click `demos/inspect/index.html` (it works from `file://`), or
- serve the repository with any static server and open `demos/inspect/`.

Everything it needs is inside this folder (about 24 MB, mostly the footage). Nothing is uploaded: files you open are read inside the page.

## What it shows

The interface is the real one: Studio Dark tokens, the fifteen themes, the dock, the Media Browser card, Media Info rows and the Outputs list, imported from `frontend/src/`. It opens on a small hike shoot: three Pexels clips of different shapes (1280x720 at 29.97 fps, 1280x640 at 23.976 fps, a vertical 404x720 at 60 fps), a numbered JPEG sequence of clouds at 24 fps, and the outputs made from the first clip: a high and a low bitrate encode, a 960x540 proxy and an animated GIF. A and B are set to the stream clip and its low bitrate encode in Compare view. Sources, authors and licences are in `CREDITS.md`.

- **Media Browser.** The shoot as cards with thumbnails, frame counts and frame rates; Show in A or B, Create Proxy, Contact Sheet from the context menu.
- **Viewer.** Slots A and B take any source or output; A, B and Compare views; frame-accurate stepping with the arrow keys, Home and End, drop-frame timecode at 29.97 and 59.94 fps, frame numbers, In and Out marks, Fit and 1:1 with a synchronised pan, Save Frame (A, B or A and B side by side) and Contact Sheet.
- **Media Info.** The two probe columns with the rows that differ marked, a summary of the mixed rates and shapes, and the frame-number checks of a sequence (first, last, gaps).
- **Outputs.** Each output with its verify chips, A and B buttons, preview and save; Convert, Create Proxy and Verify All.
- **Ingest and Checksums.** MD5 of every file, Ingest All with size, MD5 or bit-for-bit verification of the copy, a test switch that damages one copy so a failed verification can be seen, a `.md5` list to save and a list to check.

Operations that run for real in the page: probing the file's own bytes, exact frame reads, WebM (VP9 and Opus through WebCodecs), animated GIF, PNG and JPEG numbered frames in a ZIP, stills, contact sheets, MD5. Scenes and other analysis, ProRes, MXF and the other desktop-only formats are not in the browser. Drop your own video files, a numbered image sequence or a `.md5` list on the window, or use Open Files.

## Browser support

WebCodecs `VideoEncoder` and `AudioEncoder` are needed for WebM; the status bar says whether they are present. Probing, stepping, GIF, ZIP, stills and MD5 need only canvas and the page's own code.

## Rebuild

The committed output is `index.html`, `favicon.png` and `assets/` (`inspect.js`, `inspect.css`). To rebuild after changing `src/`, from this folder (the interface's own `node_modules` is used):

```
node ../../frontend/node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node ../../frontend/node_modules/vite/bin/vite.js build --config ./vite.config.mjs
```

The build emits one classic script, because browsers refuse module scripts on `file://`. It leaves everything outside `assets/` alone (`emptyOutDir` is false).

## Layout

- `index.html` · hand-written page with the pre-paint theme script
- `src/main.ts` · shell, dock layout, menus, status bar and link row
- `src/loader.ts`, `src/store.ts`, `src/model.ts` · the curated shoot and the media store
- `src/panels/` · Browser, Viewer, Info, Outputs, Checksums, Log
- `src/work.ts`, `src/tools.ts` · conversion, frame export, Convert and Contact Sheet dialogs
- `src/lib/` · MD5, ZIP writer, timecode, GIF probe, save
- `media/*.js` · the footage and outputs as data packs
- `HASHOUT_LOG.md` · why it is built this way; `CREDITS.md` · every asset
