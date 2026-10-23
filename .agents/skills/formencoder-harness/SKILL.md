---
name: formencoder-harness
description: Drive formencoder, the media encoder of the form family, through its formencoder MCP server or the formencoder command line. Use whenever the person wants a file encoded, transcoded, converted, compressed, exported or delivered; a YouTube, Vimeo, TikTok, Instagram, broadcast, AS-11, DCP, ProRes, DNxHR, XDCAM, MXF, H.264, HEVC, AV1, WebM, GIF, WAV, MP3 or image sequence version; a batch queue, several outputs per source, a preset made or imported, a watch folder, a card ingest with checksums, proxies, a LUT, HDR to SDR conform, loudness normalised to EBU R128 or ATSC A/85, captions burnt in or written as a sidecar, an overlay or timecode burn-in, metadata, or files published to a folder, FTP, S3 or a webhook; when media from formcut, formvfx, formwav or formvis should be encoded; or when formencoder tools such as status, encode, export_settings, preview_frame or verify are available or fail. Not for editing formencoder's own source (use formencoder-skillset).
---

# formencoder harness

formencoder is a media encoder running on this computer, with the person watching its window. Its MCP server, named `formencoder`, exposes the whole application: every menu item, button and panel action is a command with an id, and the tools run those commands against the live queue. Each queue change appears in the window as it happens and is one step in the person's History, so they can see it and undo it.

The encoding itself is done by formencoder's Rust engine (`fe_core`), which plans each output and drives FFmpeg (an LGPL build pinned by formencoder). These tools are the hands. This skill is the knowledge of how an encoding operator uses them: which preset fits a destination, which setting lives where, and how to prove a file is right before saying it is.

## The model

- The **queue** holds **items**. An item is one source: a file, an image sequence, several clips stitched together, or a formcut sequence, formvfx composition, formwav session or formvis image.
- An item has one or more **outputs**. Each output is a file to make, with its own **export settings** (format, video, audio, multiplexer, range, crop, scaling, effects, captions, metadata, publish) and an output path. Outputs of one source encode in parallel.
- A **preset** is a named settings object: 93 system presets, 5 Ingest presets, and the person's own. Settings on an output are a copy; changing a preset later does not touch queued outputs.
- **Watch folders** turn files that land in a folder into queue items with the folder's outputs.
- Every action is a **command** (96 of them).
- Some deliverables go through a **separate tool** after FFmpeg: bmx for AS-10, AS-11 and P2, asdcplib and OpenJPEG for DCP, OpenH264, Kvazaar and LAME for software H.264, HEVC and MP3, whisper.cpp for speech to text, c2patool for Content Credentials. `execute tools.list` says which are installed. Commands that change the queue are undoable; `batch` makes several one step.

`references/concepts.md` has the details that save the most time: refs, the settings object and how patches merge, time, the result each kind of command returns, and how errors read.

## Start every job

1. `status`. The queue, what is encoding, FFmpeg and the hardware encoders found, watch folders, and the sensible next step.
2. `probe` each source (with `loudness: true` when audio level matters). Know the size, rate, scan, colour, HDR, audio layout and timecode before choosing settings.
3. Pick the preset that matches the destination (`presets {action: list, query}`), not the one that matches the source.

## The loop

1. **Plan** the outputs: one line per file to make, with its destination, preset and anything that differs from the preset.
2. **Queue**. The quick path is `encode {paths, preset, settings?}`: it queues, encodes, waits and verifies in one call. The careful path is `execute queue.addSource` (or `batch`), then `export_settings {output, settings}` per output.
3. **Look** before a long encode: `preview_frame` renders one frame through the output's exact settings, `contact_sheet` several. Overlays, crop, scaling, LUTs, SDR conform and burnt-in captions all show. Never describe a visual result you did not render and look at.
4. **Encode**: `queue {action: start}`, then `wait {outputs}`.
5. **Verify** every output with `verify`. A failed output carries an error and notes; `log {kind: error}` has FFmpeg's own words. Fix the settings and `queue {action: resetStatus, refs}` to encode again.
6. **Deliver**: say where each file is, what was checked, and anything that differs from the request.

## Routing

Load the sub-skill for the part of the job in front of you. For a delivery with several destinations or anything broad, start with the director.

| The job involves | Load |
| --- | --- |
| A whole delivery, a brief, several destinations, anything broad or unscoped | `sub-skills/harness-director/SUB-SKILL.md` |
| Connecting: the MCP server, the command line, permission prompts, the engine not running, FFmpeg missing | `sub-skills/session-and-connection/SUB-SKILL.md` |
| Adding sources, outputs, refs, ranges, stitching, image sequences, interpreting footage, the queue's order and status, presets and the Preset Browser | `sub-skills/queue-and-presets/SUB-SKILL.md` |
| The Export Settings of an output: format, codec, frame size, rate, bitrate, hardware or software encoding, crop, VR, colour, HDR, audio and channel routing, the multiplexer, AS-10, AS-11, P2 and DCP packages, output names | `sub-skills/export-settings/SUB-SKILL.md` |
| LUTs, SDR conform, image, name, text and timecode overlays, Fit Tuning, video limiter, loudness normalisation | `sub-skills/effects-and-loudness/SUB-SKILL.md` |
| Captions (burn in, sidecar, embed, convert, speech to text), metadata (retain, clear, templates, rules, XMP) and Content Credentials | `sub-skills/captions-and-metadata/SUB-SKILL.md` |
| Watch folders, card ingest with checksums, proxies, media analysis | `sub-skills/watch-folders-and-ingest/SUB-SKILL.md` |
| Media from formcut, formvfx, formwav or formvis, Live Link, receiving formcut exports, sending files back | `sub-skills/form-family-bridge/SUB-SKILL.md` |
| After the encode: copy to a folder, FTP, S3, a webhook, YouTube, Vimeo, Facebook, a plug-in, or import into a family app | `sub-skills/publish/SUB-SKILL.md` |
| Checking work: previews, contact sheets, verify, logs, loudness reports | `sub-skills/verification/SUB-SKILL.md` |
| The formencoder window: panels, workspaces, opening Export Settings for the person | `sub-skills/ui-automation/SUB-SKILL.md` |
| A known deliverable (YouTube upload, broadcast master, AS-11, DCP, social cutdowns, podcast audio, archive master, proxies...) | `sub-skills/recipes/SUB-SKILL.md` |

## Rules that hold everywhere

- **Verify before you claim.** The tools report what they did; only `verify` shows the file matches its settings, and only `preview_frame` shows what it looks like. Check both before saying an output is good.
- **Never guess an id.** Command ids come from `list_commands` or `references/commands.md`; preset ids from `presets` or `references/presets.md`; settings keys from `formats {format}` or `references/formats.md`. When a call fails, the error says what was wrong and often lists the valid values; read it, fix the parameter, retry.
- **Patch, do not replace.** A settings patch keeps everything it does not name. Send only the keys that change, as nested objects or dotted keys (`{"video.targetBitrate": 8}`).
- **One idea, one undo step.** Group the steps of one change in `batch`, so the person can undo it as a unit.
- **Absolute paths for files.** Sources, folders, LUTs, overlays, caption files and publish paths are absolute.
- **Encoding is asynchronous.** `queue {action: start}` returns at once. `wait` before reading results; `encode` waits for you.
- **Respect the person's queue and files.** Do not remove items you did not add, clear the queue, overwrite an existing file, turn on `deleteLocal` in a publish step or `moveSources` on a watch folder they did not ask for, without saying so first.
- **Secrets stay out of replies.** FTP passwords and S3 keys go into publish settings, never into the conversation or a preset you share.

## References

| File | What it holds |
| --- | --- |
| `references/concepts.md` | Refs, settings, patches, time, results, errors: read once per session |
| `references/tools.md` | The MCP tools with every parameter, the guide topics and the shell equivalents (generated) |
| `references/commands.md` | Every command id with its menu path, parameters and shortcut (generated) |
| `references/presets.md` | Every built-in preset with its format, frame, rate and target (generated) |
| `references/formats.md` | Every format with its settings keys, options and defaults (generated) |

The generated files come from the engine itself (`./formencoder agents sync`), so they match the formencoder that is running.
