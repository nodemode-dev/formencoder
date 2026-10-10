# formencoder parity with Adobe Media Encoder

Graded at formencoder 0.1.0 on 10 October 2026 against Media Encoder 26.5 (26.5.2), over 84 Media Encoder capabilities. Full counts 1, Partial one half, None 0. HandBrake 1.11.2, Shutter Encoder 20.4 and Compressor 5.4 are graded on the same rows from their documentation. The measured page with every cell's evidence and source is `docs/parity/index.html`.

## Scores

| Tool | Points | Share | Full | Partial | None |
| --- | ---: | ---: | ---: | ---: | ---: |
| formencoder | 70.5 of 84 | 84% | 64 | 13 | 7 |
| HandBrake | 29.5 of 84 | 35% | 15 | 29 | 40 |
| Shutter Encoder | 52 of 84 | 62% | 37 | 30 | 17 |
| Compressor | 56 of 84 | 67% | 39 | 34 | 11 |

Media Encoder's own documentation backs every row; 33 rows also carry an independent report. On rows 53, 54, 67, 69, 83, 84 Media Encoder itself is narrower than the row (noted in the page).

## Where formencoder trails

| Row | Grade | Trace |
| --- | --- | --- |
| 17. Chained (nested) or network watch folders | Partial | Any folder the operating system mounts can be watched, network shares included, and one folder's Output can be another watch folder; there is no explicit chaining setting or network-aware settle logic beyond watchSettle. |
| 29. Cropping with crop proportions | Partial | crop {left, top, right, bottom} in pixels in Export Settings and settings; no crop proportion presets or drag handles on the preview. |
| 39. Hardware or software encoding (H.264, HEVC, ProRes) | Partial | video.hardware auto, on or off over VideoToolbox, NVENC, QSV, AMF, VA-API and Media Foundation H.264 and HEVC and VideoToolbox ProRes, each probed with a test encode and cached (encoders.rs). The shipped LGPL FFmpeg has no software H.264 or HEVC encoder, so 'off' needs an FFmpeg with libx264 or libx265 chosen in Preferences. |
| 41. VR (360) video export settings | None | No VR projection or spherical metadata settings. |
| 44. Multichannel audio routing (channel configuration) | Partial | channels tracks (each source track as its own track) and discrete (all channels in one track) keep multichannel audio; there is no channel-by-channel routing matrix. |
| 46. H.264 and HEVC export | Partial | H.264 and HEVC in MP4, MOV, MKV and TS at 8 and 10 bit. With the shipped LGPL FFmpeg they encode through VideoToolbox on every Mac, Media Foundation, NVENC or AMF on Windows, and NVENC or VA-API on Linux; a Linux machine without one of those GPUs needs an FFmpeg with libx264 or libx265 pointed to in Preferences, and the output says so. Verified: H.264 and HEVC with a system FFmpeg; the refusal with the LGPL build and no GPU. |
| 48. Broadcast MXF OP1a: XDCAM HD, JPEG 2000, AS-10, AS-11, P2 | Partial | MXF OP1a with XDCAM HD 422, DNxHR, ProRes, JPEG 2000 and MPEG-2; no AS-10, AS-11 or P2 shims. |
| 49. MPEG-2, including DVD and Blu-ray variants | Partial | MPEG-2 program and transport streams and MPEG-2 DVD (NTSC and PAL); no Blu-ray variant. |
| 52. Audio-only formats: AAC, AIFF, MP3, WAV | Partial | AAC, AIFF, WAV and Broadcast WAV, plus FLAC and Ogg Opus. MP3 needs an FFmpeg with LAME: the shipped LGPL build has none, and the MP3 presets say so when they run. |
| 53. Digital cinema package (DCP) export | None | No DCP export. |
| 54. Camera raw import (ARRIRAW, RED, Canon, Sony X-OCN, ProRes RAW) | None | No camera raw decoding: formencoder reads what its LGPL FFmpeg reads, which excludes ARRIRAW, R3D, Canon RAW, X-OCN and ProRes RAW. |
| 64. Metadata export: embed, XMP sidecar, templates and preservation rules | Partial | metadata retain, clear and custom fields, an XMP sidecar; no metadata templates or per-schema preservation rules. |
| 65. Content Credentials (C2PA) | None | No Content Credentials (C2PA). |
| 66. Media analysis sidecars (transcription, scenes) | Partial | analyze.media writes scene changes, black frames, silences and loudness to a .feanalysis.json; no speech transcription. |
| 67. Publish to YouTube, Vimeo and social destinations | None | No YouTube, Vimeo or social media publishing. |
| 73. Queue an export from the editor to the encoder and keep editing | Partial | formencoder pulls a formcut project and has formcut render it (family add) while the person keeps editing; formcut does not yet have a Send to formencoder command of its own. |
| 75. Encode editor projects without the editor open (import natively) | Partial | formcut, formwav and formvis projects are encoded through their running engines; formencoder does not open their project files without the app running. |
| 79. Preferences: output naming, GPU renderer, media cache, memory | Partial | Output folder and naming (incrementNames), hardware default, threads, FFmpeg folder, log folder; no media cache or memory settings. |
| 81. Customizable keyboard shortcuts | None | Shortcuts are fixed in the command table; there is no editor to change them. |
| 84. Plug-in API | None | No plug-in API. |

## Every row

| Row | formencoder | HandBrake | Shutter Encoder | Compressor |
| --- | --- | --- | --- | --- |
| **Queue and jobs** | | | | |
| 1. Add sources by button, menu, drag and drop, double-click | Full | Full | Full | Full |
| 2. Several outputs per source, each with its own format, preset and output path | Full | Partial | Partial | Full |
| 3. Change the output folder of several selected outputs at once | Full | None | Partial | Partial |
| 4. Start, pause and stop the queue; stop the current item only | Full | Partial | Partial | Full |
| 5. Start the queue automatically when idle | Full | None | Partial | None |
| 6. Parallel encoding of several outputs | Full | Full | Full | Full |
| 7. Status per output (Ready, Done, Stopped, Failed, Skip), failure summary, job count | Full | Partial | Partial | Full |
| 8. Duplicate, skip and reset status of queue items | Full | None | None | Partial |
| 9. Remove and reorder items; save and restore the queue | Full | Partial | Partial | Partial |
| 10. Stitch clips together into one output | Full | None | Full | None |
| 11. Missing-media detection before encoding | Full | None | None | Full |
| 12. Interpret footage: override frame rate, pixel aspect, field order, alpha | Full | Partial | Full | Partial |
| **Watch folders** | | | | |
| 13. Watch folders that encode dropped media automatically | Full | None | Full | Full |
| 14. Several outputs per watch folder | Full | None | Partial | Full |
| 15. Output subfolder and moving originals to a Source subfolder | Full | None | Partial | Partial |
| 16. Image sequences picked up from watch folders | Full | None | None | None |
| 17. Chained (nested) or network watch folders | Partial | None | Partial | Partial |
| **Presets** | | | | |
| 18. Preset browser with system preset groups and search | Full | Partial | Partial | Partial |
| 19. Read-only system presets and editable user presets (save a copy) | Full | Full | Partial | Full |
| 20. Preset groups and aliases | Full | Partial | None | Partial |
| 21. Import and export presets as files (.epr) | Full | Full | Full | Full |
| 22. Create a preset from export settings, including effects and publish settings | Full | Full | Full | Full |
| 23. Apply a preset by drag, double-click or Apply to queue | Full | Partial | Partial | Full |
| 24. Ingest presets: copy with verification, optionally transcode | Full | None | Partial | None |
| 25. Match Source presets and a Match Source button | Full | Partial | None | Full |
| **Export settings** | | | | |
| 26. Export settings opened from the queue item | Full | Partial | None | Full |
| 27. Source, Output and Compare preview | Full | Partial | Partial | Full |
| 28. Source range: entire, in to out, work area, custom | Full | Full | Full | Full |
| 29. Cropping with crop proportions | Partial | Partial | Full | Full |
| 30. Scaling modes (fit, fill, stretch, black borders, match source) and source rotation | Full | Partial | Full | Full |
| 31. Basic video settings: size, frame rate, field order, pixel aspect, match source | Full | Partial | Full | Full |
| 32. Render at maximum depth and maximum render quality | Full | Partial | Partial | Partial |
| 33. Time interpolation: frame sampling, frame blending, optical flow | Full | None | Full | Full |
| 34. Set start timecode and render alpha channel only | Full | None | Partial | Partial |
| 35. Estimated file size and maximum file size | Full | Partial | Full | None |
| 36. Summary, comments, output name, export video and export audio switches | Full | Partial | Partial | Full |
| **Video encoding** | | | | |
| 37. Bitrate encoding: CBR, VBR 1 pass, VBR 2 pass, target and maximum bitrate | Full | Partial | Full | Full |
| 38. Key frame distance, profile and level | Full | Full | Full | Partial |
| 39. Hardware or software encoding (H.264, HEVC, ProRes) | Partial | Full | Full | Full |
| 40. HDR output: Rec. 2020, PQ, HDR10 metadata | Full | Full | Full | Full |
| 41. VR (360) video export settings | None | None | None | Full |
| **Audio and multiplexing** | | | | |
| 42. Audio codec, sample rate, channels, sample size and bitrate | Full | Full | Full | Full |
| 43. Match source audio sample rate and channel layout | Full | Full | Partial | Full |
| 44. Multichannel audio routing (channel configuration) | Partial | Partial | Full | Full |
| 45. Multiplexer: container choice, or none for elementary streams | Full | Partial | Full | Partial |
| **Formats** | | | | |
| 46. H.264 and HEVC export | Partial | Full | Full | Full |
| 47. Mezzanine codecs: ProRes, DNxHR/DNxHD, CineForm in QuickTime and MXF | Full | Partial | Full | Partial |
| 48. Broadcast MXF OP1a: XDCAM HD, JPEG 2000, AS-10, AS-11, P2 | Partial | None | Partial | Partial |
| 49. MPEG-2, including DVD and Blu-ray variants | Partial | Partial | Full | Full |
| 50. Image sequences and stills: DPX, OpenEXR, PNG, TIFF, JPEG, Targa, BMP | Full | None | Full | Partial |
| 51. Animated GIF | Full | None | Full | Full |
| 52. Audio-only formats: AAC, AIFF, MP3, WAV | Partial | None | Full | Full |
| 53. Digital cinema package (DCP) export | None | None | None | None |
| 54. Camera raw import (ARRIRAW, RED, Canon, Sony X-OCN, ProRes RAW) | None | None | Partial | Partial |
| **Effects** | | | | |
| 55. LUT or look applied at export | Full | None | Full | Full |
| 56. HDR to SDR conform / tone mapping | Full | Full | Full | Partial |
| 57. Image overlay (watermark) with position, offset, size, opacity | Full | None | Full | Partial |
| 58. Name overlay (file name text) | Full | None | Full | Partial |
| 59. Timecode overlay (burn-in) from media or generated | Full | None | Full | Full |
| 60. Time Tuner: retime to a target duration within 10 percent | Full | None | Partial | Full |
| 61. Video limiter (broadcast-safe clip level and compression) | Full | None | Partial | Partial |
| 62. Loudness normalization to ATSC A/85, EBU R128, ITU BS.1770 with true-peak limiter and report | Full | None | Partial | Partial |
| **Captions and metadata** | | | | |
| 63. Captions: burn in, sidecar file, embed; SCC, SRT, TTML and other formats | Full | Partial | Full | Partial |
| 64. Metadata export: embed, XMP sidecar, templates and preservation rules | Partial | Partial | Partial | Partial |
| 65. Content Credentials (C2PA) | None | None | None | None |
| 66. Media analysis sidecars (transcription, scenes) | Partial | None | Full | None |
| **Publish** | | | | |
| 67. Publish to YouTube, Vimeo and social destinations | None | None | Partial | Partial |
| 68. Publish to FTP | Full | None | Full | Partial |
| 69. Other upload destinations and delete local file after upload | Full | None | Partial | Partial |
| **Media browser, ingest and proxies** | | | | |
| 70. Media browser: browse drives, preview, filter by type, camera card structures | Full | None | Partial | None |
| 71. Ingest: copy camera media with checksum verification | Full | None | Partial | None |
| 72. Proxy creation for an editor | Full | Partial | Partial | Full |
| **App integration** | | | | |
| 73. Queue an export from the editor to the encoder and keep editing | Partial | None | None | Full |
| 74. Queue motion-graphics compositions without rendering them first (Dynamic Link) | Full | None | None | Partial |
| 75. Encode editor projects without the editor open (import natively) | Partial | None | None | None |
| **Monitoring, logs and preferences** | | | | |
| 76. Encoding panel: thumbnail, progress, time remaining, preview while encoding | Full | Partial | Full | Partial |
| 77. Encoding log and error log | Full | Full | Full | Partial |
| 78. Notifications and completion chime | Full | Partial | Full | Partial |
| 79. Preferences: output naming, GPU renderer, media cache, memory | Partial | Partial | Partial | Partial |
| 80. Dockable panels and saved workspaces | Full | None | None | Partial |
| 81. Customizable keyboard shortcuts | None | None | None | Full |
| **Automation and agents** | | | | |
| 82. Scripting API for queue, presets and watch folders | Full | Partial | None | Partial |
| 83. Command-line encoding | Full | Full | None | Full |
| 84. Plug-in API | None | None | None | Partial |

## Beyond Media Encoder (not scored)

- 85. AI agent control (MCP server, agent terminal): formencoder Full (The formencoder MCP server (21 tools over Streamable HTTP and stdio), consent per client, the formencoder-harness skill, and an embedded terminal that starts Claude Code, Codex and Cursor already connected. Verified: MCP encode, preview and verify.)

## Method

formencoder's cells are traces through its own tree: the command in `native/fe-core`, the panel that exposes it and the FFmpeg graph it builds, with the encodes run while grading noted as Verified. They were graded by the people who built it, so treat them as claims to check; each cell names the file. Competitor cells rest on vendor documentation and independent reviews; None means not found in those sources, so their scores are lower bounds. Media Encoder's rows come from Adobe's help, What's new, release notes and known issues, corroborated by independent articles where they exist. Wikis, forums, AI summaries and sponsored pages were not used.
