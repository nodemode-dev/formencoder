# formencoder presets

Generated from the formencoder engine by `./formencoder agents sync`; do not edit by hand.

98 built-in presets. Use the id (`system/...`, `ingest/...`) with `encode {preset}`, `queue.addSource {preset}`, `queue.setPreset`, `queue.addOutput` or `watch.add`; `presets {action: get, preset}` shows the full settings. A settings patch on top of a preset keeps the rest of the preset.

## Contents

`Web Video` (8) `Social Media` (12) `Devices` (4) `Mezzanine` (16) `Broadcast` (16) `DVD` (4) `Cinema` (4) `Image Sequence` (7) `Image` (2) `Animated GIF` (2) `Audio Only` (10) `Archive` (1) `Proxy` (4) `Form Family` (3) `Ingest` (5)

## Web Video

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/match-source-high` | Match Source - High bitrate | H.264 | Match source | Match source | 20 Mb/s |
| `system/match-source-medium` | Match Source - Medium bitrate | H.264 | Match source | Match source | 10 Mb/s |
| `system/match-source-adaptive-high` | Match Source - Adaptive High Bitrate | H.264 | Match source | Match source | Quality |
| `system/hevc-match-source-high` | HEVC Match Source - High bitrate | HEVC (H.265) | Match source | Match source | 14 Mb/s |
| `system/hevc-4k-hdr10` | HEVC 4K HDR10 (Rec. 2100 PQ) | HEVC (H.265) | 3840x2160 | Match source | 40 Mb/s |
| `system/av1-match-source` | AV1 Match Source | AV1 | Match source | Match source | Quality |
| `system/webm-vp9-1080p` | WebM VP9 1080p | WebM | 1920x1080 | Match source | Quality |
| `system/webm-vp9-alpha` | WebM VP9 with Alpha | WebM | Match source | Match source | Quality |

## Social Media

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/youtube-1080p` | YouTube 1080p Full HD | H.264 | 1920x1080 | Match source | 16 Mb/s |
| `system/youtube-1440p` | YouTube 1440p 2K QHD | H.264 | 2560x1440 | Match source | 24 Mb/s |
| `system/youtube-2160p` | YouTube 2160p 4K UHD | H.264 | 3840x2160 | Match source | 45 Mb/s |
| `system/youtube-shorts` | YouTube Shorts 1080x1920 | H.264 | 1080x1920 | Match source | 16 Mb/s |
| `system/vimeo-1080p` | Vimeo 1080p Full HD | H.264 | 1920x1080 | Match source | 20 Mb/s |
| `system/vimeo-2160p` | Vimeo 2160p 4K UHD | H.264 | 3840x2160 | Match source | 50 Mb/s |
| `system/x-1080p` | X (Twitter) 1080p | H.264 | 1920x1080 | Match source | 8 Mb/s |
| `system/instagram-reels` | Instagram Reels and Stories 1080x1920 | H.264 | 1080x1920 | 30 | 10 Mb/s |
| `system/instagram-feed-square` | Instagram Feed 1080x1080 | H.264 | 1080x1080 | 30 | 8 Mb/s |
| `system/tiktok` | TikTok 1080x1920 | H.264 | 1080x1920 | Match source | 10 Mb/s |
| `system/facebook-1080p` | Facebook 1080p | H.264 | 1920x1080 | Match source | 10 Mb/s |
| `system/linkedin-1080p` | LinkedIn 1080p | H.264 | 1920x1080 | 30 | 8 Mb/s |

## Devices

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/apple-tv-4k` | Apple TV 4K (HEVC) | HEVC (H.265) | 3840x2160 | Match source | 25 Mb/s |
| `system/iphone-1080p` | Apple iPhone and iPad 1080p | H.264 | 1920x1080 | Match source | 10 Mb/s |
| `system/android-1080p` | Android Phone and Tablet 1080p | H.264 | 1920x1080 | Match source | 10 Mb/s |
| `system/android-720p` | Android Phone 720p | H.264 | 1280x720 | Match source | 5 Mb/s |

## Mezzanine

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/prores-proxy` | Apple ProRes 422 Proxy | Apple ProRes | Match source | Match source |  |
| `system/prores-lt` | Apple ProRes 422 LT | Apple ProRes | Match source | Match source |  |
| `system/prores-422` | Apple ProRes 422 | Apple ProRes | Match source | Match source |  |
| `system/prores-hq` | Apple ProRes 422 HQ | Apple ProRes | Match source | Match source |  |
| `system/prores-4444` | Apple ProRes 4444 | Apple ProRes | Match source | Match source |  |
| `system/prores-4444-alpha` | Apple ProRes 4444 with Alpha | Apple ProRes | Match source | Match source |  |
| `system/prores-4444xq` | Apple ProRes 4444 XQ | Apple ProRes | Match source | Match source |  |
| `system/dnxhr-lb` | DNxHR LB | QuickTime | Match source | Match source |  |
| `system/dnxhr-sq` | DNxHR SQ | QuickTime | Match source | Match source |  |
| `system/dnxhr-hq` | DNxHR HQ | QuickTime | Match source | Match source |  |
| `system/dnxhr-hqx` | DNxHR HQX 10-bit | QuickTime | Match source | Match source |  |
| `system/dnxhr-444` | DNxHR 444 10-bit | QuickTime | Match source | Match source |  |
| `system/cineform-high` | GoPro CineForm YUV 10-bit | GoPro CineForm | Match source | Match source |  |
| `system/cineform-alpha` | GoPro CineForm RGBA 12-bit with Alpha | GoPro CineForm | Match source | Match source |  |
| `system/animation-alpha` | QuickTime Animation with Alpha | QuickTime | Match source | Match source |  |
| `system/uncompressed-10bit` | Uncompressed 10-bit 4:2:2 (v210) | QuickTime | Match source | Match source |  |

## Broadcast

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/xdcam-hd422-1080i50` | XDCAM HD 422 1080i 25 (50 Mb/s) | MXF OP1a | 1920x1080 | 25 | 10 Mb/s |
| `system/xdcam-hd422-1080i5994` | XDCAM HD 422 1080i 29.97 (50 Mb/s) | MXF OP1a | 1920x1080 | 29.97 | 10 Mb/s |
| `system/xdcam-hd422-720p50` | XDCAM HD 422 720p 50 (50 Mb/s) | MXF OP1a | 1280x720 | 50 | 10 Mb/s |
| `system/dnxhr-hq-mxf` | DNxHR HQ MXF OP1a | DNxHR/DNxHD MXF OP1a | Match source | Match source |  |
| `system/dnxhd-145-mxf` | DNxHD 145 MXF OP1a 1080 | DNxHR/DNxHD MXF OP1a | 1920x1080 | Match source |  |
| `system/prores-hq-mxf` | Apple ProRes 422 HQ MXF OP1a | Apple ProRes MXF OP1a | Match source | Match source |  |
| `system/jpeg2000-mxf` | JPEG 2000 MXF OP1a | JPEG 2000 MXF OP1a | Match source | Match source | Quality |
| `system/mpeg2-1080i` | MPEG-2 1080i 29.97 Broadcast | MPEG-2 | 1920x1080 | 29.97 | 25 Mb/s |
| `system/h264-broadcast-ebu` | H.264 Broadcast, EBU R128 loudness | H.264 | 1920x1080 | Match source | 30 Mb/s |
| `system/h264-broadcast-atsc` | H.264 Broadcast, ATSC A/85 loudness | H.264 | 1920x1080 | Match source | 30 Mb/s |
| `system/as10-high-hd-1080i50` | AS-10 HIGH_HD_2014 1080i 25 | AS-10 MXF (MPEG-2 HD422) | 1920x1080 | 25 | 10 Mb/s |
| `system/as10-high-hd-1080i5994` | AS-10 HIGH_HD_2014 1080i 29.97 | AS-10 MXF (MPEG-2 HD422) | 1920x1080 | 29.97 | 10 Mb/s |
| `system/as11-mpeg2-1080i50` | AS-11 OP1a MPEG-2 HD422 1080i 25 | AS-11 OP1a MXF (MPEG-2 HD422) | 1920x1080 | 25 | 10 Mb/s |
| `system/as11-d10-imx50-625` | AS-11 D10 IMX 50 625 (UK DPP SD) | AS-11 D10 MXF (IMX 50, SD) | 720x576 | 25 |  |
| `system/p2-dvcprohd-1080i50` | P2 DVCPRO HD 1080i 25 | P2 card (DVCPRO HD OP-Atom) | 1440x1080 | 25 |  |
| `system/p2-dvcprohd-720p50` | P2 DVCPRO HD 720p 50 | P2 card (DVCPRO HD OP-Atom) | 960x720 | 50 |  |

## DVD

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/mpeg2-dvd-ntsc` | NTSC DV Widescreen DVD | MPEG-2-DVD | 720x480 | 29.97 | 6 Mb/s |
| `system/bluray-mpeg2-1080i` | Blu-ray MPEG-2 1080i 29.97 | MPEG2 Blu-ray | 1920x1080 | 29.97 | 25 Mb/s |
| `system/bluray-h264-1080p24` | Blu-ray H.264 1080p 23.976 | H.264 Blu-ray | 1920x1080 | 23.976 | 25 Mb/s |
| `system/mpeg2-dvd-pal` | PAL DV Widescreen DVD | MPEG-2-DVD | 720x576 | 25 | 6 Mb/s |

## Cinema

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/dcp-2k-flat-24` | DCP 2K Flat 24 (SMPTE) | DCP (Digital Cinema Package) | 1998x1080 | 24 |  |
| `system/dcp-2k-scope-24` | DCP 2K Scope 24 (SMPTE) | DCP (Digital Cinema Package) | 2048x858 | 24 |  |
| `system/dcp-2k-flat-24-interop` | DCP 2K Flat 24 (Interop) | DCP (Digital Cinema Package) | 1998x1080 | 24 |  |
| `system/dcp-4k-flat-24` | DCP 4K Flat 24 (SMPTE) | DCP (Digital Cinema Package) | 3996x2160 | 24 |  |

## Image Sequence

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/png-sequence` | PNG Sequence | PNG | Match source | Match source |  |
| `system/png-sequence-alpha` | PNG Sequence with Alpha | PNG | Match source | Match source |  |
| `system/tiff-sequence-16` | TIFF Sequence 16-bit | TIFF | Match source | Match source |  |
| `system/dpx-sequence-10` | DPX Sequence 10-bit | DPX | Match source | Match source |  |
| `system/exr-sequence-half` | OpenEXR Sequence (half float) | OpenEXR | Match source | Match source |  |
| `system/jpeg-sequence` | JPEG Sequence | JPEG | Match source | Match source | Quality |
| `system/targa-sequence` | Targa Sequence | Targa | Match source | Match source |  |

## Image

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/png-still` | PNG Still (first frame of the range) | PNG | Match source | Match source |  |
| `system/jpeg-still` | JPEG Still | JPEG | Match source | Match source | Quality |

## Animated GIF

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/gif-480` | Animated GIF 480 px | Animated GIF | 480xauto | 15 |  |
| `system/gif-720` | Animated GIF 720 px | Animated GIF | 720xauto | 20 |  |

## Audio Only

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/wav-48-24` | Waveform Audio 48 kHz 24-bit | Waveform Audio | Match source | Match source | 10 Mb/s |
| `system/wav-48-16` | Waveform Audio 48 kHz 16-bit | Waveform Audio | Match source | Match source | 10 Mb/s |
| `system/bwf-ebu` | Broadcast WAV, EBU R128 loudness | Broadcast WAV (BWF) | Match source | Match source | 10 Mb/s |
| `system/aiff-48-24` | AIFF 48 kHz 24-bit | AIFF | Match source | Match source | 10 Mb/s |
| `system/mp3-320` | MP3 320 kb/s | MP3 | Match source | Match source | 10 Mb/s |
| `system/mp3-podcast` | MP3 Podcast, -16 LUFS | MP3 | Match source | Match source | 10 Mb/s |
| `system/aac-256` | AAC Audio 256 kb/s | AAC Audio | Match source | Match source | 10 Mb/s |
| `system/aac-streaming` | AAC Streaming, -14 LUFS | AAC Audio | Match source | Match source | 10 Mb/s |
| `system/flac-48-24` | FLAC 48 kHz 24-bit | FLAC | Match source | Match source | 10 Mb/s |
| `system/ogg-opus` | Ogg Opus 160 kb/s | Ogg (Opus or Vorbis) | Match source | Match source | 10 Mb/s |

## Archive

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/ffv1-archive` | FFV1 Lossless Archive (Matroska) | Matroska (archival) | Match source | Match source |  |

## Proxy

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/proxy-prores` | ProRes Proxy, quarter size (proxy) | Apple ProRes | 960x540 | Match source |  |
| `system/proxy-h264-540` | H.264 Proxy 960x540 | H.264 | 960x540 | Match source | 3 Mb/s |
| `system/proxy-h264-720` | H.264 Proxy 1280x720 (formcut) | H.264 | 1280x720 | Match source | 5 Mb/s |
| `system/proxy-cineform` | CineForm Proxy 1280x720 | GoPro CineForm | 1280x720 | Match source |  |

## Form Family

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `system/family-formcut-mezzanine` | formcut mezzanine (ProRes 422 HQ) | Apple ProRes | Match source | Match source |  |
| `system/family-formwav-audio` | formwav session audio (WAV 48 kHz 24-bit) | Waveform Audio | Match source | Match source | 10 Mb/s |
| `system/family-formvis-stills` | formvis stills (PNG Sequence) | PNG | Match source | Match source |  |

## Ingest

| id | name | format | frame | rate | target |
| --- | --- | --- | --- | --- | --- |
| `ingest/copy` | Copy (verify size) | Ingest |  |  |  |
| `ingest/copy-md5` | Copy with MD5 verification | Ingest |  |  |  |
| `ingest/copy-bit` | Copy with bit-by-bit verification | Ingest |  |  |  |
| `ingest/copy-prores-proxy` | Copy and create ProRes proxies | Ingest |  |  |  |
| `ingest/copy-h264-proxy` | Copy and create H.264 proxies | Ingest |  |  |  |
