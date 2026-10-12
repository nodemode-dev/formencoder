# formencoder

The media encoder of the form family (an Adobe Media Encoder alternative): vanilla TypeScript and Vite interface, Python FastAPI engine around formencoder's own Rust encoding engine, a pinned LGPL FFmpeg, Tauri 2 desktop shell.

## Encoding (natural language)

When the person wants media encoded, transcoded, normalised, captioned, ingested, proxied or delivered with formencoder, use the `formencoder` MCP server's tools guided by the `formencoder-harness` skill in `.agents/skills/formencoder-harness` (its `references/tools.md` lists every tool; `references/commands.md` every command; `references/presets.md` and `references/formats.md` the presets and settings). Start with `status`, `probe` the sources, encode with `encode` or `queue.addSource` plus `export_settings`, look with `preview_frame`, and `verify` every output before reporting it.

The MCP server is configured here in `.codex/config.toml` (Codex) and `.cursor/mcp.json` (Cursor); both run `./formencoder mcp`, which starts the engine when it is not running. Codex loads the full profile (the 21 curated tools plus one tool per engine command, such as `queue_add_source`) and Cursor the core profile (the 21 curated tools; `execute` reaches every command). From any other folder, `./formencoder agents install` sets Claude Code, Codex and Cursor up for the user account. Without MCP, the `./formencoder` command line has the same surface: any command as `./formencoder [id] --name value` (`--help` after the id lists its flags), and `encode`, `queue`, `commands`, `describe`, `exec`, `batch`, `presets`, `probe`, `frame`, `wait`.

## Changing formencoder's code

Read `CLAUDE.md` and `.claude/skills/formencoder-skillset/SKILL.md`, then `frontend/HASHOUT_LOG.md`, `backend/HASHOUT_LOG.md` and `native/HASHOUT_LOG.md` (the engine's fencoder crates). After changing MCP tools or engine commands, formats or presets, run `./formencoder agents sync`.
