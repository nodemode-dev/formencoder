---
name: formencoder-skillset
description: Use for any change to formencoder's own code, the Adobe Media Encoder alternative in the form family. Covers the Rust encoding engine in native/fe-core (queue model, commands, settings, formats, presets, the FFmpeg pipeline planner and runner, captions, overlays, colour, previews, the PyO3 surface), the FastAPI engine service in backend/app (engine thread, bus, JSON-RPC, live socket, files, FFmpeg fetch, the family bridge, publish), the agent substrate (MCP tools, consent, agent workspace, CLI, the harness skill generator), the TypeScript interface in frontend/src (store, dock, panels, Export Settings, zero-flash rules), the Tauri desktop shell and PyInstaller sidecar, CI and releases, and verification in a headless browser. Trigger on formencoder source files, a panel, command, format or preset to add, an encode bug, an MCP tool change, a desktop build, or ./formencoder scripts. Not for encoding media with formencoder (use formencoder-harness).
---

# formencoder-skillset

Route every change to formencoder's code through this file. It maps the subsystems, states the rules that hold everywhere, and names the specialist.

## Subsystem map

| Subsystem | Root | Specialist |
| --- | --- | --- |
| Encoding engine | `native/fe-core/src/` | `sub-skills/engine-core/SUB-SKILL.md` |
| Engine service | `backend/app/engine/`, `backend/app/routers/`, `backend/app/core/`, `backend/app/ffmpeg_fetch.py`, `backend/formencoder_engine.py` | `sub-skills/engine-service/SUB-SKILL.md` |
| Agent substrate | `backend/app/agent/`, `setup/agents.py`, `setup/mcp_stdio.py`, `setup/fe.py`, `.claude/skills/formencoder-harness` | `sub-skills/agent-substrate/SUB-SKILL.md` |
| Interface | `frontend/src/` | `sub-skills/interface/SUB-SKILL.md` |
| Desktop and release | `src-tauri/`, `setup/freeze_backend`, `setup/desktop_*`, `setup/bundle_ffmpeg.py`, `.github/workflows/` | `sub-skills/desktop-and-release/SUB-SKILL.md` |
| Verification | a procedure | `sub-skills/verification/SUB-SKILL.md` |

## How the pieces depend

```text
fe_core (native/fe-core: the encoding engine, PyO3 extension with Engine and PreviewJob)
  -> engine thread (backend/app/engine/host.py), one Engine, unsendable, ticked every 0.1 s
    -> engine events: familyRequest -> family.materialize -> family.resolved
                      publishRequest -> publish.run      -> publish.result
    -> rpc.dispatch (one JSON-RPC surface)
      -> /api/live socket  -> interface store, panels
      -> /api/rpc HTTP     -> CLI (setup/fe.py), scripts
      -> /mcp              -> MCP tools (backend/app/agent/tools.py) -> stdio relay -> agents
    -> /api/preview.png, /api/fs/*, /api/terminal
desktop shell (Tauri) -> frozen engine sidecar formencoder-engine (serves the built interface) + pinned LGPL FFmpeg
```

## Rules that hold everywhere

- **Commands are the API.** Any new capability is an engine command first (a row in `native/fe-core/src/commands.rs`, or a method on the PyO3 `Engine` in `py.rs` for state shaping); the interface, the MCP tools and the CLI then reach it through `rpc.dispatch`. Never give the interface logic the engine does not have.
- **One engine thread.** Only callables submitted through `host.submit` / `host.call` touch the `Engine`. Encodes run on runner threads inside `fe_core`; previews run as `PreviewJob` snapshots with the GIL released.
- **FFmpeg is LGPL and pinned.** formencoder drives the FFmpeg builds recorded in `src-tauri/binaries/ffmpeg-licence.json`; never add a GPL-only encoder (libx264 and libx265 are found at run time on a system build only, never shipped). Text overlays and burnt-in captions are rendered by `fe_core` itself so they do not depend on `drawtext`.
- **Zero flash.** The interface mounts once and patches keyed nodes (`patchList`, `setText`, `setClass`); a panel never rebuilds its container to change one value. Every colour is a token, every z-index a `var(--z-*)`, every icon an inline `currentColor` SVG.
- **Family classes keep their prefix.** Shared form family components keep `cv-` and `fx-` classes; formencoder's own are `fe-`.
- **Keep the agents in step.** After changing an MCP tool, a guide text, a command, a format or a preset, run `./formencoder agents sync` and commit the regenerated references and the `.agents/skills` mirror; CI runs `sync --check`.
- **Text hygiene.** No pictographs anywhere and no em dashes in Markdown: `python3 setup/lint_text.py .` must report 0.
- **Logs over comments.** Code carries near-zero comments; reasoning goes in `frontend/HASHOUT_LOG.md`, `backend/HASHOUT_LOG.md` and `native/fe-core/HASHOUT_LOG.md`.
- **Versions together.** `frontend/package.json` (and both fields in its lockfile), `frontend/src/version.ts`, `backend/app/__init__.py`, `native/fe-core/Cargo.toml`, its `Cargo.lock`, `native/fe-core/pyproject.toml`, `src-tauri/Cargo.toml`, its `Cargo.lock`, `src-tauri/tauri.conf.json` and the README version line always carry the same `v*.*.*`.

## Run it

```bash
./formencoder install              # venv, the encoding engine (release), interface packages
./formencoder                      # engine 8270 + interface 5270
./formencoder install-native --dev # quick engine rebuild after Rust changes
./formencoder serve                # the built interface from the engine
./formencoder desktop dev          # the Tauri shell with the frozen sidecar
./formencoder doctor               # toolchain, FFmpeg, installs and ports
```
