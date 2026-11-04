# Contributing to FormEncoder

Thank you for helping. FormEncoder aims to be a free, local-first media encoder for the
desktop and the browser, beside the other Form apps, and it gets there through real use
and real contributions.

## Where to start

- **Use it and report what goes wrong.** A clear bug report, with steps, the version
  and your platform, is one of the most useful things you can give.
- **Look at the open issues.** Comment on one before starting larger work, so nobody
  builds the same thing twice.
- **Presets** are welcome: a missing delivery target or device is often a preset away.
  [docs/PARITY.md](docs/PARITY.md) is the capability checklist FormEncoder is built
  against.

## Setting up

Clone the repository and run `./formencoder install`, then `./formencoder` (or
`formencoder.bat install` and `formencoder.bat` on Windows). The first installs the
engine venv, the Rust encoding engine and the interface packages; the second starts the
engine on 127.0.0.1:8270 and the interface on http://localhost:5270. FFmpeg is
downloaded on first boot. `./formencoder doctor` checks the toolchain; the README's
Quick start has the details and the requirements.

The code lives in:

| Folder | What is there |
| --- | --- |
| `native` | the encoding engine (Rust, the fencoder crates, PyO3) |
| `backend/app` | the engine service (Python, FastAPI): MCP, terminal, family bridge, publish, the FFmpeg fetch |
| `frontend/src` | the interface (TypeScript, Vite) |
| `src-tauri` | the desktop shell (Rust, Tauri) |
| `setup` | install, boot, build, freeze and agent scripts |
| `backend/tests`, `frontend/tests/window` | the test suites |
| `.docs/wiki` | the wiki's source, published on push |

## Before you open a pull request

Run the same checks CI runs:

```sh
(cd frontend && npm ci && npm audit --audit-level=low && npm run build)
(cd native && RUSTFLAGS="-D warnings" cargo check --workspace --locked)
(cd backend && ./oc_install) && ./formencoder install-native --dev
(cd backend && venv/bin/python -m compileall -q app formencoder_engine.py && venv/bin/python formencoder_engine.py --selfcheck)
./formencoder agents sync --check
backend/venv/bin/pip install -r backend/requirements-test.txt
(cd backend && venv/bin/python -m pytest tests -q -p no:cacheprovider)
backend/venv/bin/python -m pytest frontend/tests/window -q -p no:cacheprovider
python3 setup/lint_text.py .
python3 -m py_compile setup/*.py
```

The engine tests need FFmpeg on your path, and the window smoke needs Playwright and its
Chromium (`backend/venv/bin/pip install pytest playwright`, then
`backend/venv/bin/python -m playwright install chromium`). CI also boots the engine and
encodes a clip over MCP, checks the shell scripts with `bash -n`, and checks the Tauri
shell with `cargo check --locked` in `src-tauri`.

- Keep each pull request to one change, with tests for what it adds or fixes.
- Write commit subjects the way the history does, in Conventional Commits:
  `feat(core): ...`, `fix(core): ...`, `docs(...)` (see
  [.docs/BRANCHING.md](.docs/BRANCHING.md)). Leave the version alone; a maintainer
  bumps it when releasing.
- A change to the engine's commands, formats, presets or MCP tools is followed in the
  same commit by `./formencoder agents sync`.
- FFmpeg stays the LGPL build. Nothing that would make FormEncoder's builds GPL can be
  bundled, and the pinned build changes only through
  `src-tauri/binaries/ffmpeg-licence.json`. OpenH264 stays a separate download from
  Cisco, never bundled.
- Every new dependency, binary, model or data file gets a row in `NOTICE.md` before it
  ships.
- Other vendors' product names appear only to name a file format, a preset file or
  compatibility. Never copy vendor help text, icons, presets, LUTs or sample media.
- Fit Tuning was declined in its luminance-difference form for patent risk and will
  not come back: it picks frames by comparing perceptual hashes of neighbouring
  frames, never by averaging per-pixel luminance differences between them, and it
  never smooths the scores and then numerically optimises where the cuts fall.

## Maintainers

FormEncoder is maintained by:

- the [nodemode-dev](https://github.com/nodemode-dev) organisation on GitHub
- [@nodemode-ai](https://github.com/nodemode-ai)
- [@gbarnai](https://github.com/gbarnai)

Reach them through issues and pull requests.

## How changes land

Only a maintainer pushes to `main`. Everyone else forks the repository and opens a pull request into `main`. A pull request merges when all seven CI jobs pass (the engine compile check runs on Linux, macOS and Windows) on an up-to-date branch and a maintainer has approved it after its last push.

## Releases

A release is a version, and only a maintainer makes one: after the version is bumped on
`main`, a maintainer cuts a `compile_vX.Y.Z` branch, and formcompiler
(`nodemode-dev/formcompiler`) builds every platform with the pinned FFmpeg and publishes
them together. No push from a contributor starts a release. See
[.docs/BRANCHING.md](.docs/BRANCHING.md) and the Releasing page of the wiki.

## Licensing

FormEncoder is licensed under the Apache License 2.0 ([LICENSE](LICENSE)). By
contributing, you agree that your contribution is licensed under the same terms. Only
add code you have the right to contribute, and name any third-party code and its licence
in the pull request.

## Patents and other people's IP

Some features are deliberately not built, or were taken out, because they come too close to someone else's patent, trademark, copyright or design. The maintainers hold that line with counsel; contributors do not decide it, and nobody here redesigns a feature on their own reading of a patent. This is engineering diligence, not legal advice.

### Features this project will not implement

- In Fit Tuning, a frame-change measure that averages per-pixel luminance differences between adjacent frames (or takes a maximum of subset averages), and smoothing of the scores together with a numerical optimisation of the cut positions. Frames are scored by the distance between perceptual hashes and ranked, nothing more.

A pull request that adds one of these, under any name, through any dependency, plug-in, model, template, agent tool or plain code, is closed with a link to this section. Lifting a decline needs the maintainers' written decision after a review, recorded here first.

### Rules for every contribution

- Patents: do not add a feature, or a dependency that provides one, that reproduces a method you know to be patented. If you are unsure, open an issue that describes what the feature does, not which patent it resembles. Patent numbers stay out of code, commits, comments, logs and changelogs.
- Trademarks: other vendors' product and feature names appear only to name a file format or compatibility ("opens <format> files", "for use with"). No command, menu, panel, tool, preset, template, theme or agent tool takes another product's feature name, and no text says "like X" or "the way X does it". Describe what the feature does.
- Copyright: never copy another product's help, tooltip, dialog or documentation text (link to it instead); never trace or import vendor icons; never bundle vendor templates, themes, presets, brushes, swatches, LUTs, materials, sample files, sound libraries, stock media or fonts; colour-book names only when reading a person's file. Compatibility layers carry names and signatures only. Test fixtures come from this repository's own scripts.
- Licences: every new dependency, binary, model, font, profile or data file gets a row in `NOTICE.md` before it is used. GPL stays outside the distributed bundle, AGPL nowhere, LGPL dynamically linked and replaceable, MPL files unedited. CC BY credited, CC BY-SA only unmodified, CC NC and ND never. Models with gated or non-commercial terms are optional downloads, never bundled.
- Licence conditions: The H.264 software codec is downloaded separately from its publisher under its own terms, is never bundled, shows its attribution in the app and can be turned off; keep all three.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.
