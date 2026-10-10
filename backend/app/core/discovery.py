from __future__ import annotations

import atexit
import datetime
import json
import os
import urllib.error
import urllib.request

from .config import data_dir


def record_path():
    return data_dir() / "engine.json"


def publish(url: str, version: str) -> None:
    record = {
        "url": url,
        "pid": os.getpid(),
        "version": version,
        "started": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
    }
    path = record_path()
    staged = path.with_suffix(".json.tmp")
    staged.write_text(json.dumps(record), encoding="utf-8")
    os.replace(staged, path)
    atexit.register(withdraw)


def withdraw() -> None:
    path = record_path()
    try:
        if json.loads(path.read_text(encoding="utf-8")).get("pid") == os.getpid():
            path.unlink()
    except (OSError, ValueError):
        pass


def healthy(url: str, timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(f"{url}/api/health", timeout=timeout) as r:
            body = json.loads(r.read().decode())
            return r.status == 200 and body.get("status") == "ok" and body.get("name") == "formencoder"
    except (urllib.error.URLError, OSError, ValueError):
        return False


def running_engine(timeout: float = 1.0) -> str | None:
    env = os.environ.get("FORMENCODER_URL", "").strip().rstrip("/")
    if env and healthy(env, timeout):
        return env
    try:
        url = json.loads(record_path().read_text(encoding="utf-8")).get("url")
    except (OSError, ValueError):
        url = None
    if isinstance(url, str) and url.startswith("http://127.0.0.1:") and healthy(url, timeout):
        return url
    default = f"http://127.0.0.1:{os.environ.get('FORMENCODER_PORT', '8270') or '8270'}"
    return default if healthy(default, timeout) else None
