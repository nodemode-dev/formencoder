<p align="center"><img src="assets/app-icon/formencoder-256.png" width="128" height="128" alt="FormEncoder icon: a dark rounded square with two violet bars and a gradient play triangle"></p>

<h1 align="center">FormEncoder</h1>

<p align="center">
  <b>Media encoding; a queue of sources with several outputs each.</b><br>
  Presets, formats, effects, captions and delivery,<br>
  in one window, on your machine. Offline, and yours.
</p>

<p align="center">
  <img alt="version 0.6.0" src="https://img.shields.io/badge/version-0.6.0-eef0f4?style=flat-square">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-engine-b7410e?style=flat-square&logo=rust&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-interface-3178c6?style=flat-square">
  <img alt="macOS, Windows, Linux" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-native-2f7bf5?style=flat-square">
  <img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-3a3a3a?style=flat-square">
  <img alt="Status: pre-release" src="https://img.shields.io/badge/status-pre--release-d69e2e?style=flat-square">
</p>

<p align="center">
  <a href="https://formencoder.formai.studio/"><b>Download FormEncoder on formai.studio</b></a> ·
  <a href="#run-it-from-source">Run it from source</a>
</p>

<br>

<p align="center">
  <img src="docs/images/formencoder-hero.jpg" alt="FormEncoder encoding one source to three outputs: the Preset Browser, a queue with YouTube 1080p, TikTok 1080x1920 and animated GIF outputs, and the Encoding panel with progress and a live preview" width="100%">
  <br>
  <sub>One source, three outputs: YouTube 1080p, TikTok 1080x1920 and an animated GIF, encoding with a live preview.</sub>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#everything-in-the-box">In the box</a> ·
  <a href="#built-for-agents">Agents</a> ·
  <a href="#under-the-hood">Under the hood</a> ·
  <a href="#download">Download</a> ·
  <a href="#run-it-from-source">Run from source</a>
</p>

<table>
  <tr>
    <td width="25%" valign="top"><h3>Many outputs per source</h3>Drag presets onto a source to add outputs, and the queue encodes them in parallel.</td>
    <td width="25%" valign="top"><h3>Presets for every delivery</h3>93 encoding presets from web and social to broadcast, cinema, DVD and Blu-ray, plus 5 ingest presets.</td>
    <td width="25%" valign="top"><h3>Own Rust engine</h3>The encoding engine is written for FormEncoder and drives a pinned LGPL FFmpeg as a separate program.</td>
    <td width="25%" valign="top"><h3>Agent-ready</h3>The UI, the command line and an MCP server run the same 96 commands, so agents can drive the queue.</td>
  </tr>
</table>

## Features

<table>
  <tr>
    <td width="33%" valign="top">
      <img src="docs/images/formencoder-encoding.png" alt="FormEncoder queue with three sources and five outputs, three done and one encoding at 34 percent with a preview frame" width="100%">
      <br><sub>Three sources, five outputs, with progress and a preview.</sub>
      <h3>A queue that runs itself</h3>
      Each output shows status, speed and time left. Watch folders start encodes as files arrive.
    </td>
    <td width="33%" valign="top">
      <img src="docs/images/formencoder-settings.png" alt="Export Settings dialog for a TikTok 1080x1920 H.264 output with a preview and video settings" width="100%">
      <br><sub>Export Settings for a TikTok 1080x1920 output.</sub>
      <h3>Every setting, one dialog</h3>
      Source, Output and Compare views, then effects, video, audio, captions, publish and metadata.
    </td>
    <td width="33%" valign="top">
      <img src="docs/images/formencoder-agents.png" alt="The Agents panel with set-up buttons for Claude Code, Codex and Cursor, the MCP endpoints, permissions and recent agent activity" width="100%">
      <br><sub>The Agents panel: set-up, permissions and an activity log.</sub>
      <h3>Agents that change the queue</h3>
      An agent adds sources and outputs live, every change undoable. Permissions are yours to set.
    </td>
  </tr>
</table>

## Everything in the box

<table>
  <tr>
    <td width="33%" valign="top"><h4>96 commands</h4>Queue with undo · Export settings · Presets · Watch folders · Ingest with checksums · Media analysis · Previews · Logs</td>
    <td width="33%" valign="top"><h4>Effects and delivery</h4>LUTs · HDR to SDR conform · Overlays · Fit Tuning · Loudness normalisation · Captions · Speech to text · Metadata and XMP · Content Credentials · Publish to folders, FTP, S3, webhooks, YouTube, Vimeo, Facebook</td>
    <td width="33%" valign="top"><h4>40 formats</h4>H.264 · HEVC · AV1 · WebM · ProRes · DNxHR · CineForm · XDCAM · JPEG 2000 MXF · AS-10 · AS-11 · P2 · DCP · DPX · OpenEXR · GIF · audio</td>
  </tr>
</table>

## Built for agents

The window, the command line and the MCP server call the same 96 commands.

```sh
./formencoder encode clip.mov --preset system/youtube-1080p   # queue, encode and print results
./formencoder queue                                           # every output and its status
./formencoder probe clip.mov                                  # media information
./formencoder mcp                                             # MCP server on stdio for Claude Code, Codex and Cursor
```

`.mcp.json`, `.codex/config.toml` and `.cursor/mcp.json` are already wired in this repo. See [`AGENTS.md`](AGENTS.md).

## Under the hood

Version 0.6.0 · Apache-2.0 · Rust encoding engine, Python service, TypeScript interface, Tauri 2 shell

- **Engine:** seven `fencoder` Rust crates in `native/`, loaded by the Python service as the `fe_core` extension.
- **FFmpeg:** a pinned LGPL build, run as a separate program and never linked.
- **Encoders:** hardware first (VideoToolbox, Media Foundation, NVENC, QSV, AMF, VA-API), found by a test encode on each machine.
- **Capabilities:** [`docs/PARITY.md`](docs/PARITY.md) traces 84 capability rows: 82 Full, 2 Partial.
- **Tested:** backend tests (engine boot, MCP, consent, captions, versions) and a browser window test.

## Demo

Open [`demo/index.html`](demo/index.html) in Chrome or Edge, with no install, engine or network: the interface on a browser-side engine that probes your video or audio file, measures its loudness, and encodes it to WebM, GIF, WAV, AIFF, Ogg Opus or a still, with the queue, Preset Browser and Export Settings. See [`demo/README.md`](demo/README.md).

## Download

| Platform | Download | Release |
|---|---|---|
| macOS | [Download FormEncoder for macOS](https://formai.studio/get/formencoder/macos) | [FormEncoder releases on FormCompiler](https://github.com/nodemode-dev/formcompiler/releases?q=formencoder-v&expanded=true) |
| Windows | [Download FormEncoder for Windows](https://formai.studio/get/formencoder/windows) | [FormEncoder releases on FormCompiler](https://github.com/nodemode-dev/formcompiler/releases?q=formencoder-v&expanded=true) |
| Linux | [Download FormEncoder for Linux](https://formai.studio/get/formencoder/linux) | [FormEncoder releases on FormCompiler](https://github.com/nodemode-dev/formcompiler/releases?q=formencoder-v&expanded=true) |

All FormEncoder builds are compiled and released from [FormCompiler](https://github.com/nodemode-dev/formcompiler); this repo holds the source.

## Run it from source

Prefer it in your browser, or want to contribute? Run the web UI straight from this repo.

**Requires:** Node 20.19+ or 22.12+, Python 3.12+ and Rust 1.95+. `./formencoder doctor` checks them. FFmpeg is downloaded on first boot.

```sh
git clone git@github.com:nodemode-dev/formencoder.git
cd formencoder
./formencoder install   # engine venv, the Rust encoding engine, interface packages
./formencoder           # web UI at http://localhost:5270, engine on 127.0.0.1:8270
```

`./formencoder desktop dev` opens the desktop window instead (run `./formencoder install-desktop` first). On Windows use `formencoder.bat install`, then `formencoder.bat`.

Ports: interface 5270, engine 8270 (`FORMENCODER_PORT`). `FORMENCODER_AGENTS=allow` skips the agent permission prompt.

> [!IMPORTANT]
> **Status:** pre-release. AVC-Intra and vendor camera raw (R3D, ARRIRAW, X-OCN, Canon RAW, BRAW) are Partial, see [`docs/PARITY.md`](docs/PARITY.md).

**Contributing:** branch from `main`, keep changes to source here, and leave packaging and releases to FormCompiler. See [`.docs/BRANCHING.md`](.docs/BRANCHING.md) and [`AGENTS.md`](AGENTS.md).

## Repository

| Path | What it is |
|---|---|
| `native/` | The encoding engine: the fencoder Rust crates |
| `backend/` | FastAPI engine service, MCP server, terminal, family bridge, publish |
| `frontend/` | TypeScript and Vite interface |
| `src-tauri/` | Tauri 2 desktop shell |
| `setup/` | Scripts behind `./formencoder` |

Docs: [`.docs/wiki`](.docs/wiki) · Agents: [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md)

---

## Maintainers

| Maintainer | Role |
|---|---|
| [@nodemode-ai](https://github.com/nodemode-ai) | Owner |
| [@gbarnai](https://github.com/gbarnai) | Co-owner |

Code owners are set in [`.github/CODEOWNERS`](.github/CODEOWNERS).

## License

FormEncoder is licensed under Apache-2.0 ([`LICENSE`](LICENSE), SPDX `Apache-2.0`). Copyright 2026 NodeAgentc, Inc. Third-party notices: [`NOTICE.md`](NOTICE.md). FFmpeg is LGPL-2.1-or-later and runs as a separate program. OpenH264 Video Codec provided by Cisco Systems, Inc.

<sub>Screenshot content: CC0 photos from Poly Haven, used as video clips.</sub>

<sub>Adobe, Media Encoder and Premiere are trademarks of Adobe. Apple and ProRes are trademarks of Apple Inc. They are named only to identify file formats and compatibility. FormEncoder is an independent project and is not affiliated with or endorsed by them.</sub>
