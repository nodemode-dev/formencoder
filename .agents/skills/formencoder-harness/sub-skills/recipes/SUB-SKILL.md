---
name: recipes
description: Known formencoder deliverables as ready call sequences. Use when the job matches a common pattern such as a YouTube or Vimeo upload, a set of social cutdowns, a broadcast master to a loudness spec, a review copy with burn-ins, a mezzanine for an editor or colourist, an archive master, a podcast or music master, an image sequence or GIF, HDR to SDR versions, proxies, or a hot folder for a team.
---

# recipes

Each recipe is a starting point: adjust to the brief, then look and verify as `verification` describes. Paths are placeholders; use the person's absolute paths.

## YouTube upload

```json
{"tool": "encode", "paths": ["/abs/film.mov"], "preset": "system/youtube-2160p", "folder": "/abs/Delivery"}
```

Pick `youtube-1080p`, `youtube-1440p` or `youtube-2160p` by the source's size; never upscale a 1080 source to 2160. Captions as an SRT sidecar (`{"captions.mode": "sidecar", "captions.format": "srt"}`) for upload beside the video. YouTube normalises playback itself; leave loudness off unless asked.

## Social cutdowns from one master

One item, several outputs, encoded in parallel:

```json
{"command": "queue.addSource", "params": {"paths": ["/abs/promo.mov"], "outputs": [
  {"preset": "system/youtube-1080p"},
  {"preset": "system/instagram-reels", "settings": {"scaling": "fill", "captions.mode": "burnin"}},
  {"preset": "system/instagram-feed-square", "settings": {"scaling": "fill"}},
  {"preset": "system/tiktok", "settings": {"scaling": "fill", "captions.mode": "burnin"}}
]}}
```

The vertical and square presets keep the default `scaling: fit`, which letterboxes a 16:9 master inside a tall frame; `fill` reframes it with a centre crop instead. Ask which the person wants when the brief does not say. `contact_sheet` each vertical output: a centre crop can cut off people or titles at the frame edges; if it does, tell the person rather than shipping it.

## Broadcast master

`system/h264-broadcast-ebu` (Europe) or `system/h264-broadcast-atsc` (US), or an XDCAM HD422 MXF preset when the spec says so. Then:

```json
{"effects.loudness.enabled": true, "effects.loudness.standard": "ebu-r128", "effects.loudness.limiter.enabled": true, "effects.videoLimiter.enabled": true, "startTimecode": "10:00:00:00"}
```

Check the spec sheet line by line against `export_settings` `summary`; `verify` reports the measured loudness. The XML loudness report sits beside the file for the broadcaster.

## Review copy with burn-ins

`system/match-source-medium` plus:

```json
{"effects.timecodeOverlay.enabled": true, "effects.nameOverlay.enabled": true, "effects.textOverlay.enabled": true, "effects.textOverlay.text": "FOR REVIEW ONLY", "effects.textOverlay.position": "center", "effects.textOverlay.opacity": 35}
```

`preview_frame` at the start and the end: the timecode must count and nothing may cover the picture's action area more than asked.

## Mezzanine for an editor or colourist

`system/prores-422` or `system/prores-hq` (Mac-heavy teams), `system/dnxhr-hq` or `system/dnxhr-hq-mxf` (Avid), `system/cineform-high` (cross-platform with alpha via `cineform-alpha`). Keep the source's size and rate (`video.matchSource: true`), `metadata.mode: retain`, and `startTimecode` from the source. For formcut, `system/family-formcut-mezzanine`.

## Archive master

`system/ffv1-archive` (lossless FFV1 in MKV, with checksums per frame slice). `verify`, then `probe` to confirm the codec is `ffv1`. Keep audio as PCM or FLAC; never archive to a lossy codec.

## Podcast or music master

`system/mp3-podcast` (needs an FFmpeg with LAME; the bundled LGPL build has none, so check `formats {format: mp3}` first) or `system/aac-256` with `{"effects.loudness.enabled": true, "effects.loudness.standard": "podcast"}` (-16 LUFS); music for streaming `standard: streaming` (-14 LUFS); a WAV master `system/wav-48-24` with loudness off unless asked. From a formwav session: `family {action: add, app: formwav, id, preset}`.

## Image sequence and GIF

- Frames for compositing: `system/exr-sequence-half`, `system/dpx-sequence-10`, `system/png-sequence-alpha`, `system/tiff-sequence-16`. The output folder fills with numbered frames; check the count.
- A still: `system/png-still` or `system/jpeg-still` with `queue.setRange {mode: custom, in: T, out: T}` for the frame at T.
- A GIF: `system/gif-480` or `system/gif-720`; keep it short (set a range), and check the file size with `encode.estimate` first.

## HDR to SDR versions

From PQ or HLG HDR, one output keeps HDR (`system/hevc-4k-hdr10`) and another conforms: any SDR preset plus `{"effects.sdrConform.enabled": true}`. `contact_sheet` the SDR output at bright and dark moments with `view: source` for comparison; adjust `knee` and `peak`.

## Proxies for an edit

`execute proxy.create {paths, preset: "system/proxy-h264-720", start: true}`; or straight from a card, `execute ingest.copy {paths: ["/Volumes/CARD"], destination: "/abs/Footage/Day1", verify: "md5", preset: "ingest/copy-h264-proxy", start: true}`.

## Hot folder for a team

```json
{"tool": "watch_folder", "action": "add", "folder": "/abs/Share/ToEncode", "outputs": [{"preset": "system/youtube-1080p"}, {"preset": "system/prores-proxy"}]}
```

Auto-Encode stays on; outputs land in `ToEncode/Output`, originals move to `ToEncode/Source/[date-time]`. Drop one short file in, `wait`, and `verify` its outputs before telling the team it is ready.
