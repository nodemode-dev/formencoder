#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAGE = ROOT / "src-tauri" / "ffmpeg"
KEEP = {"README.md", ".gitignore"}


def clear(stage: Path) -> None:
    stage.mkdir(parents=True, exist_ok=True)
    for entry in stage.iterdir():
        if entry.name in KEEP:
            continue
        if entry.is_dir() and not entry.is_symlink():
            shutil.rmtree(entry)
        else:
            entry.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage the pinned LGPL FFmpeg in src-tauri/ffmpeg for the desktop bundle, every file checked against src-tauri/binaries/ffmpeg-licence.json.")
    parser.add_argument("--target", required=True, help="the Rust target triple the app is built for")
    triple = parser.parse_args().target
    sys.path.insert(0, str(ROOT / "backend"))
    from app import ffmpeg_fetch

    record = ffmpeg_fetch.record()
    files = ffmpeg_fetch.pins(record or {}, triple)
    clear(STAGE)
    if not files:
        print(f"::notice::no FFmpeg build is recorded for {triple}; this app downloads it on first run")
        return 0
    url = ffmpeg_fetch.source(record, triple)
    with tempfile.TemporaryDirectory() as scratch:
        archive = Path(scratch) / "ffmpeg.tar.gz"
        try:
            urllib.request.urlretrieve(url, archive)
        except OSError as error:
            print(f"::notice::{url} could not be fetched ({error}); this app downloads FFmpeg on first run")
            return 0
        count = ffmpeg_fetch.install(archive, files, STAGE)
    suffix = ".exe" if triple.endswith("windows-msvc") else ""
    for program in ("ffmpeg", "ffprobe"):
        named = STAGE / f"{program}-{triple}{suffix}"
        if named.exists():
            named.rename(STAGE / f"{program}{suffix}")
    print(f"bundled {count} files from {url}, each matching the record")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
