---
name: session-and-connection
description: How an agent reaches formencoder. Use when the formencoder MCP server or its tools are missing, a tool reports that the engine is not running, a permission prompt or refusal appears, FFmpeg is missing, the agent runs outside formencoder's Terminal panel, or the work should go through the formencoder command line instead of MCP.
---

# session-and-connection

## The pieces

- **The engine** is a local service (default `http://127.0.0.1:8270`) that holds the queue and runs the encodes. The formencoder window, the MCP server and the command line all talk to the same engine, so they all see the same queue.
- **The MCP server** `formencoder` is reachable two ways: `./formencoder mcp` (stdio; the Claude Code, Codex and Cursor configs in this repository and in the agent workspace use it) and Streamable HTTP at `http://127.0.0.1:8270/mcp`. The stdio relay finds the running engine (`FORMENCODER_MCP_URL`, then `FORMENCODER_URL`, then the discovery record the engine writes, then the default port) and starts one in the background when none is running.
- **The command line** `formencoder` (or `./formencoder` in the repository) has the same surface: `formencoder encode FILE --preset ID`, `formencoder queue`, `formencoder commands FILTER`, `formencoder describe ID`, `formencoder exec ID 'JSON'`, `formencoder batch 'JSON'`, `formencoder presets QUERY`, `formencoder probe FILE`, `formencoder frame OUT.png --output '#1' --time 2`, `formencoder wait`. Use it when MCP tools are not loaded in this session. `references/tools.md` maps each tool to its shell form.

## Where agents run

| Started from | Trust | Configuration |
| --- | --- | --- |
| formencoder's Terminal panel (the Claude Code, Codex or Cursor buttons, or typed) | trusted: the shell carries the session token, nothing asks | the agent workspace: `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `.codex/config.toml`, `.cursor/mcp.json` and this skill |
| The formencoder repository | asks once per client in the window | `.mcp.json`, `.codex/config.toml`, `.cursor/mcp.json` at the repository root |
| Any other folder | asks once per client in the window | `./formencoder agents install` (or the Agents panel) adds the MCP server and this skill to the user's Claude Code, Codex and Cursor setup |

## Permission

- Reads (`status`, `probe`, `preview_frame`, `contact_sheet`, `verify`, `wait`, `log`, `formats`, `list_commands` and every query command) never ask.
- The first change from an outside agent opens a dialog in the formencoder window: **Allow** (this session), **Allow Always** (remembered), **Don't Allow**. Tell the person a prompt is waiting in formencoder when you make the first change.
- `FORMENCODER_AGENTS` on the engine sets the policy: `ask` (default), `allow` (never ask) or `deny` (refuse outside agents; Terminal agents still work).
- The Agents panel shows who is allowed and can forget them.

## FFmpeg

formencoder encodes with an LGPL FFmpeg build it pins (the same builds formcut ships). `status` says which FFmpeg is in use and which hardware encoders work.

- The desktop app carries it. A source checkout downloads it on first boot into the per-person data folder, checking every file against the pinned record.
- When `status` reports FFmpeg missing, no encode can run. Ask the person to choose Help, Download formencoder's FFmpeg (LGPL) in the window, or set the `ffmpegDir` preference (`execute prefs.set {values: {ffmpegDir: "/abs/folder"}}`) to a folder holding `ffmpeg` and `ffprobe`.
- A system FFmpeg is used only when neither is present; it may lack encoders formats expect, and `formats {format}` then shows them as missing.

## When something is wrong

| Message | What to do |
| --- | --- |
| `The formencoder engine is not running and could not be started` | Ask the person to run `./formencoder boot` in the formencoder folder or open the desktop app, then retry. |
| `No formencoder window is open to ask the person for permission` | The policy is `ask` and no window is open. Ask the person to open formencoder (or start the agent from its Terminal panel), then retry. |
| `Nobody answered the permission request` | The dialog timed out. Ask the person to answer it in the formencoder window. |
| `Outside agents are turned off (FORMENCODER_AGENTS=deny)` | Only Terminal agents may change the queue. Suggest starting the agent from the Terminal panel. |
| `The formencoder engine stopped answering` | The engine exited or is busy past the timeout. `status` again; if it fails, ask the person to restart formencoder. |

## Several windows

More than one formencoder window can watch the same engine (`status` reports `windows`). They all show the same queue and follow the same selection. Changes from any window, agent or command line appear in all of them.
