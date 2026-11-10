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

# A path anywhere in a value: a root, home, drive, UNC or relative-parent start, at the beginning or after a
# non-word character (so "1:1,movie=/etc/passwd" and "a ../b" match, "ATSC A/85" does not).
_PATH_INSIDE = re.compile(r"(?:^|[^\w.])(/|~[\\/]|[A-Za-z]:[\\/]|\\\\|\.\.?[\\/])")
# FFmpeg filtergraph and option metacharacters: the planner interpolates some settings into -vf/-af chains.
_META = re.compile(r"[,;\[\]='\"\\\n\r]")
# Labels the engine itself copies from its own preset; never caller-settable (see allowlist.py).
_LABELS = {"settings.presetName"}
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
        if where in _LABELS:
            continue
        if _META.search(value):
            raise FunctionError(f"{where} {value!r} holds a filtergraph or option character (, ; [ ] = ' \" \\ or a newline)")
        for m in _PATH_INSIDE.finditer(value):
            if not _within(value[m.start(1):], allowed):
                raise FunctionError(f"{where} names {value[m.start(1):]}, outside the inputs, the install and out_dir")


def patch(settings: object) -> None:
    """Refuse metacharacters and paths in the caller's own patch before the engine sees it."""
    for where, value in _strings(settings or {}, "params.settings"):
        if _META.search(value) or _PATH_INSIDE.search(value):
            raise FunctionError(f"{where} {value!r} holds a filtergraph, option or path character")


def after(row: dict, out: Path) -> None:
    written = [row.get("path"), row.get("loudnessReport"), *(row.get("sidecars") or []), *(row.get("files") or [])]
    for path in written:
        if isinstance(path, str) and path and not _within(path, [out]):
            raise FunctionError(f"the engine wrote {path}, outside out_dir")
