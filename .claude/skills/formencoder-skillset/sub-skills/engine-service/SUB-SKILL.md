---
name: engine-service
description: Changing formencoder's Python engine service in backend/app. Use for the engine host thread, the event bus, JSON-RPC methods, the live socket, file routes and previews, the terminal, the FFmpeg first-run fetch, the family bridge to formcut, formvfx, formwav and formvis, publish destinations, configuration, discovery or the frozen entry point.
---

# engine-service

Read `backend/HASHOUT_LOG.md` first.

## Where things live

| Path | Holds |
| --- | --- |
| `app/native.py` | importing `fe_core`, `prepare_env` (data folder, frozen paths, resources) |
| `app/engine/host.py` | `EngineHost`: the one thread that owns the `Engine`, `submit` and `call`, the 0.1 s tick, family and publish requests on a bridge pool |
| `app/engine/rpc.py` | `dispatch`: every JSON-RPC method (`command.*`, `ui.state`, `menu.bar`, `frame.png`, `encode.wait`, `family.*`, `publish.destinations`, `ffmpeg.fetch`) |
| `app/engine/bus.py` | the live socket fan-out and window registry |
| `app/engine/family.py` | locating family apps, listing their sources, materialising media, sending files back |
| `app/engine/publish.py` | folder, FTP, S3, webhook and family destinations |
| `app/ffmpeg_fetch.py` | the pinned LGPL FFmpeg download, checked file by file against `src-tauri/binaries/ffmpeg-licence.json` |
| `app/routers/` | `system`, `rpc`, `live`, `files` (`/api/fs/*`, `/api/preview.png`), `terminal`, `mcp`, `agents` |
| `app/core/` | `config` (ports, policies, paths), `discovery` (the running-engine record), `security` (local headers, session token) |
| `formencoder_engine.py` | the entry point: `serve`, `--selfcheck`, `cli`, `mcp` |

## Rules

- Only the host thread touches the `Engine`. Anything slow (family pulls, publish uploads, the FFmpeg fetch) runs on a pool and answers the engine with a command (`family.resolved`, `publish.result`).
- A new RPC method that changes state must be classified for consent (`agent/consent.py` `_READ_RPC` lists the reads). Slow methods go in `routers/live.py` `_SLOW`.
- Ports: the engine binds `127.0.0.1:8270`; nothing listens on other interfaces.
- Family app ports and headers live in `family.py` `APPS`; each app's `*_URL` environment variable overrides discovery.
- Secrets from publish settings never appear in logs or events.
