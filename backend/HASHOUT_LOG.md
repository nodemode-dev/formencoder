# backend · HASHOUT_LOG

Living context for formencoder's engine service. The code carries almost no comments; the reasoning lives here.

## What it is

A FastAPI process around the Rust engine (`fe_core`, built from `native/fe-core`). Rust owns the queue, settings, presets, FFmpeg and every command; Python owns HTTP, the live socket, MCP, the agent workspace, the embedded terminal and the two jobs that need the network: the form family bridge and publish destinations.

## Engine thread

- `engine/host.py` creates one `fe_core.Engine` on a dedicated thread (the pyclass is unsendable) and feeds it closures from a queue. Every 100 ms it calls `tick(now)`, then drains events into the bus.
- Two event kinds are work orders, not news. `familyRequest {output, spec}` runs `family.materialize` on the bridge pool and answers with `family.resolved {output, media | error}`; `publishRequest {output, files, destinations, context}` runs `publish.run` and answers with `publish.result`. Both answers go back through the engine thread with `source: engine`.
- A family fetch is cancelled when the engine reports the output `finished` (the person stopped it); the `finished` set is cleared when a new request for that output arrives so a re-run is not born cancelled.
- `native.prepare_env` sets `FORMENCODER_DATA_DIR`, `FORMENCODER_FROZEN`, `FORMENCODER_REPO` and `FORMENCODER_RESOURCES` before the engine starts, because the Rust locator reads them to find FFmpeg and the bundled LUTs.

## RPC

- `/api/rpc` and the live socket share `engine/rpc.py`. Methods: `command.execute`, `command.batch`, `command.list`, `command.describe`, `ui.state`, `menu.bar`, `frame.png`, `encode.wait`, `engine.info`, `activity.list`, `family.discover`, `family.sources`, `family.add`, `family.addLink`, `family.send`, `publish.destinations`.
- The live socket runs slow methods (`frame.png`, `encode.wait`, the family calls) as tasks so a long wait never blocks the interface's other calls.
- `query_ids` caches which commands are queries (read from the engine at startup); consent uses it to let reads through without asking.
- `/api/preview.png` returns the PNG body with its metadata in `x-formencoder-preview` (exposed through CORS), so the interface can use a plain image request; `/api/fs/thumb` serves source thumbnails.

## Agents

- MCP over HTTP at `/mcp` (protocol versions 2025-03-26 to 2026-07-28) with the tools in `agent/tools.py`; `agent/stdio.py` is the stdio bridge that `formencoder mcp` runs and that starts the engine when it is not running.
- Consent: agents launched from the Terminal panel carry `FORMENCODER_AGENT_TOKEN` and never ask; outside agents ask the person once in the window (this session or always), unless `FORMENCODER_AGENTS` is `allow` or `deny`.
- `agent/workspace.py` keeps `~/Formencoder/agent-workspace` with CLAUDE.md, AGENTS.md, `.mcp.json`, `.codex/config.toml`, `.cursor/mcp.json`, a `bin/formencoder` shim and the `formencoder-harness` skill copied in for Claude Code (`.claude/skills`) and Codex and Cursor (`.agents/skills`).
- The `encode` tool is the short path an agent should reach for first: `queue.addSource` with `start`, `encode.wait` on exactly those outputs, then `encode.verify` per finished output.

## Family bridge (`engine/family.py`)

- Each app is found by its environment variable, its `engine.json` record, then its default port, and asked with its own local header (`x-formcut-local`, `x-formvfx-local`, `x-formwav-local`, `x-formvis-local`).
- formcut: `project.export` (exact, high quality), poll `job.status`, `job.result`, download the file when it is not on this disk. formvfx: Dynamic Link frames from `/api/link/frame.png` at the comp's rate plus `/api/link/audio`, written as a PNG sequence and a WAV that the engine reads as one source. formwav: the session document posted to `/api/render?format=wav&what=mix`. formvis: the library image.
- Sending back: formcut `media.import`, formvfx `file.import`.

## Publish (`engine/publish.py`)

Folder, FTP (with TLS and retries), S3-compatible storage signed with SigV4 (no SDK), webhook (JSON, HMAC-SHA256 signature), and a family app. `deleteLocal` removes the local files only when every destination succeeded. XMP and loudness reports are written by the Rust engine, not here.

## FFmpeg fetch (`ffmpeg_fetch.py`)

- The pinned record is `src-tauri/binaries/ffmpeg-licence.json`; its `release` names the formcut-binaries asset per target triple and every file's SHA-256. A source checkout with no FFmpeg downloads it once on boot (`FORMENCODER_FFMPEG_AUTO=0` turns that off) into the per-person data folder; `ffmpeg.fetch` over RPC and Help, Download formencoder's FFmpeg do the same on request. A file that does not match its pin aborts the install and leaves nothing behind.
- `setup/bundle_ffmpeg.py` uses the same functions to stage the build into `src-tauri/ffmpeg` for a desktop bundle and renames the programs to their plain names.
- The LGPL build has no software H.264, HEVC or AV1 encoder and no MP3. The engine's encoder probe reports that per machine, and an output that needs one fails with a sentence that names the fix; nothing here hides it.

## OpenH264 fetch (`openh264_fetch.py`)

Cisco's 2.6.0 binary per platform, pinned by the SHA-256 of the `.bz2` Cisco serves, unpacked into the per-person `tools/bin` with a `.part` file and an atomic rename, plus `licences/openh264-cisco.txt` carrying the attribution Cisco asks for. `openh264.fetch` over RPC (Preferences > Delivery Tools) and `./formencoder install-tools openh264` both call it, and the RPC re-runs the encoder probe so `openh264` joins the H.264 list at once. It is never staged into a bundle: Cisco's patent licence covers the binary when it is downloaded from Cisco.

## Opened files (`main.py` lifespan)

`FORMENCODER_OPEN` (set by the desktop shell from its arguments, separated by the platform's path separator) is routed by extension: `.fequeue` to `queue.open` with append, `.fepreset` to `preset.import`, anything else to one `queue.addSource`.
