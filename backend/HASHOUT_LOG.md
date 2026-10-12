# backend · HASHOUT_LOG

Living context for formencoder's engine service. The code carries almost no comments; the reasoning lives here.

## What it is

A FastAPI process around the Rust engine (`fe_core`, built from the fencoder workspace in `native/`, crate `fencoder-py`). Rust owns the queue, settings, presets, FFmpeg and every command; Python owns HTTP, the live socket, MCP, the agent workspace, the embedded terminal and the two jobs that need the network: the form family bridge and publish destinations.

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

## formcut exports arriving on their own (`engine/links.py`, `routers/hooks.py`)

- `family.linkFormcut` registers formencoder's receiver (`/api/family/hooks/formcut`) as a webhook in the running formcut with `sendFile: true` and keeps formcut's secret, the preset, folder and start choice in `family_links.json` (mode 600). formcut then posts every finished export, multipart: the JSON as `payload` and the video as `file`.
- The receiver is loopback-only like every route, but it is the one POST that does not need `x-formencoder-local`, because formcut does not send it; instead it needs formcut's signature (`sha256=` HMAC of timestamp, a full stop and the payload under the link's secret, within five minutes), and the file's SHA-256 must match what formcut signed. The file lands in `imports/formcut` and is queued with `queue.addSource` as source `formcut`.
- `family.unlinkFormcut` deletes the webhook in formcut when formcut is running and forgets the link either way.

## Headless family engines (`engine/family.py`)

When an app is not running, `_need` starts its engine on its own: `{APP}_ENGINE` if set, otherwise `{app}-engine` on the PATH or in the usual install folders (the Tauri sidecar each family app ships), with `{APP}_PORT=0` so it binds a free port and publishes its `engine.json`, which `locate` already reads. formencoder waits up to 90 s for it to answer, logs it to `logs/{app}-engine.log`, and stops what it started when it shuts down. `FORMENCODER_FAMILY_HEADLESS=0` turns this off; `family.discover` reports `canStart`.

## Publish (`engine/publish.py`)

Folder, FTP (with TLS and retries), S3-compatible storage signed with SigV4 (no SDK), webhook (JSON, HMAC-SHA256 signature), and a family app. `deleteLocal` removes the local files only when every destination succeeded. XMP and loudness reports are written by the Rust engine, not here.

- **YouTube** refreshes an OAuth access token from the destination's client ID, secret and refresh token (`oauth2.googleapis.com/token`), opens a resumable session (`uploadType=resumable`, snippet and status in the body, `X-Upload-Content-Length`), then PUTs 8 MB chunks with `Content-Range`; a 308's `Range` header says where to go on, a 5xx or a dropped connection is retried with backoff after a `bytes */size` status query, and 200 or 201 carries the video id.
- **Vimeo** creates the video with `upload.approach = tus` (`POST /me/videos`, `Accept: application/vnd.vimeo.*+json;version=3.4`) and PATCHes 8 MB chunks to the `upload_link` with `Tus-Resumable: 1.0.0` and `Upload-Offset`, taking the new offset from each 204; after a failure a HEAD gives the offset to resume from.
- **Facebook** follows the Resumable Upload API: an upload session on the app (`/{app}/uploads`), the file POSTed with `Authorization: OAuth` and `file_offset` (a GET on the session gives the offset after a failure), then the handle published to the Page with the Page token (`graph-video.facebook.com/{version}/{page}/videos`, `fbuploader_video_file_chunk`). `graphVersion` defaults to v25.0, the version Meta's guide used when this was written.
- Credentials live in the destination like the FTP and S3 passwords do, so they are in the queue file and in presets saved from that output; the interface masks fields whose names contain password, secret or token.
- **Plug-in destinations** (`engine/plugins.py`) find the plug-in the way the engine does (the data folder's `plugins` and `FORMENCODER_PLUGINS`) and run it with the `publish` event; the protocol is in `docs/PLUGINS.md`.

## FFmpeg fetch (`ffmpeg_fetch.py`)

- The pinned record is `src-tauri/binaries/ffmpeg-licence.json`; its `release` names the formcut-binaries asset per target triple and every file's SHA-256. A source checkout with no FFmpeg downloads it once on boot (`FORMENCODER_FFMPEG_AUTO=0` turns that off) into the per-person data folder; `ffmpeg.fetch` over RPC and Help, Download formencoder's FFmpeg do the same on request. A file that does not match its pin aborts the install and leaves nothing behind.
- `setup/bundle_ffmpeg.py` uses the same functions to stage the build into `src-tauri/ffmpeg` for a desktop bundle and renames the programs to their plain names.
- The LGPL build has no software H.264, HEVC or AV1 encoder and no MP3. The engine's encoder probe reports that per machine, and an output that needs one fails with a sentence that names the fix; nothing here hides it.

## Speech model fetch (`model_fetch.py`)

whisper.cpp's `ggml-*.bin` models from Hugging Face, each pinned by the size and SHA-256 Hugging Face reports for the file, streamed into a `.part` file with progress and renamed only when both match. `model.fetch` over RPC publishes `toolFetch` progress at most twice a second; `./formencoder install-tools --model base` uses the same function.

## OpenH264 fetch (`openh264_fetch.py`)

Cisco's 2.6.0 binary per platform, pinned by the SHA-256 of the `.bz2` Cisco serves, unpacked into the per-person `tools/bin` with a `.part` file and an atomic rename, plus `licences/openh264-cisco.txt` carrying the attribution Cisco asks for. `openh264.fetch` over RPC (Preferences > Delivery Tools) and `./formencoder install-tools openh264` both call it, and the RPC re-runs the encoder probe so `openh264` joins the H.264 list at once. It is never staged into a bundle: Cisco's patent licence covers the binary when it is downloaded from Cisco.

## Opened files (`main.py` lifespan)

`FORMENCODER_OPEN` (set by the desktop shell from its arguments, separated by the platform's path separator) is routed by extension: `.fequeue` to `queue.open` with append, `.fepreset` to `preset.import`, anything else to one `queue.addSource`.

## Command tools, profiles, resources and prompts (0.2.2)

`tools.command_tools()` builds one MCP tool per registry row the first time a client lists or calls tools (the registry does not change while the engine runs), skipping any MCP name that collides with a curated tool so the curated one always wins; none collide at 0.2.2. The profile decides what `tools/list` shows, never what may be called: a core client that names `queue_add_source` still runs it, so a client with a tool ceiling loses nothing but discoverability, and `execute` covers that. Consent reads the command's `query` flag, so command tools ask exactly when `execute` would. Profiles travel as `--profile` to the stdio relay (which forwards `x-formencoder-mcp-profile`) or `?profile=` on HTTP, and `workspace.CLIENT_PROFILES` is the single place that says Claude Code and Codex get full and Cursor core. Resources read through the same commands as the tools (`queue.list`, `preset.list`, `format.list`, `format.encoders`, `log.read`, `queue.getSettings`, `preset.get`, `format.describe`, `command.describe`); preset ids contain a slash, so a template's id is everything after its prefix.

## Command line verbs (0.2.2)

`cli.py` treats a first argument with a dot and no path separator as a command id, fetches its schema with `command.describe` and turns flags into parameters by the schema's types. The dispatchers export `FORMENCODER_CWD` before they change into the repository, and only the path-named keys (`path`, `paths`, `folder`, `destination`, `transcodeFolder`) are resolved against it; the older `encode` verb still resolves paths from the repository folder.
