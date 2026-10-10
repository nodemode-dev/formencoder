---
name: watch-folders-and-ingest
description: Unattended and camera-card work in formencoder. Use when setting up a watch folder (hot folder) that encodes whatever lands in it, changing its outputs, scanning it, or turning Auto-Encode on or off; when copying camera cards or media with size, MD5 or bit-for-bit verification and optional transcodes; when making proxies for offline editing; or when analysing media for scene changes, black frames, silences and loudness.
---

# watch-folders-and-ingest

## Watch folders

- `watch_folder {action: add, folder, preset}` (or `outputs: [{preset, settings, folder}]` for several files per drop). The result carries the `watch` id and its `outputs`.
- What happens to a dropped file: it must stay unchanged for `watchSettle` seconds (default 4), then it is queued with the folder's outputs. With Auto-Encode Watch Folders on (the default; `watch_folder {action: autoEncode, enabled}`), it encodes at once.
- Outputs go to an `Output` subfolder of the watch folder unless an output names a folder. With `moveSources` (default true) the original moves to `Source/[date-time]` after queueing, so a file is never picked up twice. Turn it off only when the person keeps sources in place, and say so.
- Numbered images that land together become one image sequence (`watchSequences`), waiting `watchSequenceWait` seconds for more frames; `frameRate` on `watch.add` sets its rate.
- `kind: analysis` makes a watch folder that writes `.feanalysis.json` reports instead of encoding.
- Change it: `addOutput {watch, preset}`, `setOutput {output, preset|settings|folder}`, `removeOutput {output}`, `setActive {watch, active}`, `remove {watch}`.
- `scan` queues what is in active watch folders now, without waiting for files to settle; use it after setting a folder up on files already there.
- Watch folders persist with the person's data; they keep working while formencoder runs, with no agent attached. Test one by copying a short file in and `wait`ing for its output.

## Ingest

`execute ingest.copy {paths, destination, verify, preset?, transcodeFolder?, start?}` copies files or whole card folders (the folder structure is kept).

| verify | Check after copying |
| --- | --- |
| `size` | byte counts match (fast) |
| `md5` | an MD5 of the source (taken while reading) and of the copy (read back from disk) match; the default |
| `bit` | a full byte-for-byte comparison (slowest, strongest) |

- With `preset`, each copied clip is also queued for transcode: an Ingest preset (`ingest/copy-prores-proxy`, `ingest/copy-h264-proxy`) or any encoding preset, into `transcodeFolder`.
- The Ingest presets alone (`ingest/copy`, `ingest/copy-md5`, `ingest/copy-bit`) set the verification without a transcode.
- Each path is an item in the queue (a card folder is one item, copied with its folder structure under `destination`); a mismatch fails that item with the file and the reason. `encode.report` lists the files copied, the byte count and the verification used. Report the verification result per item, not only "copied".

## Proxies

`execute proxy.create {paths, preset?, folder?, start?}` queues proxies into a `Proxies` folder beside each source, named `[source]_Proxy`. Presets: `system/proxy-h264-720` (default, the size formcut expects), `system/proxy-h264-540`, `system/proxy-prores` (ProRes Proxy at 960 x 540), `system/proxy-cineform`. Check one proxy's timecode and audio layout against its source with `probe` before telling an editor they will relink.

## Analysis

`execute analyze.media {paths, start?}` queues an analysis of each file and writes `[source].feanalysis.json` with scene changes, black frames, silences and loudness. Read the JSON after `wait` to answer questions such as where the black at the end begins or whether a programme has silent gaps.
