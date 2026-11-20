from __future__ import annotations

import os

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


def status(kind: str, fresh: bool = False) -> dict:
    found = located(kind, fresh)
    return agent_lookup.answer(found, install(kind), OTHERWISE) | {"signedIn": None, "install": install(kind), "title": PROGRAMS[kind]["title"], "program": PROGRAMS[kind]["bin"]}
