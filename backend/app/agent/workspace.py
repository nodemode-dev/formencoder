from __future__ import annotations

import json
import os
import shutil
import stat
import sys
from pathlib import Path

from .. import __version__
from ..core import config

CLIENT_PROFILES = {"claude": "full", "codex": "full", "cursor": "core"}


def client_args(client: str) -> list[str]:
    return ["mcp", "--profile", CLIENT_PROFILES[client]]

TEMPLATES = Path(__file__).resolve().parent / "templates"
SKILLS = ("formencoder-harness",)
MANAGED = ("CLAUDE.md", "AGENTS.md", ".mcp.json", ".claude/settings.json", ".codex/config.toml", ".cursor/mcp.json")


def root() -> Path:
    return config.data_dir() / "agent-workspace"


def _templates_dir() -> Path:
    frozen = config.bundle_dir() / "agent_templates"
    return frozen if frozen.is_dir() else TEMPLATES


def launcher() -> tuple[list[str], str]:
    if config.FROZEN:
        return [sys.executable, "--cli"], "frozen"
    repo = config.repo_root()
    if repo:
        script = repo / ("formencoder.bat" if os.name == "nt" else "formencoder")
        return [str(script)], "repo"
    return [sys.executable, "-m", "app.agent.cli"], "module"


def mcp_command() -> tuple[str, list[str]]:
    shim = root() / "bin" / ("formencoder.cmd" if os.name == "nt" else "formencoder")
    return str(shim), ["mcp"]


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and path.read_text(encoding="utf-8", errors="replace") == text:
        return
    path.write_text(text, encoding="utf-8")


def _shim(base: Path) -> None:
    cmd, _ = launcher()
    bindir = base / "bin"
    bindir.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        line = " ".join(f'"{c}"' for c in cmd)
        backend = str(Path(__file__).resolve().parents[2])
        env = "" if config.FROZEN else f"set \"PYTHONPATH={backend};%PYTHONPATH%\"\r\n"
        _write(bindir / "formencoder.cmd", f"@echo off\r\n{env}{line} %*\r\n")
    else:
        quoted = " ".join("'" + c.replace("'", "'\\''") + "'" for c in cmd)
        backend = str(Path(__file__).resolve().parents[2]).replace("'", "'\\''")
        p = bindir / "formencoder"
        env = "" if config.FROZEN else f"PYTHONPATH='{backend}'${{PYTHONPATH:+:$PYTHONPATH}} "
        _write(p, f"#!/bin/sh\n{env}exec {quoted} \"$@\"\n")
        p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _render(name: str, values: dict) -> str:
    text = (_templates_dir() / name).read_text(encoding="utf-8")
    for k, v in values.items():
        text = text.replace("{{" + k + "}}", v)
    return text


def _copy_skills(base: Path) -> None:
    src = config.skills_source()
    if not src:
        return
    for name in SKILLS:
        s = src / name
        if not s.is_dir():
            continue
        for dest in (base / ".claude" / "skills" / name, base / ".agents" / "skills" / name):
            if dest.exists():
                shutil.rmtree(dest, ignore_errors=True)
            shutil.copytree(s, dest)


def ensure() -> Path:
    base = root()
    for sub in ("renders", "sources", "presets", "scripts"):
        (base / sub).mkdir(parents=True, exist_ok=True)
    stamp = base / ".formencoder-workspace"
    command, args = mcp_command()
    values = {"VERSION": __version__, "WORKSPACE": str(base), "MCP": " ".join([command, *args]), "DATA": str(config.data_dir())}
    _shim(base)
    _write(base / "CLAUDE.md", _render("CLAUDE.md", values))
    _write(base / "AGENTS.md", _render("AGENTS.md", values))
    _write(base / ".mcp.json", json.dumps({"mcpServers": {"formencoder": {"type": "stdio", "command": command, "args": client_args("claude")}}}, indent=2) + "\n")
    toml_cmd = command.replace("\\", "\\\\")
    _write(base / ".codex" / "config.toml", f'[mcp_servers.formencoder]\ncommand = "{toml_cmd}"\nargs = {json.dumps(client_args("codex"))}\nstartup_timeout_sec = 90\ntool_timeout_sec = 3600\n')
    _write(base / ".cursor" / "mcp.json", json.dumps({"mcpServers": {"formencoder": {"command": command, "args": client_args("cursor")}}}, indent=2) + "\n")
    claude_settings = {"enableAllProjectMcpServers": True, "enabledMcpjsonServers": ["formencoder"], "permissions": {"allow": ["mcp__formencoder", "Bash(formencoder:*)"]}}
    _write(base / ".claude" / "settings.json", json.dumps(claude_settings, indent=2) + "\n")
    if not stamp.is_file() or stamp.read_text(encoding="utf-8").strip() != __version__:
        _copy_skills(base)
        stamp.write_text(__version__, encoding="utf-8")
    return base


def describe() -> dict:
    base = root()
    command, args = mcp_command()
    return {"path": str(base), "mcp": {"command": command, "args": args}, "managed": list(MANAGED), "skills": list(SKILLS), "launcher": launcher()[1]}
