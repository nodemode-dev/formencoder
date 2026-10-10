# Encoding

## The queue

A queue item is one source: a file, an image sequence, stitched clips, or a sequence, composition, session or image from a family app. Each item has one or more outputs, and the outputs of one source encode in parallel (Preferences, General). Status per output: Ready, Preparing, Encoding, Paused, Done, Failed, Stopped, Skipped. Duplicate, skip, reset status, reorder, stop the current item, save and open the queue (`.fequeue`), and start automatically after an idle time.

Interpret Footage overrides a source's frame rate, pixel aspect, field order, alpha and rotation. Missing sources, LUTs and overlay files are caught before an output starts.

## Export Settings

Format and preset at the top; Source, Output and Compare views over a frame scrubber; the source range (entire, in to out, work area, custom), crop, rotation and scaling (fit, fit with black borders, fill, stretch, match width). Below, every field of the format, generated from the engine's field specs: frame size and rate, field order, pixel aspect, profile, level, bit depth, chroma, rate control (CBR, VBR one and two pass, constant quality), target and maximum bitrate, key frame distance, hardware or software encoding, colour space and HDR10 metadata, alpha, image sequence numbering; audio codec, sample rate, channels (including each source track as its own track, and discrete channels), bitrate and bit depth; the multiplexer and fast start. Maximum render quality, maximum depth, time interpolation (sampling, blending, optical flow), start timecode, alpha only, maximum file size, the estimated size and comments.

## Effects

LUT (eight formencoder looks bundled, any `.cube`), HDR to SDR conform with a knee, image overlay, name overlay, text overlay, timecode overlay from the media or generated, Time Tuner within plus or minus 10 percent, video limiter, and loudness normalisation to EBU R128, ATSC A/85, OP-59, ARIB TR-B32, streaming, podcast or a custom target, two pass, with a true-peak limiter and an XML report. Text is drawn by formencoder itself, so every overlay works with the LGPL FFmpeg.

## Captions and metadata

Burn in, write a sidecar (SRT, WebVTT, SCC, TTML) or embed a caption track; captions are found beside the source or in it, and follow the range and Time Tuner. Metadata is retained, cleared or set, with an XMP sidecar on request.

## Watch folders, ingest, proxies

A watch folder queues whatever lands in it with its outputs and encodes it (Auto-Encode Watch Folders); outputs go to an Output subfolder and originals move to Source. Ingest copies files or camera cards with size, MD5 or bit-for-bit verification and can transcode at the same time. Proxies go to a Proxies folder beside each source. Analysis writes scene changes, black frames, silences and loudness to a sidecar.

## Publish

After an encode an output can be copied to a folder, uploaded over FTP or FTPS or to S3-compatible storage, announced to a webhook signed with HMAC-SHA256, or imported into formcut or formvfx.

## Presets

81 system encoding presets in Web Video, Social Media, Devices, Mezzanine, Broadcast, DVD, Image Sequence, Image, Animated GIF, Audio Only, Archive, Proxy and Form Family, and 5 Ingest presets. System presets are read-only (Save a Copy); user presets are `.fepreset` files with groups and aliases. Media Encoder `.epr` presets import with their format, frame size, rate, bitrates and sample rate.
