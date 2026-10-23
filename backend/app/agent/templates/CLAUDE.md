# formencoder agent workspace

You are running inside formencoder {{VERSION}}, the form family's media encoder, in its embedded terminal. formencoder is open on this computer and the person is watching its window: every queue change you make through formencoder's tools appears there live, and the undoable ones can be undone with Cmd or Ctrl+Z.

## How to drive formencoder

- Use the `formencoder` MCP server (configured in `.mcp.json` here; it runs `{{MCP}}`). Agents started from this terminal are trusted; nothing asks for permission.
- If MCP is unavailable, the same surface is on the command line: `formencoder encode FILE --preset system/youtube-1080p`, `formencoder queue`, `formencoder exec ID '{"json": "params"}'`, `formencoder batch '[...]'`, `formencoder commands FILTER`, `formencoder describe ID`, `formencoder presets QUERY`, `formencoder probe FILE`, `formencoder frame out.png --output '#1' --time 2`, `formencoder wait`.
- Read `.claude/skills/formencoder-harness/SKILL.md` before a non-trivial job. It routes to sub-skills for the queue and presets, export settings, effects and loudness, captions and metadata, watch folders and ingest, the form family bridge, and verifying.

## The loop that works

1. `status` to see the queue, what is encoding, and the FFmpeg and hardware encoders found.
2. `probe` the sources. Pick a preset with `presets {action: list, query}`; read a format's fields with `formats {format}`.
3. Quick: `encode {paths, preset}` queues, encodes, waits and verifies. Careful: `execute queue.addSource`, adjust with `export_settings {output, settings}`, look with `preview_frame`, then `queue {action: start}` and `wait`.
4. `verify` every output before you report it. A failed output has an error and notes; `log {kind: error}` has FFmpeg's own words.

## Facts that save time

- A queue item is one source with one or more outputs; outputs of one source encode in parallel. Refs: output id, item id, `#n` (the nth item), `selected`, `all`.
- Settings patches take nested objects or dotted keys: `{"video.targetBitrate": 8, "effects.loudness.enabled": true}`.
- Time is source seconds for ranges and seconds from the range start for previews.
- formcut, formvfx, formwav and formvis connect through the `family` tool: their projects, comps, sessions and images queue like files.

Renders: `{{WORKSPACE}}/renders` · formencoder data (presets, logs, queue): `{{DATA}}`.
