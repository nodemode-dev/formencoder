from __future__ import annotations

import asyncio
import itertools
import json
import os
import time
from collections import deque
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..core import config
from ..engine.host import host

UPLOADS = {"ftp", "s3", "webhook", "youtube", "vimeo", "facebook", "plugin"}
WAIT = 120.0
_ids = itertools.count(1)
_destructive: dict[str, str] = {}
pending: dict[int, tuple[dict, Callable[[], Awaitable[Any]], asyncio.Future]] = {}
decided: deque = deque(maxlen=200)
activity: deque = deque(maxlen=300)


class Pending(Exception):
    def __init__(self, request: dict) -> None:
        super().__init__(request["summary"])
        self.request = request


class Declined(Exception):
    pass


def _store() -> Path:
    return config.data_dir() / "approvals.json"


def full_faith() -> bool:
    try:
        return bool(json.loads(_store().read_text(encoding="utf-8")).get("fullFaith"))
    except (OSError, ValueError):
        return False


def set_full_faith(on: bool) -> dict:
    _store().write_text(json.dumps({"fullFaith": bool(on)}, indent=2), encoding="utf-8")
    note("ui", "agents.fullFaith", {"on": bool(on)}, True, 0)
    _changed()
    return state()


def state() -> dict:
    return {"fullFaith": full_faith(), "pending": [r for r, _, _ in pending.values()], "decided": list(decided)[-30:], "activity": list(activity)[-100:]}


def _changed() -> None:
    host.bus.publish({"type": "approvals", "fullFaith": full_faith(), "pending": [r for r, _, _ in pending.values()]}, ("ui",))


def _short(value: Any, limit: int = 300) -> Any:
    text = json.dumps(value, ensure_ascii=False, default=str)
    return value if len(text) <= limit else text[:limit] + "..."


def note(client: str, tool: str, params: Any, ok: bool, ms: float, approval: str | None = None, error: str | None = None) -> None:
    entry = {"time": time.time(), "client": client, "tool": tool, "params": _short(params), "ok": ok, "ms": round(ms), "approval": approval, "error": (error or "")[:300] or None}
    activity.append(entry)
    host.bus.publish({"type": "agentActivity", "entry": entry}, ("ui",))


async def _load_registry() -> None:
    if _destructive:
        return
    rows = json.loads(await host.call(lambda e: e.command_list(None, False)))
    for r in rows:
        if (r.get("annotations") or {}).get("destructiveHint"):
            _destructive[r["id"]] = r.get("label") or r["id"]


def _settings_in(params: dict) -> list[dict]:
    found = []
    for key in ("settings", "patch"):
        if isinstance(params.get(key), dict):
            found.append(params[key])
    for o in params.get("outputs") or []:
        if isinstance(o, dict) and isinstance(o.get("settings"), dict):
            found.append(o["settings"])
    return found


def _publish_reasons(settings: dict) -> list[str]:
    out = []
    dests = settings.get("publish")
    if dests is None:
        dests = [v for k, v in settings.items() if k.startswith("publish")]
    for d in dests if isinstance(dests, list) else []:
        if not isinstance(d, dict):
            continue
        kind = str(d.get("type") or "")
        if kind in UPLOADS:
            out.append(f"it sends the encoded file to {kind}")
        if d.get("deleteLocal"):
            out.append("it deletes the local file after publishing")
    return out


async def reasons(command: str, params: dict) -> list[str]:
    await _load_registry()
    why: list[str] = []
    if command in _destructive:
        why.append(f"{_destructive[command].rstrip('.')} deletes, clears or replaces something")
    for s in _settings_in(params):
        why += _publish_reasons(s)
    if command == "queue.setOutput" and isinstance(params.get("path"), str) and params["path"]:
        target = Path(os.path.expanduser(params["path"]))
        if target.exists():
            why.append(f"it would overwrite {target}")
    if command in ("watch.setOutput", "watch.addOutput") and params.get("folder") not in (None, ""):
        why.append("it changes where a watch folder writes its files")
    if command == "watch.chain":
        why.append("it changes where a watch folder's outputs go")
    return sorted(set(why))


async def guard(client: str, label: str, why: list[str], params: Any, run: Callable[[], Awaitable[Any]]) -> Any:
    if not why:
        return await run()
    if full_faith():
        return await run()
    rid = next(_ids)
    request = {"id": rid, "client": client, "action": label, "params": _short(params, 600), "why": why, "created": time.time(), "status": "pending",
               "summary": f"{client} asks to run {label}: {'; '.join(why)}"}
    fut: asyncio.Future = asyncio.get_running_loop().create_future()
    pending[rid] = (request, run, fut)
    _changed()
    if not host.bus.windows():
        raise Pending(request)
    try:
        done = await asyncio.wait_for(asyncio.shield(fut), WAIT)
    except asyncio.TimeoutError:
        raise Pending(request) from None
    if done["status"] == "approved":
        return done.get("result")
    if done["status"] == "failed":
        raise RuntimeError(done.get("error") or "the approved action failed")
    raise Declined(f"The person declined: {label} ({'; '.join(why)}). Ask them in chat what they want instead.")


async def decide(rid: int, allow: bool) -> dict:
    item = pending.pop(int(rid), None)
    if item is None:
        raise KeyError(f"no pending approval {rid}")
    request, run, fut = item
    if allow:
        try:
            request["result"] = await run()
            request["status"] = "approved"
        except Exception as exc:
            request["status"] = "failed"
            request["error"] = str(exc)
    else:
        request["status"] = "declined"
    request["decided"] = time.time()
    decided.append(request)
    note("ui", f"approval {rid} for {request['client']}: {request['action']}", request["params"], request["status"] == "approved", 0, approval=request["status"], error=request.get("error"))
    if not fut.done():
        fut.set_result(request)
    _changed()
    return {k: v for k, v in request.items() if k != "result"} | {"result": _short(request.get("result"), 2000)}


def status(rid: int) -> dict:
    rid = int(rid)
    if rid in pending:
        return {k: v for k, v in pending[rid][0].items()}
    for r in decided:
        if r["id"] == rid:
            return r
    raise KeyError(f"no approval {rid}")
