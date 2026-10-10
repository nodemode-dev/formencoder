---
name: ui-automation
description: The formencoder window as the person sees it. Use when the person asks to be shown something, when a panel or workspace should change, when the Export Settings window should open on an output so the person can review or type credentials, when a message should appear in the window, or when you need to know what the person is looking at and has selected.
---

# ui-automation

The window and the agent share one engine, so most work needs no UI at all: queue changes appear live. The `ui` tool is for showing the person something or reading what they see.

## Reading

`ui {action: state}` returns how many windows are watching, whether the queue is running or paused, the queue counts, the selection in the Queue panel (items and outputs) and the undo and redo depth. Use `selected` as a ref when the person says "this one" or "the ones I picked".

## Showing

| Want | Call |
| --- | --- |
| A panel in front | `ui {action: panel, panel}`: `queue`, `encoding`, `watch`, `media`, `presets`, `family`, `log`, `info`, `terminal`, `agents` |
| A workspace | `ui {action: workspace, name}`: `Default`, `Encoding` (the queue above the Encoding panel, presets beside), `Ingest` (Media Browser and Info large, presets on the right), `Agent` (Terminal and Agents wide beside the queue) |
| Export Settings on an output | `ui {action: exportSettings, output}`: the person sees the full settings, the source and output previews, the summary and the estimate |
| A message | `ui {action: toast, text}` (`execute ui.toast {text, kind: ok|error}` for a coloured one) |
| A selection | `execute queue.select {items?, outputs?}` |

These are queries: they change what the window shows, not the queue, so they never ask permission and are not undo steps.

## The panels

- **Queue**: items with their outputs, status and progress; Start, Pause, Stop; drag to reorder.
- **Encoding**: what is encoding now with the frame being encoded, speed and time remaining.
- **Watch Folders**: each folder with its outputs and whether it is active.
- **Media Browser**: the disks and folders, with probe info and thumbnails; drag into the queue.
- **Preset Browser**: system, ingest and user presets by group, with search.
- **Family**: the running form family apps and their sources.
- **Log**: the Encoding and Error logs.
- **Info**: the selected source or output's details.
- **Terminal**: the embedded terminal where Claude Code, Codex and Cursor run as trusted agents.
- **Agents**: which outside agents are allowed, the MCP address, and installing the clients.

## Courtesy

Do not switch the person's workspace or pull a panel to the front in the middle of their own work unless they asked to see something. A toast is the light way to say a long job has finished.
