from __future__ import annotations

import hashlib
import hmac
import json
import threading
import time
import urllib.error
from pathlib import Path

from ..core import config
from . import family

_lock = threading.Lock()
SKEW = 300


def _store() -> Path:
    return config.data_dir() / "family_links.json"


def read() -> dict:
    try:
        data = json.loads(_store().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(data: dict) -> None:
    path = _store()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    try:
        tmp.chmod(0o600)
    except OSError:
        pass
    tmp.replace(path)


def receiver_url() -> str:
    return f"http://127.0.0.1:{config.PORT}/api/family/hooks/formcut"


def link_formcut(preset: str | None, folder: str | None, start: bool) -> dict:
    where = family._need("formcut")
    url = where["url"]
    with _lock:
        links = read()
        old = links.get("formcut")
        if old and old.get("hook") and old.get("formcutUrl") == url:
            try:
                family._delete(f"{url}/api/webhooks/{old['hook']}", family.APPS["formcut"]["header"])
            except (urllib.error.URLError, OSError, ValueError):
                pass
        made = family._post(f"{url}/api/webhooks", family.APPS["formcut"]["header"], {"url": receiver_url(), "sendFile": True}, 30)
        if not isinstance(made, dict) or not made.get("secret"):
            raise ValueError("formcut did not create the webhook")
        links["formcut"] = {"hook": made["id"], "secret": made["secret"], "formcutUrl": url, "preset": preset or "", "folder": folder or "", "start": bool(start), "linkedAt": time.time(), "received": 0, "last": None}
        _write(links)
    return status()


def unlink_formcut() -> dict:
    with _lock:
        links = read()
        old = links.pop("formcut", None)
        _write(links)
    if old and old.get("hook"):
        try:
            where = family.locate("formcut")
            if where["running"]:
                family._delete(f"{where['url']}/api/webhooks/{old['hook']}", family.APPS["formcut"]["header"])
        except (urllib.error.URLError, OSError, ValueError):
            pass
    return status()


def status() -> dict:
    link = read().get("formcut")
    if not link:
        return {"formcut": {"linked": False, "receiver": receiver_url()}}
    return {"formcut": {"linked": True, "receiver": receiver_url(), **{k: link.get(k) for k in ("hook", "formcutUrl", "preset", "folder", "start", "linkedAt", "received", "last")}}}


def verify(secret: str, timestamp: str, signed: bytes, signature: str) -> bool:
    try:
        if abs(time.time() - int(timestamp)) > SKEW:
            return False
    except ValueError:
        return False
    want = "sha256=" + hmac.new(secret.encode(), timestamp.encode() + b"." + signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, signature or "")


def accept(payload: dict, data: bytes | None, filename: str | None) -> dict:
    link = read().get("formcut") or {}
    event = payload.get("event")
    if event == "ping":
        return {"ok": True, "event": "ping"}
    if event != "export.finished":
        return {"ok": True, "ignored": event}
    exported = payload.get("export") or {}
    if data is None:
        raise ValueError("formcut sent the export's details without the file; the link asks for the file (sendFile)")
    name = Path(filename or exported.get("name") or "formcut-export.mp4").name
    if hashlib.sha256(data).hexdigest() != exported.get("sha256"):
        raise ValueError("the file does not match the SHA-256 formcut signed")
    folder = config.sub("imports") / "formcut"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / name
    n = 1
    while target.exists():
        target = folder / f"{Path(name).stem}_{n}{Path(name).suffix}"
        n += 1
    target.write_bytes(data)
    with _lock:
        links = read()
        if "formcut" in links:
            links["formcut"]["received"] = int(links["formcut"].get("received") or 0) + 1
            links["formcut"]["last"] = {"at": time.time(), "file": str(target), "project": exported.get("project")}
            _write(links)
    return {"ok": True, "path": str(target), "preset": link.get("preset") or None, "folder": link.get("folder") or None, "start": bool(link.get("start")), "project": exported.get("project")}
