# formencoder

The media encoder of the form family beside formcut, formvfx, formwav and formvis: a vanilla TypeScript and Vite interface, a Python FastAPI engine service around formencoder's own Rust encoding engine (`fe_core`, wrapped with PyO3), FFmpeg (a pinned LGPL build) as the codec layer, and a Tauri 2 desktop shell.

## Two kinds of work

**Encoding with formencoder** (a file for YouTube, a broadcast master, proxies, a watch folder, loudness, captions, a formcut edit or formvfx comp to deliver): use the `formencoder` MCP server (`.mcp.json` runs `./formencoder mcp`, which starts the engine when needed) with the `formencoder-harness` skill in `.claude/skills/formencoder-harness`. Start with `status`, encode with `encode` or `queue.addSource` plus `export_settings`, look with `preview_frame`, and `verify` every output. The first change asks the person once in the formencoder window; agents started from formencoder's Terminal panel never ask. Consequential actions (deleting, clearing or resetting, publishing to an outside service, overwriting a file, changing where a watch folder writes, typing into a terminal) also wait for the person's approval unless they turned on full faith; a call that answers `pendingApproval` has not run, and `approval_status {id}` gives the decision later.

**Changing formencoder's code**: route through `.claude/skills/formencoder-skillset/SKILL.md` (subsystem map, rules, specialists) and read the living logs `frontend/HASHOUT_LOG.md`, `backend/HASHOUT_LOG.md` and `native/HASHOUT_LOG.md` before editing.

## Layout

- `native/` · the encoding engine (`fe_core`), written for formencoder in Rust as a Cargo workspace of seven fencoder crates (core, io, plan, run, engine, commands, py; the map is in `native/HASHOUT_LOG.md`): the queue and undo, commands, export settings, 40 formats, 98 presets, the FFmpeg graph planner and parallel runner, the separate delivery tools (bmx, asdcplib, OpenJPEG, OpenH264, Kvazaar, LAME, whisper.cpp, c2patool) and packaging, watch folders, ingest, captions, overlays, colour, loudness, plug-ins, previews and logs, exposed to Python with PyO3. Build with `./formencoder install-native`; `./formencoder install-tools` builds the delivery tools from pinned sources.
- `backend/app/` · the engine service: `engine/` (the engine thread, bus, JSON-RPC, family bridge, publish), `routers/` (live socket, files and previews, terminal, MCP, agents), `agent/` (MCP tools, consent, workspace, CLI), `ffmpeg_fetch.py` (the pinned FFmpeg download).
- `frontend/src/` · the interface: `engine/` (client, store; no DOM), `ui/` (dock, menus, palette, forms, widgets), `panels/`, `app/`.
- `setup/` · install, boot, build, freeze and desktop scripts behind the `./formencoder` dispatcher; `setup/agents.py` regenerates the harness skill's references from the engine.
- `./build_app` (`build_app.bat` on Windows) is the one-shot desktop build from a fresh clone: tools, install, interface, sidecar, FFmpeg, bundle, and on macOS the copy to Applications.
- Planning documents (DEV_PLAN, BUILD_NOTES, TEST_PLAN, the root HASHOUT_LOG) ship in the planning sidecar zip, not in this tree.

## After changing the MCP tools or the engine's commands, formats or presets

Run `./formencoder agents sync` so `.claude/skills/formencoder-harness/references/` and the `.agents/skills` mirror follow; `./formencoder agents sync --check` fails while they drift.

## Trademarks, copyright and licences

- Other vendors' product and feature names appear only to name a file format, a preset file or compatibility (Media Encoder `.epr` import, "ProRes"). Never as a formencoder command, panel, effect, tool or agent tool name, and never as "like Premiere" or "a Media Encoder alternative" in UI text, agent instructions or READMEs. Effect labels are formencoder's own (Look / LUT, Fit Tuning, Live Link); command and setting ids such as `effects.timeTuner` stay as they are. `README.md` and `NOTICE.md` list every vendor mark named.
- OpenH264 stays a separate download from Cisco, never bundled, with the Use OpenH264 switch (the `openh264` preference, which `openh264::library()` obeys) in Preferences > Delivery Tools, "OpenH264 Video Codec provided by Cisco Systems, Inc." beside the switch, and Cisco's licence reproduced in `NOTICE.md`.
- FFmpeg stays the LGPL build (`--disable-gpl --disable-nonfree --disable-version3`) with its source offer.
- Never copy vendor help text, never import or trace vendor icons, and never bundle vendor presets, LUTs, looks or sample media; the bundled looks come from `setup/make_luts.py`.
- Every new dependency, binary, model or data file gets a row in `NOTICE.md` before it ships. GPL stays outside the distributed bundle, AGPL nowhere, LGPL run as a separate program or dynamically linked and replaceable; models with gated or non-commercial terms stay optional downloads.
