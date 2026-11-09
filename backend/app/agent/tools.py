from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from typing import Any

from .. import __version__
from ..core import config
from ..engine import rpc
from ..engine.host import host
from ..engine.rpc import RpcError
from . import approvals

INSTRUCTIONS = (
    "formencoder is the form family's media encoder, running on this computer; the person sees its window and every "
    "queue change you make appears there live, undoable. Start with `status`. The fastest path is `encode` (files + preset, waits, verifies). "
    "For control, a queue item is a source with one or more outputs; each output has export settings (format, video, audio, effects, captions, "
    "metadata, publish) that `export_settings` reads and patches. Look before you encode a long job: `preview_frame` renders one frame of an "
    "output through its exact settings, `contact_sheet` several. Every action is a command: `list_commands`, `describe_command`, `execute`, "
    "`batch` (one undo step; `$N.key` is step N's result, counting from 1). Media from formcut, formvfx, formwav or formvis comes in with `family`. "
    "Never report an encode as good without `verify`. The `guide` tool has recipes; get the `workflow` prompt for the full loop. "
    "Every command is also a tool of its own, named from its id (queue.addSource is `queue_add_source`), unless this client loads the core "
    "profile, where `execute` reaches the same commands. Readable resources: formencoder://status, queue, presets, formats, encoders, commands, "
    "log/encoding, log/error and guide/[topic], plus templates for one output, preset, format or command. "
    "Consequential actions wait for the person's approval in formencoder's Agent Connect panel unless they turned on full faith: deleting, "
    "clearing or resetting, publishing to an outside service, overwriting an existing file, changing where a watch folder writes, and typing "
    "into a terminal. Such a call waits up to two minutes for the decision; if none comes it answers pendingApproval with an id, nothing has run, "
    "and approval_status {id} gives the decision and the result later. terminal_open, terminal_send and terminal_read drive real shells the "
    "person sees as tabs, where ./formencoder ID --name value runs any command."
)

WORKFLOW = """How to encode with formencoder through these tools.

1. Orient: status (queue counts, what is encoding, FFmpeg and hardware encoders found, watch folders). probe a source to know its size, rate, codecs, timecode, audio layout and loudness (probe {path, loudness: true}).
2. Choose: presets {action: list, query} finds a preset (YouTube, ProRes, DNxHR, XDCAM, WAV, image sequence...). formats {format} shows every export setting of a format with its keys, options and the encoders this machine has.
3. Quick job: encode {paths, preset, folder?, settings?} queues, encodes, waits and verifies in one call. settings is a patch on the preset (nested objects or dotted keys: {"video.targetBitrate": 8, "effects.loudness.enabled": true}).
4. Careful job: execute queue.addSource {paths, preset or outputs: [{preset, settings, folder}]} (several outputs per source encode in parallel), then export_settings {output, settings} to adjust, preview_frame {output, time} to look (overlays, crop, scaling, LUT, captions show), then queue {action: start} and wait {outputs}.
5. Check: verify {output} probes the file against its settings (frame size, rate, duration, codecs, audio, loudness when normalised). Read the notes and the error of failed outputs (log {kind: error} for FFmpeg's own words), fix the settings and queue {action: resetStatus, refs} to encode again.
6. Repeatable work: presets {action: create, name, fromOutput} saves the settings; watch_folder {action: add, folder, preset} encodes whatever lands in a folder.
7. Family: family {action: discover} finds formcut, formvfx, formwav and formvis running here; family {action: sources, app} lists their projects, compositions, sessions and images; family {action: add, app, id, preset} queues one (formcut renders the sequence, formvfx streams the comp over Live Link, formwav mixes the session); family {action: send, app, files} hands finished files back to formcut or formvfx.
8. Mistakes: history {action: undo}. A failed tool says why; read it, fix the params (describe_command shows the schema) and retry.
"""

GUIDES = {
    "index": "Topics: workflow, queue, settings, video, audio, effects, captions, metadata, publish, watch, ingest, family, presets, ui. Call guide {topic}.",
    "workflow": WORKFLOW,
    "queue": "Refs: an output id (o...), an item id (i...), '#n' for the nth item (its outputs), 'selected' or 'all'. queue.addSource {paths, preset|format|settings|outputs, folder, stitch, frameRate (image sequence), start}. queue.addOutput {item, preset} adds another output to a source. queue.duplicate, queue.remove, queue.clearDone, queue.reorder {item, to}, queue.skip {refs, skip}, queue.resetStatus {refs} (encode again). queue.setRange {refs, mode: entire|inout|custom, in, out} in source seconds. queue.interpret {item, frameRate, pixelAspect, fieldOrder, alpha, rotation}. queue.stitch {paths} joins clips into one output. queue.save {path} and queue.open {path} keep a queue as .fequeue. Status values: ready, preparing, encoding, paused, done, failed, stopped, skipped.",
    "settings": "Settings object: format, outputName (tokens {source} {preset} {format} {date} {time} {width} {height} {fps} {index}), exportVideo, exportAudio, video{...}, audio{...}, multiplexer{container, fastStart}, range{mode,in,out}, crop{left,top,right,bottom}, rotation (0, 90, 180, 270), scaling (fit, fitBlack, fill, stretch, matchWidth), timeInterpolation (sampling, blending, opticalFlow), maxRenderQuality, maxDepth, startTimecode, alphaOnly, maxFileSize (MB), effects{...}, captions{...}, metadata{...}, publish[...]. Switching format keeps range, crop, scaling, effects, captions, metadata and publish. formats {format} lists every field with its options and showIf condition.",
    "video": "video: codec, matchSource (width, height and rate from the source), width, height, frameRate (null = source), fieldOrder (progressive, tff, bff, source), pixelAspect, profile, level, bitDepth (8, 10, 12), chroma (420, 422, 444), rateControl (vbr1, vbr2, cbr, quality), targetBitrate and maxBitrate in Mb/s, quality 0 to 100, keyframeDistance (frames), hardware (auto, on, off), colorSpace (rec709, rec2020, rec2100pq, rec2100hlg, rec601...), hdr10 with maxCLL and maxFALL, alpha, sequence (image sequences), startNumber, loop (GIF). H.264 and HEVC use the hardware encoder when one works (formats {format} shows which); vbr2 needs a software encoder.",
    "audio": "audio: codec (aac, pcm, mp3, opus, flac, ac3...), sampleRate, channels (mono, stereo, 5.1, 7.1, source, discrete), bitrate (kb/s), bitDepth (16, 24, 32), float. Loudness is an effect: effects.loudness {enabled, standard: ebu-r128|atsc-a85|itu-bs1770|custom, target LUFS, truePeak dBTP, lra, mode twopass, report (XML beside the file), limiter {enabled, lookahead ms, release ms}}.",
    "effects": "effects (Media Encoder's Effects tab): lut {enabled, path (.cube, see lut.list), intensity}; sdrConform {enabled, brightness, contrast, knee, peak} turns HDR (PQ or HLG) into SDR Rec. 709; imageOverlay {enabled, path, position, offsetX, offsetY, size %, absolute, opacity}; nameOverlay {enabled, prefix, suffix, source: fileName|outputName, position, size, color, background}; textOverlay {enabled, text, position, ...}; timecodeOverlay {enabled, source: media|generate, start, offsetFrames, frameRate, position, ...}; timeTuner {enabled, percent (-10 to 10) or targetDuration (s), skipSlates (s)}; videoLimiter {enabled, min, max (percent of legal range), compression}; loudness (see audio). Positions: topLeft, topCenter, topRight, centerLeft, center, centerRight, bottomLeft, bottomCenter, bottomRight. Look with preview_frame after turning one on.",
    "captions": "captions {mode: none|burnin|sidecar|embed, source: auto (a .srt/.vtt/.scc/.ttml beside the source, then an embedded caption stream) or a path, format (sidecar: srt, vtt, scc, ttml), language, size, color, background, position: bottom|top}. embed works in mp4, mov, mkv and webm; elsewhere a sidecar is written. captions.read {path} and captions.convert {path, to} work on files.",
    "metadata": "metadata {mode: retain|clear|custom, fields {title, artist, author, comment, description, copyright, keywords, album, genre, date}, xmpSidecar (an .xmp beside the file)}.",
    "publish": "publish is a list of destinations run after the encode: {type: folder, path, deleteLocal}, {type: ftp, host, port, user, password, remotePath, tls, retries}, {type: s3, endpoint, region, bucket, prefix, accessKey, secretKey}, {type: webhook, url, secret} (POSTs JSON, signed with HMAC-SHA256 in x-formencoder-signature), {type: family, app: formcut|formvfx, project} (imports the file there), {type: youtube, clientId, clientSecret, refreshToken, title, description, tags, categoryId, privacy, madeForKids} (resumable upload with an OAuth refresh token that has the youtube.upload scope), {type: vimeo, accessToken, title, description, privacy} (tus upload), {type: facebook, appId, userToken, pageId, pageToken, title, description, graphVersion} (resumable upload, then published to the Page), {type: plugin, plugin, options} (a plug-in that takes the publish event). title may use {name}, {source} and {preset}. Results show on the output (encode.report).",
    "watch": "watch.add {folder, preset or outputs, kind: encode|analysis, moveSources (default true)}: files dropped in the folder are queued with its outputs and encoded when Auto-Encode Watch Folders is on (queue.autoEncodeWatch {enabled}); outputs go to an Output subfolder, originals move to Source/[date-time]. Image sequences are recognised. watch.addOutput, watch.setOutput, watch.removeOutput, watch.setActive, watch.remove, watch.scan.",
    "ingest": "ingest.copy {paths (files or card folders), destination, verify: size|md5|bit, preset (an ingest preset or any encoding preset to also transcode), transcodeFolder}. proxy.create {paths, preset (proxy presets: system/proxy-prores, system/proxy-h264-720...)} writes [source]_Proxy files in a Proxies folder. analyze.media {paths} writes a .feanalysis.json with scene changes, black frames, silences and loudness.",
    "family": "family {action: discover} reports which of formcut (8040), formvfx (8250), formwav (8060) and formvis (8190) are running. family {action: sources, app}. family {action: add, app, id or name, preset, in, out, start}: formcut exports the project through its own renderer then formencoder encodes it; formvfx comps are pulled frame by frame over Live Link (no render in formvfx) with their audio; formwav sessions are mixed by formwav; formvis images become stills or sequences. A .fvxlink file: family {action: addLink, path}. family {action: send, app: formcut|formvfx, files} imports finished files there.",
    "presets": "presets {action: list, query, category} · get {preset} · create {name, settings or fromOutput, group, comment} · update {preset, name, settings, group} · delete · duplicate {preset, name} · alias {preset, alias} · import {path} (.fepreset, JSON, or a Media Encoder .epr: format, frame size, rate, bitrates and sample rate are read) · export {preset, path}. User presets live in the formencoder data folder as .fepreset JSON.",
    "ui": "ui {action: state} is what the person sees. ui {action: panel, panel: queue|encoding|watch|media|presets|family|log|info|terminal|agents}; ui {action: workspace, name: Default|Encoding|Ingest|Agent}; ui {action: exportSettings, output} opens the Export Settings window on an output; ui {action: toast, text} shows a message; ui {action: demo, id: queue|broadcast|inspect} opens a demo in the window as a new queue with its media (the person is asked first when the queue has sources, and Undo brings their queue back).",
}

RECIPES = {
    "youtube_version": ("A YouTube version of a file", [("path", "absolute path of the source file", True)],
                        "Make a YouTube upload of {path}. Call status, then probe {path}. Find YouTube presets with presets {action: list, query: youtube} and pick the one whose frame size and rate are not above the source's. Encode with encode {paths: [{path}], preset}. Report the output path with the frame size, frame rate and duration that verify measured, and say which checks failed if any did."),
    "broadcast_master": ("A broadcast master with normalised loudness", [("path", "absolute path of the source file", True), ("standard", "ebu-r128 (default) or atsc-a85", False)],
                         "Make a broadcast master of {path} normalised to {standard}. Call status and probe {path} with loudness true. Choose a broadcast MXF preset (presets {action: list, category: Broadcast}). Queue it with queue_add_source (or execute queue.addSource), then export_settings {output, settings: {\"effects.loudness.enabled\": true, \"effects.loudness.standard\": \"{standard}\"}}. Start the queue, wait, then verify {output, loudness: true} and quote the measured integrated loudness and true peak, not the target."),
    "proxies": ("Proxies for a folder of media", [("folder", "absolute path of a folder of media", True), ("preset", "a proxy preset, default system/proxy-h264-720", False)],
                "Make proxies for every video in {folder} with {preset}. List the files with media_browse {path: {folder}, filter: video}. Queue them with proxy_create {paths, preset: {preset}, start: true}, wait for the outputs, verify one of them, and report where the Proxies folder is and how many files were written."),
    "review_copy": ("A review copy with burnt-in timecode and a label", [("path", "absolute path of the source file", True), ("text", "label text, default FOR REVIEW ONLY", False)],
                    "Make a review copy of {path} with burnt-in timecode and the label {text}. Queue it with a small H.264 preset, then export_settings {output, settings: {\"effects.timecodeOverlay.enabled\": true, \"effects.textOverlay.enabled\": true, \"effects.textOverlay.text\": \"{text}\"}}. Look at preview_frame {output, time: 1} before encoding and fix anything that covers the picture badly. Encode, wait, verify, and report the file."),
}
_RECIPE_DEFAULTS = {"standard": "ebu-r128", "preset": "system/proxy-h264-720", "text": "FOR REVIEW ONLY"}

PROMPTS = [{"name": "workflow", "title": "How to encode with formencoder", "description": "The loop for sources, outputs, export settings, previews, encoding, verifying and the form family.", "arguments": []}] + [
    {"name": k, "title": v[0], "description": v[0] + ", step by step with the formencoder tools.", "arguments": [{"name": a, "description": d, "required": r} for a, d, r in v[1]]} for k, v in RECIPES.items()]


def prompt(name: str, arguments: dict | None) -> dict | None:
    if name == "workflow":
        return {"description": PROMPTS[0]["description"], "messages": [{"role": "user", "content": {"type": "text", "text": WORKFLOW}}]}
    if name not in RECIPES:
        return None
    title, params, body = RECIPES[name]
    values = {**_RECIPE_DEFAULTS, **{k: str(v) for k, v in (arguments or {}).items() if v not in (None, "")}}
    missing = [a for a, _, r in params if r and a not in values]
    if missing:
        raise ValueError(f"the {name} prompt needs {', '.join(missing)}")
    for a, _, _ in params:
        body = body.replace("{" + a + "}", values.get(a, ""))
    return {"description": title, "messages": [{"role": "user", "content": {"type": "text", "text": body}}]}

_REFS = {"description": "Output id, item id, '#n' (the nth item), 'selected' or 'all'; or a list of them.", "anyOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}}]}
_OUTPUT = {"type": "string", "description": "Output id (o-...) or '#n' for the nth item's first output."}
_PRESET = {"type": "string", "description": "Preset id (system/youtube-1080p, user/...), name or alias."}
_SETTINGS = {"type": "object", "additionalProperties": True, "description": "Export settings patch: nested objects or dotted keys (video.targetBitrate)."}


def _tool(name: str, description: str, props: dict, required: list[str] | None = None, **hints: bool) -> dict:
    return {
        "name": name,
        "description": description,
        "inputSchema": {"type": "object", "properties": props, "required": required or [], "additionalProperties": False},
        "annotations": {"readOnlyHint": hints.get("read", False), "destructiveHint": hints.get("destructive", False), "idempotentHint": hints.get("idempotent", False), "openWorldHint": hints.get("world", False)},
    }


TOOLS = [
    _tool("status", "Start here. The queue (items, outputs by status, running or paused), what is encoding now with progress, FFmpeg and the hardware encoders found, watch folders, the last messages, how many formencoder windows are watching and the suggested next step.", {}, read=True, idempotent=True),
    _tool("list_commands", "formencoder's commands (every menu item and button is one): id, label, menu, parameter summary, whether it is undoable or a query. Filter by text, namespace (queue, encode, preset, watch, format, media, captions, lut, log, prefs, family, ui, ingest, proxy, analyze) or menu name.",
          {"filter": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 500, "default": 200}}, read=True, idempotent=True),
    _tool("describe_command", "One command in full: label, menu, documentation and JSON Schema of its parameters.", {"command": {"type": "string"}}, ["command"], read=True, idempotent=True),
    _tool("execute", "Runs one formencoder command by id with its parameters (see describe_command) and returns its result. Undoable commands are one step in the person's History.",
          {"command": {"type": "string"}, "params": {"type": "object", "additionalProperties": True}}, ["command"]),
    _tool("batch", "Runs several commands as one undo step. Each step is {command, params}; a string \"$N.key\" in a later step is replaced by step N's result field, counting from 1 (\"$1.output\" is the output the first queue.addSource made). atomic (default true) undoes everything if a step fails.",
          {"steps": {"type": "array", "items": {"type": "object", "properties": {"command": {"type": "string"}, "params": {"type": "object", "additionalProperties": True}}, "required": ["command"]}, "minItems": 1, "maxItems": 500},
           "label": {"type": "string", "maxLength": 120}, "atomic": {"type": "boolean", "default": True}}, ["steps"]),
    _tool("probe", "Media information of a file: kind, duration, container, video (codec, size, rate, pixel format, bit depth, chroma, field order, colour, HDR, rotation, frames), audio streams, subtitles, timecode, tags; with loudness, its integrated loudness, range and true peak.",
          {"path": {"type": "string"}, "loudness": {"type": "boolean", "default": False}, "frameRate": {"type": "number", "description": "for an image sequence"}}, ["path"], read=True, idempotent=True),
    _tool("encode", "The quick path: queues files (absolute paths) with a preset or settings, starts the queue, waits for the outputs and verifies each file. settings patches the preset. outputs gives several outputs per file instead ([{preset, settings, folder}]). stitch joins the files into one output. Returns each output's status, file, notes and verification.",
          {"paths": {"type": "array", "items": {"type": "string"}, "minItems": 1}, "preset": _PRESET, "format": {"type": "string"}, "settings": _SETTINGS, "folder": {"type": "string"},
           "outputs": {"type": "array", "items": {"type": "object", "additionalProperties": True}}, "stitch": {"type": "boolean", "default": False}, "wait": {"type": "boolean", "default": True},
           "verify": {"type": "boolean", "default": True}, "timeout": {"type": "number", "minimum": 5, "maximum": 86400, "default": 3600}}, ["paths"]),
    _tool("queue", "The queue: list (items and outputs), start, pause, stop, stopCurrent {refs}, clearDone, remove {refs}, resetStatus {refs} (encode again), skip {refs, skip}, duplicate {refs}, reorder {item, to}, setPreset {refs, preset}, setOutput {refs, path|folder|name}, setRange {refs, mode, in, out}, addOutput {item, preset}.",
          {"action": {"type": "string", "enum": ["list", "start", "pause", "stop", "stopCurrent", "clearDone", "remove", "resetStatus", "skip", "duplicate", "reorder", "setPreset", "setOutput", "setRange", "addOutput"]},
           "refs": _REFS, "item": {"type": "string"}, "to": {"type": "integer"}, "skip": {"type": "boolean"}, "preset": _PRESET, "path": {"type": "string"}, "folder": {"type": "string"}, "name": {"type": "string"},
           "mode": {"type": "string", "enum": ["entire", "inout", "custom", "workArea"]}, "in": {"type": "number"}, "out": {"type": "number"}}, ["action"]),
    _tool("export_settings", "Reads one output's complete export settings with its summary, file and source; with settings, first patches them (one undo step; replace swaps the whole object). formats {format} lists the fields.",
          {"output": _OUTPUT, "settings": _SETTINGS, "replace": {"type": "boolean", "default": False}}, ["output"]),
    _tool("preview_frame", "Renders one frame through an output's exact export settings (scaling, crop, rotation, LUT, SDR conform, limiter, overlays, burnt-in captions) and returns the image, so you see what the encode will look like. view source shows the untouched source frame instead (the Compare view). Give output, or path with preset or settings for a file not in the queue. time is seconds from the start of the range.",
          {"output": _OUTPUT, "path": {"type": "string"}, "preset": _PRESET, "settings": _SETTINGS, "patch": _SETTINGS, "time": {"type": "number", "default": 0}, "width": {"type": "integer", "minimum": 64, "maximum": 3840, "default": 960}, "view": {"type": "string", "enum": ["output", "source"], "default": "output"}}, read=True, idempotent=True),
    _tool("contact_sheet", "Several frames of an output (or a file) through its export settings in one labelled grid: checks a range, a Fit Tuning, overlays and captions over time in one look.",
          {"output": _OUTPUT, "path": {"type": "string"}, "preset": _PRESET, "settings": _SETTINGS, "count": {"type": "integer", "minimum": 2, "maximum": 24, "default": 8}, "times": {"type": "array", "items": {"type": "number"}},
           "width": {"type": "integer", "minimum": 64, "maximum": 960, "default": 360}, "columns": {"type": "integer", "minimum": 1, "maximum": 8}, "view": {"type": "string", "enum": ["output", "source"], "default": "output"}}, read=True, idempotent=True),
    _tool("wait", "Waits until the given outputs (or the whole queue) are done, failed or stopped, up to timeout seconds. Returns each output's status, file, error and notes.",
          {"outputs": {"type": "array", "items": {"type": "string"}}, "timeout": {"type": "number", "minimum": 1, "maximum": 86400, "default": 600}}, read=True),
    _tool("verify", "Probes an encoded file and checks it against its output's settings: frame size, frame rate, duration, video and audio codecs, sample rate and, when loudness was normalised, the measured loudness against the target. Give output (or path for any file; loudness true to measure it).",
          {"output": _OUTPUT, "path": {"type": "string"}, "loudness": {"type": "boolean", "default": False}}, read=True, idempotent=True),
    _tool("presets", "The Preset Browser: list {query, category, kind} (93 system encoding presets in Web Video, Social Media, Devices, Mezzanine, Broadcast, Cinema, DVD, Image Sequence, Image, Animated GIF, Audio Only, Archive, Proxy and Form Family, plus 5 Ingest presets), get {preset}, create {name, settings or fromOutput, group, comment}, update, delete, duplicate, alias, import {path} (.fepreset, JSON or Media Encoder .epr), export {preset, path}.",
          {"action": {"type": "string", "enum": ["list", "get", "create", "update", "delete", "duplicate", "alias", "import", "export"]}, "preset": _PRESET, "query": {"type": "string"}, "category": {"type": "string"},
           "kind": {"type": "string", "enum": ["encode", "ingest"]}, "name": {"type": "string"}, "settings": {"type": "object", "additionalProperties": True}, "fromOutput": {"type": "string"}, "group": {"type": "string"},
           "comment": {"type": "string"}, "alias": {"type": "string"}, "path": {"type": "string"}}, ["action"]),
    _tool("formats", "Without format: the 40 formats with their codecs. With format (or output): every export setting of it (key, label, type, options, unit, showIf), its codecs with the encoders this machine has, the effect defaults, loudness standards and the complete default settings.",
          {"format": {"type": "string"}, "output": _OUTPUT}, read=True, idempotent=True),
    _tool("watch_folder", "Watch folders: list, add {folder, preset or outputs, kind: encode|analysis, moveSources}, remove {watch}, setActive {watch, active}, addOutput {watch, preset, settings, folder}, setOutput {output, preset, settings, folder}, removeOutput {output}, scan (queue what is there now), autoEncode {enabled}.",
          {"action": {"type": "string", "enum": ["list", "add", "remove", "setActive", "addOutput", "setOutput", "removeOutput", "scan", "autoEncode"]}, "folder": {"type": "string"}, "watch": {"type": "string"}, "output": {"type": "string"},
           "preset": _PRESET, "format": {"type": "string"}, "settings": {"type": "object", "additionalProperties": True}, "outputs": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
           "kind": {"type": "string", "enum": ["encode", "analysis"]}, "moveSources": {"type": "boolean"}, "active": {"type": "boolean"}, "enabled": {"type": "boolean"}}, ["action"]),
    _tool("family", "The form family: discover (which of formcut, formvfx, formwav and formvis are running here), sources {app} (their projects, comps, sessions, images), add {app, id or name, preset, settings, folder, in, out, start} queues one (formcut renders it, formvfx streams it over Live Link, formwav mixes it, formvis hands the image), addLink {path} queues a formvfx .fvxlink, send {app: formcut|formvfx, files, project} imports finished files there, linkFormcut {preset, folder, start} makes every formcut export arrive here (through formcut's signed webhooks) and encode with that preset, unlinkFormcut stops it, links shows the link. An app that is not running is started headless (its engine only) when formencoder finds it.",
          {"action": {"type": "string", "enum": ["discover", "sources", "add", "addLink", "send", "linkFormcut", "unlinkFormcut", "links"]}, "app": {"type": "string", "enum": ["formcut", "formvfx", "formwav", "formvis"]}, "id": {"type": "string"}, "name": {"type": "string"},
           "path": {"type": "string"}, "files": {"type": "array", "items": {"type": "string"}}, "project": {"type": "string"}, "preset": _PRESET, "settings": {"type": "object", "additionalProperties": True},
           "folder": {"type": "string"}, "in": {"type": "number"}, "out": {"type": "number"}, "start": {"type": "boolean", "default": False}}, ["action"], world=True),
    _tool("log", "The Encoding log (every finished output: source, file, format, preset, encoder, time, size, notes) or the Error log (failures with FFmpeg's last lines).",
          {"kind": {"type": "string", "enum": ["encoding", "error"], "default": "encoding"}, "limit": {"type": "integer", "minimum": 1, "maximum": 2000, "default": 80}}, read=True, idempotent=True),
    _tool("history", "Undo, redo or list the queue history.", {"action": {"type": "string", "enum": ["undo", "redo", "list"]}, "steps": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1}}, ["action"]),
    _tool("ui", "The formencoder window: state, or show a panel, switch workspace, open Export Settings on an output, show a message, or open one of the three demos (queue, broadcast, inspect) as a new queue.",
          {"action": {"type": "string", "enum": ["state", "panel", "workspace", "exportSettings", "toast", "demo"]}, "panel": {"type": "string"}, "name": {"type": "string"}, "output": {"type": "string"}, "text": {"type": "string"}, "id": {"type": "string", "enum": ["queue", "broadcast", "inspect"]}}, ["action"]),
    _tool("guide", "formencoder know-how for agents: workflow, queue, settings, video, audio, effects, captions, metadata, publish, watch, ingest, family, presets, ui.", {"topic": {"type": "string"}}, read=True, idempotent=True),
    _tool("approval_status", "The decision on an action that waited for the person's approval (a pendingApproval id from an earlier call): pending, approved with its result, declined, or failed with the reason.",
          {"id": {"type": "integer"}}, ["id"], read=True, idempotent=True),
    _tool("terminal_list", "The terminals open in formencoder's Terminal panel and by agents: id, title, folder, whether the shell has exited.", {}, read=True, idempotent=True),
    _tool("terminal_open", "Opens a terminal in formencoder (a real shell in the agent workspace, or folder), shown to the person as a tab; command runs in it at once (needs the person's approval). Returns its id for terminal_send and terminal_read.",
          {"title": {"type": "string", "maxLength": 80}, "cwd": {"type": "string", "description": "absolute folder, default the agent workspace"}, "command": {"type": "string"}}),
    _tool("terminal_send", "Types text into a terminal and presses Enter (enter false to leave the line unfinished), then returns what the terminal printed in the next wait seconds. The person sees it happen; it needs their approval unless they turned on full faith. ./formencoder ID --name value works in every formencoder terminal.",
          {"session": {"type": "string"}, "text": {"type": "string"}, "enter": {"type": "boolean", "default": True}, "wait": {"type": "number", "minimum": 0, "maximum": 30, "default": 1.5}}, ["session", "text"], destructive=True),
    _tool("terminal_read", "What a terminal printed, colour codes removed: the whole kept history, or only what came after since (the offset an earlier read returned). Returns the text, the new offset and whether the shell exited.",
          {"session": {"type": "string"}, "since": {"type": "integer", "minimum": 0}, "max_chars": {"type": "integer", "minimum": 200, "maximum": 100000, "default": 8000}}, ["session"], read=True, idempotent=True),
    _tool("extensions_list", "The extensions loaded in formencoder (Form Extension Contract, API 1, installed by FormPortal or run from a form.ext folder): id, name, version, source (catalogue, sideload, development), state (ready, needs-permission, refused with its reason), permissions, panels and the commands extension_command runs.", {}, read=True, idempotent=True),
    _tool("extension_command", "Runs a command an extension contributes (extensions_list shows them) in the open formencoder window, where the extension runs in its sandbox, and returns what the extension reports. The first run of an extension version asks the person in the window to allow its permissions; if they choose Not Now the call fails. Changes the extension makes to the queue are undoable History steps.",
          {"id": {"type": "string", "description": "the extension id"}, "command": {"type": "string", "description": "one of its command ids"}, "args": {"type": "object", "additionalProperties": True}}, ["id", "command"]),
    _tool("terminal_close","Closes a terminal and ends what runs in it. Closing one this agent did not open needs the person's approval.", {"session": {"type": "string"}}, ["session"], destructive=True),
]
NAMES = {t["name"] for t in TOOLS}
READ_ONLY = {t["name"] for t in TOOLS if t["annotations"]["readOnlyHint"]}
_PARAMS: dict[str, set[str]] = {}

_COMMANDS: dict[str, dict] = {}
_COMMAND_TOOLS: list[dict] = []


def _command_tool(r: dict) -> dict:
    where = f"{r['menu']} > {r['label']}" if r.get("menu") else r["label"]
    doc = (r.get("doc") or "").strip()
    kind = "Read-only." if r.get("query") else ("One undo step in the person's History." if r.get("undoable") else "Not undoable.")
    ann = {k: v for k, v in (r.get("annotations") or {}).items() if k != "title"}
    return {"name": r["mcpName"], "title": r["label"], "description": f"{where} (command {r['id']}). {doc + ' ' if doc else ''}{kind}",
            "inputSchema": r.get("schema") or {"type": "object", "properties": {}}, "annotations": {"title": r["label"], **ann},
            "_meta": {"formencoder/command": r["id"], "formencoder/category": r.get("category")}}


async def command_tools() -> list[dict]:
    if not _COMMAND_TOOLS:
        rows = json.loads(await host.call(lambda e: e.command_list(None, True)))
        for r in rows:
            name = r.get("mcpName")
            if name and name not in NAMES and name not in _COMMANDS:
                _COMMANDS[name] = r
                _COMMAND_TOOLS.append(_command_tool(r))
    return _COMMAND_TOOLS


def categories(profile: str | None) -> set[str] | None:
    p = (profile or "full").strip().lower()
    if p in ("", "full", "all"):
        return None
    return {x.strip() for x in p.split(",") if x.strip() and x.strip() != "core"}


async def listing(profile: str | None) -> list[dict]:
    cmds = await command_tools()
    cats = categories(profile)
    return TOOLS + (cmds if cats is None else [t for t in cmds if t["_meta"]["formencoder/category"] in cats])


async def known(name: str) -> bool:
    if name in NAMES:
        return True
    await command_tools()
    return name in _COMMANDS


def read_only(name: str) -> bool:
    return name in READ_ONLY or bool(_COMMANDS.get(name, {}).get("query"))


RESOURCES = [
    {"uri": "formencoder://status", "name": "status", "title": "Status", "description": "Queue counts, what is encoding, FFmpeg and hardware encoders, watch folders and the next step.", "mimeType": "application/json"},
    {"uri": "formencoder://queue", "name": "queue", "title": "Queue", "description": "Every item and output with its status, preset, file and progress.", "mimeType": "application/json"},
    {"uri": "formencoder://presets", "name": "presets", "title": "Presets", "description": "Every system, ingest and user preset: id, name, category, format, frame size and rate.", "mimeType": "application/json"},
    {"uri": "formencoder://formats", "name": "formats", "title": "Formats", "description": "The 40 formats with their codecs and the encoders this machine has.", "mimeType": "application/json"},
    {"uri": "formencoder://encoders", "name": "encoders", "title": "Encoders", "description": "FFmpeg, its origin and licence, and the hardware and software encoders that work here.", "mimeType": "application/json"},
    {"uri": "formencoder://commands", "name": "commands", "title": "Commands", "description": "Every command: id, MCP tool name, label, menu, parameters and annotations.", "mimeType": "application/json"},
    {"uri": "formencoder://log/encoding", "name": "log-encoding", "title": "Encoding log", "description": "The last finished outputs with file, format, preset, encoder, time and size.", "mimeType": "application/json"},
    {"uri": "formencoder://log/error", "name": "log-error", "title": "Error log", "description": "The last failures with FFmpeg's own last lines.", "mimeType": "application/json"},
] + [{"uri": f"formencoder://guide/{k}", "name": f"guide-{k}", "title": f"Guide: {k}", "description": f"formencoder know-how for agents on {k}.", "mimeType": "text/markdown"} for k in GUIDES]

RESOURCE_TEMPLATES = [
    {"uriTemplate": "formencoder://output/{id}", "name": "output", "title": "Output settings", "description": "One output's complete export settings, summary, file and source.", "mimeType": "application/json"},
    {"uriTemplate": "formencoder://preset/{id}", "name": "preset", "title": "Preset", "description": "One preset with its settings (ids look like system/youtube-1080p).", "mimeType": "application/json"},
    {"uriTemplate": "formencoder://format/{id}", "name": "format", "title": "Format fields", "description": "Every export setting of one format with options, the encoders here and the defaults.", "mimeType": "application/json"},
    {"uriTemplate": "formencoder://command/{id}", "name": "command", "title": "Command", "description": "One command in full with its JSON Schema and annotations.", "mimeType": "application/json"},
]


async def read_resource(uri: str, source: str) -> dict:
    prefix = "formencoder://"
    if not uri.startswith(prefix):
        raise ValueError(f"no resource {uri}")
    path = uri[len(prefix):]
    kind, _, rest = path.partition("/")
    if kind == "guide":
        body = GUIDES.get(rest or "index")
        if body is None:
            raise ValueError(f"no guide {rest!r}; topics: {', '.join(GUIDES)}")
        return {"contents": [{"uri": uri, "mimeType": "text/markdown", "text": body}]}
    if kind == "status":
        value: Any = await _status(source)
    elif kind == "queue":
        value = await ex("queue.list", {}, source)
    elif kind == "presets":
        value = await ex("preset.list", {}, source)
        value = {"groups": value.get("groups"), "presets": [{k: p.get(k) for k in ("id", "name", "category", "format", "frameSize", "frameRate", "targetRate", "comment")} for p in value.get("presets", [])]}
    elif kind == "formats":
        value = await ex("format.list", {}, source)
    elif kind == "encoders":
        value = await ex("format.encoders", {}, source)
    elif kind == "commands":
        value = [{k: r.get(k) for k in ("id", "mcpName", "label", "menu", "params", "annotations")} for r in await rpc.dispatch("command.list", {}, source)]
    elif kind == "log" and rest in ("encoding", "error"):
        value = await ex("log.read", {"kind": rest, "limit": 80}, source)
    elif kind == "output" and rest:
        value = await ex("queue.getSettings", {"output": rest}, source)
    elif kind == "preset" and rest:
        value = await ex("preset.get", {"preset": rest}, source)
    elif kind == "format" and rest:
        value = await ex("format.describe", {"format": rest}, source)
    elif kind == "command" and rest:
        value = await rpc.dispatch("command.describe", {"command": rest}, source)
    else:
        raise ValueError(f"no resource {uri}")
    return {"contents": [{"uri": uri, "mimeType": "application/json", "text": json.dumps(value, indent=1, ensure_ascii=False)}]}


def text(value: Any) -> dict:
    body = value if isinstance(value, str) else json.dumps(value, indent=1, ensure_ascii=False)
    return {"content": [{"type": "text", "text": body}]}


def fail(message: str) -> dict:
    return {"content": [{"type": "text", "text": message}], "isError": True}


def image(png: bytes, caption: str) -> dict:
    return {"content": [{"type": "image", "data": base64.b64encode(png).decode(), "mimeType": "image/png"}, {"type": "text", "text": caption}]}


async def ex(command: str, params: dict | None, source: str) -> Any:
    return await rpc.execute(command, params or {}, source)


async def cmd(command: str, args: dict, source: str) -> Any:
    if command not in _PARAMS:
        row = json.loads(await host.call(lambda e: e.describe(command)))
        _PARAMS[command] = set((row.get("schema") or {}).get("properties", {}).keys())
    keep = _PARAMS[command]
    return await ex(command, {k: v for k, v in args.items() if k in keep and v is not None}, source)


def _short(o: dict) -> dict:
    return {k: o.get(k) for k in ("id", "status", "formatLabel", "presetName", "path", "progress", "eta", "error", "notes", "loudness", "publish") if o.get(k) not in (None, [], "")}


async def _status(source: str) -> dict:
    st = await ex("app.status", {}, source)
    st["windows"] = len(host.bus.windows())
    st["version"] = __version__
    from . import workspace

    st["workspace"] = workspace.root().as_posix()
    return st


async def _encode(args: dict, source: str) -> dict:
    params = {k: args[k] for k in ("paths", "preset", "format", "settings", "folder", "outputs", "stitch") if args.get(k) is not None}
    params["start"] = True
    added = await ex("queue.addSource", params, source)
    outs = [o for row in added.get("added") or [] for o in row.get("outputs") or []]
    if not outs and added.get("output"):
        outs = [added["output"]]
    if not args.get("wait", True):
        return {"queued": outs, "next": "wait {outputs} then verify {output}"}
    done = await rpc.wait(outs, float(args.get("timeout") or 3600))
    if args.get("verify", True):
        for o in done["outputs"]:
            if o.get("status") == "done":
                try:
                    o["verify"] = await ex("encode.verify", {"output": o["id"]}, source)
                except RpcError as exc:
                    o["verify"] = {"error": str(exc)}
    return done


async def _preview(args: dict, sheet: bool, source: str) -> dict:
    params = {k: args[k] for k in ("output", "path", "preset", "settings", "patch", "time", "times", "width", "columns", "view") if args.get(k) is not None}
    if sheet and "times" not in params:
        params["count"] = int(args.get("count") or 8)
    png, meta = await rpc.preview(params)
    summary = meta.get("summary") or {}
    out = meta.get("output") or {}
    caption = f"{meta.get('view')} · {meta.get('frames')} frame(s) at {', '.join(f'{t:.2f}s' for t in meta.get('times') or [])} of {meta.get('duration', 0):.2f}s"
    if out:
        caption += f" · output {out.get('width')}x{out.get('height')}"
    if summary:
        caption += f" · {summary.get('video') or ''}"
    if out.get("notes"):
        caption += " · notes: " + "; ".join(out["notes"])
    return image(png, caption)


async def _call(name: str, args: dict, source: str) -> dict:
    if name == "status":
        return text(await _status(source))
    if name == "list_commands":
        rows = await rpc.dispatch("command.list", {"filter": args.get("filter")}, source)
        return text(rows[: int(args.get("limit") or 200)])
    if name == "describe_command":
        return text(await rpc.dispatch("command.describe", {"command": args["command"]}, source))
    if name == "execute":
        return text(await ex(args["command"], args.get("params") or {}, source))
    if name == "batch":
        return text(await rpc.batch(args["steps"], args.get("label"), bool(args.get("atomic", True)), source))
    if name == "probe":
        return text(await cmd("media.probe", args, source))
    if name == "encode":
        return text(await _encode(args, source))
    if name == "queue":
        action = args["action"]
        if action == "list":
            st = await ex("queue.list", {}, source)
            return text({"running": st["running"], "paused": st["paused"], "counts": st["counts"],
                         "items": [{"id": it["id"], "index": it["index"], "name": it["name"], "kind": it["kind"], "video": it["video"], "audio": it["audio"], "duration": it["duration"], "missing": it["missing"],
                                    "outputs": [_short(o) for o in it["outputs"]]} for it in st["items"]]})
        rest = {k: v for k, v in args.items() if k != "action"}
        if action in ("start", "pause", "stop", "clearDone"):
            rest = {}
        return text(await cmd(f"queue.{action}", rest, source))
    if name == "export_settings":
        if args.get("settings") is not None:
            await ex("queue.setSettings", {"refs": [args["output"]], "settings": args["settings"], "replace": bool(args.get("replace"))}, source)
        return text(await ex("queue.getSettings", {"output": args["output"]}, source))
    if name == "preview_frame":
        return await _preview(args, False, source)
    if name == "contact_sheet":
        return await _preview(args, True, source)
    if name == "wait":
        return text(await rpc.wait(args.get("outputs"), float(args.get("timeout") or 600)))
    if name == "verify":
        return text(await cmd("encode.verify", args, source))
    if name == "presets":
        action = args["action"]
        rest = {k: v for k, v in args.items() if k != "action"}
        result = await cmd(f"preset.{action}", rest, source)
        if action == "list":
            result = {"count": len(result.get("presets", [])), "groups": result.get("groups"),
                      "presets": [{k: p.get(k) for k in ("id", "name", "category", "format", "frameSize", "frameRate", "targetRate", "comment")} for p in result.get("presets", [])]}
        return text(result)
    if name == "formats":
        if args.get("format") or args.get("output"):
            return text(await cmd("format.describe", args, source))
        return text(await ex("format.list", {}, source))
    if name == "watch_folder":
        action = args["action"]
        if action == "autoEncode":
            return text(await ex("queue.autoEncodeWatch", {"enabled": bool(args.get("enabled", True))}, source))
        rest = {k: v for k, v in args.items() if k != "action"}
        return text(await cmd(f"watch.{action}", rest, source))
    if name == "family":
        action = args["action"]
        rest = {k: v for k, v in args.items() if k != "action" and v is not None}
        return text(await rpc.dispatch(f"family.{action}", rest, source))
    if name == "log":
        return text(await ex("log.read", {"kind": args.get("kind") or "encoding", "limit": int(args.get("limit") or 80)}, source))
    if name == "history":
        action = args["action"]
        if action == "list":
            return text(await ex("history.list", {}, source))
        out = None
        for _ in range(int(args.get("steps") or 1)):
            out = await ex(f"edit.{action}", {}, source)
        return text(out)
    if name == "ui":
        action = args["action"]
        if action == "state":
            st = await rpc.state()
            return text({"windows": len(host.bus.windows()), "running": st["running"], "paused": st["paused"], "counts": st["counts"], "selection": st["selection"], "undo": st["undo"], "redo": st["redo"]})
        if action == "toast":
            return text(await ex("ui.toast", {"text": args.get("text") or ""}, source))
        if action == "exportSettings":
            return text(await ex("ui.exportSettings", {"output": args.get("output")}, source))
        if action == "panel":
            return text(await ex("ui.panel", {"panel": args.get("panel")}, source))
        if action == "demo":
            demo = str(args.get("id") or "")
            if demo not in ("queue", "broadcast", "inspect"):
                return fail("ui demo needs id: queue, broadcast or inspect")
            if not host.bus.windows():
                return fail("no formencoder window is open to open the demo in")
            host.bus.publish({"type": "uiAction", "action": "demo", "id": demo}, ("ui",))
            return text({"opening": demo, "next": "the window opens it as a new queue (asking the person first when the queue has sources; Undo brings the old queue back); status shows it once it is there"})
        return text(await ex("ui.workspace", {"name": args.get("name")}, source))
    if name == "guide":
        topic = str(args.get("topic") or "index")
        return text(GUIDES.get(topic) or f"No guide {topic!r}. {GUIDES['index']}")
    if name == "approval_status":
        return text(approvals.status(int(args["id"])))
    if name == "extensions_list":
        return text(await rpc.dispatch("extensions.list", {}, source))
    if name == "extension_command":
        return text(await rpc.dispatch("extensions.run", {"id": args["id"], "command": args["command"], "args": args.get("args") or {}}, source))
    if name.startswith("terminal_"):
        return await _terminal(name, args, source)
    if name in _COMMANDS:
        return text(await ex(_COMMANDS[name]["id"], args, source))
    return fail(f"No tool named {name}")


_ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|\r(?!\n)")


def _plain(raw: str, limit: int) -> str:
    out = _ANSI.sub("", raw)
    return out if len(out) <= limit else "[earlier output cut]\n" + out[-limit:]


async def _terminal(name: str, args: dict, source: str) -> dict:
    from ..routers.terminal import hub

    if name == "terminal_list":
        return text({"sessions": hub.listing()})
    if name == "terminal_open":
        term = hub.open(args.get("title"), args.get("cwd"), 120, 32, f"http://127.0.0.1:{config.PORT}", run=args.get("command") or None)
        term.opener = source
        return text({**term.row(), "next": "terminal_send {session, text} to type, terminal_read {session} to read"})
    term = hub.get(str(args["session"]))
    if name == "terminal_send":
        before = term.offset
        term.write(str(args["text"]) + ("\r" if args.get("enter", True) else ""))
        await asyncio.sleep(float(args.get("wait", 1.5) or 0))
        out, offset = term.read(before)
        return text({"session": term.id, "output": _plain(out, 8000), "offset": offset, "exited": term.exited})
    if name == "terminal_read":
        since = args.get("since")
        out, offset = term.read(int(since) if since is not None else None)
        return text({"session": term.id, "text": _plain(out, int(args.get("max_chars") or 8000)), "offset": offset, "exited": term.exited})
    if name == "terminal_close":
        hub.close(term.id)
        return text({"closed": term.id})
    return fail(f"No tool named {name}")


def _commands_of(name: str, args: dict) -> list[tuple[str, dict]]:
    if name in _COMMANDS:
        return [(_COMMANDS[name]["id"], args)]
    if name == "execute":
        return [(str(args.get("command") or ""), args.get("params") or {})]
    if name == "batch":
        return [(str(s.get("command") or ""), s.get("params") or {}) for s in args.get("steps") or [] if isinstance(s, dict)]
    if name in ("queue", "presets", "watch_folder"):
        space = {"queue": "queue", "presets": "preset", "watch_folder": "watch"}[name]
        return [(f"{space}.{args.get('action')}", args)]
    if name == "export_settings" and args.get("settings") is not None:
        return [("queue.setSettings", {"settings": args["settings"]})]
    if name == "encode":
        return [("queue.addSource", args)]
    return []


async def _reasons(name: str, args: dict, source: str) -> list[str]:
    why: list[str] = []
    for command, params in _commands_of(name, args):
        why += await approvals.reasons(command, params if isinstance(params, dict) else {})
    if name == "terminal_send" or (name == "terminal_open" and args.get("command")):
        why.append("it types a command into a shell on this computer")
    if name == "terminal_close":
        from ..routers.terminal import hub

        term = hub.terms.get(str(args.get("session")))
        if term is not None and getattr(term, "opener", "ui") != source:
            why.append("it closes a terminal this agent did not open")
    return sorted(set(why))


async def call(name: str, args: dict, source: str) -> dict:
    started = time.monotonic()
    approval = None
    try:
        why = await _reasons(name, args, source)
        if why:
            approval = "full faith" if approvals.full_faith() else "asked"
        out = await approvals.guard(source, name, why, args, lambda: _call(name, args, source))
    except approvals.Pending as p:
        approval = "pending"
        out = text({"pendingApproval": p.request["id"], "why": p.request["why"],
                    "next": "The person approves or declines this in formencoder's Agent Connect panel; call approval_status {id} for the decision and the result. Nothing has run yet."})
    except approvals.Declined as exc:
        approval = "declined"
        out = fail(str(exc))
    except RpcError as exc:
        out = fail(str(exc))
    except (KeyError, TypeError, ValueError, RuntimeError) as exc:
        out = fail(f"{name}: {exc}")
    err = out["content"][0].get("text") if out.get("isError") else None
    approvals.note(source, name, args, not out.get("isError"), (time.monotonic() - started) * 1000, approval=approval, error=err)
    return out
