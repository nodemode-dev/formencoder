---
name: agent-substrate
description: Changing how agents drive formencoder. Use for the MCP tools and guide texts, the stdio relay, consent and the permission dialog, the agent workspace the Terminal panel opens, installing Claude Code, Codex and Cursor, the formencoder command line, or the formencoder-harness skill and its generated references.
---

# agent-substrate

## Where things live

| Path | Holds |
| --- | --- |
| `backend/app/agent/tools.py` | `INSTRUCTIONS`, `WORKFLOW`, `GUIDES`, `TOOLS` (21 tools) and their handlers |
| `backend/app/routers/mcp.py` | Streamable HTTP MCP at `/mcp` |
| `backend/app/agent/stdio.py`, `setup/mcp_stdio.py` | the stdio relay `./formencoder mcp`, which finds or starts the engine |
| `backend/app/agent/client.py` | engine discovery, autostart, headers, `rpc` |
| `backend/app/agent/consent.py` | the `FORMENCODER_AGENTS` policy, session and remembered clients, the dialog round trip |
| `backend/app/agent/workspace.py`, `templates/` | the agent workspace (`CLAUDE.md`, `AGENTS.md`, MCP configs, skills) the Terminal panel opens |
| `backend/app/agent/connect.py` | `./formencoder agents install`: user-level MCP entries and skill copies for Claude Code, Codex and Cursor |
| `backend/app/agent/cli.py`, `setup/fe.py` | the command line (`encode`, `queue`, `exec`, `batch`, `commands`, `describe`, `presets`, `probe`, `frame`, `wait`) |
| `setup/agents.py` | `sync` generates `references/commands.md`, `tools.md`, `presets.md` and `formats.md` from the engine and mirrors the skill to `.agents/skills` |
| `.claude/skills/formencoder-harness` | the hand-written skill: `SKILL.md`, sub-skills, `references/concepts.md` |

## Rules

- A tool is a thin, well-described shape over commands. New capability goes into the engine as a command first; a tool earns its place only when it saves agents several calls or verification (as `encode`, `verify`, `preview_frame` do).
- Tool descriptions say what comes back and when to use it. Errors returned to agents are one actionable sentence.
- Read tools are marked `readOnlyHint` and never ask consent; anything that changes the queue goes through `consent.gate`.
- After changing tools, guides, commands, formats or presets: `./formencoder agents sync`, then check the hand-written sub-skills still match (ids, defaults, result shapes), and run the god-tier validator on both skills.
- The harness skill's hand-written files must hold only facts checked against the engine: run the call, read the result, then write the sentence.
