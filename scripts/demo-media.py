#!/usr/bin/env python3
"""Copies the three browser demos' sources into the interface build, so Help > Demos and the Queue's Demos open them.

The demos in demo/ (Queue), demos/broadcast and demos/inspect carry their media as JavaScript data packs (base64, for
file://). This decodes the sources the in-app demos queue into plain files under frontend/public/demos/<demo>/, which
Vite copies into frontend/dist, the folder the engine serves in the desktop app. Only sources are copied: the outputs
the inspect demo shows ready-made (the high and low bit rate encodes, the proxy and the GIF) are encoded by the app's
own engine instead. Every file is one the demo folders' CREDITS.md list. Run from anywhere:

    python3 scripts/demo-media.py
"""
from __future__ import annotations

import base64
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "demos"
PACKS = {
    "queue": ("demo/media", ["open-water", "coast-aerial", "shoreline-vertical", "on-the-sea-reading"]),
    "broadcast": ("demos/broadcast/media", ["programme"]),
    "inspect": ("demos/inspect/media", ["autumn-stream", "waterfall", "river-vertical", "clouds-sequence"]),
}
# the broadcast demo's cues, beside the programme under the same stem so the engine's captions source "auto" finds them
COPIES = {"broadcast": [("demos/broadcast/src/data/programme.srt", "on-the-sea-programme.srt")]}
ENTRY = re.compile(r'\]=("[A-Za-z0-9+/=]+"|\{.*\});?\s*$', re.S)
KEY = re.compile(r'\["([^"]+)"\]=')


def entries(pack: Path) -> dict[str, bytes]:
    text = pack.read_text()
    key = KEY.search(text)
    body = ENTRY.search(text)
    if not key or not body:
        raise SystemExit(f"{pack}: no data in the pack")
    value = json.loads(body.group(1))
    if isinstance(value, str):
        return {key.group(1): base64.b64decode(value)}
    return {name: base64.b64decode(b64) for name, b64 in value.items()}


def main() -> None:
    for demo, (folder, packs) in PACKS.items():
        dest = OUT / demo
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)
        files: list[str] = []
        for pack in packs:
            for name, data in entries(ROOT / folder / f"{pack}.js").items():
                (dest / name).write_bytes(data)
                files.append(name)
        for src, name in COPIES.get(demo, []):
            shutil.copyfile(ROOT / src, dest / name)
            files.append(name)
        (dest / "files.json").write_text(json.dumps(sorted(files), separators=(",", ":")) + "\n")
        print(f"{demo}: {len(files)} files, {sum((dest / f).stat().st_size for f in files) // 1024} KB")


if __name__ == "__main__":
    main()
