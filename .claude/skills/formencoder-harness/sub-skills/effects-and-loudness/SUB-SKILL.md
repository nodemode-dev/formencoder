---
name: effects-and-loudness
description: formencoder's Effects tab on an output. Use when applying a LUT, conforming HDR to SDR, adding an image or logo overlay, a name, text or timecode burn-in, Fit Tuning to hit a duration, a video limiter for legal levels, or loudness normalisation to EBU R128, ATSC A/85, OP-59, ARIB, streaming or podcast targets, with a true peak limit, a limiter and a loudness report.
---

# effects-and-loudness

Effects live in the output's settings under `effects`, each with `enabled` and its own fields. Turn one on with a patch, then look:

```json
{"effects.lut.enabled": true, "effects.lut.path": "/abs/looks/film.cube", "effects.lut.intensity": 80}
```

Every visual effect shows in `preview_frame` and `contact_sheet`; use `view: source` for the untouched frame to compare. The order they are applied is fixed: SDR conform, LUT, video limiter, then overlays and burnt-in captions on top. A LUT on HDR material therefore sees the conformed SDR picture when both are on.

## Colour

- **LUT** `effects.lut {enabled, path, intensity 0..100}`: a `.cube` file. `execute lut.list` shows the LUTs installed in the data folder; `execute lut.install {path}` copies one there so presets can name it without an absolute path.
- **SDR conform** `effects.sdrConform {enabled, brightness, contrast, knee, peak}`: turns PQ or HLG HDR into SDR Rec. 709. `peak` is the source's mastering peak in nits (1000 for most HDR10), `knee` the percentage where highlights start rolling off. Check a bright frame and a dark one in `contact_sheet` with chosen `times`.
- **Video limiter** `effects.videoLimiter {enabled, min, max, compression}`: clamps luma between `min` and `max` (percent of the legal range; 0 and 100 are legal black and white, -7.5 and 120 the widest allowed) and keeps chroma legal, for broadcast. `compression` (0 to 30) rolls the top off softly below `max` instead of clipping hard.

## Overlays

Positions: `topLeft`, `topCenter`, `topRight`, `centerLeft`, `center`, `centerRight`, `bottomLeft`, `bottomCenter`, `bottomRight`, with `offsetX` and `offsetY` in pixels of the output frame.

- **Image overlay** `effects.imageOverlay {enabled, path, position, offsetX, offsetY, size %, absolute, opacity}`: a logo or bug. PNG with alpha keeps its transparency. By default `size` scales the image as if it were designed for a 1080-line frame, so a logo keeps its proportion on 720p and 4K outputs; `absolute: true` makes `size` a percentage of the image's own pixels.
- **Name overlay** `effects.nameOverlay {enabled, prefix, suffix, source: fileName|outputName, position, size, color, background}`: the clip name, for review copies.
- **Text overlay** `effects.textOverlay {enabled, text, position, size, color, background}`: a watermark such as "FOR REVIEW ONLY".
- **Timecode overlay** `effects.timecodeOverlay {enabled, source: media|generate, start, offsetFrames, frameRate, position, size, color, background}`: `media` reads the source's timecode; `generate` counts from `start`.

`background` is the opacity of the box behind text (0 none). Overlay text is drawn by formencoder itself, so it works with any FFmpeg build.

## Fit Tuning

`effects.timeTuner {enabled, targetDuration (s) or percent (-10 to 10), skipSlates (s)}` makes a programme shorter or longer by up to 10 percent without changing its speed perceptibly: it removes or repeats single frames at the points where the picture changes least, spread through the programme, and time-stretches the audio by the same factor without changing its pitch. `skipSlates` protects the opening seconds (slates, bars). Check with `contact_sheet` across the whole range and `verify` the duration after encoding.

## Loudness

`effects.loudness {enabled, standard, target, tolerance, truePeak, lra, mode, report, reportFolder, limiter {enabled, lookahead ms, release ms}}`.

| standard | target LUFS | true peak dBTP |
| --- | --- | --- |
| `ebu-r128` | -23 | -1 |
| `atsc-a85` | -24 | -2 |
| `op59` | -24 | -2 |
| `arib-tr-b32` | -24 | -1 |
| `streaming` | -14 | -1 |
| `podcast` | -16 | -1 |
| `itu-bs1770`, `custom` | `target` | `truePeak` |

- `mode: twopass` measures the programme first (the output shows `preparing`), then encodes with the correction; it is the accurate mode and the default.
- `report: true` writes an XML loudness report beside the file (or in `reportFolder`).
- The limiter catches peaks the gain change would push over `truePeak`; turn it on for dynamic material such as trailers.
- Measure the source first with `probe {path, loudness: true}`; after the encode, `verify {output}` measures the file and compares it with the target and tolerance. Report the measured figure, not the setting.
