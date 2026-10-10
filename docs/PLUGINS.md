# formencoder plug-ins

A plug-in is a folder with a `plugin.json` and any program. formencoder runs the program as a separate process, writes one JSON request to its standard input and reads JSON lines from its standard output. Any language works; nothing is linked into formencoder.

## Where plug-ins live

- `~/Formencoder/plugins/[id]/` (the data folder's `plugins` folder; `FORMENCODER_DATA_DIR` moves it)
- every folder listed in `FORMENCODER_PLUGINS` (separated like `PATH`)

`plugin.list` shows what was found, where it looked, and any problem with a manifest. `examples/plugins/checksums` is a complete plug-in in Python with no dependencies.

## plugin.json

| Key | Meaning |
| --- | --- |
| `id` | Letters, digits, `-` and `_`. Defaults to the folder name. |
| `name`, `version`, `description` | Shown in lists. |
| `run` | The program and its arguments, as a list. A part that names a file in the plug-in folder is passed as that file's full path; `python3` becomes `python` on Windows. |
| `events` | Any of `afterEncode`, `command`, `publish`. |
| `options` | `{name: {type, options, default}}`. Defaults fill in what an output or destination leaves out. |
| `commands` | `[{name, label, params}]` for the `command` event. |

## The request

One line of JSON on standard input:

```json
{"protocol": 1, "event": "afterEncode", "plugin": {"id": "checksums", "version": "1.0.0", "folder": "/path/to/plugin"},
 "options": {"algorithm": "sha256"}, "formencoder": {"version": "0.2.0", "dataFolder": "/home/me/Formencoder"}}
```

plus, by event:

- `afterEncode`: `files` (what the output wrote), `output` (`id`, `path`, `item`), `settings` (the output's export settings)
- `command`: `command` (one of `commands[].name`), `params`
- `publish`: `files`, `context` (`source`, `output`, `preset`)

## The answer

JSON lines on standard output; anything else on that stream is ignored, and standard error is kept for the error message.

- `{"progress": 0.5, "message": "hashing"}` while working
- `{"result": {...}}` once, at the end
- `{"error": "why"}` to fail

The process must exit with 0. Results by event:

- `afterEncode`: `{"files": [...], "notes": [...]}`. Files that exist are added to the output's file list; notes show on the output.
- `command`: any JSON; `plugin.result` returns it.
- `publish`: `{"sent": [...]}`, the places the files went.

## Using a plug-in

- On an output: `"plugins": [{"id": "checksums", "options": {"algorithm": "sha1"}}]` in its export settings runs the plug-in after the encode. A failure fails the output.
- As a command: `plugin.run {plugin, command, params}` starts it in the background and returns a run id; `plugin.result {run}` reports `running`, `done` with `result`, or `failed` with `error`.
- As a publish destination: `{"type": "plugin", "plugin": "checksums", "options": {...}}`, or Publish > Add Destination > Plug-in in Export Settings.
