# demos/broadcast · HASHOUT_LOG

Living context for demo 2, the delivery specs demo. The code carries almost no comments; the reasoning lives here. Demo 1 (`../../demo/HASHOUT_LOG.md`) explains the shared approach: the real interface from `frontend/src/` over a small browser engine, a classic IIFE build so `file://` works, media as JavaScript data packs.

## Focus and why

Demo 1 is the Queue: presets, probe, a few encodes. This one shows the work a delivery department does around an encode: loudness against a named standard, captions as a sidecar or burned in, timecode and name burn-in, a profile per destination, and a verify report on the file that comes out. Every one of these is a real formencoder feature (`effects.loudness`, `effects.timecodeOverlay`, `nameOverlay`, `textOverlay`, `imageOverlay`, `captions`, `captions.convert`, `verify`, the `h264-broadcast-ebu`, `h264-broadcast-atsc`, `bwf-ebu`, `youtube-1080p` and `webm-vp9-1080p` presets); the standards table in `src/engine/standards.ts` mirrors the loudness table in `native/fencoder-plan/src/settings.rs` (EBU R128 -23 LUFS and -1 dBTP, ATSC A/85 and OP-59 -24 and -2, ARIB TR-B32 -24 and -1, streaming -14, podcast -16; tolerance 1 LU; limiter look-ahead 5 ms, release 50 ms).

## Build

`vite.config.mjs` builds `src/main.ts` to one IIFE (`assets/broadcast.js`) and `assets/broadcast.css`, with `emptyOutDir` false and the output inside this folder, so a build never touches anything else. Run it from this folder with the interface's installed Vite (see `README.md`). `index.html` is written by hand with the pre-paint theme script of demo 1 so the theme is set before the first paint and `#app` stays hidden until `revealApp`. The dev server is `host: false` on port 5273.

## Reuse

Imported by path, read only: `frontend/src/styles` and `ui/*` (dock, dom, dialogs, popup, themes, toast, icons), `demo/src/styles/fonts.css`, and from demo 1 `engine/encode` (the WebM render and the support note), `engine/presets` (preset rows and the format labels). Nothing from `demo/` is copied. Panels are new files using the app's class names, with `src/styles/broadcast.css` adding only what the shared sheets lack, from tokens.

## Decisions

- **One programme, measured once.** `media/programme.js` holds one 17.4 s clip. The page decodes the audio, runs the BS.1770-4 meter once for the source and keeps the 3 s short-term series, so switching a standard or a target only recomputes the gain and the matrix. Normalise is a linear gain; the limiter option runs a look-ahead limiter at the true-peak ceiling. The delivery numbers on screen are recomputed from the processed samples, and Run Delivery measures the decoded output again, so the Verify Report is a measurement.
- **Captions.** Cues are parsed from SRT or WebVTT and written as SRT, WebVTT, TTML and SCC (29.97 drop frame, pop-on, rows 14 and 15). Checks (reading speed above 17 characters per second, line length over 42, more than two lines, duration under one second, gaps under two frames, overlaps) are shown in the Captions panel and in the Verify Report. The sample cues are fast on purpose in two places so the report has a "check" to look at.
- **Burn-in.** Overlays and captions are drawn on a canvas per frame with the same code for the live Programme view and the render, so what is shown is what is written. Timecode starts at 01:00:00:00, as a broadcast programme does.
- **Render.** Run Delivery uses demo 1's WebCodecs encoder and WebM muxer by path. A width choice (640 px, quick, up to 1280) and in and out points keep a run short on a slow machine. MXF, ProRes, DNxHR, H.264 and HEVC files and embedded caption tracks are not written in a page; their profiles are shown and marked "Desktop".
- **Report shapes.** The loudness report is the XML the engine writes (`write_loudness_report`: standard, target, true peak ceiling, then input and output measures). The verify file is JSON of the checks with expected, measured and result.
- **Frame rate check.** The container of a WebM does not state a frame rate, so that row is a "note", not a failure.
- **Zero flash.** Panels use `patchList` and `setText` in place; the Programme canvas has its size reserved before the clip is decoded and shows "Loading the programme" in place; the pack loads by script tag and the shell is never rebuilt. Checked under 4x CPU and a throttled network: one layout shift of 0.0007.

## Not done

Embedded caption tracks, MXF and the other desktop-only formats, and multi-channel (5.1) loudness; all need the desktop engine.
