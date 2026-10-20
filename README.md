# formencoder

The media encoder of the form family, beside formcut (video), formvfx (motion graphics), formwav (audio) and formvis (images): an Adobe Media Encoder alternative for the desktop and the browser. A queue of sources with several outputs each, encoded in parallel; 93 encoding presets and 5 ingest presets across web, social, devices, mezzanine, broadcast, cinema, DVD and Blu-ray, image sequences, GIF, audio, archive and proxies; 40 formats from H.264, HEVC, AV1 and WebM to ProRes, DNxHR, CineForm, XDCAM and JPEG 2000 MXF, AS-10, AS-11, P2 and DCP packages, DPX and OpenEXR; watch folders, card ingest with checksums and proxies; LUTs, HDR to SDR conform, image, name, text and timecode overlays, Time Tuner, a video limiter and loudness normalisation; captions burnt in, as sidecars or embedded, and speech to text; metadata templates, XMP and Content Credentials; plug-ins; publishing to folders, FTP, S3, webhooks, YouTube, Vimeo, Facebook and the family apps; with an agent harness so Claude Code, Codex and Cursor can drive every tool from formencoder's embedded terminal.

Version 0.2.6 · Apache-2.0 · encoding engine: formencoder's own, in Rust (the fencoder crates in `native/`), driving a pinned LGPL FFmpeg

## Quick start

Needs Node 20.19+ or 22.12+, Python 3.12+, and Rust 1.95+ (`https://rustup.rs`). `./formencoder doctor` checks them. FFmpeg is downloaded on first boot: the LGPL 7.1.5 build the family pins, every file checked against `src-tauri/binaries/ffmpeg-licence.json`.

```bash
./formencoder install   # engine venv, the Rust encoding engine, interface packages
./formencoder           # the engine on 127.0.0.1:8270 and the interface on http://localhost:5270
```

Windows: `formencoder.bat install`, then `formencoder.bat`. One process serving the built interface: `./formencoder serve` (http://127.0.0.1:8270).

Drag media into the Queue, drag presets from the Preset Browser onto a source to add outputs, click a preset to open Export Settings (Source, Output and Compare views, every setting, effects, captions, metadata, publish, the estimated size), and press Start. Cmd or Ctrl+K searches every command.

## The engine

`native/` is formencoder's encoding engine, written for formencoder in Rust as seven fencoder crates (core, io, plan, run, engine, commands, py) and loaded by the engine service as the `fe_core` Python extension; `./formencoder install-native` rebuilds it. It owns the queue with undo, the 96 commands with their parameter schemas, the export settings model and every format's field specs, the presets (and Media Encoder `.epr` import), the FFmpeg graph planner (geometry, scaling, crop, rotation, interpretation, time interpolation, two pass, stitching, timecode, caption timing), the parallel runner, watch folders, ingest with size, MD5 or bit-for-bit verification, media analysis, previews through an output's exact settings, and the encoding and error logs. FFmpeg runs as a separate program and is never linked. Overlays and burnt-in captions are drawn by the engine's own glyph rasteriser and HDR to SDR conform is a generated 3D LUT, so the effects work with the LGPL build; hardware encoders (VideoToolbox, Media Foundation, NVENC, QSV, AMF, VA-API) are found by a test encode on each machine.

The LGPL FFmpeg has no software H.264, HEVC or AV1 encoder and no MP3 encoder. H.264 and HEVC encode through VideoToolbox on every Mac and through Media Foundation, NVENC, AMF or VA-API elsewhere. Without a hardware encoder, H.264 goes through Cisco's OpenH264 (downloaded from Cisco in Preferences, Delivery Tools, never bundled), HEVC through Kvazaar and MP3 through LAME. Broadcast and cinema packages are wrapped by BBC bmx (AS-10, AS-11, P2) and asdcplib with OpenJPEG (DCP), speech to text runs whisper.cpp and Content Credentials are signed by c2patool. All of these are separate programs built from pinned sources by `./formencoder install-tools` and shipped in the desktop app; an FFmpeg you install yourself can still be chosen in Preferences.

## The form family

formencoder finds formcut, formvfx, formwav and formvis running on the same computer and queues their work: a formcut project rendered by formcut, a formvfx composition pulled over Dynamic Link with no render in formvfx, a formwav session mixed by formwav, a formvis image. Finished files go back to formcut or formvfx from the Queue or as a publish step. An app that is not open has its engine started headless, and Receive Exports makes every formcut export arrive in the queue through formcut's signed webhooks.

## Agents

- **In formencoder**: the Terminal panel (or the Agent workspace) opens a shell in formencoder's agent workspace. Its Claude Code, Codex and Cursor buttons start an agent that already has the `formencoder` MCP server and the `formencoder-harness` skill; it changes the queue live, every change undoable, without permission prompts.
- **From this repository**: `.mcp.json`, `.codex/config.toml` and `.cursor/mcp.json` run `./formencoder mcp`. The first change asks once in the formencoder window.
- **From anywhere**: `./formencoder agents install` (or the Agents panel) sets the three clients up for your account.
- **Command line**: `./formencoder encode FILE --preset system/youtube-1080p`, `queue`, `exec ID 'JSON'`, `batch 'JSON'`, `commands FILTER`, `describe ID`, `presets QUERY`, `probe FILE`, `frame OUT.png --output '#1' --time 2`, `wait`.

27 curated MCP tools (terminal_open, terminal_send, terminal_read and approval_status among the newest), among them `encode` (queue, encode, wait and verify in one call), `export_settings`, `preview_frame` and `contact_sheet` (frames through an output's exact settings), `verify` (the file probed against its settings) and `family`, plus one tool for each of the 96 engine commands (`queue_add_source`, `preset_create`...) in the full profile that Claude Code and Codex load; Cursor loads the 27 (its core profile, 123 tools in the full one) and reaches the rest through `execute`. Resources (`formencoder://queue`, `presets`, `formats`, `encoders`, the logs and the guides) and recipe prompts (YouTube version, broadcast master, proxies, review copy) come with them. On the command line every command runs as `./formencoder [id] --name value`. In the window, Shift+Enter on a command in the palette (Cmd+K) opens its dialog with every parameter, and the dialog and the palette show the command line and MCP call for it with copy buttons.

## Desktop

```bash
./formencoder install-desktop   # PyInstaller and the Tauri toolchain check (Linux also needs the webkit2gtk-4.1 packages)
./formencoder desktop dev       # the app, with the engine frozen as its sidecar
./formencoder desktop build     # DMG, deb, rpm, AppImage, MSI and setup bundles in src-tauri/target/release/bundle, with the pinned FFmpeg
```

`./build_app` does everything from a fresh clone on macOS or Linux: it checks the tools (installing Rust with rustup when missing), installs the engine service, the encoding engine and the interface, builds the interface, freezes the engine into the sidecar, stages the pinned FFmpeg, bundles the app, and on macOS packs a DMG and copies the app to Applications (`--no-install` keeps it in place, `--open` opens it, `--clean` rebuilds from nothing; on Linux it builds the `.deb` and `--install` installs it). Every step is logged to `build_app.log`. On Windows, `build_app.bat` runs the same steps (`--open`).

Tagging `vX.Y.Z` builds macOS (Apple silicon and Intel), Linux and Windows bundles in GitHub Actions, attaches the FFmpeg source, and opens a draft release.

## Commands

| Command | Does |
| --- | --- |
| `./formencoder` / `boot` | engine and interface for development |
| `install`, `install-native` | everything, or only the Rust encoding engine (`--dev` for a quicker debug build) |
| `install-tools [TOOL...]` | the delivery tools from pinned sources (`--model base` for a speech model, `--stage` for the desktop bundle, `--keep-going`) |
| `serve` | the built interface from the engine |
| `install-desktop`, `freeze`, `desktop dev`, `desktop build` | the desktop app |
| `doctor` | checks the toolchain, FFmpeg and ports |
| `mcp` | the MCP server over stdio |
| `agents install|sync|status` | client setup; regenerate the skill references from the engine |
| `counts [--check]` | the code size table below |
| `clean [--all]` | remove build output |

## Layout

`native` (the encoding engine, the fencoder Rust crates, PyO3) · `backend` (FastAPI engine service, MCP, terminal, family bridge, publish, the FFmpeg fetch) · `frontend` (TypeScript and Vite interface) · `src-tauri` (desktop shell) · `setup` (scripts) · `.claude/skills/formencoder-harness` (the agent skill, mirrored to `.agents/skills`) · `.claude/skills/formencoder-skillset` (for work on formencoder's own code).

## Parity

[`docs/PARITY.md`](docs/PARITY.md) grades formencoder against Media Encoder 26.5 on 84 traced capability rows, with HandBrake, Shutter Encoder and Compressor graded on the same rows: formencoder 83 of 84 (99%), 82 Full, 2 Partial, 0 None; Compressor 67%, Shutter Encoder 62%, HandBrake 35%. The two Partial rows are AVC-Intra (no LGPL or permissive encoder exists) and vendor camera raw (R3D, ARRIRAW, X-OCN, Canon RAW and BRAW need the makers' SDKs, which formencoder runs through a decoder hook rather than ships). The measured page with every cell's evidence is [`docs/parity/index.html`](docs/parity/index.html). The wiki (`.docs/wiki`) covers getting started, encoding, agents, the family, the architecture, the desktop app and releasing.

## Code size

| Area | Files | Lines |
| --- | ---: | ---: |
| Encoding engine (Rust, fencoder crates) | 46 | 10,317 |
| Engine service (Python) | 37 | 3,774 |
| Interface (TypeScript) | 39 | 6,018 |
| Interface styles (CSS) | 5 | 685 |
| Desktop shell (Rust, Tauri) | 1 | 144 |
| Setup and CLI | 37 | 1,221 |
| Agent skills (Markdown, hand-written) | 21 | 793 |
| Total | 186 | 22,952 |

Non-blank lines in tracked files; generated skill references excluded. `./formencoder counts` prints this table.

## Licence

Apache-2.0. FFmpeg is LGPL-2.1-or-later and runs as a separate program; see `NOTICE.md` for every third-party component and the FFmpeg source offer.
