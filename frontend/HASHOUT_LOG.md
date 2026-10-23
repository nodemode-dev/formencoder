# frontend · HASHOUT_LOG

Living context for formencoder's interface. The code carries almost no comments; the reasoning lives here.

## What it is

Vanilla TypeScript and Vite (port 5270, `server.host: false`, proxying `/api` and `/mcp` to the engine on 8270). No framework: panels mount their markup once and patch it in place with the primitives in `ui/dom.ts`.

## Family chrome

- The look is the form family's: the Studio Dark tokens and the fifteen theme profiles (`ui/themes.ts`), the glass menus, the dock (`ui/dock.ts`), menus and popups (`ui/popup.ts`), dialogs, the palette, the file dialog, the terminal and agents panels. These came over from formvfx and keep their `cv-` and `fx-` class prefixes, the way formvfx kept formvis's `cv-`: a shared component keeps the prefix of the app it came from, so the family's stylesheets read the same everywhere. Everything formencoder adds is `fe-`.
- `styles/tokens.css` is the token layer (accent `#f2545b`, formencoder's hue), `styles/base.css` the shared chrome, `styles/fe.css` formencoder's panels and the Export Settings window. Every `z-index` is a `--z-*` token.
- `index.html` applies the saved theme and accent inline before the first paint (`formencoder_ui_settings` in local storage), and `#app` stays hidden until the first state arrives (`revealApp`), so there is no theme flash and no half-drawn first frame.

## State

- `engine/client.ts` is one websocket (`/api/live`) carrying JSON-RPC both ways plus the engine's events.
- `engine/store.ts` pulls `ui.state` on `open`, `changed` and `finished`, and merges `progress` events into the output they name without a pull, then emits `progress` with that output so a panel patches one row. Panels subscribe to the slice that matters (`items`, `run`, `watch`, `history`, `selection`); each slice fires only when its JSON signature changed.
- Selection is local (`store.select`) and mirrored to the engine with `queue.select` so agents see it.
- `app/ctx.ts` `invoke(command)` fills what a menu command needs: the selected outputs or source as `refs`, `output` or `item`; file pickers for paths; a form generated from the command's JSON Schema (`ui/forms.ts`) for any required parameter still missing. Query commands raise `result`, which the app shows (Preferences, Log, Media Info, About, or a report).

## Panels

- Queue: items with their outputs; Format, Preset and Output File are links (format menu, Export Settings, a save dialog). Presets drag from the Preset Browser onto a source (adds an output) or an output (applies it); media drags from the Media Browser; files dropped from the system are copied into the data folder's `imports` (browser) or added by path (desktop app, through Tauri's drag and drop).
- Encoding: one row per running output with a preview of the frame being encoded (through `/api/preview.png` at the output's `outTime`, at most every 2.5 s, only while the panel is visible and Preferences allow it).
- Export Settings is a window, not a panel: the settings are a local copy; every change goes through `settings.apply` (the engine normalises and applies the patch, so format switches behave exactly as they do for agents) and the preview renders the copy through `frame.png` with `patch`. OK writes it with `queue.setSettings` and `replace`; Cancel drops it.
- Field controls for Video, Audio and Multiplexer come from `format.describe` (keys, types, options, units, `showIf`); Effects, Captions, Publish and Metadata have their own field lists in `panels/export-settings.ts` that use the same control factory (`ui/fields.ts`).
- Preferences > Delivery Tools builds one row per tool from `tools.list` while the dialog is built (before it shows), so later refreshes only repaint text; the path line keeps its height with a no-break space and the OpenH264 button has a minimum width so Download from Cisco and Download Again take the same box. The button calls the service's `openh264.fetch`.
- Delivery Tools also lists the speech models (download buttons call `model.fetch`; `toolFetch` events write the percentage into that row's state text) and a JSON editor for the `rawDecoders` preference with the vendor raw tools formencoder found.
- The Form Family panel's formcut row has a link line (always present for formcut, hidden for the others, so linking only changes its text): Receive Exports picks a preset and calls `family.linkFormcut`; Stop Receiving calls `family.unlinkFormcut`. Sources stays enabled for an app that is not running when the service can start its engine (`canStart`).
- Edit > Keyboard Shortcuts (`ui/shortcuts.ts`) builds one row per menu command, grouped by menu in first-seen order, inside a list of fixed height so filtering never resizes the dialog. A key button captures the next combination (`comboOf`), Delete or Backspace clears, Escape cancels; `shortcuts.set` refuses a taken combination and the dialog offers to move it (`force`). After any change it reloads the command specs and emits `specs`, which `Keys` turns into a fresh table.
- Content Credentials fields sit at the end of the Metadata pane and show only when the switch is on (`data-showIf` on rows built outside `format.describe`).
- Packaged formats (AS-10, AS-11, P2, DCP) add their `package` fields to the Multiplexer pane, ending with a read-only `note` field that says which tool packages the output and whether it is installed; the note's text is part of its `patchList` key so installing the tool replaces just that row.

## DOM stability

- Lists use `patchList` keyed by ids; progress updates set text and a CSS custom property (`--p`, a `scaleX` on the bar) on the row's existing nodes.
- Pending indicators carry `.ns-pending` and keep their box; they show after 300 ms and stay at least 250 ms (`pendingClass`).
- Images change with `swapMedia` (decode off-screen, swap once).
- The Export Settings preview images fill their figure (`position: absolute; inset: 0; object-fit: contain`), so a preview with another aspect ratio letterboxes inside the same box instead of resizing the figure; `imageRect` works out the contained picture from the natural size for the crop box. Opening the window applies the current view's hidden figures before the first render, and opening it for a different output clears the last output's pictures (a 1998x1080 DCP frame once resized the figure 16 px when the next output's 16:9 frame arrived).
- Labels that change length on the same control reserve their width (`.fe-run-label`).
- Single-line text that arrives after mount keeps a fixed height while empty: the Media Browser path line (`.fe-m-path`, 23 px) once shifted the list 14 px when the first folder loaded.
- Double-click on the Queue list's own background (or the empty card) runs Add Source; Send to formcut and Send to formvfx in a finished output's menu call `family.send` through the client, not a command, because sending is an outside effect with nothing to undo.
- Verified under 4x CPU and network throttling: one reveal on a constant background, no node added or removed in the Queue list while outputs reset and encode, no layout shift.

## Command dialogs and command lines (0.2.3)

- The family standard (formdes) is that every command with parameters has a dialog built from its signature. `schemaForm` already built one but opened only when a required parameter was missing, so all-optional commands ran with defaults and could not be set from the window. `ctx.invoke(id, params, ask)` now opens it whenever `ask` is true; the palette passes it on Shift+Enter and Alt+click. With `ask`, a missing selection is left for the dialog to ask instead of a refusing toast, and file pickers are skipped because the dialog has browse buttons.
- The dialog ends with the command line and MCP call for the values as typed, the palette with the highlighted command's line and tool name. Both teach the person the agent and shell forms of what they are doing; the copy buttons hand them to a terminal or an agent.
- A long `white-space: nowrap` text in a grid with an automatic column widens the column to the text's min-content: the dialog body is such a grid, and the filled command line pushed its column to 672 px, reflowing the doc note above it. Single-line readouts inside a grid or flex track get `flex: 1 1 0; width: 0; min-width: 0` so they contribute nothing to min-content.
- The palette list has a fixed height, not a max-height, so the strip and the foot under it never move as the result count changes.

## Approval dialog and full faith (0.2.4)

- `app.approvals(pending)` shows one approval request at a time as its own dialog and closes it if the request was decided in another window; closing it declines, so a request never stays open behind a dismissed dialog. Pending requests are read on connect, so an agent that asked while no window was open is answered the moment formencoder opens.
- The Full faith switch lives in the Agents panel, deliberately not in the approval dialog: turning it on should be a decision taken calmly, not a shortcut out of a prompt. It writes over the live socket because that is the only route the engine accepts it from.
- Inherited: the activity feed inserts newest-first, so a new row pushes older rows down (a 0.00002 layout shift measured in 0.2.4). The Agent Connect panel in 0.2.5 replaces this feed.

## Use OpenH264 switch and effect names (0.2.9)

- Preferences > Delivery Tools builds the Use OpenH264 checkbox once with its row, with Cisco's attribution directly under it (Cisco's terms put the text where the use is controlled). It writes the `openh264` preference and `paintTools` sets it from `tools.list`'s `enabled` with `setChecked`, so a repaint never rebuilds it. Not verified in the window under throttling.
- Effect labels are formencoder's own: Look / LUT, Fit Tuning, Live Link. The keys under them (`effects.lut`, `effects.timeTuner`, `family.addLink`) are unchanged, so saved presets and agent calls still work.

## App icon in the family construction (0.2.7)

- The ||> mark keeps its silhouette (two bars, then a hollow play triangle) but moves from flat red on a flat tile into the redrawn family: the dark gradient squircle with bloom, rim and drop shadow, the play triangle as a glossy slab in the blue, violet, pink, amber paint with a darker extruded edge (a copy of the shape in the side gradient, 13 units down), and the two bars as gradient pills at 55 and 85 percent so they read as a motion trail into it.
- The macOS .icns uses the 824 px tile inside a 1024 canvas with a 100 px margin; .ico, the PNGs and the Square*Logo set stay full bleed. Sizes 64 px and below (50 px for the Windows set) use the simple detail: the mark drawn larger with a wider hole.
- favicon.svg and the splash use one filter-free build of the mark with a rounded-rect tile (`compact.py`; the splash's ids carry a `splash-` prefix). `brandMark()` in ui/icons.ts stays the currentColor glyph, since UI icons are currentColor.
- `compact.py` strips only the root `<svg>` size. The design drop stripped every `width="1024" height="1024"`, which also zeroed the bloom rect, so the favicon and splash had no glow.
- The tile shadow is its own layer under an unfiltered tile, because a filter on the tile made Chromium band the gradient.
- `gen.py` draws on the 64-unit grid of the old mark, scaled to the 1024 canvas by `f` (10.6, or 11.4 for the simple detail); `rtri` is a triangle with each corner rounded by a quadratic curve.
- Regenerating, from `assets/icon_src/` with Pillow and Playwright 1.56.0 (whose Chromium renders the four masters): `python3 gen.py mac full R_mac_full.svg`, the same for `mac simple`, `full full` and `full simple`; `node render.mjs R_[mode]_[detail].svg R_[mode]_[detail].png 1024` for each; `python3 build.py` writes every size into `out/`, mirroring the repo paths. `python3 compact.py` prints the favicon, `python3 compact.py splash-` the splash's mark. In 0.2.7 this reproduced every committed icon byte for byte.
