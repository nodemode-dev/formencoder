from __future__ import annotations

import base64
import json
from typing import Any

from .. import __version__
from ..engine import rpc
from ..engine.host import host
from ..engine.rpc import RpcError

INSTRUCTIONS = (
    "formencoder is a media encoder (an Adobe Media Encoder alternative) running on this computer; the person sees its window and every "
    "queue change you make appears there live, undoable. Start with `status`. The fastest path is `encode` (files + preset, waits, verifies). "
    "For control, a queue item is a source with one or more outputs; each output has export settings (format, video, audio, effects, captions, "
    "metadata, publish) that `export_settings` reads and patches. Look before you encode a long job: `preview_frame` renders one frame of an "
    "output through its exact settings, `contact_sheet` several. Every action is a command: `list_commands`, `describe_command`, `execute`, "
    "`batch` (one undo step; `$N.key` is step N's result, counting from 1). Media from formcut, formvfx, formwav or formvis comes in with `family`. "
    "Never report an encode as good without `verify`. The `guide` tool has recipes; get the `workflow` prompt for the full loop."
)

WORKFLOW = """How to encode with formencoder through these tools.

1. Orient: status (queue counts, what is encoding, FFmpeg and hardware encoders found, watch folders). probe a source to know its size, rate, codecs, timecode, audio layout and loudness (probe {path, loudness: true}).
2. Choose: presets {action: list, query} finds a preset (YouTube, ProRes, DNxHR, XDCAM, WAV, image sequence...). formats {format} shows every export setting of a format with its keys, options and the encoders this machine has.
3. Quick job: encode {paths, preset, folder?, settings?} queues, encodes, waits and verifies in one call. settings is a patch on the preset (nested objects or dotted keys: {"video.targetBitrate": 8, "effects.loudness.enabled": true}).
4. Careful job: execute queue.addSource {paths, preset or outputs: [{preset, settings, folder}]} (several outputs per source encode in parallel), then export_settings {output, settings} to adjust, preview_frame {output, time} to look (overlays, crop, scaling, LUT, captions show), then queue {action: start} and wait {outputs}.
5. Check: verify {output} probes the file against its settings (frame size, rate, duration, codecs, audio, loudness when normalised). Read the notes and the error of failed outputs (log {kind: error} for FFmpeg's own words), fix the settings and queue {action: resetStatus, refs} to encode again.
6. Repeatable work: presets {action: create, name, fromOutput} saves the settings; watch_folder {action: add, folder, preset} encodes whatever lands in a folder.
7. Family: family {action: discover} finds formcut, formvfx, formwav and formvis running here; family {action: sources, app} lists their projects, compositions, sessions and images; family {action: add, app, id, preset} queues one (formcut renders the sequence, formvfx streams the comp over Dynamic Link, formwav mixes the session); family {action: send, app, files} hands finished files back to formcut or formvfx.
8. Mistakes: history {action: undo}. A failed tool says why; read it, fix the params (describe_command shows the schema) and retry.
"""

GUIDES = {
    "index": "Topics: workflow, queue, settings, video, audio, effects, captions, metadata, publish, watch, ingest, family, presets, ui. Call guide {topic}.",
    "workflow": WORKFLOW,
    "queue": "Refs: an output id (o-...), an item id (i-...), '#n' for the nth item (its outputs), 'selected' or 'all'. queue.addSource {paths, preset|format|settings|outputs, folder, stitch, frameRate (image sequence), start}. queue.addOutput {item, preset} adds another output to a source. queue.duplicate, queue.remove, queue.clearDone, queue.reorder {item, to}, queue.skip {refs, skip}, queue.resetStatus {refs} (encode again). queue.setRange {refs, mode: entire|inout|custom, in, out} in source seconds. queue.interpret {item, frameRate, pixelAspect, fieldOrder, alpha, rotation}. queue.stitch {paths} joins clips into one output. queue.save {path} and queue.open {path} keep a queue as .fequeue. Status values: ready, preparing, encoding, paused, done, failed, stopped, skipped.",
    "settings": "Settings object: format, outputName (tokens {source} {preset} {format} {date} {time} {width} {height} {fps} {index}), exportVideo, exportAudio, video{...}, audio{...}, multiplexer{container, fastStart}, range{mode,in,out}, crop{left,top,right,bottom}, rotation (0, 90, 180, 270), scaling (fit, fill, stretch, black, matchSource), timeInterpolation (sampling, blending, opticalFlow), maxRenderQuality, maxDepth, startTimecode, alphaOnly, maxFileSize (MB), effects{...}, captions{...}, metadata{...}, publish[...]. Switching format keeps range, crop, scaling, effects, captions, metadata and publish. formats {format} lists every field with its options and showIf condition.",
    "video": "video: codec, matchSource (width, height and rate from the source), width, height, frameRate (null = source), fieldOrder (progressive, tff, bff, source), pixelAspect, profile, level, bitDepth (8, 10, 12), chroma (420, 422, 444), rateControl (vbr1, vbr2, cbr, quality), targetBitrate and maxBitrate in Mb/s, quality 0 to 100, keyframeDistance (frames), hardware (auto, on, off), colorSpace (rec709, rec2020, rec2100pq, rec2100hlg, rec601...), hdr10 with maxCLL and maxFALL, alpha, sequence (image sequences), startNumber, loop (GIF). H.264 and HEVC use the hardware encoder when one works (formats {format} shows which); vbr2 needs a software encoder.",
    "audio": "audio: codec (aac, pcm, mp3, opus, flac, ac3...), sampleRate, channels (mono, stereo, 5.1, 7.1, source, discrete), bitrate (kb/s), bitDepth (16, 24, 32), float. Loudness is an effect: effects.loudness {enabled, standard: ebu-r128|atsc-a85|itu-bs1770|custom, target LUFS, truePeak dBTP, lra, mode twopass, report (XML beside the file), limiter {enabled, lookahead ms, release ms}}.",
    "effects": "effects (Media Encoder's Effects tab): lut {enabled, path (.cube, see lut.list), intensity}; sdrConform {enabled, brightness, contrast, knee, peak} turns HDR (PQ or HLG) into SDR Rec. 709; imageOverlay {enabled, path, position, offsetX, offsetY, size %, absolute, opacity}; nameOverlay {enabled, prefix, suffix, source: fileName|outputName, position, size, color, background}; textOverlay {enabled, text, position, ...}; timecodeOverlay {enabled, source: media|generate, start, offsetFrames, frameRate, position, ...}; timeTuner {enabled, percent (-10 to 10) or targetDuration (s), skipSlates (s)}; videoLimiter {enabled, min, max (percent of legal range), compression}; loudness (see audio). Positions: topLeft, topCenter, topRight, centerLeft, center, centerRight, bottomLeft, bottomCenter, bottomRight. Look with preview_frame after turning one on.",
    "captions": "captions {mode: none|burnin|sidecar|embed, source: auto (a .srt/.vtt/.scc/.ttml beside the source, then an embedded caption stream) or a path, format (sidecar: srt, vtt, scc, ttml), language, size, color, background, position: bottom|top}. embed works in mp4, mov, mkv and webm; elsewhere a sidecar is written. captions.read {path} and captions.convert {path, to} work on files.",
    "metadata": "metadata {mode: retain|clear|custom, fields {title, artist, author, comment, description, copyright, keywords, album, genre, date}, xmpSidecar (an .xmp beside the file)}.",
    "publish": "publish is a list of destinations run after the encode: {type: folder, path, deleteLocal}, {type: ftp, host, port, user, password, remotePath, tls, retries}, {type: s3, endpoint, region, bucket, prefix, accessKey, secretKey}, {type: webhook, url, secret} (POSTs JSON, signed with HMAC-SHA256 in x-formencoder-signature), {type: family, app: formcut|formvfx, project} (imports the file there). Results show on the output (encode.report).",
    "watch": "watch.add {folder, preset or outputs, kind: encode|analysis, moveSources (default true)}: files dropped in the folder are queued with its outputs and encoded when Auto-Encode Watch Folders is on (queue.autoEncodeWatch {enabled}); outputs go to an Output subfolder, originals move to Source/<date-time>. Image sequences are recognised. watch.addOutput, watch.setOutput, watch.removeOutput, watch.setActive, watch.remove, watch.scan.",
    "ingest": "ingest.copy {paths (files or card folders), destination, verify: size|md5|bit, preset (an ingest preset or any encoding preset to also transcode), transcodeFolder}. proxy.create {paths, preset (proxy presets: system/proxy-prores, system/proxy-h264-720...)} writes <source>_Proxy files in a Proxies folder. analyze.media {paths} writes a .feanalysis.json with scene changes, black frames, silences and loudness.",
    "family": "family {action: discover} reports which of formcut (8040), formvfx (8230), formwav (8060) and formvis (8190) are running. family {action: sources, app}. family {action: add, app, id or name, preset, in, out, start}: formcut exports the project through its own renderer then formencoder encodes it; formvfx comps are pulled frame by frame over Dynamic Link (no render in formvfx) with their audio; formwav sessions are mixed by formwav; formvis images become stills or sequences. A .fvxlink file: family {action: addLink, path}. family {action: send, app: formcut|formvfx, files} imports finished files there.",
    "presets": "presets {action: list, query, category} · get {preset} · create {name, settings or fromOutput, group, comment} · update {preset, name, settings, group} · delete · duplicate {preset, name} · alias {preset, alias} · import {path} (.fepreset, JSON, or a Media Encoder .epr: format, frame size, rate, bitrates and sample rate are read) · export {preset, path}. User presets live in the formencoder data folder as .fepreset JSON.",
    "ui": "ui {action: state} is what the person sees. ui {action: panel, panel: queue|encoding|watch|media|presets|family|log|info|terminal|agents}; ui {action: workspace, name: Default|Encoding|Ingest|Agent}; ui {action: exportSettings, output} opens the Export Settings window on an output; ui {action: toast, text} shows a message.",
}

PROMPTS = [{"name": "workflow", "title": "How to encode with formencoder", "description": "The loop for sources, outputs, export settings, previews, encoding, verifying and the form family.", "arguments": []}]

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
    _tool("contact_sheet", "Several frames of an output (or a file) through its export settings in one labelled grid: checks a range, a Time Tuner, overlays and captions over time in one look.",
          {"output": _OUTPUT, "path": {"type": "string"}, "preset": _PRESET, "settings": _SETTINGS, "count": {"type": "integer", "minimum": 2, "maximum": 24, "default": 8}, "times": {"type": "array", "items": {"type": "number"}},
           "width": {"type": "integer", "minimum": 64, "maximum": 960, "default": 360}, "columns": {"type": "integer", "minimum": 1, "maximum": 8}, "view": {"type": "string", "enum": ["output", "source"], "default": "output"}}, read=True, idempotent=True),
    _tool("wait", "Waits until the given outputs (or the whole queue) are done, failed or stopped, up to timeout seconds. Returns each output's status, file, error and notes.",
          {"outputs": {"type": "array", "items": {"type": "string"}}, "timeout": {"type": "number", "minimum": 1, "maximum": 86400, "default": 600}}, read=True),
    _tool("verify", "Probes an encoded file and checks it against its output's settings: frame size, frame rate, duration, video and audio codecs, sample rate and, when loudness was normalised, the measured loudness against the target. Give output (or path for any file; loudness true to measure it).",
          {"output": _OUTPUT, "path": {"type": "string"}, "loudness": {"type": "boolean", "default": False}}, read=True, idempotent=True),
    _tool("presets", "The Preset Browser: list {query, category, kind} (86 system presets in Web Video, Social Media, Devices, Mezzanine, Broadcast, DVD, Image Sequence, Image, Animated GIF, Audio Only, Archive, Proxy, Form Family, plus Ingest), get {preset}, create {name, settings or fromOutput, group, comment}, update, delete, duplicate, alias, import {path} (.fepreset, JSON or Media Encoder .epr), export {preset, path}.",
          {"action": {"type": "string", "enum": ["list", "get", "create", "update", "delete", "duplicate", "alias", "import", "export"]}, "preset": _PRESET, "query": {"type": "string"}, "category": {"type": "string"},
           "kind": {"type": "string", "enum": ["encode", "ingest"]}, "name": {"type": "string"}, "settings": {"type": "object", "additionalProperties": True}, "fromOutput": {"type": "string"}, "group": {"type": "string"},
           "comment": {"type": "string"}, "alias": {"type": "string"}, "path": {"type": "string"}}, ["action"]),
    _tool("formats", "Without format: the 33 formats with their codecs. With format (or output): every export setting of it (key, label, type, options, unit, showIf), its codecs with the encoders this machine has, the effect defaults, loudness standards and the complete default settings.",
          {"format": {"type": "string"}, "output": _OUTPUT}, read=True, idempotent=True),
    _tool("watch_folder", "Watch folders: list, add {folder, preset or outputs, kind: encode|analysis, moveSources}, remove {watch}, setActive {watch, active}, addOutput {watch, preset, settings, folder}, setOutput {output, preset, settings, folder}, removeOutput {output}, scan (queue what is there now), autoEncode {enabled}.",
          {"action": {"type": "string", "enum": ["list", "add", "remove", "setActive", "addOutput", "setOutput", "removeOutput", "scan", "autoEncode"]}, "folder": {"type": "string"}, "watch": {"type": "string"}, "output": {"type": "string"},
           "preset": _PRESET, "format": {"type": "string"}, "settings": {"type": "object", "additionalProperties": True}, "outputs": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
           "kind": {"type": "string", "enum": ["encode", "analysis"]}, "moveSources": {"type": "boolean"}, "active": {"type": "boolean"}, "enabled": {"type": "boolean"}}, ["action"]),
    _tool("family", "The form family: discover (which of formcut, formvfx, formwav and formvis are running here), sources {app} (their projects, comps, sessions, images), add {app, id or name, preset, settings, folder, in, out, start} queues one (formcut renders it, formvfx streams it over Dynamic Link, formwav mixes it, formvis hands the image), addLink {path} queues a formvfx .fvxlink, send {app: formcut|formvfx, files, project} imports finished files there.",
          {"action": {"type": "string", "enum": ["discover", "sources", "add", "addLink", "send"]}, "app": {"type": "string", "enum": ["formcut", "formvfx", "formwav", "formvis"]}, "id": {"type": "string"}, "name": {"type": "string"},
           "path": {"type": "string"}, "files": {"type": "array", "items": {"type": "string"}}, "project": {"type": "string"}, "preset": _PRESET, "settings": {"type": "object", "additionalProperties": True},
           "folder": {"type": "string"}, "in": {"type": "number"}, "out": {"type": "number"}, "start": {"type": "boolean", "default": False}}, ["action"], world=True),
    _tool("log", "The Encoding log (every finished output: source, file, format, preset, encoder, time, size, notes) or the Error log (failures with FFmpeg's last lines).",
          {"kind": {"type": "string", "enum": ["encoding", "error"], "default": "encoding"}, "limit": {"type": "integer", "minimum": 1, "maximum": 2000, "default": 80}}, read=True, idempotent=True),
    _tool("history", "Undo, redo or list the queue history.", {"action": {"type": "string", "enum": ["undo", "redo", "list"]}, "steps": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1}}, ["action"]),
    _tool("ui", "The formencoder window: state, or show a panel, switch workspace, open Export Settings on an output, show a message.",
          {"action": {"type": "string", "enum": ["state", "panel", "workspace", "exportSettings", "toast"]}, "panel": {"type": "string"}, "name": {"type": "string"}, "output": {"type": "string"}, "text": {"type": "string"}}, ["action"]),
    _tool("guide", "formencoder know-how for agents: workflow, queue, settings, video, audio, effects, captions, metadata, publish, watch, ingest, family, presets, ui.", {"topic": {"type": "string"}}, read=True, idempotent=True),
]
NAMES = {t["name"] for t in TOOLS}
READ_ONLY = {t["name"] for t in TOOLS if t["annotations"]["readOnlyHint"]}
_PARAMS: dict[str, set[str]] = {}


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
        return text(await ex("ui.workspace", {"name": args.get("name")}, source))
    if name == "guide":
        topic = str(args.get("topic") or "index")
        return text(GUIDES.get(topic) or f"No guide {topic!r}. {GUIDES['index']}")
    return fail(f"No tool named {name}")


async def call(name: str, args: dict, source: str) -> dict:
    try:
        return await _call(name, args, source)
    except RpcError as exc:
        return fail(str(exc))
    except (KeyError, TypeError, ValueError) as exc:
        return fail(f"{name}: {exc}")
