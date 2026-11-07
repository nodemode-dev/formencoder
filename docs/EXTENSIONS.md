# FormEncoder extensions (Form Extension Contract, API 1)

FormEncoder loads extensions made to the Form Extension Contract, API 1: a package with a `manifest.json` whose `product` is `formencoder`, a sandboxed page (`entry.ui`), and optional dock or dialog panels and commands. FormPortal installs them, form.ext makes them. This page is what is particular to FormEncoder; the contract itself (package rules, protocol, permissions, errors) is the same in every Form app.

FormEncoder's own process plug-ins (`plugin.json`, run as separate programs after an encode, as commands or as publish destinations) are a different thing and keep working as before; they are described in `docs/PLUGINS.md`.

## The document

FormEncoder's document is the queue: sources (items), each with one or more outputs, and each output with its export settings and status. `document.read` takes `what`:

| `what` | Returns |
| --- | --- |
| `queue` (the default) | the queue: items with their outputs, counts, selection, running and paused, the undo and redo labels |
| `selection` | the selected outputs (or the outputs of the selected sources) with their complete export settings |
| `watch` | the watch folders with their outputs, and whether they encode on their own |
| `presets` | every preset: id, name, category, format, frame size and rate, comment |
| `formats` | the 40 formats with their codecs |
| `history` | the undo and redo lists |

Any other value fails with -32602.

`document.read {}` on a queue with one source and one output:

```json
{
  "what": "queue",
  "revision": 1,
  "running": false,
  "paused": false,
  "counts": { "total": 1, "ready": 1, "encoding": 0, "done": 0, "failed": 0, "stopped": 0, "skipped": 0 },
  "selection": { "items": [], "outputs": [] },
  "undo": "Add Source...",
  "redo": null,
  "items": [
    {
      "id": "ic94ecd001",
      "index": 1,
      "kind": "file",
      "name": "clip.mp4",
      "path": "/Users/me/Movies/clip.mp4",
      "duration": 4.0,
      "video": "1280x720, 25 fps",
      "audio": "44100 Hz 1 ch",
      "range": {},
      "missing": false,
      "outputs": [
        {
          "id": "oc94ef7002",
          "kind": "encode",
          "format": "h264",
          "formatLabel": "H.264",
          "preset": "system/youtube-1080p",
          "presetName": "YouTube 1080p Full HD",
          "path": "/Users/me/Movies/clip.mp4",
          "status": "ready",
          "progress": 0.0,
          "error": null,
          "notes": null,
          "summary": {
            "format": "H.264",
            "video": "1920x1080, 25 fps, Progressive, H.264 (AVC), VBR, 1 pass, Target 16 Mb/s, Max 20 Mb/s, 8-bit",
            "audio": "AAC, 48000 Hz, Stereo, 320 kb/s",
            "effects": [],
            "captions": "none",
            "publish": []
          },
          "effects": [],
          "skip": false,
          "loudness": null
        }
      ]
    }
  ]
}
```

Items carry `kind` (`file`, `sequence`, `stitch`, `family`), `origin` (the watch folder it came from), `family` (the family app it came from), `stitch` (the joined clips) and `interpret` as well. Outputs carry the live fields `eta`, `elapsed`, `fps`, `speed`, `encoder`, `bytes`, `message`, `outTime` while they encode, and `publish` results after. Status values: `ready`, `preparing`, `encoding`, `paused`, `done`, `failed`, `stopped`, `skipped`.

`document.read {what: "selection"}` returns `{ "what": "selection", "outputs": [ { "output", "item", "settings", "summary", "path", "source" } ] }`, one row per selected output (at most 50), with the same settings `queue.getSettings` gives.

## Changing the document

`document.apply {label, ops}` runs the ops as one step in FormEncoder's History, labelled `label`, with `command.batch` (the same call the MCP `batch` tool and `./formencoder batch` use). If one op fails, the whole step is undone and the call fails with -32004 and the engine's sentence. The result is `{ "applied": n, "results": [...] }`, one result per op.

`app.run {command, args}` runs one command (an undoable command is its own History step) and returns its result; `app.commands` lists every command with its JSON Schema as `args`, its `query` flag (true for commands that change nothing) and whether it is `undoable`.

Refs in the queue commands: an output id (`o...`), an item id (`i...`), `#n` for the nth item (its outputs), `selected` or `all`, or a list of them.

The commands an extension needs most:

| Command | Args | Does |
| --- | --- | --- |
| `queue.addSource` | `paths`, `preset` or `format` or `settings` or `outputs: [{preset, settings, folder}]`, `folder`, `start` | adds sources, each with its outputs |
| `queue.addOutput` | `item`, `preset`, `settings` | adds an output to a source |
| `queue.setPreset` | `refs`, `preset` | applies a preset |
| `queue.setSettings` | `refs`, `settings` (a patch; dotted keys work: `{"video.targetBitrate": 8}`), `replace` | changes export settings |
| `queue.getSettings` | `output` | one output's complete settings, summary, file and source |
| `queue.setRange` | `refs`, `mode` (`entire`, `inout`, `custom`), `in`, `out` (source seconds) | sets the part of the source to encode |
| `queue.setOutput` | `refs`, `path` or `folder` or `name` | sets where an output writes |
| `queue.duplicate`, `queue.remove`, `queue.skip`, `queue.resetStatus` | `refs` (`skip` for `queue.skip`) | the Edit menu's queue actions |
| `queue.reorder` | `item`, `to` | moves a source in the queue |
| `queue.start`, `queue.pause`, `queue.stop` | none | runs the queue |
| `queue.select` | `items`, `outputs` | changes the selection the person sees |
| `encode.estimate` | `output` | the estimated size and duration |
| `encode.verify` | `output` or `path`, `loudness` | probes a finished file against its settings |
| `encode.report` | `outputs` | the report of finished outputs |
| `media.probe` | `path`, `loudness` | media information of a file |
| `preset.list`, `preset.get` | `query`, `category` / `preset` | the Preset Browser |
| `preset.create` | `name`, `settings` or `fromOutput`, `group`, `comment` | saves a preset |
| `format.describe` | `format` or `output` | every export setting of a format with its keys and options |
| `captions.read`, `captions.convert` | `path` (`to` for convert) | caption files |
| `watch.add`, `watch.list` | `folder`, `preset` or `outputs` | watch folders |
| `ui.toast`, `ui.panel` | `text` / `panel` | a message, a panel |

## Events

The host sends `ext.event` with these names:

| Name | Data | When |
| --- | --- | --- |
| `document.changed` | `{ revision, counts }` | the queue or the watch folders changed (any source: the person, an agent, a watch folder, an encode finishing) |
| `selection.changed` | `{ items, outputs }` | the selection in the Queue panel changed |
| `encode.finished` | `{ output, status, path, error }` | an output finished encoding (`done`, `failed` or `stopped`) |

`ext.theme` follows FormEncoder's theme and accent; the tokens are `--bg`, `--panel`, `--surface`, `--text`, `--muted`, `--faint`, `--accent`, `--border`, `--radius`, `--ok`, `--warn`, `--danger`, `--font-ui` and `--font-mono`.

## Files and the network

- `files.open` and `files.save` are available. They use FormEncoder's own file dialog (the system dialog in the desktop app, FormEncoder's file browser in a browser window). `files.open` reads the chosen files through the engine; `files.save` writes the file where the person chose, and asks before replacing a file in a browser window (the desktop dialog asks by itself).
- `net.fetch` is available, because FormEncoder already reaches the network (FFmpeg and model downloads, publish destinations). The engine makes the request: `https://` only, no addresses on this computer or the local network, redirects are returned rather than followed, 60 s, at most 50 MB.
- `models` and `native-code` give nothing extra in API 1.

## Where extensions appear

- **Extensions menu**, between Effects and Window: one item per contributed command (`Name: Title`), then Extensions Panel, Reload Extensions and Manage in FormPortal.
- **Extensions panel** (Window > Extensions, or the menu): one row per extension with its name, version, source, permission chips and state (Ready, Needs Permission, Refused and why), Open for its panels, the folder of a development extension, and Allow or Forget for its permissions. Below the rows, the FormPortal folder FormEncoder reads and how many process plug-ins are installed.
- **Contributed panels**: a `dock` panel opens as a tab in the right-hand dock group (it can be dragged, undocked and closed like FormEncoder's own panels; its tab reads `Extension: Panel`); a `dialog` panel opens as a FormEncoder dialog titled the same way.
- **Command palette** (Cmd+K or Ctrl+K): every contributed command, under Extensions.
- **Agents**: the MCP tools `extensions_list` and `extension_command`, and `./formencoder extensions` and `./formencoder extension ID COMMAND [--args JSON]` on the command line. An agent's command runs in the open FormEncoder window, so a window must be open, and the consent rules are the same as for the person.

The first time an extension version is opened or run, FormEncoder asks the person to allow what it asks for, in plain words, before the extension's frame exists, so its first `host.hello` already carries the grant. Allow is kept for that id, version and permission set; Not Now is not kept, nothing opens, and the next open or run asks again. Forget Permission closes the extension's open panels. Calls that need a permission the extension lacks fail with -32001.

## Running an extension from a folder

form.ext's Run in App writes `extensions/formencoder/dev.json` in FormPortal's folder:

```json
{ "format": "formext-dev-extensions", "format_version": 1, "product": "formencoder",
  "extensions": [ { "id": "my-extension", "path": "/Users/me/form.ext/my-extension/package", "added": "2026-11-07T10:00:00Z" } ] }
```

FormPortal's folder is `FORMPORTAL_ROOT` when set; otherwise `~/Library/Application Support/studio.formai.portal` on macOS, `%LOCALAPPDATA%\FormPortal` on Windows and `~/.local/share/formportal` (or `$XDG_DATA_HOME/formportal`) on Linux. FormEncoder checks the file every 2 s while its window has focus, and Reload Extensions reads it at once (and reloads the open panels of development extensions, so a changed page shows). A development extension's row shows its folder.

FormPortal installs a catalogue or sideloaded package by unpacking it and listing it in `extensions/formencoder/enabled.json`; FormEncoder picks it up the same way, with no restart.

## Versions

This host ships in FormEncoder 0.7.0. Set `"minimum_app": "0.7.0"` in a package that needs it; a source checkout before the 0.7.0 release reports 0.6.3, so leave `minimum_app` out while testing against such a checkout.

## For people changing FormEncoder

- Engine: `backend/app/services/formext_host.py` is the contract kit's resolver, vendored unchanged; `backend/app/services/extensions.py` wraps it (product, cache by the files' modification times, the window requests for agents), and `backend/app/routers/extensions.py` serves `GET /api/extensions`, `GET /api/extensions/stamp`, `GET /api/extensions/files/{id}/{version}/{path}`, `POST /api/extensions/save` and `POST /api/extensions/fetch`.
- Window: `frontend/src/ext/host-bridge.ts` is the kit's host bridge, vendored unchanged; `frontend/src/ext/extensions.ts` wires it to FormEncoder (handlers, consent dialog, theme, events, menu, palette, dock panels and dialogs, headless commands, agent requests) and `frontend/src/panels/extensions.ts` is the Extensions panel.
