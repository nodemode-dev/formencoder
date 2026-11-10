"""The settings a function caller may patch, with every value drawn from the engine's own lists.

Only fields that name no file are offered, and none is a free string: each string is an enum of the values
the engine itself accepts (format.describe's select options for the formats a function may write, its
scaling, crop proportion and loudness standard lists, and range modes from settings::normalize), and each
number has bounds. Path-valued settings, publish, plug-ins, the output name and the format or codec stay as
the preset has them; a patch that names one is refused.
"""

from __future__ import annotations

from .session import Session

# fencoder-plan/src/settings.rs normalize(): the range modes it keeps (anything else becomes "entire").
RANGE_MODES = ["entire", "inout", "custom", "workArea"]
ROTATIONS = [0, 90, 180, 270]
_VIDEO_SELECTS = ("fieldOrder", "pixelAspect", "profile", "level", "bitDepth", "chroma", "rateControl", "frameRate")
_AUDIO_SELECTS = ("sampleRate", "channels", "bitrate", "bitDepth")


def _obj(description: str, **props: dict) -> dict:
    return {"type": "object", "description": description, "properties": props, "additionalProperties": False}


def _num(lo: float, hi: float, kind: str = "number", null: bool = False) -> dict:
    return {"type": [kind, "null"] if null else kind, "minimum": lo, "maximum": hi}


def _enum(values: list) -> dict:
    return {"enum": values}


def _options(s: Session, formats: list[str]) -> tuple[dict[str, list], dict[str, dict], dict]:
    """Union of each select field's options over the given formats, int field bounds, and one full describe."""
    opts: dict[str, list] = {}
    bounds: dict[str, dict] = {}
    last: dict = {}
    for fmt in formats:
        last = s.run("format.describe", format=fmt)
        for section in ("video", "audio"):
            for field in last.get(section) or []:
                for value, _label in field.get("options") or []:
                    bucket = opts.setdefault(field["key"], [])
                    if value not in bucket:
                        bucket.append(value)
                if field.get("min") is not None:
                    bounds[field["key"]] = {"min": field["min"], "max": field["max"], "null": bool(field.get("nullable"))}
    return opts, bounds, last


def settings_schema(s: Session, formats: list[str]) -> dict:
    opts, bounds, last = _options(s, formats)
    sel = lambda key: _enum(opts[key])  # noqa: E731
    rng = lambda key, kind="number": _num(bounds[key]["min"], bounds[key]["max"], kind, bounds[key]["null"])  # noqa: E731
    standards = list(last["loudnessStandards"])
    return _obj(
        "Optional export settings patch merged over the preset, as queue.addSource takes it, limited to these fields and "
        "values (for example {\"video\": {\"matchSource\": false, \"width\": 1280, \"height\": 720}}). Path-valued settings, "
        "publish, plug-ins, the output name and the format or codec cannot be patched.",
        exportVideo={"type": "boolean"},
        exportAudio={"type": "boolean"},
        video=_obj("Picture size, rate and quality.", matchSource={"type": "boolean"},
                   width=rng("video.width", "integer"), height=rng("video.height", "integer"),
                   keyframeDistance=rng("video.keyframeDistance", "integer"), quality=rng("video.quality", "integer"),
                   targetBitrate=rng("video.targetBitrate"), maxBitrate=rng("video.maxBitrate"),
                   **{k: sel(f"video.{k}") for k in _VIDEO_SELECTS}),
        audio=_obj("Audio rate, channels and bitrate.", **{k: sel(f"audio.{k}") for k in _AUDIO_SELECTS}),
        multiplexer=_obj("Container options.", fastStart={"type": "boolean"}),
        range=_obj("The part of the source to encode, in seconds.", mode=_enum(RANGE_MODES),
                   **{"in": _num(0, 86400, null=True), "out": _num(0, 86400, null=True)}),
        crop=_obj("Crop in pixels.", **{k: _num(0, 16384, "integer") for k in ("left", "top", "right", "bottom")},
                  proportion=_enum([k for k, _ in last["cropProportions"]]), anchorX=_num(0, 1), anchorY=_num(0, 1)),
        rotation=_enum(ROTATIONS),
        scaling=_enum([k for k, _ in last["scaling"]]),
        effects=_obj("Effects without files.", loudness=_obj(
            "Loudness normalisation; the report is written beside the output.", enabled={"type": "boolean"},
            standard=_enum(standards), target=_num(-70, 0), tolerance=_num(0, 10), truePeak=_num(-20, 0), lra=_num(1, 50))),
    )
