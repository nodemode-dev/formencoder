# formencoder commands

Generated from the formencoder engine by `./formencoder agents sync`; do not edit by hand.

96 commands in 24 namespaces. Every menu item and button in formencoder is one of these. Run one with `execute {command, params}` over MCP, several as one undo step with `batch`, or `formencoder exec ID 'JSON'` from a shell. `describe_command ID` returns the JSON Schema. In the summaries `?` marks an optional parameter and `a|b` lists the accepted values. `refs` takes output ids, item ids, `#n` (the nth queue item), `selected` or `all`. Unknown parameters are refused with the schema in the message.

## Contents

`queue` (26) `encode` (5) `preset` (11) `format` (3) `watch` (9) `ingest` (1) `proxy` (1) `analyze` (1) `media` (3) `captions` (4) `lut` (2) `family` (2) `publish` (1) `log` (2) `prefs` (5) `edit` (2) `history` (1) `ui` (4) `app` (2) `settings` (1) `metadata` (3) `plugin` (3) `shortcuts` (3) `tools` (1)

## queue

- `queue.list` Queue · Window · Cmd+1 · query
  Every queue item with its outputs, status and progress.
- `queue.addSource` Add Source · File · Cmd+I · undoable
  `{paths: array, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., settings?: object, folder?: string, outputs?: array, stitch?: boolean, frameRate?: number, start?: boolean}`
  Adds files to the queue, each with one output (preset or format, default Match Source - High bitrate) or the outputs given. stitch joins them into one source. A numbered image (frame_0001.png) with frameRate adds the whole image sequence.
- `queue.addFolder` Add Folder · File · undoable
  `{folder: string, recursive?: boolean, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., kinds?: array}`
  Adds every media file of a folder.
- `queue.addOutput` Add Output · Queue · undoable
  `{item: string, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., settings?: object, folder?: string, path?: string}`
  Adds an output to a queue item: a preset or format, or with neither a copy of the item's last output.
- `queue.duplicate` Duplicate · Edit · Cmd+D · undoable
  `{refs: array|string}`
- `queue.remove` Clear · Edit · Delete · undoable
  `{refs: array|string}`
  Removes outputs, or whole items when an item is named.
- `queue.clearDone` Clear Completed · Queue · undoable
- `queue.setPreset` Apply Preset · Preset · Cmd+U · undoable
  `{refs: array|string, preset: string}`
  Applies a preset to outputs; their folder, file name and source range are kept.
- `queue.setFormat` Set Format · Queue · undoable
  `{refs: array|string, format: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|...}`
- `queue.setSettings` Export Settings · Edit · Cmd+E · undoable
  `{refs: array|string, settings: object, replace?: boolean}`
  Changes export settings: settings is merged into each output's settings (nested, or dotted keys such as video.targetBitrate); replace swaps the whole object. format.describe lists the fields of a format.
- `queue.getSettings` Output Settings · Queue · query
  `{output: string}`
  One output's complete export settings, its summary, its file and its source.
- `queue.setOutput` Set Output File · Queue · undoable
  `{refs: array|string, path?: string, folder?: string, name?: string}`
  Sets one output's file (path), the folder of several outputs at once, or the output name template ({source} {preset} {format} {date} {time} {width} {height} {fps} {index}).
- `queue.setRange` Set Source Range · Queue · undoable
  `{refs: array|string, mode?: entire|inout|custom|workArea, in?: number, out?: number}`
  In and out points in source seconds.
- `queue.interpret` Interpret Footage · File · undoable
  `{item: string, frameRate?: number, pixelAspect?: string, fieldOrder?: source|progressive|tff|bff, alpha?: source|ignore|straight|premultiplied|invert, rotation?: integer, rawExposure?: number, rawTransfer?: rec709|linear}`
  Overrides how a source is read. rawExposure (stops) and rawTransfer develop camera raw (CinemaDNG and other Bayer sources): the default is Rec. 709 at 0 stops.
- `queue.reorder` Move In Queue · Queue · undoable
  `{item: string, to: integer}`
  Moves an item to a 1-based position.
- `queue.skip` Skip Selection · Edit · undoable
  `{refs: array|string, skip?: boolean}`
- `queue.resetStatus` Reset Status · Edit · Cmd+.
  `{refs: array|string}`
  Returns outputs to Ready so they encode again.
- `queue.start` Start Queue · Queue · Enter
  Starts or resumes encoding.
- `queue.pause` Pause Queue · Queue
- `queue.stop` Stop Queue · Queue · Escape
- `queue.stopCurrent` Stop Current Item · Queue · Cmd+-
  `{refs?: array|string}`
- `queue.autoEncodeWatch` Auto-Encode Watch Folders · Queue
  `{enabled: boolean}`
- `queue.stitch` Stitch Clips Together · File · undoable
  `{paths: array, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., settings?: object, folder?: string, start?: boolean}`
  Joins clips, in the order given, into one source with one output; sizes and rates follow the first clip.
- `queue.select` Select · Edit · query
  `{items?: array, outputs?: array}`
- `queue.save` Save Queue · File · Cmd+S · query
  `{path?: string}`
- `queue.open` Open Queue · File · undoable
  `{path: string, append?: boolean}`

## encode

- `encode.status` Encoding · Window · Cmd+2 · query
  The outputs being encoded now with progress, speed and time remaining.
- `encode.report` Output Report · Queue · query
  `{outputs?: array}`
  Final status, file, sidecars, loudness, publish results and errors of outputs.
- `encode.estimate` Estimated File Size · Queue · query
  `{output: string}`
- `encode.command` Show FFmpeg Command · Queue · query
  `{output: string}`
  The ffmpeg command line an output would run (Time Tuner analysis left out).
- `encode.verify` Verify Output · Queue · query
  `{path?: string, output?: string, loudness?: boolean}`
  Probes an encoded file and checks it against its settings: size, rate, duration, codecs, sample rate, loudness.

## preset

- `preset.list` Preset Browser · Window · Cmd+3 · query
  `{query?: string, category?: string, kind?: encode|ingest}`
- `preset.get` Preset Settings · Preset · query
  `{preset: string}`
- `preset.create` Create Encoding Preset · Preset · Cmd+N
  `{name: string, settings?: object, fromOutput?: string, group?: string, comment?: string}`
  Saves a user preset from settings or from an output's export settings, effects and publish settings included.
- `preset.update` Edit Preset · Preset
  `{preset: string, name?: string, settings?: object, group?: string, comment?: string}`
- `preset.delete` Delete Preset · Preset
  `{preset: string}`
- `preset.duplicate` Save A Copy · Preset
  `{preset: string, name?: string}`
- `preset.newGroup` Create Group · Preset · Cmd+G
  `{name: string}`
- `preset.alias` Create Alias · Preset
  `{preset: string, alias?: string}`
- `preset.import` Import Preset · Preset
  `{path: string, group?: string}`
  Imports a .fepreset, a JSON settings file, or a Media Encoder .epr (format, frame size, frame rate, bitrates and sample rate are read).
- `preset.export` Export Preset · Preset
  `{preset: string, path: string}`
- `preset.reveal` Reveal Preset Folder · Preset · query

## format

- `format.list` Formats · Window · query
- `format.describe` Format Settings · Window · query
  `{format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., output?: string, settings?: object}`
  The export settings fields of a format (or an output's, or of a settings object) with keys, types and options, its codecs and the encoders this machine has for them.
- `format.encoders` Hardware And Encoders · Window · query
  `{refresh?: boolean}`

## watch

- `watch.list` Watch Folders · Window · Cmd+4 · query
- `watch.add` Add Watch Folder · File · Cmd+Alt+I · undoable
  `{folder: string, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., outputs?: array, kind?: encode|analysis, frameRate?: number, moveSources?: boolean}`
  Watches a folder: dropped media is queued with the folder's outputs and encoded (Auto-Encode Watch Folders); outputs go to an Output subfolder and originals move to Source/[date-time].
- `watch.remove` Remove Watch Folder · Watch · undoable
  `{watch: string}`
- `watch.setActive` Watch Folder Active · Watch · undoable
  `{watch: string, active: boolean}`
- `watch.chain` Chain Watch Folder · Watch · undoable
  `{watch: string, to?: string|null}`
  Sends a watch folder's outputs (those without their own folder) into another watch folder, which then encodes them with its own outputs; to null ends the chain. Loops are refused.
- `watch.addOutput` Add Watch Folder Output · Watch · undoable
  `{watch: string, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., settings?: object, folder?: string}`
- `watch.setOutput` Watch Folder Output Settings · Watch · undoable
  `{output: string, preset?: string, settings?: object, folder?: string}`
- `watch.removeOutput` Remove Watch Folder Output · Watch · undoable
  `{output: string}`
- `watch.scan` Scan Watch Folders Now · Watch
  Queues what is in the active watch folders now, without waiting for files to settle.

## ingest

- `ingest.copy` Ingest · File · undoable
  `{paths: array, destination: string, verify?: size|md5|bit, preset?: string, transcodeFolder?: string, start?: boolean}`
  Copies camera media (files or card folders) with verification, and with a preset also transcodes (an ingest preset or any encoding preset).

## proxy

- `proxy.create` Create Proxies · File · undoable
  `{paths: array, preset?: string, folder?: string, start?: boolean}`
  Queues proxies into a Proxies folder beside each source, named [source]_Proxy.

## analyze

- `analyze.media` Analyze Media · File · undoable
  `{paths: array, start?: boolean}`
  Queues analysis: a .feanalysis.json sidecar with scene changes, black frames, silences and loudness.

## media

- `media.roots` Media Browser Locations · Window · query
- `media.browse` Media Browser · Window · Cmd+5 · query
  `{path: string, filter?: all|video|audio|image|media, query?: string, probe?: boolean}`
- `media.probe` Media Info · Window · query
  `{path: string, frameRate?: number, loudness?: boolean}`

## captions

- `captions.transcribe` Speech to Text · File · undoable
  `{paths: array, model?: tiny|tiny.en|base|base.en|small|small.en|medium|large-v3-turbo, language?: string, translate?: boolean, formats?: array, folder?: string, overwrite?: boolean, start?: boolean}`
  Queues speech to text with whisper.cpp: an .srt (and .vtt, .txt or .json) transcript beside each source, which Captions then finds for burn-in, embedding or sidecars. language is a code such as en or auto; translate makes English; model is one of captions.models.
- `captions.models` Speech Models · File · query
  The whisper.cpp speech models, which are downloaded, where they live, and whether whisper-cli is installed.
- `captions.read` Read Captions · File · query
  `{path: string}`
- `captions.convert` Convert Captions · File
  `{path: string, to: srt|vtt|scc|ttml, output?: string}`

## lut

- `lut.list` LUTs · Effects · query
- `lut.install` Install LUT · Effects
  `{path: string}`

## family

- `family.queue` Queue Family Source · File · undoable
  `{spec: object, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., settings?: object, folder?: string, outputs?: array, start?: boolean}`
  Queues a source described by the family bridge (family.add finds it in the app and calls this).
- `family.resolved` Family Media Ready · File · query
  `{output: string, media?: object, error?: string}`
  The service hands a waiting output the media the family app produced.

## publish

- `publish.result` Publish Result · Publish
  `{output: string, results: array}`

## log

- `log.read` Show Log · File · Cmd+L · query
  `{kind?: encoding|error, limit?: integer}`
- `log.clear` Clear Log · File
  `{kind: encoding|error}`

## prefs

- `prefs.get` Preferences · Edit · Cmd+, · query
- `prefs.set` Set Preferences · Edit
  `{values: object}`
- `prefs.reset` Reset Preferences · Edit
- `prefs.cacheInfo` Media Cache · Edit · query
  The media cache folder, its size and file count, the cache limit, and the memory free and reserved.
- `prefs.cleanCache` Clean Media Cache · Edit
  `{all?: boolean}`
  Removes the oldest cache files until the cache is under its limit (all: everything not in use by a running encode).

## edit

- `edit.undo` Undo · Edit · Cmd+Z
- `edit.redo` Redo · Edit · Cmd+Shift+Z

## history

- `history.list` History · Edit · query

## ui

- `ui.panel` Show Panel · Window · query
  `{panel: queue|encoding|watch|media|presets|family|log|info|terminal|agents}`
- `ui.workspace` Workspace · Window · query
  `{name: Default|Encoding|Ingest|Agent}`
- `ui.exportSettings` Open Export Settings · Window · query
  `{output: string}`
- `ui.toast` Show Message · Window · query
  `{text: string, kind?: info|ok|error}`

## app

- `app.capabilities` About formencoder · Help · query
- `app.status` Status · Help · query

## settings

- `settings.apply` Apply Settings Patch · query
  `{settings: object, patch?: object, output?: string}`
  Normalises settings and applies a patch to them without touching the queue (format switches keep range, effects and publish); with output, also the summary and estimated size against that output's source.

## metadata

- `metadata.templates` Metadata Templates · Metadata · query
  Saved metadata templates and the categories metadata.rules keep or drop (descriptive, rights, dates, camera, location).
- `metadata.saveTemplate` Save Metadata Template · Metadata
  `{name: string, fields?: object, fromOutput?: string}`
  Saves fields (or an output's metadata fields) as a named template that outputs apply with metadata.template.
- `metadata.deleteTemplate` Delete Metadata Template · Metadata
  `{name: string}`

## plugin

- `plugin.list` Plug-ins · query
  Installed plug-ins (folders with a plugin.json in the data folder's plugins folder or FORMENCODER_PLUGINS): their events, commands, options and any problems with their manifests.
- `plugin.run` Run Plug-in Command
  `{plugin: string, command?: string, params?: object}`
  Starts one of a plug-in's commands in the background and returns its run id; plugin.result shows its progress and result.
- `plugin.result` Plug-in Run · query
  `{run: string}`
  A plug-in command run: running, done with its result, or failed with its error.

## shortcuts

- `shortcuts.list` Keyboard Shortcuts · query
  Every menu command with its shortcut now and its default, and the keys kept for the app itself.
- `shortcuts.set` Set Keyboard Shortcut
  `{command: string, shortcut?: string|null, force?: boolean}`
  Changes one command's shortcut. A shortcut another command already uses is refused unless force, which takes it from that command.
- `shortcuts.reset` Reset Keyboard Shortcuts
  Puts every shortcut back to its default.

## tools

- `tools.list` Delivery Tools · Edit · query
  The separate programs formencoder drives for packaged deliverables (bmx for AS-10, AS-11 and P2; asdcplib and OpenJPEG for DCP): version, licence, what each is for and where it was found.
