# Architecture

```text
fe_core (native/: the encoding engine, seven fencoder Rust crates, built from fencoder-py as the PyO3 extension with Engine and PreviewJob)
  -> engine thread (backend/app/engine/host.py), one Engine, ticked every 0.1 s
    -> family and publish requests answered on a bridge pool
    -> rpc.dispatch (one JSON-RPC surface)
      -> /api/live socket  -> interface store, panels
      -> /api/rpc HTTP     -> command line (setup/fe.py)
      -> /mcp              -> MCP tools -> stdio relay -> agents
    -> /api/preview.png, /api/fs/*, /api/terminal
desktop shell (Tauri 2) -> frozen engine sidecar formencoder-engine + the pinned LGPL FFmpeg
```

## The encoding engine

`native/` is formencoder's engine, written in Rust as a Cargo workspace in the form family's shape: `fencoder-core` (paths, preferences, logs, text, metadata, colour), `fencoder-io` (FFmpeg, encoders, formats, the delivery tools, captions, packaging), `fencoder-plan` (settings, presets, the graph planner), `fencoder-run` (the runner), `fencoder-engine` (the queue, undo, watch folders), `fencoder-commands` (the registry, where each command carries its MCP name and annotations, with execute and batch) and `fencoder-py` (the `fe_core` module). It owns the queue and undo, the 96 commands with their parameter schemas, the export settings model and the 40 formats' field specs, the presets, the FFmpeg graph planner (geometry, filters, effects, captions, encoder arguments, two pass, stitching, timecode), the parallel runner, watch folders, ingest, analysis, plug-ins, previews and logs. FFmpeg runs as a child process and is never linked. So do the delivery tools (`tools.rs`): bmx wraps AS-10, AS-11 and P2, asdcplib and OpenJPEG make DCPs (`wrap.rs` writes the CPL, PKL and ASSETMAP), Kvazaar and LAME take raw video or WAV from FFmpeg for software HEVC and MP3, whisper.cpp transcribes and c2patool signs. Cisco's OpenH264 is the one library loaded in process, at run time from Cisco's own download (`openh264.rs`), so Cisco's patent licence covers it; it is never bundled. Overlays and burnt-in captions are rendered by the engine with its own glyph rasteriser, and HDR to SDR conform is a generated 3D LUT, so nothing depends on GPL-only FFmpeg filters. Encoders are probed rather than assumed: each candidate (VideoToolbox, NVENC, QSV, AMF, VA-API, Media Foundation, then software) is tried once on a tiny frame and the result cached.

## The engine service

FastAPI around the engine: the host thread, the live socket, JSON-RPC, file browsing and previews, the terminal, MCP, the family bridge (formcut, formvfx, formwav, formvis) and publish destinations (folder, FTP, S3, webhook, family). Only the host thread touches the engine; slow work answers it with a command.

## The interface

Vanilla TypeScript and Vite in the form family look shared with formvis, formcut and formvfx: a dock with saved workspaces, the Queue, Encoding, Watch Folders, Media Browser, Preset Browser, Family, Log, Info, Terminal and Agents panels, Export Settings as its own window, a command palette, and menus generated from the command table. Panels mount once and patch nodes in place, so nothing flashes while the queue encodes.
