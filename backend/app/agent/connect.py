from __future__ import annotations

import json
import os
import re
import shutil
import time
from pathlib import Path

from ..core import config
from ..services import agent_lookup, agent_programs
from . import workspace

SKILL = "formencoder-harness"
NAME = "formencoder"


def _files(folder: Path) -> dict:
    return {str(p.relative_to(folder)): p.read_bytes() for p in sorted(folder.rglob("*")) if p.is_file()}


def _backup(path: Path, dry: bool) -> None:
    if path.exists() and not dry:
        shutil.copy2(path, path.with_name(path.name + f".bak-{time.strftime('%Y%m%d-%H%M%S')}"))


def launch() -> str:
    command, _ = workspace.mcp_command()
    return command


def _copy_skill(to: Path, dry: bool, said: list) -> None:
    src = config.skills_source()
    skill = src / SKILL if src else None
    if not skill or not skill.is_dir():
        said.append(f"  the {SKILL} skill was not found in this build")
        return
    if to.exists() and _files(to) == _files(skill):
        said.append(f"  skill already at {to}")
        return
    said.append(f"  skill -> {to}")
    if not dry:
        shutil.rmtree(to, ignore_errors=True)
        to.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(skill, to)


def install_claude(home: Path, dry: bool, said: list) -> None:
    said.append("Claude Code:")
    cmd = launch()
    args = workspace.client_args("claude")
    line = " ".join([cmd, *args])
    found = agent_programs.usable("claude")
    claude = found.path if found.state == "runs" else None
    if claude:
        env = agent_programs.child_env(claude, base=dict(os.environ))
        have = agent_lookup.run([claude, "mcp", "get", NAME], env, 60)
        if have.returncode == 0 and cmd in have.stdout and "--profile" in have.stdout:
            said.append(f"  MCP server {NAME} already set (user scope)")
        else:
            said.append(f"  claude mcp add --scope user {NAME} -- {line}")
            if not dry:
                if have.returncode == 0:
                    agent_lookup.run([claude, "mcp", "remove", NAME, "--scope", "user"], env, 60)
                agent_lookup.run([claude, "mcp", "add", "--scope", "user", NAME, "--", cmd, *args], env, 60).check_returncode()
    else:
        said.append(f"  {agent_programs.said(found)} Once it starts, run: claude mcp add --scope user {NAME} -- {line}")
    _copy_skill(home / ".claude" / "skills" / SKILL, dry, said)


def install_codex(home: Path, dry: bool, said: list) -> None:
    said.append("Codex:")
    cmd = launch().replace("\\", "\\\\")
    cfg = Path(os.environ.get("CODEX_HOME", home / ".codex")) / "config.toml"
    block = f'[mcp_servers.{NAME}]\ncommand = "{cmd}"\nargs = {json.dumps(workspace.client_args("codex"))}\nstartup_timeout_sec = 90\ntool_timeout_sec = 3600\n'
    text = cfg.read_text(encoding="utf-8") if cfg.exists() else ""
    found = re.search(rf"(?ms)^\[mcp_servers\.{NAME}\]\n.*?(?=^\[|\Z)", text)
    if found and found.group(0).strip() == block.strip():
        said.append(f"  MCP server {NAME} already in {cfg}")
    else:
        said.append(f"  MCP server {NAME} -> {cfg}")
        if not dry:
            _backup(cfg, dry)
            cfg.parent.mkdir(parents=True, exist_ok=True)
            new = text[: found.start()] + block + "\n" + text[found.end():] if found else (text.rstrip("\n") + "\n\n" if text.strip() else "") + block
            cfg.write_text(new, encoding="utf-8")
    _copy_skill(home / ".agents" / "skills" / SKILL, dry, said)


def install_cursor(home: Path, dry: bool, said: list) -> None:
    said.append("Cursor:")
    cfg = home / ".cursor" / "mcp.json"
    raw = cfg.read_text(encoding="utf-8") if cfg.exists() else ""
    data = json.loads(raw) if raw.strip() else {}
    entry = {"command": launch(), "args": workspace.client_args("cursor")}
    if data.get("mcpServers", {}).get(NAME) == entry:
        said.append(f"  MCP server {NAME} already in {cfg}")
    else:
        said.append(f"  MCP server {NAME} -> {cfg}")
        if not dry:
            _backup(cfg, dry)
            data.setdefault("mcpServers", {})[NAME] = entry
            cfg.parent.mkdir(parents=True, exist_ok=True)
            cfg.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    _copy_skill(home / ".agents" / "skills" / SKILL, dry, said)


def install_antigravity(home: Path, dry: bool, said: list) -> None:
    said.append("Antigravity:")
    cfg = home / ".gemini" / "config" / "mcp_config.json"
    older = home / ".gemini" / "antigravity-cli" / "mcp_config.json"
    if older.exists() and not cfg.exists():
        said.append(f"  an older file was seen at {older} and left alone; the documented file is {cfg}")
    try:
        data = json.loads(cfg.read_text(encoding="utf-8") or "{}") if cfg.exists() else {}
    except ValueError:
        data = None
    if not isinstance(data, dict) or not isinstance(data.get("mcpServers", {}), dict):
        said.append(f"  {cfg} is not an MCP servers file formencoder can read; left alone")
        return
    entry = {"command": launch(), "args": workspace.client_args("antigravity")}
    have = data.get("mcpServers", {}).get(NAME)
    ours = isinstance(have, dict) and have.get("args") == entry["args"] and Path(str(have.get("command", ""))).name == Path(entry["command"]).name
    if have == entry:
        said.append(f"  MCP server {NAME} already in {cfg}")
    elif have is not None and not ours:
        said.append(f"  {cfg} has a server named {NAME} that formencoder did not write; left alone")
    else:
        said.append(f"  MCP server {NAME} -> {cfg}")
        if not dry:
            _backup(cfg, dry)
            data.setdefault("mcpServers", {})[NAME] = entry
            cfg.parent.mkdir(parents=True, exist_ok=True)
            part = cfg.with_name(cfg.name + f".part-{os.getpid()}")
            part.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            os.replace(part, cfg)


CLIENTS = {"claude": install_claude, "codex": install_codex, "cursor": install_cursor, "antigravity": install_antigravity}


def install(which: list[str] | None = None, dry: bool = False) -> list[str]:
    workspace.ensure()
    home = Path(os.environ.get("HOME", str(Path.home())))
    said: list[str] = []
    for w in which or list(CLIENTS):
        if w in CLIENTS:
            CLIENTS[w](home, dry, said)
        else:
            said.append(f"unknown client {w} (claude, codex, cursor or antigravity)")
    return said


def clients() -> dict:
    return {name: agent_programs.program(name) is not None for name in agent_programs.PROGRAMS}
