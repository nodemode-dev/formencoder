"""Which of the engine's presets an `encode` function call may use, read from the engine itself.

A preset qualifies when it is an encode preset whose format writes one video or audio file with FFmpeg
alone: no still images or image sequences, and no format that needs a separate delivery tool (bmx,
asdcplib) or writes a folder.
"""

from __future__ import annotations

import wave
from pathlib import Path

from .session import Session

WEB_VIDEO = "system/webm-vp9-1080p"
AUDIO_ONLY = "system/aac-256"


def media_formats(s: Session) -> dict[str, str]:
    """Format id -> "video" or "audio" for every format a function may write."""
    rows = s.run("format.list")
    rows = rows["formats"] if isinstance(rows, dict) else rows
    out = {}
    for row in rows:
        if row.get("image"):
            continue
        if s.run("format.describe", format=row["id"]).get("tool"):
            continue
        out[row["id"]] = "audio" if row.get("audioOnly") else "video"
    return out


def media_presets(s: Session) -> list[dict]:
    kinds = media_formats(s)
    return [
        {"id": p["id"], "name": p["name"], "category": p["category"], "format": p["format"], "kind": kinds[p["format"]]}
        for p in s.run("preset.list")["presets"]
        if p.get("kind") == "encode" and p.get("format") in kinds
    ]


def _silence(path: Path) -> Path:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(48000)
        w.writeframes(b"\0" * 48000 * 4)
    return path


def planned_extensions(s: Session, scratch: Path, preset_ids: list[str]) -> dict[str, str]:
    """Preset id -> the file extension the engine plans for it, by queueing (never starting) a silent source."""
    src = _silence(scratch / "source.wav")
    out = {}
    for pid in preset_ids:
        oid = s.run("queue.addSource", paths=[str(src)], preset=pid, folder=str(scratch / "out"))["output"]
        out[pid] = Path(planned(s, oid)["path"]).suffix.lstrip(".")
    return out


def planned(s: Session, output: str) -> dict:
    for item in s.run("queue.list")["items"]:
        for row in item["outputs"]:
            if row["id"] == output:
                return row
    raise LookupError(output)
