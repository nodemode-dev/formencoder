from __future__ import annotations

import hashlib
import os
import sys
import urllib.request
from pathlib import Path
from typing import Callable

BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main"

MODELS = {
    "tiny": (77691713, "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21"),
    "tiny.en": (77704715, "921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f"),
    "base": (147951465, "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"),
    "base.en": (147964211, "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002"),
    "small": (487601967, "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b"),
    "small.en": (487614201, "c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d"),
    "medium": (1533763059, "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208"),
    "large-v3-turbo": (1624555275, "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69"),
}


def models_folder() -> Path:
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "formencoder" / "models"


def fetch(name: str, report: Callable[[float, str], None] | None = None, folder: Path | None = None) -> dict:
    if name not in MODELS:
        raise ValueError(f"no speech model {name!r}; choose from {', '.join(MODELS)}")
    size, digest = MODELS[name]
    dest = folder or models_folder()
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / f"ggml-{name}.bin"
    say = report or (lambda p, m: None)
    if target.is_file() and target.stat().st_size == size:
        say(1.0, f"{target.name} is already here")
        return {"path": str(target), "model": name, "bytes": size}
    url = f"{BASE}/ggml-{name}.bin"
    part = target.with_name(target.name + ".part")
    h = hashlib.sha256()
    got = 0
    say(0.0, f"downloading {url}")
    try:
        with urllib.request.urlopen(url) as resp, open(part, "wb") as out:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
                h.update(chunk)
                got += len(chunk)
                say(min(0.99, got / size), f"ggml-{name}.bin {got // (1 << 20)} of {size // (1 << 20)} MB")
    except OSError as error:
        part.unlink(missing_ok=True)
        raise ValueError(f"{url} could not be downloaded: {error}") from None
    if h.hexdigest() != digest or got != size:
        part.unlink(missing_ok=True)
        raise ValueError(f"ggml-{name}.bin has SHA-256 {h.hexdigest()} and {got} bytes, not the pinned {digest} and {size}; nothing was installed")
    os.replace(part, target)
    say(1.0, f"speech model {name} installed")
    return {"path": str(target), "model": name, "bytes": size}


if __name__ == "__main__":
    print(fetch(sys.argv[1] if len(sys.argv) > 1 else "base", lambda p, m: print(f"[model] {m}", flush=True)))
