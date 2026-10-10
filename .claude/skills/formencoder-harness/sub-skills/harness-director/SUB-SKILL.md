---
name: harness-director
description: Entry point for a whole formencoder delivery. Use for a brief such as deliver this film to YouTube, broadcast and archive, make social cutdowns, turn a folder of rushes into proxies, or any request that spans several sources, outputs or destinations; it turns the brief into an output plan, orders the work, keeps a ledger and decides when the delivery is done.
---

# harness-director

An encoding job goes wrong in one of three places: the wrong preset for the destination, a setting nobody looked at (a burnt-in caption off the frame, loudness not normalised, the wrong frame rate), or a file reported as done that was never checked. The order below closes all three.

## 1. Intake

Settle these before the first command. Ask in plain prose only for what the request leaves open and a wrong guess would waste a long encode; otherwise choose sensible values and say which.

- **Sources**: absolute paths, or a family app's project, composition, session or image. `probe` each one.
- **Destinations**: where each file is going (YouTube, a broadcaster's spec sheet, an editor, an archive, a website). The destination decides the preset; the source only decides what has to change to get there.
- **Specs the destination states**: frame size, frame rate, codec, bitrate ceiling, loudness target, caption format, file naming, maximum file size.
- **Where files go**: a folder, beside the sources, or a publish destination.

## 2. Output plan

Write one line per file before queueing anything:

```text
film.mov  -> system/youtube-2160p                          ~/Delivery/web
film.mov  -> system/h264-broadcast-ebu, loudness ebu-r128  ~/Delivery/broadcast
film.mov  -> system/prores-hq + timecode burn-in           ~/Delivery/review
film.mov  -> system/ffv1-archive                           ~/Delivery/archive
```

Several outputs of one source belong to one queue item (`queue.addSource {paths, outputs: [...]}`): the source is read once and the outputs encode in parallel.

## 3. Build order

1. Queue every source with its outputs, in one `batch` when there are several sources, so the person can undo the whole plan in one step.
2. Adjust each output that differs from its preset with `export_settings {output, settings}`.
3. `preview_frame` every output that has a visual change from its preset: an overlay, a LUT, SDR conform, a crop, a scale to another aspect, burnt-in captions. `contact_sheet` for ranges and Time Tuner.
4. `encode.estimate {output}` where a size limit matters.
5. `queue {action: start}`; while it runs, `status` reports progress. `wait {outputs}` before reading results.
6. `verify` every output. Fix and re-encode what fails.

## 4. Ledger

Keep a short ledger in replies on long jobs, so the person, and you after a long context, know where things stand:

```text
item  film.mov (ifcefb6001) 3840x2160 23.976 fps 92 min
done  web ofcf112002 verified, broadcast ofcf112003 verified -23.1 LUFS
next  review ofcf112004 encoding 61%
check archive after review
```

## 5. Done means

- Every output was verified with `verify` and the notes read; failures were fixed and encoded again, or reported with their error.
- Every visual change was looked at with `preview_frame` or `contact_sheet`, and what was seen matches the brief.
- Loudness, when the brief has a target, was measured on the file (`verify` reports it), not assumed from the setting.
- Publish results, when there are destinations, are read from `encode.report`.
- The reply lists each file with its path, what was checked and anything that differs from the brief.

## When to load the others

Load the specialist sub-skill for each part; the master routing table lists them. For a deliverable that matches a known pattern, start from `recipes`, then adjust.
