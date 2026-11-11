# native · HASHOUT_LOG (the fencoder crates)

Living context for formencoder's encoding engine. The code carries almost no comments; the reasoning lives here.

## What it is

formencoder's engine is written in Rust as the Cargo workspace `native/` and loaded by the engine service as the `fe_core` Python extension (PyO3, abi3 for Python 3.10 and later). It owns the queue, the export settings model, the presets, the FFmpeg graph builder, the parallel runner, watch folders, logs and every command the interface and the agents call. Python around it does only what needs the network or the web stack: HTTP and the live socket, MCP, the family bridge (formcut, formvfx, formwav, formvis) and publish destinations.

## Crate map (since 0.2.1)

Seven crates, each depending only on the ones above it in this list:

| Crate | Modules | Role |
| --- | --- | --- |
| `fencoder-core` | util, paths, prefs, logs, text (and `assets/fonts`), metadata, vr, plugins, colour | foundations every other crate reads |
| `fencoder-io` | ffmpeg, tools, openh264, encoders, formats, captions, credentials, raw, transcribe, wrap | FFmpeg and the separate delivery programs, what this machine can encode, the 40 formats, packaging |
| `fencoder-plan` | settings, pipeline, presets, sidecars | export settings, presets and the FFmpeg graph planner |
| `fencoder-run` | runner | parallel encode jobs |
| `fencoder-engine` | engine | the queue document, undo, autosave, watch folders, events |
| `fencoder-commands` | commands, execute, preview | the registry and its handlers, `Execute` (execute and batch), previews |
| `fencoder-py` | py | the PyO3 module, built by maturin as `fe_core` |

Why it is shaped this way:

- Each crate's `lib.rs` re-exports the modules of the crates below it, so `crate::paths` resolves the same in every crate. Files moved between crates with `git mv` and kept their imports; a new module uses the same `crate::` paths.
- `settings` and `pipeline` call each other (settings asks the planner for geometry and fixed rasters, the planner reads settings helpers), so they share `fencoder-plan` rather than being split by a trait nobody else needs.
- `engine` and `commands` called each other through `Engine::execute`. `execute`, `batch` and `resolve_refs` now live in `fencoder-commands/src/execute.rs` as the `Execute` trait implemented for `Engine`; the engine crate no longer knows the registry exists. Anything calling `e.execute(...)` imports `crate::execute::Execute`.
- Since 0.2.2 the handlers sit in `fencoder-commands/src/commands/[namespace]_cmds.rs`, child modules of `commands`, as formvfx keeps `engine/cmd/[namespace].rs`. The `_cmds` suffix (formsculpt's naming) keeps a child from shadowing a crate module with the same name (`prefs_cmds` beside `crate::prefs`). Each file opens with `use super::*;`, which brings the parent's imports, helpers (`s`, `bv`, `path_list`) and the other children's handlers; handlers are `pub(super)` so the table in `commands.rs` and the sibling files can reach them. `source_of`, `RESERVED_KEYS` and `normalize_combo` stay public through `pub use` in `commands.rs`.
- The registry rows carry `mcpName` (dotted id to snake case), `category` (the namespace) and MCP `annotations` (`readOnlyHint` from `query`, `destructiveHint` from `DESTRUCTIVE`, `idempotentHint` for queries and set commands, `openWorldHint` for family, publish and `plugin.run`). Add a command that deletes, overwrites or resets something to `DESTRUCTIVE` in the same change, since approvals will be driven from it.
- The Python distribution is still named `fe-core` in `pyproject.toml`: renaming it would leave an old `fe-core` install beside a new one in an existing venv, both providing `fe_core`.
- The workspace builds into `native/target`; profiles live only in `native/Cargo.toml`.
- Since 0.2.5 release builds are unstripped (`strip = false`, and `strip = false` under `[profile.release.build-override]`). On macOS 27 with rustc 1.97.1 dyld refused the stripped `fe_core.abi3.so` ("mis-aligned LINKEDIT string pool") and `install-native` failed its import check; formcut found the same for its native library and for stripped procedural macros. Do not turn stripping back on without loading the result on a Mac.

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
- `formats.rs` holds the 40 formats, their codecs, containers and the field specs (`fields`) the Export Settings dialog and the agents both read, with `showIf` conditions, so neither side hard-codes which control belongs to which format.

## FFmpeg

- **Locator order:** Preferences `ffmpegDir`, `FORMENCODER_FFMPEG_DIR`, the frozen app's own folders, the per-person data folder, formcut's folder, the clone's `src-tauri/ffmpeg` and `src-tauri/binaries`, then `PATH`. The release ships the LGPL 7.1 builds pinned in `src-tauri/binaries/ffmpeg-licence.json`.
- **The LGPL build has no drawtext, zscale, libx264 or libx265.** Text overlays (name, text, timecode, burnt-in captions) are rendered here with ab_glyph from the bundled Inter Medium and DejaVu Sans Mono, written as PNG or streamed as raw RGBA, and composited with `overlay`. The timecode overlay is a rawvideo pipe on stdin, one frame per output frame, written by a thread in `run_pass`. HDR to SDR is a generated 33-point `.cube` (`colour::sdr_conform_lut`, PQ or HLG to BT.709 with a knee) applied by `lut3d`. H.264 and HEVC use the hardware encoders the build has (VideoToolbox, NVENC, QSV, AMF, VA-API, Media Foundation) and fall back to libx264 or libx265 only when the FFmpeg on the machine has them.
- **Encoder choice** is probed, not assumed: `encoders::works` runs a 64x64 two-frame encode per candidate and caches the result in `encoders.json`. `choose` honours the output's `hardware` (auto, on, off). VBR 2-pass needs a software encoder and falls back with a note when only hardware is available.
- **Two-pass with `filter_complex`.** Pass 1 maps the audio to PCM into the null muxer so no labelled output is left unconnected.
- **Stitch** concatenates sources through one graph scaled into the first source's frame; a missing stream is filled with `color` or `anullsrc`.
- **Timecode.** The source timecode is parsed at the source rate, offset by the in point, and written at the output rate. Drop-frame is only written at 29.97 and 59.94, which is what FFmpeg accepts.

## Effects (Media Encoder's Effects tab)

- **Time Tuner** measures frame change with a perceptual difference hash (each frame scaled to 9x8 greyscale by ffmpeg, 64 bits from comparing each pixel with its right neighbour, the score of an adjacent pair is the Hamming distance, ties to the earlier frame; never a luminance difference statistic, see CLAUDE.md), drops or duplicates the frames that change least, within plus or minus 10 percent, optionally skipping the first two seconds of slate.
- **Video Limiter** is `lutyuv` clipping luma and chroma to the legal range with a soft knee.
- **Loudness normalisation** is two-pass `loudnorm` with the measured values, then `alimiter` for the true peak; ATSC A/85, EBU R128, ITU BS.1770 and custom targets. The XML report and the after-measurement are written by `sidecars.rs`.
- **Lumetri LUT** goes through `lut3d` with an intensity blend.

## Runner

- `runner::start` spawns a worker per output. Stop kills the child; pause suspends it (SIGSTOP and SIGCONT on unix, thread suspension through the toolhelp snapshot on Windows).
- Progress is read from `-progress pipe:1`; speed, fps, ETA and out time go into the runtime. The stderr tail is kept for the log.
- After the encode: max file size is checked, sidecars and XMP written, the loudness report measured, then `publishRequest` if the output publishes.
- Copy outputs (Ingest) verify by size, MD5 or a full byte compare.

## Packaged deliverables (`wrap.rs`, `tools.rs`)

- **Formats with a `package` key** (`as10`, `as11op1a`, `as11d10`, `p2`, `dcp`) encode their essence with FFmpeg into the job folder, then a separate BSD tool packages it at the output path. `tools.rs` finds the programs (`FORMENCODER_TOOLS_DIR`, the per-person `tools/bin`, the app's `tools` resource, the clone's `src-tauri/tools`, `PATH`); `setup/install_tools.py` builds them from pinned tags and refuses a tag whose commit moved.
- **AS-10, AS-11**: FFmpeg writes MXF OP1a (XDCAM HD422 or, for D10, `mxf_d10` IMX with the 32 VBI lines padded on top); `bmxtranswrap -t as10|as11op1a|as11d10` rewraps it with the framework text files written beside the essence. AS-10 needs exactly eight mono PCM tracks and AS-11 four, so those formats force `audio.channels = custom` with that many mono tracks (silence when the source has none). D10 wants one AES3 stream, so the mono tracks are `join`ed (`amerge` cannot negotiate pan outputs from one `asplit`). The AS-11 segment starts at the essence's own timecode, read back with ffprobe, and runs the frame count ffprobe reports, so it never exceeds the file.
- **P2**: DVCPRO HD (`dvvideo`) in MXF, rewrapped by `bmxtranswrap -t avid` to OP-Atom and moved into `CONTENTS/VIDEO`, `CONTENTS/AUDIO` with the clip XML in `CONTENTS/CLIP`. The OP-Atom files are bmx's Avid flavour; the XML carries the fields formencoder knows (no byte index).
- **Fixed rasters** (`pipeline::fixed_raster`): IMX, DVCPRO HD, DCP and the AS-10/AS-11 XDCAM shims pin size, rate, field order and pixel aspect. Anamorphic rasters are fitted at their display width, then squeezed, then `setsar`. `settings::normalize` writes the raster back so the interface shows it.
- **DCP**: the graph ends `lut3d` with `colour::dcp_xyz_lut` (Rec. 709 at gamma 2.4 to X'Y'Z' at gamma 2.6, 48/52.37 scale, 65 points), `gbrp12be` and `shuffleplanes=2:0:1` so each raw frame is R, G, B planes; FFmpeg writes them as files in the job folder plus a 24-bit 5.1 WAV. A `J2k` worker thread turns finished frames into cinema-profile codestreams with `opj_compress` in parallel and deletes the raw frame; past about 1 GB of waiting frames it suspends FFmpeg (`Shared.throttled`, which Stop and Resume respect) until the backlog halves. Then `asdcp-wrap` (SMPTE labels and 5.1 MCA with `-L -m -w`, or Interop) makes the picture and sound MXFs and `wrap::dcp` writes the CPL, PKL (SHA-1, base64), ASSETMAP and VOLINDEX in the chosen standard's namespaces and element order. ClairMeta passes both standards with no errors or warnings.
- **Verify** reads packages back: mxf2raw for the operational pattern, AS-10 shim, AS-11 frameworks, track counts and D10 essence; the P2 tree; for DCP the PKL hashes, Rsize 3 or 4 from `asdcp-info -d` and the 250 Mb/s ceiling from `asdcp-info -r`.

## Software encoders outside FFmpeg (`openh264.rs`, `runner::run_pass_external`)

- **Why:** the shipped LGPL FFmpeg has no software H.264, HEVC or MP3. `encoders::detect` appends `openh264` (Cisco's library, found by `openh264::library`), `kvazaar` and `lame` to the h264, hevc and mp3 lists after FFmpeg's own, so hardware and libx264 or libx265 still win when present and `hardware: off` lands on them.
- **Video:** pass 1 is the usual graph ending `-f rawvideo -pix_fmt yuv420p -` (no `-progress`, stdout carries frames) with the audio written beside it to `audio.mka` (or the elementary audio file). `run_pass_external` reads whole frames from FFmpeg's stdout and hands them to OpenH264 through its C vtable (offsets of `SEncParamExt`, `SSourcePicture` and `SFrameBSInfo` measured from the 2.6.0 headers, the same on every 64-bit target; the library's own version is checked first) or to Kvazaar's stdin. Progress is frames done over planned frames. Pass 2 muxes with `-c copy` and `setts=ts=N/(rate*TB):duration=1/(rate*TB)`, because FFmpeg's raw H.264 and HEVC demuxers leave packets without timestamps and the MP4 muxer then drops frames (60 of 75) or ends on a one-tick frame. That rewrite assumes decode order is display order, so Kvazaar runs with the low-delay `lp-g4d3t1` GOP and OpenH264 has no B-frames. Kvazaar needs its intra period in multiples of 16.
- **OpenH264 settings:** real-time camera usage (non-real-time is refused by 2.6.0), frame skipping off so no frame is dropped, CABAC for Main and High, fixed slices for threads, BT.709 VUI. 8-bit 4:2:0 only, one pass; the plan notes say so when the settings asked for more.
- **MP3:** FFmpeg writes `lame_in.wav`, then `plan.post` runs `lame -q 2 -b N --cbr` with ID3 tags from the resolved metadata. MP3 inside a video container still needs libmp3lame.
- **OpenH264 is never bundled.** `backend/app/openh264_fetch.py` downloads Cisco's 2.6.0 binary for the platform, checks the archive's pinned SHA-256 and writes the attribution and licence pointer into `tools/licences`.
- **The Use OpenH264 switch (0.2.9).** Cisco's binary licence holds only while the user can turn the binary's use off and on again where the attribution is shown. The `openh264` preference (default true) is that switch: `openh264::library()` returns None while it is off, so `encoders::external`, the planner and `runner` all stop seeing the library at once and H.264 falls back as if it were not downloaded. `openh264::installed()` is the same search without the switch; `tools::listing` uses it for `installed` and adds `enabled`, so Preferences can say Installed while the switch is off. Never load the library through `installed()`.

## Speech to text (`transcribe.rs`)

- An output of kind `transcribe` (from `captions.transcribe`) runs on a runner thread like analysis: FFmpeg extracts 16 kHz mono PCM into the job folder, then `whisper-cli` (whisper.cpp, built by install-tools with `GGML_NATIVE=OFF` so a bundled build runs on other CPUs) writes `.srt`, `.vtt`, `.txt` or `.json` with `-of` beside the source. Progress is parsed from `-pp` (`progress = N%`), the detected language from `auto-detected language:`.
- The transcript is named `<stem>.srt` so `captions::sidecar_for` finds it for burn-in, embedding and sidecars with no further setting; when that name is taken it becomes `<stem>_transcript.srt` unless `overwrite`.
- Models (`ggml-*.bin`) live in the per-person `models` folder (`FORMENCODER_MODELS` overrides), downloaded by `backend/app/model_fetch.py` against the SHA-256 and size Hugging Face publishes for each file.

## Content Credentials (`credentials.rs`)

- `contentCredentials` settings: after the encode, `c2patool` signs a manifest into the first file (actions `c2pa.created` or `c2pa.transcoded` with formencoder as software agent, an optional CreativeWork author, the source as parent ingredient when c2pa can read it) into a hidden file that is renamed over the output. With no certificate and key c2patool's built-in test certificate signs and the output notes say viewers will call it untrusted.
- Verify reads the store back and passes when the active manifest's generator is formencoder and the only validation code, if any, is `signingCredential.untrusted`.
- MXF, MKV, WebM, image sequences and packages are not signable by c2pa; those outputs say so in their notes.

## Camera raw (`raw.rs`)

- Bayer sources (FFmpeg's tiff decoder reads CinemaDNG and DNG as `bayer_*` with black and white levels applied, linear light) get `format=rgb48le` (the debayer) and a `lutrgb` exposure and BT.709 OETF from the item's `rawExposure` and `rawTransfer` interpretation; `dng` joined the image extensions so numbered DNG frames import as a sequence.
- Other camera raw (R3D, ARRIRAW, X-OCN, Canon RAW, BRAW) is decoded by the maker's own program through the `rawDecoders` preference: `runner::source_for` runs the command with `{input}`, `{folder}` and `{name}` filled in, into the job's raw folder, and encodes the image sequence or movie it names. `queue.addSource` accepts a file FFmpeg cannot read when a decoder covers its extension. formencoder ships no vendor SDK or tool.

## Plug-ins (`plugins.rs`)

- A plug-in is a folder with `plugin.json`; the program runs as a child process in that folder, gets one JSON request line on stdin and answers with JSON lines on stdout (`progress`, `result`, `error`), as written in `docs/PLUGINS.md`. Manifests are checked when listed and an unusable one says why.
- `afterEncode` plug-ins named in an output's `plugins` run after Content Credentials, on the runner thread, and may add files and notes. `plugin.run` starts a `command` event on its own thread and keeps the run in a process-wide table that `plugin.result` reads, so the engine thread never waits on a plug-in. `publish` plug-ins run from the service's publish step.

## Keyboard shortcuts

`Cmd::shortcut_now` reads the `shortcuts` preference (command id to combination, `""` for none) over the table's default, and both `command.list` and the menu bar use it. `normalize_combo` writes combinations as Ctrl, Cmd, Alt, Shift then the key, the order the interface's `comboOf` produces. Cmd+K, Cmd+Shift+P, the backquote and Cmd+, stay with the app.

## Preview

`preview::PreviewJob` takes an Engine snapshot (the source and normalised settings) and runs off the engine thread with the GIL released: one PNG through the same graph as the encode with `preview_at`, or a contact sheet of several. `view: source` is the Compare tab's left side.

## Logs

`formencoder_encoding_log.txt` and `formencoder_error_log.txt` in `~/Formencoder/logs` (or the Preferences log folder), in the same plain shape Media Encoder's AMEEncodingLog uses so people who read those can read these.

## Ingest never copies a file onto itself (0.8.2)

Refers to `fencoder-run/src/runner.rs` `copy` · kind: fix · logged: v0.8.2 · 2026-11-10

- When the destination resolved onto the source (a folder ingested into its own parent, or a drive root such as `E:\` whose `parent()` is `None`, which made the relative path absolute so `dest.join` returned the source), `File::create` truncated the camera original to 0 bytes and the size and MD5 checks of two empty files passed. The root of a parentless source is now the source itself, a folder source is refused when the destination is inside it, and each file is refused before `File::create` when its target and the source canonicalise to the same path. Checked with `cargo check -p fencoder-run`; not run against real media.

## Parallel outputs of one source get their own file names (0.8.2)

Refers to `fencoder-engine/src/engine.rs` `dispatch`, `fencoder-run/src/runner.rs` `encode` · kind: fix · logged: v0.8.2 · 2026-11-10

- Two outputs of one source that resolve to the same name (two H.264 presets without `outputName`) started together under parallel encoding; each job ran `unique_path` before either file existed (both write to the part file until the end), so both chose the same output and part path and two FFmpeg processes wrote one file. `dispatch` now picks the final name itself: when the planned path is held by a running job (its runtime `path`), or exists with `incrementNames` on, it takes the first `_N` name that is neither held nor on disk, so the runner's own `unique_path` keeps it. The part file name also carries the output id (`.clip.mp4.<oid>.fe-part.mp4`). Checked with `cargo check`; not run with FFmpeg.

## Image sequences start at their real first frame (0.8.2)

Refers to `fencoder-io/src/ffmpeg.rs` `probe` · kind: fix · logged: v0.8.2 · 2026-11-10

- `probe` gave every `%0` pattern `first: 0`, so ffprobe ran with `-start_number 0`, image2 searched only indices 0 to 4, and a sequence numbered from 1001 (or 86400) had no video at add time and failed again at encode, where the runner re-probes and `input_args` reads `sequence.first`. `pattern_first` now lists the pattern's folder for names with the same head, digit count and extension and returns the lowest frame, used for `-start_number` and in the returned `sequence`. Checked with a scratch binary outside the repo: three PNGs numbered 1001 to 1003 probe as a 0.12 s sequence with `first: 1001`.

## LUT paths with an apostrophe (0.8.2)

Refers to `fencoder-core/src/colour.rs` `esc` · kind: fix · logged: v0.8.2 · 2026-11-10

- `esc` wrote `\'` inside the single-quoted `lut3d=file='...'`, but FFmpeg's graph parser has no escapes inside quotes, so the quote closed early and the whole graph failed ("Filter not found") for a LUT such as `Director's Cut.cube` or a cache under `C:\Users\o'brien`. An apostrophe is now written as `'\\\''`: close the quote, an escaped backslash and an escaped quote for the two parsing levels, reopen. `:` keeps its `\:`, which the graph level passes through inside quotes for the option level. Checked with FFmpeg 6.1 in a scratch folder: the path `o'brien/Director's Cut, v2.cube` through `esc` loads in both a `-filter_complex` graph and a `-vf` chain, and the old escaping fails with "Filter not found".

## libx265 two pass keeps its pass options (0.8.2)

Refers to `fencoder-plan/src/pipeline.rs` `video_codec_args`, `build` · kind: fix · logged: v0.8.2 · 2026-11-10

- The pass options went into `-x265-params` with the raw stats path, which libx265 splits on `:` and unescapes on `\`, so on Windows (`stats=C:\Users\...`) the list broke; and HDR10 pushed a second `-x265-params` into `common`, and FFmpeg keeps only the last, so pass 2 ran without `pass=2:stats=...`. Both delivered a one-pass file under a VBR 2 pass label. The stats path is now written with `/` and `\:`, and the HDR10 options are held in `x265_hdr` and appended to the final pass's own `-x265-params` (or added when there is none), so there is one option string per pass. Checked with FFmpeg 6.1 and libx265 in a scratch folder whose name holds a colon: pass 1 writes `pass.log` there, and pass 2 with the merged string reads it and writes the mastering display and content light side data.

## Dither and pixel aspect are checked before they reach the graph (0.8.2)

Refers to `fencoder-plan/src/settings.rs` `normalize` · kind: fix · logged: v0.8.2 · 2026-11-10

- `video.dither` (pasted into `paletteuse=dither=...`) and `video.pixelAspect` (pasted into `setsar=...`) were free strings, so a `.fepreset` or an agent's `export_settings` could add filters to the graph, for example one that writes a file. `normalize` now resets `video.dither` to `sierra2_4a` unless it is one of the four options `formats.rs` lists, and `video.pixelAspect` to `1:1` unless it is `source` or digits:digits; values that are not strings are left alone. Checked with a scratch binary outside the repo: `none[vout];movie=/etc/hosts` becomes `sierra2_4a`, `1:1,foo` and `4:3;x` become `1:1`, and `bayer`, `40:33` and `source` are kept.

## Generated LUTs appear in the cache whole (0.8.2)

Refers to `fencoder-core/src/colour.rs` `sdr_conform_lut`, `dcp_xyz_lut`, `write_whole` · kind: fix · logged: v0.8.2 · 2026-11-10

- Both wrote the cube straight to its final cache name and later callers trusted `is_file()`, so a second job starting while the first was writing (the DCP cube is about 7 MB) handed FFmpeg a truncated table, and a write cut short by quitting stayed in the cache and broke every later use. `write_whole` writes to `<name>.cube.<pid>.<n>.part` and renames it onto the final name; when the rename fails but another writer already put the file there, that file is used. Checked with a scratch binary outside the repo: four threads calling `dcp_xyz_lut` on an empty cache all return a 7,414,967 byte file and no `.part` file remains.

## Stop just before FFmpeg starts (0.8.2)

Refers to `fencoder-run/src/runner.rs` `run_pass`, `run_pass_external` · kind: fix · logged: v0.8.2 · 2026-11-10

- `Job::stop` sets `stop` and kills the pid it finds. A Stop that landed after `encode`'s last `stopped()` check and before `run_pass` stored the child's pid killed nothing, so the whole encode ran before it was discarded as stopped. Both passes now look at `stop` under the same lock that stores the pid and kill the child at once. Not changed: the two-pass loudness and Fit Tuning measurements still run FFmpeg with `.output()` and no recorded pid, so Stop waits for them; registering those children needs a pid hook through `pipeline::measure_loudness` and `tuner_frames`. Checked with `cargo check`; not run with FFmpeg.

## Batches keep the undo cap (0.8.2)

Refers to `fencoder-commands/src/execute.rs` `batch` · kind: fix · logged: v0.8.2 · 2026-11-10

- `execute` keeps at most 100 undo steps, but `batch` pushed a full copy of the document for every batch with no cap, so an agent driving the queue through the MCP `batch` tool grew the engine's memory for the whole session. `batch` now drops the oldest step past 100, as `execute` does. Checked with `cargo check`; not run.

## Ingest never writes through a link to the source (0.8.3)

Refers to `fencoder-run/src/runner.rs` `copy`, `write_part`, `same_file`, `resolved` · kind: fix · logged: v0.8.3 · 2026-11-11

- The 0.8.2 self-copy check compared canonical paths only, and a hard link has its own path, so with `dst/bars.mp4` linked to `src/bars.mp4` the target passed the check, `File::create` truncated the shared inode and the size and MD5 checks compared two empty files (QA repro on 0.8.2: the source became 0 bytes and the job reported done). `same_file` now compares the device and inode (`MetadataExt` `dev`/`ino`) on Unix and the volume serial number and file index (`GetFileInformationByHandle`, the `Win32_Storage_FileSystem` feature of `windows-sys`) on Windows, and the copy is refused with the existing "would be copied onto itself" message.
- The destination is never opened with truncation any more: `write_part` writes `.<name>.<oid>.fe-part` beside the target, syncs it, and `copy` renames it onto the target; on a stop or an error the part file is removed. A link the check missed (another file system, a file that cannot be opened for its id on Windows) is then replaced by the rename and its inode is left alone. Verification reads the part file (see the next point).
- Follow-up in 0.8.3 after review: `write_part` opened the predictable `.<name>.<oid>.fe-part` with `File::create`, which follows an existing link, and the size, MD5 and bit checks ran on the target after the rename, so a copy that failed verification had already replaced the old destination. `copy` now removes any stale part file first, `write_part` opens it with `OpenOptions::new().write(true).create_new(true)`, and `check_part` verifies the part file before the rename; on a failed check, a stop or any error the part file is removed and the destination is left as it was. `test_md5_check_catches_a_copy_that_changes_after_it_was_written` now tampers with the part file instead of the target (the target is only written by the rename now) and also asserts that an older destination is kept and no part file is left; on the previous order it fails on the kept destination. `test_a_stale_part_file_link_is_replaced_not_written_through` places a symlink at the part name before the job starts; before the change the copy was written into the link's target. `test_a_stopped_copy_leaves_no_part_file_and_keeps_the_old_destination` guards the stop path.
- A folder ingested into a folder inside itself that does not exist yet (`CARD` into `CARD/backup`) was not refused, because `fs::canonicalize` of a missing folder is an error and the check was skipped, so the copy walked into `CARD/backup/CARD/...`. `resolved` canonicalises the nearest existing ancestor and appends the rest lexically (`..` pops, `.` is dropped).
- Checked with `backend/tests/test_ingest.py`: the hard link tests (size and MD5) and the nested folder test fail on 0.8.2 (source 0 bytes; status done) and pass now; `cargo check --workspace --locked` with `-D warnings` passes on macOS and for `x86_64-pc-windows-msvc`.

