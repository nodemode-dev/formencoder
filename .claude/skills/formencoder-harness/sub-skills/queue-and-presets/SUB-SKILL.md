---
name: queue-and-presets
description: The formencoder queue and the Preset Browser. Use when adding files, folders, image sequences or stitched clips; adding, duplicating, removing or reordering outputs; setting ranges, output files or names; interpreting footage; starting, pausing, stopping or re-encoding; saving or opening a queue; or finding, creating, importing, exporting or aliasing presets, including Media Encoder .epr presets.
---

# queue-and-presets

## Adding sources

| Need | Call |
| --- | --- |
| Files with one preset each | `execute queue.addSource {paths, preset}` |
| Files with several outputs each | `execute queue.addSource {paths, outputs: [{preset, settings?, folder?}, ...]}` |
| Everything in a folder | `execute queue.addFolder {folder, recursive?, preset?, kinds?: [video, audio, image]}` |
| An image sequence | `queue.addSource {paths: ["/abs/shot/frame_0001.png"], frameRate: 24, preset}`: one numbered frame plus a rate adds the whole sequence |
| Clips joined into one file | `execute queue.stitch {paths, preset}` (order as given; size and rate follow the first clip) |
| One more output on an existing item | `execute queue.addOutput {item, preset}`; with no preset or format it copies the item's last output |
| Encode at once | add `start: true` to any of the above, or use the `encode` tool |

A source added without a preset gets the `defaultPreset` preference (Match Source, High bitrate, unless the person changed it). Media from formcut, formvfx, formwav or formvis is added through `family` (see `form-family-bridge`).

## Shaping outputs

- `queue {action: setPreset, refs, preset}` applies a preset; the folder, file name and range are kept.
- `queue {action: setOutput, refs, path}` sets one file; `folder` moves several; `name` sets the name template (`{source}_{preset}`, tokens in `references/concepts.md`).
- `queue {action: setRange, refs, mode: custom, in, out}` encodes a part, in source seconds (`inout` and `workArea` take the same `in` and `out`, and keep Media Encoder's names for where the marks came from); `entire` resets.
- `execute queue.interpret {item, frameRate, pixelAspect, fieldOrder, alpha, rotation}` overrides how a source is read: a 23.976 clip flagged 29.97, interlaced footage flagged progressive, a phone clip with the wrong rotation, alpha to ignore.
- Settings changes go through `export_settings` (see `export-settings`).

## Running

- `queue {action: start}` starts or resumes; `pause`; `stop` stops everything; `stopCurrent {refs}` stops what is encoding and moves on.
- `queue {action: skip, refs, skip: true}` leaves outputs out of this run.
- `queue {action: resetStatus, refs}` returns done, failed or stopped outputs to ready, to encode again after a fix.
- `queue {action: reorder, item, to}` moves an item (1-based). `clearDone` removes finished items; `remove {refs}` removes outputs, or whole items when an item id is named.
- The `parallel` and `maxParallel` preferences decide how many outputs of one source encode at once.
- `execute queue.save {path}` writes the queue as `.fequeue`; `execute queue.open {path, append}` brings one back.

## Presets

- Find: `presets {action: list, query}` (by name, format or group) or `category` (Web Video, Social Media, Devices, Mezzanine, Broadcast, DVD, Image Sequence, Image, Animated GIF, Audio Only, Archive, Proxy, Form Family) or `kind: ingest`. `references/presets.md` lists all with frame size, rate and target bitrate.
- Read: `presets {action: get, preset}` returns the full settings.
- Make: `presets {action: create, name, fromOutput}` saves an output's settings (effects and publish included); `settings` instead saves an object. `group` files it under a group (`execute preset.newGroup {name}` first). The result is `{preset, name}` with a `user/...` id.
- Change: `update` (name, settings patch, group, comment), `duplicate`, `alias` (a second name for the same preset), `delete` (user presets only).
- Move: `export {preset, path}` writes a `.fepreset`; `import {path}` reads a `.fepreset`, a JSON settings file or a Media Encoder `.epr`. From an `.epr`, the format, frame size, frame rate, bitrates and sample rate are read; check the imported preset with `presets {action: get}` and fix anything the `.epr` carried that formencoder did not read.
- A system preset is never changed; duplicate it and change the copy.

## Choosing a preset

Choose by destination: a web platform's preset when the file is uploaded there, a Mezzanine preset (ProRes, DNxHR, CineForm) when an editor or colourist takes it next, a Broadcast preset to a broadcaster's spec, Archive for preservation, Proxy for offline editing, Match Source when the person only wants a smaller or more compatible copy. When two presets fit, say which you chose and why in one line.
