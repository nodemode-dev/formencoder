---
name: captions-and-metadata
description: Captions and metadata on formencoder outputs. Use when captions or subtitles should be burnt in, written as an SRT, WebVTT, SCC or TTML sidecar, or embedded in the file; when a caption file needs reading or converting; or when metadata should be kept, cleared or set (title, artist, copyright, description, keywords) or written as an XMP sidecar.
---

# captions-and-metadata

## Captions

`captions {mode, source, format, language, size, color, background, position}` on the output's settings.

| mode | Result |
| --- | --- |
| `none` | no captions (default) |
| `burnin` | drawn into the picture: always visible, cannot be turned off by the viewer |
| `sidecar` | a separate file beside the output in `format`: `srt`, `vtt`, `scc` or `ttml` |
| `embed` | a caption track inside the file: `mov_text` in MP4 and MOV, SRT in MKV, WebVTT in WebM; other containers get a sidecar instead |

- `source: auto` takes a `.srt`, `.vtt`, `.scc` or `.ttml` with the source's name beside it, then an embedded caption stream in the source. Give a path to use another file.
- Times follow the output's range: a part encoded from 60 s carries the cues from 60 s, shifted to start at zero. Time Tuner shifts them with the picture.
- Burn-in styling: `size` (pixels on a 1080-line frame), `color`, `background` (box opacity 0 to 100), `position: bottom|top`. Look at it with `preview_frame` at a time a cue is on screen (`execute captions.read {path}` lists the cues with their times), and with `contact_sheet` across several cues.
- `language` is a three-letter code (`eng`, `fra`, `deu`) written on embedded tracks.
- On files: `execute captions.read {path}` returns the cues; `execute captions.convert {path, to, output?}` converts between SRT, WebVTT, SCC and TTML without encoding anything.

Platforms differ: YouTube and Vimeo take an SRT or VTT sidecar uploaded beside the video; social presets usually want captions burnt in because the feed plays muted; broadcast specs name SCC or an embedded track.

## Metadata

`metadata {mode, fields, xmpSidecar}` on the output's settings.

- `retain` (default) and `custom` copy the source's tags and then write `fields` over them; `clear` drops every source tag and writes only `fields` (use it for client deliveries where source tags leak camera or project names). Stitched sources start without source tags.
- `fields`: `title`, `artist`, `author`, `comment`, `description`, `copyright`, `keywords`, `album`, `genre`, `date`. formencoder also writes `encoder=formencoder`.
- `xmpSidecar: true` writes an `.xmp` beside the file with the same fields, for asset managers that read XMP.
- Check written tags with `probe {path}` (they appear under `tags`).
