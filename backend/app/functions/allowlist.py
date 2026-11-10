"""The settings a function caller may patch: codec-neutral size, rate, quality, audio and range fields only.

Nothing here names a file or folder. Path-valued settings (a LUT, an image overlay, a caption source, a
loudness report folder, content credentials, a metadata template), publish destinations, plug-ins, the
output name and the format or codec stay as the preset has them; a patch that names one is refused.
"""

from __future__ import annotations

_B = {"type": "boolean"}
_I = {"type": "integer"}
_N = {"type": "number"}
_S = {"type": "string"}
_IN = {"type": ["integer", "null"]}
_NN = {"type": ["number", "null"]}


def _obj(description: str, **props: dict) -> dict:
    return {"type": "object", "description": description, "properties": props, "additionalProperties": False}


SETTINGS = _obj(
    "Optional export settings patch merged over the preset, as queue.addSource takes it, limited to these fields "
    "(for example {\"video\": {\"matchSource\": false, \"width\": 1280, \"height\": 720}}). Path-valued settings, "
    "publish, plug-ins, the output name and the format or codec cannot be patched.",
    exportVideo=_B,
    exportAudio=_B,
    video=_obj("Picture size, rate and quality.", matchSource=_B, width=_IN, height=_IN, frameRate=_NN, fieldOrder=_S, pixelAspect=_S,
               profile=_S, level=_S, bitDepth=_I, chroma=_S, rateControl=_S, targetBitrate=_N, maxBitrate=_N, quality=_I,
               keyframeDistance=_IN),
    audio=_obj("Audio rate, channels and bitrate.", sampleRate=_I, channels=_S, bitrate=_I, bitDepth=_I),
    multiplexer=_obj("Container options.", fastStart=_B),
    range=_obj("The part of the source to encode, in seconds.", mode=_S, **{"in": _NN, "out": _NN}),
    crop=_obj("Crop in pixels.", left=_I, top=_I, right=_I, bottom=_I, proportion=_S, anchorX=_N, anchorY=_N),
    rotation=_I,
    scaling=_S,
    effects=_obj("Effects without files.", loudness=_obj("Loudness normalisation; the report is written beside the output.",
                                                         enabled=_B, standard=_S, target=_N, tolerance=_N, truePeak=_N, lra=_N, mode=_S)),
)
