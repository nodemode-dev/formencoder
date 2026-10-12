# formencoder commands

Generated from the formencoder engine by `./formencoder agents sync`; do not edit by hand.

96 commands in 24 namespaces. Every menu item and button in formencoder is one of these. Run one over MCP with its own tool (the `MCP` name on each line, in the full profile) or `execute {command, params}` (every profile), several as one undo step with `batch`, or from a shell as `./formencoder ID --name value` (`--help` after the id lists the flags). `describe_command ID` returns the JSON Schema. In the summaries `?` marks an optional parameter and `a|b` lists the accepted values. `refs` takes output ids, item ids, `#n` (the nth queue item), `selected` or `all`. Unknown parameters are refused with the schema in the message.

## Contents

`queue` (26) `encode` (5) `preset` (11) `format` (3) `watch` (9) `ingest` (1) `proxy` (1) `analyze` (1) `media` (3) `captions` (4) `lut` (2) `family` (2) `publish` (1) `log` (2) `prefs` (5) `edit` (2) `history` (1) `ui` (4) `app` (2) `settings` (1) `metadata` (3) `plugin` (3) `shortcuts` (3) `tools` (1)

## queue

- `queue.list` Queue · Window · Cmd+1 · query · MCP `queue_list`
  Every queue item with its outputs, status and progress.
- `queue.addSource` Add Source · File · Cmd+I · undoable · MCP `queue_add_source`
  `{paths: array, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., settings?: object, folder?: string, outputs?: array, stitch?: boolean, frameRate?: number, start?: boolean}`
  Adds files to the queue, each with one output (preset or format, default Match Source - High bitrate) or the outputs given. stitch joins them into one source. A numbered image (frame_0001.png) with frameRate adds the whole image sequence.
- `queue.addFolder` Add Folder · File · undoable · MCP `queue_add_folder`
  `{folder: string, recursive?: boolean, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., kinds?: array}`
  Adds every media file of a folder.
- `queue.addOutput` Add Output · Queue · undoable · MCP `queue_add_output`
  `{item: string, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., settings?: object, folder?: string, path?: string}`
  Adds an output to a queue item: a preset or format, or with neither a copy of the item's last output.
- `queue.duplicate` Duplicate · Edit · Cmd+D · undoable · MCP `queue_duplicate`
  `{refs: array|string}`
- `queue.remove` Clear · Edit · Delete · undoable, destructive · MCP `queue_remove`
  `{refs: array|string}`
  Removes outputs, or whole items when an item is named.
- `queue.clearDone` Clear Completed · Queue · undoable, destructive · MCP `queue_clear_done`
- `queue.setPreset` Apply Preset · Preset · Cmd+U · undoable · MCP `queue_set_preset`
  `{refs: array|string, preset: string}`
  Applies a preset to outputs; their folder, file name and source range are kept.
- `queue.setFormat` Set Format · Queue · undoable · MCP `queue_set_format`
  `{refs: array|string, format: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|...}`
- `queue.setSettings` Export Settings · Edit · Cmd+E · undoable · MCP `queue_set_settings`
  `{refs: array|string, settings: object, replace?: boolean}`
  Changes export settings: settings is merged into each output's settings (nested, or dotted keys such as video.targetBitrate); replace swaps the whole object. format.describe lists the fields of a format.
- `queue.getSettings` Output Settings · Queue · query · MCP `queue_get_settings`
  `{output: string}`
  One output's complete export settings, its summary, its file and its source.
- `queue.setOutput` Set Output File · Queue · undoable · MCP `queue_set_output`
  `{refs: array|string, path?: string, folder?: string, name?: string}`
  Sets one output's file (path), the folder of several outputs at once, or the output name template ({source} {preset} {format} {date} {time} {width} {height} {fps} {index}).
- `queue.setRange` Set Source Range · Queue · undoable · MCP `queue_set_range`
  `{refs: array|string, mode?: entire|inout|custom|workArea, in?: number, out?: number}`
  In and out points in source seconds.
- `queue.interpret` Interpret Footage · File · undoable · MCP `queue_interpret`
  `{item: string, frameRate?: number, pixelAspect?: string, fieldOrder?: source|progressive|tff|bff, alpha?: source|ignore|straight|premultiplied|invert, rotation?: integer, rawExposure?: number, rawTransfer?: rec709|linear}`
  Overrides how a source is read. rawExposure (stops) and rawTransfer develop camera raw (CinemaDNG and other Bayer sources): the default is Rec. 709 at 0 stops.
- `queue.reorder` Move In Queue · Queue · undoable · MCP `queue_reorder`
  `{item: string, to: integer}`
  Moves an item to a 1-based position.
- `queue.skip` Skip Selection · Edit · undoable · MCP `queue_skip`
  `{refs: array|string, skip?: boolean}`
- `queue.resetStatus` Reset Status · Edit · Cmd+. · MCP `queue_reset_status`
  `{refs: array|string}`
  Returns outputs to Ready so they encode again.
- `queue.start` Start Queue · Queue · Enter · MCP `queue_start`
  Starts or resumes encoding.
- `queue.pause` Pause Queue · Queue · MCP `queue_pause`
- `queue.stop` Stop Queue · Queue · Escape · MCP `queue_stop`
- `queue.stopCurrent` Stop Current Item · Queue · Cmd+- · MCP `queue_stop_current`
  `{refs?: array|string}`
- `queue.autoEncodeWatch` Auto-Encode Watch Folders · Queue · MCP `queue_auto_encode_watch`
  `{enabled: boolean}`
- `queue.stitch` Stitch Clips Together · File · undoable · MCP `queue_stitch`
  `{paths: array, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., settings?: object, folder?: string, start?: boolean}`
  Joins clips, in the order given, into one source with one output; sizes and rates follow the first clip.
- `queue.select` Select · Edit · query · MCP `queue_select`
  `{items?: array, outputs?: array}`
- `queue.save` Save Queue · File · Cmd+S · query · MCP `queue_save`
  `{path?: string}`
- `queue.open` Open Queue · File · undoable, destructive · MCP `queue_open`
  `{path: string, append?: boolean}`

## encode

- `encode.status` Encoding · Window · Cmd+2 · query · MCP `encode_status`
  The outputs being encoded now with progress, speed and time remaining.
- `encode.report` Output Report · Queue · query · MCP `encode_report`
  `{outputs?: array}`
  Final status, file, sidecars, loudness, publish results and errors of outputs.
- `encode.estimate` Estimated File Size · Queue · query · MCP `encode_estimate`
  `{output: string}`
- `encode.command` Show FFmpeg Command · Queue · query · MCP `encode_command`
  `{output: string}`
  The ffmpeg command line an output would run (Time Tuner analysis left out).
- `encode.verify` Verify Output · Queue · query · MCP `encode_verify`
  `{path?: string, output?: string, loudness?: boolean}`
  Probes an encoded file and checks it against its settings: size, rate, duration, codecs, sample rate, loudness.

## preset

- `preset.list` Preset Browser · Window · Cmd+3 · query · MCP `preset_list`
  `{query?: string, category?: string, kind?: encode|ingest}`
- `preset.get` Preset Settings · Preset · query · MCP `preset_get`
  `{preset: string}`
- `preset.create` Create Encoding Preset · Preset · Cmd+N · MCP `preset_create`
  `{name: string, settings?: object, fromOutput?: string, group?: string, comment?: string}`
  Saves a user preset from settings or from an output's export settings, effects and publish settings included.
- `preset.update` Edit Preset · Preset · MCP `preset_update`
  `{preset: string, name?: string, settings?: object, group?: string, comment?: string}`
- `preset.delete` Delete Preset · Preset · destructive · MCP `preset_delete`
  `{preset: string}`
- `preset.duplicate` Save A Copy · Preset · MCP `preset_duplicate`
  `{preset: string, name?: string}`
- `preset.newGroup` Create Group · Preset · Cmd+G · MCP `preset_new_group`
  `{name: string}`
- `preset.alias` Create Alias · Preset · MCP `preset_alias`
  `{preset: string, alias?: string}`
- `preset.import` Import Preset · Preset · MCP `preset_import`
  `{path: string, group?: string}`
  Imports a .fepreset, a JSON settings file, or a Media Encoder .epr (format, frame size, frame rate, bitrates and sample rate are read).
- `preset.export` Export Preset · Preset · MCP `preset_export`
  `{preset: string, path: string}`
- `preset.reveal` Reveal Preset Folder · Preset · query · MCP `preset_reveal`

## format

- `format.list` Formats · Window · query · MCP `format_list`
- `format.describe` Format Settings · Window · query · MCP `format_describe`
  `{format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., output?: string, settings?: object}`
  The export settings fields of a format (or an output's, or of a settings object) with keys, types and options, its codecs and the encoders this machine has for them.
- `format.encoders` Hardware And Encoders · Window · query · MCP `format_encoders`
  `{refresh?: boolean}`

## watch

- `watch.list` Watch Folders · Window · Cmd+4 · query · MCP `watch_list`
- `watch.add` Add Watch Folder · File · Cmd+Alt+I · undoable · MCP `watch_add`
  `{folder: string, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., outputs?: array, kind?: encode|analysis, frameRate?: number, moveSources?: boolean}`
  Watches a folder: dropped media is queued with the folder's outputs and encoded (Auto-Encode Watch Folders); outputs go to an Output subfolder and originals move to Source/[date-time].
- `watch.remove` Remove Watch Folder · Watch · undoable, destructive · MCP `watch_remove`
  `{watch: string}`
- `watch.setActive` Watch Folder Active · Watch · undoable · MCP `watch_set_active`
  `{watch: string, active: boolean}`
- `watch.chain` Chain Watch Folder · Watch · undoable · MCP `watch_chain`
  `{watch: string, to?: string|null}`
  Sends a watch folder's outputs (those without their own folder) into another watch folder, which then encodes them with its own outputs; to null ends the chain. Loops are refused.
- `watch.addOutput` Add Watch Folder Output · Watch · undoable · MCP `watch_add_output`
  `{watch: string, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., settings?: object, folder?: string}`
- `watch.setOutput` Watch Folder Output Settings · Watch · undoable · MCP `watch_set_output`
  `{output: string, preset?: string, settings?: object, folder?: string}`
- `watch.removeOutput` Remove Watch Folder Output · Watch · undoable, destructive · MCP `watch_remove_output`
  `{output: string}`
- `watch.scan` Scan Watch Folders Now · Watch · MCP `watch_scan`
  Queues what is in the active watch folders now, without waiting for files to settle.

## ingest

- `ingest.copy` Ingest · File · undoable · MCP `ingest_copy`
  `{paths: array, destination: string, verify?: size|md5|bit, preset?: string, transcodeFolder?: string, start?: boolean}`
  Copies camera media (files or card folders) with verification, and with a preset also transcodes (an ingest preset or any encoding preset).

## proxy

- `proxy.create` Create Proxies · File · undoable · MCP `proxy_create`
  `{paths: array, preset?: string, folder?: string, start?: boolean}`
  Queues proxies into a Proxies folder beside each source, named [source]_Proxy.

## analyze

- `analyze.media` Analyze Media · File · undoable · MCP `analyze_media`
  `{paths: array, start?: boolean}`
  Queues analysis: a .feanalysis.json sidecar with scene changes, black frames, silences and loudness.

## media

- `media.roots` Media Browser Locations · Window · query · MCP `media_roots`
- `media.browse` Media Browser · Window · Cmd+5 · query · MCP `media_browse`
  `{path: string, filter?: all|video|audio|image|media, query?: string, probe?: boolean}`
- `media.probe` Media Info · Window · query · MCP `media_probe`
  `{path: string, frameRate?: number, loudness?: boolean}`

## captions

- `captions.transcribe` Speech to Text · File · undoable · MCP `captions_transcribe`
  `{paths: array, model?: tiny|tiny.en|base|base.en|small|small.en|medium|large-v3-turbo, language?: string, translate?: boolean, formats?: array, folder?: string, overwrite?: boolean, start?: boolean}`
  Queues speech to text with whisper.cpp: an .srt (and .vtt, .txt or .json) transcript beside each source, which Captions then finds for burn-in, embedding or sidecars. language is a code such as en or auto; translate makes English; model is one of captions.models.
- `captions.models` Speech Models · File · query · MCP `captions_models`
  The whisper.cpp speech models, which are downloaded, where they live, and whether whisper-cli is installed.
- `captions.read` Read Captions · File · query · MCP `captions_read`
  `{path: string}`
- `captions.convert` Convert Captions · File · MCP `captions_convert`
  `{path: string, to: srt|vtt|scc|ttml, output?: string}`

## lut

- `lut.list` LUTs · Effects · query · MCP `lut_list`
- `lut.install` Install LUT · Effects · MCP `lut_install`
  `{path: string}`

## family

- `family.queue` Queue Family Source · File · undoable · MCP `family_queue`
  `{spec: object, preset?: string, format?: h264|hevc|av1|webm|quicktime|prores|prores_mxf|dnxhr_mxf|mxf_op1a|jpeg2000_mxf|as10|as11|..., settings?: object, folder?: string, outputs?: array, start?: boolean}`
  Queues a source described by the family bridge (family.add finds it in the app and calls this).
- `family.resolved` Family Media Ready · File · query · MCP `family_resolved`
  `{output: string, media?: object, error?: string}`
  The service hands a waiting output the media the family app produced.

## publish

- `publish.result` Publish Result · Publish · MCP `publish_result`
  `{output: string, results: array}`

## log

- `log.read` Show Log · File · Cmd+L · query · MCP `log_read`
  `{kind?: encoding|error, limit?: integer}`
- `log.clear` Clear Log · File · destructive · MCP `log_clear`
  `{kind: encoding|error}`

## prefs

- `prefs.get` Preferences · Edit · Cmd+, · query · MCP `prefs_get`
- `prefs.set` Set Preferences · Edit · MCP `prefs_set`
  `{values: object}`
- `prefs.reset` Reset Preferences · Edit · destructive · MCP `prefs_reset`
- `prefs.cacheInfo` Media Cache · Edit · query · MCP `prefs_cache_info`
  The media cache folder, its size and file count, the cache limit, and the memory free and reserved.
- `prefs.cleanCache` Clean Media Cache · Edit · destructive · MCP `prefs_clean_cache`
  `{all?: boolean}`
  Removes the oldest cache files until the cache is under its limit (all: everything not in use by a running encode).

## edit

- `edit.undo` Undo · Edit · Cmd+Z · MCP `edit_undo`
- `edit.redo` Redo · Edit · Cmd+Shift+Z · MCP `edit_redo`

## history

- `history.list` History · Edit · query · MCP `history_list`

## ui

- `ui.panel` Show Panel · Window · query · MCP `ui_panel`
  `{panel: queue|encoding|watch|media|presets|family|log|info|terminal|agents}`
- `ui.workspace` Workspace · Window · query · MCP `ui_workspace`
  `{name: Default|Encoding|Ingest|Agent}`
- `ui.exportSettings` Open Export Settings · Window · query · MCP `ui_export_settings`
  `{output: string}`
- `ui.toast` Show Message · Window · query · MCP `ui_toast`
  `{text: string, kind?: info|ok|error}`

## app

- `app.capabilities` About formencoder · Help · query · MCP `app_capabilities`
- `app.status` Status · Help · query · MCP `app_status`

## settings

- `settings.apply` Apply Settings Patch · query · MCP `settings_apply`
  `{settings: object, patch?: object, output?: string}`
  Normalises settings and applies a patch to them without touching the queue (format switches keep range, effects and publish); with output, also the summary and estimated size against that output's source.

## metadata

- `metadata.templates` Metadata Templates · Metadata · query · MCP `metadata_templates`
  Saved metadata templates and the categories metadata.rules keep or drop (descriptive, rights, dates, camera, location).
- `metadata.saveTemplate` Save Metadata Template · Metadata · MCP `metadata_save_template`
  `{name: string, fields?: object, fromOutput?: string}`
  Saves fields (or an output's metadata fields) as a named template that outputs apply with metadata.template.
- `metadata.deleteTemplate` Delete Metadata Template · Metadata · destructive · MCP `metadata_delete_template`
  `{name: string}`

## plugin

- `plugin.list` Plug-ins · query · MCP `plugin_list`
  Installed plug-ins (folders with a plugin.json in the data folder's plugins folder or FORMENCODER_PLUGINS): their events, commands, options and any problems with their manifests.
- `plugin.run` Run Plug-in Command · MCP `plugin_run`
  `{plugin: string, command?: string, params?: object}`
  Starts one of a plug-in's commands in the background and returns its run id; plugin.result shows its progress and result.
- `plugin.result` Plug-in Run · query · MCP `plugin_result`
  `{run: string}`
  A plug-in command run: running, done with its result, or failed with its error.

## shortcuts

- `shortcuts.list` Keyboard Shortcuts · query · MCP `shortcuts_list`
  Every menu command with its shortcut now and its default, and the keys kept for the app itself.
- `shortcuts.set` Set Keyboard Shortcut · MCP `shortcuts_set`
  `{command: string, shortcut?: string|null, force?: boolean}`
  Changes one command's shortcut. A shortcut another command already uses is refused unless force, which takes it from that command.
- `shortcuts.reset` Reset Keyboard Shortcuts · destructive · MCP `shortcuts_reset`
  Puts every shortcut back to its default.

## tools

- `tools.list` Delivery Tools · Edit · query · MCP `tools_list`
  The separate programs formencoder drives for packaged deliverables (bmx for AS-10, AS-11 and P2; asdcplib and OpenJPEG for DCP): version, licence, what each is for and where it was found.
