---
name: verification
description: Proving a formencoder output is right. Use before reporting any encode as done, when an output failed, when a file looks wrong, when loudness, duration, frame rate or size must be confirmed, or when checking overlays, LUTs, crops, captions or Fit Tuning by eye with preview frames and contact sheets.
---

# verification

Three kinds of evidence, in the order they are cheap:

1. **Before encoding: look.** `preview_frame {output, time}` renders one frame through the exact settings; `contact_sheet {output, count | times}` renders several in one labelled grid. Both are queries, so they never change the queue. `view: source` shows the untouched frame for comparison. For a file not in the queue, pass `path` with `preset` or `settings`. To test a change before applying it, `preview_frame {output, patch}` renders the output as if the patch were applied.
2. **After encoding: measure.** `verify {output}` probes the file and compares frame size, frame rate, duration, video and audio codecs, sample rate and, when loudness was normalised, the measured loudness against the target. `verify {path, loudness: true}` checks any file.
3. **When it failed: read.** The output's `error` and `notes` (from `wait`, `encode`, or `execute encode.report`), then `log {kind: error}` for FFmpeg's last lines. `execute encode.command {output}` shows the FFmpeg command the output runs.

## What to look at

| Change | Check |
| --- | --- |
| Scale to another aspect, crop, rotation | `preview_frame` at 0 and mid-range; `view: source` beside it |
| LUT, SDR conform, limiter | `contact_sheet` with `times` at the brightest and darkest moments |
| Overlays, timecode burn-in | `preview_frame` at the start and the end (timecode must count) |
| Burnt-in captions | `preview_frame` at a cue's time (`execute captions.read {path}` gives the times) |
| Range, Fit Tuning | `contact_sheet` across the range; after encoding, `verify` the duration |
| Loudness | `probe {path, loudness: true}` on the source, then `verify` on the output |
| HDR10 | `probe` the output: `hdr` should read `pq` with the transfer and primaries of Rec. 2100 |
| Image sequence | the first and last frame numbers on disk, and the count against the duration times the rate |

Preview images come back to you as images. Describe what you saw, specifically: "the logo sits 40 px in from the bottom right, fully inside the frame", not "looks good".

## Reading `verify`

The result is `{path, probe, checks, passed}`: each check is `{check, want, got, ok}` (frame size, frame rate, duration, video codec, audio, sample rate, integrated loudness), and `passed` is true when all are. Duration is compared with a tolerance of about a frame, because some codecs and containers round it. A mismatch in size, rate or codec means the settings or the encoder did not do what was asked: read the notes, fix, encode again.

## Common failures

| Symptom | Usual cause | Fix |
| --- | --- | --- |
| `failed` at once with an encoder error | a hardware encoder the machine lists but cannot open | `video.hardware: off`, encode again |
| `no H.264 (AVC) encoder works in this ffmpeg on this computer` or `no MP3 encoder` | the LGPL FFmpeg and no hardware encoder (see `session-and-connection`) | another codec, or an FFmpeg with the encoder in `ffmpegDir` |
| `vbr2` refused | two-pass needs a software encoder | `video.hardware: off` or `rateControl: vbr1` |
| Odd frame size error | 4:2:0 codecs need even width and height | patch an even size |
| No audio in the output | `exportAudio` off, or the source has none (`probe`) | turn it on, or say the source is silent |
| Captions missing | no caption file beside the source and no caption stream; the notes say so | give `captions.source` a path |
| Output skipped | a missing source, LUT or overlay with `skipMissing` on | fix the path |
| Loudness off target | `mode` other than `twopass`, or a very short programme | `twopass`, and report the measured value |

## Done means

Every output reported to the person has a passing `verify`, or its failure explained; every visual change was seen in a preview; loudness figures quoted are measured ones.
