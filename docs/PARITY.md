# formencoder parity with Adobe Media Encoder

Graded at formencoder 0.2.0 on 10 October 2026 against Media Encoder 26.5 (26.5.2), over 84 Media Encoder capabilities. Full counts 1, Partial one half, None 0. HandBrake 1.11.2, Shutter Encoder 20.4 and Compressor 5.4 are graded on the same rows from their documentation. The measured page with every cell's evidence and source is `docs/parity/index.html`.

## Scores

| Tool | Points | Share | Full | Partial | None |
| --- | ---: | ---: | ---: | ---: | ---: |
| formencoder | 83 of 84 | 99% | 82 | 2 | 0 |
| HandBrake | 29.5 of 84 | 35% | 15 | 29 | 40 |
| Shutter Encoder | 52 of 84 | 62% | 37 | 30 | 17 |
| Compressor | 56 of 84 | 67% | 39 | 34 | 11 |

Media Encoder's own documentation backs every row; 33 rows also carry an independent report. On rows 53, 54, 67, 69, 83, 84 Media Encoder itself is narrower than the row (noted in the page).

## Where formencoder trails

| Row | Grade | Trace |
| --- | --- | --- |
| 48. Broadcast MXF OP1a: XDCAM HD, JPEG 2000, AS-10, AS-11, P2 | Partial | MXF OP1a with XDCAM HD 422, DNxHR, ProRes, JPEG 2000 and MPEG-2; AS-10 (HIGH_HD_2014 and the other bmx shims, eight mono PCM tracks), AS-11 OP1a with MPEG-2 HD422 and AS-11 D10 (IMX 50) with the core and segmentation frameworks, and P2 card folders with DVCPRO HD OP-Atom, all wrapped by BBC bmx v1.6 and read back by verify (wrap.rs). Missing: AVC-Intra, which the UK DPP HD AS-11 shim and most P2 HD cards use; no LGPL or BSD encoder makes it. |
| 54. Camera raw import (ARRIRAW, RED, Canon, Sony X-OCN, ProRes RAW) | Partial | CinemaDNG and DNG sequences decode in formencoder (FFmpeg's DNG reader, then a debayer, exposure and Rec. 709 transfer set per item); R3D, ARRIRAW, X-OCN, Canon RAW, ProRes RAW and BRAW are decoded by the camera maker's own tool through the rawDecoders preference, which formencoder runs before the encode. No vendor SDK can be shipped, so those formats need the maker's tool installed. |

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
| 17. Chained (nested) or network watch folders | Full | None | Partial | Partial |
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
| 29. Cropping with crop proportions | Full | Partial | Full | Full |
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
| 39. Hardware or software encoding (H.264, HEVC, ProRes) | Full | Full | Full | Full |
| 40. HDR output: Rec. 2020, PQ, HDR10 metadata | Full | Full | Full | Full |
| 41. VR (360) video export settings | Full | None | None | Full |
| **Audio and multiplexing** | | | | |
| 42. Audio codec, sample rate, channels, sample size and bitrate | Full | Full | Full | Full |
| 43. Match source audio sample rate and channel layout | Full | Full | Partial | Full |
| 44. Multichannel audio routing (channel configuration) | Full | Partial | Full | Full |
| 45. Multiplexer: container choice, or none for elementary streams | Full | Partial | Full | Partial |
| **Formats** | | | | |
| 46. H.264 and HEVC export | Full | Full | Full | Full |
| 47. Mezzanine codecs: ProRes, DNxHR/DNxHD, CineForm in QuickTime and MXF | Full | Partial | Full | Partial |
| 48. Broadcast MXF OP1a: XDCAM HD, JPEG 2000, AS-10, AS-11, P2 | Partial | None | Partial | Partial |
| 49. MPEG-2, including DVD and Blu-ray variants | Full | Partial | Full | Full |
| 50. Image sequences and stills: DPX, OpenEXR, PNG, TIFF, JPEG, Targa, BMP | Full | None | Full | Partial |
| 51. Animated GIF | Full | None | Full | Full |
| 52. Audio-only formats: AAC, AIFF, MP3, WAV | Full | None | Full | Full |
| 53. Digital cinema package (DCP) export | Full | None | None | None |
| 54. Camera raw import (ARRIRAW, RED, Canon, Sony X-OCN, ProRes RAW) | Partial | None | Partial | Partial |
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
| 64. Metadata export: embed, XMP sidecar, templates and preservation rules | Full | Partial | Partial | Partial |
| 65. Content Credentials (C2PA) | Full | None | None | None |
| 66. Media analysis sidecars (transcription, scenes) | Full | None | Full | None |
| **Publish** | | | | |
| 67. Publish to YouTube, Vimeo and social destinations | Full | None | Partial | Partial |
| 68. Publish to FTP | Full | None | Full | Partial |
| 69. Other upload destinations and delete local file after upload | Full | None | Partial | Partial |
| **Media browser, ingest and proxies** | | | | |
| 70. Media browser: browse drives, preview, filter by type, camera card structures | Full | None | Partial | None |
| 71. Ingest: copy camera media with checksum verification | Full | None | Partial | None |
| 72. Proxy creation for an editor | Full | Partial | Partial | Full |
| **App integration** | | | | |
| 73. Queue an export from the editor to the encoder and keep editing | Full | None | None | Full |
| 74. Queue motion-graphics compositions without rendering them first (Dynamic Link) | Full | None | None | Partial |
| 75. Encode editor projects without the editor open (import natively) | Full | None | None | None |
| **Monitoring, logs and preferences** | | | | |
| 76. Encoding panel: thumbnail, progress, time remaining, preview while encoding | Full | Partial | Full | Partial |
| 77. Encoding log and error log | Full | Full | Full | Partial |
| 78. Notifications and completion chime | Full | Partial | Full | Partial |
| 79. Preferences: output naming, GPU renderer, media cache, memory | Full | Partial | Partial | Partial |
| 80. Dockable panels and saved workspaces | Full | None | None | Partial |
| 81. Customizable keyboard shortcuts | Full | None | None | Full |
| **Automation and agents** | | | | |
| 82. Scripting API for queue, presets and watch folders | Full | Partial | None | Partial |
| 83. Command-line encoding | Full | Full | None | Full |
| 84. Plug-in API | Full | None | None | Partial |

## Beyond Media Encoder (not scored)

- 85. AI agent control (MCP server, agent terminal): formencoder Full (The formencoder MCP server (21 tools over Streamable HTTP and stdio), consent per client, the formencoder-harness skill, and an embedded terminal that starts Claude Code, Codex and Cursor already connected. Verified: MCP encode, preview and verify.)

## Method

formencoder's cells are traces through its own tree: the command in the fencoder crates under `native/` (paths as of 0.2.1, which changes no grade), the panel that exposes it and the FFmpeg graph it builds, with the encodes run while grading noted as Verified. They were graded by the people who built it, so treat them as claims to check; each cell names the file. Competitor cells rest on vendor documentation and independent reviews; None means not found in those sources, so their scores are lower bounds. Media Encoder's rows come from Adobe's help, What's new, release notes and known issues, corroborated by independent articles where they exist. Wikis, forums, AI summaries and sponsored pages were not used.
