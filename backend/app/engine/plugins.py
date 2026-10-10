from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

PROTOCOL = 1


def _manifests() -> list[dict]:
    folders = [Path(os.path.expanduser(os.environ.get("FORMENCODER_DATA_DIR") or "~/Formencoder")) / "plugins"]
    folders += [Path(p) for p in (os.environ.get("FORMENCODER_PLUGINS") or "").split(os.pathsep) if p]
    out: list[dict] = []
    for d in folders:
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            m = f / "plugin.json"
            if m.is_file():
                try:
                    data = json.loads(m.read_text(encoding="utf-8"))
                except ValueError:
                    continue
                data.setdefault("id", f.name)
                data["folder"] = str(f)
                if not any(x["id"] == data["id"] for x in out):
                    out.append(data)
    return out


def publish(plugin_id: str, options: dict, files: list[str], context: dict) -> list[str]:
    m = next((x for x in _manifests() if x.get("id") == plugin_id), None)
    if m is None:
        raise ValueError(f"no plug-in {plugin_id!r}")
    if "publish" not in (m.get("events") or []):
        raise ValueError(f"the plug-in {plugin_id} does not publish")
    folder = Path(m["folder"])
    argv = [str(a) for a in m.get("run") or []]
    if not argv:
        raise ValueError(f"the plug-in {plugin_id} has no run command")
    argv = [str(folder / a) if (folder / a).exists() else a for a in argv]
    if os.name == "nt" and argv[0] == "python3":
        argv[0] = "python"
    spec = m.get("options") or {}
    opts = {k: (options.get(k) if k in options else (v or {}).get("default")) for k, v in spec.items()}
    opts.update({k: v for k, v in options.items() if k not in opts})
    payload = {"protocol": PROTOCOL, "event": "publish", "plugin": {"id": m["id"], "version": m.get("version"), "folder": str(folder)}, "options": opts, "files": files, "context": context}
    flags = 0x08000000 if os.name == "nt" else 0
    done = subprocess.run(argv, input=json.dumps(payload) + "\n", capture_output=True, text=True, cwd=folder, timeout=24 * 3600, creationflags=flags)
    result, error = None, None
    for line in done.stdout.splitlines():
        try:
            v = json.loads(line)
        except ValueError:
            continue
        if isinstance(v, dict):
            if "result" in v:
                result = v["result"]
            if v.get("error"):
                error = str(v["error"])
    if error:
        raise ValueError(f"the plug-in {plugin_id} reported: {error}")
    if done.returncode != 0:
        tail = [x for x in done.stderr.splitlines() if x.strip()]
        raise ValueError(f"the plug-in {plugin_id} exited with {done.returncode}: {tail[-1] if tail else ''}")
    sent = (result or {}).get("sent") if isinstance(result, dict) else None
    return [str(s) for s in sent] if isinstance(sent, list) else [f"plug-in {plugin_id}"]
