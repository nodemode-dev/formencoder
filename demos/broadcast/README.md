# FormEncoder demo 2: delivery specs

An offline demo of what formencoder checks before a file goes to air or to a platform. It runs in any current Chromium browser (Chrome, Edge, Brave) with no engine, no backend and no network. It is the second of three demos: the Queue demo is `../../demo/index.html`, the third is `../inspect/index.html`; a quiet link row in the status bar moves between them.

## Open it

- Double-click `demos/broadcast/index.html` (it works from `file://`), or
- serve the repository with any static server and open `demos/broadcast/`.

Everything it needs (script, styles, fonts, icon, the programme) is inside this folder. Nothing is uploaded: files you open are read and encoded inside the page.

## What it shows

The interface is the real one: the Studio Dark tokens, the fifteen theme profiles, the dock and its panels, the inline icons and the Export Settings idiom, all imported from `frontend/src/`. It opens on a 17.4 s programme (aerial waves over a public-domain LibriVox reading, with six caption cues) already measured: the picture carries a timecode, the name and a "FOR REVIEW ONLY" text burned in live, with the captions on top. Sources, authors and licences are in `CREDITS.md`.

- **Delivery Profiles.** Broadcast (H.264 EBU R128, H.264 ATSC A/85, broadcast WAV, an XDCAM MXF master marked as desktop only), streaming, social and audio profiles. A profile sets the loudness standard, caption mode, overlays and the output preset together.
- **Loudness.** ITU-R BS.1770-4 integrated loudness, loudness range, true peak and the short-term graph for the source and for the delivery, with the target and tolerance band; a matrix of the programme against EBU R128, ATSC A/85, OP-59, ARIB TR-B32, streaming (-14 LUFS) and podcast (-16 LUFS) with the gain each needs; Normalise (linear gain, with a look-ahead limiter when asked).
- **Programme.** Playback with Source and Delivery listening (the Delivery side plays the normalised audio), timecode, a luma histogram with the legal-level limit and the optional legal-level clamp.
- **Delivery Settings.** The Export Settings fields for the output, loudness, captions (burned in or a sidecar in SRT, WebVTT, TTML or SCC) and overlays (timecode, name, text, logo), with in and out points.
- **Deliverables, Captions and the Verify Report.** Run Delivery renders the programme, writes the caption sidecar, writes the loudness report in the engine's own XML shape, and probes and measures the rendered file against the settings. The Captions panel lists the cues with reading-speed and line checks.

Run Delivery runs for real: a WebM (VP9 and Opus through WebCodecs) with the overlays and captions burned in and the audio at the target. The Verify Report is measured on the decoded file, not predicted. MXF, ProRes, DNxHR, H.264 and HEVC files and embedded caption tracks need the desktop engine; those profiles are shown, marked and not run.

Drop your own video, audio, `.srt` or `.vtt` file on the window, or use Open File.

## Browser support

WebCodecs `VideoEncoder` and `AudioEncoder` are needed for Run Delivery; the status bar says whether they are present. Loudness, captions and playback need only canvas and Web Audio.

## Rebuild

The committed output is `index.html`, `favicon.png` and `assets/` (`broadcast.js`, `broadcast.css`). To rebuild after changing `src/`, from this folder (the interface's own `node_modules` is used):

```
node ../../frontend/node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node ../../frontend/node_modules/vite/bin/vite.js build --config ./vite.config.mjs
```

The build emits one classic script, because browsers refuse module scripts on `file://`. It leaves everything outside `assets/` alone (`emptyOutDir` is false).

## Layout

- `index.html` · hand-written page with the pre-paint theme script
- `src/main.ts` · shell, dock layout, title bar, status bar and link row
- `src/job.ts` · the programme, settings, run and verify state
- `src/engine/` · standards table, meter, DSP, captions, overlay and report writers
- `src/panels/` · Profiles, Settings, Loudness, Deliverables, Captions, Log
- `media/programme.js` · the programme as a data pack; `src/data/programme.srt` the cues
- `HASHOUT_LOG.md` · why it is built this way; `CREDITS.md` · every asset
