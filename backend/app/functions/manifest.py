"""form-functions.json: built from the engine so its preset list and extensions never drift from presets.rs."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from .. import __version__
from . import catalogue
from .encode import TIMEOUT_S, schema_for
from .session import headless

PATH = Path(__file__).resolve().parents[3] / "form-functions.json"
DESCRIPTION = ("Encode one video or audio file with a formencoder preset (and an optional settings patch) on formencoder's own engine "
               "and its LGPL FFmpeg; the output is verified against the settings before it is returned.")


def _encode(presets: list[dict], exts: dict[str, str], params: dict) -> dict:
    return {
        "id": "encode", "title": "Encode", "description": DESCRIPTION,
        "entry": "app.functions:encode",
        "inputs": [{"name": "media", "kind": "media", "required": True, "many": False}],
        "outputs": [{
            "name": "media", "kind": "media", "ext": exts[catalogue.WEB_VIDEO],
            "by_param": {"preset": {p["id"]: {"kind": p["kind"], "ext": exts[p["id"]]} for p in presets}},
        }],
        "params": params,
        "runs": ["job"], "cost": "cpu", "timeout_s": TIMEOUT_S,
    }


def build() -> dict:
    with headless() as s, tempfile.TemporaryDirectory(prefix="formencoder-manifest-") as scratch:
        presets = catalogue.media_presets(s)
        params = schema_for(s)
        exts = catalogue.planned_extensions(s, Path(scratch), [p["id"] for p in presets])
    return {"format": "form-functions", "format_version": 1, "app": "formencoder", "app_version": __version__,
            "functions": [_encode(presets, exts, params)]}


def render(data: dict) -> str:
    return json.dumps(data, indent=2) + "\n"
