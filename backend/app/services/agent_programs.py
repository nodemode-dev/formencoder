from __future__ import annotations

import json
import os
from pathlib import Path

from ..core import config
from . import agent_lookup

PROGRAMS = {
    "claude": {"bin": "claude", "title": "Claude Code"},
    "codex": {"bin": "codex", "title": "Codex"},
    "cursor": {"bin": "cursor-agent", "title": "Cursor"},
    "antigravity": {"bin": "agy", "title": "Antigravity"},
}
OVERRIDES = {
    "claude": ("FORMENCODER_CLAUDE_BIN",),
    "codex": ("FORMENCODER_CODEX_BIN",),
    "cursor": ("FORMENCODER_CURSOR_BIN",),
    "antigravity": ("FORMENCODER_ANTIGRAVITY_BIN",),
}
OTHERWISE = ""
TAB_ENTRY = "formencoder_tab"
TAB_FOLDERS = "agent-tabs"
TAB_GUIDE = "AGENTS.md"
TOKEN_VAR = "FORMENCODER_AGENT_TOKEN"


def install(kind: str) -> str:
    return agent_lookup.install(kind)


def base_env() -> dict:
    return {k: v for k, v in os.environ.items() if not k.startswith("FORMENCODER_")}


def child_env(path: str | None = None, base: dict | None = None, front: tuple | list = (), extra: dict | None = None) -> dict:
    return agent_lookup.child_env(path, base=base_env() if base is None else base, front=front, extra=extra, shell_timeout=10.0)


def located(kind: str, fresh: bool = False) -> agent_lookup.Found:
    found = agent_lookup.find(kind, setting=None, override_vars=OVERRIDES.get(kind, ()), shell_timeout=10.0, fresh=fresh)
    return agent_lookup.check(found, child_env(found.path), 15.0, fresh)


def usable(kind: str) -> agent_lookup.Found:
    found = located(kind)
    return found if found.state == "runs" else located(kind, True)


def said(found: agent_lookup.Found) -> str:
    return agent_lookup.sentence(found, install(found.program), OTHERWISE)


def program(kind: str) -> str | None:
    found = located(kind)
    return found.path if found.state == "runs" else None


def tab_folder(kind: str, tab: str) -> Path:
    return config.data_dir() / TAB_FOLDERS / kind / f"{os.getpid()}-{tab}"


def _mcp_file(folder: str | os.PathLike) -> Path:
    return Path(folder) / ".agents" / "mcp_config.json"


def _servers(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8") or "{}") if path.exists() else {}
    except ValueError:
        data = None
    if not isinstance(data, dict) or not isinstance(data.get("mcpServers", {}), dict):
        raise OSError(f"{path} is not an MCP servers file formencoder can read, so it was left alone")
    return data


def _replace(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(path.name + f".part-{os.getpid()}")
    with os.fdopen(os.open(part, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2) + "\n")
    os.replace(part, path)


def write_tab_entry(folder: str | os.PathLike, entry: dict, guide: str | os.PathLike | None = None) -> None:
    path = _mcp_file(folder)
    data = _servers(path)
    data.setdefault("mcpServers", {})[TAB_ENTRY] = entry
    _replace(path, data)
    if guide and Path(guide).is_file():
        (Path(folder) / TAB_GUIDE).write_text(Path(guide).read_text(encoding="utf-8"), encoding="utf-8")


def clear_tab_folder(folder: str | os.PathLike, guide: str | os.PathLike | None = None) -> None:
    base = Path(folder)
    if base.parent.parent.name != TAB_FOLDERS:
        return
    path = _mcp_file(base)
    try:
        if path.exists() and _servers(path) == {"mcpServers": {}}:
            path.unlink()
        if path.parent.is_dir():
            path.parent.rmdir()
        copy = base / TAB_GUIDE
        if copy.is_file() and guide and Path(guide).is_file() and copy.read_text(encoding="utf-8") == Path(guide).read_text(encoding="utf-8"):
            copy.unlink()
        base.rmdir()
    except (OSError, ValueError):
        return


def remove_tab_entry(folder: str | os.PathLike, token: str | None) -> None:
    if not token:
        return
    path = _mcp_file(folder)
    try:
        data = _servers(path)
        entry = data.get("mcpServers", {}).get(TAB_ENTRY)
        if not isinstance(entry, dict) or (entry.get("env") or {}).get(TOKEN_VAR) != token:
            return
        del data["mcpServers"][TAB_ENTRY]
        _replace(path, data)
    except (OSError, ValueError):
        return


def status(kind: str, fresh: bool = False) -> dict:
    found = located(kind, fresh)
    return agent_lookup.answer(found, install(kind), OTHERWISE) | {"signedIn": None, "install": install(kind), "title": PROGRAMS[kind]["title"], "program": PROGRAMS[kind]["bin"]}
