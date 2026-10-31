from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import Callable

RELEASE = "https://github.com/nodemode-dev/formcut-binaries/releases/download"
DOCUMENTS = ("LGPL-2.1.txt", "THIRD-PARTY-NOTICES.txt", "README.md")


def host_triple() -> str:
    arch = "aarch64" if platform.machine().lower() in ("arm64", "aarch64") else "x86_64"
    if sys.platform == "darwin":
        return f"{arch}-apple-darwin"
    if os.name == "nt":
        return f"{arch}-pc-windows-msvc"
    return f"{arch}-unknown-linux-gnu"


def user_folder() -> Path:
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "formencoder" / "ffmpeg"


def record() -> dict | None:
    here = Path(__file__).resolve()
    for candidate in (Path(getattr(sys, "_MEIPASS", here.parent)) / "ffmpeg-licence.json", here.parents[2] / "src-tauri" / "binaries" / "ffmpeg-licence.json"):
        if candidate.is_file():
            try:
                return json.loads(candidate.read_text(encoding="utf-8"))
            except ValueError:
                return None
    return None


def pins(data: dict, triple: str) -> list[dict]:
    target = (data.get("targets") or {}).get(triple) or {}
    return [e for e in target.get("files") or [] if e.get("path") and e.get("sha256")]


def release(data: dict) -> str:
    return data.get("release") or ((data.get("source") or {}).get("ffmpeg") or {}).get("version", "")


def source(data: dict, triple: str) -> str:
    name = release(data)
    base = os.environ.get("FORMENCODER_FFMPEG_RELEASE") or f"{RELEASE}/ffmpeg-{name}"
    return f"{base.rstrip('/')}/ffmpeg-lgpl-{name}-{triple}.tar.gz"


def _digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def install(archive: Path, files: list[dict], folder: Path) -> int:
    with tempfile.TemporaryDirectory() as scratch:
        with tarfile.open(archive) as bundle:
            bundle.extractall(scratch, filter="data")
        first = Path(files[0]["path"])
        root = None
        for hit in Path(scratch).rglob(first.name):
            candidate = hit
            for _ in first.parts:
                candidate = candidate.parent
            if (candidate / first).is_file():
                root = candidate
                break
        if root is None:
            raise ValueError(f"the archive has no {first}")
        for entry in files:
            path = root / entry["path"]
            if not path.is_file():
                raise ValueError(f"the archive has no {entry['path']}")
            if _digest(path) != entry["sha256"]:
                raise ValueError(f"{entry['path']} does not match the pinned record, so nothing was installed")
        folder.mkdir(parents=True, exist_ok=True)
        for entry in files:
            target = folder / entry["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / entry["path"], target)
            if not entry["path"].endswith((".dll", ".dylib")) and "/" not in entry["path"]:
                target.chmod(target.stat().st_mode | 0o111)
        for name in DOCUMENTS:
            if (root / name).is_file():
                shutil.copy2(root / name, folder / name)
    return len(files)


def fetch(report: Callable[[float, str], None]) -> dict:
    data = record()
    if not data:
        raise ValueError("the pinned FFmpeg record (ffmpeg-licence.json) is missing, so a download could not be checked")
    triple = host_triple()
    files = pins(data, triple)
    if not files:
        raise ValueError(f"no FFmpeg build is recorded for {triple}; install FFmpeg and set its folder in Preferences")
    url, folder = source(data, triple), user_folder()
    with tempfile.TemporaryDirectory() as scratch:
        archive = Path(scratch) / "ffmpeg.tar.gz"
        report(0.02, "downloading FFmpeg")
        with urllib.request.urlopen(url, timeout=120) as r, archive.open("wb") as out:
            total = int(r.headers.get("content-length") or 0)
            done = 0
            for chunk in iter(lambda: r.read(1 << 20), b""):
                out.write(chunk)
                done += len(chunk)
                if total:
                    report(0.85 * done / total, "downloading FFmpeg")
        report(0.9, "checking every file against the record")
        count = install(archive, files, folder)
    (folder / "ffmpeg-licence.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    report(1.0, "FFmpeg installed")
    return {"folder": str(folder), "files": count, "source": url}
