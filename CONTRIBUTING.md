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
  [.docs/BRANCHING.md](.docs/BRANCHING.md)). Leave the version alone; the maintainer
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
- Fit Tuning was declined in its luminance-difference form for patent risk; CLAUDE.md
  says what must never come back.

## How changes land

Only the maintainer pushes to `main`. Everyone else forks the repository and opens a pull request into `main`. A pull request merges when all seven CI jobs pass (the engine compile check runs on Linux, macOS and Windows) on an up-to-date branch and the maintainer has approved it after its last push.

## Releases

A release is a version, and only the maintainer makes one: after the version is bumped on
`main`, the maintainer cuts a `compile_vX.Y.Z` branch, and formcompiler
(`nodemode-dev/formcompiler`) builds every platform with the pinned FFmpeg and publishes
them together. No push from a contributor starts a release. See
[.docs/BRANCHING.md](.docs/BRANCHING.md) and the Releasing page of the wiki.

## Licensing

FormEncoder is licensed under the Apache License 2.0 ([LICENSE](LICENSE)). By
contributing, you agree that your contribution is licensed under the same terms. Only
add code you have the right to contribute, and name any third-party code and its licence
in the pull request.

## Patents and other people's IP

A feature may be held back or removed if it would infringe someone else's patent or
other intellectual property. The maintainers decide.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.
