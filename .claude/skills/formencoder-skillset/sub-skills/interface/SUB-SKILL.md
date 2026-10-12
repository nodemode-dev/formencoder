---
name: interface
description: Changing formencoder's TypeScript interface in frontend/src. Use for a panel, the queue list, Export Settings, the Preset Browser, watch folders, the media browser, menus, shortcuts, the palette, dialogs, themes, the dock and workspaces, the terminal panel, or any flash, flicker or layout shift.
---

# interface

Read `frontend/HASHOUT_LOG.md` first.

## Shape

- `engine/` has no DOM: `client.ts` (the live socket, `rpc`, known events), `store.ts` (the UI state from `ui.state` plus events), `events.ts`, `types.ts`.
- `app/ctx.ts` is what panels get: `invoke(command, params)` with selection refs, pickers, schema forms, toasts and the `result` event for queries. `app/app.ts` builds the shell, menus, keys, the consent dialog and the workspaces.
- `panels/` mount once and patch: queue, encoding, watch, media, presets, info, family, log, export-settings, terminal, agents.
- `ui/` holds shared pieces: `dom` (`el`, `patchList`, `setText`, `setClass`), `dock`, `menubar`, `palette`, `dialogs`, `popup`, `toast`, `forms` (the dialog built from a command's schema, ending with the live command line and MCP call), `command-line` (quoting, the MCP call, copy) and `fields` (controls generated from format field specs with `showIf`). `ctx.invoke(id, params, ask)` opens that dialog when a required parameter is missing, or always when `ask` is true (the palette's Shift+Enter and Alt+click), so every command with parameters is reachable with all of them, `icons` (inline SVG), `themes`, `prefs`, `storage`.
- `styles/tokens.css` holds every colour, spacing step, radius and `--z-*` layer. Accent `#f2545b`.

## Rules

- Mount once, patch keyed nodes. A list changes through `patchList`; a value through `setText` or `setClass`. Never set `innerHTML` on a live container to change one thing.
- Reserve space for anything that loads: thumbnails, previews, estimates and status text have fixed boxes so nothing shifts when they arrive.
- The theme is applied by the inline boot script in `index.html` before first paint (`formencoder_ui_settings`); do not move it into a module.
- Every icon is an inline `currentColor` SVG from `ui/icons.ts`; no icon libraries.
- Every z-index is a `var(--z-*)` token; overlays render into the overlay root under `body`.
- Vite stays on `127.0.0.1:5270` with `host: false`, proxying `/api` and `/mcp` to 8270.
- Shared family components keep their `cv-` and `fx-` classes; formencoder's own use `fe-`.
- Verify every change under 4x CPU and network throttling (see `verification`).
