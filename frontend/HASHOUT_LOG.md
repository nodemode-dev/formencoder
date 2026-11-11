# frontend · HASHOUT_LOG

Living context for formencoder's interface. The code carries almost no comments; the reasoning lives here.

## What it is

Vanilla TypeScript and Vite (port 5270, `server.host: false`, proxying `/api` and `/mcp` to the engine on 8270). No framework: panels mount their markup once and patch it in place with the primitives in `ui/dom.ts`.

## Family chrome

- The look is the form family's: the Studio Dark tokens and the fifteen theme profiles (`ui/themes.ts`), the glass menus, the dock (`ui/dock.ts`), menus and popups (`ui/popup.ts`), dialogs, the palette, the file dialog, the terminal and agents panels. These came over from formvfx and keep their `cv-` and `fx-` class prefixes, the way formvfx kept formvis's `cv-`: a shared component keeps the prefix of the app it came from, so the family's stylesheets read the same everywhere. Everything formencoder adds is `fe-`.
- `styles/tokens.css` is the token layer (accent `#f2545b`, formencoder's hue), `styles/base.css` the shared chrome, `styles/fe.css` formencoder's panels and the Export Settings window. Every `z-index` is a `--z-*` token.
- `index.html` applies the saved theme and accent inline before the first paint (`formencoder_ui_settings` in local storage), and `#app` stays hidden until the first state arrives (`revealApp`), so there is no theme flash and no half-drawn first frame.
- `revealApp` also waits for the bundled faces (Inter 400, 500, 600 and JetBrains Mono 400) and `document.fonts.ready`, at most 4 s. On macOS the system font comes first in `--font-ui`, but on Windows and Linux Inter is the face drawn, and a machine without Inter installed first draws a fallback and swaps when the woff2 arrives (`font-display: swap` in @fontsource). Revealed before the swap, the narrower Inter text moved the Form Family bar's pending label, and the window check (CLS 0) failed on the GitHub runner while passing on a machine with Inter installed (0.5.0).

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
- Pending indicators carry `.ns-pending` and keep their box; they show after 300 ms and stay at least 250 ms (`pendingClass`). Shown is `visibility: inherit`, not `visible`: a visible child inside the hidden `#app` is drawn anyway, so a pending label started before the reveal showed alone and its moves counted as layout shifts (0.5.0).
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

## About credit (0.4.2)

- formencoder's Home has no credit line, so by the owner's choice the credit sits in About: the head's note reads "Version x · Apache-2.0 · by nodemode.ai" (was "· nodemode-ai"). Same element, text only, so the dialog's head keeps its size.

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

## Vite pin and npm audit (0.4.3)

- Family rule from `FAMILY_DEV_PLAN.md` v0.4.x Phase 2b (formai_dev sidecar): every frontend installs with zero `npm audit` findings. Vite 8.3.0 carries a `launch-editor` with two command-injection advisories in the dev server (ledger FB-004); 8.3.5 clears them. Dev dependency only, nothing in the shipped bundle changed.
- Verified: `npm install` then `npm audit` reports 0 vulnerabilities, `npm run typecheck` passes, `vite build` succeeds, and `vite` serves 200 on localhost with no Network address printed.

## Splash does not shift (0.4.9, FB-137)

- `public/splash.html` centred the logo and the line under it together, so a paint that landed after the logo but before the line centred the logo alone and moved it when the line arrived (layout shift about 2.6e-4, in roughly 1 load in 6 to 10). The body now starts at a fixed top padding (`calc(50vh - 53px)`, the old centred position of the 72 px logo, 18 px gap and 16 px line) and the line has a fixed 16 px height, so the logo's position no longer depends on later siblings.
- Verified: a server that sends the page up to `</svg>`, waits 1 s and sends the rest gave a shift of 2.6e-4 before and 0 after.

## Window smoke (0.4.9, F7)

- `tests/window/test_window.py` serves the built `dist` from a real engine (empty data folder and home, FFmpeg fetch, autostart and the family bridge's headless peers off) and opens `/` and `/splash.html` in Chromium at 4x CPU slowdown and a slow network: a title, no 4xx or 5xx (so nothing refused by the guard), no console or page error, layout shift 0. It needs `npm run build` first and runs in the `window` CI job. Nothing is ignored. The window holds a websocket, which the idle wait tolerates, and the 3 s settle follows.

## The About box names NodeAgentc, Inc. and links the licence (0.5.2)

- The launch punch list (2026-11-03): the About of a downloaded app says NodeAgentc, Inc., not nodemode-ai, and lists the licence. The head line in `app.ts` `about()` reads "Version x · Apache-2.0 · NodeAgentc, Inc." and a note under the FFmpeg line carries the copyright and links the LICENSE file on GitHub (`nodemode-dev/formencoder/blob/main/LICENSE`) with `target="_blank"`.
- The bundle (`src-tauri/tauri.conf.json`) names the publisher, carries the SPDX id in its copyright line, and sets `license` and `licenseFile`; `src-tauri/Cargo.toml` `authors` is the company (the .deb's Maintainer; tauri-build writes `CompanyName` from `bundle.publisher`).
- Verified: the JSON parses; `python3 setup/lint_text.py .` passes. No desktop build was run.
- The launch sweep (2026-11-04): `plugins.updater.endpoints` in `src-tauri/tauri.conf.json` named the old `formencoder-updates` release on the private formcompiler repository, which no installed copy can read; it now names the download store's feed, `https://dl.formai.studio/formencoder/updates/latest.json`, the address formcompiler's tauri_config.py writes at build time and the one a local build must carry too. The Help menu's GitHub and Report an Issue links name `nodemode-dev/formencoder`, where the repository lives now.

## Splash and reveal match formvis (0.6.2)

- The splash is formvis's card: transparent html, a rounded 16 px body with a 1 px border, the 72 px icon, "Starting formencoder", and a 180 px bar filled with the family gradient on the same 2.6 s curve. `formencoderSplashDone` finishes the bar. The old page's grey sliding bar and its "engine" wording are gone.
- `tauri.conf.json` builds the splash hidden; `src-tauri/src/reveal.rs` (a copy of formvis's, minus its traffic lights) shows it through `round_splash` in setup (macOS: non-opaque window, clear background, content layer radius 16 with masksToBounds, then show). The main window is built with the page's dark background, hidden (macOS: on screen at alpha 0, clicks passing through), and `show_main` waits for SPLASH_MIN 2600 ms from launch, finishes the bar for 220 ms, shows the window whole and closes the splash. After 20 s it shows anyway if the page never reports.
- The page side is `announceReady` in `app/app.ts`: when `revealApp` has put `app-ready` on the body, two frames later it invokes `app_ready` once. It lives in app.ts, not `revealApp`, so the demo bundle (which shares dom.ts) is untouched. The page is a remote 127.0.0.1 origin, so `build.rs` generates `allow-app-ready` and the capability lists it.
- `objc2` and `objc2-app-kit` are macOS-only dependencies, already in the tree through Tauri.
- Not compiled: `cargo check` was not run for lack of machine capacity; the Rust was read against formvis's reveal.rs and main.rs. The splash page was screenshotted at 360x200 on a transparent background.

## The extension host, window side (0.7.0)

- `ext/host-bridge.ts` is the Form Extension Contract kit's host bridge, vendored unchanged: it makes the `sandbox="allow-scripts"` frames, routes JSON-RPC over `postMessage` only from the frame's own window, checks permissions, keeps grants (`formext.grants`) and per-extension storage in local storage, and runs headless commands in a hidden frame with the 120 s idle limit (paused while `files.*`, `app.run`, `document.apply` or `net.fetch` is pending). Panels and dialogs open with the kit's `open()`, after `allow()` (one consent dialog per id and version even when a panel and a command ask together), so no frame exists while the consent dialog is up and the first `host.hello` carries the grant; Not Now opens nothing, and Forget Permission closes the extension's panels and dialogs instead of remounting them without powers. `ExtPanel.mount` counts turns so a remount that lands while an older one waits for consent keeps only the newest frame. `ext/extensions.ts` wraps it and is the only file that knows formencoder: the handlers, the consent dialog (a `Dialog` titled Allow Name?, the permission words from the kit, Not Now and Allow), the theme, events, the menu and palette entries, dock panels and dialogs, and the agent requests.
- Document: `document.read` maps `what` onto `ui.state` (queue, watch), `queue.getSettings` per selected output (selection, at most 50), `preset.list`, `format.list` and `history.list`; anything else is -32602. `document.apply` is one `command.batch` with the extension's label and `atomic: true`, so a failing op undoes the whole step and the engine's sentence comes back as -32004. `app.commands` is the command specs the window already holds, `app.run` one `command.execute`. All go over the live socket, so they act as the window (source `ui`), the same as the person: an extension can never do what the window cannot.
- Files: `files.open` uses `pickFiles` (Tauri dialog or the built-in browser) and reads through `/api/fs/file`; `files.save` picks a place the same way and posts to `/api/extensions/save`. The desktop dialog asks before replacing a file itself, so the window sends `overwrite: true` there; in a browser the engine answers 409 and the window asks with `confirmAction`.
- Theme: tokens are read from the computed root style (`--bg-primary` as `--bg`, `--bg-secondary` as `--panel`, `--bg-tertiary` as `--surface`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent-color`, `--border-color`, `--radius`, the status colours and the two fonts) and the mode from `theme-light` on body. A MutationObserver on the root's style and class and body's class sends `ext.theme` once per animation frame and only when the tokens changed, so Preferences and the boot script need no hook.
- Events: `document.changed` on the store's `items` and `watch` slices, `selection.changed` on `selection`, `encode.finished` on the socket's `finished`.
- Menu: `Extensions` sits in `MenuBar`'s `ORDER` between Effects and Window, so the bar has its final width before the first paint; its items come from `menuEntries()` when the menu opens. Palette: `extraEntries` returns the panels and the extension commands.
- Panel (`panels/extensions.ts`): mounted once; rows are `patchList` keyed by extension id and patched with `setText`, `setClass` and `setHidden`, chips are a keyed list inside the row. The window's reveal waits for the first extension list as well as the first state (at most 1.2 s), so a saved layout that shows the panel paints it filled. Polling compares the engine's stamp and refetches only when it moved; `refresh` keeps every row, panel and frame whose record did not change and remounts only changed ones (Reload also remounts open panels of development extensions, whose files may have changed without the manifest). The name line uses `flex: 1 1 0; width: 0` with ellipsis and the version and source sit on their own line, because in the 300 px right column the name collapsed to one letter beside the state pill.
- Dock panels register as `ext:{id}:{panel}` when the list arrives. A saved workspace that names one loaded before the list is skipped by `applyLayout` (the factory did not exist yet), so extension panels open from the menu, the panel or a command, never on their own at start. The frame mounts on first `shown` and stays while the tab exists; `ui.setTitle` rewrites the tab text in place.
- Agent requests arrive as `{type: extensions, action: list|run}` socket events (seen on the client's catch-all `event`, so `client.ts` is unchanged) and are answered with `client.reply`.

## The three demos open in the app (0.8.0) {#in-app-demos}

Asked for: the owner's rule is that every Form app opens all of its demos from inside the app. The Queue demo (`demo/`), Delivery specs (`demos/broadcast`) and Inspect and convert (`demos/inspect`) were browser pages only. Now:

- formencoder has no Start page; the window opens on the Queue, and an empty Queue is its home. The empty card gained a Demos section under the drop card (`ui/demos.ts` `demosHtml`): one card a demo with an inline SVG schematic in the tokens (`--surface-*`, `--line-*`, `--accent-color`), the title and one line. The blurb clamps to two lines with the height reserved and the thumbnail is a fixed 16:9 box, so cards never resize. The empty view is a scrolling column (`justify-content: safe center`), so on a short window the cards scroll instead of being cut. Clicks are caught on `.fe-q-empty` by `data-demo-open` (never by words) and stopped, so the card's double-click Add Source never fires on a demo.
- Help > Demos holds one item a demo (`menu.demo.{id}`); the menu bar is built from the in-window menus, and the desktop shell has no native menu of its own, so nothing else needed the items.
- What opening does: the demo is a queue, the formencoder document. `demos/catalog.ts` lists each demo's sources and outputs as the engine's own presets and settings patches; the Queue demo's sources and outputs are the browser demo's `CURATED` list itself, moved to `demos/queue-sources.ts` and imported back by `demo/src/engine/media.ts`, and the Delivery specs outputs are made from the browser demo's `PROFILES` (moved to `demos/broadcast-profiles.ts`, re-exported by `demos/broadcast/src/engine/standards.ts`): review copy with the timecode, name and FOR REVIEW ONLY burned in and the captions burned in, EBU R128 with TTML beside the file, ATSC A/85 with SCC and the limiter, BWF, and the XDCAM MXF master. Inspect and convert queues the stream clip's high (3.5 Mb/s) and low (0.45 Mb/s) encodes of frames 60 to 149, its proxy and GIF, a proxy each for the other two clips and a GIF of the cloud sequence at 24 fps, and brings Media Info forward. Every demo points Media Info at its first source, so a panel left open never shows the previous demo's file. The browser demos' own panels (Compare, Checksums, the Loudness matrix) stay in the browser; the app shows the same material through its own panels.
- Media: the engine reads files by path, so the window fetches the demo's files from `/demos/{id}/` (Vite copies `public/` into `dist`, which the engine serves in the desktop app) and posts them to `/api/fs/upload` as `demo-{id}-{file}`. A file already in `imports` under that name and size is reused, so opening a demo twice copies nothing; the prefix keeps the cloud frames numbered (an upload that met a taken name would get " 1" and break the sequence) and the cues beside the programme under its stem.
- New, never over the person's work: the whole open is one `command.batch` (removing what is queued, then one `queue.addSource` a source with its `outputs`), labelled "Open the ... demo", so one Undo brings the person's queue back. When the queue has sources, a dialog says so before anything changes (Cancel or Open Demo); formencoder has no unsaved-changes prompt of its own, the queue is kept by the engine. Outputs land beside the copies in `imports`, never beside the demo sources in the repository.
- Agents: `ui {action: demo, id}` publishes `{type: uiAction, action: demo}` to the windows and the window runs the same `openDemo`, with the same dialog; `window.formencoder.ui.demo(id)` for automation.
- `scripts/demo-media.py` decodes the packs into `public/demos/{id}/` with a `files.json` each; only sources, not the inspect demo's ready-made outputs (the engine encodes those). About 34 MB in all.

## Extension engine calls follow the extension's permissions (0.8.2)

Refers to `ext/extensions.ts` `gate`, `runApp`, `applyDocument` · kind: fix · logged: v0.8.2 · 2026-11-10

- `app.run` and `document.apply` needed only `document`, and passed any engine command over the window's own socket, where the engine sees the person (source `ui`) and no approval applies. An extension granted "Read and change the open document" could `prefs.set` a raw decoder (a native program the engine runs), or set a publish destination that uploads encodes. `gate` now refuses with `ERR.PERMISSION` (-32001), before anything is sent: `prefs.`, `plugin.`, `tools.`, `lut.install`, `openh264.` and `shortcuts.` without `native-code`, `model.` without `models`, `family.` without `network`, `watch.` and `queue.setOutput` without `files-write`, and any call whose arguments carry a non-empty `publish` without `network`. `document.apply` checks every step. Checked with `tsc --noEmit`; not run against a loaded extension.

## A call reported as failed is not sent later (0.8.2)

Refers to `engine/client.ts` `Client.receive` (hello) · kind: fix · logged: v0.8.2 · 2026-11-10

- A call made while the socket was connecting or reconnecting waited in `outbox`; when that socket closed, `onclose` rejected it (the window toasted "the engine connection closed") but left it in `outbox`, and the next `hello` sent it anyway, so Start Queue or Remove ran after the person was told it failed. On `hello` the outbox now sends a message only when it has no id (a consent `reply`) or its id is still in `pending`. Checked with `tsc --noEmit`; not run against a restarting engine.

## Installed LUTs opens its menu (0.8.2)

Refers to `panels/export-settings.ts` `buildEffects` (the Installed LUTs button) · kind: fix · logged: v0.8.2 · 2026-11-10

- The click handler read `e.currentTarget` after `await ctx.run('lut.list')`; by then dispatch had ended and `currentTarget` was null, so `getBoundingClientRect` threw and no menu appeared. The handler now measures the button itself (`pick`) after the await. Checked with `tsc --noEmit`; not run in the window.

## A late submenu never opens orphaned (0.8.2)

Refers to `ui/popup.ts` `PopupMenu.showSub`, `closeSub` · kind: fix · logged: v0.8.2 · 2026-11-10

- `showSub` awaited the row's asynchronous children (Apply Preset, Format) and then opened its menu whatever had happened meanwhile. Moving to another submenu row, or pressing Escape, before the first list arrived left a submenu that no parent would close and that `openRoots` did not hold, and `Keys.down` ignores keys while any `.cv-menu` is shown, so every shortcut stopped until reload. `closeSub` now bumps `subSeq`; `showSub` takes the value after its own `closeSub` and, after the await, drops its menu when the value moved on or its own panel is hidden. Checked with `tsc --noEmit`; not run in the window.

## Maximize ends with its group (0.8.2)

Refers to `ui/dock.ts` `applyLayout`, `close`, `move` · kind: fix · logged: v0.8.2 · 2026-11-10

- `.fx-dock.is-maximized .fx-group:not(.is-max)` hides every other group. Switching workspace, or closing or moving the last panel out of the maximized group, removed that group but kept `this.maximized` and the dock's `is-maximized` class, so every group on screen was hidden. `applyLayout` now clears both first, and `close` and `move` clear them when the group they remove is the maximized one. Checked with `tsc --noEmit`; not run in the window.

## Docked extension panels survive a reload (0.8.2)

Refers to `app/app.ts` `App.start`, `ui/dock.ts` `applyLayout` · kind: fix · logged: v0.8.2 · 2026-11-10

- `dock.load()` ran right after `new Extensions(...)`, whose `refresh` registers the `ext:*` panel factories only once `/api/extensions` answers, so `applyLayout` skipped every extension panel; a group that held only one stayed as an empty box, and the next `save()` wrote the layout without it. The layout is now restored when `extensions.ready` settles (the extension list arrived, or its 1.2 s limit passed; the window is revealed after the same promise, so nothing is seen before), and `applyLayout` drops any group left with no panels, not only floating ones. Checked with `tsc --noEmit`; not run in the window.

## The dev proxy follows FORMENCODER_PORT (0.8.2)

Refers to `vite.config.ts` `BACKEND_PORT` · kind: fix · logged: v0.8.2 · 2026-11-10

- The README documents `FORMENCODER_PORT` and `boot_backend` and `boot_all` honour it, but the Vite proxy for `/api` and `/mcp` was fixed at 8270, so with another port the window never connected (or reached another engine on 8270). `BACKEND_PORT` now reads `FORMENCODER_PORT`, defaulting to 8270; `server.host` stays `false` and the interface port stays 5270. Checked by loading the config through Vite's `loadConfigFromFile`: the proxy target is `127.0.0.1:9270` with the variable set to 9270 and `127.0.0.1:8270` without it.

## Media Browser Up uses the engine's parent (0.8.2)

Refers to `panels/media.ts` the Up button and `go` · kind: fix · logged: v0.8.2 · 2026-11-10

- Up worked out the parent with a regex, which turns `C:\Users` into `C:`, a drive-relative path that lists the engine's working directory on C:, after which Up did nothing. `go` now keeps the `parent` that `media.browse` returns (Rust `Path::parent`, `C:\` for `C:\Users`, none at a root) and Up goes there when there is one. Checked with `tsc --noEmit`; not run on Windows.

## Reset Workspace returns a saved workspace to how it was saved (0.8.2)

Refers to `ui/dock.ts` `resetWorkspace` · kind: fix · logged: v0.8.2 · 2026-11-10

- A workspace saved with Save Workspace As has no entry in `WORKSPACES`, so Reset applied Default and saved it under `layouts[name]`; `switchTo` prefers `layouts` over `custom`, so the saved arrangement never came back. `resetWorkspace` now reads `custom[name]` from local storage first, then the built-in layout, then Default. Checked with `tsc --noEmit`; not run in the window.

## An approval decided in another window closes quietly (0.8.2)

Refers to `app/app.ts` `App.approvals` · kind: fix · logged: v0.8.2 · 2026-11-10

- When the request shown in this window left the pending list (the person answered in another window), `approvals` closed the dialog while `this.approval` still named it, so the dialog's `onClose` ran `answer(false)`, sent `agents.decide` for a request already decided and showed the engine's "no pending approval N" error. `this.approval` is now cleared before the dialog closes, so `answer` returns at once. Checked with `tsc --noEmit`; not run with two windows.

## Shortcuts load when the command list arrives (0.8.2)

Refers to `app/ctx.ts` `Ctx.start`, `ui/keys.ts` `Keys` · kind: fix · logged: v0.8.2 · 2026-11-10

- `Keys` rebuilt its table on a 400 ms timer after `open`, not after `command.list` answered, so on a slow first connect the table held only Backspace and Cmd+I, Cmd+E, Enter and the rest did nothing for the session. `Ctx.start` now emits `specs` once `loadSpecs` has finished after each `open`, the same event a shortcut edit already raises, and `Keys` no longer keeps its timer. Checked with `tsc --noEmit`; not run against a slow engine.

## Cancel undoes what FFmpeg Command wrote (0.8.2)

Refers to `panels/export-settings.ts` `open`, `close`, actions `command` and `ok` · kind: fix · logged: v0.8.2 · 2026-11-10

- FFmpeg Command needs the edited settings on the output to plan the command (`encode.command` reads the queue), so it writes them with `queue.setSettings`; Cancel then only hid the window, against "OK writes it; Cancel drops it". The dialog now marks `written` when the button writes, and closing by Cancel, the close button or Escape puts back the settings it opened with (`info.settings`); OK clears the mark before closing. Checked with `tsc --noEmit`; not run in the window. The restore is one more undo step in History.
