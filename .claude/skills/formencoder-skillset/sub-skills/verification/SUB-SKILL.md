---
name: verification
description: Verifying a change to formencoder before it ships. Use after any engine, service, interface, agent or desktop change to run the builds, boot the stack, encode real media, drive the interface in headless Chromium under CPU and network throttling, replay MCP tool sequences, and check the text, skill and version gates.
---

# verification

## Gates

| Gate | Command | Passes when |
| --- | --- | --- |
| Engine compiles on every host | `cd native/fe-core && cargo check` plus `--target x86_64-pc-windows-msvc` and `--target aarch64-apple-darwin` | no errors, no warnings |
| Engine self check | `backend/venv/bin/python backend/formencoder_engine.py --selfcheck` | `"ok": true` with 81 commands, 33 formats, 86 presets and the FFmpeg found |
| Interface types and bundle | `cd frontend && npm run build` | no errors |
| Text hygiene | `python3 setup/lint_text.py .` | 0 findings |
| Agent references | `./formencoder agents sync --check` | in step |
| Skills | the god-tier `validate_skill.py` on `.claude/skills/formencoder-harness` and `formencoder-skillset` | 0 FAIL |
| Toolchain | `./formencoder doctor` | ready |
| Shell | `cd src-tauri && cargo check` | compiles |

## Encodes

A change to settings, formats, presets, effects or the pipeline is verified by encoding: queue short real clips with the presets the change touches, `wait`, then `verify` each output and `probe` the fields the change is about. A visual change is verified by looking at `preview_frame` and at a frame of the encoded file. Keep a few short sources (a 1080p clip with audio and timecode, a vertical clip, an HDR clip, a caption file) in a scratch folder for this.

## Interface under throttling

1. Build the interface and serve it from the engine (`./formencoder serve`), or run Vite on 5270 against the engine on 8270.
2. Drive Chromium with Playwright (`/opt/pw-browsers` in the cloud workspace): CDP `Emulation.setCPUThrottlingRate` 4, `Network.emulateNetworkConditions` (120 ms, 1.5 MB/s), cache disabled, a `layout-shift` PerformanceObserver and a MutationObserver on the queue list injected before load.
3. Screenshot at 0.15, 0.4, 0.8, 1.5, 2.5 and 4 s after navigation: one uniform background until the shell reveals, reserved boxes filled in place, no layout shifts.
4. Start an encode and record mutations on the queue list: progress must patch text and widths only, with no node replaced.
5. Exercise every path the change touched and screenshot the moment of change. Collect `pageerror` and console errors; there must be none.

## Agent paths

Replay tool sequences through `setup/mcp_stdio.py` against a running engine (`FORMENCODER_AGENTS=allow` for unattended runs, `ask` to test the consent dialog with a browser open). Save the images `preview_frame` and `contact_sheet` return and look at them.

## Report

State in the turn ledger what was verified under throttling, what without and why, and what was not verified.
