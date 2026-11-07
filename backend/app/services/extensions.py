from __future__ import annotations

import base64
import ipaddress
import socket
import threading
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

from .. import __version__
from . import formext_host as fx

PRODUCT = "formencoder"
APP = "FormEncoder"
BASE = "/api/extensions/files"
MANAGE = f"formai://extensions?product={PRODUCT}"
FETCH_LIMIT = 50 * 1024 * 1024
SAVE_LIMIT = 200 * 1024 * 1024

_lock = threading.Lock()
_cache: dict = {"key": None, "list": []}


def current(force: bool = False) -> list[fx.Extension]:
    root = fx.portal_root()
    key = (str(root), fx.stamp(PRODUCT, root))
    with _lock:
        if force or _cache["key"] != key:
            _cache["list"] = fx.resolve(PRODUCT, __version__, APP, root)
            _cache["key"] = key
        return _cache["list"]


def stamp() -> list[float]:
    return list(fx.stamp(PRODUCT))


def listing(force: bool = False) -> dict:
    exts = current(force)
    return {
        "product": PRODUCT,
        "app": APP,
        "appVersion": __version__,
        "api": fx.API,
        "root": str(fx.portal_root()),
        "stamp": stamp(),
        "manage": MANAGE,
        "extensions": [e.public(BASE) for e in exts],
    }


def file_for(ext_id: str, version: str, rel: str) -> tuple[Path, str] | None:
    return fx.file_for(current(), ext_id, version, rel)


def headers_for(content_type: str) -> dict[str, str]:
    return fx.headers_for(content_type, "")


def save(path: str, data: str, overwrite: bool) -> dict:
    target = Path(path).expanduser()
    if not target.is_absolute():
        raise ValueError("the place to save must be an absolute path")
    if target.is_dir():
        raise ValueError(f"{target} is a folder")
    if target.exists() and not overwrite:
        raise FileExistsError(str(target))
    try:
        raw = base64.b64decode(data, validate=True)
    except ValueError:
        raise ValueError("data is not base64") from None
    if len(raw) > SAVE_LIMIT:
        raise ValueError("the file is larger than 200 MB")
    if not target.parent.is_dir():
        raise ValueError(f"there is no folder {target.parent}")
    part = target.with_name(target.name + ".part")
    part.write_bytes(raw)
    part.replace(target)
    return {"saved": True, "name": target.name, "path": str(target)}


def _public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        raise ValueError(f"{host} could not be found") from None
    for info in infos:
        addr = ipaddress.ip_address(info[4][0].split("%")[0])
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast or addr.is_unspecified:
            return False
    return True


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url: str, method: str = "GET", headers: dict | None = None, body: str | None = None) -> dict:
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise ValueError("only https:// addresses")
    if not _public_host(parts.hostname):
        raise PermissionError("addresses on this computer or the local network are not reachable from extensions")
    method = (method or "GET").upper()
    if method not in ("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"):
        raise ValueError(f"method {method} is not allowed")
    data = base64.b64decode(body) if body else None
    clean = {str(k): str(v) for k, v in (headers or {}).items() if str(k).lower() not in ("host", "cookie", "connection", "content-length")}
    clean.setdefault("User-Agent", f"FormEncoder/{__version__}")
    req = urllib.request.Request(url, data=data, method=method, headers=clean)
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        resp = opener.open(req, timeout=60)
    except urllib.error.HTTPError as exc:
        resp = exc
    except (urllib.error.URLError, OSError) as exc:
        raise ValueError(f"the request failed: {getattr(exc, 'reason', exc)}") from None
    with resp:
        payload = resp.read(FETCH_LIMIT + 1)
        if len(payload) > FETCH_LIMIT:
            raise ValueError("the answer is larger than 50 MB")
        return {"status": resp.status, "headers": {k.lower(): v for k, v in resp.headers.items()}, "body": base64.b64encode(payload).decode()}


def _row(r: dict, window: dict | None) -> dict:
    state = r["state"]
    if window:
        state = window.get("state", state)
    elif state == "ready" and r["permissions"]:
        state = "unknown"
    return {
        "id": r["id"], "name": r["name"], "version": r["version"], "source": r["source"], "state": state,
        **({"reason": r["reason"]} if r.get("reason") else {}),
        "permissions": r["permissions"], "commands": r["commands"], "panels": r["panels"],
        **({"path": r["path"]} if r.get("path") else {}),
    }


async def window_list() -> dict:
    from ..engine.host import host

    rows = listing()["extensions"]
    reply = await host.bus.ask_window({"type": "extensions", "action": "list"}, timeout=5, first=True) if host.bus.windows() else None
    states = {w.get("id"): w for w in (reply or {}).get("extensions", []) if isinstance(w, dict)}
    out = {"window": reply is not None, "extensions": [_row(r, states.get(r["id"])) for r in rows]}
    if reply is None:
        out["note"] = "No FormEncoder window answered, so whether the person allowed each extension is unknown; extension commands need an open window."
    return out


async def window_run(ext_id: str, command: str, args) -> object:
    from ..engine.host import host
    from ..engine.rpc import RpcError

    if not ext_id or not command:
        raise RpcError("pass id (the extension) and command (one of its commands; extensions_list shows them)", -32602)
    rows = {r["id"]: r for r in listing()["extensions"]}
    row = rows.get(ext_id)
    if row is None:
        raise RpcError(f"no extension {ext_id!r}; installed: {', '.join(rows) or 'none'}", -32602)
    if row["state"] == "refused":
        raise RpcError(f"{row['name']} is refused: {row['reason']}", -32004)
    if not any(c["id"] == command for c in row["commands"]):
        raise RpcError(f"{row['name']} has no command {command!r}; it has: {', '.join(c['id'] for c in row['commands']) or 'none'}", -32601)
    if not host.bus.windows():
        raise RpcError("No FormEncoder window is open. Extension commands run in the window, in the extension's sandbox; open FormEncoder and try again.", -32003)
    reply = await host.bus.ask_window({"type": "extensions", "action": "run", "id": ext_id, "command": command, "args": args if args is not None else {}}, timeout=420, first=True)
    if reply is None:
        raise RpcError(f"{row['name']} did not finish {command} in the FormEncoder window", -32003)
    if not reply.get("ok"):
        raise RpcError(str(reply.get("message") or "the command failed"), int(reply.get("code") or -32004))
    return {"extension": ext_id, "command": command, "result": reply.get("result")}
