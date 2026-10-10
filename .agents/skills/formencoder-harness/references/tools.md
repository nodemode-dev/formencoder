# formencoder MCP tools

Generated from the formencoder engine by `./formencoder agents sync`; do not edit by hand.

The `formencoder` MCP server has 21 tools. `./formencoder mcp` serves them over stdio (it starts the engine when it is not running); the engine also serves them over Streamable HTTP at `http://127.0.0.1:8270/mcp`. The shell equivalents are in the last section.

## Contents

`status` `list_commands` `describe_command` `execute` `batch` `probe` `encode` `queue` `export_settings` `preview_frame` `contact_sheet` `wait` `verify` `presets` `formats` `watch_folder` `family` `log` `history` `ui` `guide`

## status

Start here. The queue (items, outputs by status, running or paused), what is encoding now with progress, FFmpeg and the hardware encoders found, watch folders, the last messages, how many formencoder windows are watching and the suggested next step.

- no parameters

Note: read-only.

## list_commands

formencoder's commands (every menu item and button is one): id, label, menu, parameter summary, whether it is undoable or a query. Filter by text, namespace (queue, encode, preset, watch, format, media, captions, lut, log, prefs, family, ui, ingest, proxy, analyze) or menu name.

- `filter`: string
- `limit`: integer; default 200

Note: read-only.

## describe_command

One command in full: label, menu, documentation and JSON Schema of its parameters.

- `command`: string; required

Note: read-only.

## execute

Runs one formencoder command by id with its parameters (see describe_command) and returns its result. Undoable commands are one step in the person's History.

- `command`: string; required
- `params`: object

## batch

Runs several commands as one undo step. Each step is {command, params}; a string "$N.key" in a later step is replaced by step N's result field, counting from 1 ("$1.output" is the output the first queue.addSource made). atomic (default true) undoes everything if a step fails.

- `steps`: array; required
- `label`: string
- `atomic`: boolean; default true

## probe

Media information of a file: kind, duration, container, video (codec, size, rate, pixel format, bit depth, chroma, field order, colour, HDR, rotation, frames), audio streams, subtitles, timecode, tags; with loudness, its integrated loudness, range and true peak.

- `path`: string; required
- `loudness`: boolean; default false
- `frameRate`: number; for an image sequence

Note: read-only.

## encode

The quick path: queues files (absolute paths) with a preset or settings, starts the queue, waits for the outputs and verifies each file. settings patches the preset. outputs gives several outputs per file instead ([{preset, settings, folder}]). stitch joins the files into one output. Returns each output's status, file, notes and verification.

- `paths`: array; required
- `preset`: string; Preset id (system/youtube-1080p, user/...), name or alias.
- `format`: string
- `settings`: object; Export settings patch: nested objects or dotted keys (video.targetBitrate).
- `folder`: string
- `outputs`: array
- `stitch`: boolean; default false
- `wait`: boolean; default true
- `verify`: boolean; default true
- `timeout`: number; default 3600

## queue

The queue: list (items and outputs), start, pause, stop, stopCurrent {refs}, clearDone, remove {refs}, resetStatus {refs} (encode again), skip {refs, skip}, duplicate {refs}, reorder {item, to}, setPreset {refs, preset}, setOutput {refs, path|folder|name}, setRange {refs, mode, in, out}, addOutput {item, preset}.

- `action`: string (list | start | pause | stop | stopCurrent | clearDone | remove | resetStatus | skip | duplicate | reorder | setPreset | setOutput | setRange | addOutput); required
- `refs`: string or list; Output id, item id, '#n' (the nth item), 'selected' or 'all'; or a list of them.
- `item`: string
- `to`: integer
- `skip`: boolean
- `preset`: string; Preset id (system/youtube-1080p, user/...), name or alias.
- `path`: string
- `folder`: string
- `name`: string
- `mode`: string (entire | inout | custom | workArea)
- `in`: number
- `out`: number

## export_settings

Reads one output's complete export settings with its summary, file and source; with settings, first patches them (one undo step; replace swaps the whole object). formats {format} lists the fields.

- `output`: string; required; Output id (o-...) or '#n' for the nth item's first output.
- `settings`: object; Export settings patch: nested objects or dotted keys (video.targetBitrate).
- `replace`: boolean; default false

## preview_frame

Renders one frame through an output's exact export settings (scaling, crop, rotation, LUT, SDR conform, limiter, overlays, burnt-in captions) and returns the image, so you see what the encode will look like. view source shows the untouched source frame instead (the Compare view). Give output, or path with preset or settings for a file not in the queue. time is seconds from the start of the range.

- `output`: string; Output id (o-...) or '#n' for the nth item's first output.
- `path`: string
- `preset`: string; Preset id (system/youtube-1080p, user/...), name or alias.
- `settings`: object; Export settings patch: nested objects or dotted keys (video.targetBitrate).
- `patch`: object; Export settings patch: nested objects or dotted keys (video.targetBitrate).
- `time`: number; default 0
- `width`: integer; default 960
- `view`: string (output | source); default "output"

Note: read-only.

## contact_sheet

Several frames of an output (or a file) through its export settings in one labelled grid: checks a range, a Time Tuner, overlays and captions over time in one look.

- `output`: string; Output id (o-...) or '#n' for the nth item's first output.
- `path`: string
- `preset`: string; Preset id (system/youtube-1080p, user/...), name or alias.
- `settings`: object; Export settings patch: nested objects or dotted keys (video.targetBitrate).
- `count`: integer; default 8
- `times`: array
- `width`: integer; default 360
- `columns`: integer
- `view`: string (output | source); default "output"

Note: read-only.

## wait

Waits until the given outputs (or the whole queue) are done, failed or stopped, up to timeout seconds. Returns each output's status, file, error and notes.

- `outputs`: array
- `timeout`: number; default 600

Note: read-only.

## verify

Probes an encoded file and checks it against its output's settings: frame size, frame rate, duration, video and audio codecs, sample rate and, when loudness was normalised, the measured loudness against the target. Give output (or path for any file; loudness true to measure it).

- `output`: string; Output id (o-...) or '#n' for the nth item's first output.
- `path`: string
- `loudness`: boolean; default false

Note: read-only.

## presets

The Preset Browser: list {query, category, kind} (81 system encoding presets in Web Video, Social Media, Devices, Mezzanine, Broadcast, DVD, Image Sequence, Image, Animated GIF, Audio Only, Archive, Proxy and Form Family, plus 5 Ingest presets), get {preset}, create {name, settings or fromOutput, group, comment}, update, delete, duplicate, alias, import {path} (.fepreset, JSON or Media Encoder .epr), export {preset, path}.

- `action`: string (list | get | create | update | delete | duplicate | alias | import | export); required
- `preset`: string; Preset id (system/youtube-1080p, user/...), name or alias.
- `query`: string
- `category`: string
- `kind`: string (encode | ingest)
- `name`: string
- `settings`: object
- `fromOutput`: string
- `group`: string
- `comment`: string
- `alias`: string
- `path`: string

## formats

Without format: the 33 formats with their codecs. With format (or output): every export setting of it (key, label, type, options, unit, showIf), its codecs with the encoders this machine has, the effect defaults, loudness standards and the complete default settings.

- `format`: string
- `output`: string; Output id (o-...) or '#n' for the nth item's first output.

Note: read-only.

## watch_folder

Watch folders: list, add {folder, preset or outputs, kind: encode|analysis, moveSources}, remove {watch}, setActive {watch, active}, addOutput {watch, preset, settings, folder}, setOutput {output, preset, settings, folder}, removeOutput {output}, scan (queue what is there now), autoEncode {enabled}.

- `action`: string (list | add | remove | setActive | addOutput | setOutput | removeOutput | scan | autoEncode); required
- `folder`: string
- `watch`: string
- `output`: string
- `preset`: string; Preset id (system/youtube-1080p, user/...), name or alias.
- `format`: string
- `settings`: object
- `outputs`: array
- `kind`: string (encode | analysis)
- `moveSources`: boolean
- `active`: boolean
- `enabled`: boolean

## family

The form family: discover (which of formcut, formvfx, formwav and formvis are running here), sources {app} (their projects, comps, sessions, images), add {app, id or name, preset, settings, folder, in, out, start} queues one (formcut renders it, formvfx streams it over Dynamic Link, formwav mixes it, formvis hands the image), addLink {path} queues a formvfx .fvxlink, send {app: formcut|formvfx, files, project} imports finished files there.

- `action`: string (discover | sources | add | addLink | send); required
- `app`: string (formcut | formvfx | formwav | formvis)
- `id`: string
- `name`: string
- `path`: string
- `files`: array
- `project`: string
- `preset`: string; Preset id (system/youtube-1080p, user/...), name or alias.
- `settings`: object
- `folder`: string
- `in`: number
- `out`: number
- `start`: boolean; default false

Note: reaches other apps.

## log

The Encoding log (every finished output: source, file, format, preset, encoder, time, size, notes) or the Error log (failures with FFmpeg's last lines).

- `kind`: string (encoding | error); default "encoding"
- `limit`: integer; default 80

Note: read-only.

## history

Undo, redo or list the queue history.

- `action`: string (undo | redo | list); required
- `steps`: integer; default 1

## ui

The formencoder window: state, or show a panel, switch workspace, open Export Settings on an output, show a message.

- `action`: string (state | panel | workspace | exportSettings | toast); required
- `panel`: string
- `name`: string
- `output`: string
- `text`: string

## guide

formencoder know-how for agents: workflow, queue, settings, video, audio, effects, captions, metadata, publish, watch, ingest, family, presets, ui.

- `topic`: string

Note: read-only.

## Guide topics

The `guide` tool returns these texts.

### workflow

How to encode with formencoder through these tools.

1. Orient: status (queue counts, what is encoding, FFmpeg and hardware encoders found, watch folders). probe a source to know its size, rate, codecs, timecode, audio layout and loudness (probe {path, loudness: true}).
2. Choose: presets {action: list, query} finds a preset (YouTube, ProRes, DNxHR, XDCAM, WAV, image sequence...). formats {format} shows every export setting of a format with its keys, options and the encoders this machine has.
3. Quick job: encode {paths, preset, folder?, settings?} queues, encodes, waits and verifies in one call. settings is a patch on the preset (nested objects or dotted keys: {"video.targetBitrate": 8, "effects.loudness.enabled": true}).
4. Careful job: execute queue.addSource {paths, preset or outputs: [{preset, settings, folder}]} (several outputs per source encode in parallel), then export_settings {output, settings} to adjust, preview_frame {output, time} to look (overlays, crop, scaling, LUT, captions show), then queue {action: start} and wait {outputs}.
5. Check: verify {output} probes the file against its settings (frame size, rate, duration, codecs, audio, loudness when normalised). Read the notes and the error of failed outputs (log {kind: error} for FFmpeg's own words), fix the settings and queue {action: resetStatus, refs} to encode again.
6. Repeatable work: presets {action: create, name, fromOutput} saves the settings; watch_folder {action: add, folder, preset} encodes whatever lands in a folder.
7. Family: family {action: discover} finds formcut, formvfx, formwav and formvis running here; family {action: sources, app} lists their projects, compositions, sessions and images; family {action: add, app, id, preset} queues one (formcut renders the sequence, formvfx streams the comp over Dynamic Link, formwav mixes the session); family {action: send, app, files} hands finished files back to formcut or formvfx.
8. Mistakes: history {action: undo}. A failed tool says why; read it, fix the params (describe_command shows the schema) and retry.

### queue

Refs: an output id (o...), an item id (i...), '#n' for the nth item (its outputs), 'selected' or 'all'. queue.addSource {paths, preset|format|settings|outputs, folder, stitch, frameRate (image sequence), start}. queue.addOutput {item, preset} adds another output to a source. queue.duplicate, queue.remove, queue.clearDone, queue.reorder {item, to}, queue.skip {refs, skip}, queue.resetStatus {refs} (encode again). queue.setRange {refs, mode: entire|inout|custom, in, out} in source seconds. queue.interpret {item, frameRate, pixelAspect, fieldOrder, alpha, rotation}. queue.stitch {paths} joins clips into one output. queue.save {path} and queue.open {path} keep a queue as .fequeue. Status values: ready, preparing, encoding, paused, done, failed, stopped, skipped.

### settings

Settings object: format, outputName (tokens {source} {preset} {format} {date} {time} {width} {height} {fps} {index}), exportVideo, exportAudio, video{...}, audio{...}, multiplexer{container, fastStart}, range{mode,in,out}, crop{left,top,right,bottom}, rotation (0, 90, 180, 270), scaling (fit, fitBlack, fill, stretch, matchWidth), timeInterpolation (sampling, blending, opticalFlow), maxRenderQuality, maxDepth, startTimecode, alphaOnly, maxFileSize (MB), effects{...}, captions{...}, metadata{...}, publish[...]. Switching format keeps range, crop, scaling, effects, captions, metadata and publish. formats {format} lists every field with its options and showIf condition.

### video

video: codec, matchSource (width, height and rate from the source), width, height, frameRate (null = source), fieldOrder (progressive, tff, bff, source), pixelAspect, profile, level, bitDepth (8, 10, 12), chroma (420, 422, 444), rateControl (vbr1, vbr2, cbr, quality), targetBitrate and maxBitrate in Mb/s, quality 0 to 100, keyframeDistance (frames), hardware (auto, on, off), colorSpace (rec709, rec2020, rec2100pq, rec2100hlg, rec601...), hdr10 with maxCLL and maxFALL, alpha, sequence (image sequences), startNumber, loop (GIF). H.264 and HEVC use the hardware encoder when one works (formats {format} shows which); vbr2 needs a software encoder.

### audio

audio: codec (aac, pcm, mp3, opus, flac, ac3...), sampleRate, channels (mono, stereo, 5.1, 7.1, source, discrete), bitrate (kb/s), bitDepth (16, 24, 32), float. Loudness is an effect: effects.loudness {enabled, standard: ebu-r128|atsc-a85|itu-bs1770|custom, target LUFS, truePeak dBTP, lra, mode twopass, report (XML beside the file), limiter {enabled, lookahead ms, release ms}}.

### effects

effects (Media Encoder's Effects tab): lut {enabled, path (.cube, see lut.list), intensity}; sdrConform {enabled, brightness, contrast, knee, peak} turns HDR (PQ or HLG) into SDR Rec. 709; imageOverlay {enabled, path, position, offsetX, offsetY, size %, absolute, opacity}; nameOverlay {enabled, prefix, suffix, source: fileName|outputName, position, size, color, background}; textOverlay {enabled, text, position, ...}; timecodeOverlay {enabled, source: media|generate, start, offsetFrames, frameRate, position, ...}; timeTuner {enabled, percent (-10 to 10) or targetDuration (s), skipSlates (s)}; videoLimiter {enabled, min, max (percent of legal range), compression}; loudness (see audio). Positions: topLeft, topCenter, topRight, centerLeft, center, centerRight, bottomLeft, bottomCenter, bottomRight. Look with preview_frame after turning one on.

### captions

captions {mode: none|burnin|sidecar|embed, source: auto (a .srt/.vtt/.scc/.ttml beside the source, then an embedded caption stream) or a path, format (sidecar: srt, vtt, scc, ttml), language, size, color, background, position: bottom|top}. embed works in mp4, mov, mkv and webm; elsewhere a sidecar is written. captions.read {path} and captions.convert {path, to} work on files.

### metadata

metadata {mode: retain|clear|custom, fields {title, artist, author, comment, description, copyright, keywords, album, genre, date}, xmpSidecar (an .xmp beside the file)}.

### publish

publish is a list of destinations run after the encode: {type: folder, path, deleteLocal}, {type: ftp, host, port, user, password, remotePath, tls, retries}, {type: s3, endpoint, region, bucket, prefix, accessKey, secretKey}, {type: webhook, url, secret} (POSTs JSON, signed with HMAC-SHA256 in x-formencoder-signature), {type: family, app: formcut|formvfx, project} (imports the file there). Results show on the output (encode.report).

### watch

watch.add {folder, preset or outputs, kind: encode|analysis, moveSources (default true)}: files dropped in the folder are queued with its outputs and encoded when Auto-Encode Watch Folders is on (queue.autoEncodeWatch {enabled}); outputs go to an Output subfolder, originals move to Source/[date-time]. Image sequences are recognised. watch.addOutput, watch.setOutput, watch.removeOutput, watch.setActive, watch.remove, watch.scan.

### ingest

ingest.copy {paths (files or card folders), destination, verify: size|md5|bit, preset (an ingest preset or any encoding preset to also transcode), transcodeFolder}. proxy.create {paths, preset (proxy presets: system/proxy-prores, system/proxy-h264-720...)} writes [source]_Proxy files in a Proxies folder. analyze.media {paths} writes a .feanalysis.json with scene changes, black frames, silences and loudness.

### family

family {action: discover} reports which of formcut (8040), formvfx (8230), formwav (8060) and formvis (8190) are running. family {action: sources, app}. family {action: add, app, id or name, preset, in, out, start}: formcut exports the project through its own renderer then formencoder encodes it; formvfx comps are pulled frame by frame over Dynamic Link (no render in formvfx) with their audio; formwav sessions are mixed by formwav; formvis images become stills or sequences. A .fvxlink file: family {action: addLink, path}. family {action: send, app: formcut|formvfx, files} imports finished files there.

### presets

presets {action: list, query, category} · get {preset} · create {name, settings or fromOutput, group, comment} · update {preset, name, settings, group} · delete · duplicate {preset, name} · alias {preset, alias} · import {path} (.fepreset, JSON, or a Media Encoder .epr: format, frame size, rate, bitrates and sample rate are read) · export {preset, path}. User presets live in the formencoder data folder as .fepreset JSON.

### ui

ui {action: state} is what the person sees. ui {action: panel, panel: queue|encoding|watch|media|presets|family|log|info|terminal|agents}; ui {action: workspace, name: Default|Encoding|Ingest|Agent}; ui {action: exportSettings, output} opens the Export Settings window on an output; ui {action: toast, text} shows a message.

## The same surface from a shell

- `formencoder encode FILE... --preset ID --folder DIR` · queue, encode, wait and print the results (like `encode`)
- `formencoder queue` · the queue with every output's status (like `queue {action: list}`)
- `formencoder commands FILTER` · list commands (like `list_commands`)
- `formencoder describe ID` · one command with its schema (like `describe_command`)
- `formencoder exec ID 'JSON'` · run one command (like `execute`)
- `formencoder batch '[{"command": ID, "params": {}}]'` · several as one undo step (like `batch`)
- `formencoder presets QUERY` · search presets (like `presets {action: list}`)
- `formencoder probe FILE` · media information (like `probe`)
- `formencoder frame OUT.png --output '#1' --time 2` or `--count 8` · a preview frame or contact sheet (like `preview_frame`, `contact_sheet`)
- `formencoder wait` · wait for the queue (like `wait`)
