---
name: desktop-and-release
description: Building and releasing formencoder as a desktop app. Use for the Tauri 2 shell in src-tauri, the PyInstaller sidecar formencoder-engine, bundling the pinned LGPL FFmpeg, icons and the splash, the macOS, Windows and Linux builds, the GitHub workflows, version bumps and release notes.
---

# desktop-and-release

## Pieces

- `src-tauri/` is the Tauri 2 shell (identifier `dev.formai.formencoder`). It starts the sidecar `formencoder-engine`, shows `splash.html` until the engine answers, then loads the interface the sidecar serves.
- `setup/freeze_backend` builds the sidecar with PyInstaller: the service, `fe_core`, the built interface (`frontend_dist`), the agent templates, `.claude/skills`, `backend/app/resources` and `ffmpeg-licence.json`. The binary is named with the target triple in `src-tauri/binaries/`.
- `setup/bundle_ffmpeg.py --target TRIPLE` stages the pinned LGPL FFmpeg into `src-tauri/ffmpeg`, checking every file against `src-tauri/binaries/ffmpeg-licence.json`; without a recorded build the app downloads FFmpeg on first run.
- `setup/desktop_build` runs the three in order and then `tauri build`.

## Targets

| OS | Triple | Bundles |
| --- | --- | --- |
| macOS Apple silicon | `aarch64-apple-darwin` | `.app`, `.dmg` |
| macOS Intel | `x86_64-apple-darwin` | `.app`, `.dmg` |
| Windows | `x86_64-pc-windows-msvc` | `.msi`, NSIS `.exe` |
| Linux | `x86_64-unknown-linux-gnu` | `.deb`, `.rpm`, `.AppImage` |

`.github/workflows/desktop.yml` builds all four on tag push; `ci.yml` builds the interface, checks the engine on each host, runs the text lint and `agents sync --check`.

## Releasing

1. Bump every version file listed in the skillset's Versions rule to the same `v*.*.*`.
2. Update `BUILD_NOTES.md` in the planning sidecar with what changed.
3. Commit `chore(release): vX.Y.Z` last in the series; tag `vX.Y.Z`.
4. The FFmpeg notices (`NOTICE.md`, `src-tauri/ffmpeg/README.md`) must ship with every bundle that carries FFmpeg: the LGPL requires the licence text, the source offer and the build's configure line.
