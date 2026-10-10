---
name: export-settings
description: An output's Export Settings in formencoder. Use when changing format, codec, frame size, frame rate, field order, pixel aspect, profile, level, bit depth, chroma, bitrate or rate control, hardware encoding, colour space, HDR10, alpha, image sequence numbering, audio codec, sample rate, channels, the container and fast start, crop, rotation, scaling, time interpolation, start timecode, maximum file size or the output name; or when a destination's spec sheet has to be matched.
---

# export-settings

## Read, then patch

1. `export_settings {output}` returns the settings, the one-line `summary` the queue shows, the file and `sourceInfo` (the probe).
2. `formats {format}` (or `formats {output}`) lists every field of that format: key, label, type, options, unit, range and `showIf`, plus the encoders this machine has. `references/formats.md` is the same list, generated.
3. `export_settings {output, settings: {patch}}` changes only the keys named. Check the returned `summary` reads as intended.

Several outputs at once: `execute queue.setSettings {refs, settings}` with the same patch.

## Format and codec

- `format` picks the wrapper and codec family (`h264`, `hevc`, `av1`, `webm`, `quicktime`, `prores`, `prores_mxf`, `dnxhr_mxf`, `mxf_op1a`, `cineform`, `mpeg2`, `gif`, `png`, `wav`...). Switching format resets video, audio and multiplexer to that format's defaults and keeps everything else; patch codec settings after it.
- `video.codec` chooses within a format (QuickTime holds ProRes, DNxHR, CineForm, Animation, uncompressed, H.264).
- `video.profile`, `video.level`, `video.bitDepth` (8, 10, 12) and `video.chroma` (420, 422, 444) follow the codec; the fields offered are the valid ones.

## Frame

- `video.matchSource: true` takes width, height and rate from the source. Otherwise `video.width`, `video.height` (one of them `null` keeps the aspect) and `video.frameRate` (`null` keeps the source rate).
- `scaling` decides what happens when the aspect differs: `fit` (scale to fit with black bars), `fitBlack` (the same but never scaled up: a smaller source sits in black borders), `fill` (crop to fill), `stretch`, `matchWidth`. Look at the result with `preview_frame`.
- `crop {left, top, right, bottom}` in source pixels, applied before scaling. `rotation` 0, 90, 180, 270.
- `video.fieldOrder`: `progressive`, `tff`, `bff`, `source`. Broadcast 1080i presets are `tff`.
- `timeInterpolation` for rate changes: `sampling` (drop or repeat frames), `blending`, `opticalFlow` (slowest, smoothest).
- `maxRenderQuality` and `maxDepth` trade speed for scaling and colour precision.

## Rate

- `video.rateControl`: `vbr1` (one pass), `vbr2` (two pass, software encoders only), `cbr`, `quality` (constant quality, `video.quality` 0 to 100).
- `video.targetBitrate` and `video.maxBitrate` are Mb/s. `video.keyframeDistance` is in frames.
- `maxFileSize` (MB) caps the bitrate so the file fits; `encode.estimate {output}` predicts the size.
- `video.hardware`: `auto` uses a working hardware H.264 or HEVC encoder (VideoToolbox, NVENC, QSV, AMF, VAAPI), `on` requires one, `off` uses software. `status` and `formats {format}` show what works here. Hardware is fastest; software at `vbr2` gives the smallest file at a given quality.

## Colour and HDR

- `video.colorSpace`: `source`, `rec709`, `rec601`, `rec2020`, `rec2100pq`, `rec2100hlg`, `p3d65`. It tags and converts; it does not grade.
- HDR10 out needs HEVC or AV1 at 10 bit with `rec2100pq`, plus `video.hdr10: true` with `video.maxCLL` and `video.maxFALL` in nits (the `system/hevc-4k-hdr10` preset has them).
- HDR in, SDR out: turn on the SDR conform effect (see `effects-and-loudness`), not only the colour space.
- Alpha: `video.alpha: true` in formats that carry it (ProRes 4444, CineForm, Animation, PNG, WebM VP9, TIFF, EXR); `alphaOnly` writes the matte.

## Audio

- `exportAudio` and `exportVideo` turn a stream off entirely (audio-only or silent files).
- `audio.codec`, `audio.sampleRate`, `audio.channels` (`mono`, `stereo`, `5.1`, `7.1`, `source`, `discrete`), `audio.bitrate` (kb/s, lossy codecs), `audio.bitDepth` and `audio.float` (PCM).
- Loudness is an effect, not an audio field (see `effects-and-loudness`).

## Container and naming

- `multiplexer.container` (`mp4`, `mov`, `mkv`, `mxf`...) where a format offers more than one; `multiplexer.fastStart` moves the index to the front for web playback.
- `startTimecode` writes a timecode track start (`01:00:00:00`).
- Image sequences: `video.sequence: true` and `video.startNumber`; the output name gets a frame number pattern.
- `outputName` takes the tokens in `references/concepts.md`.

## Matching a spec sheet

Turn each line of the spec into a key, patch them in one call, then read the `summary` back against the sheet line by line. After the encode, `verify` checks size, rate, duration, codecs, sample rate and loudness on the file itself.
