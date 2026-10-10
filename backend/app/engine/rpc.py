from __future__ import annotations

import asyncio
import base64
import json
import time
from typing import Any

from .. import __version__
from .host import EngineError, host


class RpcError(Exception):
    def __init__(self, message: str, code: int = -32000, data: Any = None):
        super().__init__(message)
        self.code = code
        self.data = data


_query_ids: set[str] | None = None
_QUEUE_KEYS = ("preset", "format", "settings", "folder", "outputs", "start")


def _dumps(params: Any) -> str:
    return json.dumps(params if params is not None else {})


def query_ids() -> set[str]:
    global _query_ids
    if _query_ids is None:
        try:
            rows = json.loads(host.call_sync(lambda e: e.command_list(None, False), timeout=30))
            _query_ids = {r["id"] for r in rows if r.get("query")}
        except BaseException:
            return set()
    return _query_ids


async def execute(command: str, params: Any = None, source: str = "ui") -> Any:
    if not isinstance(command, str) or not command:
        raise RpcError("missing `command`", -32602)
    try:
        raw = await host.call(lambda e: e.execute(command, _dumps(params), source))
    except ValueError as exc:
        raise RpcError(str(exc)) from None
    except EngineError as exc:
        raise RpcError(str(exc), -32001) from None
    return json.loads(raw) if raw else None


async def batch(steps: list, label: str | None, atomic: bool, source: str) -> Any:
    try:
        raw = await host.call(lambda e: e.batch(json.dumps(steps), label, atomic, source))
    except ValueError as exc:
        raise RpcError(str(exc)) from None
    except EngineError as exc:
        raise RpcError(str(exc), -32001) from None
    return json.loads(raw)


async def state() -> dict:
    return json.loads(await host.call(lambda e: e.ui_state()))


async def preview(params: dict) -> tuple[bytes, dict]:
    try:
        job = await host.call(lambda e: e.preview_job(_dumps(params)))
        png, meta = await asyncio.get_running_loop().run_in_executor(host.previews, job.run)
    except ValueError as exc:
        raise RpcError(str(exc)) from None
    return png, json.loads(meta)


async def wait(outputs: list[str] | None, timeout: float) -> dict:
    end = time.monotonic() + max(1.0, min(timeout, 86400.0))
    final = ("done", "failed", "stopped")
    while True:
        st = await state()
        rows = [o for it in st["items"] for o in it["outputs"]]
        if outputs:
            rows = [o for o in rows if o["id"] in outputs]
            settled = all(o["status"] in final or (o["status"] == "ready" and not st["running"]) for o in rows)
        else:
            settled = not st["running"] and not st["encoding"]
        if settled or time.monotonic() >= end:
            return {"settled": settled, "running": st["running"], "counts": st["counts"],
                    "outputs": [{k: o.get(k) for k in ("id", "status", "path", "error", "progress", "eta", "notes", "loudness", "publish")} for o in rows]}
        await asyncio.sleep(0.5)


async def _bridge(fn, *args):
    try:
        return await asyncio.get_running_loop().run_in_executor(host.jobs, fn, *args)
    except (ValueError, OSError) as exc:
        raise RpcError(str(exc)) from None


async def family_add(p: dict, source: str) -> Any:
    from . import family

    app = p.get("app")
    ref = p.get("id") or p.get("name")
    if not app or ref in (None, ""):
        raise RpcError("pass app (formcut, formvfx, formwav or formvis) and id or name (family.sources lists them)", -32602)
    found = await _bridge(family.sources, app)
    spec = next((s for s in found["sources"] if str(s.get("id")) == str(ref)), None) or next((s for s in found["sources"] if s.get("name") == ref), None)
    if spec is None:
        names = ", ".join(str(s.get("name")) for s in found["sources"][:12]) or "none"
        raise RpcError(f"{app} has no source {ref!r}; it has: {names}", -32602)
    spec = {**spec, "app": app}
    for k in ("in", "out"):
        if p.get(k) is not None:
            spec[k] = p[k]
    return await execute("family.queue", {"spec": spec, **{k: p[k] for k in _QUEUE_KEYS if k in p}}, source)


async def fetch_ffmpeg() -> dict:
    from .. import ffmpeg_fetch

    def report(p: float, message: str) -> None:
        host.bus.publish({"type": "ffmpegFetch", "progress": round(p, 3), "message": message})

    out = await _bridge(ffmpeg_fetch.fetch, report)
    current = await execute("prefs.get", {}, "engine")
    await execute("prefs.set", {"values": {"ffmpegDir": (current.get("prefs") or {}).get("ffmpegDir") or ""}}, "engine")
    host.bus.publish({"type": "toast", "text": f"FFmpeg installed in {out['folder']}", "kind": "ok"})
    return out


async def fetch_openh264() -> dict:
    from .. import openh264_fetch

    def report(p: float, message: str) -> None:
        host.bus.publish({"type": "toolFetch", "tool": "openh264", "progress": round(p, 3), "message": message})

    out = await _bridge(openh264_fetch.fetch, report)
    await execute("format.encoders", {"refresh": True}, "engine")
    host.bus.publish({"type": "toast", "text": f"{out['attribution']} Installed in {out['folder']}", "kind": "ok"})
    return out


def ffmpeg_missing() -> bool:
    try:
        from .. import native

        return not json.loads(native.module().ffmpeg_info()).get("version", {}).get("found", False)
    except BaseException:
        return False


async def dispatch(method: str, params: Any, source: str = "ui") -> Any:
    p = params if isinstance(params, dict) else {}
    try:
        if method == "command.execute":
            return await execute(p.get("command"), p.get("params") or {}, source)
        if method == "command.batch":
            steps = p.get("steps")
            if not isinstance(steps, list) or not steps:
                raise RpcError("`steps` must be a non-empty list of {command, params}", -32602)
            return await batch(steps, p.get("label"), bool(p.get("atomic", True)), source)
        if method == "command.list":
            return json.loads(await host.call(lambda e: e.command_list(p.get("filter"), bool(p.get("schemas")))))
        if method == "command.describe":
            return json.loads(await host.call(lambda e: e.describe(str(p.get("command") or p.get("id") or ""))))
        if method == "ui.state":
            return await state()
        if method == "menu.bar":
            return json.loads(await host.call(lambda e: e.menus()))
        if method == "frame.png":
            png, meta = await preview(p)
            return {"png": base64.b64encode(png).decode(), **meta}
        if method == "encode.wait":
            outs = p.get("outputs")
            return await wait(outs if isinstance(outs, list) else [outs] if isinstance(outs, str) else None, float(p.get("timeout") or 600))
        if method == "engine.info":
            from .. import native

            caps = await execute("app.capabilities", {}, "ui")
            return {"name": "formencoder", "version": __version__, "core": native.version(), "capabilities": caps, "revision": host.revision, "running": host.running}
        if method == "activity.list":
            n = int(p.get("limit") or 50)
            return list(host.activity)[-n:]
        if method == "family.discover":
            from . import family

            return await _bridge(family.discover)
        if method == "family.sources":
            from . import family

            return await _bridge(family.sources, str(p.get("app") or ""))
        if method == "family.add":
            return await family_add(p, source)
        if method == "family.addLink":
            from . import family

            spec = await _bridge(family.link_from_file, str(p.get("path") or ""))
            return await execute("family.queue", {"spec": spec, **{k: p[k] for k in _QUEUE_KEYS if k in p}}, source)
        if method == "family.send":
            from . import family

            files = p.get("files") or []
            if isinstance(files, str):
                files = [files]
            sent = await _bridge(family.send, str(p.get("app") or ""), files, p.get("project"))
            return {"sent": sent}
        if method == "ffmpeg.fetch":
            return await fetch_ffmpeg()
        if method == "openh264.fetch":
            return await fetch_openh264()
        if method == "publish.destinations":
            from . import publish

            return publish.DESTINATIONS
    except RpcError:
        raise
    except ValueError as exc:
        raise RpcError(str(exc)) from None
    except EngineError as exc:
        raise RpcError(str(exc), -32001) from None
    raise RpcError(f"unknown method {method}", -32601)


async def handle(message: Any, source: str = "ui") -> dict | list | None:
    if isinstance(message, list):
        out = [r for r in [await handle(m, source) for m in message] if r is not None]
        return out or None
    if not isinstance(message, dict):
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid request"}}
    rid = message.get("id")
    try:
        result = await dispatch(message.get("method", ""), message.get("params"), source)
    except RpcError as exc:
        return None if rid is None else {"jsonrpc": "2.0", "id": rid, "error": {"code": exc.code, "message": str(exc), **({"data": exc.data} if exc.data is not None else {})}}
    return None if rid is None else {"jsonrpc": "2.0", "id": rid, "result": result}
