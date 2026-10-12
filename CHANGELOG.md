# Changelog

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
