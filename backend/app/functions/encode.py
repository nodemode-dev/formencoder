"""The `encode` Form function: one video or audio file in, the same file encoded with a formencoder preset out.

It runs the engine's own queue path (`queue.addSource` with `preset` and `settings`, `queue.start`,
`encode.report`, `encode.verify`), the one `./formencoder encode FILE --preset ID --folder DIR` and the MCP
`encode` tool drive, on a headless engine (`session.headless`) instead of the engine service.
"""

from __future__ import annotations

import json
from pathlib import Path

from .. import native
from . import allowlist, catalogue, guard
from .schema import validate
from .session import FunctionError, Session, headless

TIMEOUT_S = 1800


def params_schema(preset_ids: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "preset": {
                "type": "string",
                "enum": preset_ids,
                "default": catalogue.WEB_VIDEO,
                "description": f"A formencoder preset id (preset.list in the engine, references/presets.md in the harness skill). "
                               f"Web video: {catalogue.WEB_VIDEO}; audio only: {catalogue.AUDIO_ONLY}.",
            },
            "settings": allowlist.SETTINGS,
        },
        "required": ["preset"],
        "additionalProperties": False,
    }


def _source(inputs: dict) -> Path:
    if not isinstance(inputs, dict) or "media" not in inputs:
        raise FunctionError("inputs.media is required")
    raw = inputs["media"]
    if not isinstance(raw, str) or not raw:
        raise FunctionError("inputs.media must be one file path")
    path = Path(raw).expanduser().resolve()
    if not path.is_file():
        raise FunctionError(f"inputs.media: no file at {raw}")
    kind = json.loads(native.module().probe(str(path))).get("kind")
    if kind not in ("video", "audio"):
        raise FunctionError(f"inputs.media is not video or audio (the engine reads it as {kind or 'unreadable'})")
    return path


def _queue(s: Session, source: Path, params: dict, out: Path) -> str:
    request = {"paths": [str(source)], "preset": params["preset"], "folder": str(out)}
    if params.get("settings"):
        request["settings"] = params["settings"]
    oid = s.run("queue.addSource", **request)["output"]
    row = catalogue.planned(s, oid)
    if row.get("format") not in catalogue.media_formats(s):
        raise FunctionError(f"the settings turn the output into {row.get('format')}, which is not one video or audio file")
    guard.before(s, oid, out, row["path"])
    return oid


def _verify(s: Session, oid: str) -> None:
    verdict = s.run("encode.verify", output=oid)
    if not verdict.get("passed"):
        failed = [f"{c.get('check')}: wanted {c.get('want')}, got {c.get('got')}" for c in verdict.get("checks") or [] if not c.get("ok")]
        raise FunctionError("the output failed verification: " + ("; ".join(failed) or "no checks passed"))


def encode(inputs: dict, params: dict, out_dir: str) -> dict:
    """Encode inputs["media"] with params["preset"] (and an optional params["settings"] patch) into out_dir."""
    out = Path(out_dir).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    with headless() as s:
        validate(params, params_schema([p["id"] for p in catalogue.media_presets(s)]))
        source = _source(inputs)
        oid = _queue(s, source, params, out)
        s.run("queue.start")
        row = s.finish(oid, TIMEOUT_S)
        if row["status"] != "done":
            raise FunctionError(f"the encode {row['status']}: {row.get('error') or 'no reason given'}")
        guard.after(row, out)
        path = Path(row["path"]).resolve()
        if not path.is_file():
            raise FunctionError(f"the engine reported {path.name} but wrote no file")
        _verify(s, oid)
    return {"media": str(path)}
