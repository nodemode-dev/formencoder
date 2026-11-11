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
- Names (0.2.9): the formvfx link is called Live Link in every message, and `discover` no longer returns an `alt` field naming the vendor app each family app stands beside, because the Family panel printed it as "like Premiere Pro". Vendor product names stay out of messages and agent instructions; the `/api/link/*` routes and the `.fvxlink` format keep their names.

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

## Approvals, full faith and the window's channel (0.2.4)

- Only the live socket speaks as the window (source `ui`). `/api/rpc` used to take `x-formencoder-source` at its word, so a local process sending `ui` skipped consent; HTTP callers are now `cli` when they claim `ui`, and MCP's become `mcp:agent`. Approving and full faith are live socket methods, refused from every other route, so an agent cannot approve itself through MCP, the command line or a terminal.
- `approvals.reasons` reads the registry's `destructiveHint` once and adds what the registry cannot know: publish destinations of upload types (and `deleteLocal`) inside any settings, `outputs[].settings` or patch; `queue.setOutput` onto an existing file; watch output folders and chains. The tools layer adds typing into a terminal and closing a terminal another client opened. One guard serves MCP tools and agents' `/api/rpc` command calls.
- The guard waits two minutes because agents work best with an answer in the same call; after that, or at once with no window, it answers `pendingApproval` and keeps the request, so a late Allow still runs the action and `approval_status` hands back the result. The decision is recorded as its own activity entry (`approval N for client: action`) beside the tool call's entry.

## Terminal hub (0.2.4)

- Sessions outlive their websocket so agents can open, type into and read terminals the person sees, and a tab can come back after a reload. A websocket without `?session=` still opens a private session that ends with it, which is what the Terminal panel of 0.2.3 does.
- Login shells reset PATH from the system profile, dropping the workspace `bin` that holds the `formencoder` shim. Bash now starts with `--rcfile` pointing at the workspace's `.formencoder-bashrc` (system profile, the person's first login file, then the shim first in PATH) and zsh with `ZDOTDIR` at `.formencoder-zsh`, whose files source the person's own and put the shim first last. Other shells keep the environment PATH.
- `terminal_read` and `terminal_send` remove colour and cursor codes so agents read plain text; the history keeps the last 256 K characters.

## Cross-site requests with no Origin (0.4.4)

- Plan and ledger: the family agent-stack standard, rule G4 (`AGENT_STACK_STANDARD.md` v0.2.0, owner decision D4, ledger FB-035, formai_dev sidecar). `app/core/security.py` `LocalOnly` admitted a request with no Origin once its client and Host were loopback (`local_origin` answers true for no Origin), so a web page could make the engine answer a GET by pointing an `<img>` or a link at `http://127.0.0.1:<port>/...`: browsers send no Origin on those, and any GET route with a side effect would run.
- The rule: a request that carries no Origin header is refused (the existing 403, "Local API request refused") when `Sec-Fetch-Site` is `cross-site`, trimmed and case-insensitive. A request that carries an Origin is decided by `local_origin` alone. `same-site` stays allowed on purpose: a dev window on `localhost:5270` loading straight from the engine's port is same-site, and no outside page can be same-site with localhost. The CLI, `setup/mcp_stdio.py` and Claude Code's MCP client send neither header and pass. The signed family hooks (`SIGNED_PREFIX`, `/api/family/hooks/`) are exempt only from the local header, as before; they are called by other form apps, not by a browser page, so the new refusal covers them too. `POST /mcp` keeps its own `local_origin` check. WebSockets always carry an Origin.
- Checked on the running engine (port 9125) at `/api/health`: no Origin with `cross-site` and with `  Cross-Site ` 403; `same-site`, `same-origin`, `none`, no header, and `cross-site` with the dev Origin `http://localhost:5270` 200; a foreign Host and `Origin: http://evil.example` 403. In Chromium, a page served from `http://127.0.0.2:9903` with an `<img>` and a clicked link pointing at `/api/health` got 403 for both, shown in the engine log. The built window served by the engine (`FORMENCODER_DIST`) in Chromium at 4x CPU and slow network, two shift runs and one throttle run: layout shift 0, no errors, no refusals from the window (6 refusals in the log before and after, all from the probes). `POST /mcp` initialize with no Origin 200; `setup/mcp_stdio.py` initializes and lists 123 tools. The encoding core was built here (`maturin develop --release`, fe_core 0.4.3) to boot the engine.

## formvfx answers on 8250 (0.4.5)

- Plan and ledger: the family agent-stack standard section 9 (`AGENT_STACK_STANDARD.md` v0.2.0, owner decision D3, ledger FB-018, formai_dev sidecar). formvfx's engine dev port moved from 8230, which was formpath's too, to 8250.
- Moved: the formvfx row of `APPS` in `app/engine/family.py` (the fallback probe port, used after `FORMVFX_URL` and the discovery record), the family tool description in `app/agent/tools.py`, the Form-Family wiki page and the form-family-bridge sub-skill in both skill copies; `agents sync` regenerated the tools reference and `--check` reports in step. No other peer changed.
- Checked: with a formvfx engine on 8250 (`FORMVFX_PORT=8250`) and this engine on 9143 with `FORMENCODER_AGENTS=allow`, the MCP tool `family {action: discover}` reports formvfx running at `http://127.0.0.1:8250`, version 0.51.9, found through its `engine.json`; `git grep` finds no 8230 outside LUT data and lock checksums.

## An Origin must be this app's own window (0.4.6)

- Plan and ledger: the family agent-stack standard, rule G2 (`AGENT_STACK_STANDARD.md` v0.2.0, ledger FB-038, formai_dev sidecar), as formwav 2.21.6 shipped it. `app/core/security.py` `LocalOnly` judged an Origin by its host alone (`local_origin`), so a page on any localhost or 127.0.0.1 port was answered.
- The rule: on the loopback path an Origin, when present, must be the engine's own (scheme http, host and port equal to the request's Host), `tauri://localhost`, `http://tauri.localhost` or one of `config.cors_origins()` (the dev and preview origins). `_origin_key` parses scheme, host and port (default 80 and 443) and the comparison is on the parsed tuple, never a prefix or the host alone. No Origin, the local header rule, the signed family hook path, G4, the Host check and the 403 body are unchanged. `local_origin` stays for `POST /mcp`, which sits behind `LocalOnly`.
- Checked on the running engine (port 9162) at `/api/health`: `Origin: http://localhost:5230`, `http://127.0.0.1:9163`, `http://localhost.evil.com`, `http://evil.example`, `null`, `http://localhost:5270.evil.com` and `https://127.0.0.1:9162` 403; the engine's own origin (127.0.0.1 and localhost), the dev origin 5270, the preview origin 5271, `tauri://localhost`, `http://tauri.localhost` and no Origin 200; cross-site with no Origin and a foreign Host 403, cross-site with the dev Origin 200. `POST /mcp` initialize 200 and `setup/mcp_stdio.py` lists 123 tools. Family discovery with `FORMVFX_URL` at a formvfx 0.51.9 engine on 9161 (which now applies G2 too) reports it running and `sources` answers. The built window served by the engine under 4x CPU and slow network: two shift runs and one throttle run, no errors, layout shift 0, 12 refusals in the log before and after, so none from the window; the img and link probes from 127.0.0.2 are still 403.

## The test suite (`backend/tests`, 0.4.8)

- Plan: FAMILY_TEST_PLAN v0.3.0 section 5 (formai_dev sidecar). `pytest` runs from `backend/` with `requirements-test.txt` (development only, never frozen or shipped) and needs the built `fe_core` (`./formencoder install-native --dev`) and ffmpeg and ffprobe on PATH. Nothing reaches the network: `FORMENCODER_FFMPEG_AUTO=0`, `FORMENCODER_AUTOSTART=0`, a temporary data folder and HOME, and every clip is made by the test with ffmpeg `testsrc2`, `sine` and `anoisesrc`.
- Differences from the family templates: this guard refuses a websocket with close code 1008 (not 4403) and reads no engine port from `engine.json` (it holds `url`); consent policy is the `FORMENCODER_AGENTS` variable (`ask`, `allow`, `deny`), read on every call, so the tests set it in the environment; the in-app bypass is the `x-formencoder-agent-token` header; the changing tool used is `history {action: list}`, which asks but changes nothing; the decline cooldown is tested by faking the window bridge (`host.bus.windows` and `ask_window`). Changing `/api/` calls also need `x-formencoder-local: 1` even from the engine's own origin, which the guard file checks. TestClient websockets send an explicit loopback Host.
- Engine tests drive `fe_core.Engine` in the test process with one data folder per engine and a tick loop. The first encode in a process waits for the encoder probe (about 20 s on a busy machine), which the process then caches; the encode and render tests together stay under two minutes. Encodes of H.264, ProRes and AV1 skip with a stated reason when this ffmpeg lacks every encoder for the codec.
- Ingest: the MD5 check is proved by a thread that flips the last byte of the copy as soon as it reaches full size, while a 160 MB file is still being read back; the run must fail with the MD5 message. The plan names a changed file; a source changed after it was read is not caught by `md5` (the hash is taken while reading) but is by `bit`, which is not tested because it cannot be raced reliably.
- Planner: for every encode preset the command line is built twice in one engine and once in a fresh engine and compared after the output id and data folder are normalised.
- Queue (0.5.5): the pause, stop and restart tests act on an encode that must still be running when they act, so `long_clip` is 10 minutes (a 20 s `testsrc2` clip looped with `-stream_loop` and `-c copy`). At 20 s, `prores_videotoolbox` on Apple silicon finished in about 0.6 s, and ffmpeg's first progress line (0.5 s) arrived just before the end, so the tests passed only when they caught that window. The engine was not at fault: pause, stop and restart behave as tested once the encode lasts long enough to be acted on.

## Desktop builds under formcompiler (0.5.0)

- `formencoder.bat desktop build` hands `%3` to `%9` to `setup\desktop_build.bat`, which hands `%*` to `tauri.cmd build`, as `setup/desktop_build` does with `"$@"`. formcompiler's `%FORMCOMPILER_CONFIG_ARG%` (`--config FILE`, two words, a runner temp path with no spaces) then reaches `tauri build` on Windows, so the updater settings in that file make the `.sig` files and the `windows-x86_64` entry in `latest.json`. With no arguments the build is the same as before.
- `.gitattributes` checks out `.bat`, `.cmd` and `.ps1` with CRLF; everything else stays LF.
- Notarization: Tauri signs the app, the `formencoder-engine` sidecar and frameworks, but not files that come in as `resources`, and `tools/` (bmx, asdcplib, OpenJPEG, Kvazaar, LAME, whisper.cpp, c2patool) and `ffmpeg/` (the programs and any dylibs) are resources. One unsigned or non-runtime Mach-O inside the `.app` fails notarization. `setup/sign_resources.py` runs on macOS in `setup/desktop_build` (and `./build_app`) after `bundle_ffmpeg.py` and before `tauri build`, which is after formcompiler's `install_tools.py --stage`: it finds every Mach-O file by its magic bytes (thin and fat, symlinks skipped), signs libraries first, then programs, with `codesign --force --options runtime --timestamp --sign "$APPLE_SIGNING_IDENTITY"` (plus `--keychain "$FORMCOMPILER_KEYCHAIN"` when that file exists), and checks each with `codesign --verify --strict`; a failure stops the build, since notarization would fail later anyway. With no identity (or `-`), or off macOS, it does nothing and the build is as before (ad hoc or unsigned resources).
- None of the staged tools is Python or JIT, so they are signed without entitlements. The PyInstaller onefile sidecar unpacks unsigned libraries at run time; Tauri signs it with `src-tauri/entitlements.plist` (`bundle.macOS.entitlements`), which holds `com.apple.security.cs.disable-library-validation` and `com.apple.security.cs.allow-unsigned-executable-memory`.
- LAME 3.100 ships a 2017 `config.guess`, which does not know Apple silicon. Before `./configure`, `setup/install_tools.py` copies `config.guess` and `config.sub` from `automake --print-libdir` when automake is installed, and on macOS passes `--build` and `--host` as `aarch64-apple-darwin` or `x86_64-apple-darwin`, so configure never needs to guess. The build is still the static `lame` program from the pinned tarball, run as a separate program, and the LGPL source offer is unchanged.
- CMake 4 (0.5.5) removed compatibility with `cmake_minimum_required` below 3.5, and the pinned bmx (libMXF), asdcplib and OpenJPEG still ask for less, so their configure failed with "Compatibility with CMake < 3.5 has been removed" and `--keep-going` left them out of the release without a hard failure. `build` in `setup/install_tools.py`, the one CMake configure call, passes `-DCMAKE_POLICY_VERSION_MINIMUM=3.5` for every CMake tool; CMake 3.x ignores the variable. `backend/tests/test_install_tools.py` checks each CMake tool's configure carries it.

## The window's scripts keep their types on Windows (0.5.1)

- Python's `mimetypes` takes file types from the Windows registry (`HKEY_CLASSES_ROOT\.js`, value `Content Type`) over its own table, and some installers and editors set `.js` to `text/plain`. On those PCs the engine served the built window's scripts as `text/plain`, WebView2 refused every module script under strict MIME checking, and the desktop window stayed blank; macOS, Linux, dev mode (Vite serves the page) and Windows PCs with the default value never showed it.
- `main.py` pins `.js` and `.mjs` to `text/javascript` and `.css` to `text/css` with three `mimetypes.add_type` calls, which covers `StaticFiles`, `FileResponse` and any direct `guess_type`. They sit after the last import, not above the imports: a module that re-reads the registry while importing cannot undo them, and no import follows a statement (E402). They look redundant off Windows; keep them.
- Repro on a Windows PC: `reg add "HKCU\Software\Classes\.js" /v "Content Type" /d "text/plain" /f`, then launch the rebuilt app; restore with `/d "text/javascript"`.
- Checked here: with the table poisoned to `text/plain` for js, mjs and css through `mimetypes.init(files=...)`, the three calls return `text/javascript`, `text/javascript` and `text/css`; `py_compile` passes. Not yet run on a Windows PC.

## The FFmpeg download names the new organisation (0.5.1)

- `ffmpeg_fetch.py` `RELEASE` now reads `https://github.com/nodemode-dev/formcut-binaries/releases/download`. The repository moved from nodemode-ai to nodemode-dev; the old address still answered with a 301 to the new one on 2026-10-31, but the fetch should not depend on that redirect lasting. Checked: `https://github.com/nodemode-dev/formcut-binaries/releases/download/ffmpeg-7.1.5-2/SHA256SUMS` answered 302 to the asset, and the same release's Linux archive downloaded and matched every pinned SHA-256 through the family fetch in formvis.

## The extension host, engine side (0.7.0)

- Plan: the Form extensions round (Form Extension Contract, API 1, `/home/claude/ext/contract`). `app/services/formext_host.py` is the kit's resolver, vendored unchanged (NOTICE row); everything formencoder-specific is in `app/services/extensions.py` (product `formencoder`, app name FormEncoder, the list cached by FormPortal root plus the modification times of `enabled.json` and `dev.json`, `?reload=1` forces a re-read so a changed development manifest shows) and `app/routers/extensions.py`.
- Routes: `GET /api/extensions` (the list with `stamp`, the FormPortal root and the Manage link), `GET /api/extensions/stamp` (what the window polls every 2 s while focused), `GET|HEAD /api/extensions/files/{id}/{version}/{path}` (`file_for` plus `headers_for`: nosniff, no-store, CORP cross-origin, ACAO `*`, the contract CSP with `'self'` on HTML; every refusal is a bare 404 with the same headers), `POST /api/extensions/save` (`files.save`: writes base64 where the person chose, `.part` then rename, 409 when the file exists and `overwrite` is false, 200 MB cap) and `POST /api/extensions/fetch` (`net.fetch`).
- `LocalOnly` exemption: the extension page runs in `sandbox="allow-scripts"`, an opaque origin, so its module scripts arrive with `Origin: null` and its images and styles with no Origin and `Sec-Fetch-Site: cross-site`; G2 and G4 refused both. GET and HEAD under `/api/extensions/files/` now pass when the client and Host are loopback, whatever the Origin. Nothing else changes: `/api/extensions` itself with `Origin: null` is still 403, a foreign Host is still 403, and the files are only the package's own (the route resolves inside the extension's folder, refuses symlinks, `..` and types outside the contract's list, and serves only extensions whose state is ready). `safe_send` no longer adds a second `x-content-type-options` when the route set one.
- `net.fetch` is offered because the engine already reaches the network. It resolves the host first and refuses loopback, private, link-local, reserved, multicast and unspecified addresses (an extension must not reach this engine or the LAN through it), takes https only, does not follow redirects (a 3xx comes back to the extension, so a redirect cannot land on a private address), drops Host, Cookie, Connection and Content-Length from the caller's headers, 60 s, 50 MB.
- Agents: `extensions.list` and `extensions.run` are JSON-RPC methods so MCP and the command line share them. Extension commands run in the window's sandbox, so both use `bus.ask_window({type: extensions, ...})` and the window answers with `reply`, the same route consent uses. `ask_window` gained `first=True`, which asks only the newest window: a command sent to every open window would run once per window. `extensions.list` is a read in `consent._READ_RPC`; `extensions.run` goes through the agent consent gate and then the extension's own consent in the window. The run waits up to 420 s (a consent dialog plus the contract's 120 s command limit). MCP tools `extensions_list` (read-only) and `extension_command`; CLI verbs `extensions` and `extension ID COMMAND --args JSON` in both dispatchers.
- Without a window, `extensions_list` reports `unknown` for an allowed-or-not extension that asks for permissions, because the grants live in the window's local storage (the kit's host bridge keeps them there).
- Checked on an engine at 9311 serving the built window, with a scratch `FORMPORTAL_ROOT`: the route matrix (traversal with `--path-as-is`, `%2e%2e`, a symlinked file, a symlinked folder, `.exe`, a refused extension, a wrong version, a foreign Host, `Origin: null` on the list) and the window run in `/home/claude/sidecars/formencoder/ext-host/TEST_PLAN.md`.

## Agents open the demos (0.8.0)

- `ui {action: demo, id: queue|broadcast|inspect}` publishes `{type: uiAction, action: demo, id}` to the windows only (kind `ui`) and returns at once; the window does the work (copying the demo's media into `imports`, one `command.batch`), so an agent and the person reach the same code and the same confirmation dialog. Without a window it fails plainly instead of queueing media nobody sees. Not a new engine command: the demos and their media live in the interface build, which the engine does not know about in development. The window side is in `frontend/HASHOUT_LOG.md` (#in-app-demos).

## Terminal output keeps split characters whole (0.8.1)

- `Session.read` on a pty used to decode each `os.read` chunk on its own, so a multi-byte character cut by a chunk boundary became two replacement characters in the Terminal panel. The session now holds one incremental UTF-8 decoder (`errors="replace"`) and `read` keeps reading while a chunk decodes to nothing, because `Term._start`'s pump takes an empty string as the end of the stream. At a real end (empty read, or the pty's `OSError` when the shell exits) the decoder is flushed first, so a dangling partial character is still delivered once.
- The same decoding now serves the non-pty fallback (the piped subprocess used when `winpty` is missing): both paths go through `Session._decoded(fetch)`, which owns the keep-reading-on-empty and flush-at-end rules. `winpty.read` returns text already and is untouched.

## Closed terminals are reaped (0.8.2)

Refers to `routers/terminal.py` `Term._start` (pump) · kind: fix · logged: v0.8.2 · 2026-11-10

- `Session.close` sends SIGHUP and at once calls `waitpid(WNOHANG)`, which returns before the shell has exited, and nothing reaped it later, so every closed, restarted or exited terminal left a zombie for the life of the engine. The pump thread now waits for the shell (`os.waitpid(pid, 0)`, POSIX, `OSError` suppressed when `close` already reaped it) once its read loop ends and before `_ended`. Checked with a scratch script in a venv outside the repo: five `Term`s on `/bin/sh` closed through `Session.close` leave no child of the engine a second later; the same script against the previous `terminal.py` leaves shells in state `Zs`.
