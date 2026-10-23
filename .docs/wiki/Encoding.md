# Encoding

## The queue

A queue item is one source: a file, an image sequence, stitched clips, or a sequence, composition, session or image from a family app. Each item has one or more outputs, and the outputs of one source encode in parallel (Preferences, General). Status per output: Ready, Preparing, Encoding, Paused, Done, Failed, Stopped, Skipped. Duplicate, skip, reset status, reorder, stop the current item, save and open the queue (`.fequeue`), and start automatically after an idle time.

Interpret Footage overrides a source's frame rate, pixel aspect, field order, alpha and rotation, and develops camera raw: CinemaDNG and DNG sequences are debayered and given an exposure and the Rec. 709 transfer (`rawExposure`, `rawTransfer`). R3D, ARRIRAW, X-OCN, Canon RAW and BRAW go through the camera maker's own decoder, which formencoder runs from the `rawDecoders` preference (Preferences, Delivery Tools). Missing sources, LUTs and overlay files are caught before an output starts.

## Export Settings

Format and preset at the top; Source, Output and Compare views over a frame scrubber; the source range (entire, in to out, work area, custom), crop in pixels or to a proportion (1:1, 4:3, 16:9, 9:16, 4:5, 1.85, 2.39) with a crop box to drag on the Source view, rotation and scaling (fit, fit with black borders, fill, stretch, match width). Below, every field of the format, generated from the engine's field specs: frame size and rate, field order, pixel aspect, profile, level, bit depth, chroma, rate control (CBR, VBR one and two pass, constant quality), target and maximum bitrate, key frame distance, hardware or software encoding, colour space and HDR10 metadata, VR (monoscopic or stereoscopic, 360 or 180 degrees, written as spherical metadata), alpha, image sequence numbering; audio codec, sample rate, channels (each source track as its own track, discrete channels, or a routing matrix that builds any number of output tracks from any source channel with a gain), bitrate and bit depth; the multiplexer and fast start, and for packaged formats their package fields (AS-10 shim, AS-11 titles and shim, P2 clip name, DCP title, standard, container and kind). Maximum render quality, maximum depth, time interpolation (sampling, blending, optical flow), start timecode, alpha only, maximum file size, the estimated size and comments.

Without a GPU encoder, or with `hardware: off`, H.264 encodes through Cisco's OpenH264 (downloaded from Cisco in Preferences, Delivery Tools), HEVC through Kvazaar and MP3 through LAME, each a separate program, at 8-bit 4:2:0.

## Packaged deliverables

AS-10, AS-11 OP1a, AS-11 D10 (IMX 50) and P2 card folders are encoded by FFmpeg and wrapped by BBC bmx; a DCP (SMPTE or Interop, 2K or 4K) gets X'Y'Z' cinema-profile JPEG 2000 from OpenJPEG, MXF track files from asdcplib, and its CPL, PKL and ASSETMAP from formencoder. `./formencoder install-tools` builds the tools from pinned sources, and the desktop app ships them. Verify reads each package back. AVC-Intra is not available, so the UK DPP HD AS-11 shim and AVC-Intra P2 cards are not.

## Effects

LUT (eight formencoder looks bundled, any `.cube`), HDR to SDR conform with a knee, image overlay, name overlay, text overlay, timecode overlay from the media or generated, Fit Tuning within plus or minus 10 percent, video limiter, and loudness normalisation to EBU R128, ATSC A/85, OP-59, ARIB TR-B32, streaming, podcast or a custom target, two pass, with a true-peak limiter and an XML report. Text is drawn by formencoder itself, so every overlay works with the LGPL FFmpeg.

## Captions and metadata

Burn in, write a sidecar (SRT, WebVTT, SCC, TTML) or embed a caption track; captions are found beside the source or in it, and follow the range and Fit Tuning. Speech to Text (`captions.transcribe`) writes a transcript beside the source with whisper.cpp and a downloaded model, which Captions then finds. Metadata is retained, cleared or set, through saved templates and rules that drop categories of source metadata, with an XMP sidecar on request. Content Credentials (C2PA) sign a manifest into MP4, MOV, image and audio outputs with your certificate, or c2patool's test certificate.

## Watch folders, ingest, proxies

A watch folder queues whatever lands in it with its outputs and encodes it (Auto-Encode Watch Folders); outputs go to an Output subfolder and originals move to Source. One watch folder's outputs can feed another (Chain Outputs Into), and a folder on a share that goes away shows as offline until it is back. Ingest copies files or camera cards with size, MD5 or bit-for-bit verification and can transcode at the same time. Proxies go to a Proxies folder beside each source. Analysis writes scene changes, black frames, silences and loudness to a sidecar.

## Publish

After an encode an output can be copied to a folder, uploaded over FTP or FTPS or to S3-compatible storage, announced to a webhook signed with HMAC-SHA256, uploaded to YouTube, Vimeo or a Facebook Page with resumable uploads, handed to a plug-in, or imported into formcut or formvfx.

## Plug-ins and shortcuts

A plug-in is a folder with a `plugin.json` and any program, spoken to over JSON on standard input and output; it can run after an output, as a command, or as a publish destination (`docs/PLUGINS.md`). Edit > Keyboard Shortcuts changes any menu command's shortcut.

## Presets

93 system encoding presets in Web Video, Social Media, Devices, Mezzanine, Broadcast, Cinema, DVD, Image Sequence, Image, Animated GIF, Audio Only, Archive, Proxy and Form Family, and 5 Ingest presets. System presets are read-only (Save a Copy); user presets are `.fepreset` files with groups and aliases. Media Encoder `.epr` presets import with their format, frame size, rate, bitrates and sample rate.
