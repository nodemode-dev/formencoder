# formencoder concepts

Read once per session. Everything here holds for the MCP tools, `execute`, `batch` and the `formencoder` command line alike.

## Contents

- Ids and refs
- The settings object
- Patches
- Time
- Results
- Errors
- Status values
- Where files go

## Ids and refs

- Items have ids that start with `i` (`ifcefb6001`), outputs ids that start with `o` (`ofcf112002`), watch folders ids that start with `w`. Never invent one: take it from the result that created it, from `queue {action: list}` or from `status`.
- `refs` is a list (or one string) of: an output id, an item id (all of its outputs), `#n` (the outputs of the nth item, counting from 1 in queue order), `selected` (what the person selected in the Queue panel) or `all`.
- Where a tool takes one `output`, `#n` means the first output of the nth item.
- Presets are `system/...`, `ingest/...` or `user/...` (a preset the person or you made, `user/mine-fd88c4`). Formats are short ids such as `h264`, `hevc`, `prores`, `dnxhr_mxf`, `mxf_op1a`, `wav`, `png` (`formats` lists all 33).

## The settings object

An output's export settings are one JSON object:

```json
{
  "format": "h264",
  "outputName": "{source}",
  "exportVideo": true,
  "exportAudio": true,
  "video": {"codec": "h264", "width": 1920, "height": 1080, "frameRate": null, "rateControl": "vbr1", "targetBitrate": 16, "maxBitrate": 20},
  "audio": {"codec": "aac", "sampleRate": 48000, "channels": "stereo", "bitrate": 320},
  "multiplexer": {"container": "mp4", "fastStart": true},
  "range": {"mode": "entire"},
  "crop": {"left": 0, "top": 0, "right": 0, "bottom": 0},
  "rotation": 0,
  "scaling": "fit",
  "effects": {"lut": {"enabled": false}, "loudness": {"enabled": false}},
  "captions": {"mode": "none"},
  "metadata": {"mode": "retain"},
  "publish": []
}
```

`formats {format}` returns the full default object for any format, with every key, option and unit, and the encoders this machine has. `frameRate: null` and `matchSource: true` follow the source. A `width` or `height` of `null` keeps the source aspect.

Fields have a `showIf` condition: `video.maxBitrate` only applies when `rateControl` is `vbr2`, `video.quality` only when it is `quality`. Setting a hidden field is accepted and ignored.

## Patches

- `export_settings {output, settings}`, `encode {settings}`, `queue.addSource {settings}` and `outputs[].settings` take a **patch**: only the keys named change, nested objects merge, everything else keeps the preset's value.
- Dotted keys work anywhere a patch is accepted: `{"video.targetBitrate": 8, "effects.loudness.enabled": true, "effects.loudness.standard": "ebu-r128"}`.
- Lists replace: `publish` given in a patch replaces the whole list. Read it first (`export_settings {output}`) when adding one destination to existing ones.
- Changing `format` keeps range, crop, scaling, effects, captions, metadata and publish, and resets video, audio and multiplexer to that format's defaults. Patch the codec settings after the format, in the same call or the next.
- `replace: true` on `export_settings` swaps the whole object. Use it only with an object read back from `export_settings` and edited.
- `settings.apply {settings, patch, output?}` is a query that merges without touching the queue: use it to check a patch first; with `output` it also returns the summary and the estimated file size against that output's source. `encode.estimate {output}` estimates a queued output.

## Time

- Ranges (`queue.setRange`, `range.in`, `range.out`, `family add in/out`) are **source seconds**.
- Preview times (`preview_frame {time}`, `contact_sheet {times}`) are **seconds from the start of the output's range**, so `time: 0` is the first frame that will be encoded.
- Durations in results are seconds; timecode is a string (`01:00:00;00` with a semicolon for drop frame).
- Frame rates are numbers (`29.97`, `23.976`, `25`); formencoder resolves them to exact rationals (`30000/1001`).

## Results

| Kind of command | Returns |
| --- | --- |
| `queue.addSource` | `{added: [{item, outputs, name}], item, output}`: the first item and output, plus every item made |
| `queue.addOutput`, `queue.duplicate` | the new `output` (or `outputs`) |
| `queue.getSettings`, `export_settings` | `{output, item, source, path, kind, settings, summary, sourceInfo}`: `summary` is the human line the queue shows, `sourceInfo` the probe |
| `preset.create`, `preset.import` | `{preset, name}` |
| Setters (`queue.setRange`, `queue.setPreset`...) | the values that were set |
| Queries | the data asked for; they never change the queue and never ask permission |
| `encode`, `wait` | per output: `status`, `file`, `error`, `notes`, and with `encode` the `verification` |

In `batch`, a string `"$N.key"` in a later step is replaced by step N's result field, counting from 1: `"$1.output"` is the output the first `queue.addSource` made.

## Errors

Errors are one sentence that says what was wrong and, where there is a fixed set, what is accepted:

```text
no preset "nope"; preset.list shows them
queue.addSource: unknown parameter bogus (schema: {paths: array, preset?: string, format?: string, settings?: object, ...})
```

Unknown parameters are refused rather than ignored, so a typo never silently does nothing. Read the message, fix the call, retry. A `batch` that fails rolls back every step and names the failing step.

An output that **fails to encode** is not an error from the tool: its status is `failed`, `error` holds the reason, and `log {kind: error}` holds FFmpeg's last lines.

## Status values

`ready` (queued, not started), `preparing` (a family source being rendered or mixed by its app, a two-pass loudness measurement), `encoding`, `paused`, `done`, `failed`, `stopped`, `skipped`.

## Where files go

- An output without a folder goes beside its source; `outputName` tokens (`{source}`, `{preset}`, `{format}`, `{date}`, `{time}`, `{width}`, `{height}`, `{fps}`, `{index}`) build the name. A name that already exists gets `_1`, `_2`: formencoder does not overwrite while the `incrementNames` preference is on (the default).
- Agents started from formencoder's Terminal panel have a workspace with a `renders` folder; prefer it for test encodes.
- Presets, logs, the saved queue, LUTs and caches live in the formencoder data folder (`~/Formencoder` unless `FORMENCODER_DATA_DIR` says otherwise).
