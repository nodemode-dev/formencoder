# formencoder

The media encoder of the form family, beside formcut (video), formvfx (motion graphics), formwav (audio) and formvis (images). A queue of sources with several outputs each, 81 encoding presets and 5 ingest presets, 33 formats from H.264, HEVC, AV1 and WebM to ProRes, DNxHR, XDCAM MXF, image sequences, GIF and audio, watch folders, card ingest with checksums, proxies, LUTs, HDR to SDR conform, overlays, Time Tuner, loudness normalisation, captions, metadata and publishing, on macOS, Windows and Linux.

Every action in formencoder is a command with an id, so people and agents use the same tools: Claude Code, Codex and Cursor drive formencoder from its embedded terminal through MCP, with a skill that teaches them the workflow.

## Pages

- [Getting Started](Getting-Started) · install, run, the first encode
- [Encoding](Encoding) · the queue, export settings, effects, watch folders, ingest, publish
- [Agents](Agents) · MCP, the Terminal panel, the command line, permissions
- [Form Family](Form-Family) · formcut, formvfx, formwav and formvis as sources and destinations
- [Architecture](Architecture) · the Rust encoding engine, the engine service, the interface
- [Desktop](Desktop) · the Tauri app, the frozen engine, the bundled FFmpeg
- [Releasing](Releasing) · versions, tags, CI
- [Parity](Parity) · formencoder against Media Encoder, row by row
