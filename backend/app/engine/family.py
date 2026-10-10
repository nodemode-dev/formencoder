from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

from ..core import config


def _platform_data(app: str) -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / app
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / app
    return Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / app


APPS: dict[str, dict] = {
    "formcut": {"label": "formcut", "kind": "Video editor", "alt": "Premiere Pro / CapCut", "port": 8040, "header": "x-formcut-local", "env": "FORMCUT_URL",
                "records": [lambda: Path(os.environ.get("FORMCUT_DATA_DIR", "")) / "engine.json" if os.environ.get("FORMCUT_DATA_DIR") else None, lambda: _platform_data("formcut") / "engine.json"],
                "gives": "projects rendered through formcut's own export, then encoded here"},
    "formvfx": {"label": "formvfx", "kind": "Motion graphics", "alt": "After Effects", "port": 8230, "header": "x-formvfx-local", "env": "FORMVFX_URL",
                "records": [lambda: Path(os.environ.get("FORMVFX_DATA_DIR") or Path.home() / "Formvfx") / "engine.json"],
                "gives": "compositions pulled live over Dynamic Link (frames and audio), no render in formvfx"},
    "formwav": {"label": "formwav", "kind": "Audio", "alt": "Audition", "port": 8060, "header": "x-formwav-local", "env": "FORMWAV_URL", "records": [],
                "gives": "saved sessions mixed down by formwav's renderer"},
    "formvis": {"label": "formvis", "kind": "Images", "alt": "Photoshop", "port": 8190, "header": "x-formvis-local", "env": "FORMVIS_URL", "records": [],
                "gives": "library images, encoded as stills, sequences or a still held for a duration"},
}


def _get(url: str, header: str, timeout: float = 2.0, raw: bool = False) -> Any:
    req = urllib.request.Request(url, headers={header: "1", "x-formencoder-source": "formencoder"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    return data if raw else json.loads(data.decode() or "null")


def _post(url: str, header: str, body: Any, timeout: float = 60.0, raw: bool = False) -> Any:
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={header: "1", "content-type": "application/json", "x-formvfx-source": "formencoder", "x-formcut-source": "formencoder"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        out = r.read()
    return out if raw else json.loads(out.decode() or "null")


def _health(url: str, header: str) -> dict | None:
    try:
        body = _get(f"{url}/api/health", header, 1.0)
        return body if isinstance(body, dict) else {"status": "ok"}
    except (urllib.error.URLError, OSError, ValueError):
        return None


def locate(app: str) -> dict:
    spec = APPS[app]
    candidates: list[tuple[str, str]] = []
    if os.environ.get(spec["env"]):
        candidates.append(("environment", os.environ[spec["env"]].rstrip("/")))
    for rec in spec["records"]:
        try:
            p = rec()
            if p and p.is_file():
                url = json.loads(p.read_text(encoding="utf-8")).get("url")
                if isinstance(url, str) and url.startswith("http://127.0.0.1:"):
                    candidates.append(("engine.json", url.rstrip("/")))
        except (OSError, ValueError):
            continue
    candidates.append(("default port", f"http://127.0.0.1:{spec['port']}"))
    for how, url in candidates:
        health = _health(url, spec["header"])
        if health:
            return {"app": app, "running": True, "url": url, "found": how, "version": health.get("version"), "label": spec["label"], "kind": spec["kind"], "alt": spec["alt"], "gives": spec["gives"]}
    return {"app": app, "running": False, "url": None, "label": spec["label"], "kind": spec["kind"], "alt": spec["alt"], "gives": spec["gives"]}


def discover() -> list[dict]:
    return [locate(a) for a in APPS]


def _need(app: str) -> dict:
    if app not in APPS:
        raise ValueError(f"no family app {app!r}: {', '.join(APPS)}")
    where = locate(app)
    if not where["running"]:
        raise ValueError(f"{app} is not running on this computer (looked at its engine record and port {APPS[app]['port']}); open {app} and retry")
    return where


def _vfx_rpc(url: str, method: str, params: dict) -> Any:
    reply = _post(f"{url}/api/rpc", "x-formvfx-local", {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, 120)
    if isinstance(reply, dict) and "error" in reply:
        raise ValueError(f"formvfx: {reply['error'].get('message')}")
    return reply.get("result") if isinstance(reply, dict) else reply


def _cut_rpc(url: str, method: str, params: dict) -> Any:
    reply = _post(f"{url}/api/rpc", "x-formcut-local", {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, 300)
    if isinstance(reply, dict) and "error" in reply:
        err = reply["error"]
        raise ValueError(f"formcut: {err.get('message') if isinstance(err, dict) else err}")
    return reply.get("result") if isinstance(reply, dict) and "result" in reply else reply


def sources(app: str) -> dict:
    where = _need(app)
    url = where["url"]
    out: list[dict] = []
    if app == "formvfx":
        summary = _vfx_rpc(url, "command.execute", {"command": "project.summary", "params": {}}) or {}
        project = summary.get("path")
        for it in summary.get("items") or []:
            if str(it.get("type", "")).lower() in ("comp", "composition", "compitem"):
                info = {}
                try:
                    q = urllib.parse.urlencode({k: v for k, v in (("project", project or ""), ("comp", it["id"])) if v != ""})
                    info = (_get(f"{url}/api/link/info?{q}", "x-formvfx-local", 10) or {}).get("comp") or {}
                except (urllib.error.URLError, OSError, ValueError):
                    pass
                out.append({"id": str(it["id"]), "name": it.get("name"), "kind": "composition", "project": project, "width": info.get("width"), "height": info.get("height"),
                            "frameRate": info.get("frameRate"), "duration": info.get("duration"), "live": True})
    elif app == "formcut":
        rows = _cut_rpc(url, "project.list", {}) or []
        for p in rows if isinstance(rows, list) else rows.get("projects", []):
            out.append({"id": p.get("id"), "name": p.get("title") or p.get("name") or p.get("id"), "kind": "project", "width": p.get("width"), "height": p.get("height"),
                        "frameRate": p.get("fps"), "duration": p.get("duration"), "live": False})
    elif app == "formwav":
        rows = _get(f"{url}/api/projects", "x-formwav-local", 10) or []
        for p in rows:
            out.append({"id": p.get("name"), "name": p.get("name"), "kind": "session", "tracks": p.get("tracks"), "live": False})
    elif app == "formvis":
        rows = _get(f"{url}/api/projects", "x-formvis-local", 10) or []
        for p in rows:
            out.append({"id": p.get("name"), "name": p.get("name"), "kind": "image", "live": False})
    return {"app": app, "url": url, "sources": out}


def link_from_file(path: str) -> dict:
    p = Path(path).expanduser()
    data = json.loads(p.read_text(encoding="utf-8"))
    if not str(data.get("format", "")).startswith("formvfx.link/"):
        raise ValueError(f"{p.name} is not a formvfx Dynamic Link descriptor (.fvxlink)")
    comp = data.get("comp") or {}
    return {"app": "formvfx", "id": str(comp.get("id") or comp.get("name")), "name": comp.get("name") or p.stem, "project": data.get("project"), "kind": "composition",
            "width": data.get("width"), "height": data.get("height"), "frameRate": data.get("frameRate"), "duration": data.get("duration"), "descriptor": str(p)}


def _scratch(name: str) -> Path:
    folder = config.sub("cache") / "family" / f"{name}_{int(time.time() * 1000)}"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def materialize(spec: dict, report: Callable[[float, str], None], cancelled: Callable[[], bool]) -> dict:
    app = spec.get("app")
    where = _need(app)
    url = where["url"]
    if app == "formvfx":
        params = {"project": spec.get("project") or "", "comp": spec.get("id") or ""}
        q = urllib.parse.urlencode({k: v for k, v in params.items() if v})
        info = (_get(f"{url}/api/link/info?{q}", "x-formvfx-local", 30) or {}).get("comp") or {}
        fps = float(spec.get("frameRate") or info.get("frameRate") or 30)
        dur = float(spec.get("duration") or info.get("duration") or 0)
        start = float(spec.get("in") or 0)
        end = float(spec.get("out") or dur)
        frames = max(1, round((end - start) * fps))
        folder = _scratch("formvfx")
        for i in range(frames):
            if cancelled():
                raise InterruptedError("stopped")
            t = start + i / fps
            png = _get(f"{url}/api/link/frame.png?{q}&time={t:.6f}&max=8192", "x-formvfx-local", 120, raw=True)
            (folder / f"frame_{i:06d}.png").write_bytes(png)
            report(0.9 * (i + 1) / frames, f"Dynamic Link frame {i + 1} of {frames}")
        audio_path = None
        try:
            wav = _get(f"{url}/api/link/audio?{q}&start={start:.6f}&seconds={max(0.05, min(600.0, end - start)):.6f}&rate=48000", "x-formvfx-local", 300, raw=True)
            if wav and len(wav) > 64:
                audio_path = str(folder / "audio.wav")
                Path(audio_path).write_bytes(wav)
        except (urllib.error.URLError, OSError):
            audio_path = None
        report(1.0, "Dynamic Link fetched")
        return {"pattern": str(folder / "frame_%06d.png"), "frameRate": fps, "count": frames, "audio": audio_path, "folder": str(folder)}
    if app == "formcut":
        job = _cut_rpc(url, "project.export", {"id": spec["id"], "format": "mp4", "quality": "high", "exact": True})
        job_id = job.get("id") if isinstance(job, dict) else job
        while True:
            if cancelled():
                _cut_rpc(url, "job.cancel", {"id": job_id})
                raise InterruptedError("stopped")
            st = _cut_rpc(url, "job.status", {"id": job_id}) or {}
            state = st.get("status") or st.get("state")
            report(min(0.95, float(st.get("progress") or 0)), "formcut is rendering the project")
            if state in ("done", "complete", "completed", "finished"):
                break
            if state in ("failed", "error", "cancelled"):
                raise ValueError(f"formcut's export failed: {st.get('error') or state}")
            time.sleep(0.5)
        result = _cut_rpc(url, "job.result", {"id": job_id}) or {}
        path = result.get("path") or result.get("file") or (result.get("result") or {}).get("path")
        if not path or not Path(str(path)).is_file():
            link = result.get("url") or f"/api/jobs/{job_id}/file"
            data = _get(f"{url}{link}", "x-formcut-local", 600, raw=True)
            if not data:
                raise ValueError("formcut finished but its file could not be fetched")
            out = _scratch("formcut") / (result.get("name") or f"{spec['id']}.mp4")
            out.write_bytes(data)
            path = str(out)
        report(1.0, "formcut render ready")
        return {"path": path}
    if app == "formwav":
        doc = _get(f"{url}/api/projects/{urllib.parse.quote(spec['id'])}", "x-formwav-local", 120) or {}
        document = doc.get("document") if isinstance(doc, dict) else None
        if not document:
            raise ValueError("formwav did not return the session")
        report(0.3, "formwav is mixing the session")
        wav = _post(f"{url}/api/render?format=wav&what=mix", "x-formwav-local", document, 1800, raw=True)
        folder = _scratch("formwav")
        out = folder / f"{spec['id']}.wav"
        out.write_bytes(wav)
        report(1.0, "formwav mix ready")
        return {"path": str(out)}
    if app == "formvis":
        payload = _get(f"{url}/api/projects/library/{urllib.parse.quote(spec['id'])}", "x-formvis-local", 120) or {}
        images = payload.get("images") or {}
        if not images:
            raise ValueError("formvis returned no image for that project")
        key = next((k for k in images if any(w in k.lower() for w in ("composite", "flat", "preview", "merged"))), next(iter(images)))
        data = _get(f"{url}{images[key]}", "x-formvis-local", 120, raw=True)
        folder = _scratch("formvis")
        ext = Path(key).suffix or ".png"
        out = folder / f"{spec['id']}{ext}"
        out.write_bytes(data)
        report(1.0, "formvis image ready")
        return {"path": str(out)}
    raise ValueError(f"no bridge for {app}")


def send(app: str, files: list[str], project: str | None = None) -> list[str]:
    where = _need(app)
    url = where["url"]
    if app == "formcut":
        done = []
        for f in files:
            params = {"path": f}
            if project:
                params["project"] = project
            _cut_rpc(url, "media.import", params)
            done.append(f"formcut:{Path(f).name}")
        return done
    if app == "formvfx":
        _vfx_rpc(url, "command.execute", {"command": "file.import", "params": {"paths": files}})
        return [f"formvfx:{Path(f).name}" for f in files]
    raise ValueError(f"sending files to {app} is not supported; formcut and formvfx take them")
