# formencoder agent workspace

This folder is formencoder {{VERSION}}'s agent workspace. formencoder (the form family's media encoder) is running on this computer and the person sees its window; your queue changes appear there live.

- Drive formencoder with the `formencoder` MCP server (`.codex/config.toml` and `.cursor/mcp.json` here run `{{MCP}}`), or with the `formencoder` command line (`formencoder encode FILE --preset ID`, `formencoder queue`, `formencoder exec ID JSON`, `formencoder batch JSON`, `formencoder commands FILTER`, `formencoder describe ID`, `formencoder presets QUERY`, `formencoder probe FILE`, `formencoder frame OUT.png --output '#1'`).
- Read `.agents/skills/formencoder-harness/SKILL.md` first: it routes to the sub-skill for the job (queue and presets, export settings, effects and loudness, captions and metadata, watch folders and ingest, the form family, verifying).
- Loop: `status`, then `probe`, then `encode` or queue plus `export_settings`, then `preview_frame`, then `verify`. Never report an encode you did not verify.

Renders go in `{{WORKSPACE}}/renders`; formencoder's data is in `{{DATA}}`.
