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

## DOM stability

- Lists use `patchList` keyed by ids; progress updates set text and a CSS custom property (`--p`, a `scaleX` on the bar) on the row's existing nodes.
- Pending indicators carry `.ns-pending` and keep their box; they show after 300 ms and stay at least 250 ms (`pendingClass`).
- Images change with `swapMedia` (decode off-screen, swap once).
- Labels that change length on the same control reserve their width (`.fe-run-label`).
- Verified under 4x CPU and network throttling: one reveal on a constant background, no node added or removed in the Queue list while outputs reset and encode, no layout shift.
