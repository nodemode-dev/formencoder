# formencoder notices

formencoder is licensed under the Apache License 2.0 (`LICENSE`). It includes or depends on the following work.

| Component | Use | License |
| --- | --- | --- |
| FFmpeg 7.1.5, LGPL build from the formcut-binaries release (`ffmpeg-lgpl-7.1.5-2`), with libopus, libvpx and the hardware interfaces (libva, libdrm, nv-codec-headers, AMF) listed in `src-tauri/binaries/THIRD-PARTY-NOTICES.txt` | decoding, filtering and encoding, run as a separate program (`ffmpeg`, `ffprobe`) and never linked; bundled in the desktop app or downloaded on first run, each file checked against `src-tauri/binaries/ffmpeg-licence.json` | LGPL-2.1-or-later (`src-tauri/binaries/LGPL-2.1.txt`); the libraries' own permissive licences in `THIRD-PARTY-NOTICES.txt` |
| BBC bmx v1.6 (`bmxtranswrap`, `mxf2raw`), with its bundled libMXF, libMXF++, expat and uriparser | AS-10, AS-11 OP1a, AS-11 D10 and P2 OP-Atom wrapping and read-back, run as separate programs; built from the pinned tag by `./formencoder install-tools` and staged in `src-tauri/tools` for the desktop bundles | BSD-3-Clause (expat MIT, uriparser BSD-3-Clause); texts in `tools/licences` |
| asdcplib rel_2_13_2 (`asdcp-wrap`, `asdcp-info`), built without OpenSSL and Xerces | DCP picture and sound track files, run as separate programs | BSD-3-Clause; text in `tools/licences` |
| OpenJPEG v2.5.3 (`opj_compress`), with its bundled libpng, libtiff, lcms2 and zlib | DCI cinema-profile JPEG 2000 frames for DCP, run as a separate program | BSD-2-Clause (libpng, libtiff, lcms2 MIT, zlib licences); text in `tools/licences` |
| Kvazaar v2.3.2 (`kvazaar`) | software HEVC when the FFmpeg has no libx265, fed raw frames on its input, run as a separate program | BSD-3-Clause; text in `tools/licences` |
| LAME 3.100 (`lame`) | MP3 audio files when the FFmpeg has no libmp3lame, run as a separate program and never linked; built from the unmodified 3.100 release (`lame-3.100.tar.gz`, SHA-256 `ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e`), whose source is the LGPL source offer | LGPL-2.0-or-later; text in `tools/licences` |
| OpenH264 2.6.0, Cisco's binary (`libopenh264`) | software H.264 when the FFmpeg has no libx264, loaded at run time by `native/fe-core/src/openh264.rs`; downloaded from Cisco on request (Preferences > Delivery Tools or `./formencoder install-tools openh264`), checked against pinned SHA-256s and never bundled, so Cisco's AVC patent licence applies to each download. OpenH264 Video Codec provided by Cisco Systems, Inc. | BSD-2-Clause with Cisco's binary licence (`https://www.openh264.org/BINARY_LICENSE.txt`) |
| sha1 | DCP packing list hashes in `native/fe-core` | MIT OR Apache-2.0 |
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
