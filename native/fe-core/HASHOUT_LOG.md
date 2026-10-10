# fe-core · HASHOUT_LOG

Living context for formencoder's encoding engine. The code carries almost no comments; the reasoning lives here.

## What it is

fe-core is formencoder's engine, written in Rust and loaded by the engine service as the `fe_core` Python extension (PyO3, abi3 for Python 3.10 and later). It owns the queue, the export settings model, the presets, the FFmpeg graph builder, the parallel runner, watch folders, logs and every command the interface and the agents call. Python around it does only what needs the network or the web stack: HTTP and the live socket, MCP, the family bridge (formcut, formvfx, formwav, formvis) and publish destinations.

FFmpeg is a separate program, never linked. The engine builds argument lists and runs `ffmpeg` and `ffprobe` as child processes, so FFmpeg's licence does not reach formencoder's binaries.

## Shape

- **One `Engine`, one thread.** `py.rs` exposes it as an unsendable pyclass; the service calls it from a single host thread. Encodes run on worker threads that own their FFmpeg child and talk back through `runner::Shared` (updates, result, pid, stop and pause flags). `Engine::tick` drains those, emits events, finishes jobs, scans watch folders, autostarts and dispatches.
- **The document is JSON.** `doc = {items, watch}` is a `serde_json::Value`, saved to `queue.json` beside the runtime of finished outputs. JSON keeps the command layer, the interface and the agents on one shape with no translation, and an undo step is the previous `doc` (100 kept).
- **Commands are a table.** `commands.rs` lists every id with its label, menu, parameter schema, required keys, undoable or query flag, shortcut and doc line. `check` rejects unknown keys and bad enums before a command runs, so an agent gets a sentence instead of a silent no-op. Ids and parameter names stay stable between releases.
- **`batch`.** Steps run in order inside one undo step; `"$N.key"` (counted from 1) is replaced by a value from step N's result. Atomic by default: a failing step restores the document.
- **Family and publish cross the boundary as events.** A family source (formcut sequence, formvfx comp, formwav mix, formvis image) is materialised by Python: the runner emits `familyRequest`, waits, and Python answers with `family.resolved {output, media | error}`. Publish works the same way with `publishRequest` and `publish.result`. The engine never opens a socket.

## Settings

- One settings object per output, normalised by `settings::normalize` against `settings::default(format)`. `apply_patch` takes nested objects or dotted keys (`video.width`), switches format while keeping range, crop, scaling, effects, captions, metadata and publish, and renames the preset to `Name (modified)` the way Media Encoder does.
- Output names come from tokens: `{source} {preset} {format} {date} {time} {width} {height} {fps} {index}`; image sequences add `_%06d`. `incrementNames` adds `_1`, `_2` instead of overwriting.
- `formats.rs` holds the 33 formats, their codecs, containers and the field specs (`fields`) the Export Settings dialog and the agents both read, with `showIf` conditions, so neither side hard-codes which control belongs to which format.

## FFmpeg

- **Locator order:** Preferences `ffmpegDir`, `FORMENCODER_FFMPEG_DIR`, the frozen app's own folders, the per-person data folder, formcut's folder, the clone's `src-tauri/ffmpeg` and `src-tauri/binaries`, then `PATH`. The release ships the LGPL 7.1 builds pinned in `src-tauri/binaries/ffmpeg-licence.json`.
- **The LGPL build has no drawtext, zscale, libx264 or libx265.** Text overlays (name, text, timecode, burnt-in captions) are rendered here with ab_glyph from the bundled Inter Medium and DejaVu Sans Mono, written as PNG or streamed as raw RGBA, and composited with `overlay`. The timecode overlay is a rawvideo pipe on stdin, one frame per output frame, written by a thread in `run_pass`. HDR to SDR is a generated 33-point `.cube` (`colour::sdr_conform_lut`, PQ or HLG to BT.709 with a knee) applied by `lut3d`. H.264 and HEVC use the hardware encoders the build has (VideoToolbox, NVENC, QSV, AMF, VA-API, Media Foundation) and fall back to libx264 or libx265 only when the FFmpeg on the machine has them.
- **Encoder choice** is probed, not assumed: `encoders::works` runs a 64x64 two-frame encode per candidate and caches the result in `encoders.json`. `choose` honours the output's `hardware` (auto, on, off). VBR 2-pass needs a software encoder and falls back with a note when only hardware is available.
- **Two-pass with `filter_complex`.** Pass 1 maps the audio to PCM into the null muxer so no labelled output is left unconnected.
- **Stitch** concatenates sources through one graph scaled into the first source's frame; a missing stream is filled with `color` or `anullsrc`.
- **Timecode.** The source timecode is parsed at the source rate, offset by the in point, and written at the output rate. Drop-frame is only written at 29.97 and 59.94, which is what FFmpeg accepts.

## Effects (Media Encoder's Effects tab)

- **Time Tuner** measures frame difference (`tblend` and `signalstats` YAVG), drops or duplicates the frames that change least, within plus or minus 10 percent, optionally skipping the first two seconds of slate.
- **Video Limiter** is `lutyuv` clipping luma and chroma to the legal range with a soft knee.
- **Loudness normalisation** is two-pass `loudnorm` with the measured values, then `alimiter` for the true peak; ATSC A/85, EBU R128, ITU BS.1770 and custom targets. The XML report and the after-measurement are written by `sidecars.rs`.
- **Lumetri LUT** goes through `lut3d` with an intensity blend.

## Runner

- `runner::start` spawns a worker per output. Stop kills the child; pause suspends it (SIGSTOP and SIGCONT on unix, thread suspension through the toolhelp snapshot on Windows).
- Progress is read from `-progress pipe:1`; speed, fps, ETA and out time go into the runtime. The stderr tail is kept for the log.
- After the encode: max file size is checked, sidecars and XMP written, the loudness report measured, then `publishRequest` if the output publishes.
- Copy outputs (Ingest) verify by size, MD5 or a full byte compare.

## Preview

`preview::PreviewJob` takes an Engine snapshot (the source and normalised settings) and runs off the engine thread with the GIL released: one PNG through the same graph as the encode with `preview_at`, or a contact sheet of several. `view: source` is the Compare tab's left side.

## Logs

`formencoder_encoding_log.txt` and `formencoder_error_log.txt` in `~/Formencoder/logs` (or the Preferences log folder), in the same plain shape Media Encoder's AMEEncodingLog uses so people who read those can read these.
