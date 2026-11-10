"""Second line of defence: the engine's own view of what an output will read and write stays inside the call.

`before` checks the merged settings the engine will run (queue.getSettings) and the planned output path;
`after` checks every file the engine reports writing. Inputs may come only from the call's inputs and the
install's own resources; outputs only into out_dir.
"""

from __future__ import annotations

import re
from pathlib import Path

from ..core import config
from .session import FunctionError, Session

_LOOKS_LIKE_PATH = re.compile(r"^(/|~|[A-Za-z]:[\\/]|\\\\|\.\.?[\\/])")
_READS = (("effects", "lut", "path"), ("effects", "imageOverlay", "path"), ("captions", "source"),
          ("contentCredentials", "certificate"), ("contentCredentials", "privateKey"), ("metadata", "template"))


def _at(settings: dict, keys: tuple) -> object:
    for k in keys:
        settings = settings.get(k) if isinstance(settings, dict) else None
    return settings


def _within(path: str, roots: list[Path]) -> bool:
    p = Path(path).expanduser().resolve()
    return any(p.is_relative_to(r) for r in roots)


def _strings(value: object, where: str = "settings"):
    if isinstance(value, dict):
        for k, v in value.items():
            yield from _strings(v, f"{where}.{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from _strings(v, f"{where}[{i}]")
    elif isinstance(value, str):
        yield where, value


def before(s: Session, oid: str, out: Path, planned: str) -> None:
    if not _within(planned, [out]):
        raise FunctionError(f"the planned output {planned} is outside out_dir")
    st = s.run("queue.getSettings", output=oid)
    st = st.get("settings", st) if isinstance(st, dict) else {}
    install = [config.resources_dir().resolve()]
    for keys in _READS:
        value = _at(st, keys)
        if isinstance(value, str) and value not in ("", "auto") and not _within(value, install):
            raise FunctionError(f"settings.{'.'.join(keys)} reads {value}, outside the inputs and the install")
    folder = _at(st, ("effects", "loudness", "reportFolder"))
    if isinstance(folder, str) and folder.strip() and not _within(folder, [out]):
        raise FunctionError(f"settings.effects.loudness.reportFolder {folder} is outside out_dir")
    for key in ("publish", "plugins"):
        if st.get(key):
            raise FunctionError(f"settings.{key} is not available to a function")
    allowed = [out, *install]
    for where, value in _strings(st):
        if _LOOKS_LIKE_PATH.match(value) and not _within(value, allowed):
            raise FunctionError(f"{where} names {value}, outside the inputs, the install and out_dir")


def after(row: dict, out: Path) -> None:
    written = [row.get("path"), row.get("loudnessReport"), *(row.get("sidecars") or []), *(row.get("files") or [])]
    for path in written:
        if isinstance(path, str) and path and not _within(path, [out]):
            raise FunctionError(f"the engine wrote {path}, outside out_dir")
