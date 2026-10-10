# formencoder formats and settings

Generated from the formencoder engine by `./formencoder agents sync`; do not edit by hand.

40 formats. Each output's settings object is `format` plus the fields below (dotted keys are the paths inside the settings object; patch them as nested objects or dotted keys). `formats {format}` returns this live, with the encoders found on the machine.

## Contents

`h264` `hevc` `av1` `webm` `quicktime` `prores` `prores_mxf` `dnxhr_mxf` `mxf_op1a` `jpeg2000_mxf` `as10` `as11` `as11_d10` `p2` `dcp` `cineform` `mpeg2` `mpeg2_dvd` `mpeg2_bluray` `h264_bluray` `mpeg4` `avi` `matroska` `gif` `png` `tiff` `jpeg` `dpx` `exr` `targa` `bmp` `jpeg2000` `webp` `wav` `bwf` `aiff` `mp3` `aac` `flac` `ogg`

## h264 · H.264

Group Video, extension .mp4, video codecs h264, audio codecs aac, ac3, eac3, mp3, containers mp4, mov, mkv, ts, none.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.profile` Profile (select: baseline|main|high|high10|high422); `video.level` Level (select: auto|3.1|4.0|4.1|4.2|5.0|5.1|5.2|6.0|6.1|6.2); `video.bitDepth` Bit Depth (select: 8|10); `video.chroma` Chroma (select: 420|422); `video.rateControl` Bitrate Encoding (select: vbr1|vbr2|cbr|quality); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.maxBitrate` Maximum Bitrate (number, 0.05..3000 Mb/s, shown when video.rateControl=vbr1|vbr2); `video.quality` Quality (int, 0..100 %, shown when video.rateControl=quality); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.vr.enabled` Video Is VR (bool); `video.vr.layout` Frame Layout (select: mono|topBottom|leftRight, shown when video.vr.enabled=true); `video.vr.hfov` Horizontal Field of View (select: 360|180, shown when video.vr.enabled=true); `video.vr.vfov` Vertical Field of View (select: 180|90, shown when video.vr.enabled=true); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: aac|ac3|eac3|mp3); `audio.sampleRate` Sample Rate (select: None|32000|44100|48000|96000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 64|96|128|160|192|256|320|384|512)
- multiplexer: `multiplexer.container` Multiplexing (select: mp4|mov|mkv|ts|none); `multiplexer.fastStart` Fast Start (index at the front) (bool)

## hevc · HEVC (H.265)

Group Video, extension .mp4, video codecs hevc, audio codecs aac, ac3, eac3, containers mp4, mov, mkv, ts, none.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.profile` Profile (select: main|main10|main422-10); `video.level` Level (select: auto|4.0|4.1|5.0|5.1|5.2|6.0|6.1|6.2); `video.bitDepth` Bit Depth (select: 8|10); `video.chroma` Chroma (select: 420|422); `video.rateControl` Bitrate Encoding (select: vbr1|vbr2|cbr|quality); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.maxBitrate` Maximum Bitrate (number, 0.05..3000 Mb/s, shown when video.rateControl=vbr1|vbr2); `video.quality` Quality (int, 0..100 %, shown when video.rateControl=quality); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.vr.enabled` Video Is VR (bool); `video.vr.layout` Frame Layout (select: mono|topBottom|leftRight, shown when video.vr.enabled=true); `video.vr.hfov` Horizontal Field of View (select: 360|180, shown when video.vr.enabled=true); `video.vr.vfov` Vertical Field of View (select: 180|90, shown when video.vr.enabled=true); `video.hdr10` Include HDR10 Metadata (bool, shown when video.colorSpace=rec2100pq); `video.maxCLL` Maximum Content Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.maxFALL` Maximum Frame Average Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: aac|ac3|eac3); `audio.sampleRate` Sample Rate (select: None|32000|44100|48000|96000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 64|96|128|160|192|256|320|384|512)
- multiplexer: `multiplexer.container` Multiplexing (select: mp4|mov|mkv|ts|none); `multiplexer.fastStart` Fast Start (index at the front) (bool)

## av1 · AV1

Group Video, extension .mp4, video codecs av1, audio codecs opus, aac, containers mp4, webm, mkv.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.profile` Profile (select: main); `video.bitDepth` Bit Depth (select: 8|10); `video.rateControl` Bitrate Encoding (select: vbr1|cbr|quality); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.maxBitrate` Maximum Bitrate (number, 0.05..3000 Mb/s, shown when video.rateControl=vbr1|vbr2); `video.quality` Quality (int, 0..100 %, shown when video.rateControl=quality); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.vr.enabled` Video Is VR (bool); `video.vr.layout` Frame Layout (select: mono|topBottom|leftRight, shown when video.vr.enabled=true); `video.vr.hfov` Horizontal Field of View (select: 360|180, shown when video.vr.enabled=true); `video.vr.vfov` Vertical Field of View (select: 180|90, shown when video.vr.enabled=true); `video.hdr10` Include HDR10 Metadata (bool, shown when video.colorSpace=rec2100pq); `video.maxCLL` Maximum Content Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.maxFALL` Maximum Frame Average Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: opus|aac); `audio.sampleRate` Sample Rate (select: None|48000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 64|96|128|160|192|256|320|510)
- multiplexer: `multiplexer.container` Multiplexing (select: mp4|webm|mkv); `multiplexer.fastStart` Fast Start (index at the front) (bool)

## webm · WebM

Group Video, extension .webm, video codecs vp9, vp8, av1, audio codecs opus, vorbis, containers webm.

- video: `video.codec` Video Codec (select: vp9|vp8|av1); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 8|10); `video.rateControl` Bitrate Encoding (select: vbr1|vbr2|cbr|quality); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.maxBitrate` Maximum Bitrate (number, 0.05..3000 Mb/s, shown when video.rateControl=vbr1|vbr2); `video.quality` Quality (int, 0..100 %, shown when video.rateControl=quality); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.hdr10` Include HDR10 Metadata (bool, shown when video.colorSpace=rec2100pq); `video.maxCLL` Maximum Content Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.maxFALL` Maximum Frame Average Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.alpha` Include Alpha Channel (bool); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: opus|vorbis); `audio.sampleRate` Sample Rate (select: None|48000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 64|96|128|160|192|256|320|510)

## quicktime · QuickTime

Group Video, extension .mov, video codecs prores, dnxhr, cineform, qtrle, uncompressed, png, mjpeg, h264, hevc, audio codecs pcm, aac, alac, containers mov.

- video: `video.codec` Video Codec (select: prores|dnxhr|cineform|qtrle|uncompressed|png|mjpeg|h264|hevc); `video.flavor` Profile (select: proxy|lt|422|hq|4444|4444xq); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 10|12); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.vr.enabled` Video Is VR (bool); `video.vr.layout` Frame Layout (select: mono|topBottom|leftRight, shown when video.vr.enabled=true); `video.vr.hfov` Horizontal Field of View (select: 360|180, shown when video.vr.enabled=true); `video.vr.vfov` Vertical Field of View (select: 180|90, shown when video.vr.enabled=true); `video.hdr10` Include HDR10 Metadata (bool, shown when video.colorSpace=rec2100pq); `video.maxCLL` Maximum Content Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.maxFALL` Maximum Frame Average Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.alpha` Include Alpha Channel (bool); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: pcm|aac|alac); `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)
- multiplexer: `multiplexer.fastStart` Fast Start (index at the front) (bool)

## prores · Apple ProRes

Group Video, extension .mov, video codecs prores, audio codecs pcm, aac, containers mov.

- video: `video.flavor` Profile (select: proxy|lt|422|hq|4444|4444xq); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 10|12); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.vr.enabled` Video Is VR (bool); `video.vr.layout` Frame Layout (select: mono|topBottom|leftRight, shown when video.vr.enabled=true); `video.vr.hfov` Horizontal Field of View (select: 360|180, shown when video.vr.enabled=true); `video.vr.vfov` Vertical Field of View (select: 180|90, shown when video.vr.enabled=true); `video.hdr10` Include HDR10 Metadata (bool, shown when video.colorSpace=rec2100pq); `video.maxCLL` Maximum Content Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.maxFALL` Maximum Frame Average Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.alpha` Include Alpha Channel (bool); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: pcm|aac); `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)
- multiplexer: `multiplexer.fastStart` Fast Start (index at the front) (bool)

## prores_mxf · Apple ProRes MXF OP1a

Group Broadcast, extension .mxf, video codecs prores, audio codecs pcm, containers mxf.

- video: `video.flavor` Profile (select: proxy|lt|422|hq|4444|4444xq); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 10|12); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.hdr10` Include HDR10 Metadata (bool, shown when video.colorSpace=rec2100pq); `video.maxCLL` Maximum Content Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.maxFALL` Maximum Frame Average Light Level (int, 0..10000 nits, shown when video.hdr10=true); `video.alpha` Include Alpha Channel (bool); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## dnxhr_mxf · DNxHR/DNxHD MXF OP1a

Group Broadcast, extension .mxf, video codecs dnxhr, audio codecs pcm, containers mxf.

- video: `video.flavor` Profile (select: dnxhr_lb|dnxhr_sq|dnxhr_hq|dnxhr_hqx|dnxhr_444|dnxhd_36|dnxhd_145|dnxhd_220|dnxhd_220x); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 8|10); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## mxf_op1a · MXF OP1a

Group Broadcast, extension .mxf, video codecs xdcam, dnxhr, prores, jpeg2000, mpeg2, audio codecs pcm, containers mxf.

- video: `video.codec` Video Codec (select: xdcam|dnxhr|prores|jpeg2000|mpeg2); `video.flavor` Profile (select: 50|35); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.rateControl` Bitrate Encoding (select: cbr); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## jpeg2000_mxf · JPEG 2000 MXF OP1a

Group Broadcast, extension .mxf, video codecs jpeg2000, audio codecs pcm, containers mxf.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 8|10|12); `video.rateControl` Bitrate Encoding (select: quality); `video.quality` Quality (int, 0..100 %, shown when video.rateControl=quality); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## as10 · AS-10 MXF (MPEG-2 HD422)

Group Broadcast, extension .mxf, video codecs xdcam, audio codecs pcm, containers mxf.

- video: `video.flavor` Profile (select: 50|35); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.rateControl` Bitrate Encoding (select: cbr); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## as11 · AS-11 OP1a MXF (MPEG-2 HD422)

Group Broadcast, extension .mxf, video codecs xdcam, audio codecs pcm, containers mxf.

- video: `video.flavor` Profile (select: 50|35); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.rateControl` Bitrate Encoding (select: cbr); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## as11_d10 · AS-11 D10 MXF (IMX 50, SD)

Group Broadcast, extension .mxf, video codecs imx, audio codecs pcm, containers mxf.

- video: `video.flavor` Profile (select: 50_625|50_525|40_625|30_625); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## p2 · P2 card (DVCPRO HD OP-Atom)

Group Broadcast, extension .mxf, video codecs dvcprohd, audio codecs pcm, containers mxf.

- video: `video.flavor` Profile (select: 1080i50|1080i5994|720p50|720p5994); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## dcp · DCP (Digital Cinema Package)

Group Cinema, extension .mxf, video codecs dcp_j2k, audio codecs pcm, containers dcp.

- video: `video.flavor` Profile (select: 2k|4k); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## cineform · GoPro CineForm

Group Video, extension .mov, video codecs cineform, audio codecs pcm, containers mov.

- video: `video.flavor` Profile (select: low|medium|high|filmscan1|filmscan2|filmscan3); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 10|12); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)
- multiplexer: `multiplexer.fastStart` Fast Start (index at the front) (bool)

## mpeg2 · MPEG-2

Group Broadcast, extension .mpg, video codecs mpeg2, audio codecs mp2, ac3, pcm, containers mpeg, ts.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.profile` Profile (select: main|422); `video.rateControl` Bitrate Encoding (select: vbr1|vbr2|cbr); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.maxBitrate` Maximum Bitrate (number, 0.05..3000 Mb/s, shown when video.rateControl=vbr1|vbr2); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: mp2|ac3|pcm); `audio.sampleRate` Sample Rate (select: None|44100|48000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 192|224|256|320|384)
- multiplexer: `multiplexer.container` Multiplexing (select: mpeg|ts)

## mpeg2_dvd · MPEG-2-DVD

Group Broadcast, extension .mpg, video codecs mpeg2, audio codecs ac3, mp2, pcm, containers dvd.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.profile` Profile (select: main|422); `video.rateControl` Bitrate Encoding (select: vbr1|vbr2|cbr); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.maxBitrate` Maximum Bitrate (number, 0.05..3000 Mb/s, shown when video.rateControl=vbr1|vbr2); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: ac3|mp2|pcm); `audio.sampleRate` Sample Rate (select: None|48000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 192|224|256|320|384|448|640)

## mpeg2_bluray · MPEG2 Blu-ray

Group Broadcast, extension .m2v, video codecs mpeg2, audio codecs ac3, pcm, containers none, m2ts.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.profile` Profile (select: main|422); `video.rateControl` Bitrate Encoding (select: vbr1|vbr2|cbr); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.maxBitrate` Maximum Bitrate (number, 0.05..3000 Mb/s, shown when video.rateControl=vbr1|vbr2); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: ac3|pcm); `audio.sampleRate` Sample Rate (select: None|48000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 192|224|256|320|384|448|640)
- multiplexer: `multiplexer.container` Multiplexing (select: none|m2ts)

## h264_bluray · H.264 Blu-ray

Group Broadcast, extension .264, video codecs h264, audio codecs ac3, pcm, containers none, m2ts.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.profile` Profile (select: baseline|main|high|high10|high422); `video.level` Level (select: auto|3.1|4.0|4.1|4.2|5.0|5.1|5.2|6.0|6.1|6.2); `video.bitDepth` Bit Depth (select: 8|10); `video.chroma` Chroma (select: 420|422); `video.rateControl` Bitrate Encoding (select: vbr1|vbr2|cbr|quality); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.maxBitrate` Maximum Bitrate (number, 0.05..3000 Mb/s, shown when video.rateControl=vbr1|vbr2); `video.quality` Quality (int, 0..100 %, shown when video.rateControl=quality); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.hardware` Performance (select: auto|on|off); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: ac3|pcm); `audio.sampleRate` Sample Rate (select: None|48000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 192|224|256|320|384|448|640)
- multiplexer: `multiplexer.container` Multiplexing (select: none|m2ts)

## mpeg4 · MPEG-4

Group Video, extension .mp4, video codecs mpeg4, audio codecs aac, containers mp4, 3gp.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.rateControl` Bitrate Encoding (select: vbr1|vbr2|cbr|quality); `video.targetBitrate` Target Bitrate (number, 0.05..2000 Mb/s, shown when video.rateControl!=quality); `video.maxBitrate` Maximum Bitrate (number, 0.05..3000 Mb/s, shown when video.rateControl=vbr1|vbr2); `video.quality` Quality (int, 0..100 %, shown when video.rateControl=quality); `video.keyframeDistance` Key Frame Distance (int, 1..1000 frames); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|32000|44100|48000|96000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 64|96|128|160|192|256|320|384|512)
- multiplexer: `multiplexer.container` Multiplexing (select: mp4|3gp); `multiplexer.fastStart` Fast Start (index at the front) (bool)

## avi · AVI

Group Video, extension .avi, video codecs uncompressed, mjpeg, ffv1, audio codecs pcm, containers avi.

- video: `video.codec` Video Codec (select: uncompressed|mjpeg|ffv1); `video.flavor` Profile (select: uyvy422|v210|rgb24|rgba); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 8|10); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## matroska · Matroska (archival)

Group Video, extension .mkv, video codecs ffv1, h264, hevc, av1, vp9, prores, audio codecs flac, pcm, opus, aac, containers mkv.

- video: `video.codec` Video Codec (select: ffv1|h264|hevc|av1|vp9|prores); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 8|10|12|16); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.encoder` Encoder (FFmpeg name) (text)
- audio: `audio.codec` Audio Codec (select: flac|pcm|opus|aac); `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24)

## gif · Animated GIF

Group Video, extension .gif, video codecs gif, audio codecs none, containers gif.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.fieldOrder` Field Order (select: source|progressive|tff|bff); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.loop` Loop (bool); `video.dither` Dither (select: sierra2_4a|bayer|floyd_steinberg|none); `video.encoder` Encoder (FFmpeg name) (text)

## png · PNG

Group Image, extension .png, video codecs png, audio codecs none, containers one.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 8|16); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.sequence` Export As Sequence (bool); `video.startNumber` Start Number (int, 0..99999999, shown when video.sequence=true); `video.encoder` Encoder (FFmpeg name) (text)

## tiff · TIFF

Group Image, extension .tif, video codecs tiff, audio codecs none, containers one.

- video: `video.flavor` Profile (select: none|lzw|deflate|packbits); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 8|16); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.sequence` Export As Sequence (bool); `video.startNumber` Start Number (int, 0..99999999, shown when video.sequence=true); `video.encoder` Encoder (FFmpeg name) (text)

## jpeg · JPEG

Group Image, extension .jpg, video codecs jpeg, audio codecs none, containers one.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.rateControl` Bitrate Encoding (select: quality); `video.quality` Quality (int, 0..100 %, shown when video.rateControl=quality); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.sequence` Export As Sequence (bool); `video.startNumber` Start Number (int, 0..99999999, shown when video.sequence=true); `video.encoder` Encoder (FFmpeg name) (text)

## dpx · DPX

Group Image, extension .dpx, video codecs dpx, audio codecs none, containers one.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 8|10|12|16); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.sequence` Export As Sequence (bool); `video.startNumber` Start Number (int, 0..99999999, shown when video.sequence=true); `video.encoder` Encoder (FFmpeg name) (text)

## exr · OpenEXR

Group Image, extension .exr, video codecs exr, audio codecs none, containers one.

- video: `video.flavor` Profile (select: zip1|zip16|rle|none); `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 16|32); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.sequence` Export As Sequence (bool); `video.startNumber` Start Number (int, 0..99999999, shown when video.sequence=true); `video.encoder` Encoder (FFmpeg name) (text)

## targa · Targa

Group Image, extension .tga, video codecs targa, audio codecs none, containers one.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.sequence` Export As Sequence (bool); `video.startNumber` Start Number (int, 0..99999999, shown when video.sequence=true); `video.encoder` Encoder (FFmpeg name) (text)

## bmp · BMP

Group Image, extension .bmp, video codecs bmp, audio codecs none, containers one.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.sequence` Export As Sequence (bool); `video.startNumber` Start Number (int, 0..99999999, shown when video.sequence=true); `video.encoder` Encoder (FFmpeg name) (text)

## jpeg2000 · JPEG 2000

Group Image, extension .jp2, video codecs jpeg2000, audio codecs none, containers one.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.bitDepth` Bit Depth (select: 8|10|12); `video.rateControl` Bitrate Encoding (select: quality); `video.quality` Quality (int, 0..100 %, shown when video.rateControl=quality); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.sequence` Export As Sequence (bool); `video.startNumber` Start Number (int, 0..99999999, shown when video.sequence=true); `video.encoder` Encoder (FFmpeg name) (text)

## webp · WebP

Group Image, extension .webp, video codecs webp, audio codecs none, containers one.

- video: `video.matchSource` Match Source (bool); `video.width` Width (int, 16..16384 px); `video.height` Height (int, 16..16384 px); `video.frameRate` Frame Rate (select: None|10.0|12.0|12.5|15.0|23.976|24.0|25.0|29.97|30.0|47.952|48.0|50.0|59.94|...); `video.pixelAspect` Aspect (select: source|1:1|10:11|40:33|12:11|16:11|4:3|3:2|2:1); `video.rateControl` Bitrate Encoding (select: quality); `video.quality` Quality (int, 0..100 %, shown when video.rateControl=quality); `video.colorSpace` Color Space (select: source|rec709|rec601|rec2020|rec2100pq|rec2100hlg|p3d65); `video.alpha` Include Alpha Channel (bool); `video.sequence` Export As Sequence (bool); `video.startNumber` Start Number (int, 0..99999999, shown when video.sequence=true); `video.encoder` Encoder (FFmpeg name) (text)

## wav · Waveform Audio

Group Audio, extension .wav, video codecs none, audio codecs pcm, containers wav.

- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## bwf · Broadcast WAV (BWF)

Group Audio, extension .wav, video codecs none, audio codecs pcm, containers wav.

- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## aiff · AIFF

Group Audio, extension .aif, video codecs none, audio codecs pcm, containers aiff.

- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24|32); `audio.float` 32-bit Float (bool, shown when audio.bitDepth=32)

## mp3 · MP3

Group Audio, extension .mp3, video codecs none, audio codecs mp3, containers mp3.

- audio: `audio.sampleRate` Sample Rate (select: None|32000|44100|48000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 96|128|160|192|256|320)

## aac · AAC Audio

Group Audio, extension .m4a, video codecs none, audio codecs aac, alac, containers m4a.

- audio: `audio.codec` Audio Codec (select: aac|alac); `audio.sampleRate` Sample Rate (select: None|32000|44100|48000|96000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 64|96|128|160|192|256|320|384|512)

## flac · FLAC

Group Audio, extension .flac, video codecs none, audio codecs flac, containers flac.

- audio: `audio.sampleRate` Sample Rate (select: None|44100|48000|88200|96000|192000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitDepth` Sample Size (select: 16|24)

## ogg · Ogg (Opus or Vorbis)

Group Audio, extension .ogg, video codecs none, audio codecs opus, vorbis, containers ogg.

- audio: `audio.codec` Audio Codec (select: opus|vorbis); `audio.sampleRate` Sample Rate (select: None|48000); `audio.channels` Channels (select: source|mono|stereo|5.1|7.1|tracks|discrete|custom); `audio.routing` Channel Routing (routing, shown when audio.channels=custom); `audio.bitrate` Bitrate (select: 64|96|128|160|192|256|320|510)

## Effects (defaults)

```json
{
 "lut": {
  "enabled": false,
  "path": "",
  "intensity": 100
 },
 "sdrConform": {
  "enabled": false,
  "brightness": 0,
  "contrast": 0,
  "knee": 75,
  "peak": 1000
 },
 "imageOverlay": {
  "enabled": false,
  "path": "",
  "position": "bottomRight",
  "offsetX": 0,
  "offsetY": 0,
  "size": 100,
  "absolute": false,
  "opacity": 100
 },
 "nameOverlay": {
  "enabled": false,
  "prefix": "",
  "suffix": "",
  "source": "fileName",
  "position": "bottomCenter",
  "offsetX": 0,
  "offsetY": 0,
  "size": 32,
  "opacity": 100,
  "color": "#ffffff",
  "background": 50
 },
 "textOverlay": {
  "enabled": false,
  "text": "",
  "position": "topCenter",
  "offsetX": 0,
  "offsetY": 0,
  "size": 32,
  "opacity": 100,
  "color": "#ffffff",
  "background": 0
 },
 "timecodeOverlay": {
  "enabled": false,
  "position": "bottomLeft",
  "offsetX": 0,
  "offsetY": 0,
  "size": 32,
  "opacity": 100,
  "color": "#ffffff",
  "background": 50,
  "source": "media",
  "start": "00:00:00:00",
  "offsetFrames": 0,
  "frameRate": null
 },
 "timeTuner": {
  "enabled": false,
  "targetDuration": null,
  "percent": 0.0,
  "skipSlates": 0.0
 },
 "videoLimiter": {
  "enabled": false,
  "min": 0.0,
  "max": 100.0,
  "compression": 0.0
 },
 "loudness": {
  "enabled": false,
  "standard": "ebu-r128",
  "target": -23.0,
  "tolerance": 1.0,
  "truePeak": -1.0,
  "lra": 11.0,
  "mode": "twopass",
  "report": true,
  "reportFolder": "",
  "limiter": {
   "enabled": false,
   "lookahead": 5.0,
   "release": 50.0
  }
 }
}
```

## Loudness standards

```json
{
 "ebu-r128": {
  "label": "EBU R128",
  "target": -23.0,
  "truePeak": -1.0
 },
 "atsc-a85": {
  "label": "ATSC A/85",
  "target": -24.0,
  "truePeak": -2.0
 },
 "itu-bs1770": {
  "label": "ITU BS.1770-3 (custom target)",
  "target": null,
  "truePeak": null
 },
 "arib-tr-b32": {
  "label": "ARIB TR-B32",
  "target": -24.0,
  "truePeak": -1.0
 },
 "op59": {
  "label": "OP-59 (Australia)",
  "target": -24.0,
  "truePeak": -2.0
 },
 "streaming": {
  "label": "Streaming (-14 LUFS)",
  "target": -14.0,
  "truePeak": -1.0
 },
 "podcast": {
  "label": "Podcast (-16 LUFS)",
  "target": -16.0,
  "truePeak": -1.0
 },
 "custom": {
  "label": "Custom",
  "target": null,
  "truePeak": null
 }
}
```

## Scaling, time interpolation, caption formats

- scaling: `fit` Scale To Fit, `fitBlack` Scale To Fit Black Borders, `fill` Scale To Fill, `stretch` Stretch To Fill, `matchWidth` Change Output Size To Match Source
- timeInterpolation: `sampling` Frame Sampling, `blending` Frame Blending, `opticalFlow` Optical Flow
- captions.format: `srt` SubRip (.srt), `vtt` WebVTT (.vtt), `scc` Scenarist (.scc, CEA-608), `ttml` TTML / DFXP (.xml)

## A complete default settings object (H.264)

```json
{
 "format": "h264",
 "preset": null,
 "presetName": "Custom",
 "comments": "",
 "outputName": "{source}",
 "exportVideo": true,
 "exportAudio": true,
 "video": {
  "codec": "h264",
  "flavor": null,
  "matchSource": true,
  "width": null,
  "height": null,
  "frameRate": null,
  "fieldOrder": "progressive",
  "pixelAspect": "1:1",
  "profile": "high",
  "level": "auto",
  "bitDepth": 8,
  "chroma": "420",
  "rateControl": "vbr1",
  "targetBitrate": 10.0,
  "maxBitrate": 12.0,
  "quality": 75,
  "keyframeDistance": null,
  "hardware": "auto",
  "encoder": null,
  "colorSpace": "rec709",
  "hdr10": false,
  "maxCLL": 1000,
  "maxFALL": 400,
  "alpha": false,
  "sequence": false,
  "startNumber": 0,
  "loop": true,
  "dither": "sierra2_4a",
  "vr": {
   "enabled": false,
   "layout": "mono",
   "hfov": 360,
   "vfov": 180
  }
 },
 "audio": {
  "codec": "aac",
  "sampleRate": 48000,
  "channels": "stereo",
  "bitrate": 320,
  "bitDepth": 16,
  "float": false,
  "routing": []
 },
 "multiplexer": {
  "container": "mp4",
  "fastStart": true
 },
 "range": {
  "mode": "entire",
  "in": null,
  "out": null
 },
 "crop": {
  "left": 0,
  "top": 0,
  "right": 0,
  "bottom": 0,
  "proportion": "none",
  "anchorX": 0.5,
  "anchorY": 0.5
 },
 "rotation": 0,
 "scaling": "fit",
 "timeInterpolation": "sampling",
 "maxRenderQuality": false,
 "maxDepth": false,
 "startTimecode": null,
 "alphaOnly": false,
 "maxFileSize": null,
 "effects": {
  "lut": {
   "enabled": false,
   "path": "",
   "intensity": 100
  },
  "sdrConform": {
   "enabled": false,
   "brightness": 0,
   "contrast": 0,
   "knee": 75,
   "peak": 1000
  },
  "imageOverlay": {
   "enabled": false,
   "path": "",
   "position": "bottomRight",
   "offsetX": 0,
   "offsetY": 0,
   "size": 100,
   "absolute": false,
   "opacity": 100
  },
  "nameOverlay": {
   "enabled": false,
   "prefix": "",
   "suffix": "",
   "source": "fileName",
   "position": "bottomCenter",
   "offsetX": 0,
   "offsetY": 0,
   "size": 32,
   "opacity": 100,
   "color": "#ffffff",
   "background": 50
  },
  "textOverlay": {
   "enabled": false,
   "text": "",
   "position": "topCenter",
   "offsetX": 0,
   "offsetY": 0,
   "size": 32,
   "opacity": 100,
   "color": "#ffffff",
   "background": 0
  },
  "timecodeOverlay": {
   "enabled": false,
   "position": "bottomLeft",
   "offsetX": 0,
   "offsetY": 0,
   "size": 32,
   "opacity": 100,
   "color": "#ffffff",
   "background": 50,
   "source": "media",
   "start": "00:00:00:00",
   "offsetFrames": 0,
   "frameRate": null
  },
  "timeTuner": {
   "enabled": false,
   "targetDuration": null,
   "percent": 0.0,
   "skipSlates": 0.0
  },
  "videoLimiter": {
   "enabled": false,
   "min": 0.0,
   "max": 100.0,
   "compression": 0.0
  },
  "loudness": {
   "enabled": false,
   "standard": "ebu-r128",
   "target": -23.0,
   "tolerance": 1.0,
   "truePeak": -1.0,
   "lra": 11.0,
   "mode": "twopass",
   "report": true,
   "reportFolder": "",
   "limiter": {
    "enabled": false,
    "lookahead": 5.0,
    "release": 50.0
   }
  }
 },
 "captions": {
  "mode": "none",
  "source": "auto",
  "format": "srt",
  "language": "eng",
  "size": 36,
  "color": "#ffffff",
  "background": 60,
  "position": "bottom"
 },
 "metadata": {
  "mode": "retain",
  "template": null,
  "rules": {
   "keep": [],
   "drop": []
  },
  "fields": {},
  "xmpSidecar": false
 },
 "publish": [],
 "package": {
  "shim": "",
  "shimVersion": "1.1",
  "mainTitle": "",
  "subTitle": "",
  "organization": "",
  "seriesTitle": "",
  "programmeTitle": "",
  "episode": "",
  "audioTrackLayout": 0,
  "language": "eng",
  "closedCaptions": false,
  "clipName": "",
  "userClipName": "",
  "title": "",
  "standard": "smpte",
  "aspect": "flat",
  "contentKind": "feature",
  "issuer": "formencoder",
  "fields": {}
 },
 "contentCredentials": {
  "enabled": false,
  "author": "",
  "certificate": "",
  "privateKey": "",
  "algorithm": "es256",
  "tsa": "",
  "includeSource": true
 },
 "plugins": []
}
```
