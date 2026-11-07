# Extensions

FormEncoder loads extensions made to the Form Extension Contract, API 1. An extension is a small web page with a manifest: it can add a panel, a dialog and commands, and it works on the queue through FormEncoder's own commands. FormPortal installs extensions from the catalogue or from a package file; form.ext makes them and runs them straight from a folder while you work on one.

## Where they show

- **Extensions menu**, between Effects and Window: each command an extension adds (`Extension: Command`), then Extensions Panel, Reload Extensions and Manage in FormPortal.
- **Extensions panel**: one row per extension with its name, version, where it came from (Catalogue, File, Development), what it may do (Document, Open Files, Save Files, Network) and its state: Ready, Needs Permission, or Refused with the reason (made for another app, needs a newer FormEncoder, a broken manifest, a native extension). Open shows its panels; Allow and Forget Permission change what it may do. A development extension shows its folder. With nothing installed the panel says so and offers Manage in FormPortal.
- **Panels** an extension adds dock beside FormEncoder's own (as a tab on the right, with the extension's name in the tab) or open as dialogs.
- **Command palette** (Cmd+K or Ctrl+K): every extension command, under Extensions.

## Permissions

The first time a version of an extension opens or runs, FormEncoder asks whether to allow what it asks for, in plain words: read and change the queue, open files you choose, save files where you choose, reach the internet. Allow is remembered for that version; a new version that asks for more asks again. Not Now opens nothing and is not remembered, so the next time asks again. Forget Permission in the panel takes the choice back and closes the extension's panels.

Every extension runs in a sandboxed frame: it cannot reach FormEncoder's engine, your files or the network except through the calls above, and each change it makes to the queue is one undo step in History.

## Agents and the command line

`extensions_list` and `extension_command` (MCP) and `./formencoder extensions`, `./formencoder extension ID COMMAND --args '{...}'` list extensions and run their commands in the open window, with the same permission rules as the person.

## Making one

form.ext writes a project, previews it and runs it in FormEncoder with Run in App (which writes `extensions/formencoder/dev.json` in FormPortal's folder). FormEncoder notices within 2 s while its window has focus, or at once with Reload Extensions. What an extension can read and do in FormEncoder is in `docs/EXTENSIONS.md`.

FormEncoder's older process plug-ins (programs that run after an encode, as commands or as publish destinations) are separate and described in `docs/PLUGINS.md`; the Extensions panel counts them.
