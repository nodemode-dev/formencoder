---
name: engine-core
description: Changing formencoder's Rust encoding engine in native/fe-core. Use when adding or changing a command, a format, a codec field, a preset, a settings key, an effect, caption handling, the FFmpeg graph planner, the runner, watch folders, previews, logs or the PyO3 surface, or when an encode produces the wrong file.
---

# engine-core

Read `native/fe-core/HASHOUT_LOG.md` first: it carries the reasoning the code does not.

## Where things live

| File | Holds |
| --- | --- |
| `engine.rs` | `Engine`: the document (`doc = {items, watch}`), undo, ids, `tick`, events, the UI state shaping |
| `commands.rs` | the command table (`c(id, label, menu, params, required, undoable, query, shortcut, doc, handler)`) and every handler |
| `settings.rs` | defaults per format, `normalize`, `apply_patch`, the summary line |
| `formats.rs` | the 33 formats, codecs, containers and field specs with `showIf` |
| `presets.rs` | system and ingest presets, user preset files (`.fepreset`), `.epr` import |
| `pipeline.rs` | the plan: geometry, filter graph, effects, captions, encoder arguments, estimate, unique paths |
| `runner.rs` | worker threads running FFmpeg, progress, two-pass, ingest copy and verify, publish and family requests |
| `encoders.rs` | encoder candidates per codec and the probed `works` cache |
| `ffmpeg.rs` | locating FFmpeg, `probe`, process construction |
| `captions.rs`, `text.rs`, `colour.rs`, `sidecars.rs` | caption parse and convert, glyph rendering, LUTs and SDR conform, XMP, loudness XML and analysis JSON |
| `preview.rs` | `PreviewJob`: frames and contact sheets through an output's settings |
| `py.rs` | the PyO3 `Engine` and functions (`probe`, `thumbnail`, `ffmpeg_info`, `catalogue`, `version`) |

## Adding a command

1. Write the handler `fn name(e: &mut Engine, p: &Value) -> Res` in `commands.rs`.
2. Add one row to the table with a stable id (`namespace.verb`), a label as the menu shows it, the menu, a parameter schema built with the `p!` macro, the required keys, `undoable` for anything that changes the document, `query` for reads, a shortcut if it has one and a one-line doc.
3. `check` validates parameters from the schema, so the handler can trust types and enums.
4. The interface reaches it through `invoke` and the menus through the table; agents see it through `list_commands`. Run `./formencoder agents sync`.

## Adding a format or settings field

Add the format row and its field specs in `formats.rs`, its defaults in `settings.rs`, its arguments in `pipeline.rs`. The Export Settings window and `formats {format}` render from the specs, so no interface change is needed for a plain field. Keep LGPL in mind: a codec only a GPL encoder provides must be optional and found at run time.

## Rules

- Never block the engine thread on FFmpeg; encodes and probes for previews run off it.
- Errors are one sentence a person or agent can act on, naming the valid values when there is a fixed set.
- Ids and parameter names are an API: agents and saved queues depend on them. Add, do not rename.
- Build: `./formencoder install-native --dev` (debug) or `./formencoder install-native` (release). Check the three host targets compile: `cargo check --target x86_64-pc-windows-msvc` and `--target aarch64-apple-darwin` as well as Linux.
