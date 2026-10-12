#!/usr/bin/env python3
"""./formencoder agents: Claude Code, Codex and Cursor driving formencoder.

  sync [--check]    regenerate the formencoder-harness skill's generated references from the engine (commands, MCP tools,
                    presets, formats and settings) and mirror .claude/skills/formencoder-harness to .agents/skills;
                    --check exits 1 when anything drifted
  install [--dry-run] [claude|codex|cursor ...]
                    set the clients up for this user account: the MCP server and the skill (all three by default)
  status            which clients are on this computer and whether the skill is in step
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
SKILL = ROOT / ".claude" / "skills" / "formencoder-harness"
MIRROR = ROOT / ".agents" / "skills" / "formencoder-harness"
ORDER = ["queue", "encode", "preset", "format", "watch", "ingest", "proxy", "analyze", "media", "captions", "lut", "family", "publish", "log", "prefs", "edit", "history", "ui", "app", "settings"]
HEAD = "Generated from the formencoder engine by `./formencoder agents sync`; do not edit by hand."


def venv_python() -> Path | None:
    for p in (BACKEND / "venv" / "bin" / "python", BACKEND / "venv" / "Scripts" / "python.exe"):
        if p.exists():
            return p
    return None


def ensure_core() -> None:
    try:
        import fe_core  # noqa: F401
    except ImportError:
        py = venv_python()
        if py and Path(sys.prefix).resolve() != (BACKEND / "venv").resolve() and not os.environ.get("FORMENCODER_AGENTS_REEXEC"):
            os.environ["FORMENCODER_AGENTS_REEXEC"] = "1"
            os.execv(str(py), [str(py), __file__, *sys.argv[1:]])
        sys.exit("agents: the encoding engine is not built; run ./formencoder install first")
    sys.path.insert(0, str(BACKEND))


class Engine:
    def __init__(self) -> None:
        os.environ["FORMENCODER_DATA_DIR"] = tempfile.mkdtemp(prefix="formencoder-agents-")
        import fe_core

        self.e = fe_core.Engine()

    def x(self, command: str, params: dict | None = None):
        return json.loads(self.e.execute(command, json.dumps(params or {}), "agents"))

    def commands(self) -> list:
        return json.loads(self.e.command_list(None, True))


def _schema_line(c: dict) -> str:
    props = (c.get("schema") or {}).get("properties") or {}
    required = set((c.get("schema") or {}).get("required") or [])
    parts = []
    for k, v in props.items():
        t = v.get("type")
        if "enum" in v:
            vals = v["enum"]
            kind = "|".join(map(str, vals[:12])) + ("|..." if len(vals) > 12 else "")
        elif isinstance(t, list):
            kind = "|".join(t)
        else:
            kind = t or "any"
        parts.append(f"{k}{'' if k in required else '?'}: {kind}")
    return "{" + ", ".join(parts) + "}"


def commands_md(eng: Engine) -> str:
    cmds = eng.commands()
    groups: dict[str, list] = {}
    for c in cmds:
        groups.setdefault(c["id"].split(".")[0], []).append(c)
    names = [n for n in ORDER if n in groups] + sorted(n for n in groups if n not in ORDER)
    out = ["# formencoder commands", "", HEAD, "",
           f"{len(cmds)} commands in {len(groups)} namespaces. Every menu item and button in formencoder is one of these. Run one over MCP "
           "with its own tool (the `MCP` name on each line, in the full profile) or `execute {command, params}` (every profile), several "
           "as one undo step with `batch`, or from a shell as `./formencoder ID --name value` (`--help` after the id lists the flags). "
           "`describe_command ID` returns the JSON Schema. In the summaries `?` marks an optional parameter and `a|b` lists the accepted "
           "values. `refs` takes output ids, item ids, `#n` (the nth queue item), `selected` or `all`. Unknown parameters are refused with "
           "the schema in the message.", "", "## Contents", "", " ".join(f"`{n}` ({len(groups[n])})" for n in names), ""]
    for n in names:
        out += [f"## {n}", ""]
        for c in groups[n]:
            flags = [x for x, on in (("undoable", c.get("undoable")), ("query", c.get("query")), ("destructive", (c.get("annotations") or {}).get("destructiveHint"))) if on]
            keys = f" · {c['shortcut']}" if c.get("shortcut") else ""
            menu = f" · {c['menu']}" if c.get("menu") else ""
            out.append(f"- `{c['id']}` {c['label'].rstrip('.')}{menu}{keys}{' · ' + ', '.join(flags) if flags else ''} · MCP `{c.get('mcpName', '')}`")
            line = _schema_line(c)
            if line != "{}":
                out.append(f"  `{line}`")
            if c.get("doc"):
                out.append(f"  {c['doc']}")
        out.append("")
    return "\n".join(out)


def tools_md() -> str:
    from app.agent.tools import GUIDES, TOOLS

    out = ["# formencoder MCP tools", "", HEAD, "",
           f"The `formencoder` MCP server has {len(TOOLS)} curated tools, listed here, plus one tool per engine command named from its id "
           "(`queue.addSource` is `queue_add_source`; commands.md gives every name). `./formencoder mcp` serves them over stdio (it starts "
           "the engine when it is not running); the engine also serves them over Streamable HTTP at `http://127.0.0.1:8270/mcp`. A profile "
           "chooses what a client lists: `--profile full` (curated plus every command tool; Claude Code and Codex), `--profile core` (the "
           "curated tools only; Cursor) or `--profile core,queue,preset` (curated plus those namespaces); over HTTP pass `?profile=`. Every "
           "tool can be called by name whatever the profile. Resources: `formencoder://status`, `queue`, `presets`, `formats`, `encoders`, "
           "`commands`, `log/encoding`, `log/error`, `guide/[topic]`, and the templates `output/[id]`, `preset/[id]`, `format/[id]`, "
           "`command/[id]`. Prompts: `workflow`, `youtube_version`, `broadcast_master`, `proxies`, `review_copy`. The shell equivalents "
           "are in the last section.", "", "## Contents", "", " ".join(f"`{t['name']}`" for t in TOOLS), ""]
    for t in TOOLS:
        a = t["annotations"]
        marks = [m for m, on in (("read-only", a["readOnlyHint"]), ("reaches other apps", a.get("openWorldHint"))) if on]
        out += [f"## {t['name']}", "", t["description"], ""]
        props, required = t["inputSchema"]["properties"], set(t["inputSchema"]["required"])
        for k, v in props.items():
            kind = v.get("type") or ("string or list" if "anyOf" in v else "any")
            if "enum" in v:
                kind += " (" + " | ".join(map(str, v["enum"])) + ")"
            extra = "; ".join(x for x in (("required" if k in required else ""), (f"default {json.dumps(v['default'])}" if "default" in v else ""), v.get("description", "")) if x)
            out.append(f"- `{k}`: {kind}" + (f"; {extra}" if extra else ""))
        if not props:
            out.append("- no parameters")
        if marks:
            out += ["", "Note: " + ", ".join(marks) + "."]
        out.append("")
    out += ["## Guide topics", "", "The `guide` tool returns these texts.", ""]
    for k, v in GUIDES.items():
        if k == "index":
            continue
        out += [f"### {k}", "", v.strip(), ""]
    out += ["## The same surface from a shell", "",
            "- `formencoder ID --name value ...` · any command with its parameters as flags (like its own MCP tool); `formencoder ID --help` lists them, `--json` prints one line",
            "- `formencoder encode FILE... --preset ID --folder DIR` · queue, encode, wait and print the results (like `encode`)",
            "- `formencoder queue` · the queue with every output's status (like `queue {action: list}`)",
            "- `formencoder commands FILTER` · list commands (like `list_commands`)",
            "- `formencoder describe ID` · one command with its schema (like `describe_command`)",
            "- `formencoder exec ID 'JSON'` · run one command (like `execute`)",
            "- `formencoder batch '[{\"command\": ID, \"params\": {}}]'` · several as one undo step (like `batch`)",
            "- `formencoder presets QUERY` · search presets (like `presets {action: list}`)",
            "- `formencoder probe FILE` · media information (like `probe`)",
            "- `formencoder frame OUT.png --output '#1' --time 2` or `--count 8` · a preview frame or contact sheet (like `preview_frame`, `contact_sheet`)",
            "- `formencoder wait` · wait for the queue (like `wait`)", ""]
    return "\n".join(out)


def presets_md(eng: Engine) -> str:
    rows = eng.x("preset.list")["presets"]
    cats: dict[str, list] = {}
    for p in rows:
        cats.setdefault(p["category"] or "Other", []).append(p)
    out = ["# formencoder presets", "", HEAD, "",
           f"{len(rows)} built-in presets. Use the id (`system/...`, `ingest/...`) with `encode {{preset}}`, `queue.addSource {{preset}}`, "
           "`queue.setPreset`, `queue.addOutput` or `watch.add`; `presets {action: get, preset}` shows the full settings. A settings patch "
           "on top of a preset keeps the rest of the preset.", "", "## Contents", "", " ".join(f"`{c}` ({len(ps)})" for c, ps in cats.items()), ""]
    for cat, ps in cats.items():
        out += [f"## {cat}", "", "| id | name | format | frame | rate | target |", "| --- | --- | --- | --- | --- | --- |"]
        for p in ps:
            out.append(f"| `{p['id']}` | {p['name']} | {p['formatLabel']} | {p['frameSize']} | {p['frameRate']} | {p['targetRate']} |")
        out.append("")
    return "\n".join(out)


def _field(f: dict) -> str:
    bits = [f"`{f['key']}` {f['label']} ({f['type']}"]
    if f.get("options"):
        opts = [str(o[0]) for o in f["options"]]
        bits.append(": " + "|".join(opts[:14]) + ("|..." if len(opts) > 14 else ""))
    if "min" in f or "max" in f:
        bits.append(f", {f.get('min', '')}..{f.get('max', '')}")
    if f.get("unit"):
        bits.append(f" {f['unit']}")
    if f.get("showIf"):
        bits.append(f", shown when {f['showIf']}")
    return "".join(bits) + ")"


def formats_md(eng: Engine) -> str:
    rows = eng.x("format.list")["formats"]
    out = ["# formencoder formats and settings", "", HEAD, "",
           f"{len(rows)} formats. Each output's settings object is `format` plus the fields below (dotted keys are the paths inside the "
           "settings object; patch them as nested objects or dotted keys). `formats {format}` returns this live, with the encoders found on "
           "the machine.", "", "## Contents", "", " ".join(f"`{r['id']}`" for r in rows), ""]
    first = None
    for r in rows:
        d = eng.x("format.describe", {"format": r["id"]})
        first = first or d
        out += [f"## {r['id']} · {r['label']}", "", f"Group {r['group']}, extension .{r['ext']}, video codecs {', '.join(r['video']) or 'none'}, audio codecs {', '.join(r['audio']) or 'none'}, containers {', '.join(r.get('containers') or []) or 'one'}.", ""]
        for part in ("video", "audio", "multiplexer"):
            fields = d.get(part) or []
            if fields:
                out.append(f"- {part}: " + "; ".join(_field(f) for f in fields))
        out.append("")
    if first:
        out += ["## Effects (defaults)", "", "```json", json.dumps(first["effects"], indent=1), "```", "",
                "## Loudness standards", "", "```json", json.dumps(first["loudnessStandards"], indent=1), "```", "",
                "## Scaling, time interpolation, caption formats", "",
                "- scaling: " + ", ".join(f"`{a}` {b}" for a, b in first["scaling"]),
                "- timeInterpolation: " + ", ".join(f"`{a}` {b}" for a, b in first["timeInterpolation"]),
                "- captions.format: " + ", ".join(f"`{a}` {b}" for a, b in first["captions"]), "",
                "## A complete default settings object (H.264)", "", "```json", json.dumps(first["defaults"], indent=1), "```", ""]
    return "\n".join(out)


def generate() -> dict[str, str]:
    eng = Engine()
    docs = {"commands.md": commands_md(eng), "tools.md": tools_md(), "presets.md": presets_md(eng), "formats.md": formats_md(eng)}
    return {k: v.replace(" — ", " · ").replace("—", "·") for k, v in docs.items()}


def _mcp_name(cid: str) -> str:
    return "".join("_" if ch == "." else ("_" + ch.lower() if ch.isupper() else ch) for ch in cid)


CLI_TYPES = {"string", "number", "integer", "boolean", "array", "object", "null"}
CLI_RESERVED = {"json", "help", "h"}


def surfaces() -> list[str]:
    from app.agent.cli import PATH_KEYS, _types
    from app.agent.tools import NAMES, _command_tool

    eng = Engine()
    rows = eng.commands()
    problems: list[str] = []
    seen: dict[str, str] = {}
    for r in rows:
        cid, name = r["id"], r.get("mcpName") or ""
        if name != _mcp_name(cid):
            problems.append(f"{cid}: MCP name {name!r}, expected {_mcp_name(cid)!r}")
        if name in seen:
            problems.append(f"{cid}: MCP name {name} also used by {seen[name]}")
        seen[name] = cid
        if name in NAMES:
            problems.append(f"{cid}: MCP name {name} collides with a curated tool, so it would never be served")
        tool = _command_tool(r)
        if tool["inputSchema"] != r.get("schema") or tool["name"] != name or tool["_meta"]["formencoder/command"] != cid:
            problems.append(f"{cid}: its MCP tool does not carry the registry's name, schema or id")
        ann = r.get("annotations") or {}
        if bool(ann.get("readOnlyHint")) != bool(r.get("query")):
            problems.append(f"{cid}: readOnlyHint does not follow query")
        if "." not in cid or any(ch in cid for ch in "/\\ ") or cid[0] in ".-~":
            problems.append(f"{cid}: the dispatchers would not route this id to the command line")
        for k, spec in ((r.get("schema") or {}).get("properties") or {}).items():
            kinds = {t for t in _types(spec) if t}
            if not kinds <= CLI_TYPES:
                problems.append(f"{cid}: --{k} has a type the command line cannot parse ({', '.join(sorted(kinds - CLI_TYPES))})")
            if k in CLI_RESERVED:
                problems.append(f"{cid}: parameter {k} collides with the command line's own --{k}")
            if k in PATH_KEYS and "string" not in kinds and "array" not in kinds:
                problems.append(f"{cid}: --{k} is resolved as a path but is not a string or list")
    return problems


def _files(folder: Path) -> dict:
    return {str(p.relative_to(folder)): p.read_bytes() for p in sorted(folder.rglob("*")) if p.is_file()}


def sync(check: bool) -> int:
    ensure_core()
    problems = surfaces()
    for p in problems:
        print(f"agents: surface: {p}")
    drift = ["the registry, the MCP tools and the command line disagree"] if problems else []
    for name, text in generate().items():
        ref = SKILL / "references" / name
        if not ref.exists() or ref.read_text(encoding="utf-8") != text:
            drift.append(str(ref.relative_to(ROOT)))
            if not check:
                ref.parent.mkdir(parents=True, exist_ok=True)
                ref.write_text(text, encoding="utf-8")
    if not MIRROR.exists() or _files(MIRROR) != _files(SKILL):
        drift.append(str(MIRROR.relative_to(ROOT)))
        if not check:
            shutil.rmtree(MIRROR, ignore_errors=True)
            shutil.copytree(SKILL, MIRROR)
    if check:
        print("agents: in step" if not drift else "agents: drifted: " + ", ".join(drift) + " (run ./formencoder agents sync)")
        return 1 if drift else 0
    print("agents: " + ("updated " + ", ".join(drift) if drift else "already in step"))
    return 0


def install(args: list[str]) -> int:
    ensure_core()
    from app.agent import connect

    dry = "--dry-run" in args
    which = [a for a in args if not a.startswith("--")] or None
    for line in connect.install(which, dry):
        print(line)
    return 0


def status() -> int:
    ensure_core()
    from app.agent import connect

    for name, on in connect.clients().items():
        print(f"{name}: {'found' if on else 'not found'}")
    return subprocess.call([sys.executable, __file__, "sync", "--check"])


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    if argv[0] == "sync":
        return sync("--check" in argv[1:])
    if argv[0] == "install":
        return install(argv[1:])
    if argv[0] == "status":
        return status()
    print(f"agents: unknown action {argv[0]}\n{__doc__}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
