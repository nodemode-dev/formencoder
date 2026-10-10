# src-tauri/ffmpeg

`setup/bundle_ffmpeg.py --target [triple]` fills this folder with the LGPL FFmpeg 7.1 build recorded in `src-tauri/binaries/ffmpeg-licence.json` (the same builds formcut ships, from the formcut-binaries release), after checking every file against that record. `setup/desktop_build` and the desktop workflow run it before `tauri build`, and Tauri bundles the folder as the app's `ffmpeg` resource:

- macOS: `formencoder.app/Contents/Resources/ffmpeg`
- Windows: `ffmpeg` beside `formencoder.exe`
- Linux: `/usr/lib/formencoder/ffmpeg` (inside the package's own folder, so it never collides with a system FFmpeg in `/usr/bin`)

It empties the folder first, all but this file and `.gitignore`, and stages the programs under their plain names, `ffmpeg` and `ffprobe`.

In a clone it holds only this file. formencoder then finds FFmpeg in this order: the `ffmpegDir` preference, `FORMENCODER_FFMPEG_DIR`, the app's own folders, the per-person data folder (where the first run downloads the same pinned build), formcut's per-person folder, this folder, `src-tauri/binaries`, then `PATH`.

FFmpeg runs as a separate program and is never linked into formencoder. Its licence (LGPL-2.1-or-later), the third-party notices and the source offer are in `src-tauri/binaries/LGPL-2.1.txt`, `src-tauri/binaries/THIRD-PARTY-NOTICES.txt` and `NOTICE.md`, and ship with every bundle that carries it.
