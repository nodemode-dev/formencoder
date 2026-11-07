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

## Extensions

`extensions_list` and `extension_command` reach the extensions loaded in the window (see [Extensions](Extensions)). Extension commands run in the open window, so they need one, and the first run of an extension version asks the person there.
