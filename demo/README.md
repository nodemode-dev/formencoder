# FormEncoder browser demo

An offline demo of FormEncoder that runs in any current Chromium browser (Chrome, Edge, Brave) with no engine, no backend and no network.

## Open it

- Double-click `demo/index.html` (it works from `file://`), or
- serve the folder with any static server, for example `python3 -m http.server -d demo 8080`.

Everything it needs (scripts, styles, fonts, the icon) is inside this folder. Nothing is uploaded: files you open are read and encoded inside the page.

## What it shows

The interface is the real one: the Studio Dark tokens, the fifteen theme profiles, the dock, the Queue, Preset Browser, Media Info, Encoding and Log panels, the inline icon set and the Export Settings idiom, all imported from `frontend/src/`. The engine behind it is a small TypeScript one written for the browser.

It starts with a built-in sample (a 640x360, 24 fps, 8 s clip with stereo audio, generated procedurally in the page) and three outputs ready to run. Drop your own video or audio file on the window, press the plus in the Queue, or use Open File.

Operations that run for real:

- **Probe.** Container and stream details read from the file's own bytes: MP4 and MOV boxes, WebM and Matroska elements, WAV, Ogg, FLAC and MP3 headers (codec, profile, frame size, frame rate, frame count, sample rate, channels, bit rate).
- **Loudness.** ITU-R BS.1770-4 integrated loudness, EBU R128 loudness range, sample peak and oversampled true peak, measured on the decoded audio.
- **Encode to WebM.** VP9 (or VP8) video and Opus audio through WebCodecs, at the preset's frame size, frame rate and bit rate (frame size capped at 1280 px for speed), with in and out points, written by a WebM muxer with cues.
- **Animated GIF.** Median-cut palette per frame, ordered dither, LZW, looping.
- **Audio files.** WAV (16 or 24 bit), AIFF and Ogg Opus, with optional loudness normalisation to a target (-23, -24, -16 or -14 LUFS) held under -1 dBTP.
- **Stills.** PNG and JPEG of the first frame of the range, and Save Frame from Media Info.
- **Queue.** Several outputs per source, add outputs by double-clicking or dragging a preset from the Preset Browser, Export Settings per output (frame size, rate, bit rate, codec, audio, loudness target, range), live progress with a preview of the frame being encoded, then Save or Preview each result.

The Preset Browser lists all 93 system presets of the desktop engine, read from `native/fencoder-plan/src/presets.rs`. 42 run in the page (H.264, HEVC, AV1 and WebM presets write WebM at the preset's frame size and rate; the rest of the video presets, ProRes, DNxHR, MXF, DCP, image sequences, MP3, AAC and FLAC need the desktop engine and are marked, dimmed and skipped when the queue runs).

## Browser support

WebCodecs `VideoEncoder` and `AudioEncoder` are needed for WebM and Ogg Opus; the status bar says whether they are present. GIF, WAV, AIFF, stills, probing and loudness need only canvas and Web Audio.

## Rebuild

The committed output is `index.html`, `favicon.png` and `assets/` (`demo.js`, `demo.css`; about 460 KB). To rebuild after changing `demo/src/`:

```
cd frontend
npm ci
npx tsc -p ../demo/tsconfig.json --noEmit
npx vite build --config ../demo/vite.config.mjs
```

The build uses the interface's own lockfile (Vite and the Inter and JetBrains Mono faces). It emits one classic script, because browsers refuse module scripts on `file://`. `npx vite --config ../demo/vite.config.mjs` serves the sources on port 5271 (`host: false`).

## Layout

- `index.html` · hand-written page with the pre-paint theme script
- `src/main.ts` · shell, dock layout, title bar, status bar
- `src/state.ts` · the queue store and runner
- `src/engine/` · probe, loudness, sources, WebM, Ogg, GIF, PCM, presets, encode
- `src/panels/` · Queue, Preset Browser, Media Info, Encoding, Log, Export Settings, Preview
- `HASHOUT_LOG.md` · why it is built this way
