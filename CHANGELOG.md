# Changelog

## v0.5.1 · 2026-10-31

- The Windows desktop app no longer opens to a blank window on PCs where an installer set the `.js` file type to `text/plain` in the registry: the engine now serves scripts and stylesheets with their real types.
- The pinned FFmpeg download names nodemode-dev/formcut-binaries, where the release now lives.

## v0.5.0 · 2026-10-30

Desktop builds for formcompiler's signed releases. The app itself does not change.

- Windows: `formencoder.bat desktop build` passes extra arguments, such as `--config FILE`, on to `tauri build`, so Windows builds can make updater files.
- macOS: with `APPLE_SIGNING_IDENTITY` set, every program and library staged in `src-tauri/tools` and `src-tauri/ffmpeg` is signed with hardened runtime and a timestamp before the bundle is made, so the app can be notarized.
- LAME configures on Apple silicon: its `config.guess` and `config.sub` are refreshed from automake when present, and macOS passes `--build` and `--host`.
- `.gitattributes` checks out `.bat`, `.cmd` and `.ps1` files with CRLF.
- The version goes from 0.4.9 to 0.5.0, not 0.4.10, because the version test keeps the patch to one digit.

## v0.4.9 · 2026-10-26

The window smoke in `frontend/tests/window`, run in a new CI job: the built window loads under CPU and network throttling with layout shift 0, no console error, no failed request and nothing refused by the guard. It found one small shift: the splash page moved its logo when the line under it arrived, and now holds the logo at a fixed position.

## v0.4.8 · 2026-10-26

A test suite in `backend/tests`, run in CI: the family guard, consent, MCP, version and boot checks, and encoding checks (every shipped preset plans the same FFmpeg arguments every time, real H.264, ProRes and AV1 encodes, loudness within 0.5 LU, caption timing, card ingest checksums and the queue through pause, stop and restart). CI also runs `npm audit`. The app itself does not change.

## v0.4.7 · 2026-10-26

The desktop release build keeps its symbols, since macOS builds fail on a stripped binary. Nothing else changes.

## v0.4.6 · 2026-10-26

A web page on another local port can no longer talk to the engine: an Origin must be the engine's own, the window's dev or preview address, or the desktop shell. The window, the command line and the MCP clients are not affected.

## v0.4.5 · 2026-10-25

formvfx moved its engine to port 8250, so formencoder looks for it there when no record or address says otherwise. Nothing else changed.

## v0.4.4 · 2026-10-25

A web page can no longer reach the engine through an image or a link: a request that carries no Origin is refused when the browser labels it Sec-Fetch-Site cross-site. The window, the dev window, the command line and the MCP clients are not affected.

## v0.4.3 · 2026-10-25

The interface's dev server dependency, vite, moves to 8.3.5, which clears two command-injection advisories in its launch-editor. Nothing in the shipped app changed.

## v0.4.2 · 2026-10-24

The copyright holder in LICENSE and the README is NodeAgentc, Inc., and the About box reads "by nodemode.ai".

## v0.4.1 · 2026-10-23

Fit Tuning measures frame change a new way.

- Fit Tuning scores how much the picture changes between adjacent frames with a perceptual difference hash: each frame is shrunk to a 9x8 greyscale copy, 64 bits are set by comparing every pixel with its right neighbour, and a pair of frames scores the Hamming distance between its hashes. Ties go to the earlier frame. The frames that change least are still dropped or repeated, with the same spacing, and the setting, label and agent calls are unchanged.
- Lengthening with Fit Tuning (a positive change) failed in ffmpeg; it encodes again.

## v0.3.0 · 2026-10-23

Licence ledger for the desktop bundle.

- The app carries formencoder's licence and NOTICE.md. NOTICE.md now lists every Python package frozen into the engine, the Python runtime, pydantic-core's Rust crates, the desktop shell's crates under other licences and the Linux AppImage's LGPL libraries.
- Every release attaches the LAME 3.100 source beside the FFmpeg source, and a list of the delivery tools built into each platform's bundle.
- The macOS requirement files are pinned to the same versions as the other platforms.

## v0.2.9 · 2026-10-23

Licensing and trademark fixes.

- Preferences > Delivery Tools has a Use OpenH264 switch, with "OpenH264 Video Codec provided by Cisco Systems, Inc." under it. Turned off, formencoder never loads Cisco's library and H.264 falls back as if it were not downloaded. NOTICE.md reproduces Cisco's licence.
- Effect and link names are formencoder's own: Look / LUT, Fit Tuning and Live Link. Saved presets, command ids and agent calls are unchanged.
- The Family panel no longer names other vendors' apps beside each family app.
- NOTICE.md and the README carry a trademark notice and record the eight bundled looks as formencoder's own.

## v0.2.8 · 2026-10-22

Releases are built by formcompiler.

- Releases are built by formcompiler (`nodemode-ai/formcompiler`) and published on its release page as `formencoder-vX.Y.Z`, with the FFmpeg source attached, as before.
- The repo's own GitHub Actions now only run the checks, on main, on pull requests and on `compile_vX.Y.Z` branches.
- A release starts when a `compile_vX.Y.Z` branch is pushed (the steps are on the wiki's Releasing page).
- The updater looks for new versions in formcompiler's `formencoder-updates` feed.
- No change to the app itself.

## v0.2.7 · 2026-10-20

A new app icon.

- The icon keeps the bars-and-play mark and is redrawn like the rest of the form family: a dark gradient tile with a soft glow, the play triangle as a glossy blue-to-amber slab with a raised edge, and the bars as a fading motion trail. The macOS icon sits inset with a shadow, as macOS icons do; Windows and Linux icons fill their square. Small sizes draw a simpler, larger mark.
- The browser tab icon and the startup splash show the new mark.

## v0.2.6 · 2026-10-20

The one-shot desktop build, in the shape formlit set for the family.

- `./build_app` at the repo root builds the desktop app from a fresh clone on macOS and Linux: it checks Python, Node and Rust (installing Rust with rustup when missing), installs the engine service, the encoding engine and the interface, builds the interface, freezes the engine into the sidecar, stages the pinned FFmpeg and bundles the app. On macOS it packs a DMG and copies the app to Applications (`--no-install` keeps it in place); on Linux it builds the `.deb` (`--install` installs it). `--open` opens the app, `--clean` rebuilds from nothing, and every step is logged to `build_app.log`.
- `build_app.bat` runs the same steps on Windows and leaves the MSI and setup `.exe` in `src-tauri\target\release\bundle` (`--open` opens that folder).

## v0.2.5 · 2026-10-12

A fix release: the encoding engine builds and loads on macOS 27.

- `./formencoder install-native` (and `formencoder_oc_install`) failed on macOS 27 with rustc 1.97.1: dyld refused the stripped engine library ("mis-aligned LINKEDIT string pool"), so doctor reported the encoding engine missing. Release builds of the engine are now unstripped, and build scripts and procedural macros stay unstripped in the engine and the desktop shell, as in formcut.

## v0.2.4 · 2026-10-12

The v0.3.0 sprint's third step, first half: the agent substrate behind Agent Connect.

- Agents' consequential actions (deleting, clearing or resetting, publishing to an outside service, overwriting a file, changing where a watch folder writes, typing into a terminal) wait for the person's approval in the window, unless the person turns on Full faith in the Agents panel. A call that gets no answer in two minutes, or comes with no window open, answers pendingApproval; approval_status gives the decision and the result.
- Every agent tool call is recorded with its approval outcome and shown in the Agents panel's activity.
- Terminals are sessions agents can open, type into and read through the new MCP tools terminal_open, terminal_send, terminal_read, terminal_list and terminal_close, and over REST under /api/terminal/sessions.
- `formencoder` is on the PATH in every formencoder terminal: bash and zsh start with formencoder's rc files after the person's own login files.
- Security: an HTTP caller can no longer present itself as the window to skip agent consent.

## v0.2.3 · 2026-10-12

Closes the v0.3.0 sprint's second step: one command registry reaching every surface.

- Shift+Enter (or Alt+click) on a command in the palette opens its dialog with every parameter, even when none is required; with nothing selected the dialog asks for the refs instead of refusing.
- The command dialog and the palette show the command line and the MCP call for the command, live as values are typed, with copy buttons.
- `./formencoder agents sync --check` (run in CI) proves the registry, the MCP tools and the command line agree: MCP names, schemas, read-only hints, routing and parameter types.
- The command references give every command's MCP tool name and mark destructive commands; `app.capabilities` names the engine as the fencoder crates.

## v0.2.2 · 2026-10-12

The v0.3.0 sprint's second step: one command registry reaching agents and the command line.

- Every engine command is an MCP tool of its own (`queue_add_source`, `preset_create`...), 117 tools in the full profile that Claude Code and Codex load; Cursor loads the 21 curated tools (the core profile) and reaches every command through `execute`. Profiles also take categories (`core,queue,preset`).
- MCP resources (`formencoder://status`, `queue`, `presets`, `formats`, `encoders`, `commands`, the logs and the guides, with templates for one output, preset, format or command) and recipe prompts (YouTube version, broadcast master, proxies, review copy).
- `./formencoder [id] --name value` runs any command, with `--help` generated from its schema; paths resolve from the folder the command was typed in.
- The engine's command handlers live in one file per namespace (`native/fencoder-commands/src/commands/`).

## v0.2.1 · 2026-10-12

The first step of the v0.3.0 sprint: the engine in the form family's shape. No change to what formencoder encodes.

- The encoding engine is a Cargo workspace of seven crates in `native/`: fencoder-core, fencoder-io, fencoder-plan, fencoder-run, fencoder-engine, fencoder-commands and fencoder-py (still the `fe_core` module).
- Every command in the registry carries its MCP name, category and MCP annotations (read-only, destructive, idempotent, open-world); `./formencoder commands` and `describe` show them.
- Install, clean, counts and both workflows build the workspace.

## v0.2.0 · 2026-10-10

Closes 12.5 of the 13.5 parity points 0.1.0 left open.

- Export settings: custom audio channel routing with gain, crop proportions with an anchor and a crop box, VR (spherical) metadata, MPEG2 and H.264 Blu-ray.
- Broadcast and cinema packages: AS-10, AS-11 OP1a, AS-11 D10, P2 and SMPTE or Interop DCP, wrapped by bmx, asdcplib and OpenJPEG, with 10 presets and package checks in verify.
- Software H.264 (Cisco's OpenH264, downloaded, never bundled), HEVC (Kvazaar) and MP3 (LAME) when the LGPL FFmpeg has none.
- Speech to text with whisper.cpp, Content Credentials with c2patool, metadata templates and rules by category, CinemaDNG development and vendor raw decoder hooks.
- Outputs written under a part name and moved into place; chained and network watch folders; media cache limits, a memory reserve and GPU decoding.
- Plug-ins over JSON on standard input and output; YouTube, Vimeo and Facebook Page publishing; editable keyboard shortcuts.
- Family: formcut exports arrive through formcut's signed webhooks, and an app that is not running has its engine started headless. Fixed: formcut renders are read by `job_id`.
- `./formencoder install-tools` builds the delivery tools from pinned sources; the desktop bundles ship them.
- Engine: 96 commands, 40 formats, 98 presets. Parity: 83 of 84 Media Encoder capabilities (`docs/PARITY.md`).

## v0.1.0 · 2026-10-10

First release of formencoder, the media encoder of the form family.

- Encoding engine `native/fe-core` in Rust: queue with undo, 81 commands, 33 formats, 81 system presets and 5 Ingest presets, export settings with effects (LUT, HDR to SDR conform, image, name, text and timecode overlays, Time Tuner, video limiter, loudness normalisation), captions, metadata, parallel encoding, watch folders, ingest with verification, proxies, analysis, previews and logs, driving a pinned LGPL FFmpeg 7.1.5.
- Engine service: JSON-RPC, live socket, MCP with 21 tools, consent, the agent workspace and terminal, the bridge to formcut, formvfx, formwav and formvis, publish to folders, FTP, S3, webhooks and the family apps, first-run FFmpeg download.
- Interface in the family look with dockable panels and five workspaces, the Export Settings window and a command palette.
- Agent harness: the `formencoder-harness` and `formencoder-skillset` skills and the Claude Code, Codex and Cursor configs.
- Desktop app for macOS, Windows and Linux with the FFmpeg bundled; CI and release workflows.
- Parity: 70.5 of 84 Media Encoder capabilities (`docs/PARITY.md`).
