# Agents

formencoder's engine exposes every command to agents through MCP, the same commands the menus and buttons run. Changes appear in the window live, and the undoable ones are one step in History.

## Three ways in

- **In formencoder**: the Terminal panel (or the Agent workspace) opens a shell in formencoder's agent workspace. Its Claude Code, Codex and Cursor buttons start an agent that already has the `formencoder` MCP server and the `formencoder-harness` skill; it works without permission prompts.
- **From the repository**: `.mcp.json`, `.codex/config.toml` and `.cursor/mcp.json` run `./formencoder mcp`, which starts the engine when it is not running. The first change asks once in the formencoder window: Allow, Allow Always or Don't Allow.
- **From anywhere**: `./formencoder agents install` (or the Agents panel) adds the MCP server and the skill to your Claude Code, Codex and Cursor setup.

`FORMENCODER_AGENTS` sets the policy for outside agents: `ask` (default), `allow` or `deny`.

## The tools

21 tools: `status`, `list_commands`, `describe_command`, `execute`, `batch`, `probe`, `encode`, `queue`, `export_settings`, `preview_frame`, `contact_sheet`, `wait`, `verify`, `presets`, `formats`, `watch_folder`, `family`, `log`, `history`, `ui`, `guide`. `encode` queues, encodes, waits and verifies in one call; `preview_frame` and `contact_sheet` render frames through an output's exact settings so an agent looks before it encodes; `verify` probes the file against its settings.

## The skill

`.claude/skills/formencoder-harness` (mirrored to `.agents/skills`) teaches the loop: status, probe, choose a preset by destination, queue, look, encode, verify. Its sub-skills cover the queue and presets, export settings, effects and loudness, captions and metadata, watch folders and ingest, the form family bridge, publish, verification, the window and recipes for common deliveries. Its `references/` hold the commands, tools, presets and formats, generated from the engine by `./formencoder agents sync`.

## The command line

`./formencoder encode FILE --preset system/youtube-1080p`, `queue`, `exec ID 'JSON'`, `batch 'JSON'`, `commands FILTER`, `describe ID`, `presets QUERY`, `probe FILE`, `frame OUT.png --output '#1' --time 2`, `wait`, `extensions`, `extension ID COMMAND --args 'JSON'`.

## Form functions

`form-functions.json` at the repository root lists formencoder's Form functions: window-free, server-free callables a graph (NodeMode's hub) runs as nodes. Each is `fn(inputs, params, out_dir) -> dict` in `backend/app/functions`, takes local file paths in, writes only inside `out_dir`, and returns each output's path.

- `encode` (`app.functions:encode`): one video or audio file in (`media`), the same file encoded with a formencoder preset out (`media`). `params.preset` is required and must be one of the presets in the manifest's enum: the encode presets that write one video or audio file with FFmpeg alone (no stills, image sequences, DCP, P2 or AS-10/AS-11). `params.settings` is an optional export settings patch merged over the preset, as `queue.addSource` takes it, limited to an allowlist of fields that name no file: picture size, rate and quality, audio rate, channels and bitrate, fast start, range, crop, rotation, scaling and loudness normalisation. Anything else (a LUT, an overlay image, a caption source, a report folder, publish, plug-ins, the output name, the format or codec) is refused with an error, not dropped. The output's extension follows the preset's container; `outputs[0].by_param.preset` gives each preset's kind and extension.
- It runs the engine's own queue path (`queue.addSource`, `queue.start`, `encode.report`, `encode.verify`) on a headless engine with a private, temporary data folder, so it never touches the person's queue, presets or preferences, and fails when the output does not verify.
- Suggested defaults: `system/webm-vp9-1080p` for web video (VP9 is in the LGPL FFmpeg on every host; the H.264 presets such as `system/match-source-medium` need a hardware encoder or OpenH264) and `system/aac-256` for audio only.

From a shell, in `backend` with the engine venv:

```
python -m app.functions run encode --inputs '{"media": "clip.mp4"}' --params '{"preset": "system/aac-256"}' --out out
python -m app.functions manifest --check
```

`run` prints the result as one JSON line (or `{"error"}` and exit 1). After changing presets or formats, `python -m app.functions manifest --write` rebuilds `form-functions.json` from the engine; `backend/tests/test_functions.py` fails while it drifts.

## Extensions

`extensions_list` and `extension_command` reach the extensions loaded in the window (see [Extensions](Extensions)). Extension commands run in the open window, so they need one, and the first run of an extension version asks the person there.
