# demo · HASHOUT_LOG

Living context for the offline browser demo. The code carries no comments; the reasoning lives here.

## What it is

`demo/index.html` plus a committed build in `demo/assets/`. It opens from `file://` and from any static server and needs no engine, backend, Tauri or network. The sources are in `demo/src/`; they import the real interface code from `frontend/src/` and pair it with a small client-side engine, because the desktop engine (Rust `fe_core` driving a pinned LGPL FFmpeg) cannot run in a page.

## Build

- `demo/vite.config.mjs` builds one IIFE (`assets/demo.js`) and one stylesheet (`assets/demo.css`). Browsers refuse `<script type="module">` with a `file://` source, and Vite's HTML build always emits module tags, so `index.html` is written by hand and loads a classic deferred script. The config is `.mjs` and imports nothing from `vite`: the file sits outside `frontend/`, where Vite is not resolvable.
- Run the build from `frontend/` (`npx vite build --config ../demo/vite.config.mjs`) so the interface lockfile's Vite and `@fontsource` packages resolve. `demo/src/styles/fonts.css` imports only the latin subsets of Inter 400, 500, 600 and JetBrains Mono 400 (the interface's own `fonts.css` pulls every script, about forty files), and `assetsInlineLimit` inlines the woff2 files, so the page has no font requests and works from `file://`.
- `server.host` is `false` with port 5271 (preview 5272), as the interface's own config does.
- `demo/tsconfig.json` type-checks `demo/src` and, through the imports, the shared interface modules; run `npx tsc -p ../demo/tsconfig.json --noEmit` from `frontend/`.

## What is reused and what is new

- Reused unchanged: `styles/tokens.css`, `base.css`, `fe.css`, `scrollbars.css`; `ui/dock.ts` (the real dock with its tab groups, splits, floating and maximise behaviour), `ui/dom.ts` (`patchList`, `setText`, `revealApp` and the rest of the in-place primitives), `ui/icons.ts`, `ui/themes.ts` (the fifteen profiles), `ui/format.ts`, `ui/dialogs.ts`, `ui/popup.ts`, `ui/toast.ts`, `version.ts`.
- `index.html` repeats the pre-paint theme script of `frontend/index.html` (same profiles, same `formencoder_ui_settings` key), so the theme is set before the first paint and `#app` stays hidden until `revealApp`.
- The panels are new files with the app's class names (`fe-queue`, `fe-q-out`, `fe-p-row`, `fe-info`, `fe-enc-row`, `fe-log`, `fe-field`) so `fe.css` styles them. They read a small store (`src/state.ts`) instead of the engine socket. `src/styles/demo.css` only adds what the shared sheets lack, all from tokens.
- The Preset Browser rows come from `native/fencoder-plan/src/presets.rs` (93 system presets: id, name, category, format, frame size, rate, target rate), written to `src/engine/preset-rows.ts` once by a throwaway script. `engine/presets.ts` decides what the browser can write for each: H.264, HEVC, AV1, MPEG-2, Blu-ray and Matroska presets map to WebM, WebM VP9 stays WebM, GIF to GIF, WAV and BWF to WAV, AIFF, Ogg, the two stills to PNG and JPEG. Everything else (ProRes, DNxHR, CineForm, MXF, AS-10, AS-11, P2, DCP, image sequences, MP3, AAC, FLAC, VP9 with alpha, FFV1) is marked, dimmed and skipped. 42 of 93 run.

## Engine decisions

- Probe reads slices of the `File` and parses the container itself (MP4 and MOV boxes, EBML, RIFF, Ogg, FLAC, MPEG audio) so the Media Info rows show real container facts (profile and level from `avcC`, frame count from `stts`, sample rate and channels from the sample entry) instead of only what a media element reports. A media element still supplies duration for odd files, frames for encoding and the fallback frame rate (`requestVideoFrameCallback` timings snapped to the common rates).
- Loudness is BS.1770-4 with the K-weighting coefficients derived from the sample rate, 100 ms sub-blocks combined into 400 ms and 3 s windows, the absolute and relative gates, and a four-times-oversampled true peak found only around the loud samples. Integrated loudness agrees with FFmpeg's `ebur128` to a tenth of a LU on the test files; loudness range does not match as closely (4.8 LU here against 5.6 LU from FFmpeg on the generated sample), so treat it as an estimate.
- Normalisation is a linear gain capped so the true peak stays at or under -1 dBTP; when the cap bites, the status says so and the result is measured again so the reported loudness is the real one.
- WebM is written by `engine/webm.ts`: EBML header, Info, Tracks (VP9 or VP8, Opus with CodecPrivate and codec delay), clusters that start on video key frames and never exceed 30 s, and Cues so players can seek. `AudioEncoder` Opus packets and `VideoEncoder` chunks arrive with microsecond timestamps; blocks are sorted by time. FFmpeg decodes the output without warnings.
- Ogg Opus uses the Ogg page CRC (polynomial 0x04c11db7, no reflection) and a pre-skip of 312 samples. GIF uses a median-cut palette per frame from a sample of the pixels, a 4x4 ordered dither and LZW with clear codes at 4096; delays are centiseconds. AIFF writes the 80-bit extended sample rate from an integer.
- Frame access for a file is `video.currentTime` then `seeked`, then `drawImage`. The poster frame for Media Info is drawn once, before any encode, so the shared element is never seeked by the UI while the queue runs. The generated sample draws its own frames from time, so it needs no element.
- Frame size is capped at 1280 px on the long side and bit rate scales with the pixel ratio to the preset, because VP9 in software on a laptop is the limit; the status line and the output note say when the cap applied. Presets with a frame size letterbox the source inside it (black bars) rather than stretch.
- The queue runs one output at a time and a stop aborts through `AbortController` between frames.

## DOM stability

- Lists use `patchList` keyed by ids; progress sets text and the `--p` custom property on existing nodes; the Save and Preview buttons of an output row exist from the start and are `visibility: hidden` until it is done, so finishing an output moves nothing.
- Media Info and Encoding previews are canvases inside boxes with a fixed aspect ratio; kv rows are patched in place; the Export Settings and Preview dialogs are built once and their rows are shown or hidden before the dialog opens.
- The Log appends nodes and keeps its scroll position unless it was at the end.

## Known limits

- Chromium-based browsers only for WebM and Ogg Opus (WebCodecs); GIF, WAV, AIFF, stills, probe and loudness need only canvas and Web Audio. Firefox and Safari lack parts of WebCodecs; the status bar reports what is present.
- A source is decoded whole for audio; files over 600 MB are encoded without their audio.
- Seeking a 1080p H.264 clip frame by frame is slow on a CPU without hardware decode; a 5 s clip at 1080p takes about a minute per video output on a shared two-core machine.
- Output frames and sizes are the browser's; nothing here is a claim about the desktop engine's output.
