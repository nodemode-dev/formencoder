# Branching and release model

- **main** is always releasable. CI (`.github/workflows/ci.yml`) must pass before anything lands. No force-push to main.
- **Work branches** are short-lived and named by intent: `feat/[topic]`, `fix/[topic]`, `docs/[topic]`, `chore/[topic]`. Rebase on main before merging.
- **Commits** follow Conventional Commits with the version in the summary, for example `fix(core): keep the source range when a preset is applied (0.1.1)`. The commit identity is `nodemode-ai <mackin@nodemode.ai>`.
- **Versions** are `v*.*.*` with dots, everywhere: `frontend/package.json` and its lockfile, `frontend/src/version.ts`, `backend/app/__init__.py`, `native/Cargo.toml` (the workspace version), the seven fencoder entries in `native/Cargo.lock`, `native/fencoder-py/pyproject.toml`, `src-tauri/Cargo.toml`, its `Cargo.lock`, `src-tauri/tauri.conf.json`, the version line in `README.md` and the deliverable zip names. Bump all of them in one commit, the last of a series.
- **Engine commands.** A change to the engine's commands, formats, presets or MCP tools is followed in the same commit by `./formencoder agents sync`, so the harness references follow the engine.
- **FFmpeg.** The pinned build is changed only by replacing `src-tauri/binaries/ffmpeg-licence.json` with a new record from the formcut-binaries release, together with its `LGPL-2.1.txt` and `THIRD-PARTY-NOTICES.txt`, in one commit. Never point the fetch or the bundle at a build that is not recorded there.
- **Releases.** Pushing a tag `vX.Y.Z` on main runs `.github/workflows/desktop.yml`, which builds macOS (Apple silicon and Intel), Linux and Windows bundles with the pinned FFmpeg, attaches the FFmpeg source, and opens a draft GitHub release. Review the draft, then publish it.
- **Wiki.** Edit pages in `.docs/wiki/`, never in the GitHub wiki interface. `.github/workflows/wiki.yml` publishes the folder when it changes on main. The wiki needs one page created by hand once before the first publish.
