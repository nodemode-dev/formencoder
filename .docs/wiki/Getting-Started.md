# Getting Started

## Requirements

Node 20.19+ or 22.12+, Python 3.12+ and Rust 1.95+ (`https://rustup.rs`). `./formencoder doctor` checks them, FFmpeg and the ports. FFmpeg does not need to be installed: on first boot formencoder downloads its pinned LGPL build into your data folder.

## Install and run

```bash
./formencoder install   # engine venv, the Rust encoding engine, interface packages
./formencoder           # the engine on 127.0.0.1:8270 and the interface on http://localhost:5270
```

Windows: `formencoder.bat install`, then `formencoder.bat`. One process serving the built interface: `./formencoder serve` (http://127.0.0.1:8270).

## The first encode

1. Drag a clip into the Queue (or press Cmd or Ctrl+I). It gets one output from the default preset, Match Source, High bitrate.
2. Drag a preset from the Preset Browser onto the source to add another output, for example Social Media, YouTube 1080p.
3. Click an output's format or preset to open Export Settings: Source, Output and Compare views, every setting of the format, effects, captions, metadata and publish, with the estimated file size.
4. Press Start (Enter). The Encoding panel shows each output's frame, speed and time left; the queue row turns Done.

Cmd or Ctrl+K searches every command. Workspaces (Default, Encoding, Ingest, Agent, Minimal) are in the Window menu.

## Where things are kept

Presets, logs, the saved queue, LUTs and the downloaded FFmpeg live in the formencoder data folder (`~/Formencoder`, or `FORMENCODER_DATA_DIR`). Outputs go beside their source unless a folder is set (Preferences, Output).
