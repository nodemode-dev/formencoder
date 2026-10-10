# formencoder notices

formencoder is licensed under the Apache License 2.0 (`LICENSE`). It includes or depends on the following work.

| Component | Use | License |
| --- | --- | --- |
| FFmpeg 7.1.5, LGPL build from the formcut-binaries release (`ffmpeg-lgpl-7.1.5-2`), with libopus, libvpx and the hardware interfaces (libva, libdrm, nv-codec-headers, AMF) listed in `src-tauri/binaries/THIRD-PARTY-NOTICES.txt` | decoding, filtering and encoding, run as a separate program (`ffmpeg`, `ffprobe`) and never linked; bundled in the desktop app or downloaded on first run, each file checked against `src-tauri/binaries/ffmpeg-licence.json` | LGPL-2.1-or-later (`src-tauri/binaries/LGPL-2.1.txt`); the libraries' own permissive licences in `THIRD-PARTY-NOTICES.txt` |
| Inter Medium, by Rasmus Andersson (`native/fe-core/assets/fonts/Inter-Medium.otf`) | name, text and caption overlays drawn by `fe_core` | SIL Open Font License 1.1 (`native/fe-core/assets/fonts/Inter-LICENSE.txt`) |
| DejaVu Sans Mono (`native/fe-core/assets/fonts/DejaVuSansMono.ttf`) | the timecode overlay | Bitstream Vera and DejaVu licence (`native/fe-core/assets/fonts/DejaVu-LICENSE.txt`) |
| ab_glyph, png, md-5, regex, chrono, serde, serde_json | glyph rasterising, PNG files, ingest checksums, parsing, time and JSON in `native/fe-core` | Apache-2.0, MIT OR Apache-2.0 |
| libc (Unix), windows-sys (Windows) | process control for FFmpeg children in `native/fe-core` | MIT OR Apache-2.0 |
| PyO3, maturin | the Python extension | MIT OR Apache-2.0 |
| FastAPI, Starlette, Uvicorn, python-multipart | the engine service | MIT, BSD-3-Clause |
| pywinpty (Windows only) | the terminal on Windows | MIT |
| PyInstaller (build only) | freezing the engine sidecar | GPL-2.0 with the bootloader exception, which permits distributing the frozen program under its own licence |
| formvis and formvfx design system (NodeMode Studio tokens, shell, dock, panel, dialog, popup, palette, toast and file dialog code) | `frontend/src/styles`, `frontend/src/ui` | Apache-2.0 |
| Inter and JetBrains Mono (`@fontsource`) | interface fonts | SIL Open Font License 1.1 |
| xterm.js and its fit addon | the embedded terminal | MIT |
| Vite, TypeScript, Tauri 2, its API and the dialog, shell and updater plugins | build and desktop | MIT, Apache-2.0 |

## FFmpeg source offer

The FFmpeg in formencoder's desktop bundles is the unmodified 7.1.5 release (`https://ffmpeg.org/releases/ffmpeg-7.1.5.tar.xz`, SHA-256 in `src-tauri/binaries/ffmpeg-licence.json`), configured with `--disable-gpl --disable-nonfree --disable-version3`. The record lists every library compiled into it with its source URL and checksum, and each target's configure line. Every GitHub release of formencoder attaches that exact FFmpeg source tarball beside the bundles. To replace it, put another `ffmpeg` and `ffprobe` in a folder and choose that folder in Preferences (`ffmpegDir`) or set `FORMENCODER_FFMPEG_DIR`; formencoder uses whichever FFmpeg it is given.

## Media Encoder

Adobe and Media Encoder are trademarks of Adobe. formencoder is not affiliated with or endorsed by Adobe. It reads Media Encoder preset files (`.epr`) to import their settings and does not contain Adobe code.
